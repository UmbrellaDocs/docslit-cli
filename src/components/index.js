import callouts from './callouts.js';
import layout from './layout.js';
import navigation from './navigation.js';
import code from './code.js';
import media, { icon } from './media.js';
import data from './data.js';
import content from './content.js';
import utility from './utility.js';
import shared from './shared.js';
import rich from './rich.js';

const LIT_IMPORTS = `import { LitElement, html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
`;

// Helpers every component file may use (module scope in the full bundle; exported by the core module in the split build).
const PRELUDE = `
// Link targets from attribute text (OpenAPI descriptions can be third-party): allow relative
// URLs, fragments, http(s) and mailto. Anything else (javascript:, data:, vbscript:...) is dropped.
// Browsers ignore ASCII whitespace/control chars inside a scheme, so strip them before checking.
function _safeHref(u) {
  const colon = u.indexOf(':');
  if (colon === -1) return u;
  const sep = u.search(/[\\/?#]/);
  if (sep !== -1 && sep < colon) return u;
  return /^(?:https?|mailto):/i.test(u.replace(/[\\s\\u0000-\\u001f]/g, '')) ? u : null;
}

function _inlineMd(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
    .replace(/(?<![\\w*])\\*([^*]+)\\*(?![\\w*])/g, '<em>$1</em>')
    .replace(/(?<![\\w])_([^_]+)_(?![\\w])/g, '<em>$1</em>')
    .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, (m, label, url) => {
      const href = _safeHref(url);
      return href === null ? label : '<a href="' + href + '" target="_blank" rel="noopener">' + label + '</a>';
    });
}
`;

/** The full bundle: every built-in component in one module (dev server, offline builds, and docslit.js in static builds). */
export function buildComponents() {
  return `${LIT_IMPORTS}${PRELUDE}
${shared}

${callouts}

${layout}

${navigation}

${code}

${icon}

${media}

${data}

${content}

${utility}

${rich}

console.log('✅ DocsLit: registered all built-in web components.');
`;
}

// Component files of the split build, in the same order as the full bundle. wc-icon lives in the
// core: the page chrome uses it, and code blocks render it inside their shadow DOM.
const CATEGORIES = { callouts, layout, navigation, code, media, data, content, utility, rich };

/** Top-level names declared in a source fragment (function, class, const, let, var). */
function topLevelNames(src) {
  return [...src.matchAll(/^(?:async\s+)?(?:function\s*\*?\s*|class\s+|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
}

/**
 * Split build for static sites: a small core module (helpers, deferred rendering, wc-icon and a
 * loader) plus one module per component family. The loader imports a family the first time one of
 * its tags is in the page, including content inserted later (client-side navigation).
 * Returns { core, chunks: { name: source }, tagChunks: { tag: name } }.
 */
export function buildComponentChunks() {
  const coreScope = PRELUDE + shared;
  const helpers = [...new Set(topLevelNames(coreScope))];
  const tagChunks = {};
  const chunks = {};
  for (const [name, src] of Object.entries(CATEGORIES)) {
    const clash = topLevelNames(src).filter((n) => helpers.includes(n));
    if (clash.length) throw new Error(`components/${name}.js redeclares core helper(s): ${clash.join(', ')}`);
    for (const m of src.matchAll(/customElements\.define\(\s*'(wc-[a-z0-9-]+)'/g)) tagChunks[m[1]] = name;
    chunks[name] = `${LIT_IMPORTS}import { ${helpers.join(', ')} } from './docslit-core.js';
${src}`;
  }
  const core = `${LIT_IMPORTS}${coreScope}
${icon}

// ── Component loader ───────────────────────────────────────────────────────
const _DL_CHUNKS = ${JSON.stringify(tagChunks)};
const _dlRequested = new Set();
function _dlLoadFor(root) {
  if (!root || !root.querySelectorAll) return;
  const need = new Set();
  const consider = (el) => { const c = _DL_CHUNKS[el.localName]; if (c && !_dlRequested.has(c) && !customElements.get(el.localName)) need.add(c); };
  if (root.localName) consider(root);
  for (const el of root.querySelectorAll(':not(:defined)')) consider(el);
  for (const c of need) {
    _dlRequested.add(c);
    import(new URL('./docslit-c-' + c + '.js', import.meta.url).href).catch((e) => {
      _dlRequested.delete(c);
      console.error('DocsLit: could not load components (' + c + ')', e);
    });
  }
}
_dlLoadFor(document);
new MutationObserver((records) => {
  for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) _dlLoadFor(n);
}).observe(document.documentElement, { childList: true, subtree: true });

export { ${helpers.join(', ')} };
`;
  return { core, chunks, tagChunks };
}

/** Component families a page needs, from the wc-* tags in its HTML (for <link rel="modulepreload">). */
export function chunksForHtml(html, tagChunks) {
  const out = new Set();
  for (const m of String(html).matchAll(/<(wc-[a-z0-9-]+)/g)) if (tagChunks[m[1]]) out.add(tagChunks[m[1]]);
  return [...out];
}
