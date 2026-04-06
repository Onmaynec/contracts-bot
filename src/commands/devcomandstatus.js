import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const DEV_ID = '870408185620615212';

// Хранилище статистики команд
const commandStats = {
  usage: {},
  totalExecutions: 0,
  lastExecutions: [],
  errors: {}
};

// Функция для записи использования команды
export function recordCommandUsage(commandName, userId, guildId, success = true, error = null) {
  // Общая статистика
  if (!commandStats.usage[commandName]) {
    commandStats.usage[commandName] = {
      count: 0,
      successful: 0,
      failed: 0,
      lastUsed: null,
      users: new Set(),
      guilds: new Set()
    };
  }

  const stats = commandStats.usage[commandName];
  stats.count++;
  stats.lastUsed = Date.now();
  stats.users.add(userId);
  stats.guilds.add(guildId);

  if (success) {
    stats.successful++;
  } else {
    stats.failed++;
    if (error) {
      if (!commandStats.errors[commandName]) {
        commandStats.errors[commandName] = [];
      }
      commandStats.errors[commandName].push({
        error: error.message || error,
        time: Date.now(),
        userId,
        guildId
      });
      
      // Оставляем только последние 10 ошибок для каждой команды
      if (commandStats.errors[commandName].length > 10) {
        commandStats.errors[commandName].shift();
      }
    }
  }

  commandStats.totalExecutions++;

  // Последние выполнения
  commandStats.lastExecutions.push({
    command: commandName,
    userId,
    guildId,
    time: Date.now(),
    success
  });

  // Оставляем только последние 50 выполнений
  if (commandStats.lastExecutions.length > 50) {
    commandStats.lastExecutions.shift();
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('devcomandstatus')
    .setDescription('Показать статистику использования команд (только для разработчика)'),

  async execute(interaction) {
    // Проверка ID разработчика
    if (interaction.user.id !== DEV_ID) {
      return await interaction.reply({
        content: '❌ У вас нет доступа к этой команде.',
        ephemeral: true
      });
    }

    const commands = Object.entries(commandStats.usage);
    
    if (commands.length === 0) {
      return await interaction.reply({
        content: '📭 Статистика команд пуста. Команды еще не использовались.',
        ephemeral: true
      });
    }

    // Сортируем команды по количеству использований
    commands.sort((a, b) => b[1].count - a[1].count);

    const totalCommands = commands.length;
    const COMMANDS_PER_PAGE = 5;
    const totalPages = Math.ceil(totalCommands / COMMANDS_PER_PAGE);
    let currentPage = 0;

    const createEmbed = (page) => {
      const start = page * COMMANDS_PER_PAGE;
      const end = start + COMMANDS_PER_PAGE;
      const pageCommands = commands.slice(start, end);

      const embed = new EmbedBuilder()
        .setTitle('📊 Статистика использования команд')
        .setDescription(
          `**Общая статистика:**\n` +
          `📈 Всего выполнений: ${commandStats.totalExecutions}\n` +
          `📋 Уникальных команд: ${totalCommands}\n` +
          `❌ Всего ошибок: ${Object.values(commandStats.errors).flat().length}`
        )
        .setColor(0x9b59b6)
        .setTimestamp()
        .setFooter({ text: `Страница ${page + 1} из ${totalPages}` });

      pageCommands.forEach(([name, stats]) => {
        const lastUsed = stats.lastUsed 
          ? new Date(stats.lastUsed).toLocaleString('ru-RU') 
          : 'Никогда';
        
        const successRate = stats.count > 0 
          ? ((stats.successful / stats.count) * 100).toFixed(1) 
          : 0;

        embed.addFields({
          name: `/${name}`,
          value: 
            `📊 Использований: ${stats.count}\n` +
            `✅ Успешно: ${stats.successful} (${successRate}%)\n` +
            `❌ Ошибок: ${stats.failed}\n` +
            `👥 Уникальных пользователей: ${stats.users.size}\n` +
            `🏠 Серверов: ${stats.guilds.size}\n` +
            `🕐 Последнее использование: ${lastUsed}`,
          inline: false
        });
      });

      return embed;
    };

    const createButtons = (page) => {
      const row = new ActionRowBuilder();
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('cmdstatus_prev')
          .setLabel('◀️ Назад')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('cmdstatus_close')
          .setLabel('❌ Закрыть')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cmdstatus_next')
          .setLabel('Вперед ▶️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === totalPages - 1)
      );
      return row;
    };

    const message = await interaction.reply({
      embeds: [createEmbed(currentPage)],
      components: [createButtons(currentPage)],
      fetchReply: true
    });

    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 300000
    });

    collector.on('collect', async i => {
      if (i.customId === 'cmdstatus_prev') {
        currentPage = Math.max(0, currentPage - 1);
      } else if (i.customId === 'cmdstatus_next') {
        currentPage = Math.min(totalPages - 1, currentPage + 1);
      } else if (i.customId === 'cmdstatus_close') {
        await i.update({
          content: '❌ Статистика закрыта',
          embeds: [],
          components: []
        });
        collector.stop();
        return;
      }

      await i.update({
        embeds: [createEmbed(currentPage)],
        components: [createButtons(currentPage)]
      });
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch (err) {}
    });
  }
};

// Экспортируем статистику
export { commandStats };
