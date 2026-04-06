import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const DEV_ID = '870408185620615212';

// Описания всех команд
const allCommands = [
  {
    name: '/settings',
    description: 'Настройка бота (каналы, роли)',
    access: '👑 Администратор'
  },
  {
    name: '/settingsinfo',
    description: 'Показать текущие настройки сервера',
    access: '👥 Все'
  },
  {
    name: '/tablesettings',
    description: 'Настройка ролей для таблиц (слабый/средний/сильный)',
    access: '👑 Администратор'
  },
  {
    name: '/tableinfo',
    description: 'Показать информацию о ролях таблиц',
    access: '👥 Все'
  },
  {
    name: '/roletable',
    description: 'Показать список участников роли',
    access: '👥 Все'
  },
  {
    name: '/tableopen',
    description: 'Создать таблицу контрактов (small/medium/large)',
    access: '👑 Администратор / 👤 Роль ответственного'
  },
  {
    name: '/tablex2',
    description: 'Активировать режим X2 (двойной доход)',
    access: '👑 Администратор / 👤 Роль ответственного'
  },
  {
    name: '/stopx2',
    description: 'Принудительно отключить режим X2',
    access: '👑 Администратор / 👤 Роль ответственного'
  },
  {
    name: '/settwitch',
    description: 'Настроить уведомления о стримах Twitch',
    access: '👑 Администратор'
  },
  {
    name: '/removetwitch',
    description: 'Удалить настройки уведомлений Twitch',
    access: '👑 Администратор'
  },
  {
    name: '/autocontract',
    description: 'Установить свой статус контракта',
    access: '👥 Все'
  },
  {
    name: '/timelinetable',
    description: '【Устарело】Используйте /tableopen',
    access: '👥 Все'
  },
  {
    name: '/broadcast',
    description: 'Отправить сообщение от имени бота',
    access: '👑 Администратор'
  },
  {
    name: '/clean',
    description: 'Очистка сообщений в канале',
    access: '👑 Администратор'
  },
  {
    name: '/setwelcomename',
    description: 'Установить имя для приветствия',
    access: '👥 Все'
  },
  {
    name: '/advertisement',
    description: 'Создать объявление от администратора',
    access: '👑 Администратор'
  },
  {
    name: '/botinfo',
    description: 'Информация о боте',
    access: '👥 Все'
  },
  {
    name: '/help',
    description: 'Показать список команд',
    access: '👥 Все'
  },
  // Команды разработчика
  {
    name: '/devadvertisement',
    description: 'Объявление от разработчика на все серверы',
    access: '🔧 Разработчик'
  },
  {
    name: '/say',
    description: 'Сказать от лица бота',
    access: '🔧 Разработчик'
  },
  {
    name: '/devlogbot',
    description: 'Отправить логи консоли в чат',
    access: '🔧 Разработчик'
  },
  {
    name: '/devcomandstatus',
    description: 'Статистика использования команд',
    access: '🔧 Разработчик'
  }
];

const COMMANDS_PER_PAGE = 5;

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Показать список всех команд бота'),

  async execute(interaction) {
    const isDev = interaction.user.id === DEV_ID;
    
    // Фильтруем команды для обычных пользователей
    const availableCommands = isDev 
      ? allCommands 
      : allCommands.filter(cmd => !cmd.access.includes('Разработчик'));

    const totalPages = Math.ceil(availableCommands.length / COMMANDS_PER_PAGE);
    let currentPage = 0;

    // Функция создания embed для страницы
    const createEmbed = (page) => {
      const start = page * COMMANDS_PER_PAGE;
      const end = start + COMMANDS_PER_PAGE;
      const pageCommands = availableCommands.slice(start, end);

      const embed = new EmbedBuilder()
        .setTitle('📚 Список команд')
        .setDescription(`Страница ${page + 1} из ${totalPages}`)
        .setColor(0x3498db)
        .setTimestamp()
        .setFooter({ text: `Всего команд: ${availableCommands.length}` });

      pageCommands.forEach(cmd => {
        embed.addFields({
          name: `${cmd.name}`,
          value: `${cmd.description}\n🔑 Доступ: ${cmd.access}`,
          inline: false
        });
      });

      return embed;
    };

    // Функция создания кнопок
    const createButtons = (page) => {
      const row = new ActionRowBuilder();

      row.addComponents(
        new ButtonBuilder()
          .setCustomId('help_prev')
          .setLabel('◀️ Назад')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('help_close')
          .setLabel('❌ Закрыть')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('help_next')
          .setLabel('Вперед ▶️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === totalPages - 1)
      );

      return row;
    };

    // Отправляем первое сообщение
    const message = await interaction.reply({
      embeds: [createEmbed(currentPage)],
      components: [createButtons(currentPage)],
      ephemeral: true,
      fetchReply: true
    });

    // Создаем коллектор для кнопок
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 300000 // 5 минут
    });

    collector.on('collect', async i => {
      if (i.customId === 'help_prev') {
        currentPage = Math.max(0, currentPage - 1);
      } else if (i.customId === 'help_next') {
        currentPage = Math.min(totalPages - 1, currentPage + 1);
      } else if (i.customId === 'help_close') {
        await i.update({
          content: '❌ Справка закрыта',
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
        await interaction.editReply({
          components: []
        });
      } catch (err) {
        // Игнорируем ошибки при закрытии
      }
    });
  }
};
