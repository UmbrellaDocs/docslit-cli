import fs from 'fs-extra';
import path from 'path';
import pc from 'picocolors';
import matter from './frontmatter.js';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import { visit } from 'unist-util-visit';
import { COMPONENT_MAP, pascalToWcKebab, rewriteMdxTags } from './mdx-bridge.js';
import { VAR_NAME_RE } from './preprocess.js';
import { getSiteTheme, isValidThemePreset, listThemePresets } from './themes.js';

// ─── Built-in component registry ──────────────────────────────────────────────
// Mirrors the components actually registered by buildComponents() — keep this
// set in sync with src/components/*.js. The cli.test.ts asserts on the same list.
const BUILTIN_COMPONENTS = new Set([
  // Text & callouts
  'wc-callout', 'wc-alert', 'wc-banner', 'wc-badge', 'wc-tooltip', 'wc-update',
  // Layout
  'wc-columns', 'wc-frame', 'wc-panel', 'wc-expandable', 'wc-accordion', 'wc-accordion-group', 'wc-aside',
  // Navigation
  'wc-steps', 'wc-step', 'wc-tabs', 'wc-tab', 'wc-view', 'wc-view-panel',
  // Code
  'wc-var', 'wc-code-block', 'wc-code-group', 'wc-code-tab',
  // Media & Files
  'wc-icon', 'wc-file', 'wc-dir', 'wc-files', 'wc-tree', 'wc-tree-item', 'wc-download', 'wc-copy',
  // Data & API
  'wc-field', 'wc-fields', 'wc-response-fields', 'wc-color', 'wc-table',
  'wc-schema', 'wc-mermaid', 'wc-endpoint', 'wc-runnable-endpoint',
  // Content
  'wc-card', 'wc-tile', 'wc-tiles', 'wc-button', 'wc-prompt',
  // Utility
  'wc-anchor', 'wc-indent', 'wc-visibility', 'wc-version', 'wc-versions', 'wc-page-meta',
]);
const AUTHORING_COMPONENTS = new Set([
  'wc-include',
]);

// Known valid frontmatter keys
const VALID_FM_KEYS = new Set([
  'title', 'description', 'icon', 'tag', 'readtime', 'updated',
  'sidebar_title', 'component', 'draft', 'order', 'redirect', 'layout',
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

function stripPassBlocks(src) {
  return src.replace(/pass:\[[\s\S]*?\]/g, m => ' '.repeat(m.length));
}

function stripProtectedContent(src) {
  return stripPassBlocks(stripInlineCode(stripCodeFences(src)));
}

function parseTagAttrs(attrText) {
  const attrs = {};
  const re = /([:@\w-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(attrText)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

function mapIncludeSource(src) {
  const normalized = String(src || '').replace(/\\/g, '/').trim();
  if (!normalized) return null;
  if (normalized.startsWith('/')) {
    if (!normalized.startsWith('/docs/_reusables/')) return null;
    return normalized.slice('/docs/'.length);
  }
  if (normalized.startsWith('_reusables/')) return normalized;
  return `_reusables/${normalized}`;
}

function getBuiltInRuntimeVars(config) {
  const version = config?.versions?.default || 'unversioned';
  const branch = config?.versions?.list?.find(v => v.version === version)?.branch || 'working-tree';
  return {
    DOCSLIT_VERSION: version,
    DOCSLIT_BRANCH: branch,
  };
}

function isReusableDocFile(file, dir) {
  const docsRoot = path.join(dir, 'docs');
  const reusablesRoot = path.join(docsRoot, '_reusables');
  return file.startsWith(reusablesRoot + path.sep);
}

function toPosixFileSlug(file, docsRoot) {
  return path.relative(docsRoot, file).replace(/\.(md|mdx)$/, '').replace(/\\/g, '/');
}

function normalizeSlugCandidate(input) {
  let slug = String(input || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.(md|mdx)$/, '');
  slug = slug.replace(/\/+$/, '');
  slug = path.posix.normalize(slug);
  if (slug === '.' || !slug) return '';
  if (slug.endsWith('/index')) slug = slug.slice(0, -('/index'.length));
  return slug;
}

function resolveLinkSlug(target, currentSlug, slugs) {
  const baseDir = path.posix.dirname(currentSlug);
  const candidates = [];
  const addCandidate = (value) => {
    const normalized = normalizeSlugCandidate(value);
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  if (target.startsWith('/')) {
    addCandidate(target);
  } else if (target.startsWith('./') || target.startsWith('../')) {
    addCandidate(path.posix.join(baseDir, target));
  } else {
    // Keep legacy root-style links working, but also support same-folder shorthand.
    addCandidate(target);
    addCandidate(path.posix.join(baseDir, target));
  }

  for (const slug of candidates) {
    if (slugs.has(slug)) return { ok: true, slug, candidates };
  }
  return { ok: false, slug: candidates[0] || normalizeSlugCandidate(target), candidates };
}

async function checkAuthoringPreprocessor(files, dir, config, issues) {
  const docsRoot = path.join(dir, 'docs');
  const reusablesRoot = path.join(docsRoot, '_reusables');
  const globalAttrs = {
    ...((config?.attributes && typeof config.attributes === 'object') ? config.attributes : {}),
    ...getBuiltInRuntimeVars(config),
  };

  for (const file of files) {
    const rel = path.relative(dir, file);
    const raw = await fs.readFile(file, 'utf8');
    const parsed = matter(raw);
    const pageAttrs = (parsed.data?.attributes && typeof parsed.data.attributes === 'object') ? parsed.data.attributes : {};
    const body = parsed.content;
    const bodySafe = stripProtectedContent(body);
    const isReusable = file.startsWith(reusablesRoot + path.sep);

    const invalidIncludeRe = /<wc-include\b[^>]*>(?:[\s\S]*?)<\/wc-include>/g;
    let badInclude;
    while ((badInclude = invalidIncludeRe.exec(bodySafe)) !== null) {
      issues.push(issue('error', rel, lineOf(raw, badInclude.index),
        'wc-include must use self-closing syntax (<wc-include ... />)'));
    }

    const includeRe = /<wc-include\b([^>]*?)\/>/g;
    let includeMatch;
    while ((includeMatch = includeRe.exec(bodySafe)) !== null) {
      if (isReusable) {
        issues.push(issue('error', rel, lineOf(raw, includeMatch.index),
          'Reusable files in docs/_reusables cannot contain wc-include'));
        continue;
      }
      const attrs = parseTagAttrs(includeMatch[1]);
      if (!attrs.src) {
        issues.push(issue('error', rel, lineOf(raw, includeMatch.index),
          'wc-include requires a src attribute'));
        continue;
      }
      const mapped = mapIncludeSource(attrs.src);
      if (!mapped) {
        issues.push(issue('error', rel, lineOf(raw, includeMatch.index),
          `Invalid include path "${attrs.src}" (must resolve under docs/_reusables)`));
        continue;
      }
      const normalized = path.posix.normalize(mapped).replace(/^\/+/, '');
      if (!normalized.startsWith('_reusables/') || normalized.split('/').includes('..')) {
        issues.push(issue('error', rel, lineOf(raw, includeMatch.index),
          `Include "${attrs.src}" resolves outside docs/_reusables`));
        continue;
      }
      if (!normalized.endsWith('.md')) {
        issues.push(issue('error', rel, lineOf(raw, includeMatch.index),
          `Include "${attrs.src}" must target a .md file`));
        continue;
      }
      const absTarget = path.resolve(docsRoot, normalized);
      if (!absTarget.startsWith(reusablesRoot + path.sep)) {
        issues.push(issue('error', rel, lineOf(raw, includeMatch.index),
          `Include "${attrs.src}" resolves outside docs/_reusables`));
        continue;
      }
      if (!await fs.pathExists(absTarget)) {
        issues.push(issue('error', rel, lineOf(raw, includeMatch.index),
          `Include target not found: docs/${normalized}`));
        continue;
      }
      const includeRaw = await fs.readFile(absTarget, 'utf8');
      if (/<wc-include\b/i.test(stripProtectedContent(includeRaw))) {
        issues.push(issue('error', rel, lineOf(raw, includeMatch.index),
          `Nested include found in reusable target: docs/${normalized}`));
      }
      const includeFm = matter(includeRaw);
      if (Object.keys(includeFm.data || {}).length > 0) {
        issues.push(issue('warning', path.relative(dir, absTarget), 1,
          'Frontmatter in reusable file is ignored by wc-include'));
      }
    }

    const localDeclarations = {};
    const declarationRe = /<wc-var\b([^>]*?)\/>/g;
    let dec;
    while ((dec = declarationRe.exec(bodySafe)) !== null) {
      const attrs = parseTagAttrs(dec[1]);
      if (!attrs.name || !Object.prototype.hasOwnProperty.call(attrs, 'value')) continue;
      if (!VAR_NAME_RE.test(attrs.name)) {
        issues.push(issue('error', rel, lineOf(raw, dec.index),
          `Invalid wc-var declaration name "${attrs.name}"`));
        continue;
      }
      localDeclarations[attrs.name] = attrs.value;
    }

    const mergedVars = { ...globalAttrs, ...pageAttrs, ...localDeclarations };
    const placeholderRe = /\{\{([^}]+)\}\}/g;
    let placeholder;
    while ((placeholder = placeholderRe.exec(bodySafe)) !== null) {
      const key = placeholder[1].trim();
      if (!VAR_NAME_RE.test(key)) {
        issues.push(issue('warning', rel, lineOf(raw, placeholder.index),
          `Invalid variable placeholder "{{${key}}}"`));
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(mergedVars, key)) {
        issues.push(issue('warning', rel, lineOf(raw, placeholder.index),
          `Undefined variable "{{${key}}}"`));
      }
    }
  }
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

  // Check OpenAPI spec configuration
  if (config.openapi) {
    const specFile = typeof config.openapi === 'string' ? config.openapi : config.openapi?.spec;
    const overlayFile = typeof config.openapi === 'object' ? config.openapi?.overlay : null;

    if (specFile) {
      const specPath = path.join(dir, specFile);
      if (!await fs.pathExists(specPath)) {
        issues.push(issue('error', 'docslit.json', null,
          `OpenAPI spec file not found: ${specFile}`));
      }
    } else {
      issues.push(issue('error', 'docslit.json', null,
        'openapi config is set but no spec file specified'));
    }

    if (overlayFile) {
      const overlayPath = path.join(dir, overlayFile);
      if (!await fs.pathExists(overlayPath)) {
        issues.push(issue('error', 'docslit.json', null,
          `OpenAPI overlay file not found: ${overlayFile}`));
      }
    }
  }

  if (config.announcement != null) {
    if (typeof config.announcement !== 'object' || Array.isArray(config.announcement)) {
      issues.push(issue('error', 'docslit.json', null,
        '"announcement" must be an object with a "message" string'));
    } else if (!config.announcement.message || typeof config.announcement.message !== 'string') {
      issues.push(issue('error', 'docslit.json', null,
        '"announcement.message" is required and must be a string'));
    }
  }

  if (config.versions?.list) {
    for (const entry of config.versions.list) {
      if (entry.announcement != null && (!entry.announcement.message || typeof entry.announcement.message !== 'string')) {
        issues.push(issue('error', 'docslit.json', null,
          `Version "${entry.version}" announcement.message must be a string`));
      }
    }
  }

  if (config.theme != null) {
    const { preset, colors } = getSiteTheme(config);
    if (!isValidThemePreset(preset)) {
      const names = listThemePresets().map(t => t.id).join(', ');
      issues.push(issue('error', 'docslit.json', null,
        `Unknown theme preset "${preset}". Available presets: ${names}`));
    }
    if (typeof config.theme === 'object' && !Array.isArray(config.theme) && config.theme.colors != null) {
      if (typeof colors !== 'object' || Array.isArray(colors)) {
        issues.push(issue('error', 'docslit.json', null,
          '"theme.colors" must be an object of CSS color overrides'));
      } else {
        for (const [key, value] of Object.entries(colors)) {
          if (typeof value !== 'string') {
            issues.push(issue('error', 'docslit.json', null,
              `theme.colors.${key} must be a string`));
          }
        }
      }
    } else if (typeof config.theme === 'object' && !Array.isArray(config.theme) && config.theme.preset != null && typeof config.theme.preset !== 'string') {
      issues.push(issue('error', 'docslit.json', null,
        '"theme.preset" must be a string'));
    } else if (typeof config.theme !== 'string' && (typeof config.theme !== 'object' || Array.isArray(config.theme))) {
      issues.push(issue('error', 'docslit.json', null,
        '"theme" must be a preset name string or an object with "preset" and optional "colors"'));
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
    if (isReusableDocFile(file, dir)) continue;
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

// ─── AST parsing helpers ──────────────────────────────────────────────────────
let mdastProcessor;
let hastProcessor;

function getMdastProcessor() {
  if (!mdastProcessor) {
    mdastProcessor = unified().use(remarkParse).use(remarkGfm);
  }
  return mdastProcessor;
}

function getHastProcessor() {
  if (!hastProcessor) {
    hastProcessor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw);
  }
  return hastProcessor;
}

function parseMdast(src) {
  return getMdastProcessor().parse(src);
}

function parseHast(src) {
  return getHastProcessor().runSync(getHastProcessor().parse(src));
}

function posLine(node) {
  return node?.position?.start?.line ?? null;
}

// ─── 5. Internal link check ────────────────────────────────────────────────────
async function checkLinks(files, slugs, dir, issues) {
  const docsDir = path.join(dir, 'docs');
  for (const file of files) {
    if (isReusableDocFile(file, dir)) continue;
    const rel = path.relative(dir, file);
    const raw = await fs.readFile(file, 'utf8');
    const body = matter(raw).content;
    const currentSlug = toPosixFileSlug(file, docsDir);
    const tree = parseMdast(body);

    visit(tree, 'link', (node) => {
      const target = (node.url || '').trim().split('#')[0];
      if (!target || /^https?:\/\//.test(target) || /^mailto:/.test(target)) return;
      if (isExternalish(target)) return;
      const resolved = resolveLinkSlug(target, currentSlug, slugs);
      if (!resolved.ok) {
        issues.push(issue('error', rel, posLine(node),
          `Broken internal link → "${target}" (no page with slug "${resolved.slug}")`));
      }
    });

    const rewritten = rewriteMdxTags(body);
    const hast = parseHast(rewritten);
    visit(hast, 'element', (node) => {
      const href = node.properties?.href;
      if (!href || typeof href !== 'string') return;
      if (node.tagName === 'a') {
        const target = href.trim().split('#')[0];
        if (!target || /^https?:\/\//.test(target) || target.startsWith('#') ||
            target.startsWith('javascript') || target.startsWith('mailto')) return;
        const resolved = resolveLinkSlug(target, currentSlug, slugs);
        if (!resolved.ok) {
          issues.push(issue('warning', rel, posLine(node),
            `Possible broken href → "${target}"`));
        }
      }
    });
  }
}

function isExternalish(t) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(t);
}

// ─── 6. Asset check ────────────────────────────────────────────────────────────
async function checkAssets(files, dir, issues) {
  for (const file of files) {
    const rel = path.relative(dir, file);
    const raw = await fs.readFile(file, 'utf8');
    const body = matter(raw).content;
    const fileDir = path.dirname(file);

    const tree = parseMdast(body);

    visit(tree, 'image', (node) => {
      const target = (node.url || '').trim().split('#')[0].split('?')[0];
      if (!target || /^https?:\/\//.test(target) || target.startsWith('data:')) return;
      if (!target.startsWith('.') && !target.startsWith('/')) return;
      const absTarget = target.startsWith('/')
        ? path.join(dir, target)
        : path.resolve(fileDir, target);
      if (!fs.pathExistsSync(absTarget)) {
        issues.push(issue('error', rel, posLine(node),
          `Missing asset: "${target}" (resolved to ${path.relative(dir, absTarget)})`));
      }
    });

    const rewritten = rewriteMdxTags(body);
    const hast = parseHast(rewritten);
    visit(hast, 'element', (node) => {
      if (node.tagName !== 'img') return;
      const target = (node.properties?.src || '').trim().split('#')[0].split('?')[0];
      if (!target || /^https?:\/\//.test(target) || target.startsWith('data:')) return;
      if (!target.startsWith('.') && !target.startsWith('/')) return;
      const absTarget = target.startsWith('/')
        ? path.join(dir, target)
        : path.resolve(fileDir, target);
      if (!fs.pathExistsSync(absTarget)) {
        issues.push(issue('error', rel, posLine(node),
          `Missing asset: "${target}" (resolved to ${path.relative(dir, absTarget)})`));
      }
    });
  }
}

// ─── 7. Component check ────────────────────────────────────────────────────────
async function checkComponents(files, dir, issues) {
  const customDir = path.join(dir, 'components');
  let customComponents = new Set();

  if (await fs.pathExists(customDir)) {
    const entries = await fs.readdir(customDir);
    for (const e of entries) {
      const base = e.replace(/\.(js|ts|mjs)$/, '');
      customComponents.add(base);
    }
  }

  for (const file of files) {
    const rel = path.relative(dir, file);
    const raw = await fs.readFile(file, 'utf8');
    const body = matter(raw).content;

    const rewritten = rewriteMdxTags(body);
    const hast = parseHast(rewritten);

    const seenWc = new Set();
    const seenPascal = new Map();

    visit(hast, 'element', (node) => {
      const tag = node.tagName;
      if (!tag) return;

      if (tag.startsWith('wc-') && !seenWc.has(tag)) {
        seenWc.add(tag);
        if (!BUILTIN_COMPONENTS.has(tag) && !AUTHORING_COMPONENTS.has(tag) && !customComponents.has(tag)) {
          issues.push(issue('warning', rel, posLine(node),
            `Unknown component <${tag}> — not a built-in and not found in components/`));
        }
      }
    });

    // PascalCase check on the original body (before rewrite), using mdast html nodes
    const src = stripProtectedContent(body);
    const pascalRe = /<([A-Z][A-Za-z0-9]+)[\s/>]/g;
    for (const m of src.matchAll(pascalRe)) {
      const name = m[1];
      if (seenPascal.has(name)) continue;
      seenPascal.set(name, m.index);

      const cfg = COMPONENT_MAP[name];
      if (cfg) {
        if (!cfg.tag) continue;
        if (!BUILTIN_COMPONENTS.has(cfg.tag) && !customComponents.has(cfg.tag)) {
          issues.push(issue('warning', rel, lineOf(raw, m.index),
            `<${name}> maps to <${cfg.tag}>, which isn't registered — components/${cfg.tag}.js missing?`));
        }
        continue;
      }

      const fallback = pascalToWcKebab(name);
      if (!BUILTIN_COMPONENTS.has(fallback) && !customComponents.has(fallback)) {
        issues.push(issue('warning', rel, lineOf(raw, m.index),
          `<${name}> will render as <${fallback}>, which isn't a built-in and isn't in components/`));
      }
    }
  }
}

// ─── 8. OpenAPI ref check ─────────────────────────────────────────────────────
async function checkOpenAPIRefs(files, dir, config, issues) {
  const openapiField = config?.openapi;
  if (!openapiField) return;

  const specFile = typeof openapiField === 'string' ? openapiField : openapiField?.spec;
  if (!specFile) return;

  const specPath = path.join(dir, specFile);
  if (!await fs.pathExists(specPath)) return;

  let specData;
  try {
    const { loadSpec, getEndpoints, getUndocumentedOps } = await import('./openapi.js');
    const overlayFile = typeof openapiField === 'object' ? openapiField?.overlay : null;
    const spec = await loadSpec(specPath, overlayFile ? path.join(dir, overlayFile) : null);
    specData = getEndpoints(spec);

    const pageRefs = new Set();
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const re = /<wc-endpoint[^>]*ref="([^"]+)"/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        pageRefs.add(m[1]);
      }
    }

    // Check for invalid refs (refs that don't match any operationId)
    const validOps = new Set(specData.filter(e => e.operationId).map(e => e.operationId));
    for (const ref of pageRefs) {
      if (!validOps.has(ref)) {
        const file = files.find(f => {
          const c = fs.readFileSync(f, 'utf8');
          return c.includes(`ref="${ref}"`);
        });
        const rel = file ? path.relative(dir, file) : null;
        issues.push(issue('error', rel, null,
          `Invalid OpenAPI ref="${ref}" — no matching operationId in spec`));
      }
    }

    // Check for undocumented endpoints
    const undoc = getUndocumentedOps(spec, [...pageRefs]);
    for (const opId of undoc) {
      const ep = specData.find(e => e.operationId === opId);
      issues.push(issue('warning', null, null,
        `Undocumented endpoint: ${ep.method} ${ep.path} (${opId}) — run \`docslit openapi scaffold --new-only\` to generate`));
    }
  } catch (e) {
    issues.push(issue('warning', null, null,
      `Failed to validate OpenAPI refs: ${e.message}`));
  }
}

// ─── 9. Orphan check ──────────────────────────────────────────────────────────
async function checkOrphans(files, slugs, dir, issues) {
  const docsDir = path.join(dir, 'docs');
  for (const file of files) {
    if (isReusableDocFile(file, dir)) continue;
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
  const { issues: cfgIssues, config: loadedConfig, slugs } = await checkConfig(dir);
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

  // 8. OpenAPI refs
  await checkOpenAPIRefs(files, dir, loadedConfig, allIssues);

  // 9. Preprocessor authoring checks
  await checkAuthoringPreprocessor(files, dir, loadedConfig, allIssues);

  // 10. Orphans
  await checkOrphans(files, slugs, dir, allIssues);

  const elapsed = Date.now() - t0;
  renderReport(allIssues, files.length, elapsed);

  const hasErrors = allIssues.some(i => i.level === 'error') ||
    (strict && allIssues.some(i => i.level === 'warning'));

  process.exit(hasErrors ? 1 : 0);
}
