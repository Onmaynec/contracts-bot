import { startScheduler } from '../services/scheduler.js';

export default {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`Запущен как ${client.user.tag}`);
    
    // Запускаем планировщик задач
    startScheduler(client);
  }
};
