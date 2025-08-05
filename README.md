# RelationalDesign

This repository contains a small static website demonstrating "Relational Design" concepts. The pages are built with plain HTML, a single CSS stylesheet and [Alpine.js](https://alpinejs.dev/) loaded from a CDN. The JSON files in `dist/data/` provide navigation links, article metadata and sample content that is fetched dynamically when the pages load.

## Repository structure

- `dist/` – final static site ready for deployment  
  - `index.html` – landing page with hero section, features and updates  
  - `GetStarted.html` – introductory guide to Relational Design  
  - `RelationalDesignManifesto.html` – full manifesto  
  - `css/styles.css` – global styles  
  - `data/` – JSON data used by the pages  
  - `img/` – site imagery and logos  
  - `favicon.ico` – browser favicon  
- `templates/` – stripped-down HTML examples for creating new pages  
- `.github/workflows/main.yml` – GitHub Action that deploys `dist/` via FTPS

## Viewing locally

Open `dist/index.html` directly in your browser or serve the `dist` folder from a local web server:

```bash
cd dist
python3 -m http.server
```

Then visit `http://localhost:8000/index.html`.

Any static hosting service such as GitHub Pages or Netlify can also serve these files. Upload the contents of `dist` to your host of choice.

## Templates

The `templates/` directory contains stripped-down HTML examples that can be copied when creating new pages:

- `home-template.html` – layout for the site homepage.
- `article-template.html` – layout for content articles.

Copy the desired file, rename it and replace the placeholder comments with your content. The templates already include the dynamic navigation and footer logic so only the page-specific sections need to be filled in.

## Automated builds

Run `npm run build:site` to regenerate navigation lists and related links after adding or editing articles. A GitHub Actions workflow automatically runs this command whenever Markdown or HTML files change in `content/` or `dist/`, keeping generated lists up to date.

## AI review and automated PRs

The repository includes an experimental script that can review the site and open pull requests with suggested fixes. Provide `OPENAI_API_KEY` and a token in `GITHUB_TOKEN`, then run:

```bash
npm run ai-review -- --mode=deep --create-pr
```

The script analyses the project, generates a patch, commits it to a new branch and opens a pull request with the review summary.

## Notes

- How to set up multiple identities for GitHub

In an admin console in the project root:

```bash
git config --global credential.helper manager-core
```

In each repo, key credentials by path so accounts don’t collide:

```bash
git config credential.useHttpPath true
```

Then run:

```bash
git push
```
Windows Setup Instructions:

Run the setup script (one time only):

cmdsetup-windows.cmd
This will create the .env file and install dependencies.

Edit your .env file with your API keys
Choose your preferred method:

Option A: PowerShell (Recommended)
powershell# You might need to allow script execution first (run as admin):
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Then run reviews:
.\run-local.ps1 -repo YourOrg/YourRepo
.\run-local.ps1 -repo YourOrg/YourRepo -pr 123
.\run-local.ps1 -repo YourOrg/YourRepo -mode deep -post
Option B: Command Prompt (Batch)
cmdrun-local.cmd --repo=YourOrg/YourRepo
run-local.cmd --repo=YourOrg/YourRepo --pr=123
run-local.cmd --repo=YourOrg/YourRepo --mode=deep --post
Option C: Direct Node.js
cmdset GITHUB_REPOSITORY=YourOrg/YourRepo
node scripts/ai-review.js --mode=light --pr=123
Key Differences:

PowerShell script has better parameter handling and can auto-load .env
Batch script works everywhere but syntax is clunkier
Both support the same features as the bash version

The PowerShell version is generally better on Windows, but I included both so you can use whatever you're comfortable with!


Setup Instructions:

Install dependencies:

bashnpm install dotenv  # Optional but recommended

Create .env file:

bashcp .env.example .env
# Edit .env with your tokens

Make the script executable:

bashchmod +x run-local.sh

Add to .gitignore:

.env
.env.local
Usage Examples:
bash# Review current directory files
./run-local.sh --repo=YourOrg/YourRepo

# Review a specific PR (dry run)
./run-local.sh --repo=YourOrg/YourRepo --pr=123

# Deep review and actually post the results
./run-local.sh --repo=YourOrg/YourRepo --mode=deep --post

# Review a different directory
./run-local.sh --repo=YourOrg/YourRepo --site-dir=./dist

# Or run directly with Node:
GITHUB_REPOSITORY=YourOrg/YourRepo node scripts/ai-review.js --mode=light --pr=123
Key Features:

Dry run by default - Reviews are printed to console unless --post is used
Works with PRs - Can review specific PRs with --pr=NUMBER
No code duplication - Same script works locally and in Actions
Clear output - Shows what it's doing and the results
Environment flexible - Use .env file or export variables

This setup lets you:

Test changes locally before committing
Review your feature branch before pushing
Debug issues without GitHub Actions delays
Run reviews on demand during development

The script detects whether it's running locally or in GitHub Actions and adapts accordingly!


PowerShell:
powershell.\run-local.ps1                    # Reviews pcbender/RelationalDesign
.\run-local.ps1 -pr 42             # Reviews PR #42 in pcbender/RelationalDesign
.\run-local.ps1 -mode deep -post   # Deep review and post to pcbender/RelationalDesign
Command Prompt:
cmdrun-local.cmd                      # Reviews pcbender/RelationalDesign
run-local.cmd --pr=42              # Reviews PR #42 in pcbender/RelationalDesign
run-local.cmd --mode=deep --post   # Deep review and post to pcbender/RelationalDesign
If you ever need to review a different repo, you can still override it:
powershell.\run-local.ps1 -repo otherorg/otherrepo
Much cleaner for your day-to-day usage! The scripts will:

Use the repo from .env by default
Show which repo they're using
Allow overriding when needed



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