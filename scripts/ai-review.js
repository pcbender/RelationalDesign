import { setFailed, info } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { OpenAI } from 'openai';
import simpleGit from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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

function collectContextFiles(root = '.') {
  // sample small context to help model (titles, global layout, Alpine boot)
  const candidates = [
    'index.html',
    'robots.txt',
    'sitemap.xml',
    'package.json',
    'README.md'
  ].concat(
    glob('**/*.html', 8),
    glob('data/**/*.json', 8),
    glob('src/**/*.js', 8),
    glob('src/**/*.css', 8),
    glob('.github/workflows/**/*.yml', 5),
    glob('.github/workflows/**/*.yaml', 5)
  ).slice(0, 30); // keep it small
  const parts = [];
  for (const rel of candidates) {
    const body = readIfExists(path.join(root, rel));
    if (body) parts.push(`\n--- CONTEXT FILE: ${rel} ---\n${body.slice(0, 4000)}`);
  }
  return parts.join('\n');
}

function glob(pattern, limit = 50) {
  // very small naive glob to avoid extra deps
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (p.includes('node_modules') || p.startsWith('.git')) continue;
        try { walk(p); } catch { }
      } else {
        out.push(p);
      }
    }
  })('.');
  // filter pattern roughly
  const rx = new RegExp(pattern
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\./g, '\\.')
    .replace(/\//g, '\\/'));
  return out.filter(p => rx.test(p)).slice(0, limit);
}

async function main() {
  const isPR = !!context.payload.pull_request;
  const octokit = getOctokit(process.env.GITHUB_TOKEN);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { owner, repo } = context.repo;

  let userPrompt = '';
  if (isPR) {
    const prNumber = context.payload.pull_request.number;
    const diff = await gatherPrDiff(octokit, owner, repo, prNumber, MODE === 'light' ? 45000 : 120000);
    if (!diff) { info('No relevant diff.'); return; }
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
    // Tag/release deep scan without PR: scan site dir for representative files
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

  const resp = await openai.chat.completions.create({
    model: MODE === 'light' ? 'gpt-4o' : 'gpt-4',
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ]
  });

  const reviewBody = resp.choices[0].message.content?.trim() || '(no output)';
  const title = MODE === 'light' ? '💡 AI Light Review' : '🛠️ AI Deep Release Review';

  if (context.payload.pull_request) {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: context.payload.pull_request.number,
      body: `### ${title}\n${reviewBody}`
    });
  } else {
    // No PR context (tag/release)
    if (CREATE_PR) {
      try {

        const contextFiles = collectContextFiles(SITE_DIR);

        const patchPrompt = [
          {
            role: 'system',
            content: [
              'You are an AI developer.',
              'Generate a unified diff patch (no markdown fences) that applies the fixes below',
              'to the exact files provided.'
            ].join(' ')
          },
          {
            role: 'user',
            content: [
              'PROJECT FILES:',
              contextFiles,
              '',
              'SUGGESTED FIXES:',
              reviewBody,
              '',
              'Please return only the diff, starting with `diff --git`.'
            ].join('\n')
          }
        ];

        const patchResp = await openai.chat.completions.create({
          model: MODE === 'light' ? 'gpt-4o' : 'gpt-4',
          temperature: 0,
          messages: patchPrompt
        });
        const patch = patchResp.choices[0].message.content?.trim();
        if (patch?.startsWith('diff')) {
          const branch = `ai-fix-${Date.now()}`;
          const defaultBranch = context.payload.repository?.default_branch || 'main';
          const git = simpleGit();
          await git.checkout(defaultBranch);
          await git.checkoutLocalBranch(branch);
          await git.applyPatch(patch);
          await git.add('.');
          await git.commit(title);
          await git.push('origin', branch);
          await octokit.rest.pulls.create({
            owner,
            repo,
            head: branch,
            base: defaultBranch,
            title,
            body: reviewBody
          });
        } else {
          await octokit.rest.issues.create({
            owner,
            repo,
            title: `${title} · ${new Date().toISOString()}`,
            body: reviewBody
          });
          info('No patch returned; created issue instead.');
        }
      } catch (err) {
        await octokit.rest.issues.create({
          owner,
          repo,
          title: `${title} · ${new Date().toISOString()}`,
          body: reviewBody
        });
        throw new Error(`Failed to create PR: ${err.message || err}`);
      }
    } else {
      await octokit.rest.issues.create({
        owner,
        repo,
        title: `${title} · ${new Date().toISOString()}`,
        body: reviewBody
      });
    }
  }

  info(`${MODE} review posted.`);
}

main().catch(err => setFailed(err.message || String(err)));
