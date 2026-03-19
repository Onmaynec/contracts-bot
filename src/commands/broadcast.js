import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Рассылка обновления')
    .addStringOption(o =>
      o.setName('title')
        .setDescription('Заголовок')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('description')
        .setDescription('Описание')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('changes')
        .setDescription('Список изменений (каждое с новой строки)')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (interaction.user.id !== 'ТВОЙ_DISCORD_ID') {
      return interaction.reply({
        content: '❌ Нет доступа',
        ephemeral: true
      });
    }

    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const changesRaw = interaction.options.getString('changes');

    // превращаем список в формат embed
    const changes = changesRaw
      .split('\n')
      .map(line => `• ${line}`)
      .join('\n');

    await interaction.reply({
      content: '📡 Рассылка...',
      ephemeral: true
    });

    let success = 0;
    let failed = 0;

    const embed = new EmbedBuilder()
      .setTitle(`🚀 ${title}`)
      .setDescription(description)
      .addFields({
        name: '📌 Изменения',
        value: changes
      })
      .setColor(0x00ff99)
      .setFooter({ text: 'MorzContract' })
      .setTimestamp();

    for (const guild of interaction.client.guilds.cache.values()) {
      try {
        const channel = guild.systemChannel;

        if (
          !channel ||
          !channel.permissionsFor(guild.members.me).has('SendMessages')
        ) {
          failed++;
          continue;
        }

        await channel.send({ embeds: [embed] });
        success++;
      } catch {
        failed++;
      }
    }

    await interaction.editReply({
      content: `✅ Готово\nУспешно: ${success}\nОшибки: ${failed}`
    });
  }
};