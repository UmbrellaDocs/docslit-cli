import fs from 'fs-extra';
import path from 'path';
import pc from 'picocolors';
import matter from 'gray-matter';

// ─── Built-in component registry ──────────────────────────────────────────────
const BUILTIN_COMPONENTS = new Set([
  'wc-button', 'wc-callout', 'wc-banner', 'wc-badge', 'wc-tooltip', 'wc-update',
  'wc-columns', 'wc-frame', 'wc-panel', 'wc-expandable', 'wc-accordion', 'wc-aside',
  'wc-step', 'wc-steps', 'wc-tabs', 'wc-tab', 'wc-view',
  'wc-codeblock', 'wc-code-group', 'wc-code-playground',
  'wc-image', 'wc-video', 'wc-file-download',
  'wc-param', 'wc-response-field', 'wc-api-explorer',
  'wc-tiles', 'wc-card',
  'wc-mermaid', 'wc-math',
  'wc-anchor', 'wc-indent', 'wc-if', 'wc-versions', 'wc-page-meta',
  'wc-table', 'wc-table-row', 'wc-table-cell',
  'wc-divider', 'wc-spacer',
]);

// Known valid frontmatter keys
const VALID_FM_KEYS = new Set([
  'title', 'description', 'icon', 'tag', 'readtime', 'updated',
  'sidebar_title', 'component', 'draft', 'order', 'redirect',
]);

// Recognised icon names (subset — just validates non-empty string)
function isValidIcon(v) { return typeof v === 'string' && v.trim().length > 0; }

// ─── Issue builder ─────────────────────────────────────────────────────────────
function issue(level, file, line, message) {
  return { level, file: file || null, line: line || null, message };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function lineOf(src, offset) {
  return src.slice(0, offset).split('\n').length;
}

function stripCodeFences(src) {
  return src.replace(/```[\s\S]*?```/g, m => ' '.repeat(m.length));
}

function stripInlineCode(src) {
  return src.replace(/`[^`\n]+`/g, m => ' '.repeat(m.length));
}

function stripProtectedContent(src) {
  return stripInlineCode(stripCodeFences(src));
}

// ─── 1. Config check ───────────────────────────────────────────────────────────
async function checkConfig(dir) {
  const issues = [];
  const cfgPath = path.join(dir, 'docslit.json');

  if (!await fs.pathExists(cfgPath)) {
    issues.push(issue('warning', 'docslit.json', null,
      'docslit.json not found — run `docslit init` to scaffold one'));
    return { issues, config: null, slugs: new Set() };
  }

  let config;
  try {
    config = await fs.readJson(cfgPath);
  } catch (e) {
    issues.push(issue('error', 'docslit.json', null, `JSON parse error: ${e.message}`));
    return { issues, config: null, slugs: new Set() };
  }

  if (!config.sidebar || !Array.isArray(config.sidebar)) {
    issues.push(issue('error', 'docslit.json', null,
      'Missing required field: "sidebar" (must be an array of groups)'));
    return { issues, config, slugs: new Set() };
  }

  const slugs = new Set();
  for (const group of config.sidebar) {
    if (typeof group !== 'object' || !group.group) {
      issues.push(issue('warning', 'docslit.json', null,
        `Sidebar group is missing a "group" name: ${JSON.stringify(group)}`));
      continue;
    }
    if (!Array.isArray(group.pages)) {
      issues.push(issue('warning', 'docslit.json', null,
        `Group "${group.group}" has no "pages" array`));
      continue;
    }
    for (const slug of group.pages) {
      if (typeof slug !== 'string') {
        issues.push(issue('error', 'docslit.json', null,
          `Group "${group.group}" contains a non-string page slug: ${JSON.stringify(slug)}`));
        continue;
      }
      if (/[^a-z0-9_\-\/]/.test(slug)) {
        issues.push(issue('warning', 'docslit.json', null,
          `Page slug "${slug}" contains unusual characters — slugs should be lowercase with hyphens`));
      }
      slugs.add(slug);
    }
  }

  // Check for duplicate slugs
  const seen = new Set();
  for (const group of config.sidebar) {
    for (const slug of (group.pages || [])) {
      if (typeof slug !== 'string') continue;
      if (seen.has(slug)) {
        issues.push(issue('warning', 'docslit.json', null,
          `Duplicate page slug in sidebar: "${slug}"`));
      }
      seen.add(slug);
    }
  }

  return { issues, config, slugs };
}

// ─── 2. File discovery ─────────────────────────────────────────────────────────
async function discoverFiles(dir) {
  const docsDir = path.join(dir, 'docs');
  if (!await fs.pathExists(docsDir)) return [];

  const results = [];
  async function walk(d) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (/\.(md|mdx)$/.test(e.name)) results.push(full);
    }
  }
  await walk(docsDir);
  return results;
}

// ─── 3. Slug resolution check ──────────────────────────────────────────────────
async function checkSlugs(dir, slugs, issues) {
  const docsDir = path.join(dir, 'docs');
  if (!await fs.pathExists(docsDir)) {
    issues.push(issue('warning', null, null,
      'docs/ directory not found — no pages to validate'));
    return;
  }

  for (const slug of slugs) {
    const mdPath  = path.join(docsDir, `${slug}.md`);
    const mdxPath = path.join(docsDir, `${slug}.mdx`);
    const indexPath = path.join(docsDir, slug, 'index.md');
    if (!await fs.pathExists(mdPath) &&
        !await fs.pathExists(mdxPath) &&
        !await fs.pathExists(indexPath)) {
      issues.push(issue('error', 'docslit.json', null,
        `Sidebar slug "${slug}" has no matching file (looked for docs/${slug}.md)`));
    }
  }
}

// ─── 4. Frontmatter check ──────────────────────────────────────────────────────
async function checkFrontmatter(files, dir, issues) {
  for (const file of files) {
    const rel = path.relative(dir, file);
    const src = await fs.readFile(file, 'utf8');
    let fm;
    try {
      fm = matter(src);
    } catch (e) {
      issues.push(issue('error', rel, null, `Frontmatter parse error: ${e.message}`));
      continue;
    }
    const data = fm.data || {};

    if (!data.title) {
      issues.push(issue('warning', rel, null,
        'Missing frontmatter field: "title" — page will show filename as heading'));
    }

    for (const key of Object.keys(data)) {
      if (!VALID_FM_KEYS.has(key)) {
        issues.push(issue('info', rel, null,
          `Unknown frontmatter key: "${key}" — will be ignored at build time`));
      }
    }

    if (data.readtime !== undefined && typeof data.readtime !== 'string') {
      issues.push(issue('warning', rel, null,
        `"readtime" should be a string (e.g. "5 min read"), got ${typeof data.readtime}`));
    }

    if (data.icon !== undefined && !isValidIcon(data.icon)) {
      issues.push(issue('warning', rel, null,
        `"icon" should be a non-empty string Lucide icon name`));
    }

    if (data.redirect !== undefined) {
      if (typeof data.redirect !== 'string') {
        issues.push(issue('error', rel, null,
          '"redirect" must be a string path'));
      } else {
        issues.push(issue('info', rel, null,
          `Page has redirect → ${data.redirect}`));
      }
    }
  }
}

// ─── 5. Internal link check ────────────────────────────────────────────────────
async function checkLinks(files, slugs, dir, issues) {
  for (const file of files) {
    const rel = path.relative(dir, file);
    const raw = await fs.readFile(file, 'utf8');
    const src = stripProtectedContent(raw);

    // Markdown links: [text](target)
    const mdLink = /\[([^\]]*)\]\(([^)]+)\)/g;
    let m;
    while ((m = mdLink.exec(src)) !== null) {
      const target = m[2].trim().split('#')[0];
      if (!target || /^https?:\/\//.test(target) || /^mailto:/.test(target)) continue;
      // Relative or absolute path link — resolve to a slug
      const slug = target.replace(/^\//, '').replace(/\.(md|mdx)$/, '');
      if (slug && !slugs.has(slug) && !isExternalish(target)) {
        issues.push(issue('error', rel, lineOf(raw, m.index),
          `Broken internal link → "${target}" (no page with slug "${slug}")`));
      }
    }

    // HTML href links (non-http)
    const htmlHref = /href="([^"]+)"/g;
    while ((m = htmlHref.exec(src)) !== null) {
      const target = m[1].trim().split('#')[0];
      if (!target || /^https?:\/\//.test(target) || target.startsWith('#') ||
          target.startsWith('javascript') || target.startsWith('mailto')) continue;
      const slug = target.replace(/^\//, '').replace(/\.(md|mdx)$/, '');
      if (slug && !slugs.has(slug)) {
        issues.push(issue('warning', rel, lineOf(raw, m.index),
          `Possible broken href → "${target}"`));
      }
    }
  }
}

function isExternalish(t) {
  return t.startsWith('http') || t.startsWith('mailto') || t.startsWith('#');
}

// ─── 6. Asset check ────────────────────────────────────────────────────────────
async function checkAssets(files, dir, issues) {
  for (const file of files) {
    const rel = path.relative(dir, file);
    const raw = await fs.readFile(file, 'utf8');
    const src = stripProtectedContent(raw);
    const fileDir = path.dirname(file);

    const patterns = [
      // Markdown image: ![alt](path)
      { re: /!\[([^\]]*)\]\(([^)]+)\)/g, idx: 2 },
      // HTML img src
      { re: /src="([^"]+)"/g, idx: 1 },
      // HTML href to local file
      { re: /href="(\.\.?\/[^"]+)"/g, idx: 1 },
    ];

    for (const { re, idx } of patterns) {
      let m;
      while ((m = re.exec(src)) !== null) {
        const target = m[idx].trim().split('#')[0].split('?')[0];
        if (!target || /^https?:\/\//.test(target) || target.startsWith('data:')) continue;

        // Only check relative paths
        if (!target.startsWith('.') && !target.startsWith('/')) continue;

        const absTarget = target.startsWith('/')
          ? path.join(dir, target)
          : path.resolve(fileDir, target);

        if (!await fs.pathExists(absTarget)) {
          issues.push(issue('error', rel, lineOf(raw, m.index),
            `Missing asset: "${target}" (resolved to ${path.relative(dir, absTarget)})`));
        }
      }
    }
  }
}

// ─── 7. Component check ────────────────────────────────────────────────────────
async function checkComponents(files, dir, issues) {
  const customDir = path.join(dir, 'components');
  let customComponents = new Set();

  if (await fs.pathExists(customDir)) {
    const entries = await fs.readdir(customDir);
    for (const e of entries) {
      // Custom components: my-widget.js → my-widget
      const base = e.replace(/\.(js|ts|mjs)$/, '');
      customComponents.add(base);
    }
  }

  for (const file of files) {
    const rel = path.relative(dir, file);
    const raw = await fs.readFile(file, 'utf8');
    // Strip code fences only — we still want to catch components in inline code
    const src = stripCodeFences(raw);

    const tagRe = /<(wc-[\w-]+)[\s>]/g;
    let m;
    while ((m = tagRe.exec(src)) !== null) {
      const tag = m[1];
      if (!BUILTIN_COMPONENTS.has(tag) && !customComponents.has(tag)) {
        issues.push(issue('warning', rel, lineOf(raw, m.index),
          `Unknown component <${tag}> — not a built-in and not found in components/`));
      }
    }
  }
}

// ─── 8. Orphan check ──────────────────────────────────────────────────────────
async function checkOrphans(files, slugs, dir, issues) {
  const docsDir = path.join(dir, 'docs');
  for (const file of files) {
    const rel = path.relative(docsDir, file);
    const slug = rel.replace(/\.(md|mdx)$/, '').replace(/\\/g, '/');
    if (!slugs.has(slug)) {
      issues.push(issue('info', path.relative(dir, file), null,
        `Orphaned page — not referenced in any sidebar group (slug: "${slug}")`));
    }
  }
}

// ─── Report renderer ───────────────────────────────────────────────────────────
function renderReport(allIssues, fileCount, elapsed) {
  const errors   = allIssues.filter(i => i.level === 'error');
  const warnings = allIssues.filter(i => i.level === 'warning');
  const infos    = allIssues.filter(i => i.level === 'info');

  const div = pc.dim('─'.repeat(60));

  console.log('');
  console.log(pc.bold('DocsLit Validate') + pc.dim(' — docs health report'));
  console.log(div);
  console.log(pc.dim(`Scanned: ${fileCount} file${fileCount !== 1 ? 's' : ''} — ${elapsed}ms`));

  if (allIssues.length === 0) {
    console.log('');
    console.log(pc.green('  ✓ All checks passed — no issues found'));
    console.log('');
    console.log(div);
    console.log(pc.green(pc.bold('0 errors, 0 warnings')));
    console.log('');
    return;
  }

  function renderGroup(items, label, icon, colorFn) {
    if (!items.length) return;
    console.log('');
    console.log(colorFn(pc.bold(`${label} (${items.length})`)));
    for (const item of items) {
      const loc = [
        item.file && pc.dim(item.file),
        item.line && pc.dim(`:${item.line}`),
      ].filter(Boolean).join('');
      const prefix = loc ? `  ${icon} [${loc}${pc.dim(']')} ` : `  ${icon} `;
      console.log(prefix + item.message);
    }
  }

  renderGroup(errors,   'ERRORS',   pc.red('✗'),   pc.red);
  renderGroup(warnings, 'WARNINGS', pc.yellow('⚠'), pc.yellow);
  renderGroup(infos,    'INFO',     pc.cyan('ℹ'),   pc.cyan);

  console.log('');
  console.log(div);

  const summary = [
    errors.length   ? pc.red(pc.bold(`${errors.length} error${errors.length !== 1 ? 's' : ''}`))       : null,
    warnings.length ? pc.yellow(`${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`)        : null,
    infos.length    ? pc.cyan(`${infos.length} info`)                                                   : null,
  ].filter(Boolean).join(', ');

  console.log(summary + (errors.length ? pc.dim(' → exit 1') : pc.dim(' → exit 0')));
  console.log('');
}

// ─── Entry point ───────────────────────────────────────────────────────────────
export async function validate(args) {
  const strict    = args.includes('--strict');
  const positional = args.filter(a => !a.startsWith('--'));
  const dir       = path.resolve(positional[0] || '.');

  if (!await fs.pathExists(dir)) {
    console.error(pc.red(`  Error: Directory not found: ${dir}`));
    process.exit(1);
  }

  const t0 = Date.now();
  console.log(pc.dim(`\n  Validating ${dir}…`));

  const allIssues = [];

  // 1. Config
  const { issues: cfgIssues, slugs } = await checkConfig(dir);
  allIssues.push(...cfgIssues);

  // 2. Slug file resolution
  await checkSlugs(dir, slugs, allIssues);

  // 3. Discover markdown files
  const files = await discoverFiles(dir);

  // 4–8. Per-file checks (in parallel)
  const [fmIssues, linkIssues, assetIssues, compIssues] = await Promise.all([
    (async () => { const a = []; await checkFrontmatter(files, dir, a); return a; })(),
    (async () => { const a = []; await checkLinks(files, slugs, dir, a); return a; })(),
    (async () => { const a = []; await checkAssets(files, dir, a); return a; })(),
    (async () => { const a = []; await checkComponents(files, dir, a); return a; })(),
  ]);
  allIssues.push(...fmIssues, ...linkIssues, ...assetIssues, ...compIssues);

  // 8. Orphans
  await checkOrphans(files, slugs, dir, allIssues);

  const elapsed = Date.now() - t0;
  renderReport(allIssues, files.length, elapsed);

  const hasErrors = allIssues.some(i => i.level === 'error') ||
    (strict && allIssues.some(i => i.level === 'warning'));

  process.exit(hasErrors ? 1 : 0);
}
