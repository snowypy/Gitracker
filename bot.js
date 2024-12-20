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
    return `https://raw.githubusercontent.com/snowypy/Gitracker/refs/heads/master/assets/languages/${language}.png`;
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
        console.debug(`Fetched stats for commit ${commitSha}:`, stats);
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

async function fetchCommitFiles(owner, repo, commitSha) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        const files = response.data.files;
        return {
            added: files.filter(file => file.status === 'added').map(file => file.filename),
            modified: files.filter(file => file.status === 'modified').map(file => file.filename),
            removed: files.filter(file => file.status === 'removed').map(file => file.filename),
        };
    } catch (error) {
        console.error('Error fetching commit files:', error.message);
        return { added: [], modified: [], removed: [] };
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
        } else {
            console.warn(`No commit stats found for ${commitSha}`);
        }
    }

    console.debug(`Total changes for ${repo.name}: +${totalAdditions}, -${totalDeletions}, total: ${totalChanges}`);
    return {
        totalAdditions,
        totalDeletions,
        totalChanges
    };
}

function analyzeFiles(commits, allFileChanges) {
    const languageCounts = {};
    const fileCategories = {
        added: [],
        modified: [],
        removed: []
    };

    commits.forEach(commit => {
        const { added, modified, removed } = allFileChanges[commit.id] || {};

        console.debug(`Analyzing commit ${commit.id}:`, { added, modified, removed });

        [...added, ...modified].forEach(file => {
            const ext = file.split('.').pop().toLowerCase();
            if (languageExtensions[ext]) {
                languageCounts[ext] = (languageCounts[ext] || 0) + 1;
            }
        });

        fileCategories.added.push(...added);
        fileCategories.modified.push(...modified);
        fileCategories.removed.push(...removed);
    });

    console.debug('Language counts:', languageCounts);
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

    console.debug(`Most used language:`, mostUsedLang);
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
    console.debug('Received GitHub payload:', { commits, repo });

    const allFileChanges = {};
    for (const commit of commits) {
        const fileChanges = await fetchCommitFiles(repo.owner.login, repo.name, commit.id);
        allFileChanges[commit.id] = fileChanges;
    }

    const { mostUsedLang, fileCategories } = analyzeFiles(commits, allFileChanges);
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
        name: `💻 Line Changes (${totalChanges})`,
        value: `+${totalAdditions} new lines -${totalDeletions} removed lines`,
        inline: false
    });

    console.debug('Constructed Discord embed payload:', embed);
    return { embeds: [embed] };
}

async function createIssuePayload(githubPayload) {
    const { issue, repository: repo } = githubPayload;
    console.debug('Received GitHub issue payload:', { issue, repo });

    const embed = {
        title: `:bug: **New Issue Created!** :beetle:`,
        description: `**${issue.title}**\n\n${issue.body}`,
        color: 0xE74C3C,
        author: {
            name: issue.user.login,
            url: `https://github.com/${issue.user.login}`,
            icon_url: getGitHubUserAvatar(issue.user.login)
        },
        fields: [
            {
                name: 'Repository',
                value: repo.full_name,
                inline: true
            },
            {
                name: 'Issue Number',
                value: `#${issue.number}`,
                inline: true
            }
        ],
        timestamp: new Date(issue.created_at).toISOString(),
        footer: {
            text: `Issue ID: ${issue.id}`
        }
    };

    console.debug('Constructed Discord issue payload:', embed);
    return { embeds: [embed] };
}

async function runBotLogic() {
    try {
        const githubPayload = require(process.env.GITHUB_EVENT_PATH);
        console.debug('Running bot logic with GitHub payload:', githubPayload);

        let discordPayload;
        if (githubPayload.commits) {
            discordPayload = await createDiscordPayload(githubPayload);
        } else if (githubPayload.issue) {
            discordPayload = await createIssuePayload(githubPayload);
        } else {
            console.warn('Unsupported GitHub event type.');
            return;
        }

        if (JSON.stringify(discordPayload).length >= 1024) {
            console.error('[ERROR] Discord payload exceeds 1024 characters. Splitting into multiple messages is not supported YET. Hiding Full File List for now.');
            discordPayload.embeds[0].fields = discordPayload.embeds[0].fields.filter(field => !field.name.includes('Files'));
        }

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