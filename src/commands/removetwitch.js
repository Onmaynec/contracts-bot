import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getTwitchSettings, removeTwitchSettings } from '../services/twitchService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('removetwitch')
    .setDescription('Удалить настройки уведомлений о стримах Twitch')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guildId = interaction.guild.id;

    try {
      // Проверяем, есть ли настройки
      const settings = await getTwitchSettings(guildId);

      if (!settings) {
        return interaction.reply({
          content: '❌ Настройки Twitch не найдены для этого сервера.',
          ephemeral: true
        });
      }

      // Удаляем настройки
      await removeTwitchSettings(guildId);

      const embed = new EmbedBuilder()
        .setTitle('✅ Настройки Twitch удалены')
        .setDescription('Уведомления о стримах больше не будут отправляться.')
        .setColor(0x9146FF)
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });

    } catch (err) {
      console.error('❌ Ошибка в /removetwitch:', err);

      return interaction.reply({
        content: '❌ Произошла ошибка при удалении настроек.',
        ephemeral: true
      });
    }
  }
};
