import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { botStats } from './botinfo.js';

const DEV_ID = '870408185620615212';

// Хранилище для консольных логов
const consoleLogs = [];

// Перехватчик консольных логов
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = function(...args) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  
  consoleLogs.push({
    type: 'log',
    message: message.slice(0, 1000), // Ограничиваем длину
    time: new Date().toLocaleString('ru-RU')
  });
  
  // Оставляем только последние 200 логов
  if (consoleLogs.length > 200) {
    consoleLogs.shift();
  }
  
  originalLog.apply(console, args);
};

console.error = function(...args) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  
  consoleLogs.push({
    type: 'error',
    message: message.slice(0, 1000),
    time: new Date().toLocaleString('ru-RU')
  });
  
  if (consoleLogs.length > 200) {
    consoleLogs.shift();
  }
  
  originalError.apply(console, args);
};

console.warn = function(...args) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  
  consoleLogs.push({
    type: 'warn',
    message: message.slice(0, 1000),
    time: new Date().toLocaleString('ru-RU')
  });
  
  if (consoleLogs.length > 200) {
    consoleLogs.shift();
  }
  
  originalWarn.apply(console, args);
};

export default {
  data: new SlashCommandBuilder()
    .setName('devlogbot')
    .setDescription('Отправить логи консоли в чат (только для разработчика)')
    .addIntegerOption(option =>
      option
        .setName('count')
        .setDescription('Количество последних логов (по умолчанию 20)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)
    ),

  async execute(interaction) {
    // Проверка ID разработчика
    if (interaction.user.id !== DEV_ID) {
      return await interaction.reply({
        content: '❌ У вас нет доступа к этой команде.',
        ephemeral: true
      });
    }

    const count = interaction.options.getInteger('count') || 20;
    
    if (consoleLogs.length === 0) {
      return await interaction.reply({
        content: '📭 Логи консоли пусты.',
        ephemeral: true
      });
    }

    // Получаем последние логи
    const recentLogs = consoleLogs.slice(-count);
    
    // Формируем текст логов
    const logText = recentLogs.map(log => {
      const icon = log.type === 'error' ? '❌' : log.type === 'warn' ? '⚠️' : '📄';
      return `[${log.time}] ${icon} ${log.message}`;
    }).join('\n');

    // Разбиваем на части если слишком длинно
    const MAX_LENGTH = 4000;
    
    if (logText.length <= MAX_LENGTH) {
      const embed = new EmbedBuilder()
        .setTitle('📋 Логи консоли')
        .setDescription(`\`\`\`\n${logText}\n\`\`\``)
        .setColor(0x95a5a6)
        .setFooter({ text: `Показано ${recentLogs.length} из ${consoleLogs.length} логов` });

      await interaction.reply({ embeds: [embed] });
    } else {
      // Отправляем первую часть
      const firstPart = logText.slice(0, MAX_LENGTH);
      const embed = new EmbedBuilder()
        .setTitle('📋 Логи консоли (часть 1)')
        .setDescription(`\`\`\`\n${firstPart}\n\`\`\``)
        .setColor(0x95a5a6)
        .setFooter({ text: `Всего логов: ${consoleLogs.length}` });

      await interaction.reply({ embeds: [embed] });

      // Отправляем оставшиеся части
      let remaining = logText.slice(MAX_LENGTH);
      let partNum = 2;
      
      while (remaining.length > 0 && partNum <= 5) {
        const part = remaining.slice(0, MAX_LENGTH);
        remaining = remaining.slice(MAX_LENGTH);
        
        const partEmbed = new EmbedBuilder()
          .setTitle(`📋 Логи консоли (часть ${partNum})`)
          .setDescription(`\`\`\`\n${part}\n\`\`\``)
          .setColor(0x95a5a6);

        await interaction.followUp({ embeds: [partEmbed] });
        partNum++;
      }
    }
  }
};

// Экспортируем логи для других модулей
export { consoleLogs };
