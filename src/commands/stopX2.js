import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import db from '../database/db.js';
import { getTableRoles, hasResponsibleAccess } from '../services/tableService.js';

const DEV_ID = '870408185620615212';

export default {
  data: new SlashCommandBuilder()
    .setName('stopx2')
    .setDescription('Принудительно отключить режим X2'),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // Проверяем права доступа (админ или роль ответственного)
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const tableRoles = await getTableRoles(guildId);
    const isResponsible = hasResponsibleAccess(interaction.member, tableRoles);
    const isDev = userId === DEV_ID;

    if (!isAdmin && !isResponsible && !isDev) {
      return interaction.reply({
        content: '❌ У вас нет прав. Требуется роль ответственного или права администратора.',
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      // Проверяем активен ли X2
      const x2Settings = await new Promise((resolve) => {
        db.get(
          'SELECT * FROM x2_settings WHERE guild_id = ?',
          [guildId],
          (_, row) => resolve(row)
        );
      });

      if (!x2Settings || !x2Settings.enabled) {
        return interaction.reply({
          content: '❌ Режим X2 не активен',
          flags: MessageFlags.Ephemeral
        });
      }

      // Отключаем X2
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE x2_settings SET enabled = 0 WHERE guild_id = ?',
          [guildId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle('⛔ Режим X2 отключен')
        .setColor(0x95a5a6) // Серый
        .setDescription('Режим двойного дохода принудительно остановлен.\nТаблицы вернулись к обычным настройкам.')
        .addFields(
          {
            name: '💸 Small',
            value: '30–70',
            inline: true
          },
          {
            name: '💰 Medium',
            value: '70–100',
            inline: true
          },
          {
            name: '💎 Large',
            value: '100–150',
            inline: true
          }
        )
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: false
      });

    } catch (err) {
      console.error(err);
      return interaction.reply({
        content: '❌ Ошибка при отключении режима X2',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
