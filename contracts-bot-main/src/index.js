import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

import { startAutoContracts } from './services/autoContractService.js';
import { buildTable, buildClosedTable } from './services/tableService.js';
import db from './database/db.js';
import { getMoscowTime } from './utils/time.js';
import { memoryCache } from './utils/memoryCache.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers // 🔥 ВАЖНО (для welcome)
  ]
});

client.commands = new Collection();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =========================
// 📌 Загрузка команд
// =========================
for (const file of fs.readdirSync(path.join(__dirname, 'commands'))) {
  const cmd = await import(`./commands/${file}`);
  client.commands.set(cmd.default.data.name, cmd.default);
}

// =========================
// 📌 Загрузка событий
// =========================
for (const file of fs.readdirSync(path.join(__dirname, 'events'))) {
  const event = await import(`./events/${file}`);

  if (event.default.once) {
    client.once(event.default.name, (...args) =>
      event.default.execute(...args, client)
    );
  } else {
    client.on(event.default.name, (...args) =>
      event.default.execute(...args, client)
    );
  }
}

// =========================
// 🚀 READY + CRON (МСК)
// =========================
client.once('ready', () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);

  // ⏱ Проверка каждую минуту
  cron.schedule('* * * * *', async () => {
    try {
      const now = getMoscowTime();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // 🕛 00:00 - Отправляем новую таблицу
      if (hours === 0 && minutes === 0) {
        console.log('🕛 Новый день (МСК) - Отправка новой таблицы');

        for (const guild of client.guilds.cache.values()) {
          try {
            const settings = await new Promise(resolve => {
              db.get(
                'SELECT table_channel_id FROM settings WHERE guild_id=?',
                [guild.id],
                (err, row) => resolve(row)
              );
            });

            if (!settings?.table_channel_id) continue;

            const channel = guild.channels.cache.get(settings.table_channel_id);
            if (!channel) continue;

            const table = await buildTable(guild.id);
            await channel.send(table);
            console.log(`✅ Новая таблица отправлена в ${guild.name}`);

          } catch (err) {
            console.error(`❌ Ошибка при отправке таблицы (${guild.id})`, err);
          }
        }
      }

      // 🕐 23:59 - Закрываем текущую таблицу (отключаем кнопки)
      if (hours === 23 && minutes === 59) {
        console.log('🕐 Закрытие таблиц (МСК)');

        for (const guild of client.guilds.cache.values()) {
          try {
            const settings = await new Promise(resolve => {
              db.get(
                'SELECT table_channel_id FROM settings WHERE guild_id=?',
                [guild.id],
                (err, row) => resolve(row)
              );
            });

            if (!settings?.table_channel_id) continue;

            const channel = guild.channels.cache.get(settings.table_channel_id);
            if (!channel) continue;

            // Получаем последние сообщения в канале
            const messages = await channel.messages.fetch({ limit: 10 });
            
            // Ищем последнее сообщение с таблицей (по embed)
            for (const msg of messages.values()) {
              if (msg.author.id === client.user.id && msg.embeds.length > 0) {
                const embed = msg.embeds[0];
                // Проверяем что это таблица контрактов
                if (embed.title?.includes('Онлайн контрактов')) {
                  const closedTable = await buildClosedTable(guild.id);
                  await msg.edit(closedTable);
                  console.log(`🔒 Таблица закрыта в ${guild.name}`);
                  break; // Закрываем только последнюю таблицу
                }
              }
            }

          } catch (err) {
            console.error(`❌ Ошибка при закрытии таблицы (${guild.id})`, err);
          }
        }
      }

    } catch (err) {
      console.error('❌ Ошибка в cron-задаче:', err);
    }
  });

  // 🧹 Очистка старых записей из БД (каждый день в 01:00) - ТЕПЕРЬ 3 ДНЯ
  cron.schedule('0 1 * * *', async () => {
    try {
      const moscowTime = getMoscowTime();
      const threeDaysAgo = new Date(moscowTime);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3); // ⏰ Изменено с 30 на 3 дня
      const cutoffDate = threeDaysAgo.toLocaleDateString('ru-RU');

      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM users WHERE date < ?',
          [cutoffDate],
          function(err) {
            if (err) reject(err);
            else {
              console.log(`🧹 Очищено ${this.changes} старых записей из БД (старше 3 дней)`);
              resolve();
            }
          }
        );
      });
    } catch (err) {
      console.error('❌ Ошибка при очистке БД:', err);
    }
  });

  // 🧹 Очистка устаревших данных из памяти (каждые 6 часов)
  cron.schedule('0 */6 * * *', () => {
    try {
      console.log('🧹 Запуск очистки кеша в памяти...');
      memoryCache.cleanup();
      console.log(`📊 Статистика кеша: ${memoryCache.getStats().size} записей`);
    } catch (err) {
      console.error('❌ Ошибка при очистке кеша:', err);
    }
  });

  // 🧹 Принудительная очистка старых данных из памяти (каждый день в 02:00)
  cron.schedule('0 2 * * *', () => {
    try {
      console.log('🧹 Принудительная очистка старых данных из памяти...');
      
      // Очищаем кеш broadcast (старше 3 дней)
      const stats = memoryCache.getStats();
      let cleared = 0;
      
      for (const key of stats.keys) {
        if (key.startsWith('broadcast:')) {
          memoryCache.delete(key);
          cleared++;
        }
      }
      
      if (cleared > 0) {
        console.log(`🧹 Очищено ${cleared} записей broadcast-кеша`);
      }
      
      console.log('✅ Очистка памяти завершена');
    } catch (err) {
      console.error('❌ Ошибка при очистке памяти:', err);
    }
  });
});

// =========================
// 🛑 Graceful Shutdown
// =========================
async function gracefulShutdown(signal) {
  console.log(`\n${signal} получен. Завершение работы...`);
  
  try {
    // Очищаем кеш в памяти
    memoryCache.clear();
    console.log('✅ Кеш в памяти очищен');

    // Закрываем соединение с Discord
    client.destroy();
    console.log('✅ Соединение с Discord закрыто');

    // Закрываем соединение с БД
    await new Promise((resolve) => {
      db.close((err) => {
        if (err) {
          console.error('❌ Ошибка при закрытии БД:', err);
        } else {
          console.log('✅ Соединение с БД закрыто');
        }
        resolve();
      });
    });

    console.log('👋 Бот остановлен корректно');
    process.exit(0);
  } catch (err) {
    console.error('❌ Ошибка при завершении работы:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// =========================
// 🚀 Запуск
// =========================
client.login(process.env.TOKEN);
