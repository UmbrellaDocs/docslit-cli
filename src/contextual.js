/**
 * Contextual page menu ("Copy page" split button + dropdown).
 *
 * The rendering logic is a plain-JS string (CONTEXTUAL_RUNTIME) that ships to the browser
 * (dev/offline page loads and the TOC panel render the menu client-side) and is also
 * evaluated here, so the statically rendered menu and the client-rendered one cannot drift.
 *
 * Site config (docslit.json) and page frontmatter:
 *   "contextual": ["copy", "view-markdown", "chatgpt", "claude", "perplexity", "mcp",
 *                  { "title": "Open in Linear", "description": "…", "icon": "link",
 *                    "href": "https://linear.app/new?title={title}&description={url}" }]
 *   "contextual": { "options": [...] }   |   "contextual": false
 * Placeholders in custom hrefs: {url} (page URL), {markdown_url}, {title}, {path} — URL-encoded.
 * ChatGPT / Claude / Perplexity / MCP need `url` in docslit.json (they link to the published page).
 */

const CHATGPT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>';
const CLAUDE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-10.985c.2-.497.378-.878.575-1.14.208-.277.503-.497.916-.497.414 0 .709.22.917.497.197.262.375.643.575 1.14L16.1 15.432l.055.137c.15.374.278.697.343.987.07.313.077.622-.046.925a1.494 1.494 0 01-.644.72c-.272.161-.576.203-.893.196-.294-.006-.64-.058-1.028-.118l-.147-.023-3.408-.537a3.22 3.22 0 00-.503-.042c-.17 0-.34.014-.504.042l-3.408.537-.146.023c-.389.06-.735.112-1.028.118-.318.007-.622-.035-.894-.197a1.494 1.494 0 01-.644-.72c-.123-.302-.117-.611-.046-.924.065-.29.193-.613.343-.987l.055-.137zM17.584 18.01c-.04.03-.068.073-.08.122a.228.228 0 00.017.148l.96 2.122c.083.183.15.303.217.386.077.096.175.212.35.212.177 0 .274-.116.351-.212.068-.083.134-.203.217-.386l.96-2.122a.228.228 0 00.017-.148.228.228 0 00-.08-.122l-1.688-1.374a.219.219 0 00-.138-.049.219.219 0 00-.139.049l-1.688 1.374z"/></svg>';

export const CONTEXTUAL_RUNTIME = String.raw`
var __DL_CTX_ICONS = {
  copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  file: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>',
  mcp: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  chatgpt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>',
  claude: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.397-10.985c.2-.497.378-.878.575-1.14.208-.277.503-.497.916-.497.414 0 .709.22.917.497.197.262.375.643.575 1.14L16.1 15.432l.055.137c.15.374.278.697.343.987.07.313.077.622-.046.925a1.494 1.494 0 01-.644.72c-.272.161-.576.203-.893.196-.294-.006-.64-.058-1.028-.118l-.147-.023-3.408-.537a3.22 3.22 0 00-.503-.042c-.17 0-.34.014-.504.042l-3.408.537-.146.023c-.389.06-.735.112-1.028.118-.318.007-.622-.035-.894-.197a1.494 1.494 0 01-.644-.72c-.123-.302-.117-.611-.046-.924.065-.29.193-.613.343-.987l.055-.137zM17.584 18.01c-.04.03-.068.073-.08.122a.228.228 0 00.017.148l.96 2.122c.083.183.15.303.217.386.077.096.175.212.35.212.177 0 .274-.116.351-.212.068-.083.134-.203.217-.386l.96-2.122a.228.228 0 00.017-.148.228.228 0 00-.08-.122l-1.688-1.374a.219.219 0 00-.138-.049.219.219 0 00-.139.049l-1.688 1.374z"/></svg>'
};
function __dlCtxEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function __dlCtxFill(tpl, vars) {
  return String(tpl).replace(/\{(url|markdown_url|title|path)\}/g, function (_, k) { return encodeURIComponent(vars[k] || ''); });
}
var __DL_CTX_BUILTIN = {
  copy: { title: 'Copy page', desc: 'Copy page as Markdown for LLMs', icon: 'copy', action: 'copy' },
  'view-markdown': { title: 'View as Markdown', desc: 'Open this page as plain Markdown', icon: 'file', action: 'view', arrow: true },
  chatgpt: { title: 'Open in ChatGPT', desc: 'Ask questions about this page', icon: 'chatgpt', href: 'https://chatgpt.com/?q={prompt}', needsUrl: true },
  claude: { title: 'Open in Claude', desc: 'Ask questions about this page', icon: 'claude', href: 'https://claude.ai/new?q={prompt}', needsUrl: true },
  perplexity: { title: 'Open in Perplexity', desc: 'Ask questions about this page', icon: 'search', href: 'https://www.perplexity.ai/search?q={prompt}', needsUrl: true },
  mcp: { title: 'Copy MCP install command', desc: 'Copy npx command to install MCP server', icon: 'mcp', action: 'mcp', needsUrl: true }
};
/**
 * options: array of built-in ids ("copy", …) or custom { title, description, icon, href }.
 * ctx: { siteUrl, pageUrl, markdownUrl, title, path, iconHtml(name) -> svg|'' }.
 * Returns descriptors: { id, title, desc, iconHtml, action?, href?, external?, arrow? }.
 */
function dlContextualItems(options, ctx) {
  var out = [];
  var siteUrl = ctx.siteUrl || '';
  var pageUrl = ctx.pageUrl || '';
  var prompt = pageUrl ? 'Read from ' + pageUrl + ' so I can ask questions about it.' : '';
  for (var i = 0; i < (options || []).length; i++) {
    var o = options[i];
    var id = typeof o === 'string' ? o : (o && o.id) || '';
    if (id && id !== 'custom' && __DL_CTX_BUILTIN[id]) {
      var b = __DL_CTX_BUILTIN[id];
      if (b.needsUrl && !siteUrl) continue;
      var item = { id: id, title: b.title, desc: b.desc, iconHtml: __DL_CTX_ICONS[b.icon] || '' };
      if (b.action) item.action = b.action;
      if (b.arrow) item.arrow = true;
      if (b.href) { item.href = b.href.replace('{prompt}', encodeURIComponent(prompt)); item.external = true; item.arrow = true; }
      out.push(item);
    } else if (o && typeof o === 'object' && o.title && o.href) {
      var icon = o.iconHtml || '';
      if (!icon && o.icon) icon = (ctx.iconHtml && ctx.iconHtml(o.icon)) || __DL_CTX_ICONS[o.icon] || '';
      if (!icon) icon = __DL_CTX_ICONS.link;
      var href = __dlCtxFill(o.href, { url: pageUrl, markdown_url: ctx.markdownUrl, title: ctx.title, path: ctx.path });
      out.push({ id: 'custom', title: o.title, desc: o.description || '', iconHtml: icon, href: href, external: /^https?:/i.test(href), arrow: /^https?:/i.test(href) });
    }
  }
  return out;
}
function dlContextualItemHtml(it) {
  var icon = '<span class="copy-page-item-icon">' + it.iconHtml + '</span>';
  var arrow = it.arrow ? ' <span class="copy-page-arrow">↗</span>' : '';
  var text = '<span class="copy-page-item-text"><span class="copy-page-item-title">' + __dlCtxEsc(it.title) + arrow + '</span>' +
    (it.desc ? '<span class="copy-page-item-desc">' + __dlCtxEsc(it.desc) + '</span>' : '') + '</span>';
  if (it.href) {
    return '<a class="copy-page-item" role="menuitem" href="' + __dlCtxEsc(it.href) + '"' + (it.external ? ' target="_blank" rel="noopener"' : '') + '>' + icon + text + '</a>';
  }
  return '<button type="button" class="copy-page-item" role="menuitem" data-action="' + __dlCtxEsc(it.action || '') + '">' + icon + text + '</button>';
}
function dlContextualItemsHtml(items) {
  var h = '';
  for (var i = 0; i < items.length; i++) h += dlContextualItemHtml(items[i]);
  return h;
}
// The split button: first option is the primary action, the chevron opens the full list.
function dlContextualMenuHtml(items) {
  if (!items || !items.length) return '';
  var first = items[0];
  var small = String(first.iconHtml || '').replace(/width="16" height="16"/, 'width="14" height="14"');
  var label = first.id === 'copy' ? 'Copy page' : __dlCtxEsc(first.title);
  var main;
  if (first.href) {
    main = '<a class="meta-btn copy-page-main" href="' + __dlCtxEsc(first.href) + '"' + (first.external ? ' target="_blank" rel="noopener"' : '') + '>' + small + ' ' + label + '</a>';
  } else {
    main = '<button type="button" class="meta-btn copy-page-main" data-action="' + __dlCtxEsc(first.action || '') + '"' + (first.id === 'copy' ? ' title="Copy page as Markdown"' : '') + '>' + small + ' ' + label + '</button>';
  }
  var chevron = '<span class="copy-page-chevron" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>';
  return '<div class="copy-page-menu">' + main +
    '<button type="button" class="meta-btn copy-page-toggle" aria-haspopup="true" aria-expanded="false" aria-label="More page actions">' + chevron + '</button>' +
    '<div class="copy-page-dropdown" role="menu" hidden>' + dlContextualItemsHtml(items) + '</div></div>';
}
`;

// Evaluate the same source on the server so static and client rendering share one implementation.
const api = new Function(`${CONTEXTUAL_RUNTIME}; return { dlContextualItems, dlContextualItemsHtml, dlContextualMenuHtml };`)();

export const contextualItems = api.dlContextualItems;
export const contextualItemsHtml = api.dlContextualItemsHtml;
export const contextualMenuHtml = api.dlContextualMenuHtml;
