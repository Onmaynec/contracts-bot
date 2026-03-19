import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder
} from 'discord.js';
import db from '../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Рассылка обновления'),

  async execute(interaction) {
    // 🔒 только ты
    if (interaction.user.id !== '870408185620615212') {
      return interaction.reply({
        content: '❌ Нет доступа',
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('broadcast_modal')
      .setTitle('Создать обновление');

    const title = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('Заголовок')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const description = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Описание')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const changes = new TextInputBuilder()
      .setCustomId('changes')
      .setLabel('Список изменений (каждое с новой строки)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(title),
      new ActionRowBuilder().addComponents(description),
      new ActionRowBuilder().addComponents(changes)
    );

    await interaction.showModal(modal);
  }
};