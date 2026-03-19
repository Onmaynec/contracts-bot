import { SlashCommandBuilder } from 'discord.js';
import db from '../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Настройка бота')
    .addChannelOption(o =>
      o.setName('channel')
        .setDescription('Канал для таблиц')
        .setRequired(true)
    )
    .addRoleOption(o =>
      o.setName('contractor')
        .setDescription('Роль исполнителя')
        .setRequired(true)
    )
    .addRoleOption(o =>
      o.setName('manager')
        .setDescription('Роль менеджера')
        .setRequired(true)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const contractor = interaction.options.getRole('contractor');
    const manager = interaction.options.getRole('manager');

    // ✅ Сначала отвечаем (или defer)
    await interaction.reply({
      content: 'Сохраняю настройки...',
      ephemeral: true
    });

    // сохраняем в БД
    db.run(`
      INSERT OR REPLACE INTO settings (guild_id, channel_id, contractor_role_id, manager_role_id)
      VALUES (?, ?, ?, ?)
    `, [interaction.guild.id, channel.id, contractor.id, manager.id]);

    // ✅ теперь можно редактировать
    await interaction.editReply('✅ Настройки сохранены');
  }
};