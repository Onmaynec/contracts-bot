import db from '../database/db.js';
import { buildTable } from '../services/tableService.js';
import { EmbedBuilder } from 'discord.js';
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
      // =========================
      // 💬 КОМАНДЫ
      // =========================
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

        // 🟢 ОНЛАЙН → МОДАЛКА
        if (interaction.customId === 'online') {
          const modal = new ModalBuilder()
            .setCustomId(`online_modal_${interaction.message.id}`)
            .setTitle('Укажи прайм-тайм');

          const input = new TextInputBuilder()
            .setCustomId('time_input')
            .setLabel('Формат: 10:00-22:00')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(input));

          return interaction.showModal(modal);
        }

        // 🟡 ФОРС → МОДАЛКА
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

        // 🔴 ОФФЛАЙН
        if (interaction.customId === 'offline') {
          const name = interaction.member.displayName;
          const today = new Date().toLocaleDateString('ru-RU');

          await new Promise((resolve, reject) => {
            db.run(
              `UPDATE users SET status=?, name=?, date=? WHERE user_id=? AND guild_id=?`,
              ['offline', name, today, userId, guildId],
              err => (err ? reject(err) : resolve())
            );
          });

          const table = await buildTable(guildId);
          return interaction.update(table);
        }

        // 📢 ПОДТВЕРЖДЕНИЕ
        if (interaction.customId === 'broadcast_confirm') {
          const embed = interaction.client.broadcastCache;

          for (const guild of interaction.client.guilds.cache.values()) {
            const row = await new Promise((resolve) => {
              db.get(
                'SELECT system_channel_id FROM settings WHERE guild_id=?',
                [guild.id],
                (err, row) => resolve(row)
              );
            });

            if (!row || !row.system_channel_id) continue;

            const channel = guild.channels.cache.get(row.system_channel_id);
            if (!channel) continue;

            try {
              await channel.send({ embeds: [embed] });
            } catch {}
          }

          return interaction.update({
            content: '✅ Отправлено во все сервера',
            embeds: [],
            components: []
          });
        }

// ❌ ОТМЕНА
if (interaction.customId === 'broadcast_cancel') {
  return interaction.update({
    content: '❌ Отменено',
    embeds: [],
    components: []
  });
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

        // 🟢 ОНЛАЙН
        if (interaction.customId.startsWith('online_modal_')) {
          const messageId = interaction.customId.split('_')[2];
          const time = interaction.fields.getTextInputValue('time_input');

          // 🔒 ВАЛИДАЦИЯ ВРЕМЕНИ
          const timeRegex = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

          if (!timeRegex.test(time)) {
            return interaction.reply({
              content: '❌ Неверный формат времени!\nПример: 10:00-22:00',
              ephemeral: true
            });
          }

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

        // 🟡 ФОРС
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

        // 📢 BROADCAST
        if (interaction.customId === 'broadcast_modal') {
          const title = interaction.fields.getTextInputValue('title');
          const description = interaction.fields.getTextInputValue('description');
          const changesRaw = interaction.fields.getTextInputValue('changes');

          const changes = changesRaw
            .split('\n')
            .map(line => `• ${line}`)
            .join('\n');

          const embed = new EmbedBuilder()
            .setTitle(`🚀 ${title}`)
            .setDescription(description)
            .addFields({
              name: '📌 Изменения',
              value: changes
            })
            .setColor(0x2ecc71);

          // 🔍 ПРЕДПРОСМОТР
          await interaction.reply({
            content: '👀 Предпросмотр. Отправить?',
            embeds: [embed],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId('broadcast_confirm')
                  .setLabel('Отправить')
                  .setStyle(3),
                new ButtonBuilder()
                  .setCustomId('broadcast_cancel')
                  .setLabel('Отмена')
                  .setStyle(4)
              )
            ],
            ephemeral: true
          });

          interaction.client.broadcastCache = embed;
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