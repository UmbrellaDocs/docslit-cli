// GitBook: SUMMARY.md / .gitbook.yaml -> docslit.json, and `{% … %}` block tags -> MDX the engine understands.
import fs from 'fs-extra';
import path from 'path';
import { load as yamlLoad } from 'js-yaml';
import { buildThemeConfig } from './theme.js';

const posix = (p) => p.split(path.sep).join('/');

export async function findGitbookRoot(sourceDir) {
  let root = sourceDir;
  let summary = 'SUMMARY.md';
  let readme = 'README.md';
  for (const f of ['.gitbook.yaml', '.gitbook.yml']) {
    const p = path.join(sourceDir, f);
    if (await fs.pathExists(p)) {
      try {
        const y = yamlLoad(await fs.readFile(p, 'utf8')) || {};
        if (y.root) root = path.resolve(sourceDir, String(y.root));
        if (y.structure?.summary) summary = String(y.structure.summary);
        if (y.structure?.readme) readme = String(y.structure.readme);
      } catch { /* malformed: defaults */ }
    }
  }
  if (!(await fs.pathExists(path.join(root, summary))) && await fs.pathExists(path.join(sourceDir, 'docs', summary))) root = path.join(sourceDir, 'docs');
  return { root, summary, readme };
}

const slugOfFile = (rel) => {
  const s = rel.replace(/\.(mdx?|md)$/i, '');
  if (/(^|\/)README$/i.test(s)) return s.replace(/README$/i, 'index').replace(/^\/+/, '');
  return s;
};

export async function convertGitbook(imp, gb, opts = {}) {
  const rep = (sev, code, msg, extra = {}) => imp.report(sev, code, msg, { file: gb.summary, ...extra });
  const out = { name: path.basename(imp.sourceDir) };
  const summaryPath = path.join(gb.root, gb.summary);
  const readmePath = path.join(gb.root, gb.readme);
  imp.reporter.mapKey('.gitbook.yaml root/structure', 'docs root');
  const reg = (rel, title) => {
    const norm = posix(path.normalize(rel.replace(/^\.\//, '')));
    if (!fs.pathExistsSync(path.join(gb.root, norm))) { rep('warning', 'nav-page-missing', `SUMMARY.md entry "${rel}" has no file.`, { action: 'Removed from the sidebar.', fix: 'Create the page or remove the entry.' }); return null; }
    let slug = slugOfFile(norm);
    if (slug === '') slug = 'index';
    if (!imp.pages.has(norm)) imp.registerPage(norm, slug, title ? { override: {} } : {});
    return imp.pages.get(norm).slug;
  };
  if (await fs.pathExists(readmePath)) {
    const rel = posix(path.relative(gb.root, readmePath));
    const m = /^#\s+(.+)$/m.exec(await fs.readFile(readmePath, 'utf8'));
    if (m) out.name = m[1].trim();
    reg(rel);
  }
  if (!(await fs.pathExists(summaryPath))) { out.sidebar = 'auto'; return finish(out, imp, opts); }
  const lines = (await fs.readFile(summaryPath, 'utf8')).split(/\r?\n/);
  const groups = [];
  let cur = null;
  const stack = []; // [{indent, node}]
  const ensureGroup = (name) => { cur = { group: name, pages: [] }; groups.push(cur); stack.length = 0; };
  for (const raw of lines) {
    const h = /^#{1,3}\s+(.+)$/.exec(raw);
    if (h) { if (/^table of contents$/i.test(h[1].trim())) continue; ensureGroup(h[1].trim()); continue; }
    const m = /^(\s*)[*+-]\s+\[([^\]]*)\]\(([^)]*)\)/.exec(raw);
    if (!m) continue;
    if (!cur) ensureGroup('Documentation');
    const indent = m[1].replace(/\t/g, '    ').length;
    const title = m[2];
    const href = m[3].trim();
    let item;
    if (/^https?:/.test(href)) item = { href, title };
    else if (!href) item = { group: title, pages: [] };
    else {
      const slug = reg(decodeURIComponent(href.split('#')[0]), title);
      if (!slug) continue;
      item = { id: slug, title };
    }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].node : null;
    if (!parent) cur.pages.push(item);
    else {
      if (!parent.group) { // convert page into a group with root
        const g = { group: parent.title, root: parent.id, pages: [] };
        Object.keys(parent).forEach((k) => delete parent[k]); Object.assign(parent, g);
      }
      parent.pages.push(item);
    }
    stack.push({ indent, node: item });
  }
  // page titles come from the SUMMARY: keep as sidebar titles only when they differ from the page
  const tidy = (items) => items.map((it) => {
    if (it.pages) return { ...it, pages: tidy(it.pages) };
    return it;
  });
  out.sidebar = tidy(groups).filter((g) => g.pages.length);
  imp.reporter.mapKey('SUMMARY.md', 'sidebar');
  return finish(out, imp, opts);
}

function finish(out, imp, opts) {
  const t = buildThemeConfig({ vendor: 'gitbook', brand: {}, fonts: {}, themeOpt: opts.themeOpt, report: (s, c, m, x) => imp.report(s, c, m, x) });
  if (t !== undefined) out.theme = t;
  return out;
}

// ─── block tag conversion ─────────────────────────────────────────────────────
const HINT = { info: 'Info', warning: 'Warning', danger: 'Danger', success: 'Success' };
const EMBEDDABLE = /youtube\.com|youtu\.be|vimeo\.com|loom\.com|figma\.com|codepen\.io|miro\.com|codesandbox\.io|wistia/i;

function attr(s, name) { const m = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(s); return m ? (m[1] ?? m[2]) : undefined; }

export function gitbookPreprocess(body, rep = () => {}) {
  const lines = body.split('\n');
  const out = [];
  let fence = null;
  let codeMeta = null;
  let skipOpenapi = false;
  const stepStack = [];
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    const f = /^\s*(`{3,}|~{3,})/.exec(l);
    if (f) {
      if (!fence) { fence = f[1]; if (codeMeta) { const meta = []; if (codeMeta.title) meta.push(`title="${codeMeta.title}"`); if (codeMeta.lines) meta.push('lines'); if (codeMeta.wrap) meta.push('wrap'); l = l.replace(/\s*$/, '') + (meta.length ? ' ' + meta.join(' ') : ''); codeMeta = null; } }
      else if (l.trim().startsWith(fence)) fence = null;
      out.push(l); continue;
    }
    if (fence) { out.push(l); continue; }
    const t = l.trim();
    let m;
    if ((m = /^\{%\s*hint\s+([^%]*?)%\}$/.exec(t))) { const style = attr(m[1], 'style') || 'info'; out.push(`<${HINT[style] || 'Info'}>`, ''); continue; }
    if (/^\{%\s*endhint\s*%\}$/.test(t)) { out.push('', `</${out.__lastHint || 'Info'}>`); /* replaced below */ continue; }
    if (/^\{%\s*tabs\s*%\}$/.test(t)) { out.push('<Tabs>'); continue; }
    if (/^\{%\s*endtabs\s*%\}$/.test(t)) { out.push('</Tabs>'); continue; }
    if ((m = /^\{%\s*tab\s+([^%]*?)%\}$/.exec(t))) { out.push(`<Tab title="${(attr(m[1], 'title') || 'Tab').replace(/"/g, '&quot;')}">`, ''); continue; }
    if (/^\{%\s*endtab\s*%\}$/.test(t)) { out.push('', '</Tab>'); continue; }
    if ((m = /^\{%\s*code\s*([^%]*?)%\}$/.exec(t))) { codeMeta = { title: attr(m[1], 'title'), lines: attr(m[1], 'lineNumbers') === 'true', wrap: attr(m[1], 'overflow') === 'wrap' }; continue; }
    if (/^\{%\s*end(code|embed)\s*%\}$/.test(t)) continue;
    if ((m = /^\{%\s*embed\s+([^%]*?)%\}$/.exec(t))) { const url = attr(m[1], 'url'); out.push(url && EMBEDDABLE.test(url) ? `<iframe src="${url}"></iframe>` : `[${url}](${url})`); continue; }
    if ((m = /^\{%\s*content-ref\s+([^%]*?)%\}$/.exec(t))) { out.push(''); continue; }
    if (/^\{%\s*endcontent-ref\s*%\}$/.test(t)) continue;
    if (/^\{%\s*stepper\s*%\}$/.test(t)) { out.push('<Steps>'); continue; }
    if (/^\{%\s*endstepper\s*%\}$/.test(t)) { out.push('</Steps>'); continue; }
    if (/^\{%\s*step\s*%\}$/.test(t)) { // title = next non-empty heading line
      let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
      const h = /^#{1,6}\s+(.+)$/.exec(lines[j] || '');
      out.push(`<Step title="${(h ? h[1] : 'Step').replace(/"/g, '&quot;')}">`, '');
      if (h) i = j; stepStack.push(1); continue;
    }
    if (/^\{%\s*endstep\s*%\}$/.test(t)) { out.push('', '</Step>'); continue; }
    if ((m = /^\{%\s*file\s+([^%]*?)%\}$/.exec(t))) { const src = attr(m[1], 'src') || ''; let cap = ''; let j = i + 1; while (j < lines.length && !/^\{%\s*endfile\s*%\}$/.test(lines[j].trim())) { cap += lines[j].trim() + ' '; j++; } out.push(`<Download src="${src}">${cap.trim() || src.split('/').pop()}</Download>`); i = j; continue; }
    if ((m = /^\{%\s*(openapi|swagger)\b([^%]*)%\}$/.exec(t))) {
      rep('warning', 'gitbook-openapi', `GitBook {% ${m[1]} %} block (${(attr(m[2], 'path') || attr(m[2], 'src') || '').slice(0, 60)}) has no direct equivalent.`, { action: 'Replaced with a pointer callout.', fix: 'Add the OpenAPI spec to docslit.json "openapi" and link to the generated API pages (docslit openapi scaffold).' });
      out.push('<Info>', '', 'API reference: see the generated API pages.', '', '</Info>'); skipOpenapi = true; continue;
    }
    if (skipOpenapi) { if (/^\{%\s*end(openapi|swagger[\w-]*)\s*%\}$/.test(t)) skipOpenapi = false; if (/^\{%\s*end/.test(t) || !t.startsWith('{%')) { if (/^\{%\s*end(openapi|swagger)/.test(t)) skipOpenapi = false; } continue; }
    if (/^\{%\s*(endswagger|endopenapi|swagger-\w+|endswagger-\w+)[^%]*%\}$/.test(t)) continue;
    if (/^\{%.*%\}$/.test(t)) { rep('warning', 'gitbook-tag-unsupported', `GitBook block tag ${t.slice(0, 60)} is not supported and was removed.`, { action: 'Removed the tag (content kept).' }); continue; }
    out.push(l);
  }
  // hint closers: pair them with their openers (stack-based)
  const res = [];
  const stack = [];
  for (const l of out) {
    const o = /^<(Info|Warning|Danger|Success)>$/.exec(l);
    if (o) stack.push(o[1]);
    if (l === '</Info>' && stack.length && !/^<Info>$/.test(l)) { res.push(`</${stack.pop()}>`); continue; }
    res.push(l);
  }
  let text = res.join('\n');
  text = text.replace(/<figure>\s*(<img[^>]*>)\s*(?:<figcaption>([\s\S]*?)<\/figcaption>)?\s*<\/figure>/g, (m, img, cap) => `<Frame${cap ? ` caption="${cap.replace(/<[^>]+>/g, '').trim().replace(/"/g, '&quot;')}"` : ''}>${img.replace(/>$/, img.endsWith('/>') ? '>' : ' />')}</Frame>`);
  text = text.replace(/<figure>|<\/figure>/g, '');
  return text;
}
