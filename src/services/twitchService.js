import { EmbedBuilder } from 'discord.js';
import db from '../database/db.js';

// Кеш для хранения токена Twitch API
let twitchToken = null;
let tokenExpiry = null;

/**
 * Получить OAuth токен для Twitch API
 */
async function getTwitchToken() {
  // Проверяем, есть ли действующий токен
  if (twitchToken && tokenExpiry && Date.now() < tokenExpiry) {
    return twitchToken;
  }

  try {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('❌ TWITCH_CLIENT_ID или TWITCH_CLIENT_SECRET не настроены в .env');
      return null;
    }

    const response = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: 'POST' }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    twitchToken = data.access_token;
    // Токен действителен примерно 60 дней, но обновляем за день до истечения
    tokenExpiry = Date.now() + (data.expires_in - 86400) * 1000;

    console.log('✅ Twitch OAuth токен получен');
    return twitchToken;
  } catch (err) {
    console.error('❌ Ошибка при получении Twitch токена:', err);
    return null;
  }
}

/**
 * Извлечь имя канала из URL Twitch
 */
function extractChannelName(url) {
  try {
    // Поддерживаем разные форматы URL
    // https://www.twitch.tv/channelname
    // https://twitch.tv/channelname
    // twitch.tv/channelname
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([a-zA-Z0-9_]+)/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Проверить статус стрима на Twitch
 */
async function checkStreamStatus(channelName) {
  try {
    const token = await getTwitchToken();
    if (!token) return null;

    const clientId = process.env.TWITCH_CLIENT_ID;

    const response = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${channelName}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-Id': clientId
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.data && data.data.length > 0) {
      const stream = data.data[0];
      return {
        isLive: true,
        streamId: stream.id,
        title: stream.title,
        game: stream.game_name,
        viewers: stream.viewer_count,
        thumbnail: stream.thumbnail_url.replace('{width}', '1280').replace('{height}', '720'),
        startedAt: stream.started_at
      };
    }

    return { isLive: false };
  } catch (err) {
    console.error(`❌ Ошибка при проверке стрима ${channelName}:`, err);
    return null;
  }
}

/**
 * Получить информацию о канале Twitch
 */
async function getChannelInfo(channelName) {
  try {
    const token = await getTwitchToken();
    if (!token) return null;

    const clientId = process.env.TWITCH_CLIENT_ID;

    const response = await fetch(
      `https://api.twitch.tv/helix/users?login=${channelName}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-Id': clientId
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.data && data.data.length > 0) {
      const user = data.data[0];
      return {
        id: user.id,
        displayName: user.display_name,
        profileImage: user.profile_image_url,
        description: user.description
      };
    }

    return null;
  } catch (err) {
    console.error(`❌ Ошибка при получении информации о канале ${channelName}:`, err);
    return null;
  }
}

/**
 * Создать Embed для начала стрима
 */
function createStreamStartEmbed(channelInfo, streamInfo, channelUrl) {
  return new EmbedBuilder()
    .setTitle(`На канале ${channelInfo.displayName} начался стрим! 🍿`)
    .setDescription(
      `**${streamInfo.title}**\n\n` +
      `Присоединяйся к нам по ссылке ниже.\n` +
      `[Смотреть стрим](${channelUrl}) 🔗`
    )
    .setColor(0x9146FF) // Фиолетовый цвет Twitch
    .setImage(streamInfo.thumbnail)
    .setThumbnail(channelInfo.profileImage)
    .addFields(
      { name: '🎮 Игра', value: streamInfo.game || 'Не указана', inline: true },
      { name: '👀 Зрителей', value: String(streamInfo.viewers), inline: true }
    )
    .setTimestamp();
}

/**
 * Создать Embed для завершения стрима
 */
function createStreamEndEmbed(channelInfo, channelUrl) {
  return new EmbedBuilder()
    .setTitle(`Стрим на канале ${channelInfo.displayName} завершен ✅`)
    .setDescription(
      `Не забудь присоединиться в следующий раз.\n` +
      `[Перейти на канал](${channelUrl}) 🔗`
    )
    .setColor(0x9146FF) // Фиолетовый цвет Twitch
    .setThumbnail(channelInfo.profileImage)
    .setTimestamp();
}

/**
 * Проверить все настроенные Twitch каналы
 */
async function checkAllTwitchStreams(client) {
  try {
    // Получаем все настройки Twitch
    const settings = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM twitch_settings', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    if (settings.length === 0) return;

    console.log(`🔍 Проверка ${settings.length} Twitch каналов...`);

    for (const setting of settings) {
      try {
        const channelName = extractChannelName(setting.twitch_channel);
        if (!channelName) {
          console.error(`❌ Некорректный URL Twitch: ${setting.twitch_channel}`);
          continue;
        }

        const streamInfo = await checkStreamStatus(channelName);
        if (streamInfo === null) continue; // Ошибка при проверке

        const wasLive = setting.is_live === 1;
        const isLive = streamInfo.isLive;

        // Стрим начался
        if (!wasLive && isLive) {
          console.log(`🎥 Стрим начался: ${channelName}`);

          const channelInfo = await getChannelInfo(channelName);
          if (!channelInfo) continue;

          const guild = client.guilds.cache.get(setting.guild_id);
          if (!guild) continue;

          const announcementChannel = guild.channels.cache.get(setting.announcement_channel_id);
          if (!announcementChannel) {
            console.error(`❌ Канал для объявлений не найден: ${setting.announcement_channel_id}`);
            continue;
          }

          const embed = createStreamStartEmbed(
            channelInfo,
            streamInfo,
            setting.twitch_channel
          );

          await announcementChannel.send({ embeds: [embed] });

          // Обновляем статус в БД
          await new Promise((resolve, reject) => {
            db.run(
              'UPDATE twitch_settings SET is_live = 1, last_stream_id = ?, last_check = ? WHERE guild_id = ?',
              [streamInfo.streamId, new Date().toISOString(), setting.guild_id],
              (err) => (err ? reject(err) : resolve())
            );
          });
        }

        // Стрим закончился
        else if (wasLive && !isLive) {
          console.log(`⏹️ Стрим завершен: ${channelName}`);

          const channelInfo = await getChannelInfo(channelName);
          if (!channelInfo) continue;

          const guild = client.guilds.cache.get(setting.guild_id);
          if (!guild) continue;

          const announcementChannel = guild.channels.cache.get(setting.announcement_channel_id);
          if (!announcementChannel) {
            console.error(`❌ Канал для объявлений не найден: ${setting.announcement_channel_id}`);
            continue;
          }

          const embed = createStreamEndEmbed(
            channelInfo,
            setting.twitch_channel
          );

          await announcementChannel.send({ embeds: [embed] });

          // Обновляем статус в БД
          await new Promise((resolve, reject) => {
            db.run(
              'UPDATE twitch_settings SET is_live = 0, last_check = ? WHERE guild_id = ?',
              [new Date().toISOString(), setting.guild_id],
              (err) => (err ? reject(err) : resolve())
            );
          });
        }

        // Обновляем время последней проверки
        else {
          await new Promise((resolve, reject) => {
            db.run(
              'UPDATE twitch_settings SET last_check = ? WHERE guild_id = ?',
              [new Date().toISOString(), setting.guild_id],
              (err) => (err ? reject(err) : resolve())
            );
          });
        }

      } catch (err) {
        console.error(`❌ Ошибка при проверке канала ${setting.twitch_channel}:`, err);
      }
    }
  } catch (err) {
    console.error('❌ Ошибка в checkAllTwitchStreams:', err);
  }
}

/**
 * Сохранить настройки Twitch для сервера
 */
async function saveTwitchSettings(guildId, twitchUrl, announcementChannelId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO twitch_settings (guild_id, twitch_channel, announcement_channel_id, is_live, last_check)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(guild_id)
       DO UPDATE SET
         twitch_channel = ?,
         announcement_channel_id = ?,
         is_live = 0`,
      [
        guildId,
        twitchUrl,
        announcementChannelId,
        new Date().toISOString(),
        twitchUrl,
        announcementChannelId
      ],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

/**
 * Получить настройки Twitch для сервера
 */
async function getTwitchSettings(guildId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM twitch_settings WHERE guild_id = ?',
      [guildId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

/**
 * Удалить настройки Twitch для сервера
 */
async function removeTwitchSettings(guildId) {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM twitch_settings WHERE guild_id = ?',
      [guildId],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

export {
  checkAllTwitchStreams,
  saveTwitchSettings,
  getTwitchSettings,
  removeTwitchSettings,
  extractChannelName,
  getChannelInfo
};
