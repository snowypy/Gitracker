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
        added: new Set(),
        modified: new Set(),
        removed: new Set()
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

        added.forEach(file => fileCategories.added.add(file));
        modified.forEach(file => fileCategories.modified.add(file));
        removed.forEach(file => fileCategories.removed.add(file));
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
    
    // [COLLECT FILE CHANGES]
    // This is used to collect the file changes for all commits.
    const allFileChanges = {};
    for (const commit of commits) {
        const fileChanges = await fetchCommitFiles(repo.owner.login, repo.name, commit.id);
        allFileChanges[commit.id] = fileChanges;
    }

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
        }
    };

    const embeds = [baseEmbed];
    
    // [BASE FIELDS]
    // This is used to add the bare bones to the embed..
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
    // This is used to list the commits in a readable format.
    const commitList = commits
        .map(commit => `[\`${commit.id.substring(0, 7)}\`](${commit.url}) ${commit.message.split('\n')[0]}`)
        .join('\n');

    baseEmbed.fields.push({
        name: `📋 Recent Commits (${commits.length})`,
        value: commitList || '_No commits available_',
        inline: false
    });

    // [FILE CATEGORIES]
    // This is used to categorize the files into different categories.
    
    const { fileCategories } = analyzeFiles(commits, allFileChanges);
    
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
            await axios.post(DISCORD_WEBHOOK_URL, { embeds: [embed] }, {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        console.info(`[INFO] Discord notification(s) sent successfully (${embeds.length} embeds).`);
    } catch (error) {
        console.error('Error processing webhook:', error);
    }
}

if (require.main === module) {
    runBotLogic();
}