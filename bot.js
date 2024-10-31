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

const languageExtensions = {
    js: { name: 'JavaScript', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg' },
    ts: { name: 'TypeScript', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg' },
    py: { name: 'Python', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg' },
    java: { name: 'Java', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg' },
    cpp: { name: 'C++', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg' },
    cs: { name: 'C#', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/csharp/csharp-original.svg' },
    rb: { name: 'Ruby', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ruby/ruby-original.svg' },
    php: { name: 'PHP', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-original.svg' },
    go: { name: 'Go', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg' },
    rs: { name: 'Rust', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/rust/rust-plain.svg' },
    html: { name: 'HTML', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg' },
    css: { name: 'CSS', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg' },
    swift: { name: 'Swift', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/swift/swift-original.svg' },
    kt: { name: 'Kotlin', logo: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/kotlin/kotlin-original.svg' }
};

function verifyGitHubWebhook(req) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;

    const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
    const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

function analyzeFiles(commits) {
    const languageCounts = {};
    const fileCategories = {
        added: [],
        modified: [],
        removed: []
    };

    commits.forEach(commit => {
        [...commit.added, ...commit.modified].forEach(file => {
            const ext = file.split('.').pop().toLowerCase();
            if (languageExtensions[ext]) {
                languageCounts[ext] = (languageCounts[ext] || 0) + 1;
            }
        });

        commit.added.forEach(file => fileCategories.added.push(file));
        commit.modified.forEach(file => fileCategories.modified.push(file));
        commit.removed.forEach(file => fileCategories.removed.push(file));
    });

    let mostUsedLang = null;
    let maxCount = 0;
    Object.entries(languageCounts).forEach(([ext, count]) => {
        if (count > maxCount) {
            maxCount = count;
            mostUsedLang = languageExtensions[ext];
        }
    });

    return { mostUsedLang, fileCategories };
}

function formatFileList(files, limit = 10) {
    if (files.length === 0) return '_None_';

    const formatted = files.slice(0, limit)
        .map(file => `\`${file}\``)
        .join('\n');

    return files.length > limit
        ? `${formatted}\n_...and ${files.length - limit} more_`
        : formatted;
}

function createDiscordPayload(githubPayload) {
    const { commits } = githubPayload;
    const repo = githubPayload.repository;
    const { mostUsedLang, fileCategories } = analyzeFiles(commits);

    const embed = {
        title: `${commits.length} New Commit${commits.length > 1 ? 's' : ''} to ${repo.name}`,
        url: commits[0].url,
        color: 0x0099FF,
        author: {
            name: commits[0].author.name,
            url: `https://github.com/${commits[0].author.username}`
        },
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
            }
        ],
        timestamp: new Date(commits[0].timestamp).toISOString(),
        footer: {
            text: `Latest Commit: ${commits[0].id.substring(0, 7)}`
        }
    };

    if (mostUsedLang) {
        embed.thumbnail = {
            url: mostUsedLang.logo
        };
        embed.fields.push({
            name: 'Primary Language',
            value: mostUsedLang.name,
            inline: true
        });
    }

    if (commits.length > 1) {
        const commitList = commits
            .map(commit => `[\`${commit.id.substring(0, 7)}\`](${commit.url}) ${commit.message.split('\n')[0]}`)
            .join('\n');
        embed.description = commitList;
    } else {
        embed.description = commits[0].message;
    }

    if (fileCategories.added.length > 0) {
        embed.fields.push({
            name: `📝 Added Files (${fileCategories.added.length})`,
            value: formatFileList(fileCategories.added),
            inline: false
        });
    }

    if (fileCategories.modified.length > 0) {
        embed.fields.push({
            name: `📝 Modified Files (${fileCategories.modified.length})`,
            value: formatFileList(fileCategories.modified),
            inline: false
        });
    }

    if (fileCategories.removed.length > 0) {
        embed.fields.push({
            name: `🗑️ Removed Files (${fileCategories.removed.length})`,
            value: formatFileList(fileCategories.removed),
            inline: false
        });
    }

    return { embeds: [embed] };
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
                headers: { 'Content-Type': 'application/json' }
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