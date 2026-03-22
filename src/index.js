import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

import { startAutoContracts } from './services/autoContractService.js';
import { buildTable } from './services/tableService.js';
import db from './database/db.js';
import { getMoscowTime } from './utils/time.js';


const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =========================
// 📌 Загрузка команд
// =========================
for (const file of fs.readdirSync(__dirname + '/commands')) {
  const cmd = await import(`./commands/${file}`);
  client.commands.set(cmd.default.data.name, cmd.default);
}

// =========================
// 📌 Загрузка событий
// =========================
for (const file of fs.readdirSync(__dirname + '/events')) {
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
    const now = getMoscowTime();

    if (now.getHours() === 0 && now.getMinutes() === 0) {
      console.log('🕛 Новый день (МСК)');

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

          // 🆕 создаём новую таблицу
          const table = await buildTable(guild.id);

          await channel.send(table);

        } catch (err) {
          console.error(`❌ Ошибка при обновлении таблицы (${guild.id})`, err);
        }
      }
    }
  });
});

// =========================
// 🚀 Запуск
// =========================
client.login(process.env.TOKEN);