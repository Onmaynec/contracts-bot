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

    db.run(
      `UPDATE guild_settings
       SET auto_time=?, auto_enabled=1
       WHERE guild_id=?`,
      [time, interaction.guild.id]
    );

    // ✅ ВАЖНО: используем editReply
    await interaction.editReply({
      content: `✅ Авто таблица включена на ${time}`
    });
  }
};