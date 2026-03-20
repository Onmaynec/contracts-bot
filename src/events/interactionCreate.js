import db from '../database/db.js';
import { buildTable } from '../services/tableService.js';
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField
} from 'discord.js';

export default {
  name: 'interactionCreate',
  once: false,

  async execute(interaction) {
    try {

      // =========================
      // 💬 SLASH КОМАНДЫ
      // =========================
      if (interaction.isChatInputCommand()) {

        // 🚀 /broadcast → открываем модалку
        if (interaction.commandName === 'broadcast') {

          const modal = new ModalBuilder()
            .setCustomId('broadcast_modal')
            .setTitle('Создать рассылку');

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
            .setLabel('Изменения (каждая строка — пункт)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(title),
            new ActionRowBuilder().addComponents(description),
            new ActionRowBuilder().addComponents(changes)
          );

          return interaction.showModal(modal);
        }

        // 🧹 /clean
        if (interaction.commandName === 'clean') {

          if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.reply({ content: '❌ Нет прав', ephemeral: true });
          }

          const user = interaction.options.getUser('user');
          const amount = interaction.options.getInteger('amount');

          if (!amount || amount < 1 || amount > 100) {
            return interaction.reply({
              content: '❌ Укажи число от 1 до 100',
              ephemeral: true
            });
          }

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`clean_confirm_${user ? user.id : 'all'}_${amount}`)
              .setLabel('Подтвердить')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId('clean_cancel')
              .setLabel('Отмена')
              .setStyle(ButtonStyle.Secondary)
          );

          return interaction.reply({
            content: `⚠️ Удалить ${amount} сообщений${user ? ` пользователя ${user.tag}` : ''}?`,
            components: [row],
            ephemeral: true
          });
        }

        // остальные команды
        const command = interaction.client.commands.get(interaction.commandName);
        if (command) {
          return await command.execute(interaction);
        }
      }

      // =========================
      // 🔘 КНОПКИ
      // =========================
      if (interaction.isButton()) {

        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        // 🟢 ONLINE
        if (interaction.customId === 'online') {
          const modal = new ModalBuilder()
            .setCustomId(`online_modal_${interaction.message.id}`)
            .setTitle('Укажи время');

          const input = new TextInputBuilder()
            .setCustomId('time_input')
            .setLabel('Формат: 10:00-22:00')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return interaction.showModal(modal);
        }

        // 🟡 AFK
        if (interaction.customId === 'afk') {
          const modal = new ModalBuilder()
            .setCustomId(`afk_modal_${interaction.message.id}`)
            .setTitle('Причина');

          const input = new TextInputBuilder()
            .setCustomId('reason_input')
            .setLabel('Причина')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return interaction.showModal(modal);
        }

        // 🔴 OFFLINE
        if (interaction.customId === 'offline') {
          const name = interaction.member.displayName;
          const today = new Date().toLocaleDateString('ru-RU');

          await new Promise((res, rej) => {
            db.run(
              `UPDATE users SET status=?, name=?, date=? WHERE user_id=? AND guild_id=?`,
              ['offline', name, today, userId, guildId],
              err => err ? rej(err) : res()
            );
          });

          const table = await buildTable(guildId);
          return interaction.update(table);
        }

        // =========================
        // 📢 BROADCAST
        // =========================
        if (interaction.customId === 'broadcast_confirm') {

          const embed = interaction.client.broadcastCache?.[userId];
          if (!embed) return interaction.update({ content: '❌ Нет данных', components: [], embeds: [] });

          let success = 0;

          for (const guild of interaction.client.guilds.cache.values()) {
            const settings = await new Promise(res => {
              db.get('SELECT * FROM settings WHERE guild_id=?', [guild.id], (_, row) => res(row));
            });

            if (!settings?.system_channel_id) continue;

            const channel = guild.channels.cache.get(settings.system_channel_id);
            if (!channel) continue;

            try {
              await channel.send({ embeds: [embed] });
              success++;
            } catch {}
          }

          delete interaction.client.broadcastCache[userId];

          return interaction.update({
            content: `✅ Отправлено: ${success}`,
            embeds: [],
            components: []
          });
        }

        if (interaction.customId === 'broadcast_cancel') {
          return interaction.update({
            content: '❌ Отменено',
            embeds: [],
            components: []
          });
        }

        // =========================
        // 🧹 CLEAN
        // =========================
        if (interaction.customId.startsWith('clean_confirm')) {

          const [, , targetId, amountStr] = interaction.customId.split('_');
          const amount = parseInt(amountStr);

          const messages = await interaction.channel.messages.fetch({ limit: 100 });

          let filtered = messages;

          if (targetId !== 'all') {
            filtered = messages.filter(m => m.author.id === targetId);
          }

          const toDelete = Array.from(filtered.values()).slice(0, amount);

          await interaction.channel.bulkDelete(toDelete, true);

          return interaction.update({
            content: `✅ Удалено ${toDelete.length} сообщений`,
            components: []
          });
        }

        if (interaction.customId === 'clean_cancel') {
          return interaction.update({
            content: '❌ Отменено',
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
          new Promise((res, rej) => db.run(sql, params, err => err ? rej(err) : res()));

        // 🟢 ONLINE
        if (interaction.customId.startsWith('online_modal_')) {

          const messageId = interaction.customId.split('_')[2];
          const time = interaction.fields.getTextInputValue('time_input');

          const regex = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

          if (!regex.test(time)) {
            return interaction.reply({
              content: '❌ Формат: 10:00-22:00',
              ephemeral: true
            });
          }

          await run(
            `INSERT INTO users (user_id, guild_id, name, status, time, date)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, guild_id)
             DO UPDATE SET status=?, time=?, name=?, date=?, reason=NULL`,
            [userId, guildId, name, 'online', time, today, 'online', time, name, today]
          );

          const table = await buildTable(guildId);

          try {
            const msg = await interaction.channel.messages.fetch(messageId);
            if (msg) await msg.edit(table);
          } catch {}

          return interaction.reply({ content: '✅ Онлайн установлен', ephemeral: true });
        }

        // 🟡 AFK
        if (interaction.customId.startsWith('afk_modal_')) {

          const messageId = interaction.customId.split('_')[2];
          const reason = interaction.fields.getTextInputValue('reason_input');

          await run(
            `UPDATE users SET status=?, reason=? WHERE user_id=? AND guild_id=?`,
            ['afk', reason, userId, guildId]
          );

          const table = await buildTable(guildId);

          try {
            const msg = await interaction.channel.messages.fetch(messageId);
            if (msg) await msg.edit(table);
          } catch {}

          return interaction.reply({ content: '🟡 Форс установлен', ephemeral: true });
        }

        // 📢 BROADCAST
        if (interaction.customId === 'broadcast_modal') {

          const title = interaction.fields.getTextInputValue('title');
          const description = interaction.fields.getTextInputValue('description');
          const changesRaw = interaction.fields.getTextInputValue('changes');

          const changes = changesRaw.split('\n').map(x => `• ${x}`).join('\n');

          const embed = new EmbedBuilder()
            .setTitle(`🚀 ${title}`)
            .setDescription(description)
            .addFields({ name: '📌 Изменения', value: changes })
            .setColor(0x2ecc71);

          if (!interaction.client.broadcastCache) {
            interaction.client.broadcastCache = {};
          }

          interaction.client.broadcastCache[userId] = embed;

          return interaction.reply({
            content: '👀 Предпросмотр',
            embeds: [embed],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId('broadcast_confirm')
                  .setLabel('Отправить')
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId('broadcast_cancel')
                  .setLabel('Отмена')
                  .setStyle(ButtonStyle.Danger)
              )
            ],
            ephemeral: true
          });
        }
      }

    } catch (err) {
      console.error(err);

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: '❌ Ошибка' });
      } else {
        await interaction.reply({ content: '❌ Ошибка', ephemeral: true });
      }
    }
  }
};