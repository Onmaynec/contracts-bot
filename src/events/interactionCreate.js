import db from '../database/db.js';
import { buildTable } from '../services/tableService.js';
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
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
            .setTitle('Причина форса');

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

        // =========================
        // 📢 ПОДТВЕРЖДЕНИЕ BROADCAST
        // =========================
        if (interaction.customId === 'broadcast_confirm') {
          const embed = interaction.client.broadcastCache?.[interaction.user.id];

          if (!embed) {
            return interaction.reply({
              content: '❌ Кэш не найден',
              ephemeral: true
            });
          }

          let success = 0;
          let fail = 0;

          for (const guild of interaction.client.guilds.cache.values()) {
            const row = await new Promise(resolve => {
              db.get(
                'SELECT system_channel_id FROM settings WHERE guild_id=?',
                [guild.id],
                (err, row) => resolve(row)
              );
            });

            if (!row?.system_channel_id) continue;

            const channel = guild.channels.cache.get(row.system_channel_id);
            if (!channel) continue;

            try {
              await channel.send({ embeds: [embed] });
              success++;
            } catch {
              fail++;
            }
          }

          return interaction.update({
            content: `✅ Готово\nУспешно: ${success}\nОшибки: ${fail}`,
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
        // 🧹 CLEAN ПОДТВЕРЖДЕНИЕ
        // =========================
        if (interaction.customId.startsWith('clean_confirm_')) {
          const originalInteraction = interaction;

          const user = originalInteraction.message.interaction?.options.getUser('user');
          const count = originalInteraction.message.interaction?.options.getInteger('count');
          const botOnly = originalInteraction.message.interaction?.options.getBoolean('bot_only');

          const channel = interaction.channel;

          await interaction.update({ content: '⏳ Удаление...', components: [] });

          try {
            const messages = await channel.messages.fetch({ limit: 100 });

            let filtered = messages;

            if (user) {
              filtered = filtered.filter(msg => msg.author.id === user.id);
            }

            if (botOnly) {
              filtered = filtered.filter(msg => msg.author.bot);
            }

            const toDelete = filtered.first(count);

            const now = Date.now();
            const validMessages = toDelete.filter(
              msg => now - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000
            );

            await channel.bulkDelete(validMessages, true);

            // 📊 СТАТИСТИКА
            const resultText = `✅ Успешно удалено ${validMessages.length} сообщений`;

            // 🧠 ЛОГ В SYSTEM CHANNEL
            const settings = await new Promise(resolve => {
              db.get(
                'SELECT system_channel_id FROM settings WHERE guild_id=?',
                [interaction.guild.id],
                (err, row) => resolve(row)
              );
            });

            if (settings?.system_channel_id) {
              const logChannel = interaction.guild.channels.cache.get(settings.system_channel_id);

              if (logChannel) {
                logChannel.send({
                  content:
                    `🧹 Очистка сообщений\n` +
                    `Модератор: ${interaction.user}\n` +
                    `Канал: ${channel}\n` +
                    `Удалено: ${validMessages.length}`
                });
              }
            }

            return interaction.followUp({
              content: resultText,
              ephemeral: true
            });

          } catch (err) {
            console.error(err);
            return interaction.followUp({
              content: '❌ Ошибка при удалении',
              ephemeral: true
            });
          }
        }

        // ❌ ОТМЕНА
        if (interaction.customId.startsWith('clean_cancel_')) {
          return interaction.update({
            content: '❌ Удаление отменено',
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

        // 🟢 ONLINE
        if (interaction.customId.startsWith('online_modal_')) {
          const messageId = interaction.customId.split('_')[2];
          const time = interaction.fields.getTextInputValue('time_input');

          const regex = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

          if (!regex.test(time)) {
            return interaction.reply({
              content: '❌ Неверный формат! Пример: 10:00-22:00',
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

          try {
            const msg = await interaction.channel.messages.fetch(messageId);
            if (msg) await msg.edit(table);
          } catch {}

          return interaction.reply({
            content: '✅ Ты в онлайне',
            ephemeral: true
          });
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

          if (!interaction.client.broadcastCache) {
            interaction.client.broadcastCache = {};
          }

          interaction.client.broadcastCache[interaction.user.id] = embed;

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
        await interaction.reply({
          content: '❌ Ошибка',
          ephemeral: true
        });
      }
    }
  }
};