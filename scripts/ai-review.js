import { setFailed, info } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { OpenAI } from 'openai';
import simpleGit from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'child_process';
import { encoding_for_model } from '@dqbd/tiktoken';

// Add this at the top of ai-review.js after imports

// Detect if running locally
const isLocal = !process.env.GITHUB_ACTIONS;

const model = 'gpt-4-turbo';

const encoding = encoding_for_model(model);

const maxTokens = 8192;
const reserveForResponse = 1024;
const promptBudget = maxTokens - reserveForResponse;

/**
 * Returns number of tokens in a string
 */
function countTokens(str) {
  return encoding.encode(str).length;
}

/**
 * Builds a token-aware chunk from file contents
 */
function buildPromptChunk(fileMap) {
  const includedFiles = [];
  let promptText = '';
  let currentTokens = 0;

  for (const [filename, content] of Object.entries(fileMap)) {
    const fileText = `\n--- FILE: ${filename} ---\n${content}\n`;
    const fileTokens = countTokens(fileText);

    if (currentTokens + fileTokens > promptBudget) {
      console.log(`Stopping before adding: ${filename} — would exceed budget`);
      break;
    }

    promptText += fileText;
    currentTokens += fileTokens;
    includedFiles.push(filename);
  }

  return {
    prompt: promptText,
    tokensUsed: currentTokens,
    filesIncluded: includedFiles
  };
}

// Setup environment for local development
if (isLocal) {
  // Load .env file if it exists
  try {
    const dotenv = await import('dotenv');
    dotenv.config();
  } catch (e) {
    console.log('Note: dotenv not installed. Using environment variables only.');
  }

  // Mock GitHub context for local testing
  if (!process.env.GITHUB_TOKEN) {
    console.error('ERROR: GITHUB_TOKEN environment variable is required');
    console.log('\nTo run locally:');
    console.log('1. Create a .env file with:');
    console.log('   GITHUB_TOKEN=your_github_personal_access_token');
    console.log('   OPENAI_API_KEY=your_openai_api_key');
    console.log('   GITHUB_REPOSITORY=owner/repo');
    console.log('\n2. Or export them in your shell:');
    console.log('   export GITHUB_TOKEN=...');
    console.log('   export OPENAI_API_KEY=...');
    process.exit(1);
  }
}

// Helper function to get context whether local or in Actions
function getContext() {
  if (isLocal) {
    // Parse repository from command line or env
    const repoArg = process.argv.find(arg => arg.startsWith('--repo='));
    const repository = repoArg ? repoArg.split('=')[1] : process.env.GITHUB_REPOSITORY;

    if (!repository || !repository.includes('/')) {
      console.error('ERROR: Repository must be specified as owner/repo');
      console.log('Use: --repo=owner/repo or set GITHUB_REPOSITORY env var');
      process.exit(1);
    }

    const [owner, repo] = repository.split('/');

    // Check if we're reviewing a specific PR
    const prArg = process.argv.find(arg => arg.startsWith('--pr='));
    const prNumber = prArg ? parseInt(prArg.split('=')[1]) : null;

    return {
      isLocal: true,
      owner,
      repo,
      prNumber,
      repository: { owner: { login: owner }, name: repo },
      payload: prNumber ? { pull_request: { number: prNumber } } : {}
    };
  }

  // In GitHub Actions, use the real context
  return {
    isLocal: false,
    owner: context.repo.owner,
    repo: context.repo.repo,
    prNumber: context.payload.pull_request?.number,
    repository: context.payload.repository,
    payload: context.payload
  };
}


const MODE = process.argv.includes('--mode=deep') ? 'deep' : 'light';
const SITE_DIR = (arg => {
  const f = process.argv.find(a => a.startsWith('--siteDir='));
  return f ? f.split('=')[1] : '.';
})();
const CREATE_PR = process.argv.includes('--create-pr');

const SYSTEM_PROMPT = `
You are an expert reviewer for static sites built with HTML, JSON data files, and Alpine.js.
Return a concise, actionable report with bullet points and clear headings.
When citing, include file and approximate line numbers if present.

Prioritize (in order):
1) Correctness & Safety (broken markup, Alpine directives/x-data, event handling, security: unsafe HTML injection).
2) Accessibility (semantic HTML, labels, contrast cues, keyboard nav, aria-* sanity).
3) Performance for static sites (critical CSS, image sizes, caching hints, script weight, render-blocking, LCP/CLS risk).
4) SEO basics for static (unique titles, meta, canonical, headings structure, alt text).
5) JSON integrity (structure, null/undefined handling; propose schemas; call out content pitfalls).
6) Authoring quality in visible text (spelling/grammar/style) — be brief, suggest edits.
7) Release checklist (for deep mode only): sitemaps/robots, link integrity, 404s, hreflang (if any), Lighthouse/LCP notes.

Output sections (always in this order):
- Summary
- Critical Issues
- Accessibility
- Performance
- SEO
- JSON/Data
- Content (Spelling/Grammar)
- Release Checklist (only include in deep mode)
- Suggested Fixes (short, concrete patch suggestions)
`;

function readIfExists(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

async function gatherPrDiff(octokit, owner, repo, prNumber, maxChars = 45000) {
  const { data: files } = await octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber });
  let bundle = '';
  for (const f of files) {
    if (!['added', 'modified', 'renamed'].includes(f.status)) continue;
    if (!f.patch) continue;
    if (!/\.(html?|json|md|js|css)$/i.test(f.filename)) continue; // focus
    const header = `\n\n--- FILE: ${f.filename} (${f.status}) ---\n`;
    if ((bundle + header + f.patch).length > maxChars) break;
    bundle += header + f.patch;
  }
  return bundle;
}

function collectContextFiles(root = '.', maxFiles = 10) {
  const extensionsToInclude = ['.html', '.json', '.js', '.css', '.yml', '.yaml', '.md', '.txt', '.xml'];
  const foldersToIgnore = ['node_modules', '.git', 'build'];
  const specificFiles = ['package.json', 'README.md', 'robots.txt', 'sitemap.xml', 'index.html'];
  const reviewDataFile = path.join(root, '.github', 'ai-review-history.json');
  let currentTokens = 0;
  console.log(`Collecting context files from ${root}`);

  // Load review history
  let reviewHistory = {};
  try {
    const data = fs.readFileSync(reviewDataFile, 'utf8');
    reviewHistory = JSON.parse(data);
  } catch (err) {
    // File doesn't exist or is invalid, start fresh
    console.warn(`Error reading file ${reviewHistory}:`, err.message);
    reviewHistory = {};
  }

  const files = [];

  function walkDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        console.log(`Checking: ${fullPath}`);

        const relativePath = path.relative(root, fullPath);

        if (entry.isDirectory()) {
          // Skip ignored folders
          if (!foldersToIgnore.includes(entry.name)) {
            walkDir(fullPath);
          }
          else {
            console.log(`Skipping ignored folder: ${fullPath}`);
          }
        } else {
          // Include specific files or files with allowed extensions
          const fileName = path.basename(fullPath);
          const ext = path.extname(fullPath).toLowerCase();

          if (specificFiles.includes(fileName) || extensionsToInclude.includes(ext)) {
            const stats = fs.statSync(fullPath);
            files.push({
              path: relativePath,
              modifiedTime: stats.mtime.getTime(),
              lastReviewed: reviewHistory[relativePath] || 0  // 0 if never reviewed
            });
          }
          else {
            console.log(`Skipping file: ${fullPath} (not in specific files or allowed extensions)`);
          }
        }
      }
    } catch (err) {
      console.warn(`Error reading directory ${dir}:`, err.message);
    }
  }

  walkDir(root);

  // Sort files by priority:
  // 1. Never reviewed files (lastReviewed === 0)
  // 2. Files reviewed longest ago
  files.sort((a, b) => {
    if (a.lastReviewed === 0 && b.lastReviewed !== 0) return -1;
    if (a.lastReviewed !== 0 && b.lastReviewed === 0) return 1;
    return a.lastReviewed - b.lastReviewed;
  });

  // Take only the top N files
  const filesToReview = files.slice(0, maxFiles);

  // Read and format the files
  const parts = [];
  const reviewedFiles = [];

  for (const fileInfo of filesToReview) {
    const fullPath = path.join(root, fileInfo.path);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content) {
        const fileTokens = countTokens(content);

        if (currentTokens + fileTokens > promptBudget) {
          console.log(`Stopping before adding: ${fileInfo.path} — would exceed budget`);
          break;
        }
        const displayPath = fileInfo.path.replace(/\\/g, '/');
        parts.push(`\n--- CONTEXT FILE: ${displayPath} ---\n${content}`);
        reviewedFiles.push(fileInfo.path);

        currentTokens += fileTokens;
      }
    } catch (err) {
      console.warn(`Error reading file ${fullPath}:`, err.message);
    }
  }

  // Update review history for files we just reviewed
  const now = Date.now();
  for (const filePath of reviewedFiles) {
    reviewHistory[filePath] = now;
  }

  // Save updated review history
  try {
    fs.writeFileSync(reviewDataFile, JSON.stringify(reviewHistory, null, 2));
    console.log(`Updated review history for ${reviewedFiles.length} files`);
  } catch (err) {
    console.error(`Error saving review history:`, err.message);
  }

  return parts.join('\n');
}

async function runLightPRReview() {
  const { Octokit } = require('@octokit/rest');
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
  });

  // Get PR context from GitHub environment variables
  const context = {
    owner: process.env.GITHUB_REPOSITORY_OWNER,
    repo: process.env.GITHUB_REPOSITORY.split('/')[1],
    pull_number: process.env.GITHUB_EVENT_NAME === 'pull_request'
      ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request.number
      : null
  };

  if (!context.pull_number) {
    console.log('Not a PR, skipping review');
    return;
  }

  // Get files changed in the PR
  const { data: files } = await octokit.pulls.listFiles({
    owner: context.owner,
    repo: context.repo,
    pull_number: context.pull_number
  });

  // Filter for files we care about
  const extensionsToReview = ['.js', '.html', '.css', '.json', '.md'];
  const filesToReview = files.filter(file =>
    extensionsToReview.some(ext => file.filename.endsWith(ext))
  );

  if (filesToReview.length === 0) {
    console.log('No relevant files to review');
    return;
  }

  // Collect the changes
  const changes = [];
  for (const file of filesToReview) {
    // Get the file content
    const { data: content } = await octokit.repos.getContent({
      owner: context.owner,
      repo: context.repo,
      path: file.filename,
      ref: context.pull_number ? `pull/${context.pull_number}/head` : 'main'
    });

    const fileContent = Buffer.from(content.content, 'base64').toString('utf8');

    changes.push({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch,  // The actual diff
      content: fileContent.slice(0, 4000)  // Current content (truncated)
    });
  }

  // Create a focused prompt for PR review
  const prompt = `Review these PR changes and provide actionable feedback:

${changes.map(file => `
File: ${file.filename} (${file.status})
Changes: +${file.additions} -${file.deletions}
Diff:
${file.patch || 'Binary file'}

Current content preview:
${file.content}
`).join('\n---\n')}

Provide:
1. Any bugs or issues you spot
2. Code quality improvements
3. Security concerns
4. Performance suggestions

Keep feedback constructive and specific to the changes made.`;

  // Call OpenAI once
  const reviewComments = await callOpenAI(prompt);

  // Post as a PR comment
  await octokit.issues.createComment({
    owner: context.owner,
    repo: context.repo,
    issue_number: context.pull_number,
    body: `## 🤖 AI Review\n\n${reviewComments}`
  });

  console.log('PR review posted successfully');
}

async function main() {
  const ctx = getContext();
  const isPR = !!ctx.prNumber;

  // Use regular Octokit for local, getOctokit for Actions
  const { Octokit } = await import('@octokit/rest');
  const octokit = isLocal
    ? new Octokit({ auth: process.env.GITHUB_TOKEN })
    : getOctokit(process.env.GITHUB_TOKEN);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log(`Running AI review in ${MODE} mode`);
  console.log(`Repository: ${ctx.owner}/${ctx.repo}`);
  console.log(`Mode: ${isPR ? 'PR' : 'release'} review`);
  console.log(`Environment: ${isLocal ? 'local' : 'GitHub Actions'}`);

  if (isPR && isLocal) {
    console.log(`Reviewing PR #${ctx.prNumber}`);
  }

  let userPrompt = '';

  if (isPR) {
    const diff = await gatherPrDiff(octokit, ctx.owner, ctx.repo, ctx.prNumber, MODE === 'light' ? 45000 : 120000);
    if (!diff) {
      console.log('No relevant diff found.');
      return;
    }

    const contextFiles = MODE === 'deep' ? collectContextFiles(SITE_DIR) : '';
    userPrompt = `Mode: ${MODE.toUpperCase()}
Review this PR diff (focus on HTML/JSON/Alpine.js). ${MODE === 'light' ? 'Be brief.' : 'Be thorough.'}

DIFF:
${diff}

${contextFiles ? `\nPROJECT CONTEXT (snippets):\n${contextFiles}` : ''}

If you flag issues, propose concrete, minimal patches.
For Alpine.js, check x-data/x-bind/x-on for reactivity and event safety.
`;
  } else {
    // Tag/release deep scan
    const contextFiles = collectContextFiles(SITE_DIR);
    const linkReport = readIfExists('link-report.json');
    const htmlValidate = readIfExists('htmlvalidate.json');
    const lhSummary = readIfExists('.lighthouseci/lhr-*.json') || '';

    userPrompt = `Mode: ${MODE.toUpperCase()}
This is a release deep review for a static site (HTML + JSON + Alpine.js).
Use the reports below to ground findings and propose fixes.

PROJECT CONTEXT:
${contextFiles}

LINK CHECK (JSON):
${linkReport.slice(0, 20000)}

HTML VALIDATE (JSON):
${htmlValidate.slice(0, 20000)}

LIGHTHOUSE (if present):
${lhSummary.slice(0, 15000)}
`;
  }

  console.log('\nCalling OpenAI API...');
  const resp = await openai.chat.completions.create({
    model: model,
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ]
  });

  const reviewBody = resp.choices[0].message.content?.trim() || '(no output)';
  const title = MODE === 'light' ? '💡 AI Light Review' : '🛠️ AI Deep Release Review';

  if (isLocal) {
    // For local testing, output to console
    console.log('\n' + '='.repeat(80));
    console.log(title);
    console.log('='.repeat(80));
    console.log(reviewBody);
    console.log('='.repeat(80) + '\n');

    if (isPR) {
      console.log('\nTo post this review to GitHub, add --post flag');

      if (process.argv.includes('--post')) {
        await octokit.rest.issues.createComment({
          owner: ctx.owner,
          repo: ctx.repo,
          issue_number: ctx.prNumber,
          body: `### ${title}\n${reviewBody}`
        });
        console.log(`✓ Review posted to PR #${ctx.prNumber}`);
      }
    } else {
      console.log('\nTo create an issue with this review, add --post flag');

      if (process.argv.includes('--post')) {
        const issue = await octokit.rest.issues.create({
          owner: ctx.owner,
          repo: ctx.repo,
          title: `${title} · ${new Date().toISOString()}`,
          body: reviewBody
        });
        console.log(`✓ Issue created: #${issue.data.number}`);
      }
    }
  } else {
    // In GitHub Actions, post directly
    if (ctx.prNumber) {
      await octokit.rest.issues.createComment({
        owner: ctx.owner,
        repo: ctx.repo,
        issue_number: ctx.prNumber,
        body: `### ${title}\n${reviewBody}`
      });
    } else {
      // Handle CREATE_PR logic for Actions...
      // (keep existing CREATE_PR code here)
    }
  }

  console.log(`${MODE} review completed.`);
}

// Update error handling
if (isLocal) {
  main().catch(err => {
    console.error('ERROR:', err.message || String(err));
    process.exit(1);
  });
} else {
  main().catch(err => setFailed(err.message || String(err)));
}