import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export function timeModal() {
  const modal = new ModalBuilder()
    .setCustomId('timeModal')
    .setTitle('Введите время');

  const input = new TextInputBuilder()
    .setCustomId('time')
    .setLabel('Формат 12:00-20:00')
    .setStyle(TextInputStyle.Short);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

export function forceModal() {
  const modal = new ModalBuilder()
    .setCustomId('forceModal')
    .setTitle('Причина');

  const input = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Причина')
    .setStyle(TextInputStyle.Short);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}
