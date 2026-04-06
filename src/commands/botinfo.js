import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import os from 'os';

const DEV_ID = '870408185620615212';

// Хранилище для статистики
const botStats = {
  startTime: Date.now(),
  sessionStart: Date.now(),
  commandUsage: {},
  errors: [],
  lastDeployCommands: []
};

// Функция для форматирования времени работы
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}д ${hours % 24}ч ${minutes % 60}м`;
  if (hours > 0) return `${hours}ч ${minutes % 60}м ${seconds % 60}с`;
  if (minutes > 0) return `${minutes}м ${seconds % 60}с`;
  return `${seconds}с`;
}

// Функция для получения статуса бота
function getBotStatus(client) {
  const status = client.user.presence?.status || 'online';
  const statusMap = {
    online: '🟢 Онлайн',
    idle: '🟡 Ожидание',
    dnd: '🔴 Не беспокоить',
    offline: '⚫ Оффлайн'
  };
  return statusMap[status] || '⚪ Неизвестно';
}

// Функция для получения использования памяти
function getMemoryUsage() {
  const used = process.memoryUsage();
  return {
    rss: (used.rss / 1024 / 1024).toFixed(2),
    heapTotal: (used.heapTotal / 1024 / 1024).toFixed(2),
    heapUsed: (used.heapUsed / 1024 / 1024).toFixed(2)
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Показать информацию о боте'),

  async execute(interaction, client) {
    const isDev = interaction.user.id === DEV_ID;
    const guild = interaction.guild;
    
    // Собираем информацию о сервере
    const memberCount = guild.memberCount;
    const botCount = guild.members.cache.filter(m => m.user.bot).size;
    const roleCount = guild.roles.cache.size;
    
    // Информация о боте
    const memory = getMemoryUsage();
    const ping = client.ws.ping;
    const uptime = formatUptime(Date.now() - botStats.startTime);
    const sessionUptime = formatUptime(Date.now() - botStats.sessionStart);
    
    // Время работы сервера (приблизительно)
    const serverUptime = formatUptime(interaction.guild.joinedTimestamp 
      ? Date.now() - interaction.guild.joinedTimestamp 
      : 0);

    // Базовые поля для всех пользователей
    const basicFields = [
      { name: '🤖 Имя бота', value: client.user.username, inline: true },
      { name: '🏷️ Имя на сервере', value: guild.members.me.nickname || client.user.username, inline: true },
      { name: '📊 Статус', value: getBotStatus(client), inline: true },
      { name: '📡 Пинг', value: `${ping}мс`, inline: true },
      { name: '⏰ Время работы бота', value: uptime, inline: true },
      { name: '💾 Память (RSS)', value: `${memory.rss} МБ`, inline: true },
      { name: '👥 Участников', value: `${memberCount}`, inline: true },
      { name: '🤖 Ботов', value: `${botCount}`, inline: true },
      { name: '🎭 Ролей', value: `${roleCount}`, inline: true }
    ];

    // Поля только для разработчика
    const devFields = isDev ? [
      { name: '🔧 Сессия бота', value: sessionUptime, inline: true },
      { name: '🖥️ Время на сервере', value: serverUptime, inline: true },
      { name: '💻 Heap Used', value: `${memory.heapUsed} МБ`, inline: true },
      { name: '💻 Heap Total', value: `${memory.heapTotal} МБ`, inline: true },
      { name: '❌ Ошибок в консоли', value: `${botStats.errors.length}`, inline: true },
      { name: '📅 Дата запуска', value: new Date(botStats.startTime).toLocaleString('ru-RU'), inline: true }
    ] : [];

    // Поля с последними deploy-командами (только для разработчика)
    const deployFields = (isDev && botStats.lastDeployCommands.length > 0) ? [
      { 
        name: '🚀 Последние deploy-команды', 
        value: botStats.lastDeployCommands.slice(-3).map((cmd, i) => 
          `${i + 1}. ${cmd.command} - ${new Date(cmd.time).toLocaleTimeString('ru-RU')}`
        ).join('\n'), 
        inline: false 
      }
    ] : [];

    const allFields = [...basicFields, ...devFields, ...deployFields];

    // Разбиваем на страницы если много информации
    const FIELDS_PER_PAGE = 9;
    const totalPages = Math.ceil(allFields.length / FIELDS_PER_PAGE);
    
    if (totalPages <= 1) {
      // Одна страница - просто отправляем
      const embed = new EmbedBuilder()
        .setTitle('🤖 Информация о боте')
        .setColor(0x3498db)
        .setThumbnail(client.user.displayAvatarURL())
        .addFields(allFields)
        .setTimestamp()
        .setFooter({ text: `ID: ${client.user.id}` });

      await interaction.reply({ embeds: [embed] });
    } else {
      // Несколько страниц - добавляем пагинацию
      let currentPage = 0;

      const createEmbed = (page) => {
        const start = page * FIELDS_PER_PAGE;
        const end = start + FIELDS_PER_PAGE;
        const pageFields = allFields.slice(start, end);

        return new EmbedBuilder()
          .setTitle('🤖 Информация о боте')
          .setColor(0x3498db)
          .setThumbnail(client.user.displayAvatarURL())
          .setDescription(`Страница ${page + 1} из ${totalPages}`)
          .addFields(pageFields)
          .setTimestamp()
          .setFooter({ text: `ID: ${client.user.id}` });
      };

      const createButtons = (page) => {
        const row = new ActionRowBuilder();
        row.addComponents(
          new ButtonBuilder()
            .setCustomId('botinfo_prev')
            .setLabel('◀️ Назад')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId('botinfo_close')
            .setLabel('❌ Закрыть')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('botinfo_next')
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
        if (i.customId === 'botinfo_prev') {
          currentPage = Math.max(0, currentPage - 1);
        } else if (i.customId === 'botinfo_next') {
          currentPage = Math.min(totalPages - 1, currentPage + 1);
        } else if (i.customId === 'botinfo_close') {
          await i.update({
            content: '❌ Информация закрыта',
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
  }
};

// Экспортируем статистику для использования в других модулях
export { botStats };

// Функция для логирования использования команд
export function logCommandUsage(commandName) {
  if (!botStats.commandUsage[commandName]) {
    botStats.commandUsage[commandName] = 0;
  }
  botStats.commandUsage[commandName]++;
}

// Функция для логирования ошибок
export function logError(error) {
  botStats.errors.push({
    error: error.message || error,
    time: Date.now(),
    stack: error.stack
  });
  
  // Оставляем только последние 100 ошибок
  if (botStats.errors.length > 100) {
    botStats.errors.shift();
  }
}

// Функция для логирования deploy-команд
export function logDeployCommand(command) {
  botStats.lastDeployCommands.push({
    command,
    time: Date.now()
  });
  
  // Оставляем только последние 10 команд
  if (botStats.lastDeployCommands.length > 10) {
    botStats.lastDeployCommands.shift();
  }
}
