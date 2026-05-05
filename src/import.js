import fs from 'fs-extra';
import path from 'path';
import pc from 'picocolors';
import matter from 'gray-matter';

// ─── Mintlify → DocsLit component map ─────────────────────────────────────────
// tag:         output wc-* tag (null = special handling)
// fixedAttrs:  attrs always written on the output tag
// passAttrs:   prop names to pass through from source
// attrRename:  { srcProp: destProp }
// autoNumber:  inject n="N" based on sibling position (for wc-step)
// unwrap:      drop the wrapper tag, keep its children verbatim
// flatten:     drop the tag, keep inner text content
// remove:      drop tag + all children

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
  Card:      { tag: 'wc-card',  passAttrs: ['title', 'icon', 'href', 'color'] },
  CardGroup: { tag: 'wc-tiles', passAttrs: ['cols'] },
  // ── Tabs ─────────────────────────────────────────────────────────────────────
  Tabs: { tag: 'wc-tabs' },
  Tab:  { tag: 'wc-tab', attrRename: { title: 'label' }, passAttrs: ['label'] },
  // ── Accordion ────────────────────────────────────────────────────────────────
  Accordion:      { tag: 'wc-accordion', passAttrs: ['title'] },
  AccordionGroup: { tag: null, unwrap: true },
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
    parts.push(`${dest}="${prop.value}"`);
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
  // Mintlify
  const mintJson = path.join(sourceDir, 'mint.json');
  if (await fs.pathExists(mintJson)) {
    try {
      const raw = await fs.readFile(mintJson, 'utf8');
      return { format: 'mintlify', config: JSON.parse(raw) };
    } catch { /* fall through */ }
  }

  // Fern
  const fernConfig = path.join(sourceDir, 'fern', 'fern.config.json');
  const fernDocs   = path.join(sourceDir, 'fern', 'docs.yml');
  if (await fs.pathExists(fernConfig)) {
    return { format: 'fern', config: { fernConfig, fernDocs } };
  }

  // GitBook / plain
  const summary = path.join(sourceDir, 'SUMMARY.md');
  if (await fs.pathExists(summary)) {
    return { format: 'gitbook', config: { summary } };
  }

  return { format: 'none', config: null };
}

// ─── Sidebar builder ──────────────────────────────────────────────────────────
// Converts Mintlify navigation → DocsLit sidebar groups.
function mintNavToSidebar(navigation = []) {
  const sidebar = [];
  for (const group of navigation) {
    if (!group.group) continue;
    const pages = [];
    for (const page of (group.pages || [])) {
      if (typeof page === 'string') {
        // "path/to/page" → keep as slug (strip .mdx/.md)
        pages.push(page.replace(/\.(mdx?|md)$/, ''));
      } else if (page.group) {
        // Nested group — flatten into same level with prefixed slug comment
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
  const entries = await fs.readdir(dir, { withFileTypes: true });
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
  const { format: detectedFormat, config: srcConfig } = await detectSourceConfig(sourceDir);
  const formatLabel = {
    mintlify: 'Mintlify (mint.json)',
    fern:     'Fern (fern.config.json)',
    gitbook:  'GitBook (SUMMARY.md)',
    none:     'Unknown (auto-discovered)',
  }[detectedFormat];
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
    for (const srcPath of await walkAllFiles(sourceDir)) {
      if (!assetExts.test(srcPath)) continue;
      const rel     = path.relative(sourceDir, srcPath);
      const outPath = path.join(outDir, 'docs', rel);
      await fs.ensureDir(path.dirname(outPath));
      await fs.copy(srcPath, outPath);
    }
  }

  // ── 5. Build docslit.json ───────────────────────────────────────────────────
  const projectName = srcConfig?.name ?? path.basename(sourceDir);
  let sidebar;

  if (detectedFormat === 'mintlify' && srcConfig?.navigation) {
    sidebar = mintNavToSidebar(srcConfig.navigation);
  } else {
    // Auto-discover: convert relative file paths to slugs
    const slugs = files.map(f => f.rel.replace(/\.(mdx?|md)$/, '').replace(/\\/g, '/'));
    sidebar = autoSidebar(slugs);
  }

  const docslitConfig = {
    name: projectName,
    ...(srcConfig?.logo?.dark  ? { logo: srcConfig.logo.dark }  : {}),
    ...(srcConfig?.favicon     ? { favicon: srcConfig.favicon }  : {}),
    sidebar,
  };

  if (!dryRun) {
    await fs.ensureDir(outDir);
    await fs.ensureDir(path.join(outDir, 'docs'));
    await fs.ensureDir(path.join(outDir, 'components'));
    await fs.writeFile(
      path.join(outDir, 'docslit.json'),
      JSON.stringify(docslitConfig, null, 2),
      'utf8'
    );
    // .gitignore
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
  const entries = await fs.readdir(dir, { withFileTypes: true });
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
