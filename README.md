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