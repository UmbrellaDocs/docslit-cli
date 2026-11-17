/**
 * rehype plugin: resolves icons and other build-time structure for wc-* components.
 *
 *  - Every `icon` / `icon-name` / `right-icon` attribute (and `<wc-icon name>`) is resolved
 *    NOW to inline SVG (Lucide + Font Awesome Free, see src/icons.js) and attached as a
 *    `slot="icon"` child, so no CDN request happens at view time and offline builds work.
 *  - Callouts without an explicit icon get a default one for their type.
 *  - `wc-step` titles become real light-DOM headings (`slot="title"`), so they appear in
 *    the page TOC, get anchor ids, and stay readable when JS fails.
 *  - `wc-file` / `wc-dir` get file-type icons.
 *  - `<img noZoom>` and images inside links opt out of the lightbox; raw video-provider
 *    `<iframe>`s become privacy-friendly `wc-embed` facades; other iframes lazy-load.
 */
import { visit } from 'unist-util-visit';
import { resolveIcon } from '../icons.js';
import { embedInfo } from '../embed.js';
import { highlightLines } from '../highlighter.js';
import { parseCodeMeta } from '../code-meta.js';

const DEFAULT_CALLOUT_ICON = {
  info: 'info', tip: 'lightbulb', warning: 'triangle-alert', error: 'octagon-alert', danger: 'octagon-alert',
  success: 'circle-check', check: 'circle-check', note: 'pin', launch: 'rocket',
};

const FILE_ICON_BY_EXT = [
  [/\.(md|mdx|txt|rst|adoc)$/i, 'file-text'],
  [/\.(json|jsonc|json5)$/i, 'file-json'],
  [/\.(ya?ml|toml|ini|env|conf|cfg)$/i, 'file-cog'],
  [/\.(png|jpe?g|gif|webp|avif|svg|ico)$/i, 'file-image'],
  [/\.(js|jsx|mjs|cjs|ts|tsx|py|rb|go|rs|java|kt|php|c|h|cpp|cs|swift|sh|bash|css|scss|html|vue|svelte|sql)$/i, 'file-code'],
  [/\.(zip|tar|gz|tgz|rar|7z)$/i, 'file-archive'],
  [/\.(pdf|doc|docx)$/i, 'file-text'],
];

const el = (tagName, properties = {}, children = []) => ({ type: 'element', tagName, properties, children });
const raw = (value) => ({ type: 'raw', value });

function iconNodes(value, slot, iconType, extra = {}) {
  const r = resolveIcon(value, { iconType });
  if (r.kind === 'svg') return el('span', { slot, className: ['dl-icon'], ...extra }, [raw(r.svg)]);
  if (r.kind === 'emoji') return el('span', { slot, className: ['dl-icon', 'dl-emoji'], ...extra }, [{ type: 'text', value: r.text }]);
  if (r.kind === 'img') return el('span', { slot, className: ['dl-icon'], ...extra }, [el('img', { src: r.src, alt: '', loading: 'lazy', decoding: 'async' })]);
  return null;
}

function hasSlotChild(node, slot) {
  return (node.children || []).some((c) => c.type === 'element' && c.properties?.slot === slot);
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textOf = (n) => (n.type === 'text' || n.type === 'raw' ? n.value : (n.children || []).map(textOf).join(''));

/** Turn the fenced code blocks directly inside a wc-walkthrough into slotted file panels (per-line spans). */
function walkthroughFiles(node) {
  let idx = 0;
  node.children = (node.children || []).map((child) => {
    if (child.type !== 'element' || child.tagName !== 'pre') return child;
    const code = (child.children || []).find((c) => c.type === 'element' && c.tagName === 'code');
    if (!code) return child;
    const lang = String((code.properties?.className || []).find((c) => String(c).startsWith('language-')) || '').replace('language-', '');
    const meta = String(code.properties?.dataMeta || '');
    let name = '';
    try { name = parseCodeMeta(meta).filename || ''; } catch { /* ignore */ }
    const text = textOf(code).replace(/\n$/, '');
    let lines = null;
    try { lines = lang ? highlightLines(text, lang) : null; } catch { lines = null; }
    const html = (lines || text.split('\n').map((l) => `<span class="line">${escapeHtml(l)}</span>`))
      .map((l, i) => l.replace('<span class="line">', `<span class="line wl" data-n="${i + 1}">`)).join('');
    idx += 1;
    return el('div', { slot: 'files', className: ['wt-file'], 'data-name': name || lang || `file ${idx}`, 'data-lang': lang }, [raw(html)]);
  });
}

const slugify = (s) => String(s).toLowerCase().replace(/<[^>]*>/g, '').replace(/[`*_~]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');

export default function rehypeDocslitIcons() {
  return (tree) => {
    const usedIds = new Set();
    visit(tree, 'element', (n) => { if (n.properties?.id) usedIds.add(String(n.properties.id)); });
    const uniqueId = (base) => {
      let id = base || 'step';
      let i = 1;
      while (usedIds.has(id)) id = `${base}-${++i}`;
      usedIds.add(id);
      return id;
    };

    visit(tree, 'element', (node, index, parent) => {
      const tag = node.tagName;
      const p = node.properties || {};

      // ── images / iframes in the page body ─────────────────────────────────
      if (tag === 'img') {
        if (p.nozoom !== undefined || p.noZoom !== undefined || p['no-zoom'] !== undefined) {
          delete p.nozoom; delete p.noZoom;
          p['no-zoom'] = '';
          node.properties = p;
        } else if (parent?.type === 'element' && parent.tagName === 'a') {
          p['no-zoom'] = '';
        }
        return;
      }
      if (tag === 'iframe' && parent && index != null) {
        const info = embedInfo(String(p.src || ''));
        if (info && info.provider !== 'generic' && !p['data-keep-iframe']) {
          parent.children[index] = el('wc-embed', {
            src: String(p.src), title: String(p.title || ''),
          });
          return;
        }
        if (!p.loading) p.loading = 'lazy';
        if (!p.referrerpolicy && !p.referrerPolicy) p.referrerpolicy = 'strict-origin-when-cross-origin';
        node.properties = p;
        return;
      }

      if (!tag?.startsWith('wc-')) return;
      if (tag === 'wc-walkthrough') walkthroughFiles(node);
      if (tag === 'wc-github-repo' && !hasSlotChild(node, 'icon')) {
        const ico = iconNodes('fa-brands fa-github', 'icon');
        if (ico) node.children = [ico, ...(node.children || [])];
      }
      if (tag === 'wc-tile' || tag === 'wc-card' || tag === 'wc-button') {
        visit(node, 'element', (c) => { if (c.tagName === 'img') c.properties = { ...(c.properties || {}), 'no-zoom': '' }; });
      }
      if (tag === 'wc-update' && p.label && !p.id) node.properties.id = uniqueId(slugify(p.label));
      const iconType = p['icon-type'] ?? p.icontype;

      if (tag === 'wc-icon') {
        if (node.children?.some((c) => c.type === 'element' || c.type === 'raw')) return;
        const spec = p.name ?? p.icon ?? p.src;
        if (spec == null) return;
        const out = iconNodes(spec, undefined, iconType);
        if (out) node.children = [...out.children];
        return;
      }

      // ── callout default icons ────────────────────────────────────────────
      if (tag === 'wc-callout' || tag === 'wc-alert') {
        if (p.icon === undefined && p['icon-name'] === undefined) {
          const t = String(p.type || 'info');
          const ico = iconNodes(DEFAULT_CALLOUT_ICON[t] || 'info', 'icon');
          if (ico) node.children = [ico, ...(node.children || [])];
        }
      }

      // ── generic icon attributes → slotted inline SVG ─────────────────────
      for (const [attr, slot] of [['icon', 'icon'], ['icon-name', 'icon'], ['right-icon', 'icon-right']]) {
        const value = p[attr];
        if (value === undefined || value === true || value === '') continue;
        if (hasSlotChild(node, slot)) continue;
        const ico = iconNodes(String(value), slot, iconType);
        if (ico) node.children = [ico, ...(node.children || [])];
      }

      // ── file tree icons ──────────────────────────────────────────────────
      if (tag === 'wc-file' && p.icon === undefined && p.name) {
        const hit = FILE_ICON_BY_EXT.find(([re]) => re.test(String(p.name)));
        const ico = iconNodes(hit ? hit[1] : 'file', 'icon');
        if (ico) node.children = [ico, ...(node.children || [])];
      }
      if (tag === 'wc-dir') {
        const a = iconNodes('folder', 'icon');
        const b = iconNodes('folder-open', 'icon-open');
        node.children = [...[a, b].filter(Boolean), ...(node.children || [])];
      }

      // ── step titles as real headings ─────────────────────────────────────
      if (tag === 'wc-step' && p.title && !hasSlotChild(node, 'title')) {
        const size = String(p['title-size'] || (parent?.tagName === 'wc-steps' ? parent.properties?.['title-size'] : '') || 'p').toLowerCase();
        const level = /^h([2-4])$/.test(size) ? size : null;
        const id = uniqueId(String(p.id || slugify(p.title)));
        const head = el(level || 'div', { slot: 'title', className: ['dl-step-title'], ...(level ? { id } : {}) }, [{ type: 'text', value: String(p.title) }]);
        node.children = [head, ...(node.children || [])];
        if (level) node.properties['data-anchor'] = id;
        else node.properties.id = id;
      }
    });
  };
}
