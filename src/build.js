import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { loadConfig, getAllPageIds } from './config.js';
import { parseDoc } from './markdown.js';
import { renderShell, renderSeoPage } from './template.js';

export async function build({ out = 'dist', offline = false } = {}) {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const outDir = path.resolve(cwd, out);

  const modeLabel = offline ? ' (offline mode)' : '';
  console.log(`\n  ${pc.bold('DocsLit')} building static site${modeLabel}...\n`);

  await fs.emptyDir(outDir);

  // Copy user components
  const componentsDir = path.join(cwd, 'components');
  if (await fs.pathExists(componentsDir)) {
    await fs.copy(componentsDir, path.join(outDir, 'components'));
    console.log(`  ${pc.green('✓')} Copied components/`);
  }

  // Collect all page data — parse every page, separate drafts
  const pageIds = getAllPageIds(config);
  const pagesData = {};
  const draftPageIds = [];
  let built = 0;
  let drafts = 0;
  let failed = 0;

  for (const id of pageIds) {
    const mdPath = path.join(cwd, 'docs', `${id}.md`);
    if (!await fs.pathExists(mdPath)) {
      console.log(`  ${pc.yellow('!')} Skipped ${id}.md — file not found`);
      failed++;
      continue;
    }
    const raw = await fs.readFile(mdPath, 'utf8');
    const { meta, html } = parseDoc(raw);

    if (meta.draft === true) {
      draftPageIds.push(id);
      drafts++;
      console.log(`  ${pc.dim('○')} Skipped ${id} — draft`);
      continue;
    }

    pagesData[id] = { meta, html };
    // Preserve source .md in dist/docs/{slug}.md — used by llms.txt links
    await fs.ensureDir(path.join(outDir, 'docs'));
    await fs.copyFile(mdPath, path.join(outDir, 'docs', `${id}.md`));
    built++;
  }

  const skippedNote = failed ? pc.yellow(` (${failed} skipped)`) : '';
  const draftNote = drafts ? pc.dim(` (${drafts} draft${drafts !== 1 ? 's' : ''} hidden)`) : '';

  if (offline) {
    const indexHtml = renderShell({
      config, mode: 'static', out, pagesData, offline: true, draftPageIds,
    });
    await fs.writeFile(path.join(outDir, 'index.html'), indexHtml);
    console.log(`  ${pc.green('✓')} Built index.html — ${built} page${built !== 1 ? 's' : ''} inlined${draftNote}${skippedNote}`);
  } else {
    const indexHtml = renderShell({ config, mode: 'static', out, draftPageIds });
    await fs.writeFile(path.join(outDir, 'index.html'), indexHtml);
    console.log(`  ${pc.green('✓')} Built index.html (${built} page${built !== 1 ? 's' : ''}${draftNote}${skippedNote})`);
  }

  // Thin SEO pages — minimal HTML with content for crawlers, JS redirects to SPA
  for (const [id, { meta, html }] of Object.entries(pagesData)) {
    const pageHtml = renderSeoPage({ config, id, meta, html });
    await fs.ensureDir(path.join(outDir, 'docs'));
    await fs.writeFile(path.join(outDir, 'docs', `${id}.html`), pageHtml);
  }

  // llms.txt + llms-full.txt — always generated, never includes drafts
  await generateLlmsTxt({ config, pagesData, outDir });

  const sizeKb = await getDirSize(outDir);
  console.log(`\n  ${pc.bold('Done!')} Output: ${pc.cyan(path.relative(cwd, outDir))}/ (${sizeKb} KB)\n`);
  if (offline) {
    console.log(`  Open directly:  ${pc.cyan(`open ${out}/index.html`)}  ${pc.dim('(no server needed)')}`);
  } else {
    console.log(`  Serve locally:  ${pc.cyan(`npx serve ${out}`)}`);
  }
  console.log(`  Deploy to:      GitHub Pages, Vercel, Netlify, S3, or any static host\n`);
}

// ── llms.txt generation ────────────────────────────────────────────────────
// Follows the llmstxt.org specification:
//   https://llmstxt.org
//
// Structure:
//   # Site Title
//   > Optional site description
//
//   ## Sidebar Group
//   - [Page Title](url/to/slug.md): Short description from frontmatter
//
// Also writes llms-full.txt — all pages concatenated for models that want
// the complete corpus in one request.

async function generateLlmsTxt({ config, pagesData, outDir }) {
  const siteTitle = config.name || 'Documentation';
  const siteDesc = config.description || '';
  const baseUrl = (config.url || '').replace(/\/$/, '');

  // ── llms.txt ──
  const lines = [`# ${siteTitle}`];
  if (siteDesc) lines.push(`\n> ${siteDesc}`);
  lines.push('');

  for (const group of (config.sidebar || [])) {
    const groupPages = (group.pages || []).filter(id => pagesData[id]);
    if (!groupPages.length) continue;

    lines.push(`## ${group.group || 'Pages'}`);
    lines.push('');
    for (const id of groupPages) {
      const { meta } = pagesData[id];
      const title = meta.title || toLabel(id);
      const desc = meta.description || meta.desc || '';
      const mdUrl = baseUrl ? `${baseUrl}/docs/${id}.md` : `docs/${id}.md`;
      lines.push(desc ? `- [${title}](${mdUrl}): ${desc}` : `- [${title}](${mdUrl})`);
    }
    lines.push('');
  }

  await fs.writeFile(path.join(outDir, 'llms.txt'), lines.join('\n'));

  // ── llms-full.txt ──
  const fullParts = [
    `# ${siteTitle} — Full Documentation`,
    `# Generated by DocsLit · https://docslit.com`,
    '',
  ];

  for (const group of (config.sidebar || [])) {
    const groupPages = (group.pages || []).filter(id => pagesData[id]);
    if (!groupPages.length) continue;
    for (const id of groupPages) {
      const mdPath = path.join(outDir, 'docs', `${id}.md`);
      if (await fs.pathExists(mdPath)) {
        const src = await fs.readFile(mdPath, 'utf8');
        fullParts.push('---');
        fullParts.push(`# Source: docs/${id}.md`);
        fullParts.push('');
        fullParts.push(src.trim());
        fullParts.push('');
      }
    }
  }

  await fs.writeFile(path.join(outDir, 'llms-full.txt'), fullParts.join('\n'));

  const count = Object.keys(pagesData).length;
  console.log(`  ${pc.green('✓')} Generated llms.txt + llms-full.txt (${count} page${count !== 1 ? 's' : ''} indexed)`);
}

function toLabel(id) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function getDirSize(dir) {
  return Math.round(await getDirBytes(dir) / 1024);
}

async function getDirBytes(dir) {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await getDirBytes(p);
    else total += (await fs.stat(p)).size;
  }
  return total;
}
