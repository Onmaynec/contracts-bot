import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import db from '../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clean')
    .setDescription('Удалить сообщения')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Пользователь')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option.setName('count')
        .setDescription('Количество сообщений')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addBooleanOption(option =>
      option.setName('bot_only')
        .setDescription('Удалять только сообщения бота')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const count = interaction.options.getInteger('count');
    const botOnly = interaction.options.getBoolean('bot_only');

    // 🔒 ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: '❌ У тебя нет прав на использование этой команды',
        ephemeral: true
      });
    }

    // 🔘 КНОПКИ ПОДТВЕРЖДЕНИЯ
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`clean_confirm_${interaction.id}`)
        .setLabel('Подтвердить')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(`clean_cancel_${interaction.id}`)
        .setLabel('Отмена')
        .setStyle(ButtonStyle.Secondary)
    );

    // 💬 ТЕКСТ ПОДТВЕРЖДЕНИЯ
    let confirmText = `⚠️ Удалить ${count} сообщений`;
    if (user) confirmText += ` пользователя ${user}`;
    if (botOnly) confirmText += ` (только бот)`;
    confirmText += `?`;

    return interaction.reply({
      content: confirmText,
      components: [row],
      ephemeral: true
    });
  }
};