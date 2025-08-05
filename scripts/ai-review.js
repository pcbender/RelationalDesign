import { setFailed, info } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { OpenAI } from 'openai';
import simpleGit from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'child_process';
import { encoding_for_model } from '@dqbd/tiktoken';

// Configuration
const MODE = process.argv.includes('--mode=deep') ? 'deep' : 'light';
const SITE_DIR = (() => {
  const f = process.argv.find(a => a.startsWith('--siteDir='));
  return f ? f.split('=')[1] : '.';
})();
const CREATE_PR = process.argv.includes('--create-pr');
const isLocal = !process.env.GITHUB_ACTIONS;

// Model configuration
const model = 'gpt-4-turbo';
const encoding = encoding_for_model(model);
const maxTokens = 32768; // Max tokens for gpt-4-turbo
const reserveForResponse = 1024;
const promptBudget = maxTokens - reserveForResponse;

// System prompt
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

// Setup environment for local development
if (isLocal) {
  // Load .env file if it exists
  try {
    const dotenv = await import('dotenv');
    dotenv.config();
  } catch (e) {
    console.log('Note: dotenv not installed. Using environment variables only.');
  }

  // Check for required environment variables
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

// Utility functions
function readIfExists(p) { 
  try { 
    return fs.readFileSync(p, 'utf8'); 
  } catch { 
    return ''; 
  } 
}

function countTokens(str) {
  return encoding.encode(str).length;
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

// Gather PR diff
async function gatherPrDiff(octokit, owner, repo, prNumber, maxChars = 45000) {
  const { data: files } = await octokit.rest.pulls.listFiles({ 
    owner, 
    repo, 
    pull_number: prNumber 
  });
  
  let bundle = '';
  for (const f of files) {
    if (!['added', 'modified', 'renamed'].includes(f.status)) continue;
    if (!f.patch) continue;
    if (!/\.(html?|json|md|js|css)$/i.test(f.filename)) continue;
    
    const header = `\n\n--- FILE: ${f.filename} (${f.status}) ---\n`;
    if ((bundle + header + f.patch).length > maxChars) break;
    bundle += header + f.patch;
  }
  return bundle;
}

// Collect context files with token budget
function collectContextFiles(root = '.', maxFiles = 10) {
  const extensionsToInclude = ['.html', '.json', '.js', '.css', '.yml', '.yaml', '.md', '.txt', '.xml'];
  const foldersToIgnore = ['node_modules', '.git', 'build'];
  const specificFiles = ['package.json', 'README.md', 'robots.txt', 'sitemap.xml', 'index.html'];
  
  // Use different history files for local vs GitHub Actions
  const historyFileName = isLocal ? 'ai-review-history-local.json' : 'ai-review-history.json';
  const reviewDataFile = path.join(root, '.github', historyFileName);
  let currentTokens = 0;
  
  console.log(`Collecting context files from ${root}`);

  // Load review history
  let reviewHistory = {};
  try {
    const data = fs.readFileSync(reviewDataFile, 'utf8');
    reviewHistory = JSON.parse(data);
  } catch (err) {
    console.log('No review history found, starting fresh');
    reviewHistory = {};
  }

  const files = [];

  function walkDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(root, fullPath);

        if (entry.isDirectory()) {
          if (!foldersToIgnore.includes(entry.name)) {
            walkDir(fullPath);
          }
        } else {
          const fileName = path.basename(fullPath);
          const ext = path.extname(fullPath).toLowerCase();

          // Check if file should be excluded
          const shouldExclude = excludeFiles.some(pattern => {
            if (pattern.includes('*')) {
              // Simple wildcard matching
              const regex = new RegExp(pattern.replace(/\*/g, '.*'));
              return regex.test(fileName);
            }
            return fileName === pattern;
          });

          if (!shouldExclude && 
              (specificFiles.includes(fileName) || extensionsToInclude.includes(ext))) {
            const stats = fs.statSync(fullPath);
            files.push({
              path: relativePath,
              modifiedTime: stats.mtime.getTime(),
              lastReviewed: reviewHistory[relativePath] || 0
            });
          }
        }
      }
    } catch (err) {
      console.warn(`Error reading directory ${dir}:`, err.message);
    }
  }

  walkDir(root);

  // Sort files by priority
  files.sort((a, b) => {
    if (a.lastReviewed === 0 && b.lastReviewed !== 0) return -1;
    if (a.lastReviewed !== 0 && b.lastReviewed === 0) return 1;
    return a.lastReviewed - b.lastReviewed;
  });

  // Build token-aware content
  const parts = [];
  const reviewedFiles = [];

  for (const fileInfo of files.slice(0, maxFiles)) {
    const fullPath = path.join(root, fileInfo.path);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content) {
        const fileText = `\n--- CONTEXT FILE: ${fileInfo.path.replace(/\\/g, '/')} ---\n${content}`;
        const fileTokens = countTokens(fileText);

        if (currentTokens + fileTokens > promptBudget) {
          console.log(`Stopping before adding: ${fileInfo.path} — would exceed token budget`);
          break;
        }
        
        parts.push(fileText);
        reviewedFiles.push(fileInfo.path);
        currentTokens += fileTokens;
      }
    } catch (err) {
      console.warn(`Error reading file ${fullPath}:`, err.message);
    }
  }

  // Update review history
  const now = Date.now();
  for (const filePath of reviewedFiles) {
    reviewHistory[filePath] = now;
  }

  try {
    // Ensure .github directory exists
    const githubDir = path.join(root, '.github');
    if (!fs.existsSync(githubDir)) {
      fs.mkdirSync(githubDir, { recursive: true });
    }
    
    fs.writeFileSync(reviewDataFile, JSON.stringify(reviewHistory, null, 2));
    console.log(`Updated review history for ${reviewedFiles.length} files in ${historyFileName}`);
  } catch (err) {
    console.error(`Error saving review history:`, err.message);
  }

  console.log(`Collected ${reviewedFiles.length} files using ${currentTokens} tokens`);
  return parts.join('\n');
}

// Helper to collect all files (for deep review)
function collectAllRepoFiles(root = '.', maxFiles = 100) {
  const extensionsToInclude = ['.html', '.js', '.css', '.json', '.md', '.yml', '.yaml'];
  const foldersToIgnore = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
  const excludeFiles = [
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '.env',
    '.env.local',
    '*.min.js',
    '*.min.css',
    '*.map',
    'ai-review-history.json',
    'ai-review-history-local.json'
  ];
  const files = [];
  
  function walkDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(root, fullPath);
        
        if (entry.isDirectory()) {
          if (!foldersToIgnore.includes(entry.name)) {
            walkDir(fullPath);
          }
        } else {
          const ext = path.extname(fullPath).toLowerCase();
          const fileName = path.basename(fullPath);
          
          // Check if file should be excluded
          const shouldExclude = excludeFiles.some(pattern => {
            if (pattern.includes('*')) {
              // Simple wildcard matching
              const regex = new RegExp(pattern.replace(/\*/g, '.*'));
              return regex.test(fileName);
            }
            return fileName === pattern;
          });
          
          if (!shouldExclude && extensionsToInclude.includes(ext)) {
            files.push(relativePath);
          }
        }
        
        if (files.length >= maxFiles) return;
      }
    } catch (err) {
      console.warn(`Error reading directory ${dir}:`, err.message);
    }
  }
  
  walkDir(root);
  return files.slice(0, maxFiles);
}

// Branch management helpers
async function createBranch(octokit, branchName, baseBranch = 'main') {
  const ctx = getContext();
  
  try {
    // Get the SHA of the base branch
    const { data: refData } = await octokit.rest.git.getRef({
      owner: ctx.owner,
      repo: ctx.repo,
      ref: `heads/${baseBranch}`
    });
    
    const baseSha = refData.object.sha;
    
    // Create the new branch
    await octokit.rest.git.createRef({
      owner: ctx.owner,
      repo: ctx.repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha
    });
    
    console.log(`Created branch: ${branchName} from ${baseBranch}`);
  } catch (error) {
    if (error.status === 422) {
      console.log(`Branch ${branchName} already exists`);
    } else {
      throw error;
    }
  }
}

async function commitAndPushChanges(branchName, fixSummaries) {
  const git = simpleGit();
  
  try {
    await git.checkout(branchName);
    await git.add('.');
    
    const commitMessage = `🤖 AI Deep Review Fixes

Fixed ${fixSummaries.length} files:
${fixSummaries.join('\n')}`;
    
    await git.commit(commitMessage);
    await git.push('origin', branchName);
    
    console.log(`Pushed changes to ${branchName}`);
  } catch (error) {
    console.error('Error committing changes:', error);
    throw error;
  }
}

// Extraction helpers
function extractFixedContent(response) {
  const match = response.match(/FIXED_CONTENT:\s*\n([\s\S]*?)(?=\nSUMMARY:|$)/);
  return match ? match[1].trim() : null;
}

function extractSummary(response) {
  const match = response.match(/SUMMARY:\s*\n(.*?)(?:\n|$)/);
  return match ? match[1].trim() : 'Fixed issues';
}

// Light PR Review (for PR events)
async function runLightPRReview() {
  const ctx = getContext();
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  if (!ctx.prNumber) {
    console.log('Not a PR, skipping review');
    return;
  }

  // Get files changed in the PR
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner: ctx.owner,
    repo: ctx.repo,
    pull_number: ctx.prNumber
  });

  // Filter for relevant files
  const extensionsToReview = ['.js', '.html', '.css', '.json', '.md'];
  const filesToReview = files.filter(file =>
    extensionsToReview.some(ext => file.filename.endsWith(ext))
  );

  if (filesToReview.length === 0) {
    console.log('No relevant files to review');
    return;
  }

  // Build the diff content
  const diff = await gatherPrDiff(octokit, ctx.owner, ctx.repo, ctx.prNumber);
  
  const prompt = `Review these PR changes and provide actionable feedback:

${diff}

Focus on:
1. Any bugs or issues
2. Code quality improvements
3. Security concerns
4. Performance suggestions

Keep feedback constructive and specific to the changes made.`;

  // Call OpenAI
  console.log('Calling OpenAI API for PR review...');
  const response = await openai.chat.completions.create({
    model: model,
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]
  });

  const reviewBody = response.choices[0].message.content?.trim() || '(no output)';

  // Post as PR comment
  await octokit.rest.issues.createComment({
    owner: ctx.owner,
    repo: ctx.repo,
    issue_number: ctx.prNumber,
    body: `## 🤖 AI Light Review\n\n${reviewBody}`
  });

  console.log('PR review posted successfully');
}

// Deep Review (creates fixes)
async function runDeepReview() {
  const ctx = getContext();
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  console.log('Starting deep review of entire repository...');
  
  // Determine base branch
  const baseBranch = process.env.BASE_BRANCH || 'main';
  
  // Create feature branch
  const branchName = `feature/ai-fixes-${new Date().toISOString().split('T')[0]}`;
  await createBranch(octokit, branchName, baseBranch);
  
  // Collect all files
  const files = collectAllRepoFiles(SITE_DIR, 100);
  
  let fixCount = 0;
  const fixSummaries = [];
  
  // Review and fix each file
  for (const filePath of files) {
    console.log(`Reviewing ${filePath}...`);
    
    const content = fs.readFileSync(path.join(SITE_DIR, filePath), 'utf8');
    
    const prompt = `Review this file and provide the complete fixed version if there are any issues.
    
File: ${filePath}
Content:
${content}

If there are issues, respond with:
ISSUES_FOUND: true
FIXED_CONTENT:
[the complete fixed file content]
SUMMARY:
[brief description of what was fixed]

If no issues, respond with:
ISSUES_FOUND: false`;

    const response = await openai.chat.completions.create({
      model: model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]
    });
    
    const aiResponse = response.choices[0].message.content;
    
    if (aiResponse.includes('ISSUES_FOUND: true')) {
      const fixedContent = extractFixedContent(aiResponse);
      const summary = extractSummary(aiResponse);
      
      if (fixedContent) {
        fs.writeFileSync(path.join(SITE_DIR, filePath), fixedContent);
        fixCount++;
        fixSummaries.push(`- ${filePath}: ${summary}`);
        console.log(`  ✓ Fixed: ${summary}`);
      }
    } else {
      console.log(`  ✓ No issues found`);
    }
    
    // Rate limit delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (fixCount > 0) {
    await commitAndPushChanges(branchName, fixSummaries);
    
    const { data: pr } = await octokit.rest.pulls.create({
      owner: ctx.owner,
      repo: ctx.repo,
      title: `🤖 AI Code Improvements - ${fixCount} files fixed`,
      head: branchName,
      base: baseBranch,
      body: `## AI Deep Review Results

This PR contains automated fixes for ${fixCount} files.

### Files Fixed:
${fixSummaries.join('\n')}

### Review Process:
- Each file was analyzed for code quality, security, and best practices
- Fixes were applied automatically
- Please review changes before merging

_Generated by AI Deep Review_`
    });
    
    console.log(`\nCreated PR #${pr.number} with ${fixCount} fixes`);
  } else {
    console.log('\nNo issues found in repository! 🎉');
  }
}

// Main function
async function main() {
  // Handle deep review with create-pr
  if (MODE === 'deep' && CREATE_PR) {
    await runDeepReview();
    return;
  }

  const ctx = getContext();
  const isPR = !!ctx.prNumber;

  // Handle light PR review in GitHub Actions
  if (MODE === 'light' && isPR && !isLocal) {
    await runLightPRReview();
    return;
  }

  // Standard review flow
  const { Octokit } = await import('@octokit/rest');
  const octokit = isLocal
    ? new Octokit({ auth: process.env.GITHUB_TOKEN })
    : getOctokit(process.env.GITHUB_TOKEN);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log(`Running AI review in ${MODE} mode`);
  console.log(`Repository: ${ctx.owner}/${ctx.repo}`);
  console.log(`Mode: ${isPR ? 'PR' : 'release'} review`);
  console.log(`Environment: ${isLocal ? 'local' : 'GitHub Actions'}`);

  let userPrompt = '';

  if (isPR) {
    const diff = await gatherPrDiff(octokit, ctx.owner, ctx.repo, ctx.prNumber, 
      MODE === 'light' ? 45000 : 120000);
    
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
For Alpine.js, check x-data/x-bind/x-on for reactivity and event safety.`;
  } else {
    // Release review
    const contextFiles = collectContextFiles(SITE_DIR);
    const linkReport = readIfExists('link-report.json');
    const htmlValidate = readIfExists('htmlvalidate.json');
    const lhSummary = readIfExists('.lighthouseci/lhr-*.json') || '';

    userPrompt = `Mode: ${MODE.toUpperCase()}
This is a release deep review for a static site (HTML + JSON + Alpine.js).

PROJECT CONTEXT:
${contextFiles}

LINK CHECK (JSON):
${linkReport.slice(0, 20000)}

HTML VALIDATE (JSON):
${htmlValidate.slice(0, 20000)}

LIGHTHOUSE (if present):
${lhSummary.slice(0, 15000)}`;
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
    // Local output
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
    // GitHub Actions
    if (ctx.prNumber) {
      await octokit.rest.issues.createComment({
        owner: ctx.owner,
        repo: ctx.repo,
        issue_number: ctx.prNumber,
        body: `### ${title}\n${reviewBody}`
      });
    } else {
      // Create issue for non-PR reviews
      await octokit.rest.issues.create({
        owner: ctx.owner,
        repo: ctx.repo,
        title: `${title} · ${new Date().toISOString()}`,
        body: reviewBody
      });
    }
  }

  console.log(`${MODE} review completed.`);
}

// Run main function
if (isLocal) {
  main().catch(err => {
    console.error('ERROR:', err.message || String(err));
    process.exit(1);
  });
} else {
  main().catch(err => setFailed(err.message || String(err)));
}