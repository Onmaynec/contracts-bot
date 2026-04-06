import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('roletable')
    .setDescription('Показать список участников роли')
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('Роль для просмотра участников')
        .setRequired(true)
    ),

  async execute(interaction) {
    const role = interaction.options.getRole('role');

    try {
      // Получаем всех участников с этой ролью
      const membersWithRole = role.members.map(member => {
        const status = member.presence?.status || 'offline';
        const statusEmoji = {
          'online': '🟢',
          'idle': '🌙',
          'dnd': '⛔',
          'offline': '⚫'
        }[status] || '⚫';
        
        return `${statusEmoji} ${member.displayName}`;
      });

      if (membersWithRole.length === 0) {
        return interaction.reply({
          content: `❌ В роли ${role} нет участников`,
          flags: MessageFlags.Ephemeral
        });
      }

      // Разбиваем на чанки по 25 участников (максимум для Embed)
      const chunkSize = 25;
      const chunks = [];
      for (let i = 0; i < membersWithRole.length; i += chunkSize) {
        chunks.push(membersWithRole.slice(i, i + chunkSize));
      }

      const embed = new EmbedBuilder()
        .setTitle(`👥 Участники роли ${role.name}`)
        .setColor(0xFFFF00) // Жёлтый цвет
        .setDescription(`Всего участников: **${membersWithRole.length}**`)
        .addFields(
          {
            name: 'Список участников',
            value: chunks[0].join('\n') || 'Нет участников'
          }
        )
        .setTimestamp();

      // Если участников больше 25, добавляем продолжение
      if (chunks.length > 1) {
        for (let i = 1; i < chunks.length; i++) {
          embed.addFields({
            name: `... (продолжение ${i + 1}/${chunks.length})`,
            value: chunks[i].join('\n')
          });
        }
      }

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });

    } catch (err) {
      console.error(err);
      return interaction.reply({
        content: '❌ Ошибка при получении списка участников',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
