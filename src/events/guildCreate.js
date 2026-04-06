export default {
  name: 'guildCreate',
  async execute(guild) {
    const channel = guild.systemChannel;
    if (channel) {
      channel.send('Привет! Настрой бота через /settings');
    }
  }
};
