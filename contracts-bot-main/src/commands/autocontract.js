import { SlashCommandBuilder } from 'discord.js';
import db from '../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('autocontract')
    .setDescription('Авто таблица')
    .addStringOption(o =>
      o.setName('time')
        .setDescription('Время HH:MM')
        .setRequired(true)
    ),

  async execute(interaction) {
    const time = interaction.options.getString('time');

    // ✅ Валидация формата времени
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(time)) {
      return interaction.reply({
        content: '❌ Неверный формат времени. Используйте HH:MM (например: 09:00)',
        ephemeral: true
      });
    }

    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO settings (guild_id, auto_time, auto_enabled)
           VALUES (?, ?, 1)
           ON CONFLICT(guild_id)
           DO UPDATE SET auto_time=?, auto_enabled=1`,
          [interaction.guild.id, time, time],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // ✅ ИСПРАВЛЕНО: используем reply вместо editReply
      await interaction.reply({
        content: `✅ Авто таблица включена на ${time} (по московскому времени)`
      });

    } catch (err) {
      console.error('Ошибка при настройке авто таблицы:', err);
      await interaction.reply({
        content: '❌ Ошибка при сохранении настроек',
        ephemeral: true
      });
    }
  }
};
