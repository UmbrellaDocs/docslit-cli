import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import { loadConfig, getAllPageIds, getVersionConfig, getVersionSidebar, getChangedDocs, gitReadFile } from './config.js';
import { parseDoc } from './markdown.js';
import { renderShell, renderPage, buildStylesFile, buildComponentsFile, buildAppFile } from './template.js';

// Soft thresholds at which a single-file offline bundle starts to feel slow:
// browsers can parse much larger HTML, but ~5MB / 200 pages is the point where
// initial JSON.parse cost and memory footprint become noticeable to users.
const OFFLINE_SIZE_WARN_BYTES = 5 * 1024 * 1024;
const OFFLINE_PAGES_WARN_COUNT = 200;

function _formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

async function _warnIfLargeOffline(htmlPath, pageCount, label) {
  const stat = await fs.stat(htmlPath);
  const sizeOver = stat.size > OFFLINE_SIZE_WARN_BYTES;
  const countOver = pageCount > OFFLINE_PAGES_WARN_COUNT;
  if (!sizeOver && !countOver) return;

  const reason = sizeOver && countOver
    ? `${pageCount} pages, ${_formatBytes(stat.size)}`
    : sizeOver ? _formatBytes(stat.size) : `${pageCount} pages`;
  const tag = label ? ` (${label})` : '';

  console.log('');
  console.log(`  ${pc.yellow('⚠')}  ${pc.yellow(pc.bold('Large offline bundle'))}${tag} — ${reason}`);
  console.log(`     Offline mode inlines every page into one HTML file. At this size the`);
  console.log(`     browser's initial parse and memory footprint get noticeable.`);
  console.log(`     For sites this size, prefer the default build: ${pc.cyan('docslit build')}`);
  console.log(`     — per-page HTML with shared assets and faster first load.`);
}

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
    const entries = await fs.readdir(componentsDir);
    if (entries.length) {
      await fs.copy(componentsDir, path.join(outDir, 'components'));
      console.log(`  ${pc.green('✓')} Copied components/`);
    }
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
    console.log(`  Serve locally:  ${pc.cyan('npx serve dist')}`);
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
    const destMd = path.join(outDir, `${id}.md`);
    await fs.ensureDir(path.dirname(destMd));
    await fs.copyFile(mdPath, destMd);
    built++;
  }

  const skippedNote = failed ? pc.yellow(` (${failed} skipped)`) : '';
  const draftNote = drafts ? pc.dim(` (${drafts} draft${drafts !== 1 ? 's' : ''} hidden)`) : '';

  if (offline) {
    const searchIndex = buildSearchIndex(config, pagesData);
    const indexHtml = renderShell({ config, mode: 'static', out, pagesData, offline: true, draftPageIds, searchIndex });
    const indexPath = path.join(outDir, 'index.html');
    await fs.writeFile(indexPath, indexHtml);
    console.log(`  ${pc.green('✓')} Built index.html — ${built} page${built !== 1 ? 's' : ''} inlined${draftNote}${skippedNote}`);
    await _warnIfLargeOffline(indexPath, built);
  } else {
    await fs.writeFile(path.join(outDir, 'docslit.css'), buildStylesFile());
    await fs.writeFile(path.join(outDir, 'docslit.js'), buildComponentsFile('static'));
    await fs.writeFile(path.join(outDir, 'docslit-app.js'), buildAppFile('static'));

    const publishedIds = Object.keys(pagesData);
    for (const [id, { meta, html }] of Object.entries(pagesData)) {
      const pageHtml = renderPage({ config, id, meta, html, draftPageIds });
      const destHtml = path.join(outDir, `${id}.html`);
      await fs.ensureDir(path.dirname(destHtml));
      await fs.writeFile(destHtml, pageHtml);
    }

    if (publishedIds.length) {
      await fs.copyFile(path.join(outDir, `${publishedIds[0]}.html`), path.join(outDir, 'index.html'));
    }

    console.log(`  ${pc.green('✓')} Built ${built} page${built !== 1 ? 's' : ''} + shared assets${draftNote}${skippedNote}`);
  }

  await generateLlmsTxt({ config, pagesData, outDir });

  if (!offline) {
    await generateRobotsTxt({ config, outDir });
    await generateSitemap({ config, pagesData, outDir });
  }
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
    const destMd = path.join(defaultDir, `${id}.md`);
    await fs.ensureDir(path.dirname(destMd));
    await fs.copyFile(mdPath, destMd);
    built++;
  }

  if (offline) {
    const defaultShell = renderShell({
      config, mode: 'static', out, draftPageIds,
      versionConfig, currentVersion: defaultVersion,
      pagesData: defaultPagesData, offline: true, searchIndex: buildSearchIndex(config, defaultPagesData),
    });
    const defaultIndexPath = path.join(defaultDir, 'index.html');
    await fs.writeFile(defaultIndexPath, defaultShell);
    await _warnIfLargeOffline(defaultIndexPath, built, defaultVersion);
  } else {
    await fs.writeFile(path.join(defaultDir, 'docslit.css'), buildStylesFile());
    await fs.writeFile(path.join(defaultDir, 'docslit.js'), buildComponentsFile('static'));
    await fs.writeFile(path.join(defaultDir, 'docslit-app.js'), buildAppFile('static'));

    const publishedIds = Object.keys(defaultPagesData);
    for (const [id, { meta, html }] of Object.entries(defaultPagesData)) {
      const pageHtml = renderPage({ config, id, meta, html, draftPageIds, versionConfig, currentVersion: defaultVersion });
      const destHtml = path.join(defaultDir, `${id}.html`);
      await fs.ensureDir(path.dirname(destHtml));
      await fs.writeFile(destHtml, pageHtml);
    }

    if (publishedIds.length) {
      await fs.copyFile(path.join(defaultDir, `${publishedIds[0]}.html`), path.join(defaultDir, 'index.html'));
    }
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
        const destMd = path.join(versionDir, 'docs', `${id}.md`);
        await fs.ensureDir(path.dirname(destMd));
        await fs.writeFile(destMd, raw);
        manifest[id] = entry.version;
        vBuilt++;
      } else {
        manifest[id] = defaultVersion;
        if (defaultPagesData[id]) versionPagesData[id] = defaultPagesData[id];
      }
    }

    await fs.ensureDir(versionDir);

    if (offline) {
      const versionShell = renderShell({
        config: versionConf, mode: 'static', out, draftPageIds: [],
        versionConfig, currentVersion: entry.version,
        pagesData: versionPagesData, offline: true, searchIndex: buildSearchIndex(versionConf, versionPagesData),
      });
      const versionIndexPath = path.join(versionDir, 'index.html');
      await fs.writeFile(versionIndexPath, versionShell);
      await _warnIfLargeOffline(versionIndexPath, Object.keys(versionPagesData).length, entry.version);
    } else {
      await fs.writeFile(path.join(versionDir, 'docslit.css'), buildStylesFile());
      await fs.writeFile(path.join(versionDir, 'docslit.js'), buildComponentsFile('static'));
      await fs.writeFile(path.join(versionDir, 'docslit-app.js'), buildAppFile('static'));

      const vPublishedIds = Object.keys(versionPagesData);
      for (const [id, { meta, html }] of Object.entries(versionPagesData)) {
        const pageHtml = renderPage({ config: versionConf, id, meta, html, draftPageIds: [], versionConfig, currentVersion: entry.version });
        const destHtml = path.join(versionDir, `${id}.html`);
        await fs.ensureDir(path.dirname(destHtml));
        await fs.writeFile(destHtml, pageHtml);
      }

      if (vPublishedIds.length) {
        await fs.copyFile(path.join(versionDir, `${vPublishedIds[0]}.html`), path.join(versionDir, 'index.html'));
      }
    }

    await fs.writeFile(path.join(versionDir, '_manifest.json'), JSON.stringify(manifest, null, 2));
    await generateLlmsTxt({ config: versionConf, pagesData: versionPagesData, outDir: versionDir });

    console.log(`  ${pc.green('✓')} ${entry.version}: ${vBuilt} changed page${vBuilt !== 1 ? 's' : ''} built, ${Object.keys(manifest).length - vBuilt} shared from ${defaultVersion}`);
  }

  // Root index.html redirects to default version's first page
  const defaultFirstId = Object.keys(defaultPagesData)[0] || 'introduction';
  const rootRedirect = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/${defaultVersion}/${defaultFirstId}"><script>location.replace('/${defaultVersion}/${defaultFirstId}');</script></head></html>`;
  await fs.writeFile(path.join(outDir, 'index.html'), rootRedirect);

  if (!offline) {
    const allPagesData = {};
    for (const id of defaultPageIds) {
      if (defaultPagesData[id]) allPagesData[id] = defaultPagesData[id];
    }
    await generateRobotsTxt({ config, outDir, versionConfig });
    await generateSitemap({ config, pagesData: allPagesData, outDir, versionConfig, defaultVersion });
  }
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
      const mdUrl = baseUrl ? `${baseUrl}/${id}.md` : `${id}.md`;
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
        fullParts.push(`# Source: ${id}.md`);
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

async function generateRobotsTxt({ config, outDir, versionConfig = null }) {
  const baseUrl = (config.url || '').replace(/\/$/, '');
  const lines = [
    'User-agent: *',
    'Allow: /',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    'User-agent: Claude-Web',
    'Allow: /',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: Applebot-Extended',
    'Allow: /',
  ];

  if (baseUrl) {
    lines.push('');
    if (versionConfig) {
      for (const v of versionConfig.list) {
        lines.push(`Sitemap: ${baseUrl}/${v.version}/sitemap.xml`);
      }
    } else {
      lines.push(`Sitemap: ${baseUrl}/sitemap.xml`);
    }

    lines.push(`Sitemap: ${baseUrl}/llms.txt`);
  }

  lines.push('');
  await fs.writeFile(path.join(outDir, 'robots.txt'), lines.join('\n'));
  console.log(`  ${pc.green('✓')} Generated robots.txt`);
}

async function generateSitemap({ config, pagesData, outDir, versionConfig = null, defaultVersion = null }) {
  const baseUrl = (config.url || '').replace(/\/$/, '');
  if (!baseUrl) {
    console.log(`  ${pc.dim('○')} Skipped sitemap.xml — no url in docslit.json`);
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  if (versionConfig) {
    for (const entry of versionConfig.list) {
      const versionDir = path.join(outDir, entry.version);
      const isDefault = entry.version === defaultVersion;
      const priority = isDefault ? '1.0' : '0.6';
      const urls = [];

      urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/${escXml(entry.version)}/</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${priority}</priority>\n  </url>`);

      for (const id of Object.keys(pagesData)) {
        urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/${escXml(entry.version)}/${escXml(id)}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${isDefault ? '0.8' : '0.5'}</priority>\n  </url>`);
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
      await fs.ensureDir(versionDir);
      await fs.writeFile(path.join(versionDir, 'sitemap.xml'), xml);
    }
  } else {
    const urls = [];

    urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/</loc>\n    <lastmod>${today}</lastmod>\n    <priority>1.0</priority>\n  </url>`);

    for (const id of Object.keys(pagesData)) {
      urls.push(`  <url>\n    <loc>${escXml(baseUrl)}/${escXml(id)}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>0.8</priority>\n  </url>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    await fs.writeFile(path.join(outDir, 'sitemap.xml'), xml);
  }

  console.log(`  ${pc.green('✓')} Generated sitemap.xml (${Object.keys(pagesData).length} URLs)`);
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
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
