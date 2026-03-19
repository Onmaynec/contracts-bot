import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const commands = [];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const commandFiles = fs.readdirSync(__dirname + '/commands');

for (const file of commandFiles) {
  const command = await import(`./commands/${file}`);
  commands.push(command.default.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Начинаю регистрацию команд...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log('Команды зарегистрированы');
  } catch (error) {
    console.error(error);
  }
})();