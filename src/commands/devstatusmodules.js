import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEV_ID = '870408185620615212';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Список модулей для проверки
const modules = [
  { name: 'Commands', path: './commands', description: 'Команды бота' },
  { name: 'Events', path: './events', description: 'События бота' },
  { name: 'Database', path: './database/db.js', description: 'База данных SQLite' },
  { name: 'Utils', path: './utils', description: 'Утилиты' },
  { name: 'Services', path: './services', description: 'Сервисы' },
  { name: 'Components', path: './components', description: 'Компоненты (кнопки, модалки)' }
];

export default {
  data: new SlashCommandBuilder()
    .setName('devstatusmodules')
    .setDescription('Показать статус всех модулей бота'),

  async execute(interaction) {
    // 🔒 Только разработчик
    if (interaction.user.id !== DEV_ID) {
      return interaction.reply({
        content: '❌ Нет доступа',
        ephemeral: true
      });
    }

    const client = interaction.client;
    const statusResults = [];

    // Проверяем каждый модуль
    for (const module of modules) {
      const modulePath = path.join(__dirname, '..', module.path);
      
      try {
        let status = '❌ Не найден';
        let details = '';

        if (fs.existsSync(modulePath)) {
          const stats = fs.statSync(modulePath);
          
          if (stats.isDirectory()) {
            const files = fs.readdirSync(modulePath);
            const jsFiles = files.filter(f => f.endsWith('.js'));
            status = '✅ Активен';
            details = `${jsFiles.length} файлов`;
          } else {
            status = '✅ Активен';
            details = 'Файл доступен';
          }
        }

        statusResults.push({
          name: module.name,
          description: module.description,
          status,
          details
        });
      } catch (error) {
        statusResults.push({
          name: module.name,
          description: module.description,
          status: '❌ Ошибка',
          details: error.message
        });
      }
    }

    // Дополнительная информация о состоянии
    const additionalInfo = [
      {
        name: 'WebSocket',
        description: 'Подключение к Discord',
        status: client.ws.status === 0 ? '✅ Подключен' : '❌ Отключен',
        details: `Ping: ${client.ws.ping}мс`
      },
      {
        name: 'Commands Loaded',
        description: 'Загруженные команды',
        status: '✅ Активен',
        details: `${client.commands.size} команд`
      },
      {
        name: 'Guilds',
        description: 'Подключенные серверы',
        status: '✅ Активен',
        details: `${client.guilds.cache.size} серверов`
      }
    ];

    // Отправляем результаты по очереди
    await interaction.reply({
      content: '📊 Проверка статуса модулей...',
      ephemeral: true
    });

    // Основные модули
    for (const result of statusResults) {
      const embed = new EmbedBuilder()
        .setTitle(`📦 ${result.name}`)
        .setColor(result.status.startsWith('✅') ? 0x2ecc71 : 0xe74c3c)
        .addFields(
          { name: '📝 Описание', value: result.description, inline: false },
          { name: '📊 Статус', value: result.status, inline: true },
          { name: '🔍 Детали', value: result.details || 'Нет данных', inline: true }
        )
        .setTimestamp();

      await interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    // Дополнительная информация
    for (const info of additionalInfo) {
      const embed = new EmbedBuilder()
        .setTitle(`🔌 ${info.name}`)
        .setColor(info.status.startsWith('✅') ? 0x2ecc71 : 0xe74c3c)
        .addFields(
          { name: '📝 Описание', value: info.description, inline: false },
          { name: '📊 Статус', value: info.status, inline: true },
          { name: '🔍 Детали', value: info.details, inline: true }
        )
        .setTimestamp();

      await interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    // Итоговое сообщение
    const allOk = statusResults.every(r => r.status.startsWith('✅')) && 
                  additionalInfo.every(i => i.status.startsWith('✅'));
    
    const summaryEmbed = new EmbedBuilder()
      .setTitle('📋 Итог проверки')
      .setColor(allOk ? 0x2ecc71 : 0xe74c3c)
      .setDescription(allOk 
        ? '✅ Все модули работают корректно!' 
        : '⚠️ Некоторые модули требуют внимания')
      .setTimestamp();

    await interaction.followUp({ embeds: [summaryEmbed], ephemeral: true });
  }
};
