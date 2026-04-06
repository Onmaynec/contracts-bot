import cron from 'node-cron';
import db from '../database/db.js';
import { buildTable } from './tableService.js';
import { getMoscowDate } from '../utils/time.js';

/**
 * Запускает планировщик задач
 * @param {Object} client - Discord клиент
 */
export function startScheduler(client) {
  console.log('⏰ Планировщик запущен');

  // Автоотправка таблиц в 06:00 МСК (каждый день)
  // Формат cron: секунды минуты часы день месяц день_недели
  cron.schedule('0 0 6 * * *', async () => {
    console.log('🕕 Автоотправка таблиц (06:00 МСК)');
    await autoSendTables(client);
  }, {
    timezone: 'Europe/Moscow'
  });

  // Закрытие таблиц в 23:59 МСК
  cron.schedule('0 59 23 * * *', async () => {
    console.log('🌙 Закрытие таблиц (23:59 МСК)');
    await closeAllTables(client);
  }, {
    timezone: 'Europe/Moscow'
  });

  console.log('✅ Планировщик настроен: автоотправка в 06:00, закрытие в 23:59');
}

/**
 * Автоматическая отправка таблиц во всех гильдиях
 * Порядок: large → medium → small
 * @param {Object} client - Discord клиент
 */
async function autoSendTables(client) {
  const tableTypes = ['large', 'medium', 'small']; // Порядок отправки

  for (const guild of client.guilds.cache.values()) {
    try {
      const settings = await new Promise((resolve) => {
        db.get(
          'SELECT table_channel_id FROM settings WHERE guild_id = ?',
          [guild.id],
          (_, row) => resolve(row)
        );
      });

      if (!settings?.table_channel_id) {
        console.log(`⚠️ Не настроен канал таблиц для ${guild.name}`);
        continue;
      }

      const channel = guild.channels.cache.get(settings.table_channel_id);
      if (!channel) {
        console.log(`⚠️ Канал таблиц не найден для ${guild.name}`);
        continue;
      }

      // Очищаем старые записи за сегодня
      const today = getMoscowDate();
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM users WHERE guild_id = ? AND date = ?',
          [guild.id, today],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Отправляем таблицы в порядке: large → medium → small
      for (const tableType of tableTypes) {
        try {
          const table = await buildTable(guild.id, tableType);
          await channel.send(table);
          console.log(`✅ Таблица ${tableType.toUpperCase()} отправлена в ${guild.name}`);
          
          // Небольшая задержка между отправками
          await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          console.error(`❌ Ошибка отправки таблицы ${tableType} в ${guild.name}:`, err);
        }
      }

      console.log(`✅ Все таблицы отправлены в ${guild.name}`);

    } catch (err) {
      console.error(`❌ Ошибка автоотправки для ${guild.name}:`, err);
    }
  }
}

/**
 * Закрывает все таблицы (делает кнопки неактивными)
 * @param {Object} client - Discord клиент
 */
async function closeAllTables(client) {
  // В текущей реализации таблицы закрываются автоматически через isTableClosed()
  // Эта функция может быть использована для дополнительных действий при закрытии
  console.log('🌙 Таблицы закрыты до 06:00 МСК');
}

/**
 * Проверяет и очищает старые записи (старше 7 дней)
 * @param {Object} client - Discord клиент
 */
export async function cleanupOldRecords() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

  await new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM users WHERE date < ?',
      [cutoffDate],
      function(err) {
        if (err) {
          console.error('❌ Ошибка очистки старых записей:', err);
          reject(err);
        } else {
          console.log(`🧹 Очищено ${this.changes} старых записей`);
          resolve();
        }
      }
    );
  });
}
