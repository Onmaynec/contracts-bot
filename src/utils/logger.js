import db from '../database/db.js';

export async function sendLog(guild, content) {
  const settings = await new Promise(resolve => {
    db.get(
      'SELECT log_channel_id FROM settings WHERE guild_id=?',
      [guild.id],
      (err, row) => resolve(row)
    );
  });

  if (!settings?.log_channel_id) return;

  const channel = guild.channels.cache.get(settings.log_channel_id);
  if (!channel) return;

  await channel.send({ content });
}