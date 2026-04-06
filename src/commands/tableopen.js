import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import db from '../database/db.js';
import { buildTable, getTableRoles, hasResponsibleAccess } from '../services/tableService.js';
import { getMoscowDate } from '../utils/time.js';

const DEV_ID = '870408185620615212';

export default {
  data: new SlashCommandBuilder()
    .setName('tableopen')
    .setDescription('Создать новую таблицу контрактов')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Тип таблицы')
        .setRequired(true)
        .addChoices(
          { name: '🔹 Small (слабые)', value: 'small' },
          { name: '🔸 Medium (средние)', value: 'medium' },
          { name: '🔺 Large (сильные)', value: 'large' }
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const tableType = interaction.options.getString('type');

    // Проверяем права доступа (админ или роль ответственного)
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const tableRoles = await getTableRoles(guildId);
    const isResponsible = hasResponsibleAccess(interaction.member, tableRoles);
    const isDev = userId === DEV_ID;

    if (!isAdmin && !isResponsible && !isDev) {
      return interaction.reply({
        content: '❌ У вас нет прав для создания таблиц. Требуется роль ответственного или права администратора.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Проверяем настроены ли роли
    if (!tableRoles) {
      return interaction.reply({
        content: '❌ Сначала настройте роли для таблиц с помощью `/tablesettings`',
        flags: MessageFlags.Ephemeral
      });
    }

    const today = getMoscowDate();

    // 🔥 УДАЛЯЕМ ВСЕ записи за сегодня для этого типа таблицы
    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM users WHERE guild_id = ? AND date = ? AND table_type = ?',
        [guildId, today, tableType],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // 🆕 создаём пустую таблицу
    const table = await buildTable(guildId, tableType);

    await interaction.reply(table);
  }
};
