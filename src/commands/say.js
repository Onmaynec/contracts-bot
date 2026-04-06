import { SlashCommandBuilder } from 'discord.js';

const DEV_ID = '870408185620615212';

export default {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Сказать от лица бота (только для разработчика)')
    .addStringOption(option =>
      option
        .setName('content')
        .setDescription('Текст сообщения')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Канал для отправки (по умолчанию текущий)')
        .setRequired(false)
    ),

  async execute(interaction) {
    // Проверка ID разработчика
    if (interaction.user.id !== DEV_ID) {
      return await interaction.reply({
        content: '❌ У вас нет доступа к этой команде.',
        ephemeral: true
      });
    }

    const content = interaction.options.getString('content');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    try {
      // Проверяем права бота в канале
      const botMember = interaction.guild.members.me;
      const botPermissions = targetChannel.permissionsFor(botMember);
      
      if (!botPermissions.has('SendMessages') || !botPermissions.has('ViewChannel')) {
        return await interaction.reply({
          content: '❌ У бота нет прав на отправку сообщений в указанный канал.',
          ephemeral: true
        });
      }

      await targetChannel.send(content);
      
      await interaction.reply({
        content: `✅ Сообщение отправлено в ${targetChannel}!`,
        ephemeral: true
      });
    } catch (err) {
      console.error('❌ Ошибка в /say:', err);
      await interaction.reply({
        content: '❌ Произошла ошибка при отправке сообщения.',
        ephemeral: true
      });
    }
  }
};
