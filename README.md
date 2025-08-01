# RelationalDesign

This repository contains a small static website demonstrating "Relational Design" concepts. The pages are built with plain HTML, a single CSS stylesheet and [Alpine.js](https://alpinejs.dev/) loaded from a CDN. The JSON files in the `data/` directory provide navigation links, article metadata and sample content that is fetched dynamically when the pages load.

## Included files

- `index.html` – landing page with hero section, features and updates
- `GetStarted.html` – introductory guide to Relational Design
- `article.html` – example article layout
- `article2.html` – additional article page
- `css/styles.css` – global styles
- `data/`
  - `articles.json` – list of articles
  - `features.json` – features displayed on the homepage
  - `menu.json` – navigation items for the header
  - `recentUpdates.json` – recent news items
  - `footer.json` – links displayed in the footer
- `img/TriGram.png` – logo used on the site
- `favicon.ico` – browser favicon
- `LICENSE` – Apache 2.0 license

## Viewing locally

You can open the HTML files directly in your browser by double‑clicking `index.html` (and the other pages) or you can serve them from a local web server:

```bash
python3 -m http.server
```

Then visit `http://localhost:8000/index.html` in your browser.

Any static hosting service such as GitHub Pages or Netlify can also serve these files. Just copy the repository contents to your host of choice and point your browser at the hosted URL.

## Templates

The `templates/` directory contains stripped-down HTML examples that can be copied when creating new pages:

- `home-template.html` – layout for the site homepage.
- `article-template.html` – layout for content articles.

Copy the desired file, rename it, and replace the placeholder comments with your content. The templates already include the dynamic navigation and footer logic so only the page-specific sections need to be filled in.
