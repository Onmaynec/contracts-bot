import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export function getButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('online')
      .setLabel('🟢 Онлайн')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('force')
      .setLabel('🟡 Форс-мажор')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('offline')
      .setLabel('🔴 Оффлайн')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('time')
      .setLabel('⏱ Изменить время')
      .setStyle(ButtonStyle.Primary),
  );
}
