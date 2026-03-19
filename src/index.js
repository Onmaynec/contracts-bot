
import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startAutoContracts } from './services/autoContractService.js';

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
// 🚀 Запуск
// =========================
client.login(process.env.TOKEN);

