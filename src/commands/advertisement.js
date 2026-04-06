import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('advertisement')
    .setDescription('Создать объявление от администратора')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Канал для отправки объявления')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');

    // Проверяем права бота в канале
    const botMember = interaction.guild.members.me;
    const botPermissions = channel.permissionsFor(botMember);
    
    if (!botPermissions.has('SendMessages') || !botPermissions.has('ViewChannel')) {
      return await interaction.reply({
        content: '❌ У бота нет прав на отправку сообщений в указанный канал.',
        ephemeral: true
      });
    }

    // Сохраняем ID канала для использования в модальном окне
    interaction.client.advertisementChannel = channel.id;

    // Создаем модальное окно
    const modal = new ModalBuilder()
      .setCustomId('advertisement_modal')
      .setTitle('📢 Объявление от администратора');

    const messageInput = new TextInputBuilder()
      .setCustomId('message')
      .setLabel('Текст объявления')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Введите текст объявления...')
      .setRequired(true)
      .setMaxLength(2000);

    const actionRow = new ActionRowBuilder().addComponents(messageInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

// Обработчик модального окна
export async function handleAdvertisementModal(interaction, client) {
  const message = interaction.fields.getTextInputValue('message');
  const admin = interaction.user;
  const channelId = client.advertisementChannel;

  if (!channelId) {
    return await interaction.reply({
      content: '❌ Ошибка: канал не найден. Попробуйте снова.',
      ephemeral: true
    });
  }

  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    return await interaction.reply({
      content: '❌ Ошибка: канал не найден.',
      ephemeral: true
    });
  }

  // Создаем embed
  const embed = new EmbedBuilder()
    .setTitle('📢 Объявление от администратора')
    .setDescription(message)
    .setColor(0x9b59b6) // Фиолетовый цвет
    .setTimestamp()
    .setFooter({ text: admin.username, iconURL: admin.displayAvatarURL() });

  try {
    await channel.send({ embeds: [embed] });
    await interaction.reply({
      content: `✅ Объявление успешно отправлено в канал ${channel}!`,
      ephemeral: true
    });
  } catch (err) {
    console.error('❌ Ошибка отправки объявления:', err);
    await interaction.reply({
      content: '❌ Произошла ошибка при отправке объявления.',
      ephemeral: true
    });
  }

  // Очищаем сохраненный канал
  delete client.advertisementChannel;
}
