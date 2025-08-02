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

ssh
