import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import db from '../database/db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setwelcomename')
        .setDescription('Установить канал для приветствия')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Канал для приветствия')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');

        db.prepare(`
            INSERT INTO settings (guild_id, welcome_channel_id)
            VALUES (?, ?)
            ON CONFLICT(guild_id)
            DO UPDATE SET welcome_channel_id = excluded.welcome_channel_id
        `).run(interaction.guild.id, channel.id);

        await interaction.reply({
            content: `✅ Канал приветствия установлен: ${channel}`,
            ephemeral: true
        });
    }
};