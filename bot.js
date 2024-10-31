const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());

app.use('/assets', express.static(path.join(__dirname, 'assets')));

const {
    GITHUB_WEBHOOK_SECRET,
    DISCORD_WEBHOOK_URL,
    PORT = 3000,
    PUBLIC_URL = `http://dedi1.snowy.codes:${PORT}`,
    GITHUB_PAT,
} = process.env;

const languageExtensions = {
    js: { name: 'JavaScript', logo: 'javascript' },
    ts: { name: 'TypeScript', logo: 'typescript' },
    py: { name: 'Python', logo: 'python' },
    java: { name: 'Java', logo: 'java' },
    cpp: { name: 'C++', logo: 'cpp' },
    cs: { name: 'C#', logo: 'csharp' },
    rb: { name: 'Ruby', logo: 'ruby' },
    php: { name: 'PHP', logo: 'php' },
    go: { name: 'Go', logo: 'go' },
    rs: { name: 'Rust', logo: 'rust' },
    html: { name: 'HTML', logo: 'html' },
    css: { name: 'CSS', logo: 'css' },
    swift: { name: 'Swift', logo: 'swift' },
    kt: { name: 'Kotlin', logo: 'kotlin' }
};

function getGitHubUserAvatar(username) {
    return `https://github.com/${username}.png`;
}

function getLanguageLogoPath(language) {
    return `${PUBLIC_URL}/assets/languages/${language}.png`;
}

function verifyGitHubWebhook(req) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;

    const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
    const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

async function fetchCommitStats(owner, repo, commitSha) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `token ${GITHUB_PAT}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        const { stats } = response.data;
        return {
            additions: stats.additions,
            deletions: stats.deletions,
            totalChanges: stats.total
        };
    } catch (error) {
        console.error('Error fetching commit stats:', error);
        return null;
    }
}

async function getCommitsLineChanges(owner, repo, commitShas) {
    let totalAdditions = 0;
    let totalDeletions = 0;
    let totalChanges = 0;

    for (const commitSha of commitShas) {
        const commitStats = await fetchCommitStats(owner, repo, commitSha);
        if (commitStats) {
            totalAdditions += commitStats.additions;
            totalDeletions += commitStats.deletions;
            totalChanges += commitStats.totalChanges;
        }
    }

    return {
        totalAdditions,
        totalDeletions,
        totalChanges
    };
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
            mostUsedLang = {
                ...languageExtensions[ext],
                logoUrl: getLanguageLogoPath(languageExtensions[ext].logo)
            };
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

async function createDiscordPayload(githubPayload) {
    const { commits, repository: repo } = githubPayload;
    const { mostUsedLang, fileCategories } = analyzeFiles(commits);
    const authorUsername = commits[0].author.username;
    const avatarUrl = getGitHubUserAvatar(authorUsername);
    const { totalAdditions, totalDeletions, totalChanges } = await getCommitsLineChanges(
        repo.owner.login,
        repo.name,
        commits.map(commit => commit.id)
    );

    const embed = {
        title: `:partying_face: **Service Updated**`,
        description: '**${commits.length}** new commit${commits.length > 1 ? \'s\' : \'\'} to **${repo.name}** at ${repo.owner.login}',
        url: commits[0].url,
        color: 0x0099FF,
        author: {
            name: commits[0].author.name,
            url: `https://github.com/${authorUsername}`,
            icon_url: avatarUrl
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
            },
            {
                name: 'Most Used Language',
                value: mostUsedLang
                    ? `[${mostUsedLang.name}](${mostUsedLang.logoUrl})`
                    : '_None_',
                inline: true
            },
            {
                name: 'Total Additions',
                value: '${totalAdditions.toString()} new lines',
                inline: false
            },
            {
                name: 'Total Deletions',
                value: '${totalDeletions.toString()} lines removed',
                inline: false
            },
            {
                name: 'Total Changes',
                value: '${totalChanges.toString()} lines changed',
                inline: false
            }
        ],
        timestamp: new Date(commits[0].timestamp).toISOString(),
        footer: {
            text: `Latest Commit: ${commits[0].id.substring(0, 7)}`
        }
    };

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
            console.warn('[WARN] Invalid signature');
            return res.status(401).send('Invalid signature');
        }

        if (req.headers['x-github-event'] !== 'push') {
            console.warn('[WARN] Event ignored');
            return res.status(200).send('Event ignored');
        }

        if (req.body.commits && req.body.commits.length > 0) {
            const discordPayload = await createDiscordPayload(req.body);

            await axios.post(DISCORD_WEBHOOK_URL, discordPayload, {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        res.status(200).send('Webhook processed');
        console.info('[INFO] Webhook processed');
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send('Error processing webhook');
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
    console.error('[ERROR] Something broke!');
});

app.listen(PORT, () => {
    console.info(`[INFO] Webhook server listening on the ${PORT} port.`);
    console.info(`[INFO] Public URL: ${PUBLIC_URL}`);
});
