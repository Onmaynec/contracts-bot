import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import db from '../database/db.js';

export default {
  data: new SlashCommandBuilder()
    .setName('settingsinfo')
    .setDescription('Показать все настройки бота на сервере'),

  async execute(interaction) {
    const guildId = interaction.guild.id;

    try {
      const settings = await new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM settings WHERE guild_id = ?',
          [guildId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      // Получаем настройки Twitch
      const twitchSettings = await new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM twitch_settings WHERE guild_id = ?',
          [guildId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle('⚙️ Настройки сервера')
        .setColor(0x3498db)
        .setTimestamp()
        .setFooter({ text: `Сервер: ${interaction.guild.name}` });

      if (!settings) {
        embed.setDescription('❌ Настройки не найдены. Используйте `/settings` для настройки бота.');
      } else {
        // Канал таблицы
        const tableChannel = settings.table_channel_id 
          ? `<#${settings.table_channel_id}>` 
          : '❌ Не установлен';
        
        // Системный канал
        const systemChannel = settings.system_channel_id 
          ? `<#${settings.system_channel_id}>` 
          : '❌ Не установлен';
        
        // Канал логов
        const logChannel = settings.log_channel_id 
          ? `<#${settings.log_channel_id}>` 
          : '❌ Не установлен';
        
        // Welcome канал
        const welcomeChannel = settings.welcome_channel_id 
          ? `<#${settings.welcome_channel_id}>` 
          : '❌ Не установлен';
        
        // Роли
        const role1 = settings.role1_id 
          ? `<@&${settings.role1_id}>` 
          : '❌ Не установлена';
        const role2 = settings.role2_id 
          ? `<@&${settings.role2_id}>` 
          : '❌ Не установлена';
        
        // Автовремя
        const autoTime = settings.auto_time 
          ? settings.auto_time 
          : '❌ Не установлено';

        embed.addFields(
          { name: '📊 Канал таблицы', value: tableChannel, inline: true },
          { name: '📢 Системный канал', value: systemChannel, inline: true },
          { name: '📝 Канал логов', value: logChannel, inline: true },
          { name: '👋 Welcome канал', value: welcomeChannel, inline: true },
          { name: '🎭 Роль 1', value: role1, inline: true },
          { name: '🎭 Роль 2', value: role2, inline: true },
          { name: '⏰ Автовремя', value: autoTime, inline: true }
        );

        // Добавляем информацию о Twitch
        if (twitchSettings) {
          const twitchChannel = twitchSettings.twitch_channel;
          const twitchAnnouncementChannel = twitchSettings.announcement_channel_id
            ? `<#${twitchSettings.announcement_channel_id}>`
            : '❌ Не установлен';
          const twitchStatus = twitchSettings.is_live === 1 ? '🟢 В эфире' : '⚫ Оффлайн';

          embed.addFields(
            { name: '🎥 Twitch канал', value: `[${twitchChannel}](${twitchChannel})`, inline: true },
            { name: '📢 Канал уведомлений', value: twitchAnnouncementChannel, inline: true },
            { name: '📡 Статус', value: twitchStatus, inline: true }
          );
        }
      }

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('❌ Ошибка в /settingsinfo:', err);
      await interaction.reply({ 
        content: '❌ Произошла ошибка при получении настроек.',
        ephemeral: true 
      });
    }
  }
};
