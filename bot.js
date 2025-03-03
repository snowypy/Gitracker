const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const {
    DISCORD_WEBHOOK_URL,
    GITHUB_TOKEN,
    WEBHOOK_TITLE,
    WEBHOOK_COLOR,
    DENY_SPLITTING
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
    if (!language) return null;
    
    const fallbackLogo = 'https://avatars.githubusercontent.com/u/133208096?v=4';
    
    const logoUrl = `https://raw.githubusercontent.com/snowypy/Gitracker/refs/heads/master/assets/languages/${language}.png`;
    return axios.get(logoUrl)
        .then(() => logoUrl)
        .catch(() => fallbackLogo);
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

async function analyzeFiles(commits, allFileChanges) {
    const languageCounts = {};
    const fileCategories = {
        added: new Set(),
        modified: new Set(),
        removed: new Set()
    };

    commits.forEach(commit => {
        const { added = [], modified = [], removed = [] } = allFileChanges[commit.id] || {};
        [...added, ...modified].forEach(file => {
            const ext = file.split('.').pop().toLowerCase();
            if (languageExtensions[ext]) {
                languageCounts[ext] = (languageCounts[ext] || 0) + 1;
            }
        });

        added.forEach(file => fileCategories.added.add(file));
        modified.forEach(file => fileCategories.modified.add(file));
        removed.forEach(file => fileCategories.removed.add(file));
    });

    let mostUsedLang = {
        name: 'Unknown',
        logo: 'unknown',
        logoUrl: 'https://avatars.githubusercontent.com/u/133208096?v=4'
    };
    let maxCount = 0;
    
    for (const [ext, count] of Object.entries(languageCounts)) {
        if (count > maxCount) {
            maxCount = count;
            const langInfo = languageExtensions[ext];
            if (langInfo) {
                const logoUrl = await getLanguageLogoPath(langInfo.logo);
                mostUsedLang = {
                    name: langInfo.name,
                    logo: langInfo.logo,
                    logoUrl: logoUrl
                };
            }
        }
    }

    return {
        mostUsedLang,
        fileCategories: {
            added: Array.from(fileCategories.added),
            modified: Array.from(fileCategories.modified),
            removed: Array.from(fileCategories.removed)
        }
    };
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
    
    const allFileChanges = {};
    for (const commit of commits) {
        const fileChanges = await fetchCommitFiles(repo.owner.login, repo.name, commit.id);
        allFileChanges[commit.id] = fileChanges;
    }

    const { mostUsedLang, fileCategories } = await analyzeFiles(commits, allFileChanges);
    const lineChanges = await getCommitsLineChanges(repo.owner.login, repo.name, commits.map(c => c.id));
    
    const baseEmbed = {
        title: WEBHOOK_TITLE || `:sparkles: **Service Update Deployed!** :rocket:`,
        description: `**${commits.length}** new commit${commits.length > 1 ? 's' : ''} to **${repo.name}** by **${repo.owner.login}**`,
        color: WEBHOOK_COLOR || 0x1ABC9C,
        author: {
            name: commits[0].author.name,
            url: `https://github.com/${commits[0].author.username}`,
            icon_url: getGitHubUserAvatar(commits[0].author.username)
        },
        timestamp: new Date(commits[0].timestamp).toISOString(),
        footer: {
            text: `Latest Commit: ${commits[0].id.substring(0, 7)}`
        },
        thumbnail: {
            url: mostUsedLang.logoUrl || 'https://avatars.githubusercontent.com/u/133208096?v=4'
        }
    };

    const embeds = [baseEmbed];
    
    // [BASE FIELDS]
    baseEmbed.fields = [
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
    ];

    // [COMMIT LIST]
    const commitList = commits
        .map(commit => {
            const shortMessage = commit.message.split('\n')[0].substring(0, 100);
            return `[\`${commit.id.substring(0, 7)}\`](${commit.url}) ${shortMessage}${shortMessage.length > 100 ? '...' : ''}`;
        })
        .slice(0, 10)
        .join('\n');

    baseEmbed.fields.push({
        name: `📋 Recent Commits (${commits.length})`,
        value: commitList || '_No commits available_',
        inline: false
    });

    // [LINE CHANGES]
    if (lineChanges) {
        baseEmbed.fields.push({
            name: `💻 Line Changes (${lineChanges.totalChanges})`,
            value: `+${lineChanges.totalAdditions} new lines -${lineChanges.totalDeletions} removed lines`,
            inline: false
        });
    }

    // [FILE CATEGORIES]
    const fileCategoriesToProcess = [
        { name: '📝 Added Files', files: fileCategories.added },
        { name: '📝 Modified Files', files: fileCategories.modified },
        { name: '🗑️ Removed Files', files: fileCategories.removed }
    ];

    for (const category of fileCategoriesToProcess) {
        if (category.files.length === 0) continue;

        const formattedFiles = formatFileList(category.files);
        const fieldContent = {
            name: `${category.name} (${category.files.length})`,
            value: formattedFiles,
            inline: false
        };

        // [SPLITTING]
        // If the field is too long, it gets split into it's own embed.
        if (JSON.stringify([...baseEmbed.fields, fieldContent]).length < 1024) {
            baseEmbed.fields.push(fieldContent);
        } else {
            embeds.push({
                title: `${category.name} (${category.files.length})`,
                description: formattedFiles,
                color: baseEmbed.color
            });
        }
    }

    return { embeds };
}

function validateEmbed(embed) {
    const limits = {
        title: 256,
        description: 4096,
        fields: 25,
        field: {
            name: 256,
            value: 1024
        },
        footer: {
            text: 2048
        },
        author: {
            name: 256
        }
    };

    if (embed.title && embed.title.length > limits.title) {
        embed.title = embed.title.substring(0, limits.title - 3) + '...';
    }
    
    if (embed.description && embed.description.length > limits.description) {
        embed.description = embed.description.substring(0, limits.description - 3) + '...';
    }

    if (embed.fields && embed.fields.length > 0) {
        embed.fields = embed.fields.slice(0, limits.fields).map(field => ({
            name: field.name?.substring(0, limits.field.name) || 'Field',
            value: field.value?.substring(0, limits.field.value) || 'No content',
            inline: !!field.inline
        }));
    }

    return embed;
}

async function sendDiscordWebhook(embed) {
    try {
        const validatedEmbed = validateEmbed(embed);
        const payload = { embeds: [validatedEmbed] };
        
        if (JSON.stringify(payload).length > 6000) {
            console.warn('Payload too large, truncating content...');

            validatedEmbed.fields = validatedEmbed.fields?.slice(0, 5) || [];
        }

        const response = await axios.post(DISCORD_WEBHOOK_URL, payload, {
            headers: { 
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        if (error.response?.data) {
            console.error('Discord API Error:', {
                status: error.response.status,
                data: error.response.data,
                payload: embed
            });
        }
        throw error;
    }
}

async function runBotLogic() {
    try {
        const githubPayload = require(process.env.GITHUB_EVENT_PATH);
        console.debug('Running bot logic with GitHub payload:', githubPayload);

        if (!githubPayload.commits) {
            console.warn('Unsupported GitHub event type.');
            return;
        }

        const { embeds } = await createDiscordPayload(githubPayload);
        
        for (const embed of embeds) {
            await sendDiscordWebhook(embed);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.info(`[INFO] Discord notification(s) sent successfully (${embeds.length} embeds).`);
    } catch (error) {
        console.error('Error processing webhook:', error);
    }
}

if (require.main === module) {
    runBotLogic();
}