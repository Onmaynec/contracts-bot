import db from '../database/db.js';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { getMoscowDate, getMoscowTime } from '../utils/time.js';

const DEV_ID = '870408185620615212';

// Цвета для разных типов таблиц
const TABLE_COLORS = {
  small: 0x3498db,   // Голубой
  medium: 0xe67e22,  // Оранжевый
  large: 0xe74c3c,   // Красный
  closed: 0x95a5a6,  // Серый (закрыто)
  gold: 0xffd700     // Золотой (X2 режим)
};

// Доход по умолчанию
const DEFAULT_INCOME = {
  small: { min: 30, max: 70, emoji: '💸', extra: 'векселей' },
  medium: { min: 70, max: 100, emoji: '💰', extra: 'векселей' },
  large: { min: 100, max: 150, emoji: '💎', extra: 'векселей' }
};

// Доход в X2 режиме
const X2_INCOME = {
  small: { min: 50, max: 90, emoji: '💸' },
  medium: { min: 90, max: 120, emoji: '💰' },
  large: { min: 150, max: 200, emoji: '💎', extra: '+' }
};

// Пустые сообщения
const EMPTY_MESSAGES = {
  online: 'Тут пусто :(',
  afk: 'Тут не кого нету ;)',
  offline: 'Хорошо что не кто не офлайн :)'
};

/**
 * Проверяет, закрыта ли таблица (23:59 - 06:00 по Москве)
 * @returns {boolean} true если таблица закрыта
 */
export function isTableClosed() {
  const moscowTime = getMoscowTime();
  const hours = moscowTime.getHours();
  const minutes = moscowTime.getMinutes();
  
  // Таблица закрыта с 23:59 до 06:00
  return (hours === 23 && minutes >= 59) || (hours >= 0 && hours < 6);
}

/**
 * Проверяет активен ли X2 режим
 * @param {string} guildId - ID сервера
 * @returns {Promise<boolean>}
 */
export async function isX2Active(guildId) {
  const x2Settings = await new Promise((resolve) => {
    db.get(
      'SELECT * FROM x2_settings WHERE guild_id = ?',
      [guildId],
      (_, row) => resolve(row)
    );
  });

  if (!x2Settings || !x2Settings.enabled) return false;

  const today = getMoscowDate();
  return today >= x2Settings.start_date && today <= x2Settings.end_date;
}

/**
 * Получает доход для типа таблицы
 * @param {string} tableType - Тип таблицы (small/medium/large)
 * @param {boolean} x2Active - Активен ли X2 режим
 * @returns {Object} Объект с min, max, emoji
 */
export function getIncome(tableType, x2Active = false) {
  const income = x2Active ? X2_INCOME[tableType] : DEFAULT_INCOME[tableType];
  return income || DEFAULT_INCOME.small;
}

/**
 * Строит таблицу контрактов
 * @param {string} guildId - ID сервера
 * @param {string} tableType - Тип таблицы (small/medium/large)
 * @param {boolean} closed - Принудительно закрыть таблицу
 * @param {boolean} isDevClose - Закрытие разработчиком (меняет footer)
 * @returns {Object} Объект с embed и components
 */
export async function buildTable(guildId, tableType = 'small', closed = false, isDevClose = false) {
  const today = getMoscowDate();
  const isClosed = closed || isTableClosed();
  const x2Active = await isX2Active(guildId);

  const rows = await new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM users WHERE guild_id=? AND date=? AND table_type=?',
      [guildId, today, tableType],
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
      afk.push(`${user.name}${reason}`);
    }

    // 🔴 Оффлайн
    if (user.status === 'offline') {
      offline.push(`*${user.name} | ${user.time}*`);
    }
  }

  // Определяем цвет таблицы
  let embedColor;
  if (isClosed) {
    embedColor = TABLE_COLORS.closed;
  } else if (x2Active) {
    embedColor = TABLE_COLORS.gold;
  } else {
    embedColor = TABLE_COLORS[tableType] || TABLE_COLORS.small;
  }

  // Заголовок с типом таблицы
  const typeEmoji = {
    small: '🔹',
    medium: '🔸',
    large: '🔺'
  }[tableType] || '🔹';

  const typeName = {
    small: 'Small',
    medium: 'Medium',
    large: 'Large'
  }[tableType] || 'Small';

  const x2Badge = x2Active ? ' ⚡X2' : '';

  const embed = new EmbedBuilder()
    .setTitle(`${typeEmoji} Таблица контрактов ${typeName}${x2Badge} на ${today}`)
    .setColor(embedColor)
    .addFields(
      {
        name: '🟢 Онлайн',
        value: online.length ? online.join('\n') : EMPTY_MESSAGES.online
      },
      {
        name: '🟡 Форс-мажор',
        value: afk.length ? afk.join('\n') : EMPTY_MESSAGES.afk
      },
      {
        name: '🔴 Оффлайн',
        value: offline.length ? offline.join('\n') : EMPTY_MESSAGES.offline
      }
    );

  // Добавляем информацию о доходе
  if (!isClosed) {
    const income = getIncome(tableType, x2Active);
    const extraText = income.extra || '';
    embed.setFooter({ 
      text: `${income.emoji} Доход: ${income.min}-${income.max}${extraText}` 
    });
  }

  // Добавляем предупреждение если таблица закрыта
  if (isClosed) {
    // Если закрыто разработчиком - специальный текст
    if (isDevClose) {
      embed.setFooter({ 
        text: '-# Разработчик закрыл таблицу ⚙️' 
      });
    } else {
      embed.setFooter({ 
        text: '🗃️ Таблица закрыта до 06:00 МСК' 
      });
    }
  }

  // ✅ Кнопки (отключены если таблица закрыта)
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`online_${tableType}`)
      .setLabel('Онлайн')
      .setStyle(ButtonStyle.Success)
      .setDisabled(isClosed),

    new ButtonBuilder()
      .setCustomId(`afk_${tableType}`)
      .setLabel('Форс')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isClosed),

    new ButtonBuilder()
      .setCustomId(`offline_${tableType}`)
      .setLabel('Оффлайн')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isClosed),

    // 🔒 Кнопка закрытия для разработчика
    new ButtonBuilder()
      .setCustomId(`dev_close_${tableType}`)
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Secondary)
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
 * @param {string} tableType - Тип таблицы (small/medium/large)
 * @returns {Object} Объект с embed и components (кнопки отключены)
 */
export async function buildClosedTable(guildId, tableType = 'small') {
  return buildTable(guildId, tableType, true);
}

/**
 * Обновляет существующее сообщение таблицы (делает кнопки неактивными)
 * @param {Object} channel - Discord канал
 * @param {string} messageId - ID сообщения
 * @param {string} tableType - Тип таблицы (small/medium/large)
 */
export async function closeTableMessage(channel, messageId, tableType = 'small') {
  try {
    const msg = await channel.messages.fetch(messageId);
    if (!msg) return false;

    const guildId = channel.guild.id;
    const closedTable = await buildClosedTable(guildId, tableType);
    
    await msg.edit(closedTable);
    return true;
  } catch (err) {
    console.error('Ошибка при закрытии таблицы:', err);
    return false;
  }
}

/**
 * Проверяет имеет ли пользователь доступ к таблице
 * @param {Object} member - Discord member
 * @param {string} tableType - Тип таблицы (small/medium/large)
 * @param {Object} tableRoles - Объект с ID ролей
 * @returns {boolean}
 */
export function hasTableAccess(member, tableType, tableRoles) {
  const userId = member.user.id;
  
  // DEV всегда имеет доступ
  if (userId === DEV_ID) return true;

  if (!tableRoles) return false;

  const roleMap = {
    small: tableRoles.weak_role_id,
    medium: tableRoles.medium_role_id,
    large: tableRoles.strong_role_id
  };

  const requiredRole = roleMap[tableType];
  if (!requiredRole) return false;

  return member.roles.cache.has(requiredRole);
}

/**
 * Проверяет имеет ли пользователь права ответственного
 * @param {Object} member - Discord member
 * @param {Object} tableRoles - Объект с ID ролей
 * @returns {boolean}
 */
export function hasResponsibleAccess(member, tableRoles) {
  const userId = member.user.id;
  
  // DEV всегда имеет доступ
  if (userId === DEV_ID) return true;

  if (!tableRoles || !tableRoles.responsible_role_id) return false;

  // Проверяем роль ответственного
  return member.roles.cache.has(tableRoles.responsible_role_id);
}

/**
 * Получает настройки ролей таблиц
 * @param {string} guildId - ID сервера
 * @returns {Promise<Object|null>}
 */
export async function getTableRoles(guildId) {
  return new Promise((resolve) => {
    db.get(
      'SELECT * FROM table_roles WHERE guild_id = ?',
      [guildId],
      (_, row) => resolve(row)
    );
  });
}
