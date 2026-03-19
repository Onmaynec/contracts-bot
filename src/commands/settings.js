import {
  SlashCommandBuilder,
  ChannelType
} from 'discord.js';
import db from '../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Настройки бота')
    .addRoleOption(option =>
      option.setName('role1')
        .setDescription('Роль 1')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role2')
        .setDescription('Роль 2')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('table_channel')
        .setDescription('Канал таблицы')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('system_channel')
        .setDescription('Канал для системных сообщений (обновления)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)),

  async execute(interaction) {
    const role1 = interaction.options.getRole('role1');
    const role2 = interaction.options.getRole('role2');
    const tableChannel = interaction.options.getChannel('table_channel');
    const systemChannel = interaction.options.getChannel('system_channel');

    db.run(`
      INSERT INTO settings (guild_id, role1, role2, table_channel_id, system_channel_id)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
      role1=?,
      role2=?,
      table_channel_id=?,
      system_channel_id=?
    `,
    [
      interaction.guild.id,
      role1.id,
      role2.id,
      tableChannel.id,
      systemChannel?.id || null,

      role1.id,
      role2.id,
      tableChannel.id,
      systemChannel?.id || null
    ]);

    await interaction.reply({
      content: '✅ Настройки сохранены',
      ephemeral: true
    });
  }
};