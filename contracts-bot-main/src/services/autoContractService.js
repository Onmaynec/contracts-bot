import db from '../database/db.js';
import { buildTable } from './tableService.js';
import { getMoscowTime } from '../utils/time.js';

/**
 * Запускает сервис автоматических контрактов
 * @param {Object} client - Discord клиент
 */
export function startAutoContracts(client) {
  // Проверяем каждую минуту
  setInterval(async () => {
    try {
      // ✅ ИСПРАВЛЕНО: Используем московское время
      const moscowTime = getMoscowTime();
      const currentTime =
        moscowTime.getHours().toString().padStart(2, '0') +
        ':' +
        moscowTime.getMinutes().toString().padStart(2, '0');

      // ✅ ИСПРАВЛЕНО: Используем таблицу settings вместо guild_settings
      const rows = await new Promise((resolve, reject) => {
        db.all(
          `SELECT guild_id, auto_time, auto_enabled, table_channel_id 
           FROM settings 
           WHERE auto_enabled=1 AND auto_time IS NOT NULL`,
          [],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      for (const row of rows) {
        if (row.auto_time === currentTime) {
          try {
            const guild = await client.guilds.fetch(row.guild_id);
            if (!guild) continue;

            const channel = guild.channels.cache.get(row.table_channel_id);
            if (!channel) {
              console.warn(`Канал для авто-таблицы не найден: ${row.table_channel_id}`);
              continue;
            }

            // Отправляем новую таблицу
            const table = await buildTable(guild.id);
            await channel.send({
              content: '📄 Автоматический контракт создан!',
              ...table
            });

            console.log(`✅ Авто-таблица отправлена в ${guild.name} (${currentTime})`);

          } catch (e) {
            console.error('Ошибка автоконтракта для guild', row.guild_id, ':', e);
          }
        }
      }
    } catch (err) {
      console.error('Ошибка в сервисе авто-контрактов:', err);
    }
  }, 60000); // каждую минуту

  console.log('✅ Сервис автоматических контрактов запущен');
}
