// Component conversion table: Mintlify + Fern JSX components and HTML elements
// -> DocsLit `wc-*` tags. Spec: parity/mapping.md and parity/code-mapping.md.
//
// A handler receives the element descriptor `el` (see mdx.js makeEl) and the
// conversion context and returns a result:
//   { tag, attrs, block?, inline?, selfClose?, warnings?, before?, after?, run? }  -> tag rewrite, children kept
//   { unwrap: true }                                                              -> drop the tags, keep children
//   { replace: 'markdown' }                                                       -> replace the whole element
//   { drop: true }                                                                -> remove element and children
import { attrString, isJsx, isExpr, jsxSvgToHtml, styleToCss, kebab } from './jsx.js';

const DROP_ALWAYS = new Set(['className', 'class', 'key', 'ref']);

// ─── helpers ──────────────────────────────────────────────────────────────────
function warn(list, message, extra = {}) { list.push({ severity: 'warning', message, ...extra }); }

/** Normalise an icon reference to something DocsLit resolves (FA classes / Lucide / path). */
export function normalizeIcon(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  const m = /^(solid|regular|brands|light|thin|duotone|sharp-solid|sharp-regular|sharp-light|sharp-thin)\s+([\w-]+)$/.exec(s);
  if (m) return `fa-${m[1] === 'brands' ? 'brands' : m[1] === 'regular' ? 'regular' : 'solid'} fa-${m[2]}`;
  return s;
}

const ICON_TYPES = new Set(['solid', 'regular', 'brands']);

/** icon / iconType props -> { icon, 'icon-type' } */
function iconAttrs(el, w, { iconKey = 'icon', typeKey = 'iconType', outIcon = 'icon', outType = 'icon-type' } = {}) {
  const out = {};
  let icon = el.prop(iconKey);
  if (icon === undefined) return out;
  if (isJsx(icon)) {
    const img = /^<img\b[^>]*\bsrc=["']([^"']+)["']/.exec(icon.__jsx.trim());
    if (img) { out[outIcon] = img[1]; return out; }
    const svg = jsxSvgToHtml(icon.__jsx);
    if (svg) out[outIcon] = svg;
    else warn(w, `Inline JSX icon on <${el.name}> could not be converted to an <svg> string and was dropped.`, { code: 'icon-jsx-dropped', action: 'Dropped the icon.', fix: 'Set icon="…" to a Lucide/Font Awesome name or an image path.' });
    return out;
  }
  if (isExpr(icon)) { warn(w, `Dynamic icon expression on <${el.name}> dropped.`, { code: 'icon-jsx-dropped' }); return out; }
  if (typeof icon !== 'string') return out;
  out[outIcon] = normalizeIcon(icon);
  const t = el.prop(typeKey);
  if (typeof t === 'string' && ICON_TYPES.has(t)) out[outType] = t;
  return out;
}

const idAttr = (el) => (typeof el.prop('id') === 'string' ? { id: el.prop('id') } : {});

/** Generic prop mapper. map: { src: 'dest' | { to, fn(v) , bool } | null(drop) } */
function mapProps(el, ctx, map, { allowed = [] } = {}) {
  const attrs = {};
  const warnings = [];
  let classNameSeen = false;
  for (const name of el.props.__order) {
    const v = el.props[name];
    if (DROP_ALWAYS.has(name)) { classNameSeen = classNameSeen || name === 'className'; continue; }
    if (allowed.includes(name)) continue;
    if (!(name in map)) {
      warn(warnings, `Property "${name}" on <${el.name}> has no DocsLit equivalent and was dropped.`, { code: 'component-prop-dropped', action: `Dropped ${name}.`, fix: 'Check the rendered page; add the behaviour with custom CSS or content if it matters.' });
      continue;
    }
    const rule = map[name];
    if (rule === null) continue;
    const spec = typeof rule === 'string' ? { to: rule } : rule;
    if (isExpr(v) || isJsx(v)) {
      warn(warnings, `Dynamic value for "${name}" on <${el.name}> cannot be converted and was dropped.`, { code: 'component-prop-dynamic', action: `Dropped ${name}.` });
      continue;
    }
    let val = v;
    if (spec.fn) { val = spec.fn(val, el); if (val === undefined) continue; if (val && typeof val === 'object' && !Array.isArray(val)) { Object.assign(attrs, val); continue; } }
    if (spec.map) { const k = String(val).toLowerCase(); if (!(k in spec.map)) { warn(warnings, `Value "${val}" of "${name}" on <${el.name}> is not supported; dropped.`, { code: 'component-value-dropped' }); continue; } val = spec.map[k]; }
    if (spec.link && typeof val === 'string') val = ctx.link(val, { line: el.line, quiet: spec.quietLink });
    if (spec.asset && typeof val === 'string') val = ctx.asset(val, { line: el.line });
    if (spec.icon && typeof val === 'string') val = normalizeIcon(val);
    const s = spec.keepBool ? val : attrString(val);
    if (s === undefined) continue;
    if (spec.boolFalseAsString && val === false) { attrs[spec.to] = 'false'; continue; }
    attrs[spec.to] = s;
  }
  if (classNameSeen) warnings.push({ severity: 'info', code: 'classname-dropped', message: `className on <${el.name}> was dropped (Tailwind/utility classes have no DocsLit equivalent).`, action: 'Dropped className.' });
  return { attrs, warnings };
}

const merge = (...parts) => {
  const attrs = {};
  const warnings = [];
  for (const p of parts) { Object.assign(attrs, p.attrs || p); warnings.push(...(p.warnings || [])); }
  return { attrs, warnings };
};

/** Build a handler from a declarative description. */
function simple(tag, opts = {}) {
  const { fixed = {}, map = {}, icon = false, block = true, run, fnAttrs, inline, iconKeys } = opts;
  return (el, ctx) => {
    const m = mapProps(el, ctx, { ...map, ...(icon ? { icon: null, iconType: null } : {}) });
    const w = m.warnings;
    const iconA = icon ? iconAttrs(el, w, iconKeys) : {};
    let attrs = { ...fixed, ...m.attrs, ...iconA };
    if (fnAttrs) attrs = fnAttrs(attrs, el, ctx, w) || attrs;
    const res = { tag: typeof tag === 'function' ? tag(el) : tag, attrs, block, warnings: w };
    if (inline) res.inline = true;
    if (run) res.run = run;
    return res;
  };
}

// ─── specs ────────────────────────────────────────────────────────────────────
const CALLOUT_TYPES = { Note: 'note', Info: 'info', Tip: 'tip', Warning: 'warning', Check: 'check', Danger: 'danger', Success: 'success', Error: 'error', Launch: 'launch', Caution: 'warning' };

const BADGE_COLORS = { gray: 'neutral', grey: 'neutral', blue: 'info', green: 'success', yellow: 'warning', orange: 'orange', red: 'danger', purple: 'purple', white: 'white', surface: 'surface', black: 'neutral' };
const BADGE_INTENTS = { success: 'success', note: 'note', tip: 'tip', warning: 'warning', error: 'error', info: 'info', launch: 'launch', check: 'check' };

function badge(el, ctx) {
  const w = [];
  const attrs = {};
  const color = el.prop('color');
  const intent = el.prop('intent');
  let outlined = el.flag('outlined') || el.flag('stroke');
  let minimal = el.flag('minimal');
  if (typeof color === 'string') {
    const c = color.toLowerCase();
    if (c === 'white-destructive') { attrs.variant = 'danger'; outlined = true; }
    else if (c === 'surface-destructive') { attrs.variant = 'danger'; minimal = true; }
    else if (BADGE_COLORS[c]) attrs.variant = BADGE_COLORS[c];
    else warn(w, `Badge color "${color}" is not supported; used the neutral style.`, { code: 'component-value-dropped', action: 'Used neutral.' });
  }
  if (typeof intent === 'string' && BADGE_INTENTS[intent]) attrs.variant = BADGE_INTENTS[intent];
  const sz = el.str('size'); if (sz && /^(xs|sm|md|lg)$/.test(sz)) attrs.size = sz;
  const sh = el.str('shape'); if (sh && /^(rounded|pill)$/.test(sh)) attrs.shape = sh;
  Object.assign(attrs, iconAttrs(el, w));
  if (outlined) attrs.outlined = true;
  if (minimal) attrs.minimal = true;
  if (el.flag('disabled')) attrs.disabled = true;
  return { tag: 'wc-badge', attrs, inline: true, block: false, warnings: w };
}

function tabs(el, ctx) {
  const w = [];
  const attrs = {};
  const mint = ctx.vendor === 'mintlify';
  if (mint && el.prop('sync') !== false) attrs.sync = 'mintlify';
  const dti = el.prop('defaultTabIndex');
  if (typeof dti === 'number') attrs['default-tab'] = String(dti);
  if (el.flag('borderBottom')) attrs['border-bottom'] = true;
  if (!mint) {
    const langTab = el.childEls.find((c) => (c.attributes || []).some((a) => a.name === 'language'));
    if (langTab) {
      attrs.sync = 'fern-language';
      warn(w, 'Fern language-synced tabs were mapped to sync="fern-language"; labels must match the code-block titles to stay in sync.', { severity: 'info', code: 'fern-tab-language-sync', action: 'Set sync="fern-language".', fix: 'Check that tab labels match the language names of the code blocks they accompany.' });
      w[w.length - 1].severity = 'info';
    }
  }
  for (const n of el.props.__order) if (!['defaultTabIndex', 'borderBottom', 'sync', 'className', 'toc'].includes(n)) warn(w, `Property "${n}" on <Tabs> was dropped.`, { code: 'component-prop-dropped' });
  return { tag: 'wc-tabs', attrs, block: true, warnings: w };
}

function tab(el, ctx) {
  const m = mapProps(el, ctx, { title: 'label', language: null, id: 'id', icon: null, iconType: null, toc: null });
  const attrs = { ...m.attrs, ...iconAttrs(el, m.warnings) };
  if (!attrs.label && el.str('language')) attrs.label = el.str('language');
  return { tag: 'wc-tab', attrs, block: true, warnings: m.warnings };
}

function card(el, ctx) {
  const w = [];
  const attrs = {};
  const m = mapProps(el, ctx, {
    title: 'title', href: { to: 'href', link: true }, horizontal: 'horizontal', img: { to: 'img', asset: true },
    src: { to: 'img', asset: true }, cta: 'cta', arrow: { to: 'arrow', fn: (v) => (v === false ? 'false' : v === true ? 'true' : String(v)) },
    type: 'type', imagePosition: { to: 'img-position', fn: String }, imageWidth: null, imageHeight: null, icon: null, iconType: null,
    iconPosition: { to: 'icon-position', fn: String }, iconSize: { to: 'icon-size', fn: (v) => String(Math.round(Number(v) * (ctx.vendor === 'fern' ? 4 : 1))) },
    color: null, lightModeColor: null, darkModeColor: null,
  });
  Object.assign(attrs, m.attrs); w.push(...m.warnings);
  const color = el.str('color');
  const lm = el.str('lightModeColor'); const dm = el.str('darkModeColor');
  if (lm || dm) { if (lm) attrs['icon-color'] = lm; if (dm) attrs['icon-color-dark'] = dm; }
  else if (color) attrs['icon-color'] = color;
  Object.assign(attrs, iconAttrs(el, w));
  if (attrs.icon && ctx.vendor !== 'fern' && /\.(svg|png|jpe?g|gif|webp)$/i.test(attrs.icon)) attrs.icon = ctx.asset(attrs.icon, { line: el.line });
  const order = ['title', 'href', 'icon', 'icon-type', 'icon-color', 'icon-color-dark', 'icon-size', 'icon-position', 'horizontal', 'img', 'img-position', 'cta', 'arrow', 'type'];
  const ordered = {};
  for (const k of order) if (k in attrs) ordered[k] = attrs[k];
  return { tag: 'wc-card', attrs: ordered, block: true, warnings: w };
}

function tile(el, ctx) {
  const m = mapProps(el, ctx, { title: 'title', description: 'description', href: { to: 'href', link: true }, icon: null, iconType: null });
  const parentName = el.parentName;
  const res = { tag: 'wc-tile', attrs: { ...m.attrs, ...iconAttrs(el, m.warnings) }, block: true, warnings: m.warnings };
  if (parentName !== 'CardGroup' && parentName !== 'Columns') res.run = 'wc-tiles';
  return res;
}

function field(kind) {
  return (el, ctx) => {
    const w = [];
    const attrs = {};
    const fern = ctx.vendor === 'fern';
    const m = mapProps(el, ctx, {
      path: null, query: null, body: null, header: null, name: 'name', type: 'type', required: 'required', deprecated: 'deprecated',
      default: 'default', placeholder: 'placeholder', pre: 'pre', post: 'post', toc: null, id: null, collapsible: 'collapsible', enum: null,
    });
    w.push(...m.warnings);
    for (const loc of ['path', 'query', 'body', 'header']) {
      const v = el.str(loc);
      if (v !== undefined && kind === 'param') { attrs.name = v; if (!fern) attrs.in = loc; }
      else if (el.prop(loc) === true) { /* `<ParamField path>` bare: no name */ }
    }
    Object.assign(attrs, m.attrs);
    const order = ['name', 'in', 'type', 'required', 'deprecated', 'default', 'placeholder', 'pre', 'post', 'collapsible'];
    const out = {};
    for (const k of order) if (k in attrs) out[k] = attrs[k];
    return { tag: 'wc-field', attrs: out, block: true, warnings: w, run: kind === 'param' ? 'wc-fields' : 'wc-response-fields' };
  };
}

function steps(el, ctx) {
  const m = mapProps(el, ctx, { titleSize: 'title-size', toc: null, tocDepth: null, id: null });
  const attrs = { ...m.attrs };
  if (!attrs['title-size'] && ctx.vendor === 'fern' && el.flag('toc')) attrs['title-size'] = 'h2';
  return { tag: 'wc-steps', attrs, block: true, warnings: m.warnings };
}

function step(el, ctx) {
  const m = mapProps(el, ctx, { title: 'title', stepNumber: { to: 'n', fn: String }, titleSize: 'title-size', id: 'id', noAnchor: 'no-anchor', icon: null, iconType: null, toc: null, description: null });
  const attrs = { ...m.attrs, ...iconAttrs(el, m.warnings) };
  if (attrs.title === undefined) attrs.title = '';
  return { tag: 'wc-step', attrs, block: true, warnings: m.warnings };
}

function dirOrFile(kind) {
  return (el, ctx) => {
    const fern = ctx.vendor === 'fern' && el.name !== 'Tree.Folder' && el.name !== 'Tree.File';
    const m = mapProps(el, ctx, { name: 'name', defaultOpen: null, openable: null, highlight: 'highlight', highlighted: 'highlight', href: { to: 'href', link: true }, comment: { to: 'comment', fn: (v) => String(v).replace(/^#\s*/, '') } });
    const attrs = { ...m.attrs };
    if (kind === 'dir') {
      if (!el.flag('defaultOpen')) attrs.collapsed = true;
      if (el.prop('openable') === false) attrs.openable = 'false';
    }
    void fern;
    return { tag: kind === 'dir' ? 'wc-dir' : 'wc-file', attrs, block: false, gapless: true, warnings: m.warnings };
  };
}

function update(el, ctx) {
  const m = mapProps(el, ctx, { label: 'label', description: 'description', tags: 'tags', id: null, rss: null, className: null });
  const w = m.warnings;
  if (el.prop('rss') !== undefined) w.push({ severity: 'warning', code: 'update-rss-dropped', message: 'The `rss` object on <Update> is not supported (DocsLit generates feeds from page content).', action: 'Dropped rss.' });
  if (el.prop('id') !== undefined) w.push({ severity: 'info', code: 'update-id-dropped', message: '<Update id> is not supported; the label is used as the anchor.', action: 'Dropped id.' });
  return { tag: 'wc-update', attrs: m.attrs, block: true, warnings: w };
}

function frame(el, ctx) {
  const m = mapProps(el, ctx, { caption: 'caption', hint: 'hint', background: { to: 'background', map: { default: 'default', subtle: 'subtle' } }, style: null });
  return { tag: 'wc-frame', attrs: { ...m.attrs, border: true }, block: true, warnings: m.warnings };
}

function prompt(el, ctx) {
  const w = [];
  const m = mapProps(el, ctx, { title: 'title', description: 'description', icon: null, iconType: null, actions: null, singleLine: 'single-line', hidePrompt: 'hide-prompt' });
  const attrs = { ...m.attrs, ...iconAttrs(el, m.warnings) };
  w.push(...m.warnings);
  const actions = el.prop('actions');
  if (Array.isArray(actions)) {
    const strs = actions.filter((a) => typeof a === 'string' && a !== 'copy');
    const objs = actions.filter((a) => a && typeof a === 'object' && !isExpr(a) && !isJsx(a));
    if (objs.length) attrs.actions = JSON.stringify(objs.map((o) => ({ label: o.label, url: o.url, ...(o.icon ? { icon: o.icon } : {}) })));
    else if (strs.length) attrs.actions = strs.join(', ');
  }
  return { tag: 'wc-prompt', attrs, block: true, warnings: w };
}

function tooltip(el, ctx) {
  const m = mapProps(el, ctx, { tip: 'tip', headline: 'headline', cta: 'cta', href: { to: 'href', link: true }, side: { to: 'position', map: { top: 'top', bottom: 'bottom', left: 'left', right: 'right' } }, sideOffset: null, data: null, tooltips: null });
  return { tag: 'wc-tooltip', attrs: m.attrs, inline: true, block: false, warnings: m.warnings };
}

function iconEl(el, ctx) {
  const w = [];
  const attrs = {};
  const ic = el.prop('icon');
  const src = el.str('src');
  if (isJsx(ic)) { const svg = jsxSvgToHtml(ic.__jsx); if (svg) attrs.name = svg; }
  else if (typeof ic === 'string') attrs.name = ctx.vendor === 'fern' && /^\.?\.?\//.test(ic) ? ctx.asset(ic, { line: el.line }) : normalizeIcon(ic);
  if (src && !attrs.name) attrs.name = ctx.asset(src, { line: el.line });
  const t = el.str('iconType'); if (t && ICON_TYPES.has(t)) attrs['icon-type'] = t;
  const color = el.str('color') || el.str('lightModeColor'); if (color) attrs.color = color;
  const size = el.prop('size'); if (typeof size === 'number' || typeof size === 'string') attrs.size = String(ctx.vendor === 'fern' && !isNaN(Number(size)) ? Number(size) * 4 : size);
  if (!attrs.name) w.push({ severity: 'warning', code: 'icon-dropped', message: '<Icon> without a usable icon name was dropped.', action: 'Removed.' });
  return attrs.name ? { tag: 'wc-icon', attrs, inline: true, block: false, warnings: w, voidTag: false } : { drop: true, warnings: w };
}

function copyEl(el, ctx) {
  const m = mapProps(el, ctx, { clipboard: 'clipboard', text: 'text' });
  return { tag: 'wc-copy', attrs: m.attrs, inline: true, block: false, warnings: m.warnings };
}

function button(el, ctx) {
  const w = [];
  const m = mapProps(el, ctx, { intent: { to: 'variant', map: { none: 'none', primary: 'primary', success: 'success', warning: 'warning', danger: 'danger' } }, minimal: 'minimal', outlined: 'outlined', small: null, large: null, full: 'full', rounded: 'rounded', mono: 'mono', active: 'active', disabled: 'disabled', icon: null, rightIcon: { to: 'right-icon', icon: true }, href: { to: 'href', link: true }, target: 'target', text: null });
  w.push(...m.warnings);
  const attrs = { variant: 'none', ...m.attrs, ...iconAttrs(el, w) };
  if (el.flag('small')) attrs.size = 'sm'; else if (el.flag('large')) attrs.size = 'lg';
  const res = { tag: 'wc-button', attrs, inline: true, block: false, warnings: w };
  if (el.str('text') && !el.children.length) res.body = el.str('text');
  return res;
}

function download(el, ctx) {
  const w = [];
  const attrs = {};
  const src = el.str('src');
  if (src) attrs.href = ctx.asset(src, { line: el.line });
  const sources = el.prop('sources');
  if (Array.isArray(sources)) { const list = sources.filter((s) => typeof s === 'string').map((s) => ctx.asset(s, { line: el.line })); attrs.sources = list.join(', '); if (!attrs.href && list.length) attrs.href = list[0]; }
  if (el.str('filename')) attrs.filename = el.str('filename');
  let label = el.text().trim();
  if (!label) label = el.str('filename') || 'Download';
  label = label.replace(/^\[|\]\([^)]*\)$/g, '');
  const m = mapProps(el, ctx, { src: null, sources: null, filename: null });
  w.push(...m.warnings);
  return { replace: `<wc-download${renderAttrsLocal(attrs)}>${label}</wc-download>`, block: false, warnings: w };
}

function renderAttrsLocal(attrs) {
  let out = '';
  for (const [k, v] of Object.entries(attrs)) { if (v === undefined || v === false) continue; out += v === true ? ` ${k}` : ` ${k}="${String(v).replace(/"/g, '&quot;')}"`; }
  return out;
}

function colorSpec(el, ctx) {
  const m = mapProps(el, ctx, { variant: { to: 'variant', map: { compact: 'compact', table: 'table' } } });
  return { tag: 'wc-colors', attrs: m.attrs, block: true, warnings: m.warnings };
}

function ifEl(el, ctx) {
  const w = [];
  const attrs = {};
  const versions = el.prop('versions');
  if (versions !== undefined) attrs.version = Array.isArray(versions) ? versions.join(', ') : String(versions);
  const products = el.prop('products');
  if (products !== undefined) {
    attrs.attr = 'PRODUCT'; attrs.equals = Array.isArray(products) ? products.join(', ') : String(products);
    w.push({ severity: 'warning', code: 'fern-if-products', message: '<If products> uses a PRODUCT attribute; DocsLit has no products.', action: 'Mapped to <wc-if attr="PRODUCT" equals="…">.', fix: 'Set the PRODUCT attribute per build (or remove the condition).' });
  }
  if (el.prop('roles') !== undefined) {
    w.push({ severity: 'warning', code: 'auth-content-dropped', message: '<If roles> gates content by login role; static sites have no auth. Block removed.', action: 'Removed the block and its content.', fix: 'Move the content to a public page if it should be visible.' });
    return { drop: true, warnings: w };
  }
  const li = el.prop('loggedIn');
  if (li === true) { w.push({ severity: 'warning', code: 'auth-content-dropped', message: '<If loggedIn> content is for signed-in users only; removed.', action: 'Removed.' }); return { drop: true, warnings: w }; }
  if (li === false && !Object.keys(attrs).length) return { unwrap: true, warnings: w };
  if (el.flag('not')) attrs.not = true;
  return { tag: 'wc-if', attrs, block: true, warnings: w };
}

function visibility(el, ctx) {
  const f = el.str('for');
  const w = [];
  if (f === 'humans' || f === 'agents') return { tag: 'wc-if', attrs: { for: f }, block: true, warnings: w };
  if (f === 'signed-out') return { unwrap: true, warnings: w };
  w.push({ severity: 'warning', code: 'auth-content-dropped', message: `<Visibility for="${f ?? '…'}"> gates content by sign-in/group; static sites have no auth. Block removed.`, action: 'Removed the block.', fix: 'Move the content to a public page if it should be visible.' });
  return { drop: true, warnings: w };
}

function codeGroup(el, ctx) {
  const m = mapProps(el, ctx, { dropdown: 'dropdown', sync: null });
  return { tag: 'wc-code-group', attrs: m.attrs, block: true, warnings: m.warnings };
}

function exampleGroup(el, ctx) {
  const m = mapProps(el, ctx, { dropdown: 'dropdown' });
  return { tag: 'wc-code-group', attrs: m.attrs, block: true, warnings: m.warnings };
}

function anchorEl(el, ctx) {
  const id = el.str('id');
  const kids = el.children.filter((c) => c.type !== 'text' || c.value.trim());
  const PHRASING = new Set(['text', 'strong', 'emphasis', 'inlineCode', 'link', 'delete', 'mdxJsxTextElement', 'break']);
  const simpleText = (kids.length === 1 && kids[0].type === 'paragraph') || (kids.length > 0 && kids.every((c) => PHRASING.has(c.type)));
  if (!id) return { unwrap: true };
  if (simpleText) return { tag: 'wc-anchor', attrs: { id }, block: !(kids.length && kids.every((c) => PHRASING.has(c.type))) };
  return { unwrap: true, before: `<a id="${id}"></a>\n\n` };
}

function embedFromMedia(kind) {
  return (el, ctx) => {
    const w = [];
    const attrs = {};
    const src = el.str('src');
    if (!src) return { tag: el.name, attrs: {}, passthrough: true };
    attrs.src = /^https?:|^\/\//.test(src) ? src : ctx.asset(src, { line: el.line });
    if (el.str('title')) attrs.title = el.str('title');
    const cls = String(el.str('className') || el.str('class') || '');
    if (kind === 'iframe') {
      if (/pdf(\?|$|#)/i.test(src)) return { passthrough: true };
      const h = el.prop('height') ?? (/\bh-(\d+)\b/.exec(cls) ? Number(/\bh-(\d+)\b/.exec(cls)[1]) * 4 : undefined);
      if (/aspect-video|youtube|youtu\.be|vimeo|loom/i.test(cls + src) && h === undefined) attrs.ratio = '16/9';
      else if (h !== undefined) attrs.height = String(parseInt(String(h), 10));
      else attrs.ratio = '16/9';
    } else {
      if (el.str('poster')) attrs.poster = ctx.asset(el.str('poster'), { line: el.line });
      if (el.prop('controls') === false) attrs.controls = 'false';
      if (el.flag('autoPlay') || el.flag('autoplay')) attrs.autoplay = true;
      if (el.flag('muted')) attrs.muted = true;
      if (el.flag('loop')) attrs.loop = true;
    }
    return { tag: 'wc-embed', attrs, block: true, warnings: w };
  };
}

function walkthrough(el, ctx) {
  const m = mapProps(el, ctx, { layout: { to: 'layout', map: { default: 'default', wide: 'wide' } }, panelHeight: 'panel-height', dim: { to: 'dim', fn: (v) => String(v) }, stickyHeaders: null, substepStyle: null });
  return { tag: 'wc-walkthrough', attrs: m.attrs, block: true, warnings: m.warnings };
}
function walkStep(tag) {
  return (el, ctx) => {
    const m = mapProps(el, ctx, { title: 'title', description: 'description', file: { to: 'file', fn: String }, focus: { to: 'focus', fn: (v) => (Array.isArray(v) ? v.join(',') : String(v)) }, highlight: { to: 'highlight', fn: (v) => (Array.isArray(v) ? v.join(',') : String(v)) }, startLine: { to: 'start-line', fn: String }, id: null });
    return { tag, attrs: m.attrs, block: true, warnings: m.warnings };
  };
}

function tableWrap(opts) {
  return (el, ctx) => {
    const m = mapProps(el, ctx, { placeholder: 'placeholder', pageSize: null, expandable: null, columns: null });
    return { tag: 'wc-table', attrs: { ...opts, ...m.attrs }, block: true, warnings: m.warnings };
  };
}

function apiPlaceholder(label) {
  return (el, ctx) => ({
    tag: 'wc-callout', attrs: { type: 'info', title: `${label} (see the API reference)` }, block: true,
    bodyOnly: true, replace: `<wc-callout type="info" title="${label}: see the API reference">\n\nThis section was generated from the API definition in the original docs. See the API reference pages for the endpoint details.\n\n</wc-callout>`,
    warnings: [{ severity: 'warning', code: 'fern-api-snippet', message: `<${el.name}> renders API data from the Fern definition; DocsLit shows this on the generated API reference pages instead.`, action: 'Replaced with a pointer callout.', fix: 'Link to the generated API reference page for this endpoint or paste the example manually.' }],
  });
}

function mermaidEl(el, ctx) { return { tag: 'wc-mermaid', attrs: {}, block: true, warnings: mapProps(el, ctx, { actions: null, placement: null }).warnings }; }

function githubRepo(el, ctx) {
  const m = mapProps(el, ctx, { repo: 'repo', variant: { to: 'variant', map: { inset: 'inset', flat: 'flat' } } });
  return { tag: 'wc-github-repo', attrs: m.attrs, block: true, warnings: m.warnings };
}

function aside(el, ctx, name) {
  const w = [];
  if (name === 'Panel') w.push({ severity: 'warning', code: 'mintlify-panel', message: '<Panel> (right-rail content) becomes a floating <wc-aside>; keep it near the top of the page.', action: 'Mapped to wc-aside sticky.', fix: 'Check placement on the converted page.' });
  return { tag: 'wc-aside', attrs: { sticky: true }, block: true, warnings: w };
}

function columns(el, ctx) {
  const m = mapProps(el, ctx, { cols: { to: 'cols', fn: String } });
  return { tag: 'wc-columns', attrs: m.attrs, block: true, warnings: m.warnings };
}

function latex(el) { return { replace: `$$${el.text().trim()}$$` }; }

// Code component (Fern): handled by the context (needs file IO)
function codeComponent(el, ctx) {
  const src = el.str('src');
  const w = [];
  if (!src) return { unwrap: true, warnings: w };
  const attrs = [];
  const title = el.str('title');
  const range = el.raw.lines ?? (typeof el.prop('lines') === 'string' ? el.prop('lines') : undefined);
  const res = ctx.codeFromSource(src, { title, lines: range ? String(range).replace(/[\[\]\s]/g, '') : undefined, maxLines: el.prop('maxLines'), highlight: el.raw.highlight, focus: el.raw.focus, line: el.line });
  return { replace: res.text, block: true, warnings: res.warnings || [] };
}

// ─── resolution ───────────────────────────────────────────────────────────────
const SPECS = {};
for (const [n, t] of Object.entries(CALLOUT_TYPES)) SPECS[n] = simple('wc-callout', { fixed: { type: t }, map: { title: 'title', icon: null, iconType: null }, icon: true });
SPECS.Callout = (el, ctx) => {
  const m = mapProps(el, ctx, { intent: { to: 'type', map: { note: 'note', info: 'info', tip: 'tip', warning: 'warning', error: 'error', success: 'success', launch: 'launch', check: 'check', danger: 'danger' } }, title: 'title', icon: null, iconType: null, color: 'color' });
  const attrs = { ...m.attrs, ...iconAttrs(el, m.warnings) };
  if (!attrs.type && !attrs.color) attrs.type = 'info';
  const ordered = {}; for (const k of ['type', 'title', 'icon', 'icon-type', 'color']) if (k in attrs) ordered[k] = attrs[k];
  return { tag: 'wc-callout', attrs: ordered, block: true, warnings: m.warnings };
};
Object.assign(SPECS, {
  AccordionGroup: simple('wc-accordion-group'),
  Accordion: (el, ctx) => { const r = simple('wc-accordion', { map: { title: 'title', description: 'description', defaultOpen: 'open', id: 'id', iconPosition: null }, icon: true })(el, ctx); if (el.parentName !== 'AccordionGroup') r.run = 'wc-accordion-group'; return r; },
  Expandable: simple('wc-expandable', { map: { title: 'title', description: 'description', defaultOpen: 'open', id: null }, icon: true }),
  Badge: badge,
  CardGroup: (el, ctx) => { const m = mapProps(el, ctx, { cols: { to: 'cols', fn: String } }); return { tag: 'wc-tiles', attrs: { cols: '2', ...m.attrs }, block: true, warnings: m.warnings }; },
  Card: card,
  Tile: tile,
  Columns: columns,
  ColumnGroup: columns,
  Column: () => ({ tag: 'div', attrs: {}, block: true }),
  Color: colorSpec,
  'Color.Row': simple('wc-color-row', { map: { title: 'title' } }),
  'Color.Item': (el, ctx) => {
    const m = mapProps(el, ctx, { name: 'name', value: null, light: 'light', dark: 'dark' });
    const attrs = { ...m.attrs };
    const v = el.prop('value');
    if (typeof v === 'string') attrs.value = v;
    else if (v && typeof v === 'object' && !isExpr(v)) { if (v.light) attrs.light = v.light; if (v.dark) attrs.dark = v.dark; }
    return { tag: 'wc-color', attrs, block: true, warnings: m.warnings };
  },
  RequestExample: exampleGroup,
  ResponseExample: exampleGroup,
  CodeGroup: codeGroup,
  CodeBlocks: codeGroup,
  CodeBlock: (el) => ({ unwrap: true, warnings: el.props.links !== undefined ? [{ severity: 'warning', code: 'fern-codeblock-links', message: '<CodeBlock links> deep links are not supported; the code block was kept without them.', action: 'Unwrapped <CodeBlock>.' }] : [] }),
  Code: codeComponent,
  ParamField: field('param'),
  ResponseField: field('response'),
  Frame: frame,
  'GitHub.Repo': githubRepo,
  Icon: iconEl,
  Mermaid: mermaidEl,
  Panel: (el, ctx) => aside(el, ctx, 'Panel'),
  Aside: (el, ctx) => aside(el, ctx, 'Aside'),
  Prompt: prompt,
  Steps: steps,
  Step: (el, ctx) => (el.parentName === 'ScrollWalkthrough' ? walkStep('wc-walkthrough-step')(el, ctx) : el.parentName === 'Step' && el.ancestors.includes('ScrollWalkthrough') ? walkStep('wc-walkthrough-substep')(el, ctx) : step(el, ctx)),
  Tabs: tabs,
  TabGroup: () => ({ unwrap: true }),
  Tab: tab,
  Tooltip: tooltip,
  Tree: (el, ctx) => ({ ...simple('wc-files')(el, ctx), outerOnly: true }),
  Files: (el, ctx) => ({ ...simple('wc-files')(el, ctx), outerOnly: true }),
  FileTree: (el, ctx) => ({ ...simple('wc-files')(el, ctx), outerOnly: true }),
  'Tree.Folder': dirOrFile('dir'), Folder: dirOrFile('dir'),
  'Tree.File': dirOrFile('file'), File: dirOrFile('file'),
  Update: update,
  View: (el, ctx) => { const m = mapProps(el, ctx, { title: 'label', icon: null, iconType: null }); return { tag: 'wc-view-panel', attrs: { ...m.attrs, ...iconAttrs(el, m.warnings) }, block: true, warnings: m.warnings, run: 'wc-view' }; },
  Visibility: visibility,
  MDX: () => ({ unwrap: true }),
  Anchor: anchorEl,
  Button: button,
  Copy: copyEl,
  Download: download,
  Indent: simple('wc-indent'),
  If: ifEl,
  Versions: simple('wc-versions'),
  Version: (el, ctx) => { const m = mapProps(el, ctx, { version: null, title: null, default: null }); return { tag: 'wc-version', attrs: { name: el.str('title') || el.str('version') }, block: true, warnings: m.warnings }; },
  StickyTable: tableWrap({ sticky: true }),
  SearchableTable: tableWrap({ searchable: true }),
  StickySearchableTable: tableWrap({ sticky: true, searchable: true }),
  PaginatedSearchableTable: (el, ctx) => { const r = tableWrap({ searchable: true })(el, ctx); r.warnings.push({ severity: 'info', code: 'table-pagination-dropped', message: '<PaginatedSearchableTable> pagination is not supported; the table is searchable but shows all rows.', action: 'Mapped to a searchable wc-table.' }); return r; },
  PaginatedTable: (el, ctx) => { const r = tableWrap({ searchable: true })(el, ctx); r.warnings.push({ severity: 'info', code: 'table-pagination-dropped', message: '<PaginatedTable> pagination is not supported; the table is searchable but shows all rows.', action: 'Mapped to a searchable wc-table.' }); return r; },
  ScrollWalkthrough: walkthrough,
  Substep: walkStep('wc-walkthrough-substep'),
  Latex: latex,
  Heading: (el) => { const lv = Math.min(6, Math.max(1, Number(el.prop('level')) || 2)); return { replace: `${'#'.repeat(lv)} ${el.childSource().replace(/\s*\n\s*/g, ' ')}`, warnings: [] }; },
  RunnableEndpoint: (el, ctx) => ({
    replace: `<wc-callout type="info" title="Runnable endpoint">\n\nTry this endpoint (${el.str('endpoint') || ''}) from the API reference pages.\n\n</wc-callout>`,
    warnings: [{ severity: 'warning', code: 'fern-runnable-endpoint', message: '<RunnableEndpoint> has no inline equivalent; replaced with a pointer to the API reference.', action: 'Replaced with a callout.', fix: 'Link to the generated API reference page for the endpoint.' }],
  }),
  Schema: apiPlaceholder('Schema'),
  EndpointRequestSnippet: apiPlaceholder('Request example'),
  EndpointResponseSnippet: apiPlaceholder('Response example'),
  WebhookPayloadSnippet: apiPlaceholder('Webhook payload'),
  SchemaSnippet: apiPlaceholder('Schema example'),
  Markdown: (el, ctx) => {
    const src = el.str('src');
    if (!src) return { drop: true };
    return ctx.includeSnippet(src, el);
  },
  Snippet: (el, ctx) => { const f = el.str('file'); if (!f) return { drop: true }; return ctx.includeSnippet('/snippets/' + f.replace(/^\/?(snippets\/)?/, ''), el); },
  'llms-only': () => ({ tag: 'wc-if', attrs: { for: 'agents' }, block: true }),
  'llms-ignore': () => ({ tag: 'wc-if', attrs: { for: 'humans' }, block: true }),
});

const BLOCK_HTML = new Set(['div', 'section', 'details', 'figure', 'center', 'blockquote', 'article', 'aside', 'main', 'header', 'footer', 'nav']);
export const UNKNOWN_BLOCK_HTML = BLOCK_HTML;

const HTML_ATTR_RENAME = { className: 'class', htmlFor: 'for', tabIndex: 'tabindex', colSpan: 'colspan', rowSpan: 'rowspan', srcSet: 'srcset', frameBorder: 'frameborder', allowFullScreen: 'allowfullscreen', autoPlay: 'autoplay', playsInline: 'playsinline', crossOrigin: 'crossorigin', referrerPolicy: 'referrerpolicy', noZoom: 'noZoom', cellPadding: 'cellpadding', cellSpacing: 'cellspacing', readOnly: 'readonly', maxLength: 'maxlength', datetime: 'datetime', dateTime: 'datetime', contentEditable: 'contenteditable', spellCheck: 'spellcheck' };

function htmlElement(el, ctx) {
  const name = el.name;
  const w = [];
  const attrs = {};
  const isImg = name === 'img';
  for (const n of el.props.__order) {
    const v = el.props[n];
    if (/^on[A-Z]/.test(n)) { w.push({ severity: 'warning', code: 'html-handler-dropped', message: `Event handler ${n} on <${name}> cannot run in static Markdown; dropped.`, action: `Dropped ${n}.` }); continue; }
    let out = HTML_ATTR_RENAME[n] || n;
    if (n === 'actions' || n === 'actionsPlacement') { w.push({ severity: 'warning', code: 'img-actions-dropped', message: `<img ${n}> (image actions) is not supported; dropped.`, action: `Dropped ${n}.` }); continue; }
    let val = v;
    if (n === 'style' && v && typeof v === 'object' && !isExpr(v) && !isJsx(v)) val = styleToCss(v);
    else if (isExpr(v) || isJsx(v)) { w.push({ severity: 'warning', code: 'html-expression-dropped', message: `Dynamic attribute ${n} on <${name}> dropped.`, action: `Dropped ${n}.` }); continue; }
    else if (typeof v === 'object' && v !== null) continue;
    if ((n === 'src' || n === 'poster') && typeof val === 'string') val = ctx.asset(val, { line: el.line });
    if (n === 'href' && typeof val === 'string' && name === 'a') val = ctx.link(val, { line: el.line });
    if (n === 'src' && name === 'a') continue;
    const s = attrString(val);
    if (s === undefined) continue;
    attrs[out] = s;
  }
  const VOID = new Set(['img', 'br', 'hr', 'input', 'source', 'col', 'wbr', 'meta', 'link', 'area', 'embed', 'track']);
  return { tag: name, attrs, block: BLOCK_HTML.has(name), voidTag: VOID.has(name), warnings: w, count: false, html: true };
}

function imgSpec(el, ctx) {
  const cls = String(el.str('className') || el.str('class') || '');
  const dark = /\bhidden\b.*\bdark:block\b|\bdark:block\b/.test(cls) && !/dark:hidden/.test(cls);
  const light = /dark:hidden/.test(cls);
  const src = el.str('src');
  const alt = el.str('alt') || '';
  if (light && src) {
    const next = el.neighbour(1);
    if (next && next.node.type.startsWith('mdxJsx') && next.node.name === 'img') {
      const nSrc = (next.node.attributes.find((a) => a.name === 'src') || {}).value;
      const nCls = String((next.node.attributes.find((a) => a.name === 'className') || {}).value || '');
      if (typeof nSrc === 'string' && /dark:block/.test(nCls)) {
        ctx.consumed.add(next.node);
        const l = ctx.asset(src, { line: el.line });
        const d = ctx.asset(nSrc, { line: el.line });
        ctx.count('img light/dark pair', '![](a#dark=b)');
        return { replace: `![${alt}](${l}#dark=${d})`, block: false };
      }
    }
  }
  if (dark && ctx.consumed.has(el.node)) return { drop: true, count: false };
  return htmlElement(el, ctx);
}

export function resolveSpec(el, ctx) {
  const name = el.name;
  if (ctx.consumed?.has(el.node)) return { drop: true, count: false };
  // user-defined / imported components first
  const user = ctx.userComponent?.(el);
  if (user) return user;
  if (/^[a-z]/.test(name) && !name.includes('-') && !name.includes('.')) {
    if (name === 'img') return imgSpec(el, ctx);
    if (name === 'iframe') return embedFromMedia('iframe')(el, ctx).passthrough ? htmlElement(el, ctx) : embedFromMedia('iframe')(el, ctx);
    if (name === 'video') { const r = embedFromMedia('video')(el, ctx); return r.passthrough ? htmlElement(el, ctx) : r; }
    return htmlElement(el, ctx);
  }
  const h = SPECS[name];
  if (h) return h(el, ctx);
  if (name.startsWith('wc-')) return htmlElement(el, ctx);
  if (/^[a-z]/.test(name)) return htmlElement(el, ctx);
  // Unknown component: keep content inside a clearly marked callout
  return unknownComponent(el, ctx);
}

function unknownComponent(el, ctx) {
  const hasKids = el.children.length > 0;
  const msg = {
    severity: 'error', code: 'unknown-component',
    message: `Component <${el.name}> is not a known Mintlify/Fern component and has no DocsLit equivalent.`,
    action: hasKids ? 'Kept its content inside a warning callout marked "Unconverted component".' : 'Replaced with a warning callout marked "Unconverted component".',
    fix: `Replace the callout with the intended content, or build a DocsLit custom component (components/${el.name.replace(/[A-Z]/g, (c, i) => (i ? '-' : '') + c.toLowerCase())}.js).`,
  };
  const title = `Unconverted component: ${el.name}`;
  if (!hasKids) {
    const propsText = el.props.__order.map((n) => n).join(', ');
    return { replace: `<wc-callout type="warning" title="${title}">\n\n${propsText ? `Props: ${propsText}. ` : ''}Replace this placeholder.\n\n</wc-callout>`, warnings: [msg], count: true };
  }
  return { tag: 'wc-callout', attrs: { type: 'warning', title }, block: true, warnings: [msg] };
}

export const RUN_SPECS = {
  'wc-tiles': { open: '<wc-tiles cols="2">', close: '</wc-tiles>' },
  'wc-fields': { open: '<wc-fields>', close: '</wc-fields>' },
  'wc-response-fields': { open: '<wc-response-fields>', close: '</wc-response-fields>' },
  'wc-view': { open: '<wc-view sync="views">', close: '</wc-view>' },
  'wc-accordion-group': { open: '<wc-accordion-group>', close: '</wc-accordion-group>' },
};

/** Run key for a sibling node (without side effects): which wrapper does this element want? */
export function runKeyForNode(node, parentName) {
  if (!node || !node.type?.startsWith('mdxJsx') || !node.name) return null;
  switch (node.name) {
    case 'Tile': return parentName === 'CardGroup' || parentName === 'Columns' ? null : 'wc-tiles';
    case 'ParamField': return 'wc-fields';
    case 'ResponseField': return 'wc-response-fields';
    case 'View': return 'wc-view';
    case 'Accordion': return parentName === 'AccordionGroup' ? null : 'wc-accordion-group';
    default: return null;
  }
}

export { kebab };
