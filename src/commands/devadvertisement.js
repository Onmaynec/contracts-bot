import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } from 'discord.js';

const DEV_ID = '870408185620615212';

export default {
  data: new SlashCommandBuilder()
    .setName('devadvertisement')
    .setDescription('Создать объявление от разработчика (только для разработчика)'),

  async execute(interaction, client) {
    // Проверка ID разработчика
    if (interaction.user.id !== DEV_ID) {
      return await interaction.reply({
        content: '❌ У вас нет доступа к этой команде.',
        ephemeral: true
      });
    }

    // Создаем модальное окно
    const modal = new ModalBuilder()
      .setCustomId('devadvertisement_modal')
      .setTitle('📢 Объявление от разработчика');

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
export async function handleDevAdvertisementModal(interaction, client) {
  const message = interaction.fields.getTextInputValue('message');
  const developer = interaction.user;

  // Создаем embed
  const embed = new EmbedBuilder()
    .setTitle('📢 Объявление от разработчика')
    .setDescription(message)
    .setColor(0xe74c3c) // Красный цвет
    .setTimestamp()
    .setFooter({ text: developer.username, iconURL: developer.displayAvatarURL() });

  let sentCount = 0;
  let errorCount = 0;

  // Отправляем на все серверы
  for (const guild of client.guilds.cache.values()) {
    try {
      // Получаем настройки сервера
      const { default: db } = await import('../database/db.js');
      const settings = await new Promise(resolve => {
        db.get(
          'SELECT system_channel_id FROM settings WHERE guild_id = ?',
          [guild.id],
          (err, row) => resolve(row)
        );
      });

      if (!settings?.system_channel_id) {
        errorCount++;
        continue;
      }

      const channel = guild.channels.cache.get(settings.system_channel_id);
      if (!channel) {
        errorCount++;
        continue;
      }

      await channel.send({ embeds: [embed] });
      sentCount++;
    } catch (err) {
      console.error(`❌ Ошибка отправки объявления на сервер ${guild.name}:`, err);
      errorCount++;
    }
  }

  await interaction.reply({
    content: `✅ Объявление отправлено!\n📤 Успешно: ${sentCount} серверов\n❌ Ошибок: ${errorCount} серверов`,
    ephemeral: true
  });
}
