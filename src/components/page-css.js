// Page-level (light DOM) CSS for the content components: pre-upgrade layout reservation (no layout
// shift when the custom elements upgrade), slotted icon/heading/code styling, and sticky tables.
// Interpolated into the site stylesheet by template.js. Only theme variables are used for colour.

export const componentPageCss = `
/* ── theme pinning: <wc-* theme="dark|light"> re-declares the theme variables on the host (inherited into its shadow DOM) ── */
[theme="dark"] { --bg: #0a0a0a; --surface: #111; --surface2: #1a1a1a; --surface3: #222; --border: #2a2a2a; --border2: #3a3a3a; --text: #f0f0f0; --text2: #a0a0a0; --text3: #8a8a8a; --code-bg: #161616; --code-text: #e2e8f0; }
[theme="light"] { --bg: #fff; --surface: #f8f8f8; --surface2: #f0f0f0; --surface3: #e8e8e8; --border: #e2e2e2; --border2: #d0d0d0; --text: #0f0f0f; --text2: #555; --text3: #737373; --code-bg: #f6f8fa; --code-text: #24292f; }
/* ── content components: icons, headings, scroll margins ── */
.dl-icon svg { width: 1em; height: 1em; }
.dl-icon img { width: 100%; height: 100%; min-width: 1em; min-height: 1em; object-fit: contain; display: block; border-radius: 0; margin: 0; }
:is(:not(:defined),[data-dl-defer]) > [slot="icon"], :is(:not(:defined),[data-dl-defer]) > [slot="icon-right"], :is(:not(:defined),[data-dl-defer]) > [slot="icon-open"] { display: none; }
wc-step, wc-update, wc-accordion, wc-expandable, wc-tab, wc-walkthrough-step { scroll-margin-top: calc(var(--chrome-h, 60px) + 16px); }
wc-embed, wc-github-repo, wc-walkthrough, wc-colors { display: block; margin-bottom: 20px; }
.docs-content wc-step > .dl-step-title { margin: 0; padding: 0; border: 0; font-size: 1rem; font-weight: 700; line-height: 1.4; color: var(--text); }
.docs-content wc-step > h2.dl-step-title { font-size: 1.4rem; }
.docs-content wc-step > h3.dl-step-title { font-size: 1.2rem; }
.docs-content wc-step > h4.dl-step-title { font-size: 1.05rem; }
wc-step:is(:not(:defined),[data-dl-defer]) { display: block; position: relative; min-height: 32px; padding: 0 0 28px 48px; }
wc-step:is(:not(:defined),[data-dl-defer])::before { content: ''; position: absolute; left: 0; top: 0; width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--accent); background: var(--accent-dim); }

/* host spacing: the global reset (margin/padding 0) beats :host rules, so spacing lives here */
wc-tiles, wc-accordion-group, wc-update { margin-bottom: 20px; }
wc-update > :first-child { margin-top: 0 !important; }
wc-image { display: block; margin: 1rem 0; }
wc-responses, wc-playground { display: block; margin-bottom: 20px; }
wc-api-examples { display: block; margin-bottom: 24px; }
wc-color:not([data-v]) { margin: 8px 8px 8px 0; }
wc-aside { margin: 0 0 20px 28px; }
@media (max-width: 900px) { wc-aside { margin: 16px 0; } }

/* ── pre-upgrade boxes ── */
wc-callout:is(:not(:defined),[data-dl-defer]), wc-alert:is(:not(:defined),[data-dl-defer]) { padding: 16px 20px; border: 1px solid var(--border); border-radius: var(--r-lg,10px); min-height: 58px; box-sizing: border-box; }
wc-card:is(:not(:defined),[data-dl-defer]) { padding: 22px; border: 1px solid var(--border); border-radius: var(--r-xl,12px); background: var(--surface); min-height: 96px; box-sizing: border-box; }
wc-accordion:is(:not(:defined),[data-dl-defer]), wc-expandable:is(:not(:defined),[data-dl-defer]) { border: 1px solid var(--border); border-radius: var(--r-lg,10px); box-sizing: border-box; }
wc-accordion:is(:not(:defined),[data-dl-defer]):not([open]) > *, wc-expandable:is(:not(:defined),[data-dl-defer]):not([open]) > * { display: none; }
wc-github-repo:is(:not(:defined),[data-dl-defer]) { min-height: 112px; max-width: 520px; }
wc-embed { aspect-ratio: 16 / 9; width: 100%; }
wc-embed[ratio="4/3"], wc-embed[ratio="4:3"] { aspect-ratio: 4 / 3; }
wc-embed[ratio="1/1"], wc-embed[ratio="1:1"] { aspect-ratio: 1 / 1; }
wc-embed[ratio="21/9"], wc-embed[ratio="21:9"] { aspect-ratio: 21 / 9; }
wc-embed[ratio="9/16"], wc-embed[ratio="9:16"] { aspect-ratio: 9 / 16; max-width: 360px; }
wc-embed[height] { aspect-ratio: auto; }
wc-embed:is(:not(:defined),[data-dl-defer]) { background: var(--surface2); border: 1px solid var(--border); border-radius: var(--r-lg,10px); box-sizing: border-box; overflow: hidden; }
wc-embed:is(:not(:defined),[data-dl-defer]) > a { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--accent-light); }
wc-update:is(:not(:defined),[data-dl-defer]) { min-height: 64px; }
wc-colors:is(:not(:defined),[data-dl-defer]) { min-height: 80px; }

/* ── tables: sticky header + search ── */
wc-table[sticky] th { position: sticky; top: 0; z-index: 2; background: var(--surface2); }
wc-table > table, wc-table .table-wrap > table { margin: 0; }
wc-table .table-wrap { overflow: visible; margin: 0; }

/* ── scroll walkthrough ── */
.wt-file { font-family: var(--font-mono, monospace); font-size: 13px; line-height: 1.65; color: var(--code-text, #e2e8f0); padding: 12px 0; white-space: pre; background: var(--code-bg, #161616); }
.wt-file[hidden] { display: none; }
.wt-file .wl { display: block; min-height: 1.65em; padding-right: 16px; transition: opacity .2s, background .2s; }
.wt-file .wl::before, .wt-inline .wl::before { content: attr(data-n); display: inline-block; width: 3em; padding-right: 1.1em; text-align: right; color: var(--text3); user-select: none; }
.wt-file .wl.dim { opacity: .35; }
.wt-file .wl.hl { background: var(--accent-dim2); }
html.light .wt-file .line span, html.light .wt-inline .line span { color: var(--shiki-light) !important; }
.wt-inline { display: none; margin: 10px 0 4px; border: 1px solid var(--border); border-radius: var(--r-md,8px); overflow: hidden; background: var(--code-bg, #161616); }
.wt-inline-name { padding: 6px 12px; font: 500 12px var(--font-mono, monospace); color: var(--text3); border-bottom: 1px solid var(--border); background: var(--surface2); }
.wt-inline pre { margin: 0; padding: 10px 0; overflow-x: auto; font: 13px/1.65 var(--font-mono, monospace); color: var(--code-text, #e2e8f0); background: none; border: 0; }
.wt-inline .wl { display: block; }
wc-walkthrough:is(:not(:defined),[data-dl-defer]) { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 32px; align-items: start; }
wc-walkthrough:is(:not(:defined),[data-dl-defer]) > wc-walkthrough-step { grid-column: 1; }
wc-walkthrough:is(:not(:defined),[data-dl-defer]) > .wt-file { grid-column: 2; grid-row: 1 / span 40; border: 1px solid var(--border); border-radius: var(--r-lg,10px); overflow: auto; max-height: min(70vh, 34rem); }
wc-walkthrough:is(:not(:defined),[data-dl-defer]) > .wt-file ~ .wt-file { display: none; }
@media (max-width: 900px) {
  wc-walkthrough .wt-inline { display: block; }
  wc-walkthrough:is(:not(:defined),[data-dl-defer]) { display: block; }
  wc-walkthrough > .wt-file { display: none !important; }
}
@media (prefers-reduced-motion: reduce) { .wt-file .wl { transition: none; } }
@media print { .wt-inline { display: block; } wc-walkthrough > .wt-file { display: none !important; } }
`;
