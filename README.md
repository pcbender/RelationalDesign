# RelationalDesign

RelationalDesign is a small static site that explores "relational design" ideas.
Pages are simple HTML enhanced by a single CSS file and [Alpine.js](https://alpinejs.dev/) loaded from a CDN.
JSON files in `dist/data/` supply navigation links, article metadata and sample content that is fetched at runtime.

## Features

- Static HTML in `dist/` ready to deploy to any host
- Alpine.js for lightweight client-side behaviour
- TF–IDF based script to generate related article links
- Experimental AI review script that can comment on pull requests or open
  automated fix PRs

## Repository layout

```
dist/               Built site (HTML, CSS, images and JSON data)
templates/          Minimal HTML templates for new pages
scripts/            Node.js utilities
  build.js          Updates related article metadata
  ai-review.js      Runs AI review locally or in GitHub Actions
run-local.*         Helper wrappers for ai-review on different platforms
```

## Getting started

### View the site

```
cd dist
python3 -m http.server
```

Open <http://localhost:8000/> in your browser.

### Install dependencies

The build and review scripts require Node.js 20 or later.

```
npm install
```

### Regenerate related article data

```
npm run build:site
```

### Run an AI review

Provide `OPENAI_API_KEY` and `GITHUB_TOKEN` via environment variables or a
`.env` file, then run:

```
npm run ai-review -- --mode=deep
```

Add `--create-pr` to let the script commit fixes and open a pull request.

## Development notes

- `.env` (not committed) stores API tokens for local usage
- `dist/` can be deployed to services like GitHub Pages or Netlify

## License

Apache-2.0

