/**
 * Validation of the navigation model (tabs, anchors, layout, navbar, contextual menu) and of
 * the navigation-related frontmatter keys. Returns plain descriptors; validate.js turns them
 * into issues. Codes are stable (machine consumers key on them).
 */
import path from 'path';
import fs from 'fs-extra';
import {
  collectIds, resolveSiteLayout, normalizeContextual, normalizeNavbarLink, resolveLayoutName,
  PAGE_LAYOUTS, fmGet, slugify,
} from './navigation.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const d = (level, code, message, fix) => ({ level, code, message, fix });

export const NAV_CODES = [
  'tabs-invalid', 'tab-invalid', 'tab-empty', 'tab-href-with-pages', 'tab-duplicate-name', 'tab-duplicate-page',
  'tab-landing-missing', 'tab-path-missing', 'tabs-sidebar-ignored', 'anchor-invalid', 'layout-invalid',
  'navbar-link-invalid', 'contextual-option-invalid', 'logo-invalid',
  'frontmatter-invalid-layout', 'frontmatter-invalid-toc-depth', 'frontmatter-unknown-tab',
  'frontmatter-invalid-flag', 'frontmatter-invalid-text',
];

/**
 * @param {object} raw     docslit.json as written (before expansion)
 * @param {object} config  the expanded/normalised config (tabs normalised, sidebar derived)
 * @param {string} dir     project directory
 */
export async function checkNavigation({ raw, config, dir }) {
  const out = [];
  if (!isObj(raw)) return out;

  if (raw.tabs !== undefined) {
    if (!Array.isArray(raw.tabs)) {
      out.push(d('error', 'tabs-invalid', '"tabs" must be an array of { "tab", "sidebar" | "href" } objects',
        'Use "tabs": [{ "tab": "Guides", "sidebar": [...] }]'));
    } else {
      raw.tabs.forEach((t, i) => {
        if (!isObj(t)) return; // reported as tab-invalid by the normaliser
        const name = String(t.tab ?? t.label ?? t.title ?? t.name ?? '').trim();
        if (!name) return; // reported as tab-invalid by the normaliser
        const hasHref = typeof t.href === 'string' && t.href.trim() !== '';
        if (hasHref && (t.sidebar !== undefined || t.path !== undefined)) {
          out.push(d('warning', 'tab-href-with-pages', `Tab "${name}" has both "href" and pages — the sidebar is ignored for link tabs`,
            'Use either "href" (external link tab) or "sidebar"/"path", not both'));
        }
        if (!hasHref && t.sidebar === undefined && t.path === undefined) {
          out.push(d('warning', 'tab-empty', `Tab "${name}" has no "sidebar", "path" or "href"`,
            `Give "${name}" a "sidebar" array, a "path" to autogenerate from, or an "href"`));
        }
        for (const [j, a] of (Array.isArray(t.anchors) ? t.anchors : []).entries()) {
          if (!isObj(a) || !(a.label || a.anchor || a.title || a.text) || !(a.href || a.url)) {
            out.push(d('warning', 'anchor-invalid', `Tab "${name}": anchors[${j}] needs a "label" and an "href"`, 'Write { "label": "Changelog", "href": "/changelog", "icon": "history" }'));
          }
        }
      });
    }
    if (Array.isArray(raw.tabs) && raw.tabs.length && raw.sidebar !== undefined) {
      out.push(d('warning', 'tabs-sidebar-ignored', 'Both "tabs" and a top-level "sidebar" are set — the top-level "sidebar" is ignored',
        'Move the groups into a tab\'s "sidebar" and remove the top-level "sidebar"'));
    }
  }

  if (Array.isArray(config?.tabs) && config.tabs.length) {
    const seenLabels = new Map();
    const owner = new Map();
    for (const tab of config.tabs) {
      const key = tab.label.toLowerCase();
      if (seenLabels.has(key)) {
        out.push(d('warning', 'tab-duplicate-name', `Two tabs are named "${tab.label}"`, 'Give each tab a distinct name'));
      }
      seenLabels.set(key, true);
      if (tab.href) continue;
      const ids = new Set();
      for (const g of tab.sidebar || []) for (const id of collectIds(g.pages || [])) ids.add(id);
      if (!ids.size) {
        out.push(d('warning', 'tab-empty', `Tab "${tab.label}" has no pages`, 'Add pages to its "sidebar" or point "path" at a docs/ folder that has pages'));
      }
      for (const id of ids) {
        if (owner.has(id) && owner.get(id) !== tab.label) {
          out.push(d('warning', 'tab-duplicate-page', `Page "${id}" is listed in two tabs ("${owner.get(id)}" and "${tab.label}")`,
            'A page can belong to one tab only — list it in the tab where it should be active'));
        } else owner.set(id, tab.label);
      }
      if (tab.landing && !ids.has(tab.landing)) {
        out.push(d('warning', 'tab-landing-missing', `Tab "${tab.label}": landing page "${tab.landing}" is not listed in that tab`,
          `Add "${tab.landing}" to the tab's sidebar or fix "landing"`));
      }
      if (tab.path && dir && !await fs.pathExists(path.join(dir, 'docs', tab.path))) {
        out.push(d('warning', 'tab-path-missing', `Tab "${tab.label}": directory docs/${tab.path} does not exist`, `Create docs/${tab.path} or fix the tab's "path"`));
      }
    }
  }

  for (const [j, a] of (Array.isArray(raw.anchors) ? raw.anchors : []).entries()) {
    if (!isObj(a) || !(a.label || a.anchor || a.title || a.text) || !(a.href || a.url)) {
      out.push(d('warning', 'anchor-invalid', `anchors[${j}] needs a "label" and an "href"`, 'Write { "label": "Changelog", "href": "/changelog", "icon": "history" }'));
    }
  }

  if (raw.layout !== undefined) {
    if (!isObj(raw.layout)) out.push(d('warning', 'layout-invalid', '"layout" must be an object', 'Use "layout": { "contentWidth": 720, "tabsPlacement": "header" }'));
    else for (const m of resolveSiteLayout(raw).issues) out.push(d('warning', 'layout-invalid', m, 'See `docslit schema` for the allowed "layout" values'));
  }

  if (isObj(raw.navbar)) {
    (Array.isArray(raw.navbar.links) ? raw.navbar.links : []).forEach((l, i) => {
      if (!normalizeNavbarLink(l)) out.push(d('warning', 'navbar-link-invalid', `navbar.links[${i}] is not usable (needs a label and href; dropdowns need links)`,
        'Write { "label": "Support", "href": "https://…" } or { "type": "dropdown", "label": "More", "links": [...] }'));
    });
    if (raw.navbar.primary !== undefined && !(isObj(raw.navbar.primary) && normalizeNavbarLink({ type: 'button', ...raw.navbar.primary }))) {
      out.push(d('warning', 'navbar-link-invalid', 'navbar.primary is not usable (needs a label and href)', 'Write "primary": { "type": "button", "label": "Get started", "href": "https://…" }'));
    }
  }

  if (raw.contextual !== undefined) {
    for (const m of normalizeContextual(raw.contextual).issues) {
      out.push(d('warning', 'contextual-option-invalid', m, 'Built-ins: copy, view-markdown, chatgpt, claude, perplexity, mcp — or { "title", "href" }'));
    }
  }

  if (isObj(raw.logo) && !(raw.logo.light || raw.logo.dark || raw.logo.text)) {
    out.push(d('warning', 'logo-invalid', '"logo" object needs "light" and/or "dark" (or "text")', 'Use "logo": { "light": "logo-light.svg", "dark": "logo-dark.svg" } or a path string'));
  }
  return out;
}

const FLAG_KEYS = ['hidden', 'noindex', 'hide_toc', 'hide_nav', 'hide_feedback', 'hide_actions', 'deprecated', 'searchable'];
const TEXT_KEYS = ['subtitle', 'eyebrow', 'badge', 'availability', 'headline'];

/** Navigation-related frontmatter checks for one page. `config` may be null. */
export function checkPageNavigation(data, config) {
  const out = [];
  if (!isObj(data)) return out;
  const layout = fmGet(data, 'layout', 'mode');
  if (layout !== undefined && typeof layout === 'string' && !resolveLayoutName(layout)) {
    out.push(d('warning', 'frontmatter-invalid-layout', `Unknown page layout "${layout}"`,
      `Use one of: ${PAGE_LAYOUTS.join(', ')} (aliases: default, reference, page / centre, custom / landing; feed layouts: changelog, blog, post)`));
  }
  const depth = fmGet(data, 'toc_depth', 'max_toc_depth');
  if (depth !== undefined && !(Number.isInteger(depth) && depth >= 2 && depth <= 6)) {
    out.push(d('warning', 'frontmatter-invalid-toc-depth', `"toc_depth" must be a whole number from 2 to 6, got ${JSON.stringify(depth)}`, 'Use toc_depth: 3 (h2 and h3)'));
  }
  for (const key of FLAG_KEYS) {
    const v = fmGet(data, key);
    if (v !== undefined && typeof v !== 'boolean') {
      out.push(d('warning', 'frontmatter-invalid-flag', `"${key}" must be true or false, got ${JSON.stringify(v)}`, `Write ${key}: true`));
    }
  }
  for (const key of TEXT_KEYS) {
    const v = fmGet(data, key);
    if (v !== undefined && typeof v !== 'string') {
      out.push(d('warning', 'frontmatter-invalid-text', `"${key}" must be a string, got ${typeof v}`, `Quote the value: ${key}: "…"`));
    }
  }
  const tab = fmGet(data, 'tab');
  if (tab !== undefined && Array.isArray(config?.tabs) && config.tabs.length) {
    const w = slugify(tab);
    if (!config.tabs.some((t) => !t.href && (t.id === w || slugify(t.label) === w))) {
      out.push(d('warning', 'frontmatter-unknown-tab', `"tab: ${tab}" does not match any tab in docslit.json`,
        `Use one of: ${config.tabs.filter((t) => !t.href).map((t) => t.label).join(', ')}`));
    }
  }
  return out;
}
