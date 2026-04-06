import db from '../database/db.js';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { getMoscowDate, getMoscowTime } from '../utils/time.js';

/**
 * Проверяет, закрыта ли таблица (23:59 - 00:00 по Москве)
 * @returns {boolean} true если таблица закрыта
 */
export function isTableClosed() {
  const moscowTime = getMoscowTime();
  const hours = moscowTime.getHours();
  const minutes = moscowTime.getMinutes();
  
  // Таблица закрыта с 23:59 до 00:00
  return (hours === 23 && minutes === 59);
}

/**
 * Строит таблицу контрактов
 * @param {string} guildId - ID сервера
 * @param {boolean} closed - Принудительно закрыть таблицу
 * @returns {Object} Объект с embed и components
 */
export async function buildTable(guildId, closed = false) {
  const today = getMoscowDate();
  const isClosed = closed || isTableClosed();

  const rows = await new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM users WHERE guild_id=? AND date=?',
      [guildId, today],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });

  const online = [];
  const afk = [];
  const offline = [];

  for (const user of rows) {
    // 🟢 Онлайн
    if (user.status === 'online') {
      online.push(`**${user.name} | ${user.time}**`);
    }

    // 🟡 Форс
    if (user.status === 'afk') {
      const reason = user.reason ? ` | \`${user.reason}\`` : '';
      afk.push(`${user.name} | ${user.time}${reason}`);
    }

    // 🔴 Оффлайн
    if (user.status === 'offline') {
      offline.push(`*${user.name} | ${user.time}*`);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`📋 Онлайн контрактов на ${today}`)
    .setColor(isClosed ? 0x95a5a6 : 0x2ecc71) // Серый если закрыто, зелёный если открыто
    .addFields(
      {
        name: '🟢 Онлайн',
        value: online.length ? online.join('\n') : '-'
      },
      {
        name: '🟡 Форс-мажор',
        value: afk.length ? afk.join('\n') : '-'
      },
      {
        name: '🔴 Оффлайн',
        value: offline.length ? offline.join('\n') : '-'
      }
    );

  // Добавляем предупреждение если таблица закрыта
  if (isClosed) {
    embed.setFooter({ 
      text: '⏰ Таблица закрыта до 00:00 по московскому времени' 
    });
  }

  // ✅ Кнопки (отключены если таблица закрыта)
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('online')
      .setLabel('Онлайн')
      .setStyle(ButtonStyle.Success)
      .setDisabled(isClosed),

    new ButtonBuilder()
      .setCustomId('afk')
      .setLabel('Форс')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isClosed),

    new ButtonBuilder()
      .setCustomId('offline')
      .setLabel('Оффлайн')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isClosed)
  );

  return {
    embeds: [embed],
    components: [row]
  };
}

/**
 * Строит закрытую таблицу (для использования в 23:59)
 * @param {string} guildId - ID сервера
 * @returns {Object} Объект с embed и components (кнопки отключены)
 */
export async function buildClosedTable(guildId) {
  return buildTable(guildId, true);
}

/**
 * Обновляет существующее сообщение таблицы (делает кнопки неактивными)
 * @param {Object} channel - Discord канал
 * @param {string} messageId - ID сообщения
 */
export async function closeTableMessage(channel, messageId) {
  try {
    const msg = await channel.messages.fetch(messageId);
    if (!msg) return false;

    const guildId = channel.guild.id;
    const closedTable = await buildClosedTable(guildId);
    
    await msg.edit(closedTable);
    return true;
  } catch (err) {
    console.error('Ошибка при закрытии таблицы:', err);
    return false;
  }
}
