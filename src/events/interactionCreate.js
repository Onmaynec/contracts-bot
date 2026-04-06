import db from '../database/db.js';
import { buildTable, isTableClosed, getTableRoles, hasTableAccess } from '../services/tableService.js';
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags
} from 'discord.js';

import { getMoscowDate, getMoscowTimeString } from '../utils/time.js';
import { sendLog } from '../utils/logger.js';
import { broadcastCache } from '../utils/memoryCache.js';
import { recordCommandUsage } from '../commands/devcomandstatus.js';
import { handleDevAdvertisementModal } from '../commands/devadvertisement.js';
import { handleAdvertisementModal } from '../commands/advertisement.js';

const DEV_ID = '870408185620615212';

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
 * @param {string} tableType - Тип таблицы
 */
async function logStatusChange(interaction, old, newStatus, newTime = null, newReason = null, tableType = 'small') {
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
  
  const typeEmoji = { small: '🔹', medium: '🔸', large: '🔺' }[tableType] || '🔹';
  
  let changeText = `${typeEmoji} ${name} | ${displayTime} (${oldStatusText} → ${newStatusText})`;
  
  // Добавляем причину для форс-мажора
  if (newStatus === 'afk' && newReason) {
    changeText += `\n📋 Причина: \`${newReason}\``;
  }

  const logContent = `📋 Пользователь ${name} изменил статус в таблице ${tableType.toUpperCase()}:

${changeText}
[${getMoscowTimeString()} ${getMoscowDate()}]

${role2}`;

  await sendLog(guild, logContent);
}

/**
 * Парсит customId кнопки для получения статуса и типа таблицы
 * @param {string} customId - customId кнопки
 * @returns {Object} { status, tableType }
 */
function parseButtonId(customId) {
  const parts = customId.split('_');
  if (parts.length >= 2) {
    return {
      status: parts[0],
      tableType: parts[1]
    };
  }
  return { status: customId, tableType: 'small' };
}

/**
 * Логирует нажатие кнопки в консоль
 * @param {Object} interaction - Discord interaction
 * @param {string} tableType - Тип таблицы
 * @param {string} buttonLabel - Название кнопки
 */
function logButtonClick(interaction, tableType, buttonLabel) {
  const user = interaction.user;
  const now = new Date();
  const moscowTime = now.toLocaleString('ru-RU', { 
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const logMessage = `[КНОПКА] Пользователь: ${user.username}#${user.discriminator} (ID:${user.id}) | Таблица: ${tableType.charAt(0).toUpperCase() + tableType.slice(1)} | Кнопка: ${buttonLabel} | Время: ${moscowTime} MSK`;
  
  console.log(logMessage);
}

export default {
  name: 'interactionCreate',
  once: false,

  async execute(interaction, client) {
    try {

      // =========================
      // 💬 COMMANDS
      // =========================
      if (interaction.isChatInputCommand()) {
        const commandName = interaction.commandName;
        const userId = interaction.user.id;
        const guildId = interaction.guild?.id;

        console.log(`📥 Команда: /${commandName} | Пользователь: ${interaction.user.tag} | Сервер: ${interaction.guild?.name || 'DM'}`);

        // Логируем использование команды
        recordCommandUsage(commandName, userId, guildId, true);

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
            return interaction.reply({ content: '❌ Нет прав', flags: MessageFlags.Ephemeral });
          }

          const user = interaction.options.getUser('user');
          const amount = interaction.options.getInteger('amount');

          if (!amount || amount < 1 || amount > 100) {
            return interaction.reply({
              content: '❌ Укажи число от 1 до 100',
              flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
          });
        }

        const command = interaction.client.commands.get(interaction.commandName);
        if (command) {
          try {
            return await command.execute(interaction, client);
          } catch (err) {
            console.error(`❌ Ошибка выполнения команды /${commandName}:`, err);
            recordCommandUsage(commandName, userId, guildId, false, err);
            
            if (interaction.replied || interaction.deferred) {
              return interaction.editReply({ content: '❌ Произошла ошибка при выполнении команды' });
            } else {
              return interaction.reply({ content: '❌ Произошла ошибка при выполнении команды', flags: MessageFlags.Ephemeral });
            }
          }
        }
      }

      // =========================
      // 🔘 BUTTONS
      // =========================
      if (interaction.isButton()) {
        const customId = interaction.customId;

        // 🔒 ПРОВЕРКА: Кнопка закрытия разработчиком
        if (customId.startsWith('dev_close_')) {
          // Только разработчик может использовать эту кнопку
          if (interaction.user.id !== DEV_ID) {
            return interaction.reply({
              content: '❌ Эта кнопка доступна только разработчику',
              flags: MessageFlags.Ephemeral
            });
          }

          // Парсим тип таблицы
          const parts = customId.split('_');
          const tableType = parts[2] || 'small';
          const guildId = interaction.guild.id;

          try {
            // Строим закрытую таблицу с пометкой разработчика
            const closedTable = await buildTable(guildId, tableType, true, true);
            await interaction.update(closedTable);
            
            console.log(`🔒 Таблица ${tableType.toUpperCase()} закрыта разработчиком в ${interaction.guild.name}`);
            
            return;
          } catch (err) {
            console.error('❌ Ошибка при закрытии таблицы разработчиком:', err);
            return interaction.reply({
              content: '❌ Ошибка при закрытии таблицы',
              flags: MessageFlags.Ephemeral
            });
          }
        }

        // Проверяем является ли кнопка табличной (online/afk/offline с типом)
        const isTableButton = ['online_', 'afk_', 'offline_'].some(prefix => customId.startsWith(prefix));

        if (isTableButton || ['online', 'afk', 'offline'].includes(customId)) {
          // ✅ ПРОВЕРКА: Таблица закрыта? (23:59 - 06:00 МСК)
          if (isTableClosed()) {
            return interaction.reply({
              content: '🗃️ Таблица закрыта до 06:00 МСК',
              flags: MessageFlags.Ephemeral
            });
          }
          
          // ✅ Rate limiting
          if (!checkRateLimit(interaction.user.id)) {
            return interaction.reply({
              content: '⏳ Подождите немного перед следующим нажатием',
              flags: MessageFlags.Ephemeral
            });
          }
        }

        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const name = interaction.member.displayName;

        // Парсим тип таблицы из customId
        const { status, tableType } = parseButtonId(customId);

        // Проверяем доступ к таблице
        if (isTableButton || ['online', 'afk', 'offline'].includes(customId)) {
          const tableRoles = await getTableRoles(guildId);
          
          // DEV всегда имеет доступ
          if (userId !== DEV_ID) {
            if (!hasTableAccess(interaction.member, tableType, tableRoles)) {
              return interaction.reply({
                content: `❌ У вас нет доступа к таблице ${tableType.toUpperCase()}`,
                flags: MessageFlags.Ephemeral
              });
            }
          }
        }

        const old = await new Promise(res => {
          db.get(
            'SELECT * FROM users WHERE user_id=? AND guild_id=? AND table_type=?',
            [userId, guildId, tableType],
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
              flags: MessageFlags.Ephemeral
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
        if (status === 'online') {
          const modal = new ModalBuilder()
            .setCustomId(`online_modal_${interaction.message.id}_${tableType}`)
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
              flags: MessageFlags.Ephemeral
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
        if (status === 'afk') {
          const modal = new ModalBuilder()
            .setCustomId(`afk_modal_${interaction.message.id}_${tableType}`)
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
        if (status === 'offline') {
          const currentTime = getMoscowTimeString();

          await new Promise(res => {
            db.run(
              `INSERT INTO users (user_id, guild_id, name, status, time, date, table_type)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, guild_id, table_type)
               DO UPDATE SET status=?, time=?, name=?, date=?`,
              [userId, guildId, name, 'offline', currentTime, getMoscowDate(), tableType, 
               'offline', currentTime, name, getMoscowDate()],
              () => res()
            );
          });

          // ✅ Отправляем лог
          await logStatusChange(interaction, old, 'offline', currentTime, null, tableType);

          const table = await buildTable(guildId, tableType);
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

        const run = (sql, params) =>
          new Promise(res => db.run(sql, params, () => res()));

        // 👤 NICKNAME MODAL
        if (interaction.customId === 'nickname_modal') {
          const newName = interaction.fields.getTextInputValue('nickname_input');

          try {
            await interaction.member.setNickname(`${newName}`);

            return interaction.reply({
              content: '✅ Ник успешно изменён',
              flags: MessageFlags.Ephemeral
            });
          } catch {
            return interaction.reply({
              content: '❌ Не удалось изменить ник',
              flags: MessageFlags.Ephemeral
            });
          }
        }

        // 🟢 ONLINE MODAL
        if (interaction.customId.startsWith('online_modal_')) {
          const parts = interaction.customId.split('_');
          const messageId = parts[2];
          const tableType = parts[3] || 'small';
          const time = interaction.fields.getTextInputValue('time_input');

          const regex = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

          if (!regex.test(time)) {
            return interaction.reply({
              content: '❌ Формат: 10:00-22:00',
              flags: MessageFlags.Ephemeral
            });
          }

          const old = await new Promise(res => {
            db.get(
              'SELECT * FROM users WHERE user_id=? AND guild_id=? AND table_type=?',
              [userId, guildId, tableType],
              (_, row) => res(row)
            );
          });

          await run(
            `INSERT INTO users (user_id, guild_id, name, status, time, date, table_type)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, guild_id, table_type)
             DO UPDATE SET status=?, time=?, name=?, date=?, reason=NULL`,
            [userId, guildId, name, 'online', time, getMoscowDate(), tableType, 
             'online', time, name, getMoscowDate()]
          );

          // ✅ Отправляем лог
          await logStatusChange(interaction, old, 'online', time, null, tableType);

          const table = await buildTable(guildId, tableType);

          try {
            const msg = await interaction.channel.messages.fetch(messageId);
            if (msg) await msg.edit(table);
          } catch {}

          return interaction.reply({ content: '✅ Онлайн установлен', flags: MessageFlags.Ephemeral });
        }

        // 🟡 AFK MODAL
        if (interaction.customId.startsWith('afk_modal_')) {
          const parts = interaction.customId.split('_');
          const messageId = parts[2];
          const tableType = parts[3] || 'small';
          const reason = interaction.fields.getTextInputValue('reason_input');

          const old = await new Promise(res => {
            db.get(
              'SELECT * FROM users WHERE user_id=? AND guild_id=? AND table_type=?',
              [userId, guildId, tableType],
              (_, row) => res(row)
            );
          });

          await run(
            `INSERT INTO users (user_id, guild_id, name, status, time, date, table_type, reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, guild_id, table_type)
             DO UPDATE SET status=?, reason=?, name=?, date=?`,
            [userId, guildId, name, 'afk', getMoscowTimeString(), getMoscowDate(), tableType, reason,
             'afk', reason, name, getMoscowDate()]
          );

          // ✅ Отправляем лог
          await logStatusChange(interaction, old, 'afk', null, reason, tableType);

          const table = await buildTable(guildId, tableType);

          try {
            const msg = await interaction.channel.messages.fetch(messageId);
            if (msg) await msg.edit(table);
          } catch {}

          return interaction.reply({ content: '🟡 Форс установлен', flags: MessageFlags.Ephemeral });
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
            flags: MessageFlags.Ephemeral
          });
        }

        // 📢 DEV ADVERTISEMENT MODAL
        if (interaction.customId === 'devadvertisement_modal') {
          return await handleDevAdvertisementModal(interaction, client);
        }

        // 📢 ADVERTISEMENT MODAL
        if (interaction.customId === 'advertisement_modal') {
          return await handleAdvertisementModal(interaction, client);
        }
      }

    } catch (err) {
      console.error('❌ Ошибка в interactionCreate:', err);

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: '❌ Ошибка' });
      } else {
        await interaction.reply({ content: '❌ Ошибка', flags: MessageFlags.Ephemeral });
      }
    }
  }
};
