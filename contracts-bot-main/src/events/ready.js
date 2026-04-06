export default {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`Запущен как ${client.user.tag}`);
  }
};