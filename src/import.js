import fs from 'fs-extra';
import path from 'path';
import pc from 'picocolors';
import matter from 'gray-matter';
import readline from 'node:readline';
import git from 'isomorphic-git';
import nodeFs from 'node:fs';

// ─── Mintlify → DocsLit component map ─────────────────────────────────────────
// tag:         output wc-* tag (null = special handling)
// fixedAttrs:  attrs always written on the output tag
// passAttrs:   prop names to pass through from source
// attrRename:  { srcProp: destProp }
// autoNumber:  inject n="N" based on sibling position (for wc-step)
// unwrap:      drop the wrapper tag, keep its children verbatim
// flatten:     drop the tag, keep inner text content
// remove:      drop tag + all children

// Font Awesome → built-in Lucide icon name mapping.
// Icons not in this map are kept as-is and fetched from FA CDN at runtime.
const FA_TO_LUCIDE = {
  'check': 'check', 'check-circle': 'check', 'circle-check': 'check',
  'times': 'x', 'xmark': 'x', 'circle-xmark': 'x', 'times-circle': 'x',
  'exclamation-triangle': 'warning', 'triangle-exclamation': 'warning',
  'info-circle': 'info', 'circle-info': 'info',
  'exclamation-circle': 'error', 'circle-exclamation': 'error',
  'arrow-right': 'arrow-right', 'arrow-left': 'arrow-left',
  'arrow-up': 'arrow-up', 'arrow-down': 'arrow-down',
  'chevron-right': 'chevron-right', 'angle-right': 'chevron-right',
  'chevron-down': 'chevron-down', 'angle-down': 'chevron-down',
  'external-link': 'external-link', 'external-link-alt': 'external-link',
  'up-right-from-square': 'external-link', 'arrow-up-right-from-square': 'external-link',
  'link': 'link', 'chain': 'link',
  'copy': 'copy', 'clone': 'copy',
  'download': 'download', 'cloud-download': 'download', 'cloud-arrow-down': 'download',
  'code': 'code',
  'terminal': 'terminal',
  'file': 'file', 'file-alt': 'file', 'file-lines': 'file',
  'folder': 'folder', 'folder-open': 'folder',
  'search': 'search', 'magnifying-glass': 'search',
  'star': 'star',
  'bolt': 'zap', 'lightning': 'zap', 'zap': 'zap',
  'book': 'book', 'book-open': 'book',
  'cog': 'settings', 'gear': 'settings', 'sliders': 'settings',
  'sliders-h': 'settings', 'wrench': 'settings',
  'user': 'user', 'user-circle': 'user', 'circle-user': 'user',
  'home': 'home', 'house': 'home',
  'th-large': 'grid', 'grid': 'grid', 'table-cells-large': 'grid',
  'list': 'list', 'list-ul': 'list', 'bars': 'list',
  'eye': 'eye',
  'lock': 'lock',
  'box': 'package', 'cube': 'package', 'cubes': 'package',
  'globe': 'globe', 'earth-americas': 'globe', 'earth': 'globe',
  'microchip': 'cpu', 'chip': 'cpu',
  'rocket': 'zap', 'paper-plane': 'zap',
  'shield': 'lock', 'shield-alt': 'lock', 'shield-halved': 'lock',
  'plug': 'zap', 'power-off': 'zap',
  'envelope': 'file', 'mail': 'file',
};

const COMPONENT_MAP = {
  // ── Callouts ────────────────────────────────────────────────────────────────
  Note:    { tag: 'wc-callout', fixedAttrs: { type: 'info',    title: 'Note'    } },
  Info:    { tag: 'wc-callout', fixedAttrs: { type: 'info',    title: 'Info'    } },
  Warning: { tag: 'wc-callout', fixedAttrs: { type: 'warning', title: 'Warning' } },
  Danger:  { tag: 'wc-callout', fixedAttrs: { type: 'danger',  title: 'Danger'  } },
  Caution: { tag: 'wc-callout', fixedAttrs: { type: 'warning', title: 'Caution' } },
  Tip:     { tag: 'wc-callout', fixedAttrs: { type: 'tip',     title: 'Tip'     } },
  Check:   { tag: 'wc-callout', fixedAttrs: { type: 'success', title: 'Check'   } },
  Success: { tag: 'wc-callout', fixedAttrs: { type: 'success', title: 'Success' } },
  // ── Cards ────────────────────────────────────────────────────────────────────
  Card:      { tag: 'wc-card',  passAttrs: ['title', 'href', 'color'], attrRename: { icon: 'icon-name' } },
  CardGroup: { tag: 'wc-tiles', passAttrs: ['cols'] },
  // ── Tabs ─────────────────────────────────────────────────────────────────────
  Tabs: { tag: 'wc-tabs' },
  Tab:  { tag: 'wc-tab', attrRename: { title: 'label' }, passAttrs: ['label'] },
  // ── Accordion ────────────────────────────────────────────────────────────────
  Accordion:      { tag: 'wc-accordion', passAttrs: ['title'] },
  AccordionGroup: { tag: 'wc-accordion-group' },
  // ── Steps ────────────────────────────────────────────────────────────────────
  Steps: { tag: 'wc-steps' },
  Step:  { tag: 'wc-step', passAttrs: ['title'], autoNumber: true },
  // ── Code ─────────────────────────────────────────────────────────────────────
  CodeGroup: { tag: 'wc-code-group' },
  // ── Layout / media ───────────────────────────────────────────────────────────
  Frame:   { tag: 'wc-frame',   passAttrs: ['caption', 'type'] },
  Columns: { tag: 'wc-columns' },
  Column:  { tag: null, unwrap: true },
  Panel:   { tag: 'wc-panel',   passAttrs: ['title'] },
  // ── UI elements ──────────────────────────────────────────────────────────────
  Badge:      { tag: 'wc-badge',      passAttrs: ['variant', 'color'] },
  Expandable: { tag: 'wc-expandable', passAttrs: ['title', 'defaultOpen'] },
  Update:     { tag: 'wc-update',     passAttrs: ['label', 'date'] },
  // ── API reference ────────────────────────────────────────────────────────────
  ParamField:    { tag: 'wc-param',
                   passAttrs: ['type', 'required', 'optional', 'default'],
                   attrRename: { path: 'name', query: 'name', body: 'name', header: 'name' } },
  ResponseField: { tag: 'wc-response-field', passAttrs: ['name', 'type', 'required'] },
  // ── Unsupported (graceful degradation) ───────────────────────────────────────
  Tooltip: { tag: null, flatten: true },
  Icon:    { tag: null, remove: true },
  Snippet: { tag: null, flatten: true },
};

// ─── JSX prop parser ──────────────────────────────────────────────────────────
// Converts the raw attribute string from a JSX tag into structured { name, value } pairs.
// Handles: name="v", name='v', name={2}, name={true/false}, name={"str"}, bare `name`.
function parseJSXProps(raw) {
  if (!raw || !raw.trim()) return [];
  const props = [];
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (i >= raw.length) break;
    const nameStart = i;
    while (i < raw.length && /[\w-]/.test(raw[i])) i++;
    const name = raw.slice(nameStart, i);
    if (!name) { i++; continue; }
    while (i < raw.length && raw[i] === ' ') i++;
    if (i >= raw.length || raw[i] !== '=') {
      props.push({ name, value: true, type: 'bool' });
      continue;
    }
    i++; // skip '='
    while (i < raw.length && raw[i] === ' ') i++;
    if (raw[i] === '"') {
      i++;
      const s = i;
      while (i < raw.length && raw[i] !== '"') i++;
      props.push({ name, value: raw.slice(s, i), type: 'string' });
      i++;
    } else if (raw[i] === "'") {
      i++;
      const s = i;
      while (i < raw.length && raw[i] !== "'") i++;
      props.push({ name, value: raw.slice(s, i), type: 'string' });
      i++;
    } else if (raw[i] === '{') {
      i++;
      const s = i;
      let depth = 1;
      while (i < raw.length && depth > 0) {
        if (raw[i] === '{') depth++;
        else if (raw[i] === '}') depth--;
        i++;
      }
      const expr = raw.slice(s, i - 1).trim();
      if (expr === 'true')          props.push({ name, value: true,  type: 'bool' });
      else if (expr === 'false')    props.push({ name, value: false, type: 'bool' });
      else if (/^\d+$/.test(expr)) props.push({ name, value: expr,  type: 'number' });
      else if (/^"([^"]*)"$/.test(expr)) props.push({ name, value: expr.slice(1,-1), type: 'string' });
      else if (/^'([^']*)'$/.test(expr)) props.push({ name, value: expr.slice(1,-1), type: 'string' });
      else props.push({ name, value: null, type: 'complex', raw: expr });
    } else {
      // Unknown value form — skip
      while (i < raw.length && !/\s/.test(raw[i])) i++;
    }
  }
  return props;
}

// Build an HTML attribute string from parsed props + component config.
function buildAttrs(rawAttrStr, config) {
  const { fixedAttrs = {}, passAttrs = [], attrRename = {} } = config;
  const parts = [];

  // Fixed attrs always go first
  for (const [k, v] of Object.entries(fixedAttrs)) {
    parts.push(`${k}="${v}"`);
  }

  const allSourceNames = [...passAttrs, ...Object.keys(attrRename)];
  const parsed = parseJSXProps(rawAttrStr);

  for (const prop of parsed) {
    if (!allSourceNames.includes(prop.name)) continue;
    const dest = attrRename[prop.name] ?? prop.name;
    if (fixedAttrs[dest] !== undefined) continue; // already added as fixed

    if (prop.type === 'bool' && prop.value === false) continue;
    if (prop.type === 'bool' && prop.value === true)  { parts.push(dest); continue; }
    if (prop.type === 'complex' || prop.value === null) continue; // can't convert
    let val = prop.value;
    if (prop.name === 'icon' && typeof val === 'string') val = FA_TO_LUCIDE[val] || val;
    parts.push(`${dest}="${val}"`);
  }

  return parts.join(' ');
}

// ─── Content converter ────────────────────────────────────────────────────────
// Converts a single file's Markdown body from Mintlify MDX → DocsLit Markdown.
// Returns { converted: string, stats: Map<name, count>, issues: string[] }
function convertContent(body, filePath) {
  const stats  = new Map();   // component name → count
  const issues = [];

  const track = (name) => stats.set(name, (stats.get(name) ?? 0) + 1);

  let out = body;

  // 1. Strip MDX import/export statements
  const importCount = (out.match(/^import\s+.+/gm) || []).length;
  const exportCount = (out.match(/^export\s+.+/gm) || []).length;
  if (importCount) track('__import');
  if (exportCount) track('__export');
  out = out.replace(/^import\s+[^\n]+\n?/gm, '');
  out = out.replace(/^export\s+(?:default\s+)?[^\n]+\n?/gm, '');

  // 2. Strip {/* comment */} JSX comments
  out = out.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  // 3. Process each known component
  for (const [name, cfg] of Object.entries(COMPONENT_MAP)) {
    // Self-closing form: <Name ... /> or <Name/>
    const selfRe = new RegExp(
      `<${name}(\\s[^>]*)?\\/\\s*>`, 'g'
    );

    // Open/close form: <Name ...>...</Name>  (lazy, handles multi-line)
    const pairRe = new RegExp(
      `<${name}(\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'gs'
    );

    if (cfg.remove) {
      const before = out;
      out = out.replace(selfRe, () => { track(name); return ''; });
      out = out.replace(pairRe, () => { track(name); return ''; });
      if (out !== before) { /* counted above */ }
      continue;
    }

    if (cfg.flatten) {
      out = out.replace(selfRe, (_, rawAttrs) => { track(name); return ''; });
      out = out.replace(pairRe, (_, rawAttrs, inner) => { track(name); return inner.trim(); });
      continue;
    }

    if (cfg.unwrap) {
      out = out.replace(selfRe, (_, rawAttrs) => { track(name); return ''; });
      out = out.replace(pairRe, (_, rawAttrs, inner) => { track(name); return inner.trim(); });
      continue;
    }

    // Normal component conversion
    const { tag } = cfg;
    out = out.replace(selfRe, (_, rawAttrs) => {
      track(name);
      const attrs = buildAttrs(rawAttrs || '', cfg);
      return attrs ? `<${tag} ${attrs}></${tag}>` : `<${tag}></${tag}>`;
    });

    out = out.replace(pairRe, (_, rawAttrs, inner) => {
      track(name);
      const attrs = buildAttrs(rawAttrs || '', cfg);
      const trimmed = inner.trim();
      return attrs
        ? `<${tag} ${attrs}>\n${trimmed}\n</${tag}>`
        : `<${tag}>\n${trimmed}\n</${tag}>`;
    });
  }

  // 4. Auto-number <wc-step> within each <wc-steps> block
  out = out.replace(/<wc-steps>([\s\S]*?)<\/wc-steps>/g, (_, inner) => {
    let n = 0;
    const numbered = inner.replace(/<wc-step\b/g, () => `<wc-step n="${++n}"`);
    return `<wc-steps>${numbered}</wc-steps>`;
  });

  // 5. Strip remaining JSX expressions {…} that aren't inside code spans/blocks.
  // These are MDX interpolations (e.g. {props.name}, {<Foo />}) that have no markdown equivalent.
  out = out.replace(/```[\s\S]*?```|`[^`]+`|(\{[^{}]*\})/g, (match, jsxExpr) => {
    // If it matched a code block/span, leave it alone; otherwise drop the JSX expression
    return jsxExpr !== undefined ? '' : match;
  });

  // 7. Detect any remaining PascalCase JSX-style tags (unknown Mintlify or custom components)
  const unknownTags = [];
  const unknownRe = /<([A-Z][a-zA-Z]+)[\s/>]/g;
  let m;
  while ((m = unknownRe.exec(out)) !== null) {
    if (!unknownTags.includes(m[1])) unknownTags.push(m[1]);
  }
  if (unknownTags.length) {
    issues.push(`Unknown components not converted: ${unknownTags.map(t => `<${t}>`).join(', ')}`);
  }

  // 8. Trim leading/trailing blank lines left by removed imports
  out = out.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');

  return { converted: out, stats, issues };
}

// ─── File converter ───────────────────────────────────────────────────────────
async function convertFile(srcPath, outPath, relPath) {
  const raw = await fs.readFile(srcPath, 'utf8');

  // gray-matter can throw on malformed YAML (e.g. multiline implicit keys, bare `<` values).
  // Fall back to a simple regex extraction so the file isn't lost entirely.
  let frontmatter = {};
  let body = raw;
  try {
    const parsed = matter(raw);
    frontmatter = parsed.data;
    body = parsed.content;
  } catch {
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (m) {
      body = m[2];
      for (const line of m[1].split('\n')) {
        const ci = line.indexOf(':');
        if (ci < 1) continue;
        const k = line.slice(0, ci).trim();
        const v = line.slice(ci + 1).trim().replace(/^['"]|['"]$/g, '');
        if (/^[a-zA-Z_][\w_-]*$/.test(k)) frontmatter[k] = v;
      }
    }
  }

  const { converted, stats, issues } = convertContent(body, relPath);

  // Normalise frontmatter: Mintlify uses `sidebarTitle`, DocsLit uses `sidebar_title`
  if (frontmatter.sidebarTitle) {
    frontmatter.sidebar_title = frontmatter.sidebarTitle;
    delete frontmatter.sidebarTitle;
  }
  // Remove Mintlify-specific fields that DocsLit doesn't use
  for (const k of ['openapi', 'api', 'mode', 'noindex', 'deprecated']) {
    delete frontmatter[k];
  }
  // Strip any frontmatter values that contain HTML/JSX — they confuse yaml serialisers downstream
  for (const [k, v] of Object.entries(frontmatter)) {
    if (typeof v === 'string' && /<[a-zA-Z]/.test(v)) delete frontmatter[k];
  }

  // Rebuild the file: frontmatter + converted body.
  // matter.stringify can also throw when values contain characters js-yaml dislikes;
  // fall back to a simple hand-rolled serialiser.
  let out = '';
  const fm = frontmatter;
  if (Object.keys(fm).length) {
    try {
      out = matter.stringify(converted, fm);
    } catch {
      const lines = Object.entries(fm)
        .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
        .map(([k, v]) => `${k}: ${JSON.stringify(String(v))}`);
      out = lines.length ? `---\n${lines.join('\n')}\n---\n${converted}` : converted;
    }
  } else {
    out = converted;
  }

  await fs.ensureDir(path.dirname(outPath));
  // Always write as .md (strip .mdx)
  const finalPath = outPath.replace(/\.mdx$/, '.md');
  await fs.writeFile(finalPath, out, 'utf8');

  return { stats, issues, wasmdx: srcPath.endsWith('.mdx') };
}

// ─── Config detection ─────────────────────────────────────────────────────────
// Returns { format, config } where format = 'mintlify' | 'fern' | 'gitbook' | 'none'
async function detectSourceConfig(sourceDir) {
  const exists = (rel) => fs.pathExists(path.join(sourceDir, rel));
  const readJson = async (rel) => {
    try { return JSON.parse(await fs.readFile(path.join(sourceDir, rel), 'utf8')); }
    catch { return null; }
  };

  // Mintlify — mint.json or docs.json
  for (const f of ['mint.json', 'docs.json']) {
    if (await exists(f)) {
      const config = await readJson(f);
      if (config) return { format: 'mintlify', config };
    }
  }
  if (await exists('.mintlifyignore') || await exists('.mintlify')) {
    return { format: 'mintlify', config: null };
  }

  // Fern
  if (await exists('fern/fern.config.json') || await exists('fern.config.json')) {
    const fernConfig = (await exists('fern/fern.config.json'))
      ? path.join(sourceDir, 'fern', 'fern.config.json')
      : path.join(sourceDir, 'fern.config.json');
    const fernDocs = path.join(sourceDir, 'fern', 'docs.yml');
    return { format: 'fern', config: { fernConfig, fernDocs } };
  }

  // GitBook — SUMMARY.md or .gitbook.yaml
  if (await exists('SUMMARY.md') || await exists('.gitbook.yaml') || await exists('.gitbook.yml')) {
    const summary = path.join(sourceDir, 'SUMMARY.md');
    return { format: 'gitbook', config: { summary } };
  }

  // Docusaurus — docusaurus.config.{js,ts,mjs,mts,cjs}
  for (const ext of ['js', 'ts', 'mjs', 'mts', 'cjs']) {
    if (await exists(`docusaurus.config.${ext}`)) {
      return { format: 'docusaurus', config: null };
    }
  }

  // MkDocs
  if (await exists('mkdocs.yml') || await exists('mkdocs.yaml')) {
    return { format: 'mkdocs', config: null };
  }

  // Sphinx
  if (await exists('conf.py')) {
    return { format: 'sphinx', config: null };
  }

  // ReadMe
  if (await exists('rdme.json') || await exists('.rdme.json')) {
    return { format: 'readme', config: null };
  }

  // VuePress
  if (await exists('.vuepress/config.js') || await exists('.vuepress/config.ts')) {
    return { format: 'vuepress', config: null };
  }

  // VitePress
  for (const ext of ['js', 'ts', 'mjs', 'mts']) {
    if (await exists(`.vitepress/config.${ext}`)) {
      return { format: 'vitepress', config: null };
    }
  }

  // Starlight (Astro)
  for (const ext of ['mjs', 'ts', 'js']) {
    if (await exists(`astro.config.${ext}`)) {
      return { format: 'starlight', config: null };
    }
  }

  // Nextra (Next.js + theme.config)
  for (const ext of ['jsx', 'tsx', 'js', 'ts']) {
    if (await exists(`theme.config.${ext}`)) {
      return { format: 'nextra', config: null };
    }
  }

  return { format: 'none', config: null };
}

// ─── Sidebar builder ──────────────────────────────────────────────────────────
// Converts Mintlify navigation → DocsLit sidebar groups.
function mintNavToSidebar(navigation = []) {
  let groups = [];
  if (Array.isArray(navigation)) {
    groups = navigation;
  } else if (navigation.tabs && Array.isArray(navigation.tabs)) {
    for (const tab of navigation.tabs) {
      groups.push(...(tab.groups || []));
    }
  } else if (navigation.groups && Array.isArray(navigation.groups)) {
    groups = navigation.groups;
  }

  const sidebar = [];
  for (const group of groups) {
    if (!group.group) continue;
    const pages = [];
    for (const page of (group.pages || [])) {
      if (typeof page === 'string') {
        pages.push(page.replace(/\.(mdx?|md)$/, ''));
      } else if (page.group) {
        for (const sub of (page.pages || [])) {
          if (typeof sub === 'string') pages.push(sub.replace(/\.(mdx?|md)$/, ''));
        }
      }
    }
    if (pages.length) sidebar.push({ group: group.group, pages });
  }
  return sidebar;
}

// Auto-build a sidebar from discovered files when no config is found.
function autoSidebar(slugs) {
  const groups = {};
  for (const slug of slugs) {
    const parts = slug.split('/');
    const group = parts.length > 1 ? parts[0] : 'Docs';
    if (!groups[group]) groups[group] = [];
    groups[group].push(slug);
  }
  return Object.entries(groups).map(([group, pages]) => ({ group, pages }));
}

// ─── File walker ──────────────────────────────────────────────────────────────
async function walkMdFiles(dir) {
  const files = [];
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return files; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'dist', '.next', '__pycache__'].includes(e.name)) continue;
      files.push(...(await walkMdFiles(p)));
    } else if (/\.(md|mdx)$/i.test(e.name)) {
      files.push(p);
    }
  }
  return files;
}

// ─── Report printer ───────────────────────────────────────────────────────────
function printReport({ sourceDir, outDir, dryRun, files, totalStats, allIssues, docslitConfig, detectedFormat }) {
  const w = (s) => process.stdout.write(s);
  const line = pc.dim('─'.repeat(58));

  console.log(`\n${line}`);
  console.log(pc.bold('  DocsLit Import') + pc.dim(' — Mintlify migration report'));
  console.log(line);

  console.log(`\n  ${pc.bold('Source:')}  ${pc.cyan(sourceDir)}`);
  if (!dryRun) console.log(`  ${pc.bold('Output:')}  ${pc.cyan(outDir)}`);
  if (dryRun)  console.log(`  ${pc.yellow('Dry run — no files written')}`);
  console.log(`  ${pc.bold('Format:')}  ${detectedFormat}`);

  const ok  = files.filter(f => !f.error).length;
  const err = files.filter(f => f.error).length;
  console.log(`\n  ${pc.bold('Files processed:')}  ${files.length}`);
  console.log(`  ${pc.green('✓')} Converted:  ${ok}`);
  if (err) console.log(`  ${pc.red('✗')} Errors:     ${err}`);

  // Component conversion table
  const compStats = [];
  for (const [name, cfg] of Object.entries(COMPONENT_MAP)) {
    const count = totalStats.get(name) ?? 0;
    if (count) compStats.push({ name, tag: cfg.tag, count });
  }
  const importCount = totalStats.get('__import') ?? 0;
  const exportCount = totalStats.get('__export') ?? 0;

  if (compStats.length || importCount) {
    console.log(`\n  ${pc.bold('Component conversions:')}`);
    for (const { name, tag, count } of compStats.sort((a,b) => b.count - a.count)) {
      const src  = pc.dim(`<${name}>`);
      const dest = tag ? pc.green(`<${tag}>`) : pc.yellow('(removed/unwrapped)');
      const n    = pc.cyan(`×${count}`);
      console.log(`    ${src.padEnd(28)} →  ${dest.padEnd(30)} ${n}`);
    }
    if (importCount) console.log(`    ${pc.dim('import statements removed'.padEnd(26))}                          ${pc.cyan(`×${importCount}`)}`);
    if (exportCount) console.log(`    ${pc.dim('export statements removed'.padEnd(26))}                          ${pc.cyan(`×${exportCount}`)}`);
  } else {
    console.log(`\n  ${pc.dim('No Mintlify components found — files copied with frontmatter cleaned.')}`);
  }

  // Issues
  const flatIssues = allIssues.flatMap(({ rel, issues }) => issues.map(i => ({ rel, msg: i })));
  if (flatIssues.length) {
    console.log(`\n  ${pc.bold(pc.yellow('⚠  Items needing manual review:'))}`);
    for (const { rel, msg } of flatIssues.slice(0, 20)) {
      console.log(`    ${pc.dim(rel)}`);
      console.log(`       ${pc.yellow(msg)}`);
    }
    if (flatIssues.length > 20) {
      console.log(`    ${pc.dim(`… and ${flatIssues.length - 20} more`)}`);
    }
  }

  // Sidebar summary
  if (docslitConfig) {
    const total = docslitConfig.sidebar.reduce((s, g) => s + g.pages.length, 0);
    console.log(`\n  ${pc.bold('Generated docslit.json:')}`);
    console.log(`    ${docslitConfig.sidebar.length} sidebar group${docslitConfig.sidebar.length !== 1 ? 's' : ''},  ${total} page${total !== 1 ? 's' : ''}`);
  }

  // File errors
  const errFiles = files.filter(f => f.error);
  if (errFiles.length) {
    console.log(`\n  ${pc.bold(pc.red('Errors:'))}`);
    for (const f of errFiles) {
      console.log(`    ${pc.red('✗')} ${pc.dim(f.rel)}  ${pc.red(f.error)}`);
    }
  }

  // Next steps
  const outName = path.basename(outDir);
  console.log(`\n${line}`);
  console.log(pc.bold('  Next steps'));
  console.log(line);
  console.log(`\n  1.  ${pc.cyan(`cd ${outName}`)}`);
  console.log(`  2.  ${pc.cyan('npx docslit dev')}  ${pc.dim('(or: docslit dev if installed globally)')}`);

  if (flatIssues.length) {
    console.log(`  3.  ${pc.yellow('Review the items flagged above')} — these contained complex`);
    console.log(`      JSX expressions or unsupported components that need a manual look.`);
  }

  const unknownComps = allIssues.flatMap(({ issues }) =>
    issues.flatMap(i => {
      const m = i.match(/Unknown components not converted: (.+)/);
      return m ? m[1].split(', ') : [];
    })
  );
  const uniqueUnknown = [...new Set(unknownComps)];
  if (uniqueUnknown.length) {
    console.log(`\n  ${pc.bold('Custom / unknown components found:')}`);
    for (const u of uniqueUnknown) {
      console.log(`    ${pc.yellow(u)}  ${pc.dim('→ not converted (no DocsLit equivalent found)')}`);
    }
    console.log(`\n  These may be custom Mintlify components. You can replace them with`);
    console.log(`  the closest DocsLit equivalent or drop a custom Lit web component`);
    console.log(`  into your ${pc.cyan('components/')} folder.`);
  }

  console.log(`\n  ${pc.bold('DocsLit component reference:')}`);
  console.log(`    ${pc.dim('https://docslit.com/docs/components')}\n`);
}

// ─── Version handling ─────────────────────────────────────────────────────────

function detectMintlifyVersions(srcConfig) {
  if (!srcConfig?.navigation?.versions) return null;
  const versions = srcConfig.navigation.versions;
  if (!Array.isArray(versions) || versions.length < 2) return null;
  return versions;
}

function mintVersionedNavToSidebars(versions) {
  const result = new Map();
  for (const v of versions) {
    const sidebar = mintNavToSidebar(v.groups || []);
    result.set(v.version, sidebar);
  }
  return result;
}

function getAllPagesFromSidebar(sidebar) {
  const pages = new Set();
  for (const group of sidebar) {
    for (const page of (group.pages || [])) pages.add(page);
  }
  return pages;
}

function promptInput(text) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(text, answer => { rl.close(); resolve(answer.trim()); });
  });
}

async function isGitRepo(dir) {
  try {
    await git.findRoot({ fs: nodeFs, filepath: dir });
    return true;
  } catch { return false; }
}

async function isGitClean(dir) {
  try {
    const matrix = await git.statusMatrix({ fs: nodeFs, dir });
    return matrix.every(([, head, workdir, stage]) => head === 1 && workdir === 1 && stage === 1);
  } catch { return false; }
}

async function promptVersionStrategy(versions) {
  const versionNames = versions.map(v => v.version).join(', ');
  const defaultVersion = versions.find(v => v.default)?.version || versions[versions.length - 1].version;

  console.log(`\n  ${pc.bold('Versioned documentation detected:')} ${pc.cyan(versionNames)}`);
  console.log(`  ${pc.dim(`Default version: ${defaultVersion}`)}\n`);
  console.log(`  How would you like to handle versions?\n`);
  console.log(`    ${pc.bold('1.')} Set up branch-based versioning ${pc.green('(recommended)')}`);
  console.log(`       Creates a git branch per version with only that version's`);
  console.log(`       pages. Shared pages exist on all branches.\n`);
  console.log(`    ${pc.bold('2.')} Keep only the latest version`);
  console.log(`       Imports only the default/latest version's pages.\n`);
  console.log(`    ${pc.bold('3.')} Merge all versions into one`);
  console.log(`       All pages from all versions, no version selector.\n`);
  console.log(`    ${pc.bold('4.')} Skip — import everything, decide later`);
  console.log(`       Imports all files without versioning config.\n`);

  const answer = await promptInput(`  Choice [1]: `);
  const choice = parseInt(answer) || 1;
  if (choice < 1 || choice > 4) return 1;
  return choice;
}

const GIT_AUTHOR = { name: 'DocsLit Import', email: 'import@docslit.com' };

async function gitAddAll(dir) {
  const matrix = await git.statusMatrix({ fs: nodeFs, dir });
  for (const [filepath, , workdir] of matrix) {
    if (workdir === 0) {
      await git.remove({ fs: nodeFs, dir, filepath });
    } else {
      await git.add({ fs: nodeFs, dir, filepath });
    }
  }
}

async function setupBranchVersioning({ outDir, versions, sidebarsByVersion }) {
  if (!await isGitRepo(outDir)) {
    console.log(`\n  ${pc.yellow('!')} Output directory is not a git repo. Initializing one...`);
    await git.init({ fs: nodeFs, dir: outDir });
  }

  if (!await isGitClean(outDir)) {
    console.log(`  ${pc.yellow('!')} Uncommitted changes detected. Committing imported files first...`);
    await gitAddAll(outDir);
    await git.commit({ fs: nodeFs, dir: outDir, author: GIT_AUTHOR, message: 'chore: initial import from Mintlify' });
  }

  const defaultVersion = versions.find(v => v.default)?.version || versions[versions.length - 1].version;
  const defaultSidebar = sidebarsByVersion.get(defaultVersion) || [];
  const defaultPages = getAllPagesFromSidebar(defaultSidebar);
  const createdBranches = [];

  const mainBranch = await git.currentBranch({ fs: nodeFs, dir: outDir, fullname: false }) || 'main';

  for (const v of versions) {
    if (v.version === defaultVersion) continue;
    const branchName = `docs-${v.version.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    const versionSidebar = sidebarsByVersion.get(v.version) || [];
    const versionPages = getAllPagesFromSidebar(versionSidebar);

    await git.branch({ fs: nodeFs, dir: outDir, ref: branchName });
    await git.checkout({ fs: nodeFs, dir: outDir, ref: branchName });

    const docsDir = path.join(outDir, 'docs');
    if (await fs.pathExists(docsDir)) {
      const allDocFiles = await walkMdFiles(docsDir);
      for (const filePath of allDocFiles) {
        const rel = path.relative(docsDir, filePath).replace(/\.(md|mdx)$/, '').replace(/\\/g, '/');
        if (!versionPages.has(rel)) {
          await fs.remove(filePath);
        }
      }
    }

    const versionConfig = { name: `Documentation (${v.version})`, sidebar: versionSidebar };
    await fs.writeFile(path.join(outDir, 'docslit.json'), JSON.stringify(versionConfig, null, 2));

    await gitAddAll(outDir);
    try {
      await git.commit({ fs: nodeFs, dir: outDir, author: GIT_AUTHOR, message: `docs: import ${v.version} from Mintlify` });
    } catch { /* empty commit is fine */ }

    createdBranches.push({ version: v.version, branch: branchName });
    await git.checkout({ fs: nodeFs, dir: outDir, ref: mainBranch });
  }

  const docsDir = path.join(outDir, 'docs');
  if (await fs.pathExists(docsDir)) {
    const allDocFiles = await walkMdFiles(docsDir);
    for (const filePath of allDocFiles) {
      const rel = path.relative(docsDir, filePath).replace(/\.(md|mdx)$/, '').replace(/\\/g, '/');
      if (!defaultPages.has(rel)) {
        await fs.remove(filePath);
      }
    }
  }

  const versionsList = [
    { version: defaultVersion, branch: mainBranch, tag: 'Latest' },
    ...createdBranches.map(b => ({ version: b.version, branch: b.branch })),
  ];

  const mainConfig = {
    name: 'Documentation',
    versions: { default: defaultVersion, list: versionsList },
    sidebar: defaultSidebar,
  };

  await fs.writeFile(path.join(outDir, 'docslit.json'), JSON.stringify(mainConfig, null, 2));
  await gitAddAll(outDir);
  try {
    await git.commit({ fs: nodeFs, dir: outDir, author: GIT_AUTHOR, message: `docs: set up versioning for ${defaultVersion} (default)` });
  } catch { /* empty commit is fine */ }

  console.log(`\n  ${pc.green('✓')} Created branches: ${createdBranches.map(b => pc.cyan(b.branch)).join(', ')}`);
  console.log(`  ${pc.green('✓')} Default version ${pc.cyan(defaultVersion)} on ${pc.cyan(mainBranch)}`);

  return mainConfig;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function importDocs(args) {
  const sourceDir = path.resolve(process.cwd(), args[0] ?? '.');
  const dryRun    = args.includes('--dry-run');
  const outDirArg = getFlag(args, '--out');

  if (!(await fs.pathExists(sourceDir))) {
    console.error(pc.red(`  Error: Source directory not found: ${sourceDir}`));
    process.exit(1);
  }

  // Refuse to clobber if output == source unless --in-place
  const defaultOut = sourceDir.replace(/\/$/, '') + '-docslit';
  const outDir     = path.resolve(process.cwd(), outDirArg ?? defaultOut);

  if (outDir === sourceDir) {
    console.error(pc.red('  Error: Output directory is the same as source.'));
    console.error(pc.dim('  Use --out <dir> to specify a different output location.'));
    process.exit(1);
  }

  console.log(`\n  ${pc.bold('DocsLit')} — importing from ${pc.cyan(path.relative(process.cwd(), sourceDir) || '.')}`);
  if (dryRun) console.log(pc.yellow('  Dry run — scanning only, no files written.\n'));

  // ── 1. Detect source format ─────────────────────────────────────────────────
  let detectedFormat = 'none';
  let srcConfig = null;
  try {
    const detected = await detectSourceConfig(sourceDir);
    detectedFormat = detected.format;
    srcConfig = detected.config;
  } catch (err) {
    console.log(`  ${pc.yellow('!')} Could not detect source format: ${err.message}`);
    console.log(`  ${pc.dim('Falling back to auto-discovery mode.')}`);
  }
  const formatLabel = {
    mintlify:   'Mintlify',
    fern:       'Fern',
    gitbook:    'GitBook',
    docusaurus: 'Docusaurus',
    mkdocs:     'MkDocs',
    sphinx:     'Sphinx',
    readme:     'ReadMe',
    vuepress:   'VuePress',
    vitepress:  'VitePress',
    starlight:  'Starlight (Astro)',
    nextra:     'Nextra (Next.js)',
    none:       'Unknown (auto-discovered)',
  }[detectedFormat] || 'Unknown';
  console.log(`  Detected: ${pc.cyan(formatLabel)}\n`);

  // ── 2. Walk all .md / .mdx files ────────────────────────────────────────────
  const allFiles = await walkMdFiles(sourceDir);
  if (!allFiles.length) {
    console.error(pc.yellow('  No .md or .mdx files found in source directory.'));
    process.exit(0);
  }
  console.log(`  Found ${pc.cyan(allFiles.length)} markdown file${allFiles.length !== 1 ? 's' : ''}…`);

  // ── 3. Convert each file ────────────────────────────────────────────────────
  const totalStats = new Map();
  const allIssues  = [];
  const files      = [];

  for (const srcPath of allFiles) {
    const rel     = path.relative(sourceDir, srcPath);
    const outPath = path.join(outDir, 'docs', rel);

    try {
      if (!dryRun) {
        const { stats, issues, wasmdx } = await convertFile(srcPath, outPath, rel);
        for (const [k, v] of stats) totalStats.set(k, (totalStats.get(k) ?? 0) + v);
        if (issues.length) allIssues.push({ rel, issues });
        files.push({ rel, ok: true, wasmdx });
      } else {
        // Dry run — still parse to collect stats
        const raw = await fs.readFile(srcPath, 'utf8');
        let body = raw;
        try { body = matter(raw).content; } catch { body = raw.replace(/^---[\s\S]*?---\r?\n?/, ''); }
        const { stats, issues } = convertContent(body, rel);
        for (const [k, v] of stats) totalStats.set(k, (totalStats.get(k) ?? 0) + v);
        if (issues.length) allIssues.push({ rel, issues });
        files.push({ rel, ok: true, wasmdx: srcPath.endsWith('.mdx') });
      }
    } catch (err) {
      files.push({ rel, error: err.message });
    }
  }

  // ── 4. Copy static assets ───────────────────────────────────────────────────
  if (!dryRun) {
    const assetExts = /\.(png|jpg|jpeg|gif|svg|webp|ico|pdf|mp4|mp3|woff2?|ttf|otf)$/i;
    let allSourceFiles = [];
    try { allSourceFiles = await walkAllFiles(sourceDir); } catch { /* skip assets on walk failure */ }
    for (const srcPath of allSourceFiles) {
      if (!assetExts.test(srcPath)) continue;
      const rel     = path.relative(sourceDir, srcPath);
      const outPath = path.join(outDir, 'docs', rel);
      try {
        await fs.ensureDir(path.dirname(outPath));
        await fs.copy(srcPath, outPath);
      } catch {
        console.log(`  ${pc.yellow('!')} Skipped asset ${rel} — could not copy`);
      }
    }
  }

  // ── 5. Build docslit.json ───────────────────────────────────────────────────
  const projectName = srcConfig?.name ?? path.basename(sourceDir);
  let sidebar;
  let docslitConfig;
  const autoFallback = () => {
    const slugs = files.filter(f => !f.error).map(f => f.rel.replace(/\.(mdx?|md)$/, '').replace(/\\/g, '/'));
    return autoSidebar(slugs);
  };

  // Check for Mintlify versioned navigation
  let mintVersions = null;
  try {
    mintVersions = detectedFormat === 'mintlify' ? detectMintlifyVersions(srcConfig) : null;
  } catch (err) {
    console.log(`  ${pc.yellow('!')} Could not parse version config: ${err.message}`);
    console.log(`  ${pc.dim('Continuing without versioning.')}`);
  }

  try {
    if (mintVersions && !dryRun) {
      const strategy = await promptVersionStrategy(mintVersions);
      const sidebarsByVersion = mintVersionedNavToSidebars(mintVersions);
      const defaultVersion = mintVersions.find(v => v.default)?.version || mintVersions[mintVersions.length - 1].version;

      if (strategy === 1) {
        // Branch-based versioning
        await fs.ensureDir(outDir);
        await fs.ensureDir(path.join(outDir, 'docs'));
        await fs.ensureDir(path.join(outDir, 'components'));
        await fs.writeFile(path.join(outDir, '.gitignore'), 'node_modules/\ndist/\n');

        docslitConfig = await setupBranchVersioning({ outDir, versions: mintVersions, sidebarsByVersion });
      } else if (strategy === 2) {
        // Keep only latest
        sidebar = sidebarsByVersion.get(defaultVersion) || [];
        docslitConfig = {
          name: projectName,
          ...(srcConfig?.logo?.dark ? { logo: srcConfig.logo.dark } : {}),
          ...(srcConfig?.favicon ? { favicon: srcConfig.favicon } : {}),
          sidebar,
        };
      } else if (strategy === 3) {
        // Merge all
        const allSidebars = [];
        const seenGroups = new Set();
        for (const [, sb] of sidebarsByVersion) {
          for (const group of sb) {
            const key = group.group + ':' + group.pages.join(',');
            if (!seenGroups.has(key)) { seenGroups.add(key); allSidebars.push(group); }
          }
        }
        sidebar = allSidebars;
        docslitConfig = {
          name: projectName,
          ...(srcConfig?.logo?.dark ? { logo: srcConfig.logo.dark } : {}),
          ...(srcConfig?.favicon ? { favicon: srcConfig.favicon } : {}),
          sidebar,
        };
      } else {
        // Skip — use default version sidebar, no versions config
        sidebar = sidebarsByVersion.get(defaultVersion) || [];
        docslitConfig = {
          name: projectName,
          ...(srcConfig?.logo?.dark ? { logo: srcConfig.logo.dark } : {}),
          ...(srcConfig?.favicon ? { favicon: srcConfig.favicon } : {}),
          sidebar,
        };
      }
    } else {
      if (detectedFormat === 'mintlify' && srcConfig?.navigation) {
        sidebar = mintNavToSidebar(srcConfig.navigation);
      }
      if (!sidebar || !sidebar.length) {
        sidebar = autoFallback();
      }
      docslitConfig = {
        name: projectName,
        ...(srcConfig?.logo?.dark ? { logo: srcConfig.logo.dark } : {}),
        ...(srcConfig?.favicon ? { favicon: srcConfig.favicon } : {}),
        sidebar,
      };
    }
  } catch (err) {
    console.log(`  ${pc.yellow('!')} Error building sidebar: ${err.message}`);
    console.log(`  ${pc.dim('Falling back to auto-discovered sidebar from converted files.')}`);
    sidebar = autoFallback();
    docslitConfig = {
      name: projectName,
      sidebar,
    };
  }

  // ── 5b. Reconcile sidebar with converted files ──────────────────────────────
  const sidebarPageSet = new Set();
  for (const group of (docslitConfig.sidebar || [])) {
    for (const page of (group.pages || [])) sidebarPageSet.add(page);
  }
  const convertedSlugs = files
    .filter(f => !f.error)
    .map(f => f.rel.replace(/\.(mdx?|md)$/, '').replace(/\\/g, '/'));
  const orphanedSlugs = convertedSlugs.filter(s => !sidebarPageSet.has(s));

  if (orphanedSlugs.length) {
    if (!docslitConfig.sidebar) docslitConfig.sidebar = [];
    docslitConfig.sidebar.push({ group: 'Other Pages', pages: orphanedSlugs });
    allIssues.push({
      rel: 'docslit.json',
      issues: [`${orphanedSlugs.length} converted file${orphanedSlugs.length !== 1 ? 's were' : ' was'} not in the source navigation and ${orphanedSlugs.length !== 1 ? 'have' : 'has'} been added to an "Other Pages" sidebar group: ${orphanedSlugs.join(', ')}`],
    });
  }

  if (mintVersions && !dryRun) {
    const strategy = docslitConfig.versions ? 1 : 0;
    if (strategy !== 1) {
      await fs.ensureDir(outDir);
      await fs.ensureDir(path.join(outDir, 'docs'));
      await fs.ensureDir(path.join(outDir, 'components'));
      await fs.writeFile(path.join(outDir, 'docslit.json'), JSON.stringify(docslitConfig, null, 2), 'utf8');
      await fs.writeFile(path.join(outDir, '.gitignore'), 'node_modules/\ndist/\n');
    }
  } else if (!dryRun) {
    await fs.ensureDir(outDir);
    await fs.ensureDir(path.join(outDir, 'docs'));
    await fs.ensureDir(path.join(outDir, 'components'));
    await fs.writeFile(path.join(outDir, 'docslit.json'), JSON.stringify(docslitConfig, null, 2), 'utf8');
    await fs.writeFile(path.join(outDir, '.gitignore'), 'node_modules/\ndist/\n');
  }

  // ── 6. Print report ─────────────────────────────────────────────────────────
  printReport({
    sourceDir: path.relative(process.cwd(), sourceDir) || '.',
    outDir:    path.relative(process.cwd(), outDir)    || '.',
    dryRun,
    files,
    totalStats,
    allIssues,
    docslitConfig,
    detectedFormat: formatLabel,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getFlag(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

async function walkAllFiles(dir) {
  const result = [];
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return result; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'dist'].includes(e.name)) continue;
      result.push(...(await walkAllFiles(p)));
    } else {
      result.push(p);
    }
  }
  return result;
}
