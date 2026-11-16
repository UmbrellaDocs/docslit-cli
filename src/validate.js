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
import { listComponentTags } from './component-manifest.js';
import { expandAllSidebars } from './auto-sidebar.js';
import { expandCodeImports } from './code-import.js';
import { isValidThemePreset, listThemePresets, parseThemeConfig, loadThemeFile } from './themes.js';

// ─── Built-in component registry ──────────────────────────────────────────────
// Derived from the component manifest (src/component-manifest.js), which a test
// keeps in sync with the components actually registered in src/components/*.js.
const BUILTIN_COMPONENTS = new Set(listComponentTags());
const AUTHORING_COMPONENTS = new Set([
  'wc-include',
]);

// Known valid frontmatter keys
const VALID_FM_KEYS = new Set([
  'title', 'description', 'icon', 'tag', 'readtime', 'updated',
  'sidebar_title', 'component', 'draft', 'order', 'redirect', 'layout',
  'date', 'ogImage', 'attributes', 'published', 'desc', 'feedback',
  'sidebar', 'sidebar_position',
]);

// Recognised icon names (subset — just validates non-empty string)
function isValidIcon(v) { return typeof v === 'string' && v.trim().length > 0; }

// ─── Issue builder ─────────────────────────────────────────────────────────────
// Every issue carries a stable kebab-case `code` (for machine consumers such as
// `validate --format json`) and, when obvious, a short `fix` suggestion. Codes
// are derived from the message in one place (ISSUE_RULES) so call sites stay
// simple; pass `{ code, fix }` as a 5th argument to override.
const ISSUE_RULES = [
  [/^docslit\.json not found/, 'config-missing', () => 'Run `docslit init` or create docslit.json with a "sidebar" array'],
  [/^JSON parse error/, 'config-invalid-json', () => 'Fix the JSON syntax error in docslit.json (check commas and quotes)'],
  [/^Missing required field: "sidebar"/, 'config-missing-sidebar', () => 'Add a "sidebar" array of { "group", "pages" } objects to docslit.json'],
  [/^Sidebar group is missing a "group" name/, 'sidebar-group-unnamed', () => 'Add a "group" name to the sidebar entry'],
  [/^Group ".*" has no "pages" array/, 'sidebar-group-no-pages', () => 'Add a "pages" array of page slugs to the group'],
  [/non-string page slug/, 'sidebar-invalid-page', () => 'Use page slug strings like "guides/setup" in sidebar pages'],
  [/^Page slug ".*" contains unusual characters/, 'sidebar-slug-unusual', () => 'Use lowercase letters, digits, hyphens and slashes in page slugs'],
  [/^Duplicate page slug in sidebar/, 'sidebar-duplicate-slug', () => 'List each page once in the sidebar'],
  [/^OpenAPI spec file not found: (.+)$/, 'openapi-spec-missing', (m) => `Add the spec file at ${m[1]} or fix the "openapi" path in docslit.json`],
  [/^openapi config is set but no spec file/, 'openapi-spec-unset', () => 'Set "openapi" to a spec path or { "spec": "openapi.yaml" }'],
  [/^OpenAPI overlay file not found: (.+)$/, 'openapi-overlay-missing', (m) => `Add the overlay file at ${m[1]} or remove "openapi.overlay"`],
  [/^"announcement/, 'announcement-invalid', () => 'Set "announcement": { "message": "..." } in docslit.json'],
  [/announcement\.message must be a string/, 'announcement-invalid', () => 'Give the version announcement a string "message"'],
  [/^Unknown theme preset/, 'theme-unknown-preset', () => 'Run `docslit theme list` and use a listed preset name'],
  [/^theme\.\w+\.[^ ]+ must be a string/, 'theme-invalid-value', () => 'Theme values must be strings (e.g. "#0ea5e9")'],
  [/^Theme file not found/, 'theme-file-missing', () => 'Create the theme file (`docslit theme init`) or fix the path'],
  [/^"theme" must be/, 'theme-invalid-type', () => 'Use a preset name, a theme file path, or a theme config object'],
  [/^docs\/ directory not found/, 'docs-dir-missing', () => 'Create a docs/ directory with Markdown pages'],
  [/^Sidebar slug "(.+)" has no matching file/, 'sidebar-missing-file', (m) => `Create docs/${m[1]}.md or remove "${m[1]}" from the sidebar`],
  [/^Frontmatter parse error/, 'frontmatter-parse-error', () => 'Fix the YAML between the --- delimiters (frontmatter must be a mapping)'],
  [/^Missing frontmatter field: "title"/, 'frontmatter-missing-title', () => 'Add `title: ...` to the page frontmatter'],
  [/^Unknown frontmatter key: "(.+?)"/, 'frontmatter-unknown-key', (m) => `Remove "${m[1]}" or check the spelling (see \`docslit schema frontmatter\`)`],
  [/^"readtime" should be a string/, 'frontmatter-invalid-readtime', () => 'Quote the value, e.g. readtime: "5 min read"'],
  [/^"icon" should be/, 'frontmatter-invalid-icon', () => 'Set icon to a non-empty icon name string'],
  [/^"redirect" must be a string/, 'frontmatter-invalid-redirect', () => 'Set redirect to a path string like "/new-page"'],
  [/^Page has redirect/, 'page-redirect', null],
  [/^Broken internal link → "(.+?)"/, 'broken-link', (m) => `Fix the link target "${m[1]}" or create the missing page and add it to the sidebar`],
  [/^Possible broken href → "(.+?)"/, 'broken-href', (m) => `Check that "${m[1]}" points to an existing page slug`],
  [/^Missing asset: "(.+?)"/, 'missing-asset', (m) => `Add the file at "${m[1]}" or fix the path`],
  [/^Unknown component <(.+?)>/, 'unknown-component', (m) => `Use a built-in tag (run \`docslit components\`) or add components/${m[1]}.js`],
  [/which isn't registered/, 'component-mapping-unregistered', () => 'Add the matching file under components/'],
  [/will render as <.+?>, which isn't a built-in/, 'unknown-component', () => 'Use a built-in wc-* tag (run `docslit components`) or add it under components/'],
  [/^Invalid OpenAPI ref=/, 'openapi-invalid-ref', () => 'Use an operationId that exists in the OpenAPI spec'],
  [/^Undocumented endpoint/, 'openapi-undocumented-endpoint', () => 'Run `docslit openapi scaffold <spec> --new-only`'],
  [/^Failed to validate OpenAPI refs/, 'openapi-validation-failed', () => 'Check that the OpenAPI spec is valid'],
  [/^wc-include must use self-closing/, 'include-not-self-closing', () => 'Write <wc-include src="..." />'],
  [/^Reusable files in docs\/_reusables cannot contain wc-include/, 'include-in-reusable', () => 'Remove the nested wc-include from the reusable file'],
  [/^wc-include requires a src/, 'include-missing-src', () => 'Add src="file.md" (a file under docs/_reusables)'],
  [/^Invalid include path/, 'include-invalid-path', () => 'Point src at a file under docs/_reusables'],
  [/^Include ".*" resolves outside/, 'include-outside-reusables', () => 'Keep included files under docs/_reusables'],
  [/^Include ".*" must target a \.md file/, 'include-not-markdown', () => 'Included files must end in .md'],
  [/^Include target not found: (.+)$/, 'include-target-missing', (m) => `Create ${m[1]}`],
  [/^Nested include found/, 'include-nested', () => 'Reusable files cannot include other files'],
  [/^Frontmatter in reusable file/, 'include-reusable-frontmatter', () => 'Remove the frontmatter from the reusable file'],
  [/^Invalid wc-var declaration name/, 'var-invalid-name', () => 'Use letters, digits and underscores, starting with a letter or underscore'],
  [/^Invalid variable placeholder/, 'var-invalid-placeholder', () => 'Use {{NAME}} with a valid variable name'],
  [/^Undefined variable "\{\{(.+?)\}\}"/, 'var-undefined', (m) => `Define ${m[1]} in docslit.json "attributes", page frontmatter "attributes", or <wc-var name="${m[1]}" value="..." />`],
  [/^Orphaned page/, 'orphan-page', (m, msg) => { const s = /slug: "(.+?)"/.exec(msg); return s ? `Add "${s[1]}" to a sidebar group in docslit.json` : undefined; }],
  [/^External link returned/, 'external-link-status', () => 'Update or remove the dead link'],
  [/^External link failed/, 'external-link-failed', () => 'Check the URL or your network connection'],
];

function classifyIssue(message) {
  for (const [re, code, fixFn] of ISSUE_RULES) {
    const m = re.exec(message);
    if (m) return { code, fix: fixFn ? fixFn(m, message) : undefined };
  }
  return { code: 'other', fix: undefined };
}

function issue(level, file, line, message, opts = {}) {
  const auto = classifyIssue(message);
  return {
    level,
    code: opts.code || auto.code,
    file: file || null,
    line: line || null,
    message,
    fix: opts.fix || auto.fix,
  };
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
    const bodyLineOffset = raw.split('\n').length - body.split('\n').length;
    const codeImports = await expandCodeImports(body, { projectRoot: dir });
    for (const e of codeImports.errors) {
      issues.push(issue('error', rel, e.line + bodyLineOffset, e.message));
    }
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

/** Flatten sidebar pages (strings, { id } items and nested { group, pages } subgroups) to slugs. */
function flattenSidebarPages(pages, onInvalid) {
  const out = [];
  for (const p of pages || []) {
    if (typeof p === 'string') out.push(p);
    else if (p && typeof p === 'object' && typeof p.id === 'string') out.push(p.id);
    else if (p && typeof p === 'object' && Array.isArray(p.pages)) out.push(...flattenSidebarPages(p.pages, onInvalid));
    else onInvalid(p);
  }
  return out;
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

  // Expand autogenerate groups / "sidebar": "auto" into explicit pages.
  config = await expandAllSidebars(config, dir, {
    warn: (m) => issues.push(issue('warning', 'docslit.json', null, m)),
  });

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
    for (const slug of flattenSidebarPages(group.pages, (bad) => {
      issues.push(issue('error', 'docslit.json', null,
        `Group "${group.group}" contains a non-string page slug: ${JSON.stringify(bad)}`));
    })) {
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
    for (const slug of flattenSidebarPages(group.pages || [], () => {})) {
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
    const parsed = parseThemeConfig(config);
    if (typeof config.theme === 'string' && !isValidThemePreset(config.theme) && !parsed.file) {
      issues.push(issue('error', 'docslit.json', null,
        `Unknown theme preset "${config.theme}". Use a preset name, a theme file path, or docslit theme list`));
    }
    if (typeof config.theme === 'object' && !Array.isArray(config.theme)) {
      const base = parsed.basePreset;
      if (!isValidThemePreset(base)) {
        const names = listThemePresets().map(t => t.id).join(', ');
        issues.push(issue('error', 'docslit.json', null,
          `Unknown theme preset "${base}". Available presets: ${names}`));
      }
      for (const layer of ['colors', 'dark', 'light']) {
        const obj = parsed[layer];
        if (obj && Object.keys(obj).length) {
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value !== 'string') {
              issues.push(issue('error', 'docslit.json', null, `theme.${layer}.${key} must be a string`));
            }
          }
        }
      }
      if (parsed.file) {
        const themePath = path.resolve(dir, parsed.file);
        if (!await fs.pathExists(themePath)) {
          issues.push(issue('error', 'docslit.json', null, `Theme file not found: ${parsed.file}`));
        } else {
          try {
            await loadThemeFile(parsed.file, dir);
          } catch (e) {
            issues.push(issue('error', parsed.file, null, e.message, { code: 'theme-file-invalid', fix: 'Fix the theme file contents (see `docslit theme init`)' }));
          }
        }
      }
    } else if (typeof config.theme !== 'string') {
      issues.push(issue('error', 'docslit.json', null,
        '"theme" must be a preset name, theme file path, or theme config object'));
    } else if (parsed.file) {
      const themePath = path.resolve(dir, parsed.file);
      if (!await fs.pathExists(themePath)) {
        issues.push(issue('error', 'docslit.json', null, `Theme file not found: ${parsed.file}`));
      } else {
        try {
          await loadThemeFile(parsed.file, dir);
        } catch (e) {
          issues.push(issue('error', parsed.file, null, e.message, { code: 'theme-file-invalid', fix: 'Fix the theme file contents (see `docslit theme init`)' }));
        }
      }
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

function posLine(node, offset = 0) {
  const l = node?.position?.start?.line;
  return l == null ? null : l + offset;
}

// Lines between the top of the file and the first body line (frontmatter), so
// body-relative AST positions can be reported as whole-file line numbers.
function bodyOffset(raw, body) {
  return raw.split('\n').length - body.split('\n').length;
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
    const off = bodyOffset(raw, body);
    const tree = parseMdast(body);

    visit(tree, 'link', (node) => {
      const target = (node.url || '').trim().split('#')[0];
      if (!target || /^https?:\/\//.test(target) || /^mailto:/.test(target)) return;
      if (isExternalish(target)) return;
      const resolved = resolveLinkSlug(target, currentSlug, slugs);
      if (!resolved.ok) {
        issues.push(issue('error', rel, posLine(node, off),
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
          issues.push(issue('warning', rel, posLine(node, off),
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
    const off = bodyOffset(raw, body);

    const tree = parseMdast(body);

    visit(tree, 'image', (node) => {
      const target = (node.url || '').trim().split('#')[0].split('?')[0];
      if (!target || /^https?:\/\//.test(target) || target.startsWith('data:')) return;
      if (!target.startsWith('.') && !target.startsWith('/')) return;
      const absTarget = target.startsWith('/')
        ? path.join(dir, target)
        : path.resolve(fileDir, target);
      if (!fs.pathExistsSync(absTarget)) {
        issues.push(issue('error', rel, posLine(node, off),
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
        issues.push(issue('error', rel, posLine(node, off),
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

    const off = bodyOffset(raw, body);
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
          issues.push(issue('warning', rel, posLine(node, off),
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
          issues.push(issue('warning', rel, lineOf(body, m.index) + off,
            `<${name}> maps to <${cfg.tag}>, which isn't registered — components/${cfg.tag}.js missing?`));
        }
        continue;
      }

      const fallback = pascalToWcKebab(name);
      if (!BUILTIN_COMPONENTS.has(fallback) && !customComponents.has(fallback)) {
        issues.push(issue('warning', rel, lineOf(body, m.index) + off,
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
      try {
        if (matter(await fs.readFile(file, 'utf8')).data?.sidebar === false) continue; // intentionally unlisted
      } catch { /* frontmatter errors are reported elsewhere */ }
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

// ─── External link checking ────────────────────────────────────────────────────
async function checkExternalLinks(files, dir, issues) {
  const urls = new Map();
  for (const file of files) {
    const rel = path.relative(dir, file);
    const raw = await fs.readFile(file, 'utf8');
    const body = matter(raw).content;
    const off = bodyOffset(raw, body);
    const tree = parseMdast(body);
    visit(tree, 'link', (node) => {
      const target = (node.url || '').trim().split('#')[0];
      if (/^https?:\/\//i.test(target)) {
        if (!urls.has(target)) urls.set(target, []);
        urls.get(target).push({ file: rel, line: posLine(node, off) });
      }
    });
  }

  const CONCURRENCY = 8;
  const TIMEOUT = 8000;
  const entries = [...urls.entries()];
  let idx = 0;

  async function worker() {
    while (idx < entries.length) {
      const i = idx++;
      const [url, refs] = entries[i];
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT);
        let res = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
        if (!res.ok && res.status >= 400) {
          res = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'follow' });
        }
        clearTimeout(timer);
        if (!res.ok) {
          for (const ref of refs) {
            issues.push(issue('warning', ref.file, ref.line, `External link returned ${res.status}: ${url}`));
          }
        }
      } catch (e) {
        for (const ref of refs) {
          issues.push(issue('warning', ref.file, ref.line, `External link failed: ${url} (${e.message})`));
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, () => worker()));
}

// ─── GitHub Actions format ─────────────────────────────────────────────────────
function renderGithubFormat(allIssues) {
  for (const i of allIssues) {
    const level = i.level === 'error' ? 'error' : i.level === 'warning' ? 'warning' : 'notice';
    const filePart = i.file ? `file=${i.file}` : '';
    const linePart = i.line ? `,line=${i.line}` : '';
    console.log(`::${level} ${filePart}${linePart}::${i.message}`);
  }
}

function getValidateFlag(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

// ─── Programmatic API ──────────────────────────────────────────────────────────
/**
 * Run every validation check without printing or exiting.
 * @param {string} dir  Project root (contains docslit.json and docs/)
 * @param {{ strict?: boolean, external?: boolean, onExternalStart?: () => void }} [options]
 * @returns {Promise<{ ok: boolean, summary: { errors: number, warnings: number, infos: number, pages: number },
 *   issues: Array<{ level: 'error'|'warning'|'info', code: string, message: string, file: string|null, line?: number, fix?: string }>,
 *   elapsedMs: number }>}
 */
export async function runValidation(dir, { strict = false, external = false, onExternalStart } = {}) {
  const t0 = Date.now();
  dir = path.resolve(dir || '.');
  const allIssues = [];

  if (!await fs.pathExists(dir)) {
    allIssues.push(issue('error', null, null, `Directory not found: ${dir}`, {
      code: 'directory-not-found', fix: 'Pass the path of a DocsLit project (a folder containing docslit.json)',
    }));
    return finishValidation(allIssues, 0, strict, t0);
  }

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

  // 11. External link check (opt-in)
  if (external) {
    if (onExternalStart) onExternalStart();
    await checkExternalLinks(files, dir, allIssues);
  }

  return finishValidation(allIssues, files.length, strict, t0);
}

function finishValidation(allIssues, pages, strict, t0) {
  const errors = allIssues.filter(i => i.level === 'error').length;
  const warnings = allIssues.filter(i => i.level === 'warning').length;
  const infos = allIssues.filter(i => i.level === 'info').length;
  const issues = allIssues.map((i) => {
    const out = { level: i.level, code: i.code, message: i.message, file: i.file };
    if (i.line) out.line = i.line;
    if (i.fix) out.fix = i.fix;
    return out;
  });
  return {
    ok: errors === 0 && !(strict && warnings > 0),
    summary: { errors, warnings, infos, pages },
    issues,
    elapsedMs: Date.now() - t0,
  };
}

// ─── Entry point ───────────────────────────────────────────────────────────────
export async function validate(args) {
  const strict    = args.includes('--strict');
  const external  = args.includes('--external');
  const format    = getValidateFlag(args, '--format') || 'pretty';
  const positional = args.filter(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--format');
  const dir       = path.resolve(positional[0] || '.');
  const json      = format === 'json';

  if (!json && !await fs.pathExists(dir)) {
    console.error(pc.red(`  Error: Directory not found: ${dir}`));
    process.exit(1);
  }

  if (!json) console.log(pc.dim(`\n  Validating ${dir}…`));

  const result = await runValidation(dir, {
    strict,
    external,
    onExternalStart: json ? undefined : () => console.log(pc.dim(`  Checking external links…`)),
  });

  if (json) {
    const { elapsedMs, ...out } = result;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else if (format === 'github') {
    renderGithubFormat(result.issues);
  } else {
    renderReport(result.issues, result.summary.pages, result.elapsedMs);
  }

  process.exit(result.ok ? 0 : 1);
}
