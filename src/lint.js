/**
 * docslit lint — documentation QUALITY linter.
 *
 * `validate` answers "is it broken?" (links, assets, unknown components);
 * `lint` answers "is it good?", for human readers and for LLM retrieval
 * (descriptions that feed llms.txt/search, a sane heading outline, code blocks
 * with languages, alt text, descriptive link text, right-sized pages).
 *
 * runLint() returns the same shape as runValidation() and never prints or exits.
 *
 * Config (docslit.json):
 *   "lint": { "rules": { "page-too-long": "off" | "info" | "warning" | "error"
 *                        | { "level": "warning", "max": 4000 } } }
 * Page opt-out (HTML comments, ignored inside code):
 *   <!-- docslit-lint-disable rule-a, rule-b -->      whole file (no list = all rules)
 *   <!-- docslit-lint-disable-next-line rule -->      the following line only
 */
import fs from 'fs-extra';
import path from 'path';
import pc from 'picocolors';
import { parseArgs, assertCleanArgs, resolveFormat } from './cli-args.js';
import { parseFrontmatter } from './frontmatter.js';

// ─── Rule table ────────────────────────────────────────────────────────────────
// scope 'page': only real pages (not docs/_reusables snippets); 'content': everywhere.
export const LINT_RULES = {
  'missing-description': { level: 'warning', scope: 'page', summary: 'Frontmatter description is absent or empty' },
  'description-length': { level: 'info', scope: 'page', summary: 'Description shorter than min (30) or longer than max (200) characters', min: 30, max: 200 },
  'title-h1-mismatch': { level: 'info', scope: 'page', summary: 'Frontmatter title differs from the page H1' },
  'multiple-h1': { level: 'warning', scope: 'page', summary: 'More than one H1 on a page' },
  'heading-skip': { level: 'warning', scope: 'page', summary: 'Heading level skipped (e.g. h2 followed by h4)' },
  'duplicate-heading': { level: 'warning', scope: 'page', summary: 'Same heading text twice under the same parent (ambiguous anchors)' },
  'code-no-language': { level: 'warning', scope: 'content', summary: 'Fenced code block (or wc-code-block) without a language' },
  'image-missing-alt': { level: 'warning', scope: 'content', summary: 'Image without alt text' },
  'link-text-vague': { level: 'warning', scope: 'content', summary: 'Link text like "click here" or a bare URL' },
  'page-too-long': { level: 'warning', scope: 'page', summary: 'Page longer than max (2500) prose words; split it', max: 2500 },
  'page-too-short': { level: 'info', scope: 'page', summary: 'Page shorter than min (30) prose words', min: 30 },
  'empty-section': { level: 'warning', scope: 'page', summary: 'Heading with no content before the next same-or-higher heading or EOF' },
  'todo-marker': { level: 'warning', scope: 'content', summary: 'TODO / FIXME / TBD / lorem ipsum left in prose' },
  'raw-html-block': { level: 'info', scope: 'content', summary: 'Raw div/span/table/details HTML where Markdown or a component exists' },
  'callout-overuse': { level: 'info', scope: 'page', summary: 'More than max (5) callouts on a page', max: 5 },
  'long-paragraph': { level: 'info', scope: 'content', summary: 'Paragraph longer than max (150) words', max: 150 },
};

const LEVELS = new Set(['error', 'warning', 'info']);

const FIXES = {
  'missing-description': 'Add a one-sentence `description:` (30-200 characters) to the frontmatter; it feeds search, SEO and llms.txt',
  'description-length': 'Rewrite the description as one clear sentence of 30-200 characters',
  'title-h1-mismatch': 'Make the first `# H1` match the frontmatter title (or drop the redundant one)',
  'multiple-h1': 'Keep a single `# H1`; demote the others to `##`',
  'heading-skip': 'Use the next heading level (do not jump, e.g. h2 straight to h4)',
  'duplicate-heading': 'Rename one heading so each anchor under the same parent is unique',
  'code-no-language': 'Add a language after the opening fence, e.g. ```bash, ```json or ```text for plain output',
  'image-missing-alt': 'Describe what the image shows in the alt text: ![Dashboard with the deploy button highlighted](...)',
  'link-text-vague': 'Make the link text describe the destination, e.g. [the deployment guide](deploy)',
  'page-too-long': 'Split the page into focused pages; shorter pages retrieve better for search and LLMs',
  'page-too-short': 'Add the missing content, or merge this page into a related one',
  'empty-section': 'Write the section, or remove the heading',
  'todo-marker': 'Finish the content or remove the placeholder before publishing',
  'raw-html-block': 'Use Markdown (GFM tables) or a built-in component (run `docslit components`) instead of raw HTML',
  'callout-overuse': 'Keep only the callouts that matter; fold the rest into normal prose',
  'long-paragraph': 'Break the paragraph up, or turn it into a list or steps',
};

const VAGUE_TEXT = new Set([
  'here', 'click here', 'click', 'this link', 'link', 'this page', 'this', 'read more', 'learn more',
  'more', 'more info', 'more information', 'see here', 'this article', 'this doc', 'this document',
]);

// ─── Config ────────────────────────────────────────────────────────────────────
function resolveRuleConfig(userRules, issues) {
  const cfg = {};
  for (const [code, def] of Object.entries(LINT_RULES)) cfg[code] = { ...def };
  if (userRules == null) return cfg;
  const bad = (msg) => issues.push({
    level: 'warning', code: 'lint-config-invalid', file: 'docslit.json', line: null, message: msg,
    fix: 'Use "off", "info", "warning", "error", or { "level": "...", "max": <number> } per rule',
  });
  if (typeof userRules !== 'object' || Array.isArray(userRules)) { bad('"lint.rules" must be an object keyed by rule code'); return cfg; }
  for (const [code, value] of Object.entries(userRules)) {
    if (!cfg[code]) { bad(`Unknown lint rule "${code}" in docslit.json (known: ${Object.keys(LINT_RULES).join(', ')})`); continue; }
    if (value === 'off' || value === false) { cfg[code].level = 'off'; continue; }
    if (typeof value === 'string') {
      if (LEVELS.has(value)) cfg[code].level = value; else bad(`Invalid level "${value}" for lint rule "${code}"`);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const { level, ...opts } = value;
      if (level !== undefined) {
        if (level === 'off' || LEVELS.has(level)) cfg[code].level = level; else bad(`Invalid level "${level}" for lint rule "${code}"`);
      }
      for (const [k, v] of Object.entries(opts)) {
        if (typeof v === 'number' && Number.isFinite(v)) cfg[code][k] = v; else bad(`Option "${k}" of lint rule "${code}" must be a number`);
      }
    } else bad(`Invalid configuration for lint rule "${code}"`);
  }
  return cfg;
}

// ─── Text masking ──────────────────────────────────────────────────────────────
const RAW_TAGS = ['wc-code-block', 'wc-code-tab', 'wc-mermaid', 'wc-asciidoc-table'];
const RAW_OPEN_RE = new RegExp(`<(${RAW_TAGS.join('|')})\\b`);
const blank = (s) => s.replace(/[^\n]/g, ' ');

/**
 * Split a file into line views.
 *  lines     original lines
 *  block     fenced code, raw-component bodies and frontmatter blanked
 *  inline    block + inline code blanked (HTML comments kept; used for directives)
 *  prose     inline + HTML comments and pass:[] blanked
 *  fences    [{ line, lang }] opening fences (1-based)
 *  rawBlocks [{ line, tag, hasLanguage }] wc-code-block style elements
 */
function analyze(raw, fmEndLine) {
  const lines = raw.replace(/^﻿/, '').split(/\r?\n/);
  const block = [];
  const fences = [];
  const rawBlocks = [];
  let fence = null;
  let rawTag = null;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (i < fmEndLine) { block.push(blank(ln)); continue; }
    if (fence) {
      const close = new RegExp(`^\\s*${fence.ch === '`' ? '`' : '~'}{${fence.len},}\\s*$`).test(ln);
      if (close) fence = null;
      block.push(blank(ln));
      continue;
    }
    if (rawTag) {
      if (ln.includes(`</${rawTag}>`)) rawTag = null;
      block.push(blank(ln));
      continue;
    }
    const fm = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(ln);
    if (fm && !(fm[2][0] === '`' && fm[3].includes('`'))) {
      const info = fm[3].trim().replace(/^\{[^}]*\}/, '').trim();
      fences.push({ line: i + 1, lang: info.split(/\s+/)[0] || '' });
      fence = { ch: fm[2][0], len: fm[2].length };
      block.push(blank(ln));
      continue;
    }
    const om = RAW_OPEN_RE.exec(ln);
    if (om) {
      const tag = om[1];
      const tagText = ln.slice(om.index, ln.indexOf('>', om.index) === -1 ? undefined : ln.indexOf('>', om.index) + 1);
      if (tag === 'wc-code-block') rawBlocks.push({ line: i + 1, tag, hasLanguage: /\blanguage\s*=\s*["'][^"']+["']/.test(tagText) });
      const closeAt = ln.indexOf(`</${tag}>`, om.index);
      if (closeAt !== -1) {
        const end = closeAt + tag.length + 3;
        block.push(ln.slice(0, om.index) + blank(ln.slice(om.index, end)) + ln.slice(end));
      } else {
        rawTag = tag;
        block.push(ln.slice(0, om.index) + blank(ln.slice(om.index)));
      }
      continue;
    }
    block.push(ln);
  }
  const inline = block.map((l) => l.replace(/(`+)[^`]+?\1/g, (m) => blank(m)));
  // Same as `inline`, but code spans become filler text so `[`code`](url)` keeps non-empty link text.
  const filled = block.map((l) => l.replace(/(`+)[^`]+?\1/g, (m) => 'x'.repeat(m.length)));
  const prose = stripComments(inline);
  const linkText = stripComments(filled);
  return { lines, block, inline, prose, linkText, fences, rawBlocks };
}

// Blank HTML comments (possibly multi-line) and pass:[...].
function stripComments(src) {
  const prose = [];
  let inComment = false;
  for (const l of src) {
    let out = '';
    let rest = l;
    while (rest.length) {
      if (inComment) {
        const end = rest.indexOf('-->');
        if (end === -1) { out += blank(rest); rest = ''; } else { out += blank(rest.slice(0, end + 3)); rest = rest.slice(end + 3); inComment = false; }
      } else {
        const start = rest.indexOf('<!--');
        if (start === -1) { out += rest; rest = ''; } else { out += rest.slice(0, start); rest = rest.slice(start); inComment = true; }
      }
    }
    prose.push(out.replace(/pass:\[[^\]]*\]/g, (m) => blank(m)));
  }
  return prose;
}

function parseDirectives(inlineLines) {
  const fileOff = new Set();
  let allOff = false;
  const nextLine = new Map(); // target line (1-based) -> Set(rules) | 'all'
  inlineLines.forEach((ln, i) => {
    for (const m of ln.matchAll(/<!--\s*docslit-lint-disable(-next-line)?\b([^>]*?)-->/g)) {
      const rules = m[2].split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      if (m[1]) {
        const target = i + 2;
        if (!rules.length) nextLine.set(target, 'all');
        else if (nextLine.get(target) !== 'all') {
          const set = nextLine.get(target) || new Set();
          rules.forEach((r) => set.add(r));
          nextLine.set(target, set);
        }
      } else if (!rules.length) allOff = true;
      else rules.forEach((r) => fileOff.add(r));
    }
  });
  return { fileOff, allOff, nextLine };
}

// ─── Small helpers ─────────────────────────────────────────────────────────────
function headingSlug(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
}

function stripInlineMd(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(s) {
  return stripInlineMd(String(s)).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function countWords(text) {
  const t = text.replace(/\]\([^)]*\)/g, ']').replace(/<[^>]+>/g, ' ').replace(/\(?https?:\/\/\S+/g, ' ');
  return (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length;
}

function isContentLine(orig) {
  const t = orig.trim();
  if (!t) return false;
  if (/^#{1,6}(\s|$)/.test(t)) return false;
  if (/^<!--.*-->$/.test(t)) return false;
  return true;
}

// ─── Per-file lint ─────────────────────────────────────────────────────────────
function lintFile({ raw, rel, isReusable, cfg, push }) {
  let data = {};
  let fmEnd = 0;
  let fmOk = true;
  const fmMatch = /^﻿?---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(raw);
  if (fmMatch) {
    fmEnd = fmMatch[0].split('\n').length - (fmMatch[2] === '' ? 0 : 1);
    try { data = parseFrontmatter(raw).data || {}; } catch { fmOk = false; }
  }
  const a = analyze(raw, fmEnd);
  const dir = parseDirectives(a.inline);
  const emit = (code, line, message) => {
    const rule = cfg[code];
    if (!rule || rule.level === 'off') return;
    if (dir.allOff || dir.fileOff.has(code)) return;
    const nl = dir.nextLine.get(line);
    if (nl === 'all' || (nl && nl.has(code))) return;
    push({ level: rule.level, code, file: rel, line: line || 1, message, fix: FIXES[code] });
  };
  const page = !isReusable;

  if (data.redirect) return; // redirect stubs have no content to judge

  // Frontmatter rules
  if (page && fmOk) {
    const fmLines = a.lines.slice(0, fmEnd);
    const keyLine = (re) => { const i = fmLines.findIndex((l) => re.test(l)); return i === -1 ? null : i + 1; };
    const descRaw = data.description ?? data.desc;
    const descLine = keyLine(/^(description|desc)\s*:/) || keyLine(/^title\s*:/) || 1;
    if (typeof descRaw !== 'string' || !descRaw.trim()) {
      emit('missing-description', descLine, 'Page has no description in its frontmatter');
    } else {
      const n = descRaw.trim().length;
      const { min, max } = cfg['description-length'];
      if (n < min) emit('description-length', descLine, `Description is ${n} characters; aim for at least ${min}`);
      else if (n > max) emit('description-length', descLine, `Description is ${n} characters; aim for at most ${max}`);
    }
  }

  // Headings
  const headings = [];
  a.block.forEach((ln, i) => {
    const m = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(ln);
    if (!m) return;
    const text = stripInlineMd(m[2].replace(/`/g, ''));
    if (text) headings.push({ level: m[1].length, text, line: i + 1, idx: i });
  });

  if (page) {
    const h1s = headings.filter((h) => h.level === 1);
    if (h1s.length > 1) for (const h of h1s.slice(1)) emit('multiple-h1', h.line, `Extra H1 "${h.text}" (the page already has "${h1s[0].text}")`);
    if (h1s.length && typeof data.title === 'string' && data.title.trim() &&
        normalizeTitle(data.title) !== normalizeTitle(h1s[0].text)) {
      emit('title-h1-mismatch', h1s[0].line, `H1 "${h1s[0].text}" differs from frontmatter title "${data.title}"`);
    }
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1];
      const cur = headings[i];
      if (cur.level > prev.level + 1) {
        emit('heading-skip', cur.line, `Heading jumps from h${prev.level} to h${cur.level}: "${cur.text}"`);
      }
    }
    // duplicates: same slug under the same parent chain
    const path = [];
    const seen = new Map();
    for (const h of headings) {
      while (path.length && path[path.length - 1].level >= h.level) path.pop();
      const key = `${path.map((p) => p.slug).join('/')}>${headingSlug(h.text)}`;
      if (seen.has(key)) emit('duplicate-heading', h.line, `Heading "${h.text}" repeats the one on line ${seen.get(key)}`);
      else seen.set(key, h.line);
      path.push({ level: h.level, slug: headingSlug(h.text) });
    }
    // empty sections
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      const next = headings[i + 1];
      const stop = next ? next.idx : a.lines.length;
      let hasContent = false;
      for (let j = h.idx + 1; j < stop; j++) if (isContentLine(a.lines[j])) { hasContent = true; break; }
      if (hasContent) continue;
      if (!next || next.level <= h.level) emit('empty-section', h.line, `Section "${h.text}" has no content`);
    }
  }

  // Code blocks
  for (const f of a.fences) if (!f.lang) emit('code-no-language', f.line, 'Fenced code block has no language');
  for (const b of a.rawBlocks) if (!b.hasLanguage) emit('code-no-language', b.line, '<wc-code-block> has no language attribute');

  // Prose rules
  const wcImageRe = /<(img|wc-image)\b([^>]*)>/gi;
  let calloutCount = 0;
  let calloutLimitLine = null;
  const rawHtml = [];
  const paragraphs = [];
  let para = null;
  a.prose.forEach((ln, i) => {
    const line = i + 1;
    if (i < fmEnd) return;
    // markdown images and links
    for (const m of ln.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)) {
      if (!m[1].trim()) emit('image-missing-alt', line, `Image "${m[2].trim().split(/\s+/)[0]}" has no alt text`);
    }
    for (const m of ln.matchAll(wcImageRe)) {
      const alt = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[2]);
      const present = alt && (alt[1] ?? alt[2]).trim() !== '';
      const decorative = alt && m[1].toLowerCase() === 'img'; // <img alt=""> is an explicit decorative marker
      if (!present && !decorative) emit('image-missing-alt', line, `<${m[1]}> has no alt text`);
    }
    for (const m of a.linkText[i].matchAll(/(^|[^!\\])\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g)) {
      const text = m[2].trim();
      const norm = text.toLowerCase().replace(/[.!:,\s→>»]+$/u, '').replace(/^[«<→\s]+/u, '').trim();
      if (!text) emit('link-text-vague', line, `Link to "${m[3]}" has no text`);
      else if (/^(https?:\/\/|www\.)\S+$/i.test(text)) emit('link-text-vague', line, `Link text is a bare URL (${text})`);
      else if (VAGUE_TEXT.has(norm)) emit('link-text-vague', line, `Link text "${text}" does not describe the destination`);
    }
    // todo markers
    const todo = /\b(?:TODO|FIXME|TBD)\b|lorem ipsum/i.exec(ln);
    if (todo && (/^(?:TODO|FIXME|TBD)$/.test(todo[0]) || /^lorem ipsum$/i.test(todo[0]))) {
      emit('todo-marker', line, `Placeholder text "${todo[0]}" left in prose`);
    }
    // raw html
    const rh = /<(div|table|span|center|font|details)\b/i.exec(ln);
    if (rh) rawHtml.push({ line, tag: rh[1].toLowerCase() });
    // callouts
    for (const m of ln.matchAll(/<(wc-callout|wc-alert)\b/g)) {
      calloutCount++;
      if (calloutCount === cfg['callout-overuse'].max + 1) calloutLimitLine = line;
      void m;
    }
    // paragraphs
    const t = ln.trim();
    const isParaLine = t && !/^(#{1,6}\s|[|>]|[-*+]\s|\d+[.)]\s|<|\||={3,}|-{3,}|\{\{)/.test(t);
    if (isParaLine) {
      if (!para) para = { line, text: '' };
      para.text += ` ${t}`;
    } else if (para) { paragraphs.push(para); para = null; }
  });
  if (para) paragraphs.push(para);

  if (rawHtml.length) {
    const tags = [...new Set(rawHtml.map((r) => r.tag))].map((t) => `<${t}>`).join(', ');
    emit('raw-html-block', rawHtml[0].line, `${rawHtml.length} raw HTML element${rawHtml.length > 1 ? 's' : ''} (${tags}) in Markdown`);
  }
  if (page && calloutLimitLine) {
    emit('callout-overuse', calloutLimitLine, `${calloutCount} callouts on one page (max ${cfg['callout-overuse'].max})`);
  }
  for (const p of paragraphs) {
    const w = countWords(p.text);
    if (w > cfg['long-paragraph'].max) emit('long-paragraph', p.line, `Paragraph is ${w} words (max ${cfg['long-paragraph'].max})`);
  }

  // Page length
  if (page) {
    const words = countWords(a.prose.slice(fmEnd).join('\n'));
    const { max } = cfg['page-too-long'];
    const { min } = cfg['page-too-short'];
    const firstContent = a.lines.findIndex((l, i) => i >= fmEnd && l.trim()) + 1 || 1;
    if (words > max) emit('page-too-long', firstContent, `Page has ~${words} words (max ${max})`);
    else if (words < min && !/<wc-(endpoint|api-examples|playground|runnable-endpoint|include|tiles|card|update)\b/.test(a.prose.join('\n')) &&
             data.layout !== 'api') {
      emit('page-too-short', firstContent, `Page has only ~${words} words (min ${min})`);
    }
  }
}

// ─── Discovery ─────────────────────────────────────────────────────────────────
async function discover(dir, config) {
  const roots = [path.join(dir, 'docs')];
  const locales = Array.isArray(config?.i18n?.locales) ? config.i18n.locales : [];
  const def = config?.i18n?.defaultLocale || 'en';
  for (const l of locales) if (l !== def) roots.push(path.join(dir, `docs.${l}`));
  const out = [];
  async function walk(d) {
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    entries.sort((x, y) => x.name.localeCompare(y.name));
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (/\.(md|mdx)$/.test(e.name)) out.push(full);
    }
  }
  for (const r of roots) if (await fs.pathExists(r)) await walk(r);
  return out;
}

// ─── Programmatic API ──────────────────────────────────────────────────────────
/**
 * @param {string} dir project root
 * @param {{ strict?: boolean }} [opts]
 * @returns same shape as runValidation(): { ok, summary:{errors,warnings,infos,pages}, issues[], elapsedMs }
 */
export async function runLint(dir, { strict = false } = {}) {
  const t0 = Date.now();
  dir = path.resolve(dir || '.');
  const issues = [];
  const finish = (pages) => {
    const count = (l) => issues.filter((i) => i.level === l).length;
    const errors = count('error');
    const warnings = count('warning');
    const infos = count('info');
    return {
      ok: errors === 0 && !(strict && warnings > 0),
      summary: { errors, warnings, infos, pages },
      issues,
      elapsedMs: Date.now() - t0,
    };
  };

  if (!await fs.pathExists(dir)) {
    issues.push({ level: 'error', code: 'directory-not-found', file: null, line: null,
      message: `Directory not found: ${dir}`, fix: 'Pass the path of a DocsLit project (a folder containing docslit.json)' });
    return finish(0);
  }

  let config = null;
  const configPath = path.join(dir, 'docslit.json');
  if (await fs.pathExists(configPath)) {
    try { config = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {
      issues.push({ level: 'warning', code: 'config-invalid-json', file: 'docslit.json', line: null,
        message: 'docslit.json is not valid JSON; using default lint rules', fix: 'Run `docslit validate` for details' });
    }
  }
  const cfg = resolveRuleConfig(config?.lint?.rules, issues);

  const files = await discover(dir, config);
  if (!files.length) {
    issues.push({ level: 'warning', code: 'docs-dir-missing', file: null, line: null,
      message: 'No Markdown pages found under docs/', fix: 'Create docs/*.md pages (see `docslit new`)' });
    return finish(0);
  }

  let pages = 0;
  for (const file of files) {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const isReusable = /(^|\/)_reusables\//.test(rel);
    if (!isReusable) pages++;
    const raw = await fs.readFile(file, 'utf8');
    lintFile({ raw, rel, isReusable, cfg, push: (i) => issues.push(i) });
  }
  issues.sort((x, y) => (x.file || '').localeCompare(y.file || '') || (x.line || 0) - (y.line || 0));
  return finish(pages);
}

// ─── CLI ───────────────────────────────────────────────────────────────────────
function renderPretty(result, dir) {
  const { issues, summary } = result;
  console.log(pc.dim(`\n  Linting ${dir}`));
  if (!issues.length) {
    console.log(`\n  ${pc.green('✓')} No quality issues in ${summary.pages} page${summary.pages === 1 ? '' : 's'}.\n`);
    return;
  }
  let current = null;
  for (const i of issues) {
    if (i.file !== current) { current = i.file; console.log(`\n  ${pc.bold(i.file || '(project)')}`); }
    const color = i.level === 'error' ? pc.red : i.level === 'warning' ? pc.yellow : pc.blue;
    const loc = i.line ? `L${i.line}`.padEnd(6) : ''.padEnd(6);
    console.log(`    ${pc.dim(loc)}${color(i.level.padEnd(8))}${i.message} ${pc.dim(i.code)}`);
    if (i.fix) console.log(`    ${' '.repeat(6)}${pc.dim(`→ ${i.fix}`)}`);
  }
  console.log(`\n  ${summary.errors} error${summary.errors === 1 ? '' : 's'}, ${summary.warnings} warning${summary.warnings === 1 ? '' : 's'}, ${summary.infos} info in ${summary.pages} page${summary.pages === 1 ? '' : 's'}\n`);
}

function renderGithub(issues) {
  for (const i of issues) {
    const level = i.level === 'error' ? 'error' : i.level === 'warning' ? 'warning' : 'notice';
    const loc = [i.file ? `file=${i.file}` : '', i.line ? `line=${i.line}` : '', `title=${i.code}`].filter(Boolean).join(',');
    console.log(`::${level} ${loc}::${i.message}`);
  }
}

export async function lint(args = []) {
  const parsed = parseArgs(args, { flags: ['--strict'], options: ['--format'] });
  assertCleanArgs(parsed, 'lint');
  const strict = parsed.flags.has('--strict');
  const format = resolveFormat(parsed, 'lint');
  const dir = path.resolve(parsed.positional[0] || '.');
  const result = await runLint(dir, { strict });
  if (format === 'json') {
    const { elapsedMs, ...out } = result;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else if (format === 'github') renderGithub(result.issues);
  else renderPretty(result, dir);
  process.exit(result.ok ? 0 : 1);
}
