# AI Code Review Guide

This guide covers how to use the AI review system both locally and in GitHub Actions.

## Table of Contents
- [Setup](#setup)
- [Local Usage](#local-usage)
  - [Windows (PowerShell)](#windows-powershell)
  - [Windows (Command Prompt)](#windows-command-prompt)
  - [Linux/Mac (Bash)](#linuxmac-bash)
- [GitHub Actions](#github-actions)
- [Review Modes](#review-modes)
- [Configuration](#configuration)

## Setup

### Prerequisites
- Node.js 18+ installed
- GitHub Personal Access Token (PAT)
- OpenAI API Key

### Initial Setup

1. **Install dependencies:**
   ```bash
   npm install
   npm install dotenv  # For local development
   ```

2. **Create `.env` file:**
   ```env
   # Required
   GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
   OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
   GITHUB_REPOSITORY=owner/repo

   # Optional
   BASE_BRANCH=develop  # Default: main
   ```

3. **Add to `.gitignore`:**
   ```
   .env
   .env.local
   .github/ai-review-history-local.json
   ```

## Local Usage

### Windows (PowerShell)

First time only - allow script execution:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Review local files:**
```powershell
.\run-local.ps1                    # Light review (uses repo from .env)
.\run-local.ps1 -mode deep         # Deep review
.\run-local.ps1 -post              # Post results to GitHub
```

**Review a PR:**
```powershell
.\run-local.ps1 -pr 42             # Review PR #42
.\run-local.ps1 -pr 42 -post       # Review and post comment
```

**Deep review with fixes:**
```powershell
.\run-local.ps1 -mode deep -post   # Creates PR with fixes
```

**Override repository:**
```powershell
.\run-local.ps1 -repo otherorg/otherrepo
```

### Windows (Command Prompt)

**Review local files:**
```cmd
run-local.cmd                      # Light review (uses repo from .env)
run-local.cmd --mode=deep          # Deep review
run-local.cmd --post               # Post results to GitHub
```

**Review a PR:**
```cmd
run-local.cmd --pr=42              # Review PR #42
run-local.cmd --pr=42 --post       # Review and post comment
```

**Deep review with fixes:**
```cmd
run-local.cmd --mode=deep --post   # Creates PR with fixes
```

**Override repository:**
```cmd
run-local.cmd --repo=otherorg/otherrepo
```

### Linux/Mac (Bash)

Make script executable (first time only):
```bash
chmod +x run-local.sh
```

**Review local files:**
```bash
./run-local.sh                     # Light review (uses repo from .env)
./run-local.sh --mode=deep         # Deep review
./run-local.sh --post              # Post results to GitHub
```

**Review a PR:**
```bash
./run-local.sh --pr=42             # Review PR #42
./run-local.sh --pr=42 --post      # Review and post comment
```

**Deep review with fixes:**
```bash
./run-local.sh --mode=deep --post  # Creates PR with fixes
```

**Override repository:**
```bash
./run-local.sh --repo=otherorg/otherrepo
```

### Direct Node.js Usage

For all platforms:
```bash
# Light review
node scripts/ai-review.js --mode=light --repo=owner/repo

# Review a PR
node scripts/ai-review.js --mode=light --repo=owner/repo --pr=42

# Deep review with fixes
node scripts/ai-review.js --mode=deep --create-pr --repo=owner/repo

# Post results
node scripts/ai-review.js --mode=light --repo=owner/repo --post
```

## GitHub Actions

### PR Review Workflow

**.github/workflows/ai-review.yml**
```yaml
name: AI Light Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write
  contents: write
  issues: write

jobs:
  light-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          
      - uses: actions/setup-node@v4
        with: 
          node-version: '20'
        
      - run: npm ci
      
      - name: Run AI Light Review
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: node scripts/ai-review.js --mode=light
        
      - name: Commit review history
        run: |
          git config --local user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git add .github/ai-review-history.json
          if git diff --staged --quiet; then
            echo "No changes to review history"
          else
            git commit -m "Update AI review history [skip ci]"
            git push
          fi
```

### Deep Review Workflow (Scheduled)

**.github/workflows/ai-deep-review.yml**
```yaml
name: AI Deep Review

on:
  workflow_dispatch:  # Manual trigger
  schedule:
    - cron: '0 2 * * 0'  # Weekly on Sunday at 2am

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  deep-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
      
      - uses: actions/setup-node@v4
        with: 
          node-version: '20'
      
      - run: npm ci
      
      - name: Run AI Deep Review
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          BASE_BRANCH: develop  # Or main
        run: node scripts/ai-review.js --mode=deep --create-pr
```

### Release Review Workflow

**.github/workflows/ai-release-review.yml**
```yaml
name: AI Release Review

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  release-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with: 
          node-version: '20'
      
      - run: npm ci
      
      - name: Run AI Release Review
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: node scripts/ai-review.js --mode=deep
```

## Review Modes

### Light Review
- Quick analysis of changed files
- Focus on obvious issues
- Runs on every PR
- Posts comments directly on PRs

### Deep Review
- Comprehensive analysis of entire codebase
- Checks for architectural issues
- Includes release checklist items
- Can create fixes automatically with `--create-pr`

### Review Focus Areas
1. **Correctness & Safety** - Broken markup, security issues
2. **Accessibility** - Semantic HTML, ARIA attributes
3. **Performance** - Load times, render blocking
4. **SEO** - Meta tags, structure
5. **Data Integrity** - JSON validation
6. **Content Quality** - Spelling, grammar
7. **Release Checklist** - Deep mode only

## Configuration

### Environment Variables
- `GITHUB_TOKEN` - Required for GitHub API access
- `OPENAI_API_KEY` - Required for AI analysis
- `GITHUB_REPOSITORY` - Default repo (owner/repo format)
- `BASE_BRANCH` - Base branch for PRs (default: main)

### File Exclusions
The following are automatically excluded from review:
- Lock files: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
- Environment files: `.env`, `.env.local`
- Minified files: `*.min.js`, `*.min.css`
- Source maps: `*.map`
- Build directories: `dist/`, `build/`, `.next/`
- Dependencies: `node_modules/`

### Review History
- `.github/ai-review-history.json` - Tracks files reviewed by GitHub Actions
- `.github/ai-review-history-local.json` - Tracks files reviewed locally
- Helps prioritize unreviewed or outdated files

## Troubleshooting

### Common Issues

**"GITHUB_TOKEN not set"**
- Create a `.env` file with your tokens
- Or export them: `export GITHUB_TOKEN=...`

**"Repository must be specified"**
- Add `GITHUB_REPOSITORY=owner/repo` to `.env`
- Or use `--repo=owner/repo` flag

**Rate limiting**
- The script includes 1-second delays between file reviews
- For large repos, consider reducing `maxFiles` parameter

**Token budget exceeded**
- The script monitors token usage (32K limit for GPT-4 Turbo)
- Automatically stops adding files when approaching limit

### Best Practices
1. Run light reviews on every PR
2. Schedule deep reviews weekly
3. Run deep review with fixes before major releases
4. Review the AI-generated fixes before merging
5. Keep `.env` file secure and never commit it

## Examples

### Typical Development Workflow

1. **Before pushing feature branch:**
   ```powershell
   .\run-local.ps1  # Check for issues locally
   ```

2. **After creating PR:**
   - AI automatically reviews and comments

3. **Weekly maintenance:**
   - Deep review runs automatically via GitHub Actions
   - Creates PR with fixes if needed

4. **Before release:**
   ```powershell
   .\run-local.ps1 -mode deep  # Comprehensive check
   ```

### Git Flow Integration

For teams using develop → main flow:
```yaml
env:
  BASE_BRANCH: develop  # PRs target develop
```

The AI will create feature branches from your base branch:
- `feature/ai-fixes-2024-01-15` → `develop` → `main`