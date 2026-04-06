import { SlashCommandBuilder } from 'discord.js';
import db from '../database/db.js';
import { buildTable } from '../services/tableService.js';
import { getMoscowDate } from '../utils/time.js';

export default {
  data: new SlashCommandBuilder()
    .setName('timelinetable')
    .setDescription('Создать новую таблицу контрактов'),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    
    // ✅ ИСПРАВЛЕНО: Используем московское время вместо локального
    const today = getMoscowDate();

    // 🔥 УДАЛЯЕМ ВСЕ записи за сегодня
    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM users WHERE guild_id = ? AND date = ?',
        [guildId, today],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // 🆕 создаём пустую таблицу
    const table = await buildTable(guildId);

    await interaction.reply(table);
  }
};
