import { getMoscowTime } from '../utils/time.js';
import { buildClosedTable } from './tableService.js';
import db from '../database/db.js';

const DEV_ID = '870408185620615212';

// Хранилище для отслеживания закрытых таблиц (чтобы не закрывать повторно)
const closedTablesCache = new Set();

/**
 * Проверяет, нужно ли закрыть таблицы (время >= 23:59 МСК)
 * @returns {boolean}
 */
export function shouldCloseTables() {
  const moscowTime = getMoscowTime();
  const hours = moscowTime.getHours();
  const minutes = moscowTime.getMinutes();
  
  // Таблицы должны быть закрыты с 23:59 до 06:00
  return (hours === 23 && minutes >= 59) || (hours >= 0 && hours < 6);
}

/**
 * Получает уникальный ключ для таблицы
 * @param {string} guildId - ID сервера
 * @param {string} messageId - ID сообщения
 * @returns {string}
 */
function getTableKey(guildId, messageId) {
  return `${guildId}:${messageId}`;
}

/**
 * Закрывает все открытые таблицы на сервере
 * @param {Object} client - Discord клиент
 * @param {string} guildId - ID сервера
 */
async function closeTablesForGuild(client, guildId) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const settings = await new Promise(resolve => {
      db.get(
        'SELECT table_channel_id FROM settings WHERE guild_id = ?',
        [guildId],
        (err, row) => resolve(row)
      );
    });

    if (!settings?.table_channel_id) return;

    const channel = guild.channels.cache.get(settings.table_channel_id);
    if (!channel) return;

    // Получаем последние сообщения в канале
    const messages = await channel.messages.fetch({ limit: 50 });
    
    let closedCount = 0;
    
    // Ищем все сообщения с таблицами контрактов
    for (const msg of messages.values()) {
      if (msg.author.id !== client.user.id) continue;
      if (msg.embeds.length === 0) continue;
      
      const embed = msg.embeds[0];
      // Проверяем что это таблица контрактов (по заголовку)
      if (!embed.title?.includes('Таблица контрактов')) continue;
      
      const tableKey = getTableKey(guildId, msg.id);
      
      // Пропускаем уже закрытые таблицы
      if (closedTablesCache.has(tableKey)) continue;
      
      // Определяем тип таблицы из заголовка
      let tableType = 'small';
      if (embed.title.includes('Large')) tableType = 'large';
      else if (embed.title.includes('Medium')) tableType = 'medium';
      
      // Закрываем таблицу
      const closedTable = await buildClosedTable(guildId, tableType);
      await msg.edit(closedTable);
      
      // Добавляем в кеш закрытых таблиц
      closedTablesCache.add(tableKey);
      closedCount++;
      
      console.log(`🔒 Таблица ${tableType.toUpperCase()} закрыта в ${guild.name}`);
    }
    
    if (closedCount > 0) {
      console.log(`✅ Закрыто ${closedCount} таблиц в ${guild.name}`);
    }
    
  } catch (err) {
    console.error(`❌ Ошибка при закрытии таблиц для сервера ${guildId}:`, err);
  }
}

/**
 * Запускает фоновую задачу проверки времени и закрытия таблиц
 * Проверяет каждые 5 минут
 * @param {Object} client - Discord клиент
 */
export function startTableCloseChecker(client) {
  console.log('⏰ Запущен фоновый чекер закрытия таблиц (проверка каждые 5 минут)');
  
  // Проверяем каждые 5 минут (300000 мс)
  setInterval(async () => {
    try {
      const moscowTime = getMoscowTime();
      const hours = moscowTime.getHours();
      const minutes = moscowTime.getMinutes();
      
      console.log(`⏰ Проверка времени: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} МСК`);
      
      // Если время >= 23:59 или < 06:00 - закрываем все таблицы
      if (shouldCloseTables()) {
        console.log('🌙 Время закрытия таблиц! Закрываю все открытые таблицы...');
        
        for (const guild of client.guilds.cache.values()) {
          await closeTablesForGuild(client, guild.id);
        }
      } else {
        // Если время >= 06:00 - очищаем кеш закрытых таблиц для нового дня
        if (hours === 6 && minutes < 5) {
          if (closedTablesCache.size > 0) {
            console.log('🌅 Новый день! Очищаю кеш закрытых таблиц');
            closedTablesCache.clear();
          }
        }
      }
    } catch (err) {
      console.error('❌ Ошибка в фоновом чекере закрытия таблиц:', err);
    }
  }, 5 * 60 * 1000); // 5 минут
  
  // Немедленная первая проверка
  console.log('⏰ Первая проверка времени...');
}

/**
 * Принудительно закрывает конкретную таблицу (для кнопки dev)
 * @param {Object} message - Discord сообщение
 * @param {string} guildId - ID сервера
 * @param {string} tableType - Тип таблицы
 * @param {boolean} isDevClose - Закрытие разработчиком
 */
export async function forceCloseTable(message, guildId, tableType = 'small', isDevClose = false) {
  try {
    const { buildTable } = await import('./tableService.js');
    
    // Строим закрытую таблицу с пометкой dev
    const closedTable = await buildTable(guildId, tableType, true, isDevClose);
    await message.edit(closedTable);
    
    // Добавляем в кеш
    const tableKey = getTableKey(guildId, message.id);
    closedTablesCache.add(tableKey);
    
    return true;
  } catch (err) {
    console.error('❌ Ошибка при принудительном закрытии таблицы:', err);
    return false;
  }
}

/**
 * Очищает кеш закрытых таблиц
 */
export function clearClosedTablesCache() {
  closedTablesCache.clear();
  console.log('🧹 Кеш закрытых таблиц очищен');
}

/**
 * Получает статистику закрытых таблиц
 */
export function getClosedTablesStats() {
  return {
    count: closedTablesCache.size,
    tables: Array.from(closedTablesCache)
  };
}
