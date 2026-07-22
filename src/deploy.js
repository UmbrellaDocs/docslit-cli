/**
 * docslit deploy — write static hosting recipe files (does not host).
 */
import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { loadConfig } from './config.js';
import { normalizeBasePath } from './site-config.js';

const GH_WORKFLOW = `name: Deploy DocsLit to GitHub Pages

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - run: npx docslit build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`;

function netlifyToml(basePath) {
  const publish = 'dist';
  return `[build]
  command = "npx docslit build"
  publish = "${publish}"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
  conditions = {Role = ["none"]}
# Prefer DocsLit-generated _redirects in dist/ for real redirects.
`;
}

function wranglerToml() {
  return `name = "docslit-docs"
compatibility_date = "2024-01-01"

[assets]
directory = "./dist"
not_found_handling = "single-page-application"
`;
}

export async function deploy(args = []) {
  const cwd = process.cwd();
  const config = await fs.pathExists(path.join(cwd, 'docslit.json'))
    ? await loadConfig(cwd)
    : {};
  const basePath = normalizeBasePath(config.basePath);

  const targets = [];
  if (args.includes('--github-pages') || args.includes('--gh-pages')) targets.push('github-pages');
  if (args.includes('--netlify')) targets.push('netlify');
  if (args.includes('--cloudflare')) targets.push('cloudflare');
  if (!targets.length) {
    console.log(`
  ${pc.bold('docslit deploy')} — write hosting recipe files

  Usage:
    docslit deploy --github-pages
    docslit deploy --netlify
    docslit deploy --cloudflare

  Tip: set ${pc.cyan('basePath')} in docslit.json for GitHub project sites
  (e.g. ${pc.dim('"basePath": "/my-repo"')}).
`);
    return;
  }

  if (targets.includes('github-pages')) {
    const wf = path.join(cwd, '.github', 'workflows', 'docslit.yml');
    await fs.ensureDir(path.dirname(wf));
    await fs.writeFile(wf, GH_WORKFLOW);
    console.log(`  ${pc.green('✓')} Wrote .github/workflows/docslit.yml`);
    if (!basePath) {
      console.log(`  ${pc.yellow('⚠')} For project pages (user.github.io/repo/), set "basePath": "/repo" in docslit.json`);
    }
  }
  if (targets.includes('netlify')) {
    await fs.writeFile(path.join(cwd, 'netlify.toml'), netlifyToml(basePath));
    console.log(`  ${pc.green('✓')} Wrote netlify.toml`);
  }
  if (targets.includes('cloudflare')) {
    await fs.writeFile(path.join(cwd, 'wrangler.toml'), wranglerToml());
    console.log(`  ${pc.green('✓')} Wrote wrangler.toml`);
  }

  console.log(`\n  Next: commit the recipe files, then push / connect your host.\n`);
  console.log(`  One-liners:`);
  console.log(`    ${pc.dim('# Netlify CLI')}  npx netlify deploy --prod --dir=dist`);
  console.log(`    ${pc.dim('# Cloudflare')}  npx wrangler pages deploy dist`);
  console.log(`    ${pc.dim('# DocsLit Cloud')}  docslit publish\n`);
}
