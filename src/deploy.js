/**
 * docslit deploy — write static hosting recipe files (does not host).
 */
import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { loadConfig } from './config.js';
import { normalizeBasePath } from './site-config.js';

function ghWorkflow(outDir) {
  const buildCmd = outDir === 'dist' ? 'npx docslit build' : `npx docslit build --out ${outDir}`;
  return `name: Deploy DocsLit to GitHub Pages

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
      - run: ${buildCmd}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ${outDir}

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
}

function netlifyToml(basePath, outDir) {
  const buildCmd = outDir === 'dist' ? 'npx docslit build' : `npx docslit build --out ${outDir}`;
  return `[build]
  command = "${buildCmd}"
  publish = "${outDir}"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
  conditions = {Role = ["none"]}
# Prefer DocsLit-generated _redirects in ${outDir}/ for real redirects.
`;
}

function wranglerToml(outDir) {
  return `name = "docslit-docs"
compatibility_date = "2024-01-01"

[assets]
directory = "./${outDir}"
not_found_handling = "single-page-application"
`;
}

/** Normalise --out to a project-relative posix path (default "dist"). */
export function resolveOutDir(cwd, raw) {
  if (!raw) return 'dist';
  const rel = path.relative(cwd, path.resolve(cwd, raw)).split(path.sep).join('/');
  return rel || 'dist';
}

export async function deploy(args = []) {
  const cwd = process.cwd();
  const oi = args.indexOf('--out');
  const eq = args.find((a) => a.startsWith('--out='));
  const rawOut = oi !== -1 ? args[oi + 1] : eq ? eq.slice(6) : null;
  if ((oi !== -1 && (!rawOut || rawOut.startsWith('--'))) || (eq && !rawOut)) {
    console.error('  Error: --out needs a directory, e.g. docslit deploy --cloudflare --out public\n');
    process.exit(1);
  }
  const outDir = resolveOutDir(cwd, rawOut);
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

  Options:
    --out <dir>   Build output directory the recipes point at (default: dist)

  Tip: set ${pc.cyan('basePath')} in docslit.json for GitHub project sites
  (e.g. ${pc.dim('"basePath": "/my-repo"')}).
`);
    return;
  }

  if (targets.includes('github-pages')) {
    const wf = path.join(cwd, '.github', 'workflows', 'docslit.yml');
    await fs.ensureDir(path.dirname(wf));
    await fs.writeFile(wf, ghWorkflow(outDir));
    console.log(`  ${pc.green('✓')} Wrote .github/workflows/docslit.yml`);
    if (!basePath) {
      console.log(`  ${pc.yellow('⚠')} For project pages (user.github.io/repo/), set "basePath": "/repo" in docslit.json`);
    }
  }
  if (targets.includes('netlify')) {
    await fs.writeFile(path.join(cwd, 'netlify.toml'), netlifyToml(basePath, outDir));
    console.log(`  ${pc.green('✓')} Wrote netlify.toml`);
  }
  if (targets.includes('cloudflare')) {
    await fs.writeFile(path.join(cwd, 'wrangler.toml'), wranglerToml(outDir));
    console.log(`  ${pc.green('✓')} Wrote wrangler.toml`);
    // Cloudflare Pages reads Functions from <project>/functions; `docslit build`
    // emits the middleware under the output dir, so install it here on request.
    const built = path.join(cwd, outDir, 'functions', '_middleware.js');
    if (await fs.pathExists(built)) {
      await fs.ensureDir(path.join(cwd, 'functions'));
      await fs.copyFile(built, path.join(cwd, 'functions', '_middleware.js'));
      console.log(`  ${pc.green('✓')} Wrote functions/_middleware.js (Accept: text/markdown negotiation for Cloudflare Pages)`);
    } else {
      console.log(`  ${pc.yellow('⚠')} Run ${pc.cyan(`docslit build${outDir === 'dist' ? '' : ` --out ${outDir}`}`)} then re-run ${pc.cyan(`docslit deploy --cloudflare${outDir === 'dist' ? '' : ` --out ${outDir}`}`)} to install functions/_middleware.js (Markdown negotiation)`);
    }
  }

  console.log(`\n  Next: commit the recipe files, then push / connect your host.\n`);
  console.log(`  One-liners:`);
  console.log(`    ${pc.dim('# Netlify CLI')}  npx netlify deploy --prod --dir=${outDir}`);
  console.log(`    ${pc.dim('# Cloudflare')}  npx wrangler pages deploy ${outDir}`);
  console.log(`    ${pc.dim('# DocsLit Cloud')}  docslit publish\n`);
}
