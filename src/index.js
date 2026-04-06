
import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

import { startAutoContracts } from './services/autoContractService.js';
import { buildTable, buildClosedTable } from './services/tableService.js';
import { checkAllTwitchStreams } from './services/twitchService.js';
import { startTableCloseChecker } from './services/tableCloseService.js';
import db from './database/db.js';
import { getMoscowTime } from './utils/time.js';
import { memoryCache } from './utils/memoryCache.js';
import { logError } from './commands/botinfo.js';


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
console.log('📂 Начинаю загрузку команд...');
for (const file of fs.readdirSync(path.join(__dirname, 'commands'))) {
  try {
    const cmd = await import(`./commands/${file}`);
    client.commands.set(cmd.default.data.name, cmd.default);
    console.log(`✅ Команда загружена: /${cmd.default.data.name}`);
  } catch (err) {
    console.error(`❌ Ошибка загрузки команды ${file}:`, err);
    logError(err);
  }
}
console.log(`📊 Всего команд загружено: ${client.commands.size}`);

// =========================
// 📌 Загрузка событий
// =========================
console.log('📂 Начинаю загрузку событий...');
for (const file of fs.readdirSync(path.join(__dirname, 'events'))) {
  try {
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
    console.log(`✅ Событие загружено: ${event.default.name}`);
  } catch (err) {
    console.error(`❌ Ошибка загрузки события ${file}:`, err);
    logError(err);
  }
}

// =========================
// 🚀 READY + CRON (МСК)
// =========================
client.once('ready', async () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
  console.log(`📊 Подключено к ${client.guilds.cache.size} серверам`);
  console.log(`👥 Общее количество пользователей: ${client.users.cache.size}`);

  // 🎬 Анимированный запуск на всех серверах
  await sendStartupAnimation(client);

  // 🔥 Запускаем фоновый чекер закрытия таблиц (каждые 5 минут)
  startTableCloseChecker(client);

  // ⏱ Проверка каждую минуту
  cron.schedule('* * * * *', async () => {
    try {
      const now = getMoscowTime();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // 🕛 00:00 - Отправляем новые таблицы (все 3 типа: large → medium → small)
      if (hours === 0 && minutes === 0) {
        console.log('🕛 Новый день (МСК) - Отправка новых таблиц');

        const tableTypes = ['large', 'medium', 'small']; // Порядок отправки

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

            // Отправляем все 3 типа таблиц
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
            console.error(`❌ Ошибка при отправке таблиц (${guild.id})`, err);
            logError(err);
          }
        }
      }

      // 🕐 23:59 - Закрываем все таблицы (отключаем кнопки)
      if (hours === 23 && minutes === 59) {
        console.log('🕐 Закрытие всех таблиц (МСК)');

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
            const messages = await channel.messages.fetch({ limit: 50 });
            
            // Закрываем ВСЕ таблицы (не только последнюю)
            let closedCount = 0;
            const tableTypes = ['large', 'medium', 'small'];
            
            for (const msg of messages.values()) {
              if (msg.author.id !== client.user.id) continue;
              if (msg.embeds.length === 0) continue;
              
              const embed = msg.embeds[0];
              // Проверяем что это таблица контрактов
              if (!embed.title?.includes('Таблица контрактов')) continue;
              
              // Определяем тип таблицы из заголовка
              let tableType = 'small';
              if (embed.title.includes('Large')) tableType = 'large';
              else if (embed.title.includes('Medium')) tableType = 'medium';
              
              const closedTable = await buildClosedTable(guild.id, tableType);
              await msg.edit(closedTable);
              closedCount++;
              
              console.log(`🔒 Таблица ${tableType.toUpperCase()} закрыта в ${guild.name}`);
            }
            
            if (closedCount > 0) {
              console.log(`✅ Закрыто ${closedCount} таблиц в ${guild.name}`);
            }

          } catch (err) {
            console.error(`❌ Ошибка при закрытии таблиц (${guild.id})`, err);
            logError(err);
          }
        }
      }

    } catch (err) {
      console.error('❌ Ошибка в cron-задаче:', err);
      logError(err);
    }
  });

  // 🧹 Очистка старых записей из БД (каждый день в 01:00) - ТЕПЕРЬ 3 ДНЯ
  cron.schedule('0 1 * * *', async () => {
    try {
      console.log('🧹 Запуск очистки старых записей из БД...');
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
      logError(err);
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
      logError(err);
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
      logError(err);
    }
  });

  // 🎥 Проверка Twitch стримов (каждые 2 минуты)
  cron.schedule('*/2 * * * *', async () => {
    try {
      await checkAllTwitchStreams(client);
    } catch (err) {
      console.error('❌ Ошибка при проверке Twitch стримов:', err);
      logError(err);
    }
  });
});

// =========================
// 🎬 Анимированный запуск
// =========================
async function sendStartupAnimation(client) {
  console.log('🎬 Начинаю анимированный запуск на серверах...');
  
  for (const guild of client.guilds.cache.values()) {
    try {
      const settings = await new Promise(resolve => {
        db.get(
          'SELECT log_channel_id FROM settings WHERE guild_id = ?',
          [guild.id],
          (err, row) => resolve(row)
        );
      });

      if (!settings?.log_channel_id) {
        console.log(`⏭️ Пропускаю сервер ${guild.name} (log_channel не настроен)`);
        continue;
      }

      const channel = guild.channels.cache.get(settings.log_channel_id);
      if (!channel) {
        console.log(`⏭️ Пропускаю сервер ${guild.name} (канал не найден)`);
        continue;
      }

      // Отправляем начальное сообщение
      const message = await channel.send('Считывание данных бота.🤖');
      
      // Анимация загрузки
      const loadingStages = [
        'Считывание данных бота..🤖',
        'Считывание данных бота...🤖',
        'Считывание данных бота....🤖',
        'Загрузка системы [❌ ❌ ❌ ❌]',
        'Загрузка системы [ ✅ ❌ ❌ ❌ ]',
        'Загрузка системы [ ✅ ✅ ❌ ❌ ]',
        'Загрузка системы [ ✅ ✅ ✅ ❌ ]',
        'Загрузка системы [ ✅ ✅ ✅ ✅ ]'
      ];

      for (const stage of loadingStages) {
        await new Promise(resolve => setTimeout(resolve, 800));
        await message.edit(stage);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Финальное сообщение
      const finalEmbed = new EmbedBuilder()
        .setTitle('✅ Приложение успешно запущено')
        .setDescription(
          `**Статус:** Онлайн\n` +
          `**Время запуска:** ${new Date().toLocaleString('ru-RU')}\n` +
          `**Версия:** v1.3.2A\n` +
          `**Серверов:** ${client.guilds.cache.size}\n` +
          `**Пинг:** ${client.ws.ping}мс`
        )
        .setColor(0x2ecc71)
        .setTimestamp();

      await message.edit({ content: '', embeds: [finalEmbed] });
      console.log(`✅ Анимация запуска завершена на сервере ${guild.name}`);

    } catch (err) {
      console.error(`❌ Ошибка анимации запуска на сервере ${guild.name}:`, err);
      logError(err);
    }
  }
  
  console.log('✅ Анимированный запуск завершен на всех серверах');
}

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
console.log('🚀 Запуск бота...');
console.log(`📅 ${new Date().toLocaleString('ru-RU')}`);
client.login(process.env.TOKEN);

db.serialize(() => {

  db.run(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT
    )
  `, (err) => {
    if (err) {
      console.error("Ошибка создания таблицы:", err.message);
      return;
    }

    console.log("Таблица tables готова");

    // 👉 ВАЖНО: теперь внутри колбэка
    db.all(`PRAGMA table_info(tables)`, (err, rows) => {
      if (err) return console.error(err);

      const hasColumn = rows.some(col => col.name === 'table_type');

      if (!hasColumn) {
        db.run(`ALTER TABLE tables ADD COLUMN table_type TEXT`, (err) => {
          if (err) {
            console.error("Ошибка добавления колонки:", err.message);
          } else {
            console.log("Добавили table_type");
          }
        });
      } else {
        console.log("Колонка уже есть");
      }
    });

  });

});
