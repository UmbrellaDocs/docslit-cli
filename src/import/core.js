// Importer core: shared state + per-page conversion for every source vendor.
import fs from 'fs-extra';
import path from 'path';
import { load as yamlLoad } from 'js-yaml';
import matter from '../frontmatter.js';
import { convertBody } from './mdx.js';
import { rewriteMdxTags } from '../mdx-bridge.js';
import { convertFrontmatter } from './frontmatter.js';
import { componentFromEstree } from './custom.js';
import { Reporter } from './report.js';
import { gitbookPreprocess } from './gitbook.js';
import { attrString, isExpr, isJsx } from './jsx.js';

const posix = (p) => p.split(path.sep).join('/');
const stripExt = (p) => p.replace(/\.(mdx?|markdown)$/i, '');
const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|pdf|mp4|webm|mov|mp3|wav|woff2?|ttf|otf|zip|json|ya?ml|txt|csv)$/i;

export class Importer {
  constructor({ sourceDir, outDir, vendor, assetRoot = null, opts = {}, fetchText = null }) {
    this.sourceDir = sourceDir;
    this.outDir = outDir;
    this.vendor = vendor;
    this.assetRoot = assetRoot || sourceDir;
    this.opts = opts;
    this.fetchText = fetchText;
    this.reporter = new Reporter();
    this.pages = new Map();        // srcRel -> { slug, fm: {} , hidden }
    this.slugs = new Set();        // out page slugs
    this.slugBySrc = new Map();    // srcRel(no ext) -> slug
    this.urlToSlug = new Map();    // vendor URL path -> slug (Fern)
    this.assets = new Map();       // abs src -> outRel (under docs/)
    this.rootAssets = new Map();   // abs src -> outRel (project root; config assets)
    this.outFiles = new Map();     // outRel -> string | Buffer
    this.reusables = new Map();    // srcRel -> outName (relative to _reusables, with .md)
    this.attributes = {};          // global {{VARS}}
    this.redirects = {};
    this.stats = { pages: 0, pagesFailed: 0, snippets: 0 };
    this.moduleCache = new Map();
    this.openapiSpecs = [];
    this.lenient = false; // single-snippet mode: never touch the disk for links/assets
  }

  report(sev, code, msg, extra) { this.reporter.add(sev, code, msg, extra); }

  // ── registration ───────────────────────────────────────────────────────────
  registerPage(srcRel, slugIn, extra = {}) {
    const slug = slugIn;
    this.pages.set(srcRel, { slug, ...extra });
    this.slugs.add(slug);
    this.slugBySrc.set(stripExt(srcRel), slug);
    return slug;
  }

  // ── links ──────────────────────────────────────────────────────────────────
  linkFn(fromRel) {
    return (url, { line = null, quiet = false } = {}) => this.rewriteLink(url, fromRel, line, quiet);
  }

  rewriteLink(url, fromRel, line, quiet = false) {
    if (this.lenient) return url;
    const s = String(url || '').trim();
    if (!s || /^(#|mailto:|tel:|javascript:|[a-z][a-z0-9+.-]*:|\/\/)/i.test(s)) return url;
    const m = /^([^?#]*)([?#].*)?$/.exec(s);
    let p = m[1];
    const rest = m[2] || '';
    if (!p) return url;
    try { p = decodeURI(p); } catch { /* keep */ }
    let slug = null;
    if (this.vendor === 'fern') slug = this.fernResolve(p, fromRel);
    if (slug == null) slug = this.resolveSlug(p, fromRel);
    if (slug != null) return (slug === '' ? '/index' : '/' + slug) + rest;
    // maybe a file (asset)
    const asset = this.tryAsset(p, fromRel);
    if (asset) return asset + rest;
    if (!quiet) this.report('warning', 'broken-link', `Link "${url}" does not match any converted page.`, {
      file: fromRel, line, action: 'Left the link as written.', fix: 'Point the link at an existing page (/path/without/extension) or create the page.' });
    return url;
  }

  resolveSlug(p, fromRel) {
    let q = p.replace(/\.(mdx?|md)$/i, '').replace(/\/+$/, '');
    const tryList = [];
    if (p.startsWith('/')) tryList.push(q.replace(/^\/+/, ''));
    else {
      const dir = path.posix.dirname(posix(fromRel));
      const joined = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, q));
      tryList.push(joined, q);
    }
    for (const c of tryList) {
      const key = c.replace(/^\/+/, '');
      if (this.slugs.has(key + '/overview') && !this.slugs.has(key) && this.redirects['/' + key]) return key + '/overview';
      if (this.slugBySrc.has(key)) return this.slugBySrc.get(key);
      if (this.slugs.has(key)) return key;
      if (this.slugs.has(key + '/index')) return key + '/index';
      if (this.slugBySrc.has(key + '/index')) return this.slugBySrc.get(key + '/index');
      if (key === '' || key === '.') { if (this.slugs.has('index')) return 'index'; }
    }
    return null;
  }

  fernResolve(p) {
    let q = p.replace(/\/+$/, '').replace(/^\//, '');
    for (const base of this.fernBasePaths || []) {
      if (q === base) return this.slugs.has('index') ? 'index' : null;
      if (q.startsWith(base + '/')) { q = q.slice(base.length + 1); break; }
    }
    if (this.urlToSlug.has(q)) return this.urlToSlug.get(q);
    return null;
  }

  // ── assets ─────────────────────────────────────────────────────────────────
  assetFn(fromRel) {
    return (url, { line = null } = {}) => this.rewriteAsset(url, fromRel, line);
  }

  locateAsset(p, fromRel) {
    const cands = [];
    const fromAbs = path.join(this.sourceDir, fromRel);
    if (p.startsWith('/')) cands.push(path.join(this.assetRoot, p), path.join(this.sourceDir, p), path.join(this.sourceDir, 'docs', p));
    else cands.push(path.resolve(path.dirname(fromAbs), p), path.join(this.assetRoot, p), path.join(this.sourceDir, p), path.join(this.assetRoot, p.replace(/^(\.{1,2}\/)+/, '')));
    for (const c of cands) { try { if (fs.statSync(c).isFile()) return c; } catch { /* next */ } }
    return null;
  }

  outRelForAsset(abs) {
    let rel = posix(path.relative(this.assetRoot, abs));
    if (rel.startsWith('..')) { rel = posix(path.relative(this.sourceDir, abs)); if (rel.startsWith('..')) rel = '_assets/' + path.basename(abs); }
    return rel.replace(/^\.gitbook\//, '');
  }

  tryAsset(p, fromRel) {
    const abs = this.locateAsset(p, fromRel);
    if (!abs || !IMG_EXT.test(abs)) return null;
    const rel = this.outRelForAsset(abs);
    this.assets.set(abs, rel);
    return '/' + rel;
  }

  rewriteAsset(url, fromRel, line) {
    if (this.lenient) return url;
    const s = String(url || '').trim();
    if (!s || /^(#|data:|[a-z][a-z0-9+.-]*:|\/\/)/i.test(s)) return url;
    const m = /^([^?#]*)([?#].*)?$/.exec(s);
    let p = m[1];
    try { p = decodeURI(p); } catch { /* keep */ }
    const hit = this.tryAsset(p, fromRel);
    if (hit) return hit + (m[2] || '');
    this.report('error', 'missing-asset', `Asset "${url}" was not found in the source project.`, {
      file: fromRel, line, action: 'Left the reference as written.', fix: 'Add the file to the output docs/ folder (or fix the path); the source project did not contain it.' });
    return url;
  }

  /** Asset referenced from config (logo/favicon/…): copied to the project root at its source-relative path. */
  configAsset(ref, fromLabel = 'config') {
    const s = String(ref || '').trim();
    if (!s) return ref;
    if (/^(https?:)?\/\//i.test(s) || s.startsWith('data:')) return s;
    const p = s.replace(/^\/+/, '');
    const cands = [path.join(this.assetRoot, p), path.join(this.sourceDir, p), path.join(this.sourceDir, 'docs', p)];
    for (const c of cands) {
      try {
        if (fs.statSync(c).isFile()) {
          const rel = posix(path.relative(this.assetRoot, c)).startsWith('..') ? posix(path.relative(this.sourceDir, c)) : posix(path.relative(this.assetRoot, c));
          this.rootAssets.set(c, rel);
          return rel;
        }
      } catch { /* next */ }
    }
    this.report('error', 'missing-asset', `Config asset "${ref}" (${fromLabel}) was not found in the source project.`, { file: fromLabel, action: 'Kept the path as written.', fix: 'Add the file to the project or fix the path in docslit.json.' });
    return s;
  }

  // ── snippets & components ──────────────────────────────────────────────────
  snippetOut(srcRelPosix) {
    let rel = srcRelPosix.replace(/^\/+/, '');
    if (this.reusables.has(rel)) return this.reusables.get(rel);
    let name = rel.replace(/^(snippets|_snippets)\//, '').replace(/\.(mdx|md)$/i, '') + '.md';
    this.reusables.set(rel, name);
    return name;
  }

  resolveImportPath(spec, fromRel) {
    if (spec.startsWith('/')) return spec.replace(/^\/+/, '');
    return path.posix.normalize(path.posix.join(path.posix.dirname(posix(fromRel)), spec));
  }

  // ── page conversion ────────────────────────────────────────────────────────
  async readSource(abs) { return fs.readFile(abs, 'utf8'); }

  async convertFile(srcRel, { slug = null, isSnippet = false, outName = null } = {}) {
    const abs = path.join(this.sourceDir, srcRel);
    const raw = await this.readSource(abs);
    return this.convertSource(raw, { srcRel, slug, isSnippet, outName });
  }

  async convertSource(raw, { srcRel, slug = null, isSnippet = false, extraFm = {} }) {
    const rep = (sev, code, msg, extra = {}) => this.report(sev, code, msg, { file: srcRel, ...extra });
    let fm = {};
    let body = raw;
    let fmBroken = false;
    try { const p = matter(raw); fm = p.data; body = p.content; } catch (e) {
      const mm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      fmBroken = true;
      if (mm) {
        body = mm[2];
        try { fm = yamlLoad(mm[1]) || {}; fmBroken = false; } catch {
          for (const line of mm[1].split('\n')) {
            const ci = line.indexOf(':');
            if (ci < 1) continue;
            const k = line.slice(0, ci).trim();
            const v = line.slice(ci + 1).trim().replace(/^['"]|['"]$/g, '');
            if (/^[a-zA-Z_][\w_-]*$/.test(k)) fm[k] = v;
          }
        }
      }
      rep('warning', 'frontmatter-lenient', `Frontmatter was not valid YAML (${String(e.message).split('\n')[0]}); keys were recovered line by line.`, { action: 'Recovered simple key: value pairs.', fix: 'Check the title/description of this page.' });
    }
    void fmBroken;
    const lineOffset = raw.replace(/^﻿/, '').split('\n').length - body.split('\n').length;

    const variables = new Map();
    const localComponents = new Map();
    const snippetImports = new Map();
    const pageAttributes = {};
    const consumed = new Set();
    const self = this;

    const ctx = {
      vendor: this.vendor, file: srcRel, lineOffset, isSnippet, consumed,
      report: rep,
      count: (a, b) => this.reporter.count(a, b),
      link: this.linkFn(srcRel),
      asset: this.assetFn(srcRel),
      fetchText: this.fetchText,
      onImport(st, line) {
        const spec = String(st.source.value);
        const isMdx = /\.mdx?$/i.test(spec);
        const isCode = /\.(jsx?|tsx?)$/i.test(spec);
        const resolved = self.resolveImportPath(spec, srcRel);
        if (isMdx) {
          const out = self.snippetOut(resolved);
          for (const sp of st.specifiers) snippetImports.set(sp.local.name, { out, srcRel: resolved });
        } else if (isCode) {
          for (const sp of st.specifiers) localComponents.set(sp.local.name, { module: resolved, imported: sp.imported?.name || 'default', line });
        } else if (!/^(react|@?[\w-]+\/?[\w-]*)$/.test(spec) || /^\.{0,2}\//.test(spec)) {
          rep('info', 'import-dropped', `Import "${spec}" was removed (not a snippet or component the importer can follow).`, { line });
        }
      },
      onExport(st, line, src) {
        const decl = st.declaration;
        if (!decl) { rep('warning', 'export-dropped', 'An `export default`/re-export was removed.', { line }); return; }
        if (decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations) {
            if (d.id.type !== 'Identifier') continue;
            const name = d.id.name;
            const init = d.init;
            if (init && init.type === 'Literal' && ['string', 'number', 'boolean'].includes(typeof init.value)) {
              variables.set(name, String(init.value));
              pageAttributes[toVarName(name)] = init.value;
            } else if (init && init.type === 'TemplateLiteral' && init.expressions.length === 0) {
              const v = init.quasis.map((q) => q.value.cooked).join('');
              variables.set(name, v); pageAttributes[toVarName(name)] = v;
            } else if (init) {
              const comp = componentFromEstree(init, src);
              if (comp) localComponents.set(name, { inline: comp, line });
              else { localComponents.set(name, { unconvertible: true, line });
                rep('error', 'custom-component', `Custom React component "${name}" cannot be executed on a static site.`, { line, component: name, action: 'Usages are replaced by a "Unconverted component" callout.', fix: `Rewrite ${name} as Markdown, a reusable snippet (docs/_reusables), or a DocsLit custom Lit component.` }); }
            }
          }
        } else if (decl.type === 'FunctionDeclaration' && decl.id) {
          const comp = componentFromEstree(decl, src);
          if (comp) localComponents.set(decl.id.name, { inline: comp, line });
          else { localComponents.set(decl.id.name, { unconvertible: true, line });
            rep('error', 'custom-component', `Custom React component "${decl.id.name}" cannot be executed on a static site.`, { line, component: decl.id.name, action: 'Usages are replaced by a "Unconverted component" callout.', fix: `Rewrite ${decl.id.name} as Markdown or a reusable snippet.` }); }
        }
      },
      expression(expr, rawValue, src, line) {
        const t = expr?.type;
        if (t === 'Literal' && typeof expr.value === 'string') return escapeText(expr.value);
        if (t === 'Literal') return String(expr.value);
        if (t === 'TemplateLiteral' && expr.expressions.length === 0) return escapeText(expr.quasis.map((q) => q.value.cooked).join(''));
        if (t === 'Identifier') {
          if (variables.has(expr.name)) return `{{${toVarName(expr.name)}}}`;
          if (isSnippet) return `{{${expr.name}}}`;
        }
        if (t === 'MemberExpression' && isSnippet && !expr.computed && expr.object.type === 'Identifier' && expr.object.name === 'props') return `{{${expr.property.name}}}`;
        if (t === 'ObjectExpression' && expr.properties.length === 1 && expr.properties[0].shorthand) {
          const n = expr.properties[0].key.name;
          self.attributes[toVarName(n)] ??= '';
          rep('info', 'global-variable', `Mintlify global variable {{${n}}} was mapped to {{${toVarName(n)}}}.`, { line, fix: `Define "${toVarName(n)}" under "attributes" in docslit.json.` });
          return `{{${toVarName(n)}}}`;
        }
        return null;
      },
      userComponent(el) {
        const name = el.name;
        if (snippetImports.has(name)) return snippetResult(el, snippetImports.get(name).out);
        const lc = localComponents.get(name);
        if (lc) {
          if (lc.module) return self.moduleComponent(lc, el, ctx);
          if (lc.inline) return self.inlineComponent(name, lc.inline, el, ctx);
          return unconvertedPlaceholder(el, name);
        }
        return null;
      },
      includeSnippet(srcAttr, el) {
        const resolved = self.resolveImportPath(srcAttr, srcRel);
        const out = self.snippetOut(resolved);
        return snippetResult(el, out);
      },
      async codeFromSource(srcAttr, o) { return self.codeFromSource(srcAttr, srcRel, o); },
    };
    // codeFromSource must be sync for the engine: pre-resolve below
    ctx.codeFromSource = (srcAttr, o) => this.codeFromSourceSync(srcAttr, srcRel, o);

    if (this.vendor === 'gitbook') body = gitbookPreprocess(body, rep);
    let converted;
    const res = convertBody(body, ctx);
    if (res.ok) converted = res.body;
    else {
      converted = rewriteMdxTags(body.replace(/^(import|export)\s.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, ''));
      rep('warning', 'legacy-conversion', 'This page was converted with the legacy tag rewriter because it is not valid MDX.', { fix: 'Review the converted page carefully.' });
    }

    const { fm: newFm, title: fmTitle } = convertFrontmatter(fm, this.vendor, { report: rep, isSnippet });
    Object.assign(newFm, extraFm.override || {});
    if (Object.keys(pageAttributes).length && !isSnippet) newFm.attributes = { ...(newFm.attributes || {}), ...pageAttributes };
    if (isSnippet && Object.keys(pageAttributes).length) {
      rep('info', 'snippet-exports', 'Exported constants in a snippet were inlined as {{VARS}}; define them in docslit.json attributes.', { fix: 'Add them under "attributes".' });
      Object.assign(this.attributes, pageAttributes);
    }
    if (!isSnippet && !newFm.title) {
      const h1 = /^#\s+(.+?)\s*#*\s*$/m.exec(converted);
      if (h1) { newFm.title = h1[1].replace(/[`*_]/g, ''); converted = converted.replace(h1[0], '').replace(/^\n+/, ''); }
      else if (fmTitle) newFm.title = fmTitle;
      else newFm.title = titleFromPath(srcRel);
    }
    return { frontmatter: newFm, body: converted, rawFm: fm };
  }

  codeFromSourceSync(srcAttr, fromRel, { title, lines, maxLines, highlight, focus, line }) {
    const warnings = [];
    let local = null;
    let content = null;
    if (/^https?:\/\//i.test(srcAttr)) {
      content = this.prefetched?.get(srcAttr);
      if (content == null) {
        warnings.push({ severity: 'error', code: 'code-src-url', message: `<Code src="${srcAttr}"> could not be downloaded at import time.`, action: 'Left a placeholder code block.', fix: 'Download the file into snippets/ and reference it with file="snippets/name".' });
        return { text: `\`\`\`text\n// ${srcAttr} (download failed during import)\n\`\`\``, warnings };
      }
      const name = srcAttr.split('?')[0].split('/').pop() || 'snippet.txt';
      local = `snippets/${name}`;
      this.outFiles.set(local, content);
      warnings.push({ severity: 'info', code: 'code-src-downloaded', message: `<Code src="${srcAttr}"> was downloaded to ${local}.`, action: `Referenced with file="${local}".`, fix: 'Keep a copy in sync with the origin if it changes.' });
    } else {
      const abs = [path.resolve(path.dirname(path.join(this.sourceDir, fromRel)), srcAttr), path.join(this.assetRoot, srcAttr), path.join(this.sourceDir, srcAttr), path.join(this.assetRoot, srcAttr.replace(/^(\.{1,2}\/)+/, ''))].find((c) => fs.pathExistsSync(c));
      if (!abs) {
        warnings.push({ severity: 'error', code: 'code-src-missing', message: `<Code src="${srcAttr}"> file was not found.`, action: 'Left a placeholder code block.' });
        return { text: `\`\`\`text\n// ${srcAttr} (file not found during import)\n\`\`\``, warnings };
      }
      local = 'snippets/' + posix(path.relative(path.dirname(abs), abs)).replace(/^.*\//, '');
      const base = path.basename(abs);
      local = `snippets/${base}`;
      this.outFiles.set(local, fs.readFileSync(abs));
    }
    const lang = (local.split('.').pop() || 'text').toLowerCase();
    const meta = [`file="${local}"`];
    if (title) meta.push(`title="${title}"`);
    if (lines) meta.push(`lines="${lines}"`);
    if (maxLines) meta.push(`maxLines=${maxLines}`);
    if (highlight) meta.push(`highlight=${String(highlight).replace(/\s+/g, '')}`);
    if (focus) meta.push(`focus=${String(focus).replace(/\s+/g, '')}`);
    if (this.vendor === 'fern') meta.push('lines');
    void line;
    return { text: '```' + lang + ' ' + meta.join(' ') + '\n```', warnings };
  }

  moduleComponent(lc, el, ctx) {
    return unconvertedPlaceholder(el, el.name, `imported from ${lc.module}`, this, ctx);
  }

  inlineComponent(name, comp, el, ctx) {
    const out = `_components/${name}.md`;
    if (!this.outFiles.has(`docs/_reusables/${out}`)) {
      this.outFiles.set(`docs/_reusables/${out}`, comp.html + '\n');
      this.stats.snippets++;
    }
    const attrs = {};
    const warnings = [];
    for (const n of el.props.__order) {
      const v = el.props[n];
      if (n === 'className') continue;
      const s = isExpr(v) || isJsx(v) ? undefined : attrString(v);
      if (s === undefined || s === true) { warnings.push({ severity: 'warning', code: 'component-prop-dynamic', message: `Prop "${n}" of <${name}> is not a static string and was dropped.` }); continue; }
      attrs[n] = s;
    }
    if (el.children.length) warnings.push({ severity: 'warning', code: 'component-children-dropped', message: `<${name}> children cannot be passed to a reusable snippet; they were dropped.`, action: 'Dropped the children.' });
    const attrText = Object.entries(attrs).map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`).join('');
    ctx.count(name + ' (custom component)', 'wc-include');
    return { replace: `<wc-include src="${out}"${attrText} />`, warnings, count: false };
  }
}

function snippetResult(el, out) {
  const attrs = {};
  const warnings = [];
  for (const n of el.props.__order) {
    const v = el.props[n];
    if ((n === 'src' && el.name === 'Markdown') || (n === 'file' && el.name === 'Snippet')) continue;
    if (n === 'className') continue;
    const s = isExpr(v) || isJsx(v) ? undefined : attrString(v);
    if (s === undefined || s === true) { warnings.push({ severity: 'warning', code: 'snippet-prop-dynamic', message: `Prop "${n}" passed to snippet <${el.name}> is not a static value and was dropped.`, action: `Dropped ${n}.` }); continue; }
    attrs[n] = s;
  }
  const attrText = Object.entries(attrs).map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`).join('');
  return { replace: `<wc-include src="${out}"${attrText} />`, warnings };
}

function unconvertedPlaceholder(el, name, note = '') {
  return {
    replace: `<wc-callout type="warning" title="Unconverted component: ${name}">\n\nThis page used the custom component <code>${name}</code>${note ? ` (${note})` : ''}, which cannot run on a static site. Replace this placeholder.\n\n</wc-callout>`,
    warnings: [{ severity: 'error', code: 'custom-component', message: `Custom component <${name}> ${note ? `(${note}) ` : ''}cannot be converted.`, action: 'Replaced with a warning callout.', fix: `Rewrite ${name} as Markdown, a reusable snippet, or a DocsLit custom component.` }],
  };
}

export const toVarName = (n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\{/g, '&#123;');
export const titleFromPath = (p) => path.basename(p).replace(/\.(mdx?|md)$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export { stripExt, posix, IMG_EXT };
