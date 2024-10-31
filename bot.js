const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const {
    GITHUB_WEBHOOK_SECRET,
    DISCORD_WEBHOOK_URL,
    PORT = 3000
} = process.env;

function verifyGitHubWebhook(req) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;

    const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
    const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

function createDiscordPayload(githubPayload) {
    const commit = githubPayload.commits[0];
    const repo = githubPayload.repository;

    return {
        embeds: [{
            title: `New Commit to ${repo.name}`,
            url: commit.url,
            color: 0x0099FF,
            author: {
                name: commit.author.name,
                url: `https://github.com/${commit.author.username}`
            },
            description: commit.message,
            fields: [
                {
                    name: 'Repository',
                    value: repo.full_name,
                    inline: true
                },
                {
                    name: 'Branch',
                    value: githubPayload.ref.replace('refs/heads/', ''),
                    inline: true
                },
                {
                    name: 'Files Changed',
                    value: `${commit.added.length + commit.modified.length + commit.removed.length}`,
                    inline: true
                }
            ],
            timestamp: new Date(commit.timestamp).toISOString(),
            footer: {
                text: `Commit ${commit.id.substring(0, 7)}`
            }
        }]
    };
}

app.post('/webhook', async (req, res) => {
    try {
        if (!verifyGitHubWebhook(req)) {
            return res.status(401).send('Invalid signature');
        }

        if (req.headers['x-github-event'] !== 'push') {
            return res.status(200).send('Event ignored');
        }

        if (req.body.commits && req.body.commits.length > 0) {
            const discordPayload = createDiscordPayload(req.body);

            await axios.post(DISCORD_WEBHOOK_URL, discordPayload, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        res.status(200).send('Webhook processed');
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send('Error processing webhook');
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
    console.log(`Webhook server listening on port ${PORT}`);
});