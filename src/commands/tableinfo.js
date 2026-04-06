import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import db from '../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('tableinfo')
    .setDescription('Показать информацию о ролях таблиц'),

  async execute(interaction) {
    const guildId = interaction.guild.id;

    try {
      const tableRoles = await new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM table_roles WHERE guild_id = ?',
          [guildId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!tableRoles) {
        return interaction.reply({
          content: '❌ Настройки ролей не найдены. Используйте `/tablesettings` для настройки.',
          flags: MessageFlags.Ephemeral
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Информация о ролях таблиц')
        .setColor(0xFFFF00) // Жёлтый цвет
        .addFields(
          {
            name: '👑 Роль ответственного',
            value: tableRoles.responsible_role_id ? `<@&${tableRoles.responsible_role_id}>` : '❌ Не задана',
            inline: false
          },
          {
            name: '🔹 Роль слабого (small)',
            value: tableRoles.weak_role_id ? `<@&${tableRoles.weak_role_id}>` : '❌ Не задана',
            inline: true
          },
          {
            name: '🔸 Роль среднего (medium)',
            value: tableRoles.medium_role_id ? `<@&${tableRoles.medium_role_id}>` : '❌ Не задана',
            inline: true
          },
          {
            name: '🔺 Роль сильного (large)',
            value: tableRoles.strong_role_id ? `<@&${tableRoles.strong_role_id}>` : '❌ Не задана',
            inline: true
          }
        )
        .setTimestamp()
        .setFooter({ text: 'Используйте /tablesettings для изменения' });

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });

    } catch (err) {
      console.error(err);
      return interaction.reply({
        content: '❌ Ошибка при получении информации о ролях',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
