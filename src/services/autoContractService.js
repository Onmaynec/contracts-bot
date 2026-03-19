import db from '../database/db.js';

export function startAutoContracts(client) {
  setInterval(() => {
    const now = new Date();
    const currentTime =
      now.getHours().toString().padStart(2, '0') +
      ':' +
      now.getMinutes().toString().padStart(2, '0');

    db.all(
      `SELECT * FROM guild_settings WHERE auto_enabled=1`,
      [],
      async (err, rows) => {
        if (err) return console.error(err);

        for (const row of rows) {
          if (row.auto_time === currentTime) {
            try {
              const guild = await client.guilds.fetch(row.guild_id);
              const channel = guild.channels.cache.get(row.channel_id);

              if (!channel) continue;

              await channel.send({
                content: '📄 Автоматический контракт создан!'
              });

            } catch (e) {
              console.error('Ошибка автоконтракта:', e);
            }
          }
        }
      }
    );
  }, 60000); // каждую минуту
}