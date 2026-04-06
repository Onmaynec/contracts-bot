import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../database/db.js';

export default {
  name: 'guildMemberAdd',

  async execute(member) {
    try {
      const guildId = member.guild.id;

      const row = await new Promise(res => {
        db.get(
          `SELECT welcome_channel_id FROM settings WHERE guild_id = ?`,
          [guildId],
          (err, row) => res(row)
        );
      });

      if (!row?.welcome_channel_id) return;

      const channel = member.guild.channels.cache.get(row.welcome_channel_id);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('👋 Добро пожаловать!')
        .setDescription(
          `Здравствуйте, ${member}!\n\n` +
          `Пожалуйста, измените свой ник по форме:\n` +
          `**Ник | Имя**\n\n` +
          `Нажмите кнопку ниже 👇`
        );

      const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`set_nickname_${member.id}`) // 👈 ВАЖНО
          .setLabel('Изменить ник')
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({
        embeds: [embed],
        components: [rowButtons],
      });

    } catch (e) {
      console.error('Ошибка guildMemberAdd:', e);
    }
  }
};
