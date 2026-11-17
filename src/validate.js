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
import { checkMarkup } from './markup-check.js';
import { listCustomComponentTags } from './custom-components.js';
import { findMathErrors, resolveMathConfig } from './math.js';
import { parseArgs, assertCleanArgs, resolveFormat } from './cli-args.js';
import { expandAllSidebars } from './auto-sidebar.js';
import { expandCodeImports, CODE_IMPORT_FIXES } from './code-import.js';
import { parseThemeConfig, loadThemeFile, resolveSiteTheme, diagnoseTheme, contrastIssues, looksLikeThemeFile } from './themes.js';
import { checkNavigation, checkPageNavigation } from './nav-validate.js';
import { isNavFrontmatterKey, isLinkItem, collectIds } from './navigation.js';

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
  [/^Undefined variable "\{\{(.+?)\}\}"/, 'var-undefined', (m) => `Define ${m[1]} in docslit.json "attributes", page frontmatter "attributes", <wc-var name="${m[1]}" value="..." /> (build time) or <wc-var name="${m[1]}" default="..."></wc-var> (editable at runtime)`],
  [/^tabs\[\d+\]/, 'tab-invalid', () => 'Each tab needs a "tab" name and a "sidebar", "path" or "href"'],
  [/^Tab ".*": autogenerate found no pages/, 'tab-autogenerate-empty', () => 'Add pages under the tab\'s "path" or list them in its "sidebar"'],
  [/^Tab ".*": invalid path/, 'tab-invalid-path', () => 'Use a docs-relative folder such as "reference"'],
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
      const code = e.code || 'code-import-missing-file';
      issues.push(issue('error', rel, e.line + bodyLineOffset, e.message, { code, fix: CODE_IMPORT_FIXES[code] }));
    }
    const isReusable = file.startsWith(reusablesRoot + path.sep);

    const invalidIncludeRe = /<wc-include\b[^>]*>(?:[\s\S]*?)<\/wc-include>/g;
    let badInclude;
    while ((badInclude = invalidIncludeRe.exec(bodySafe)) !== null) {
      issues.push(issue('error', rel, lineOf(body, badInclude.index) + bodyLineOffset,
        'wc-include must use self-closing syntax (<wc-include ... />)'));
    }

    const includeRe = /<wc-include\b([^>]*?)\/>/g;
    let includeMatch;
    while ((includeMatch = includeRe.exec(bodySafe)) !== null) {
      if (isReusable) {
        issues.push(issue('error', rel, lineOf(body, includeMatch.index) + bodyLineOffset,
          'Reusable files in docs/_reusables cannot contain wc-include'));
        continue;
      }
      const attrs = parseTagAttrs(includeMatch[1]);
      if (!attrs.src) {
        issues.push(issue('error', rel, lineOf(body, includeMatch.index) + bodyLineOffset,
          'wc-include requires a src attribute'));
        continue;
      }
      const mapped = mapIncludeSource(attrs.src);
      if (!mapped) {
        issues.push(issue('error', rel, lineOf(body, includeMatch.index) + bodyLineOffset,
          `Invalid include path "${attrs.src}" (must resolve under docs/_reusables)`));
        continue;
      }
      const normalized = path.posix.normalize(mapped).replace(/^\/+/, '');
      if (!normalized.startsWith('_reusables/') || normalized.split('/').includes('..')) {
        issues.push(issue('error', rel, lineOf(body, includeMatch.index) + bodyLineOffset,
          `Include "${attrs.src}" resolves outside docs/_reusables`));
        continue;
      }
      if (!normalized.endsWith('.md')) {
        issues.push(issue('error', rel, lineOf(body, includeMatch.index) + bodyLineOffset,
          `Include "${attrs.src}" must target a .md file`));
        continue;
      }
      const absTarget = path.resolve(docsRoot, normalized);
      if (!absTarget.startsWith(reusablesRoot + path.sep)) {
        issues.push(issue('error', rel, lineOf(body, includeMatch.index) + bodyLineOffset,
          `Include "${attrs.src}" resolves outside docs/_reusables`));
        continue;
      }
      if (!await fs.pathExists(absTarget)) {
        issues.push(issue('error', rel, lineOf(body, includeMatch.index) + bodyLineOffset,
          `Include target not found: docs/${normalized}`));
        continue;
      }
      const includeRaw = await fs.readFile(absTarget, 'utf8');
      if (/<wc-include\b/i.test(stripProtectedContent(includeRaw))) {
        issues.push(issue('error', rel, lineOf(body, includeMatch.index) + bodyLineOffset,
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
        issues.push(issue('error', rel, lineOf(body, dec.index) + bodyLineOffset,
          `Invalid wc-var declaration name "${attrs.name}"`));
        continue;
      }
      localDeclarations[attrs.name] = attrs.value;
    }

    // Runtime variables: <wc-var name="X" default="…"></wc-var> registers X in the
    // browser (window.__docslit_vars__) and every {{X}} in prose then renders live
    // from it, so {{X}} is satisfied without a build-time value (see components/code.js).
    const runtimeVars = new Set();
    for (const rv of bodySafe.matchAll(/<wc-var\b([^>]*?)(\/?)>/g)) {
      const a = parseTagAttrs(rv[1]);
      if (!a.name || (rv[2] === '/' && Object.prototype.hasOwnProperty.call(a, 'value'))) continue;
      runtimeVars.add(a.name);
    }
    const mergedVars = { ...globalAttrs, ...pageAttrs, ...localDeclarations };
    const placeholderRe = /\{\{([^}]+)\}\}/g;
    let placeholder;
    while ((placeholder = placeholderRe.exec(bodySafe)) !== null) {
      const key = placeholder[1].trim();
      if (!VAR_NAME_RE.test(key)) {
        // lower-case {{prop}} placeholders in reusable snippets are filled by the including <wc-include>
        if (/(?:^|[\\/])_reusables[\\/]/.test(rel) && /^[A-Za-z_][\w-]*$/.test(key)) continue;
        issues.push(issue('warning', rel, lineOf(body, placeholder.index) + bodyLineOffset,
          `Invalid variable placeholder "{{${key}}}"`));
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(mergedVars, key) && !runtimeVars.has(key)) {
        issues.push(issue('warning', rel, lineOf(body, placeholder.index) + bodyLineOffset,
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
    else if (isLinkItem(p)) continue; // { href, title } link entries are not pages
    else if (p && typeof p === 'object' && Array.isArray(p.pages)) {
      if (typeof p.root === 'string' && p.root) out.push(p.root); // group "root" page (title links to it)
      out.push(...flattenSidebarPages(p.pages, onInvalid));
    } else onInvalid(p);
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
  const rawConfig = config;
  config = await expandAllSidebars(config, dir, {
    warn: (m) => issues.push(issue('warning', 'docslit.json', null, m)),
  });
  for (const n of await checkNavigation({ raw: rawConfig, config, dir })) {
    issues.push(issue(n.level, 'docslit.json', null, n.message, { code: n.code, fix: n.fix }));
  }

  if (!config.sidebar || !Array.isArray(config.sidebar)) {
    issues.push(issue('error', 'docslit.json', null,
      'Missing required field: "sidebar" (must be an array of groups)'));
    return { issues, config, slugs: new Set() };
  }

  const slugs = new Set();
  for (const group of config.sidebar) {
    // group: "" is deliberate (unnamed groups in tabs, the hidden-pages group); a missing name is not.
    if (typeof group !== 'object' || group === null || (!group.group && group.group !== '')) {
      issues.push(issue('warning', 'docslit.json', null,
        `Sidebar group is missing a "group" name: ${JSON.stringify(group)}`));
      continue;
    }
    if (!Array.isArray(group.pages)) {
      issues.push(issue('warning', 'docslit.json', null,
        `Group "${group.group}" has no "pages" array`));
      continue;
    }
    if (typeof group.root === 'string' && group.root) slugs.add(group.root);
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

  // Check for duplicate slugs (pages shared between tabs are reported as tab-duplicate-page instead)
  const crossTab = new Set();
  if (Array.isArray(config.tabs)) {
    const owner = new Map();
    for (const tab of config.tabs) {
      for (const id of new Set((tab.sidebar || []).flatMap((g) => collectIds(g.pages || [])))) {
        if (owner.has(id) && owner.get(id) !== tab.id) crossTab.add(id);
        else owner.set(id, tab.id);
      }
    }
  }
  const seen = new Set();
  for (const group of config.sidebar) {
    for (const slug of flattenSidebarPages(group.pages || [], () => {})) {
      if (seen.has(slug) && !crossTab.has(slug)) {
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
    for (const d of diagnoseTheme(config)) {
      issues.push(issue(d.level, 'docslit.json', null, d.message, { code: d.code, fix: d.fix }));
    }
    if (typeof config.theme === 'object' && !Array.isArray(config.theme)) {
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
    } else if (typeof config.theme !== 'string') {
      issues.push(issue('error', 'docslit.json', null,
        '"theme" must be a theme name, palette name, theme file path, or theme config object'));
    }
    if (parsed.file && (typeof config.theme === 'object' || looksLikeThemeFile(config.theme))) {
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
    if (!issues.some((i) => i.level === 'error' && /^theme-/.test(i.code || ''))) {
      try {
        const resolved = await resolveSiteTheme(config, dir);
        if (resolved.isCustom) {
          for (const c of contrastIssues(resolved)) {
            issues.push(issue('warning', 'docslit.json', null,
              `Theme (${c.mode} mode): ${c.pair} has contrast ${c.ratio}:1, below the WCAG AA minimum of ${c.min}:1`,
              { code: 'theme-low-contrast', fix: 'Pick a lighter/darker colour, or leave the key unset so DocsLit derives an accessible value' }));
          }
        }
      } catch { /* a broken theme file is reported above */ }
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
async function checkFrontmatter(files, dir, issues, config = null) {
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
      if (!VALID_FM_KEYS.has(key) && !isNavFrontmatterKey(key)) {
        issues.push(issue('info', rel, null,
          `Unknown frontmatter key: "${key}" — will be ignored at build time`));
      }
    }
    for (const n of checkPageNavigation(data, config)) {
      issues.push(issue(n.level, rel, null, n.message, { code: n.code, fix: n.fix }));
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
/**
 * Candidate locations for a local asset reference, or null when the reference is
 * not a local file (remote URL, data:, anchor, …).
 *   /x.png        -> docs/ root (media is copied from docs/ to the site root) or project root
 *   ./x  ../x     -> relative to the page file
 *   images/x.png  -> relative to the page file, falling back to docs/ and the project root
 *                    (the same roots the image pipeline searches)
 */
function assetCandidates(rawTarget, fileDir, dir) {
  let target = String(rawTarget || '').trim().split('#')[0].split('?')[0];
  if (!target || target.startsWith('#') || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) return null;
  try { target = decodeURI(target); } catch { /* keep as written */ }
  const docsRoot = path.join(dir, 'docs');
  let candidates;
  if (target.startsWith('/')) {
    candidates = [path.join(dir, target), path.join(docsRoot, target)];
  } else if (target.startsWith('./') || target.startsWith('../')) {
    candidates = [path.resolve(fileDir, target)];
  } else {
    candidates = [path.resolve(fileDir, target), path.resolve(docsRoot, target), path.resolve(dir, target)];
  }
  return { target, candidates };
}

async function checkAssets(files, dir, issues) {
  for (const file of files) {
    const rel = path.relative(dir, file);
    const raw = await fs.readFile(file, 'utf8');
    const body = matter(raw).content;
    const fileDir = path.dirname(file);
    const off = bodyOffset(raw, body);
    // Markdown images appear both as mdast `image` and (after remark-rehype) as hast
    // `img`; report each distinct reference once.
    const reported = new Set();

    const check = (src, line) => {
      const found = assetCandidates(src, fileDir, dir);
      if (!found) return;
      const key = `${line}\0${found.target}`;
      if (reported.has(key)) return;
      if (found.candidates.some((c) => fs.pathExistsSync(c))) return;
      reported.add(key);
      issues.push(issue('error', rel, line, `Missing asset: "${found.target}" (resolved to ${path.relative(dir, found.candidates[0])})`));
    };

    visit(parseMdast(body), 'image', (node) => check(node.url, posLine(node, off)));

    const hast = parseHast(rewriteMdxTags(body));
    visit(hast, 'element', (node) => {
      if (node.tagName !== 'img') return;
      check(node.properties?.src, posLine(node, off));
    });
  }
}

// ─── 7. Component check ────────────────────────────────────────────────────────
async function checkComponents(files, dir, issues) {
  const customComponents = await listCustomComponentTags(dir);

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

// ─── 7b. Component markup check (attributes, values, nesting, unclosed tags) ───
// Same engine as the MCP `check_markup` tool (src/markup-check.js), run over every
// page. Levels: unclosed/stray/malformed tags are errors (they break rendering);
// unknown attributes, invalid enum values, missing required attributes and bad
// nesting are warnings. Unknown *tags* are left to checkComponents (above).
const MARKUP_FALLBACK_FIX = {
  'unclosed-tag': 'Add the missing closing tag',
  'unexpected-closing-tag': 'Remove the stray closing tag or add the matching opening tag',
  'malformed-tag': 'Close the tag with ">" and balance attribute quotes',
};

async function checkComponentMarkup(files, dir, issues) {
  const customTags = await listCustomComponentTags(dir);
  for (const file of files) {
    if (isReusableDocFile(file, dir)) continue; // reusables are fragments; checked where included
    const rel = path.relative(dir, file);
    const raw = await fs.readFile(file, 'utf8');
    // checkMarkup masks frontmatter itself, so line numbers are whole-file.
    const result = checkMarkup(raw, { customTags });
    for (const m of result.issues) {
      if (m.code === 'unknown-component') continue;
      issues.push(issue(m.level, rel, m.line, m.message, { code: m.code, fix: m.fix || MARKUP_FALLBACK_FIX[m.code] }));
    }
  }
}

// ─── 7c. Math check ───────────────────────────────────────────────────────────
// KaTeX failures otherwise build silently (a `katex-error` span with a tooltip).
async function checkMath(files, dir, config, issues) {
  const cfg = resolveMathConfig(config?.math);
  if (!cfg.enabled) return;
  for (const file of files) {
    const rel = path.relative(dir, file);
    const raw = await fs.readFile(file, 'utf8');
    let body;
    try { body = matter(raw).content; } catch { continue; } // reported by the frontmatter check
    const off = bodyOffset(raw, body);
    for (const e of findMathErrors(body, cfg)) {
      issues.push(issue('warning', rel, e.line + off, `Invalid math: ${e.message}`, {
        code: 'math-invalid',
        fix: 'Fix the TeX (see https://katex.org/docs/supported.html) or, for a literal "$$", escape it as \\$\\$',
      }));
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
    const params = [i.file && `file=${i.file}`, i.line && `line=${i.line}`, i.code && `title=${i.code}`].filter(Boolean).join(',');
    console.log(`::${level}${params ? ` ${params}` : ''}::${i.message}`);
  }
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
  const [fmIssues, linkIssues, assetIssues, compIssues, markupIssues, mathIssues] = await Promise.all([
    (async () => { const a = []; await checkFrontmatter(files, dir, a, loadedConfig); return a; })(),
    (async () => { const a = []; await checkLinks(files, slugs, dir, a); return a; })(),
    (async () => { const a = []; await checkAssets(files, dir, a); return a; })(),
    (async () => { const a = []; await checkComponents(files, dir, a); return a; })(),
    (async () => { const a = []; await checkComponentMarkup(files, dir, a); return a; })(),
    (async () => { const a = []; await checkMath(files, dir, loadedConfig, a); return a; })(),
  ]);
  allIssues.push(...fmIssues, ...linkIssues, ...assetIssues, ...compIssues, ...markupIssues, ...mathIssues);

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
  const parsed = parseArgs(args, { flags: ['--strict', '--external'], options: ['--format'] });
  assertCleanArgs(parsed, 'validate');
  const strict    = parsed.flags.has('--strict');
  const external  = parsed.flags.has('--external');
  const format    = resolveFormat(parsed, 'validate');
  const dir       = path.resolve(parsed.positional[0] || '.');
  const json      = format === 'json';
  const github    = format === 'github';
  // json and github are machine formats: stdout carries only the payload.
  const quiet     = json || github;

  if (!quiet && !await fs.pathExists(dir)) {
    console.error(pc.red(`  Error: Directory not found: ${dir}`));
    process.exit(1);
  }

  if (!quiet) console.log(pc.dim(`\n  Validating ${dir}…`));

  const result = await runValidation(dir, {
    strict,
    external,
    onExternalStart: quiet ? undefined : () => console.log(pc.dim(`  Checking external links…`)),
  });

  if (json) {
    const { elapsedMs, ...out } = result;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else if (github) {
    renderGithubFormat(result.issues);
  } else {
    renderReport(result.issues, result.summary.pages, result.elapsedMs);
  }

  process.exit(result.ok ? 0 : 1);
}
