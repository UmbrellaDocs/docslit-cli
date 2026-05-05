import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { loadConfig, getAllPageIds, getVersionConfig, getVersionSidebar, getChangedDocs, gitReadFile } from './config.js';
import { parseDoc } from './markdown.js';
import { renderShell, renderSeoPage } from './template.js';

export async function build({ out = 'dist', offline = false } = {}) {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const outDir = path.resolve(cwd, out);
  const versionConfig = getVersionConfig(config);

  const modeLabel = offline ? ' (offline mode)' : '';
  console.log(`\n  ${pc.bold('DocsLit')} building static site${modeLabel}...\n`);

  await fs.emptyDir(outDir);

  // Copy user components (shared across versions)
  const componentsDir = path.join(cwd, 'components');
  if (await fs.pathExists(componentsDir)) {
    await fs.copy(componentsDir, path.join(outDir, 'components'));
    console.log(`  ${pc.green('✓')} Copied components/`);
  }

  if (versionConfig) {
    await buildVersioned({ config, versionConfig, cwd, outDir, out, offline });
  } else {
    await buildSingle({ config, cwd, outDir, out, offline });
  }

  const sizeKb = await getDirSize(outDir);
  console.log(`\n  ${pc.bold('Done!')} Output: ${pc.cyan(path.relative(cwd, outDir))}/ (${sizeKb} KB)\n`);
  if (offline) {
    console.log(`  Open directly:  ${pc.cyan(`open ${out}/index.html`)}  ${pc.dim('(no server needed)')}`);
  } else {
    console.log(`  Serve locally:  ${pc.cyan(`npx serve ${out}`)}`);
  }
  console.log(`  Deploy to:      GitHub Pages, Vercel, Netlify, S3, or any static host\n`);
}

async function buildSingle({ config, cwd, outDir, out, offline }) {
  const pageIds = getAllPageIds(config);
  const pagesData = {};
  const draftPageIds = [];
  let built = 0, drafts = 0, failed = 0;

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
    await fs.ensureDir(path.join(outDir, 'docs'));
    await fs.copyFile(mdPath, path.join(outDir, 'docs', `${id}.md`));
    built++;
  }

  const skippedNote = failed ? pc.yellow(` (${failed} skipped)`) : '';
  const draftNote = drafts ? pc.dim(` (${drafts} draft${drafts !== 1 ? 's' : ''} hidden)`) : '';

  if (offline) {
    const searchIndex = buildSearchIndex(config, pagesData);
    const indexHtml = renderShell({ config, mode: 'static', out, pagesData, offline: true, draftPageIds, searchIndex });
    await fs.writeFile(path.join(outDir, 'index.html'), indexHtml);
    console.log(`  ${pc.green('✓')} Built index.html — ${built} page${built !== 1 ? 's' : ''} inlined${draftNote}${skippedNote}`);
  } else {
    const indexHtml = renderShell({ config, mode: 'static', out, draftPageIds });
    await fs.writeFile(path.join(outDir, 'index.html'), indexHtml);
    console.log(`  ${pc.green('✓')} Built index.html (${built} page${built !== 1 ? 's' : ''}${draftNote}${skippedNote})`);
  }

  for (const [id, { meta, html }] of Object.entries(pagesData)) {
    const pageHtml = renderSeoPage({ config, id, meta, html });
    await fs.ensureDir(path.join(outDir, 'docs'));
    await fs.writeFile(path.join(outDir, 'docs', `${id}.html`), pageHtml);
  }

  await generateLlmsTxt({ config, pagesData, outDir });
}

async function buildVersioned({ config, versionConfig, cwd, outDir, out, offline }) {
  const defaultVersion = versionConfig.default;
  const defaultEntry = versionConfig.list.find(v => v.version === defaultVersion);
  const defaultBranch = defaultEntry?.branch || 'main';

  console.log(`  ${pc.bold('Versions:')} ${versionConfig.list.map(v => v.version === defaultVersion ? pc.cyan(v.version + ' (default)') : v.version).join(', ')}\n`);

  // Build default version fully from the working directory
  const defaultDir = path.join(outDir, defaultVersion);
  const defaultPageIds = getAllPageIds(config);
  const defaultPagesData = {};
  const draftPageIds = [];
  let built = 0;

  for (const id of defaultPageIds) {
    const mdPath = path.join(cwd, 'docs', `${id}.md`);
    if (!await fs.pathExists(mdPath)) continue;
    const raw = await fs.readFile(mdPath, 'utf8');
    const { meta, html } = parseDoc(raw);
    if (meta.draft === true) { draftPageIds.push(id); continue; }
    defaultPagesData[id] = { meta, html };
    await fs.ensureDir(path.join(defaultDir, 'docs'));
    await fs.copyFile(mdPath, path.join(defaultDir, 'docs', `${id}.md`));
    built++;
  }

  const defaultShell = renderShell({
    config, mode: 'static', out, draftPageIds,
    versionConfig, currentVersion: defaultVersion,
    ...(offline ? { pagesData: defaultPagesData, offline: true, searchIndex: buildSearchIndex(config, defaultPagesData) } : {}),
  });
  await fs.writeFile(path.join(defaultDir, 'index.html'), defaultShell);

  for (const [id, { meta, html }] of Object.entries(defaultPagesData)) {
    const pageHtml = renderSeoPage({ config, id, meta, html, versionSlug: defaultVersion });
    await fs.ensureDir(path.join(defaultDir, 'docs'));
    await fs.writeFile(path.join(defaultDir, 'docs', `${id}.html`), pageHtml);
  }

  await generateLlmsTxt({ config, pagesData: defaultPagesData, outDir: defaultDir });
  console.log(`  ${pc.green('✓')} ${defaultVersion}: ${built} pages (full build)`);

  // Build non-default versions — only changed pages
  for (const entry of versionConfig.list) {
    if (entry.version === defaultVersion) continue;
    const versionDir = path.join(outDir, entry.version);
    const versionBranch = entry.branch;

    const versionSidebar = await getVersionSidebar(versionBranch, cwd);
    const versionConf = { ...config, sidebar: versionSidebar.length ? versionSidebar : config.sidebar };
    const versionPageIds = getAllPageIds(versionConf);
    const changedSlugs = new Set(await getChangedDocs(defaultBranch, versionBranch, cwd));
    const manifest = {};
    const versionPagesData = {};
    let vBuilt = 0;

    for (const id of versionPageIds) {
      if (changedSlugs.has(id)) {
        const raw = await gitReadFile(versionBranch, `docs/${id}.md`, cwd);
        if (!raw) continue;
        const { meta, html } = parseDoc(raw);
        if (meta.draft === true) continue;
        versionPagesData[id] = { meta, html };
        await fs.ensureDir(path.join(versionDir, 'docs'));
        await fs.writeFile(path.join(versionDir, 'docs', `${id}.md`), raw);
        await fs.writeFile(path.join(versionDir, 'docs', `${id}.html`),
          renderSeoPage({ config: versionConf, id, meta, html, versionSlug: entry.version }));
        manifest[id] = entry.version;
        vBuilt++;
      } else {
        manifest[id] = defaultVersion;
        if (defaultPagesData[id]) versionPagesData[id] = defaultPagesData[id];
      }
    }

    const versionShell = renderShell({
      config: versionConf, mode: 'static', out, draftPageIds: [],
      versionConfig, currentVersion: entry.version,
      ...(offline ? { pagesData: versionPagesData, offline: true, searchIndex: buildSearchIndex(versionConf, versionPagesData) } : {}),
    });
    await fs.ensureDir(versionDir);
    await fs.writeFile(path.join(versionDir, 'index.html'), versionShell);
    await fs.writeFile(path.join(versionDir, '_manifest.json'), JSON.stringify(manifest, null, 2));
    await generateLlmsTxt({ config: versionConf, pagesData: versionPagesData, outDir: versionDir });

    console.log(`  ${pc.green('✓')} ${entry.version}: ${vBuilt} changed page${vBuilt !== 1 ? 's' : ''} built, ${Object.keys(manifest).length - vBuilt} shared from ${defaultVersion}`);
  }

  // Root index.html redirects to default version
  const rootRedirect = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/${defaultVersion}/"><script>location.replace('/${defaultVersion}/');</script></head></html>`;
  await fs.writeFile(path.join(outDir, 'index.html'), rootRedirect);
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

function buildSearchIndex(config, pagesData) {
  const index = [];
  for (const group of (config.sidebar || [])) {
    const groupName = group.group || 'Pages';
    for (const id of (group.pages || [])) {
      if (!pagesData[id]) continue;
      const { meta } = pagesData[id];
      index.push({
        id,
        title: meta.title || toLabel(id),
        group: groupName,
        desc: meta.description || meta.desc || '',
        body: '',
      });
    }
  }
  return index;
}

function stripFrontmatter(src) {
  const m = src.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? m[1].trim() : src.trim();
}

async function generateLlmsTxt({ config, pagesData, outDir }) {
  const siteTitle = config.name || 'Documentation';
  const siteDesc = config.description || '';
  const baseUrl = (config.url || '').replace(/\/$/, '');

  // ── llms.txt ──
  const lines = [`# ${siteTitle}`];
  if (siteDesc) lines.push(`\n> ${siteDesc}`);
  const mdBase = baseUrl ? `${baseUrl}/docs` : 'docs';
  lines.push(`\n> Raw Markdown for each page is available at ${mdBase}/{slug}.md`);
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

  // ── llms-full.txt + search-index.json (single pass) ──
  const fullParts = [
    `# ${siteTitle} — Full Documentation`,
    `# Generated by DocsLit · https://docslit.com`,
    '',
  ];
  const searchIndex = [];

  for (const group of (config.sidebar || [])) {
    const groupName = group.group || 'Pages';
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

        const { meta } = pagesData[id];
        searchIndex.push({
          id,
          title: meta.title || toLabel(id),
          group: groupName,
          desc: meta.description || meta.desc || '',
          body: stripFrontmatter(src),
        });
      }
    }
  }

  await Promise.all([
    fs.writeFile(path.join(outDir, 'llms-full.txt'), fullParts.join('\n')),
    fs.writeFile(path.join(outDir, 'search-index.json'), JSON.stringify(searchIndex)),
  ]);

  const count = Object.keys(pagesData).length;
  console.log(`  ${pc.green('✓')} Generated llms.txt + llms-full.txt + search-index.json (${count} page${count !== 1 ? 's' : ''} indexed)`);
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
