// `docslit import` — convert a Mintlify, Fern, GitBook or MkDocs (Material, Zensical) project (or any folder of
// Markdown/MDX) into a DocsLit project, validate the result and write a migration report.
//
//   Engine:   src/import/mdx.js (remark-mdx AST + source splicing), src/import/components.js
//   Config:   src/import/{mintlify,fern,gitbook,mkdocs}.js (MkDocs bodies: src/import/pymdown.js)
//   Docusaurus / VitePress / Starlight: src/import/ssg.js (content roots, ::: containers)
//   Report:   src/import/report.js (MIGRATION.md / --json)
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import pc from 'picocolors';
import { createRequire } from 'module';
import { Importer, titleFromPath } from './import/core.js';
import { loadMintlifyConfig, convertMintlify } from './import/mintlify.js';
import { findFernDir, convertFern } from './import/fern.js';
import { convertGitbook, findGitbookRoot } from './import/gitbook.js';
import { loadMkdocsConfig, convertMkdocs, mkdocsPageDefaults } from './import/mkdocs.js';
import { renderMigrationMd } from './import/report.js';
import { buildThemeConfig, describeTheme } from './import/theme.js';
import { OpenApiPages } from './import/nav.js';
import { detectSsg, commonRoot } from './import/ssg.js';
import { stringifyFrontmatter } from './frontmatter.js';

const posix = (p) => p.split(path.sep).join('/');
const FORMAT_LABEL = { mintlify: 'Mintlify', fern: 'Fern', gitbook: 'GitBook', docusaurus: 'Docusaurus', mkdocs: 'MkDocs', sphinx: 'Sphinx', readme: 'ReadMe', vuepress: 'VuePress', vitepress: 'VitePress', starlight: 'Starlight (Astro)', nextra: 'Nextra (Next.js)', generic: 'Markdown folder' };
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__', '.docslit']);
const VENDORS = ['mintlify', 'fern', 'gitbook', 'mkdocs'];
const SSG_FORMATS = ['docusaurus', 'vitepress', 'starlight'];
const KEY_ORDER = ['$schema', 'name', 'description', 'url', 'basePath', 'logo', 'favicon', 'theme', 'layout', 'navbar', 'tabs', 'sidebar', 'anchors', 'footer', 'announcement', 'contextual', 'analytics', 'feedback', 'redirects', 'head', 'css', 'openapi', 'icons', 'attributes'];

// ─── detection ────────────────────────────────────────────────────────────────
// mkdocs-online.yml, mkdocs-offline.yml, ... at the top level, or docs/mkdocs.yml. Nav-only fragments
// (no site_name and no INHERIT) are skipped. Ties: names with "online" first, then shortest, then alphabetical.
async function findAltMkdocsConfig(dir) {
  let names = [];
  try { names = await fs.readdir(dir); } catch { return null; }
  const cands = [];
  for (const n of names) {
    if (!/^mkdocs.*\.ya?ml$/i.test(n) || n === 'mkdocs.yml' || n === 'mkdocs.yaml') continue;
    try {
      const txt = await fs.readFile(path.join(dir, n), 'utf8');
      if (/^\s*(site_name|INHERIT)\s*:/m.test(txt)) cands.push(n);
    } catch { /* unreadable: skip */ }
  }
  cands.sort((a, b) => (Number(/online/i.test(b)) - Number(/online/i.test(a))) || a.length - b.length || a.localeCompare(b));
  if (cands.length) return cands[0];
  for (const n of ['docs/mkdocs.yml', 'docs/mkdocs.yaml']) if (await fs.pathExists(path.join(dir, n))) return n;
  // per-language configs (FastAPI: docs/en/mkdocs.yml, docs/es/mkdocs.yml, ...): prefer English
  let langs = [];
  try { langs = (await fs.readdir(path.join(dir, 'docs'), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch { /* no docs/ */ }
  const withCfg = [];
  for (const l of langs) if (await fs.pathExists(path.join(dir, 'docs', l, 'mkdocs.yml'))) withCfg.push(l);
  if (withCfg.length) return `docs/${withCfg.includes('en') ? 'en' : withCfg[0]}/mkdocs.yml`;
  return null;
}

export async function detectFormat(dir) {
  const has = (rel) => fs.pathExists(path.join(dir, rel));
  if (await has('docs.json') || await has('mint.json')) return { format: 'mintlify', why: (await has('docs.json')) ? 'docs.json' : 'mint.json (legacy)' };
  if (await findFernDir(dir)) return { format: 'fern', why: 'fern/docs.yml' };
  if (await has('.gitbook.yaml') || await has('.gitbook.yml') || await has('SUMMARY.md') || await has('docs/SUMMARY.md')) return { format: 'gitbook', why: 'SUMMARY.md / .gitbook.yaml' };
  if (await has('.mintlifyignore') || await has('.mintlify')) return { format: 'mintlify', why: '.mintlify marker' };
  for (const ext of ['js', 'ts', 'mjs', 'mts', 'cjs']) if (await has(`docusaurus.config.${ext}`)) return { format: 'docusaurus', why: `docusaurus.config.${ext}` };
  if (await has('mkdocs.yml') || await has('mkdocs.yaml')) return { format: 'mkdocs', why: (await has('mkdocs.yml')) ? 'mkdocs.yml' : 'mkdocs.yaml' };
  if (await has('zensical.toml')) return { format: 'mkdocs', why: 'zensical.toml (Zensical)' };
  const alt = await findAltMkdocsConfig(dir);
  if (alt) return { format: 'mkdocs', why: alt, config: alt };
  if (await has('conf.py')) return { format: 'sphinx', why: 'conf.py' };
  return { format: 'generic', why: 'no known config file' };
}

async function walk(dir, base = dir, out = []) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.gitbook') { if (!['.well-known'].includes(e.name)) continue; }
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (SKIP_DIRS.has(e.name)) continue; await walk(p, base, out); }
    else out.push(posix(path.relative(base, p)));
  }
  return out;
}

const isMd = (f) => /\.(mdx?|md)$/i.test(f);
const isSnippetPath = (f) => /(^|\/)(snippets|_snippets)\//.test(f);

// ─── programmatic API ─────────────────────────────────────────────────────────
export async function runImport(options) {
  const { sourceDir: srcIn, outDir: outIn, from: fromOpt = null, config: configOpt = null, dryRun = false, themeOpt, force = false, versions = 'tabs', fetchText: fetchOpt, log = () => {}, validateOutput = true } = options;
  const sourceDir = path.resolve(srcIn);
  const outDir = path.resolve(outIn);
  if (!(await fs.pathExists(sourceDir))) throw new ImportError(`Source directory not found: ${sourceDir}`);
  if (outDir === sourceDir || outDir.startsWith(sourceDir + path.sep) && false) throw new ImportError('Output directory is the same as the source directory.');
  if (!dryRun && await fs.pathExists(outDir)) {
    const existing = (await fs.readdir(outDir)).filter((n) => n !== '.DS_Store');
    if (existing.length && !force) throw new ImportError(`Output directory is not empty: ${outDir} (use --force to overwrite, or --out another folder)`);
  }

  const from = configOpt ? 'mkdocs' : fromOpt;
  if (configOpt && fromOpt && fromOpt !== 'mkdocs') throw new ImportError('--config is only valid for MkDocs (--from mkdocs).');
  let detected = configOpt ? { format: 'mkdocs', why: `--config ${configOpt}`, config: configOpt }
    : from ? { format: from, why: `--from ${from}` } : await detectFormat(sourceDir);
  // Docusaurus / VitePress / Starlight: read the content folders from the tool's config
  let ssg = null;
  if (!configOpt && (SSG_FORMATS.includes(detected.format) || detected.format === 'generic')) {
    ssg = await detectSsg(sourceDir);
    if (ssg && from && from !== ssg.format) ssg = null;
    if (ssg && !ssg.contentDirs.length) throw new ImportError(`No content folder found for ${FORMAT_LABEL[ssg.format]} (${ssg.why}).`);
    if (ssg) detected = { format: ssg.format, why: ssg.why };
  }
  const vendor = VENDORS.includes(detected.format) ? detected.format : 'generic';
  log(`Detected: ${FORMAT_LABEL[detected.format] || detected.format} (${detected.why})`);

  const fetchText = fetchOpt === undefined ? defaultFetch : fetchOpt;
  let root = sourceDir;
  let fernDir = null;
  let gitbook = null;
  if (vendor === 'fern') { fernDir = await findFernDir(sourceDir); if (!fernDir) throw new ImportError('No fern/docs.yml found in the source directory.'); root = fernDir; }
  if (vendor === 'gitbook') { gitbook = await findGitbookRoot(sourceDir); root = gitbook.root; }
  if (ssg) root = commonRoot(ssg.contentDirs.map((d) => d.dir));
  let mk = null;
  if (vendor === 'mkdocs') {
    mk = await loadMkdocsConfig(sourceDir, detected.config ? { file: detected.config } : {});
    if (!mk.cfg) throw new ImportError(`Could not read ${mk.file || 'mkdocs.yml'}: ${mk.error}`);
    root = path.resolve(mk.dir, String(mk.cfg.docs_dir || 'docs'));
    if (!(await fs.pathExists(root))) throw new ImportError(`docs_dir "${mk.cfg.docs_dir || 'docs'}" from ${mk.file} was not found.`);
  }
  const publicDir = ssg && await fs.pathExists(ssg.publicDir) ? ssg.publicDir : null;
  const imp = new Importer({ sourceDir: root, outDir, vendor, assetRoot: publicDir, opts: { versions }, fetchText });
  imp.format = detected.format;
  if (ssg) {
    for (const s of ssg.skipped) imp.report('info', 'ssg-skipped', `${s} was not imported (only the current version and the default language are).`, { fix: 'Import other versions or languages separately if you need them.' });
  }
  { const rel = posix(path.relative(process.cwd(), sourceDir)); imp.displaySource = rel && !rel.startsWith('..') ? rel : posix(sourceDir); }
  const themeVal = options.noTheme ? false : (themeOpt || null);
  const popts = { themeOpt: themeVal, versions };

  let config = {};
  let navInfo = null;
  if (vendor === 'mintlify') {
    const loaded = await loadMintlifyConfig(sourceDir);
    if (loaded && loaded.cfg) { const r = await convertMintlify(imp, loaded, popts); config = r.config; navInfo = r.nav; }
    else {
      if (loaded?.error) imp.report('error', 'config-invalid-json', `${loaded.file} is not valid JSON: ${loaded.error}`, { file: loaded.file, action: 'Fell back to an auto-generated sidebar.', fix: 'Fix the JSON syntax and re-run.' });
      config = { name: path.basename(ssg ? ssg.base : sourceDir), sidebar: 'auto' };
    }
  } else if (vendor === 'fern') {
    config = (await convertFern(imp, fernDir, popts)).config;
  } else if (vendor === 'gitbook') {
    config = await convertGitbook(imp, gitbook, popts);
  } else if (vendor === 'mkdocs') {
    config = await convertMkdocs(imp, mk, popts);
  } else {
    config = { name: path.basename(sourceDir), sidebar: 'auto' };
    const t = buildThemeConfig({ vendor: 'generic', brand: {}, fonts: {}, themeOpt: themeVal, report: (s, c, m, x) => imp.report(s, c, m, x) });
    if (t !== undefined) config.theme = t;
  }

  // ── register every remaining markdown file as an unlisted page / reusable ──
  let all;
  if (ssg) {
    all = [];
    for (const d of ssg.contentDirs) {
      const skipDirs = new Set((d.exclude || []).map((x) => path.join(d.dir, x)));
      for (const rel of await walk(d.dir)) {
        const abs = path.join(d.dir, rel);
        if ([...skipDirs].some((x) => abs.startsWith(x + path.sep))) continue;
        all.push(posix(path.relative(root, abs)));
      }
    }
  } else all = await walk(root);
  const snippetFiles = [];
  for (const f of all) {
    if (!isMd(f)) continue;
    if (vendor === 'mkdocs') continue; // pages were registered from docs_dir by the adapter
    if (/^(README|CHANGELOG|LICENSE|CONTRIBUTING|CODE_OF_CONDUCT)\.md$/i.test(f) && vendor === 'mintlify') { imp.report('info', 'file-skipped', `${f} looks like a repository file, not a docs page; skipped.`, { file: f }); continue; }
    if (f === 'SUMMARY.md' && vendor === 'gitbook') continue;
    if (isSnippetPath(f)) { snippetFiles.push(f); continue; }
    if ([...(imp.consumedDirs || [])].some((d) => f.startsWith(d + '/'))) continue;
    const stem = f.replace(/\.(mdx?|md)$/i, '');
    if (imp.pages.has(f)) continue;
    if (ssg) {
      const abs = path.join(root, f);
      const cd = ssg.contentDirs.find((d) => abs.startsWith(d.dir + path.sep));
      if (!cd) continue;
      const inner = posix(path.relative(cd.dir, abs));
      if ((cd.exclude || []).some((x) => inner === x || inner.startsWith(x + '/'))) continue;
      // _partial.md files are included by other pages, not pages themselves
      if (/(^|\/)_[^/]*$/.test(inner)) { imp.report('info', 'ssg-partial-skipped', `${f} is a partial (name starts with _); it was not imported as a page.`, { file: f, fix: 'Turn it into a reusable (docs/_reusables/) and include it with <wc-include> where it was imported.' }); continue; }
      const s = [cd.prefix, inner.replace(/\.(mdx?|md)$/i, '')].filter(Boolean).join('/');
      if (imp.slugs.has(s)) continue;
      imp.registerPage(f, s, {});
      // Docusaurus blog posts are served at /blog/YYYY/MM/DD/name
      const dated = ssg.format === 'docusaurus' && cd.prefix === 'blog' && /^(\d{4})-(\d{2})-(\d{2})-(.+?)(\/index)?$/.exec(inner.replace(/\.(mdx?|md)$/i, ''));
      if (dated) (imp.slugAliases ??= new Map()).set(`blog/${dated[1]}/${dated[2]}/${dated[3]}/${dated[4]}`, s);
      continue;
    }
    let slug = vendor === 'fern' ? `_unlisted/${stem.replace(/^(docs\/)?pages\//, '')}` : stem;
    if (vendor === 'gitbook' && /(^|\/)README$/i.test(stem)) slug = stem.replace(/README$/i, 'index').replace(/^\/?index$/, 'index');
    if (imp.slugs.has(slug)) continue;
    // generic folders get an auto sidebar: their pages must be listed, not hidden
    imp.registerPage(f, slug, vendor === 'generic' ? {} : { hidden: true, unlisted: true });
  }
  if (!imp.slugs.size && !snippetFiles.length && !imp.openapi?.specs?.size && !/\.(json|ya?ml)$/.test(String(config.openapi || ''))) throw new ImportError('No .md or .mdx files found in the source directory.');

  // ── convert pages ──
  await prefetchCodeUrls(imp, root, all);
  const sortedPages = [...imp.pages].sort((a, b) => a[0].localeCompare(b[0]));
  const unlisted = [];
  for (const [srcRel, info] of sortedPages) {
    try {
      const res = await imp.convertFile(srcRel, { slug: info.slug, extraFm: info });
      const fm = { ...res.frontmatter };
      const openapiFm = fm.__openapi; const urlFm = fm.__url; delete fm.__openapi; delete fm.__api; delete fm.__url; delete fm.__slug;
      Object.assign(fm, info.override || {});
      if (info.hidden) fm.hidden = true;
      let body = res.body;
      if (openapiFm && imp.openapi) {
        const gen = await mintlifyApiPage(imp, openapiFm, info.slug, body, fm, srcRel);
        if (gen) { imp.outFiles.set(`docs/${info.slug}.md`, gen); imp.stats.pages++; continue; }
      }
      if (urlFm) { fm.redirect = urlFm; imp.report('info', 'page-external-url', `Page declares an external url (${urlFm}); it was converted to a redirect.`, { file: srcRel }); }
      if (info.unlisted) unlisted.push(info.slug);
      if (imp.pageAppend.has(info.slug)) body = body.replace(/\n*$/, '\n\n') + imp.pageAppend.get(info.slug);
      const text = stringifyFrontmatter('\n' + (body.endsWith('\n') ? body : body + '\n'), orderFm(fm));
      imp.outFiles.set(`docs/${info.slug}.md`, text);
      imp.stats.pages++;
    } catch (e) {
      imp.stats.pagesFailed++;
      imp.report('error', 'page-failed', `Page could not be converted: ${e.message}`, { file: srcRel, action: 'Skipped the page.', fix: 'Convert this page by hand.' });
    }
  }
  if (unlisted.length && vendor !== 'generic' && vendor !== 'gitbook' && vendor !== 'mkdocs') {
    imp.report('info', 'pages-unlisted', `${unlisted.length} page(s) are not in the source navigation. They were converted as hidden pages (built, but not in the sidebar): ${unlisted.slice(0, 8).join(', ')}${unlisted.length > 8 ? ', …' : ''}.`, { fix: 'Add them to the sidebar in docslit.json if they should be listed.' });
  }

  // ── reusables (snippets) ──
  for (const f of snippetFiles) if (/\.(mdx?|md)$/i.test(f)) imp.snippetOut(f);
  const doneSnippets = new Set();
  for (let guard = 0; guard < 50; guard++) {
    const pending = [...imp.reusables].filter(([src]) => !doneSnippets.has(src)).sort((a, b) => a[0].localeCompare(b[0]));
    if (!pending.length) break;
    for (const [srcRel, name] of pending) {
      doneSnippets.add(srcRel);
      const abs = path.join(root, srcRel);
      if (!(await fs.pathExists(abs))) { imp.report('error', 'snippet-missing', `Snippet "${srcRel}" was not found in the source project.`, { action: 'No reusable written.', fix: 'Add the snippet at docs/_reusables/' + name }); continue; }
      const res = await imp.convertFile(srcRel, { isSnippet: true });
      imp.outFiles.set(`docs/_reusables/${name}`, res.body.endsWith('\n') ? res.body : res.body + '\n');
      imp.stats.snippets++;
    }
  }

  // ── custom CSS / JS in the project root ──
  if (vendor === 'mintlify') {
    const cssParts = [];
    for (const f of all.filter((x) => /^[^/]+\.css$/.test(x)).sort()) cssParts.push(`/* ${f} */\n` + await fs.readFile(path.join(root, f), 'utf8'));
    imp.customCss = (imp.customCss || []).concat(cssParts);
    for (const f of all.filter((x) => /^[^/]+\.js$/.test(x)).sort()) imp.report('warning', 'custom-js', `Custom JavaScript file ${f} is auto-loaded by Mintlify but cannot be carried over.`, { file: f, action: 'Not copied.', fix: 'Add a <script> to "head" in docslit.json if it is still needed.' });
  }
  const cssAll = [...(imp.extraCss || []), ...(imp.customCss || [])];
  if (cssAll.length) { imp.outFiles.set('custom.css', cssAll.join('\n\n') + '\n'); config.css = 'custom.css'; }

  // ── API pages ──
  if (imp.openapi) for (const [slug, page] of [...imp.openapi.pages].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!imp.outFiles.has(`docs/${slug}.md`)) { imp.outFiles.set(`docs/${slug}.md`, page.content); imp.slugs.add(slug); imp.stats.pages++; }
  }
  // OpenAPI spec file(s) referenced from config were copied via configAsset.

  // ── bundled assets in conventional folders (MkDocs: every static file in docs_dir was registered) ──
  for (const f of vendor === 'mkdocs' ? [] : all) {
    if (isMd(f)) continue;
    if (/^(images?|img|static|assets|logo|logos|fonts|public|media)\//i.test(f) && /\.(png|jpe?g|gif|svg|webp|avif|ico|mp4|webm|woff2?|ttf|otf|pdf)$/i.test(f)) {
      const abs = path.join(root, f);
      if (!imp.assets.has(abs) && !imp.rootAssets.has(abs)) imp.assets.set(abs, imp.outRelForAsset(abs));
    }
  }

  // ── global variables / redirects ──
  if (Object.keys(imp.attributes).length) config.attributes = { ...(config.attributes || {}), ...imp.attributes };
  if (Object.keys(imp.redirects).length) config.redirects = { ...(config.redirects || {}), ...imp.redirects };
  if (!config.sidebar && !config.tabs) config.sidebar = 'auto';
  const finalConfig = {};
  for (const k of KEY_ORDER) if (config[k] !== undefined) finalConfig[k] = config[k];
  for (const k of Object.keys(config)) if (!(k in finalConfig)) finalConfig[k] = config[k];
  imp.outFiles.set('docslit.json', JSON.stringify(finalConfig, null, 2) + '\n');
  imp.outFiles.set('.gitignore', 'node_modules/\ndist/\n');

  // ── write ──
  const writeDir = dryRun ? await fs.mkdtemp(path.join(os.tmpdir(), 'docslit-import-')) : outDir;
  try {
    if (!dryRun && force && await fs.pathExists(outDir)) await fs.emptyDir(outDir);
    await fs.ensureDir(writeDir);
    for (const [rel, content] of [...imp.outFiles].sort((a, b) => a[0].localeCompare(b[0]))) {
      const p = path.join(writeDir, rel);
      await fs.ensureDir(path.dirname(p));
      await fs.writeFile(p, content);
    }
    const copied = new Set();
    for (const [abs, rel] of [...imp.assets].sort((a, b) => a[1].localeCompare(b[1]))) { const dest = path.join(writeDir, 'docs', rel); await fs.ensureDir(path.dirname(dest)); await fs.copy(abs, dest); copied.add(rel); }
    for (const [abs, rel] of [...imp.rootAssets].sort((a, b) => a[1].localeCompare(b[1]))) { const dest = path.join(writeDir, rel); await fs.ensureDir(path.dirname(dest)); await fs.copy(abs, dest); copied.add('root:' + rel); }
    imp.stats.assets = copied.size;

    // ── validate the result ──
    let validation = null;
    let markup = null;
    if (validateOutput) {
      const { runValidation } = await import('./validate.js');
      const v = await runValidation(writeDir);
      validation = { errors: v.summary.errors, warnings: v.summary.warnings, infos: v.summary.infos, issues: v.issues.filter((i) => i.level !== 'info').map((i) => ({ level: i.level, code: i.code, file: i.file, line: i.line ?? null, message: i.message })) };
      const { checkMarkup } = await import('./markup-check.js');
      let mErr = 0; let mWarn = 0;
      for (const [rel, content] of imp.outFiles) {
        if (!rel.startsWith('docs/') || !rel.endsWith('.md')) continue;
        const m = checkMarkup(String(content));
        mErr += m.summary.errors; mWarn += m.summary.warnings;
        for (const i of m.issues) if (i.level === 'error') validation.issues.push({ level: 'error', code: i.code, file: rel, line: i.line ?? null, message: i.message });
      }
      markup = { errors: mErr, warnings: mWarn };
      validation.errors += mErr;
    }

    const counts = imp.reporter.counts();
    const report = {
      tool: 'docslit import',
      version: createRequire(import.meta.url)('../package.json').version,
      source: { dir: imp.displaySource, format: detected.format, formatLabel: FORMAT_LABEL[detected.format] || detected.format, detectedBy: detected.why },
      out: (() => { const rel = posix(path.relative(process.cwd(), outDir)); return rel && !rel.startsWith('..') ? rel : posix(outDir); })(),
      dryRun,
      summary: { pages: imp.stats.pages, pagesFailed: imp.stats.pagesFailed, snippets: imp.stats.snippets, assets: imp.stats.assets || 0, components: imp.reporter.componentList().reduce((n, c) => n + c.count, 0) },
      counts,
      theme: finalConfig.theme ?? null,
      components: imp.reporter.componentList(),
      config: { mapped: imp.reporter.mapped, unmapped: imp.reporter.unmapped },
      items: imp.reporter.sortedItems(),
      validation,
      markup,
    };
    if (!dryRun) await fs.writeFile(path.join(outDir, 'MIGRATION.md'), renderMigrationMd(report));
    return report;
  } finally {
    if (dryRun) await fs.remove(writeDir);
  }
}

function orderFm(fm) {
  const order = ['title', 'description', 'sidebar_title', 'subtitle', 'headline', 'eyebrow', 'icon', 'badge', 'layout', 'availability', 'hidden', 'noindex', 'searchable', 'deprecated', 'hide_toc', 'toc_depth', 'hide_nav', 'hide_feedback', 'hide_actions', 'updated', 'readtime', 'sidebar_position', 'draft', 'redirect', 'contextual', 'attributes'];
  const out = {};
  for (const k of order) if (fm[k] !== undefined) out[k] = fm[k];
  for (const k of Object.keys(fm).sort()) if (!(k in out)) out[k] = fm[k];
  return out;
}

async function mintlifyApiPage(imp, openapiFm, slug, body, fm, srcRel) {
  const m = /^(?:(\S+\.(?:json|ya?ml))\s+)?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S.*)$/i.exec(String(openapiFm).trim());
  if (!m) { imp.report('warning', 'openapi-frontmatter', `Could not read openapi: "${openapiFm}" frontmatter.`, { file: srcRel, action: 'Converted as a plain page.' }); return null; }
  const specRel = m[1] ? m[1].replace(/^\//, '') : imp.openapiDefault;
  if (!specRel) { imp.report('warning', 'openapi-no-spec', `Page ${srcRel} references an operation but no spec file is configured.`, { file: srcRel, action: 'Converted as a plain page.' }); return null; }
  imp.configAsset(specRel, srcRel);
  const entry = await imp.openapi.load(specRel);
  if (!entry) return null;
  const ep = imp.openapi.find(entry, m[2], m[3]);
  if (!ep) { imp.report('warning', 'openapi-operation-missing', `Operation ${m[2]} ${m[3]} not found in ${specRel}.`, { file: srcRel, action: 'Converted as a plain page.' }); return null; }
  imp.openapi.ensurePage(ep, { slug, title: fm.title, extraBody: body });
  const page = imp.openapi.pages.get(slug);
  imp.openapi.pages.delete(slug);
  imp.reporter.count('openapi: frontmatter page', 'wc-endpoint');
  return page.content;
}

async function prefetchCodeUrls(imp, root, files) {
  imp.prefetched = new Map();
  if (!imp.fetchText || imp.vendor !== 'fern') return;
  const urls = new Set();
  for (const f of files.filter(isMd)) {
    let t = '';
    try { t = await fs.readFile(path.join(root, f), 'utf8'); } catch { continue; }
    for (const m of t.matchAll(/<Code\b[^>]*?\bsrc=["'](https?:\/\/[^"']+)["']/g)) urls.add(m[1]);
  }
  for (const u of [...urls].sort()) {
    try { imp.prefetched.set(u, await imp.fetchText(u)); } catch { /* reported at use */ }
  }
}

async function defaultFetch(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export class ImportError extends Error {}

/**
 * Convert ONE Mintlify/Fern/GitBook page (or snippet) to DocsLit Markdown without a project on disk.
 * Used by the MCP `convert_mdx` tool. Returns { markdown, frontmatter, body, issues, components }.
 */
export async function convertMdxSource(source, { from = 'mintlify', file = 'page.mdx' } = {}) {
  const vendor = VENDORS.includes(from) ? from : 'mintlify';
  const imp = new Importer({ sourceDir: os.tmpdir(), outDir: os.tmpdir(), vendor, fetchText: null });
  imp.lenient = true;
  if (vendor === 'mkdocs') imp.mkdocs = mkdocsPageDefaults();
  const res = await imp.convertSource(String(source), { srcRel: file });
  const body = res.body.endsWith('\n') ? res.body : res.body + '\n';
  const fm = orderFm(Object.fromEntries(Object.entries(res.frontmatter).filter(([k]) => !k.startsWith('__'))));
  return {
    markdown: stringifyFrontmatter('\n' + body, fm),
    frontmatter: fm,
    body,
    issues: imp.reporter.sortedItems().map((i) => ({ severity: i.severity, code: i.code, line: i.line, component: i.component, message: i.message, action: i.action, fix: i.fix })),
    components: imp.reporter.componentList(),
    reusables: [...imp.outFiles].filter(([k]) => k.startsWith('docs/_reusables/')).map(([k, v]) => ({ path: k.replace(/^docs\//, ''), content: String(v) })),
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
function parseImportArgs(args) {
  const o = { positional: [], flags: new Set(), opts: {} };
  const withValue = new Set(['--out', '--from', '--config', '--theme', '--versions']);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [k, v] = a.split('=');
      if (withValue.has(k)) { o.opts[k] = v !== undefined ? v : args[++i]; } else o.flags.add(k);
    } else o.positional.push(a);
  }
  return o;
}

export async function importDocs(args) {
  const p = parseImportArgs(args);
  const json = p.flags.has('--json');
  const sourceDir = path.resolve(process.cwd(), p.positional[0] ?? '.');
  const outDir = path.resolve(process.cwd(), p.opts['--out'] ?? sourceDir.replace(/\/$/, '') + '-docslit');
  const from = p.opts['--from'] || null;
  if (from && !VENDORS.includes(from)) { console.error(pc.red(`  Error: --from must be mintlify, fern, gitbook or mkdocs (got "${from}").`)); process.exit(1); }
  const config = p.opts['--config'] ? path.resolve(process.cwd(), p.opts['--config']) : null;
  const versions = p.opts['--versions'] || 'tabs';
  if (!['tabs', 'latest'].includes(versions)) { console.error(pc.red('  Error: --versions must be tabs or latest.')); process.exit(1); }
  const say = (s) => { if (!json) console.log(s); };
  say(`\n  ${pc.bold('DocsLit')} — importing from ${pc.cyan(path.relative(process.cwd(), sourceDir) || '.')}`);
  let report;
  try {
    report = await runImport({ sourceDir, outDir, from, config, dryRun: p.flags.has('--dry-run'), themeOpt: p.opts['--theme'] || null, noTheme: p.flags.has('--no-theme'), force: p.flags.has('--force'), versions, log: (m) => say(`  ${m}`) });
  } catch (e) {
    if (e instanceof ImportError) {
      if (json) console.log(JSON.stringify({ tool: 'docslit import', ok: false, error: e.message }, null, 2));
      else console.error(pc.red(`\n  Error: ${e.message}`));
      process.exit(1);
    }
    throw e;
  }
  if (json) { console.log(JSON.stringify(report, null, 2)); process.exit(report.validation && report.validation.errors > 0 ? 1 : 0); }
  printReport(report);
  if (report.validation && report.validation.errors > 0) process.exitCode = 1;
}

function printReport(r) {
  const line = pc.dim('─'.repeat(60));
  console.log(`\n${line}\n  ${pc.bold('DocsLit Import')} ${pc.dim('— ' + r.source.formatLabel + ' migration report')}\n${line}`);
  console.log(`\n  ${pc.bold('Source:')} ${pc.cyan(r.source.dir)}   ${pc.bold('Output:')} ${pc.cyan(r.out)}${r.dryRun ? pc.yellow('  (dry run, nothing written)') : ''}`);
  console.log(`  ${pc.green('✓')} Pages converted: ${r.summary.pages}${r.summary.pagesFailed ? pc.red(`  (${r.summary.pagesFailed} failed)`) : ''}   Snippets: ${r.summary.snippets}   Assets: ${r.summary.assets}`);
  if (r.components.length) {
    console.log(`\n  ${pc.bold('Components converted:')}`);
    for (const c of r.components.slice(0, 24)) console.log(`    ${pc.dim(('<' + c.from + '>').padEnd(26))} → ${pc.green(c.to.padEnd(22))} ${pc.cyan('×' + c.count)}`);
    if (r.components.length > 24) console.log(pc.dim(`    … and ${r.components.length - 24} more`));
  }
  console.log(`\n  ${pc.bold('Config keys mapped:')} ${r.config.mapped.length}   ${pc.bold('not converted:')} ${r.config.unmapped.length}`);
  if (r.theme) console.log(`  ${pc.bold('Theme:')} ${describeTheme(r.theme)}`);
  const c = r.counts;
  console.log(`\n  ${pc.bold('Needs attention:')} ${c.error ? pc.red(c.error + ' errors') : '0 errors'}, ${c.warning ? pc.yellow(c.warning + ' warnings') : '0 warnings'}, ${c.info} notes`);
  for (const i of r.items.filter((x) => x.severity !== 'info').slice(0, 15)) {
    console.log(`    ${i.severity === 'error' ? pc.red('✗') : pc.yellow('!')} ${pc.dim((i.file || 'project') + (i.line ? ':' + i.line : ''))} ${i.message}`);
  }
  if (r.items.filter((x) => x.severity !== 'info').length > 15) console.log(pc.dim('    … see MIGRATION.md for the full list'));
  if (r.validation) console.log(`\n  ${pc.bold('Validation of the result:')} ${r.validation.errors ? pc.red(r.validation.errors + ' errors') : pc.green('0 errors')}, ${r.validation.warnings} warnings`);
  for (const v of (r.validation?.issues || []).slice(0, 8)) console.log(`    ${pc.dim(v.level)} ${pc.dim(v.file || '')}${v.line ? ':' + v.line : ''} ${v.message}`);
  console.log(`\n${line}\n  ${pc.bold('Next steps')}\n${line}`);
  const name = path.basename(r.out);
  if (!r.dryRun) console.log(`\n  1.  ${pc.cyan('cd ' + name)}\n  2.  Read ${pc.cyan('MIGRATION.md')} (everything that needs a human, with file:line and how to fix it)\n  3.  ${pc.cyan('docslit dev')}\n`);
  else console.log(`\n  Re-run without ${pc.cyan('--dry-run')} to write the project.\n`);
}

export { titleFromPath };
