import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import db from '../database/db.js';
import { getTableRoles, hasResponsibleAccess } from '../services/tableService.js';

const DEV_ID = '870408185620615212';

export default {
  data: new SlashCommandBuilder()
    .setName('tablex2')
    .setDescription('Активировать режим X2 (двойной доход)')
    .addStringOption(option =>
      option.setName('start_date')
        .setDescription('Дата начала (формат: YYYY-MM-DD)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('end_date')
        .setDescription('Дата окончания (формат: YYYY-MM-DD)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const startDate = interaction.options.getString('start_date');
    const endDate = interaction.options.getString('end_date');

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

    // Валидация дат
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return interaction.reply({
        content: '❌ Неверный формат даты. Используйте формат: YYYY-MM-DD (например: 2026-03-30)',
        flags: MessageFlags.Ephemeral
      });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return interaction.reply({
        content: '❌ Дата начала не может быть позже даты окончания',
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      // Сохраняем настройки X2
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO x2_settings (guild_id, enabled, start_date, end_date)
           VALUES (?, 1, ?, ?)
           ON CONFLICT(guild_id)
           DO UPDATE SET enabled=1, start_date=?, end_date=?`,
          [guildId, startDate, endDate, startDate, endDate],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle('⚡ Режим X2 активирован!')
        .setColor(0xffd700) // Золотой
        .setDescription('Все таблицы теперь имеют золотой цвет и увеличенный доход!')
        .addFields(
          {
            name: '📅 Период действия',
            value: `**${startDate}** — **${endDate}**`,
            inline: false
          },
          {
            name: '💸 Small',
            value: '50–90',
            inline: true
          },
          {
            name: '💰 Medium',
            value: '90–120',
            inline: true
          },
          {
            name: '💎 Large',
            value: '150–200+',
            inline: true
          }
        )
        .setFooter({ text: 'После окончания — автоматический возврат к обычным настройкам' })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: false
      });

    } catch (err) {
      console.error(err);
      return interaction.reply({
        content: '❌ Ошибка при активации режима X2',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
