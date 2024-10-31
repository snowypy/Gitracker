// Required dependencies
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

app.use(express.json());

const {
    DISCORD_TOKEN,
    DISCORD_CHANNEL_ID,
    GITHUB_WEBHOOK_SECRET,
    PORT = 3000
} = process.env;

function verifyGitHubWebhook(req) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;

    const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
    const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

function createCommitEmbed(payload) {
    const commit = payload.commits[0];
    const repo = payload.repository;

    return new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`New Commit to ${repo.name}`)
        .setURL(commit.url)
        .setAuthor({
            name: commit.author.name,
            url: `https://github.com/${commit.author.username}`
        })
        .setDescription(commit.message)
        .addFields(
            { name: 'Repository', value: repo.full_name, inline: true },
            { name: 'Branch', value: payload.ref.replace('refs/heads/', ''), inline: true },
            { name: 'Files Changed', value: `${commit.added.length + commit.modified.length + commit.removed.length}`, inline: true }
        )
        .setTimestamp(new Date(commit.timestamp))
        .setFooter({ text: `Commit ${commit.id.substring(0, 7)}` });
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

app.post('/webhook', async (req, res) => {

    if (!verifyGitHubWebhook(req)) {
        return res.status(401).send('Invalid signature');
    }

    if (req.headers['x-github-event'] !== 'push') {
        return res.status(200).send('Event ignored');
    }

    try {
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);

        if (req.body.commits && req.body.commits.length > 0) {
            const embed = createCommitEmbed(req.body);
            await channel.send({ embeds: [embed] });
        }

        res.status(200).send('Webhook processed');
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send('Error processing webhook');
    }
});

client.login(DISCORD_TOKEN);
app.listen(PORT, () => {
    console.log(`Webhook server listening on port ${PORT}`);
});