import db from '../database/db.js';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';

export async function buildTable(guildId) {
  const today = new Date().toLocaleDateString('ru-RU');

  const rows = await new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM users WHERE guild_id=? AND date=?',
      [guildId, today],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });

  const online = [];
  const afk = [];
  const offline = [];

  for (const user of rows) {
    // 🟢 Онлайн
    if (user.status === 'online') {
      online.push(`**${user.name} | ${user.time}**`);
    }

    // 🟡 Форс
    if (user.status === 'afk') {
      const reason = user.reason ? ` | \`${user.reason}\`` : '';
      afk.push(`${user.name} | ${user.time}${reason}`);
    }

    // 🔴 Оффлайн
    if (user.status === 'offline') {
      offline.push(`*${user.name} | ${user.time}*`);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`📋 Онлайн контрактов на ${today}`)
    .setColor(0x2ecc71)
    .addFields(
      {
        name: '🟢 Онлайн',
        value: online.length ? online.join('\n') : '-'
      },
      {
        name: '🟡 Форс-мажор',
        value: afk.length ? afk.join('\n') : '-'
      },
      {
        name: '🔴 Оффлайн',
        value: offline.length ? offline.join('\n') : '-'
      }
    );

  // ✅ ТОЛЬКО 3 КНОПКИ
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('online')
      .setLabel('Онлайн')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('afk')
      .setLabel('Форс')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('offline')
      .setLabel('Оффлайн')
      .setStyle(ButtonStyle.Danger)
  );

  return {
    embeds: [embed],
    components: [row]
  };
}