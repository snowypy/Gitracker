const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const {
    GITHUB_WEBHOOK_SECRET,
    DISCORD_WEBHOOK_URL,
    GITHUB_TOKEN
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
    md: { name: 'Markdown', logo: 'markdown' },
    css: { name: 'CSS', logo: 'css' },
    swift: { name: 'Swift', logo: 'swift' },
    kt: { name: 'Kotlin', logo: 'kotlin' }
};

function getGitHubUserAvatar(username) {
    return `https://github.com/${username}.png`;
}

function getLanguageLogoPath(language) {
    return `https://raw.githubusercontent.com/snowypy/gitracker/assets/languages/${language}.png`;
}

async function fetchCommitStats(owner, repo, commitSha) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
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
        console.error('Error fetching commit stats:', error.message);
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
        title: `:sparkles: **Service Update Deployed!** :rocket:`,
        description: `**${commits.length}** new commit${commits.length > 1 ? 's' : ''} to **${repo.name}** by **${repo.owner.login}**`,
        color: 0x1ABC9C,
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
            }
        ],
        timestamp: new Date(commits[0].timestamp).toISOString(),
        footer: {
            text: `Latest Commit: ${commits[0].id.substring(0, 7)}`
        }
    };

    if (mostUsedLang) {
        embed.thumbnail = {
            url: mostUsedLang.logoUrl
        };
        embed.fields.push({
            name: 'Primary Language',
            value: mostUsedLang.name,
            inline: true
        });
    }

    const commitList = commits
        .map(commit => `[\`${commit.id.substring(0, 7)}\`](${commit.url}) ${commit.message.split('\n')[0]}`)
        .join('\n');

    embed.fields.push({
        name: `📋 Recent Commits (${commits.length})`,
        value: commitList || '_No commits available_',
        inline: false
    });

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

    embed.fields.push({
        name: `💻 Line Changes (${totalAdditions + totalDeletions + totalChanges})`,
        value: `+**${totalAdditions}** -${totalDeletions} ~${totalChanges}`,
        inline: false
    });

    return { embeds: [embed] };
}

async function runBotLogic() {
    try {
        const githubPayload = require(process.env.GITHUB_EVENT_PATH);
        const discordPayload = await createDiscordPayload(githubPayload);
        await axios.post(DISCORD_WEBHOOK_URL, discordPayload, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.info('[INFO] Discord notification sent successfully.');
    } catch (error) {
        console.error('Error processing webhook:', error);
    }
}

if (require.main === module) {
    runBotLogic();
}
