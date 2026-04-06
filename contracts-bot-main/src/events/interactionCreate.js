import db from '../database/db.js';
import { buildTable, isTableClosed } from '../services/tableService.js';
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

import { getMoscowDate, getMoscowTimeString } from '../utils/time.js';
import { sendLog } from '../utils/logger.js';
import { broadcastCache } from '../utils/memoryCache.js';

function formatStatus(status) {
  if (status === 'online') return '🟢 Online';
  if (status === 'afk') return '🟡 Fors';
  if (status === 'offline') return '🔴 Offline';
  return '⚪ Unknown';
}

// ✅ Хранилище для rate limiting (ограничение частоты нажатий)
const rateLimitMap = new Map();
const RATE_LIMIT_MS = 2000; // 2 секунды между нажатиями

/**
 * Проверяет rate limit для пользователя
 * @param {string} userId - ID пользователя
 * @returns {boolean} true если пользователь может нажать кнопку
 */
function checkRateLimit(userId) {
  const now = Date.now();
  const lastClick = rateLimitMap.get(userId);
  
  if (lastClick && (now - lastClick) < RATE_LIMIT_MS) {
    return false;
  }
  
  rateLimitMap.set(userId, now);
  return true;
}

/**
 * Очищает старые записи rate limit (предотвращает утечку памяти)
 * Удаляет записи старше 5 минут
 */
function cleanupRateLimit() {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 минут
  let cleaned = 0;
  
  for (const [userId, timestamp] of rateLimitMap.entries()) {
    if ((now - timestamp) > maxAge) {
      rateLimitMap.delete(userId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 RateLimit: очищено ${cleaned} устаревших записей`);
  }
}

// Запускаем очистку каждые 5 минут
setInterval(cleanupRateLimit, 5 * 60 * 1000);

/**
 * Отправляет лог об изменении статуса
 * @param {Object} interaction - Discord interaction
 * @param {Object} old - Старые данные пользователя
 * @param {string} newStatus - Новый статус
 * @param {string} newTime - Новое время (опционально)
 * @param {string} newReason - Новая причина (опционально)
 */
async function logStatusChange(interaction, old, newStatus, newTime = null, newReason = null) {
  const name = interaction.member.displayName;
  const guild = interaction.guild;
  
  const settings = await new Promise(res => {
    db.get(
      'SELECT role2_id FROM settings WHERE guild_id=?',
      [guild.id],
      (_, row) => res(row)
    );
  });

  const role2 = settings?.role2_id ? `<@&${settings.role2_id}>` : '';
  
  const oldStatusText = formatStatus(old?.status);
  const newStatusText = formatStatus(newStatus);
  const oldTime = old?.time || '-';
  const displayTime = newTime || oldTime;
  
  let changeText = `${name} | ${displayTime} (${oldStatusText} → ${newStatusText})`;
  
  // Добавляем причину для форс-мажора
  if (newStatus === 'afk' && newReason) {
    changeText += `\n📋 Причина: \`${newReason}\``;
  }

  const logContent = `📋 Пользователь ${name} изменил статус:

${changeText}
[${getMoscowTimeString()} ${getMoscowDate()}]

${role2}`;

  await sendLog(guild, logContent);
}

export default {
  name: 'interactionCreate',
  once: false,

  async execute(interaction) {
    try {

      // =========================
      // 💬 COMMANDS
      // =========================
      if (interaction.isChatInputCommand()) {

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
            .setLabel('Изменения (каждая строка)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(title),
            new ActionRowBuilder().addComponents(description),
            new ActionRowBuilder().addComponents(changes)
          );

          return interaction.showModal(modal);
        }

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
            content: `⚠️ Удалить ${amount} сообщений?`,
            components: [row],
            ephemeral: true
          });
        }

        const command = interaction.client.commands.get(interaction.commandName);
        if (command) return await command.execute(interaction);
      }

      // =========================
      // 🔘 BUTTONS
      // =========================
      if (interaction.isButton()) {

        // ✅ ПРОВЕРКА: Таблица закрыта? (23:59 МСК)
        if (['online', 'afk', 'offline'].includes(interaction.customId)) {
          if (isTableClosed()) {
            return interaction.reply({
              content: '⏰ Таблица закрыта до 00:00 по московскому времени',
              ephemeral: true
            });
          }
          
          // ✅ Rate limiting
          if (!checkRateLimit(interaction.user.id)) {
            return interaction.reply({
              content: '⏳ Подождите немного перед следующим нажатием',
              ephemeral: true
            });
          }
        }

        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const name = interaction.member.displayName;

        const old = await new Promise(res => {
          db.get(
            'SELECT * FROM users WHERE user_id=? AND guild_id=?',
            [userId, guildId],
            (_, row) => res(row)
          );
        });

        const settings = await new Promise(res => {
          db.get(
            'SELECT role2_id FROM settings WHERE guild_id=?',
            [guildId],
            (_, row) => res(row)
          );
        });

        const role2 = settings?.role2_id ? `<@&${settings.role2_id}>` : '';

        // 👤 КНОПКА СМЕНЫ НИКА
        if (interaction.customId.startsWith('set_nickname_')) {
          const targetId = interaction.customId.split('_')[2];

          if (interaction.user.id !== targetId) {
            return interaction.reply({
              content: '❌ Это не твоя кнопка',
              ephemeral: true
            });
          }

          const modal = new ModalBuilder()
            .setCustomId('nickname_modal')
            .setTitle('Изменение ника');

          const input = new TextInputBuilder()
            .setCustomId('nickname_input')
            .setLabel('Введите имя')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(input)
          );

          return interaction.showModal(modal);
        }

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

        // 📢 BROADCAST CONFIRM
        if (interaction.customId === 'broadcast_confirm') {
          const embed = broadcastCache.get(interaction.user.id);

          if (!embed) {
            return interaction.reply({
              content: '❌ Кэш не найден или истек срок хранения (3 дня)',
              ephemeral: true
            });
          }

          await interaction.deferUpdate();

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

          // ✅ Очищаем кэш после отправки
          broadcastCache.delete(interaction.user.id);

          return interaction.editReply({
            content: `✅ Отправлено\nУспешно: ${success}\nОшибки: ${fail}`,
            embeds: [],
            components: []
          });
        }

        if (interaction.customId === 'broadcast_cancel') {
          // ✅ Очищаем кэш при отмене
          broadcastCache.delete(interaction.user.id);
          
          return interaction.update({
            content: '❌ Отменено',
            embeds: [],
            components: []
          });
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

          await new Promise(res => {
            db.run(
              `UPDATE users SET status=?, date=? WHERE user_id=? AND guild_id=?`,
              ['offline', getMoscowDate(), userId, guildId],
              () => res()
            );
          });

          // ✅ Отправляем лог
          await logStatusChange(interaction, old, 'offline');

          const table = await buildTable(guildId);
          return interaction.update(table);
        }

        // CLEAN
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
      // 📥 MODALS
      // =========================
      if (interaction.isModalSubmit()) {

        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const name = interaction.member.displayName;

        const old = await new Promise(res => {
          db.get(
            'SELECT * FROM users WHERE user_id=? AND guild_id=?',
            [userId, guildId],
            (_, row) => res(row)
          );
        });

        const settings = await new Promise(res => {
          db.get(
            'SELECT role2_id FROM settings WHERE guild_id=?',
            [guildId],
            (_, row) => res(row)
          );
        });

        const role2 = settings?.role2_id ? `<@&${settings.role2_id}>` : '';

        const run = (sql, params) =>
          new Promise(res => db.run(sql, params, () => res()));

        // 👤 NICKNAME MODAL
        if (interaction.customId === 'nickname_modal') {
          const newName = interaction.fields.getTextInputValue('nickname_input');

          try {
            await interaction.member.setNickname(`${newName}`);

            return interaction.reply({
              content: '✅ Ник успешно изменён',
              ephemeral: true
            });
          } catch {
            return interaction.reply({
              content: '❌ Не удалось изменить ник',
              ephemeral: true
            });
          }
        }

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
            [userId, guildId, name, 'online', time, getMoscowDate(), 'online', time, name, getMoscowDate()]
          );

          // ✅ Отправляем лог
          await logStatusChange(interaction, old, 'online', time);

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

          // ✅ Отправляем лог
          await logStatusChange(interaction, old, 'afk', null, reason);

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

          // ✅ Используем новый кеш с TTL 3 дня
          broadcastCache.set(userId, embed);

          return interaction.reply({
            content: '👀 Предпросмотр (будет доступен 3 дня)',
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
