import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import db from '../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Настройки бота')

    // 📊 Канал таблицы
    .addChannelOption(option =>
      option.setName('table_channel')
        .setDescription('Канал для таблицы')
        .setRequired(true)
    )

    // 📢 Системный канал (broadcast)
    .addChannelOption(option =>
      option.setName('system_channel')
        .setDescription('Канал для системных сообщений')
        .setRequired(false)
    )

    // 🧾 Логи
    .addChannelOption(option =>
      option.setName('log_channel')
        .setDescription('Канал для логов')
        .setRequired(false)
    )

    // 👥 Роли
    .addRoleOption(option =>
      option.setName('role1')
        .setDescription('Первая роль')
        .setRequired(false)
    )

    .addRoleOption(option =>
      option.setName('role2')
        .setDescription('Вторая роль (для логов)')
        .setRequired(false)
    )

    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guildId = interaction.guild.id;

    const tableChannel = interaction.options.getChannel('table_channel');
    const systemChannel = interaction.options.getChannel('system_channel');
    const logChannel = interaction.options.getChannel('log_channel');

    const role1 = interaction.options.getRole('role1');
    const role2 = interaction.options.getRole('role2');

    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO settings (
            guild_id,
            table_channel_id,
            system_channel_id,
            log_channel_id,
            role1_id,
            role2_id
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(guild_id)
          DO UPDATE SET
            table_channel_id=?,
            system_channel_id=?,
            log_channel_id=?,
            role1_id=?,
            role2_id=?`,
          [
            guildId,
            tableChannel.id,
            systemChannel?.id || null,
            logChannel?.id || null,
            role1?.id || null,
            role2?.id || null,

            tableChannel.id,
            systemChannel?.id || null,
            logChannel?.id || null,
            role1?.id || null,
            role2?.id || null
          ],
          err => (err ? reject(err) : resolve())
        );
      });

      return interaction.reply({
        content:
          `⚙️ Настройки сохранены:\n\n` +
          `📊 Таблица: ${tableChannel}\n` +
          `📢 Системный: ${systemChannel || '❌ не задан'}\n` +
          `🧾 Логи: ${logChannel || '❌ не задан'}\n` +
          `👤 Role1: ${role1 || '❌ не задана'}\n` +
          `👥 Role2: ${role2 || '❌ не задана'}`,
        ephemeral: true
      });

    } catch (err) {
      console.error(err);

      return interaction.reply({
        content: '❌ Ошибка при сохранении настроек',
        ephemeral: true
      });
    }
  }
};
