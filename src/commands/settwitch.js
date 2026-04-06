import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { saveTwitchSettings, getTwitchSettings, removeTwitchSettings, extractChannelName, getChannelInfo } from '../services/twitchService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('settwitch')
    .setDescription('Настройка уведомлений о стримах Twitch')

    // 🔗 Ссылка на канал Twitch
    .addStringOption(option =>
      option.setName('channel_url')
        .setDescription('Ссылка на канал Twitch (например: https://twitch.tv/channelname)')
        .setRequired(true)
    )

    // 📢 Канал для объявлений
    .addChannelOption(option =>
      option.setName('announcement_channel')
        .setDescription('Канал для отправки уведомлений о стримах')
        .setRequired(true)
    )

    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const twitchUrl = interaction.options.getString('channel_url');
    const announcementChannel = interaction.options.getChannel('announcement_channel');

    try {
      // Проверяем корректность URL Twitch
      const channelName = extractChannelName(twitchUrl);
      if (!channelName) {
        return interaction.reply({
          content: '❌ Некорректная ссылка на канал Twitch. Используйте формат: https://twitch.tv/channelname',
          ephemeral: true
        });
      }

      // Проверяем, существует ли канал Twitch
      const channelInfo = await getChannelInfo(channelName);
      if (!channelInfo) {
        return interaction.reply({
          content: `❌ Канал Twitch "${channelName}" не найден. Проверьте правильность ссылки.`,
          ephemeral: true
        });
      }

      // Проверяем, что выбран текстовый канал
      if (!announcementChannel.isTextBased()) {
        return interaction.reply({
          content: '❌ Выбранный канал должен быть текстовым.',
          ephemeral: true
        });
      }

      // Сохраняем настройки
      await saveTwitchSettings(guildId, twitchUrl, announcementChannel.id);

      // Создаем Embed с подтверждением
      const embed = new EmbedBuilder()
        .setTitle('✅ Настройки Twitch сохранены')
        .setDescription(
          `Теперь бот будет автоматически отправлять уведомления о начале и завершении стримов.`
        )
        .setColor(0x9146FF)
        .addFields(
          { name: '🎥 Канал Twitch', value: `[${channelInfo.displayName}](${twitchUrl})`, inline: true },
          { name: '📢 Канал для уведомлений', value: `<#${announcementChannel.id}>`, inline: true }
        )
        .setThumbnail(channelInfo.profileImage)
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });

    } catch (err) {
      console.error('❌ Ошибка в /settwitch:', err);

      return interaction.reply({
        content: '❌ Произошла ошибка при сохранении настроек. Проверьте, что TWITCH_CLIENT_ID и TWITCH_CLIENT_SECRET настроены в .env файле.',
        ephemeral: true
      });
    }
  }
};
