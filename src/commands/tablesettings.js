import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import db from '../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('tablesettings')
    .setDescription('Настройка ролей для таблиц контрактов')

    // 👤 Роль слабого (small)
    .addRoleOption(option =>
      option.setName('weak_role')
        .setDescription('Роль для слабых контрактов (small)')
        .setRequired(true)
    )

    // 👥 Роль среднего (medium)
    .addRoleOption(option =>
      option.setName('medium_role')
        .setDescription('Роль для средних контрактов (medium)')
        .setRequired(true)
    )

    // 💪 Роль сильного (large)
    .addRoleOption(option =>
      option.setName('strong_role')
        .setDescription('Роль для сильных контрактов (large)')
        .setRequired(true)
    )

    // 🎯 Роль ответственного (role2 из settings)
    .addRoleOption(option =>
      option.setName('responsible_role')
        .setDescription('Роль ответственного (для управления таблицами)')
        .setRequired(true)
    )

    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guildId = interaction.guild.id;

    const weakRole = interaction.options.getRole('weak_role');
    const mediumRole = interaction.options.getRole('medium_role');
    const strongRole = interaction.options.getRole('strong_role');
    const responsibleRole = interaction.options.getRole('responsible_role');

    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO table_roles (
            guild_id,
            weak_role_id,
            medium_role_id,
            strong_role_id,
            responsible_role_id
          )
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(guild_id)
          DO UPDATE SET
            weak_role_id=?,
            medium_role_id=?,
            strong_role_id=?,
            responsible_role_id=?`,
          [
            guildId,
            weakRole.id,
            mediumRole.id,
            strongRole.id,
            responsibleRole.id,

            weakRole.id,
            mediumRole.id,
            strongRole.id,
            responsibleRole.id
          ],
          err => (err ? reject(err) : resolve())
        );
      });

      return interaction.reply({
        content:
          `⚙️ **Настройки ролей для таблиц сохранены:**\n\n` +
          `🔹 **Слабый** (small): ${weakRole}\n` +
          `🔸 **Средний** (medium): ${mediumRole}\n` +
          `🔺 **Сильный** (large): ${strongRole}\n` +
          `👑 **Ответственный**: ${responsibleRole}`,
        flags: MessageFlags.Ephemeral
      });

    } catch (err) {
      console.error(err);

      return interaction.reply({
        content: '❌ Ошибка при сохранении настроек ролей',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
