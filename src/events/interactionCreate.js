
import db from '../database/db.js';
import { buildTable } from '../services/tableService.js';
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} from 'discord.js';

export default {
  name: 'interactionCreate',
  once: false,

  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (command) {
          await command.execute(interaction);
        }
      }

      // =========================
      // 🔘 КНОПКИ
      // =========================
      if (interaction.isButton()) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        // =========================
        // 🟢 ОНЛАЙН → МОДАЛКА ВРЕМЕНИ
        // =========================
        if (interaction.customId === 'online') {
          const modal = new ModalBuilder()
            .setCustomId(`online_modal_${interaction.message.id}`)
            .setTitle('Укажи прайм-тайм');

          const input = new TextInputBuilder()
            .setCustomId('time_input')
            .setLabel('Например 12:00-22:00')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(input));

          return interaction.showModal(modal);
        }

        // =========================
        // 🟡 ФОРС → ПРИЧИНА
        // =========================
        if (interaction.customId === 'afk') {
          const modal = new ModalBuilder()
            .setCustomId(`afk_modal_${interaction.message.id}`)
            .setTitle('Форс-мажор');

          const input = new TextInputBuilder()
            .setCustomId('reason_input')
            .setLabel('Причина')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(input));

          return interaction.showModal(modal);
        }

        // =========================
        // 🔴 ОФФЛАЙН
        // =========================
        if (interaction.customId === 'offline') {
          const name = interaction.member.displayName;
          const today = new Date().toLocaleDateString('ru-RU');

          await new Promise((resolve, reject) => {
            db.run(
              `UPDATE users SET status=?, name=?, date=? WHERE user_id=? AND guild_id=?`,
              ['offline', name, today, interaction.user.id, interaction.guild.id],
              err => (err ? reject(err) : resolve())
            );
          });

          const table = await buildTable(guildId);
          return interaction.update(table);
        }

        // =========================
        // 🔵 ПРАЙМ-ТАЙМ (ручное изменение)
        // =========================
        if (interaction.customId === 'time') {
          const modal = new ModalBuilder()
            .setCustomId(`time_modal_${interaction.message.id}`)
            .setTitle('Изменить прайм-тайм');

          const input = new TextInputBuilder()
            .setCustomId('time_input')
            .setLabel('Новое время')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(input));

          return interaction.showModal(modal);
        }
      }

      // =========================
      // 📥 МОДАЛКИ
      // =========================
      if (interaction.isModalSubmit()) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const name = interaction.member.displayName;
        const today = new Date().toLocaleDateString('ru-RU');

        const run = (sql, params) =>
          new Promise((resolve, reject) =>
            db.run(sql, params, err => (err ? reject(err) : resolve()))
          );

        // =========================
        // 🟢 ОНЛАЙН (создаёт запись + время)
        // =========================
        if (interaction.customId.startsWith('online_modal_')) {
          const messageId = interaction.customId.split('_')[2];
          const time = interaction.fields.getTextInputValue('time_input');

          await run(
            `INSERT INTO users (user_id, guild_id, name, status, time, date)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, guild_id)
             DO UPDATE SET status=?, time=?, name=?, date=?, reason=NULL`,
            [
              userId,
              guildId,
              name,
              'online',
              time,
              today,
              'online',
              time,
              name,
              today
            ]
          );

          const table = await buildTable(guildId);
          const msg = await interaction.channel.messages.fetch(messageId);
          if (msg) await msg.edit(table);

          return interaction.reply({
            content: '✅ Ты в онлайне',
            ephemeral: true
          });
        }

        // =========================
        // 🟡 ФОРС (НЕ трогаем время)
        // =========================
        if (interaction.customId.startsWith('afk_modal_')) {
          const messageId = interaction.customId.split('_')[2];
          const reason = interaction.fields.getTextInputValue('reason_input');

          await run(
            `UPDATE users SET status=?, reason=? WHERE user_id=? AND guild_id=?`,
            ['afk', reason, userId, guildId]
          );

          const table = await buildTable(guildId);
          const msg = await interaction.channel.messages.fetch(messageId);
          if (msg) await msg.edit(table);

          return interaction.reply({
            content: '🟡 Форс поставлен',
            ephemeral: true
          });
        }

        // =========================
        // 🔵 ПРАЙМ-ТАЙМ (обновляет только время)
        // =========================
        if (interaction.customId.startsWith('time_modal_')) {
          const messageId = interaction.customId.split('_')[2];
          const time = interaction.fields.getTextInputValue('time_input');

          await run(
            `UPDATE users SET time=? WHERE user_id=? AND guild_id=?`,
            [time, userId, guildId]
          );

          const table = await buildTable(guildId);
          const msg = await interaction.channel.messages.fetch(messageId);
          if (msg) await msg.edit(table);

          return interaction.reply({
            content: '⏱ Прайм-тайм обновлён',
            ephemeral: true
          });
        }
      }

    } catch (err) {
      console.error(err);

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: '❌ Ошибка' });
      } else {
        await interaction.reply({
          content: '❌ Ошибка',
          ephemeral: true
        });
      }
    }
  }
};

