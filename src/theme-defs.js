// Theme registry. A THEME is a complete look: typography, shape, elevation and chrome styling, expressed
// as design tokens (see theme-tokens.js) plus a small structural CSS block scoped to
// html[data-theme-name="<id>"]. A PALETTE (colours, light + dark) is chosen independently; each theme only
// names a signature palette. Themes are original designs "inspired by" a visual style; no third-party
// assets, names or markup are used. Fonts are open-licensed (OFL / Apache) and always have system fallbacks.

import { tonalScheme, withAlpha, hex, parseColor } from './color.js';

/** @typedef {{
 *   id: string, label: string, description: string, palette: string, appearance?: 'system'|'light'|'dark',
 *   fonts: { sans: string, heading?: string, mono: string, google?: string[], fallbacks?: Array<{family:string, local:string, sizeAdjust:string, ascent:string, descent:string}> },
 *   tokens: Record<string,string>, light?: Record<string,string>, dark?: Record<string,string>,
 *   css?: string, layout?: Record<string, any>, derive?: 'tonal',
 * }} ThemeDef */

const SYS_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const SYS_MONO = "ui-monospace, 'SF Mono', 'Cascadia Code', 'Fira Code', Menlo, Consolas, monospace";

const MONO_JB = `'JetBrains Mono', 'JetBrains-fallback', ${SYS_MONO}`;

/** @type {Record<string, ThemeDef>} */
export const THEMES = {
  default: {
    id: 'default',
    label: 'Default',
    description: 'The classic DocsLit look: dark-first, flat surfaces, full-height sidebar with an accent bar.',
    palette: 'teal',
    fonts: { sans: '', mono: '' }, // unchanged: base stylesheet values
    tokens: {},
  },

  peppermint: {
    id: 'peppermint',
    label: 'Peppermint',
    description: 'Clean, airy SaaS-docs look: fresh green, soft borders, rounded cards, pill tabs under a frosted header, open sidebar.',
    palette: 'mint',
    fonts: {
      sans: `'Inter', 'Inter-fallback', ${SYS_SANS}`,
      mono: MONO_JB,
      google: ['Inter:wght@400;500;600;700', 'JetBrains+Mono:wght@400;500;600'],
    },
    layout: { showDescription: true },
    tune: (p) => ({ ...p, sidebarBg: p.bg }),
    tokens: {
      '--radius': '10px', '--radius-lg': '16px',
      '--r-xs': '6px', '--r-sm': '8px', '--r-md': '10px', '--r-lg': '14px', '--r-xl': '16px', '--r-pill': '999px',
      '--nav-h': '60px', '--tabs-bar-h': '46px', '--sidebar-w': '280px', '--content-text-w': '700px', '--toc-w': '224px',
      '--nav-bg': 'color-mix(in srgb, var(--bg) 78%, transparent)', '--nav-blur': '18px',
      '--nav-border': 'color-mix(in srgb, var(--border) 65%, transparent)',
      '--tabs-bar-bg': 'color-mix(in srgb, var(--bg) 78%, transparent)',
      '--sidebar-border-w': '0px',
      '--sidebar-fs': '14.5px', '--sidebar-item-pad-y': '6px', '--sb-item-lh': '1.45', '--sb-item-radius': '10px', '--sb-item-mx': '12px', '--sb-item-pl': '12px', '--sb-group-pl': '24px', '--sb-bar-w': '0px',
      '--sb-active-bg': 'var(--accent-dim)', '--sb-active-fg': 'var(--accent-light)', '--sb-active-weight': '600',
      '--sb-group-fs': '13px', '--sb-group-weight': '600', '--sb-group-transform': 'none', '--sb-group-tracking': '0', '--sb-group-color': 'var(--text)',
      '--sb-group-pt': '22px', '--sb-group-pb': '6px',
      '--toc-fs': '13px', '--toc-title-fs': '13px', '--toc-title-transform': 'none', '--toc-title-tracking': '0', '--toc-line': 'color-mix(in srgb, var(--border) 80%, transparent)', '--toc-bar-w': '2px',
      '--content-fs': '1rem', '--body-lh': '1.7', '--p-mb': '18px', '--li-mb': '6px',
      '--h1-size': '2.5rem', '--h1-size-md': '2.125rem', '--h1-size-sm': '1.75rem', '--h1-size-xs': '1.625rem', '--h1-weight': '650', '--h1-tracking': '-.03em', '--h1-lh': '1.12', '--h1-mb': '14px',
      '--h2-size': '1.625rem', '--h2-size-md': '1.5rem', '--h2-size-sm': '1.375rem', '--h2-weight': '650', '--h2-tracking': '-.022em', '--h2-lh': '1.25', '--h2-mt': '52px', '--h2-mb': '14px',
      '--h3-size': '1.25rem', '--h3-size-md': '1.1875rem', '--h3-size-sm': '1.125rem', '--h3-weight': '650', '--h3-tracking': '-.015em', '--h3-lh': '1.35', '--h3-mt': '36px', '--h3-mb': '10px',
      '--h4-size': '1.0625rem', '--h4-weight': '650', '--h4-tracking': '-.01em', '--h4-mt': '28px',
      '--logo-weight': '650',
      '--heading-features': "'cv11', 'ss03'",
      '--link-underline-color': 'color-mix(in srgb, var(--accent-light) 38%, transparent)', '--link-underline-offset': '3px',
      '--inline-code-bg': 'color-mix(in srgb, var(--accent) 7%, var(--bg))', '--inline-code-border': 'color-mix(in srgb, var(--accent) 16%, var(--border))', '--inline-code-fs': '.85em',
      '--code-radius': '14px', '--code-border': 'color-mix(in srgb, var(--border) 85%, transparent)', '--code-bar-bg': 'var(--surface)', '--code-head-h': '42px', '--code-block-fs': '13.5px', '--code-fs': '13.5px',
      '--card-bg': 'color-mix(in srgb, var(--accent) 3%, var(--bg))', '--card-border': 'var(--border)', '--card-radius': '18px', '--card-pad': '22px',
      '--card-shadow': '0 1px 2px color-mix(in srgb, var(--text) 5%, transparent)',
      '--card-shadow-hover': '0 10px 28px -10px color-mix(in srgb, var(--accent) 38%, transparent)', '--card-border-hover': 'color-mix(in srgb, var(--accent) 45%, var(--border))', '--card-lift': '-2px',
      '--card-title-weight': '650',
      '--callout-radius': '14px', '--callout-bg-mix': '8%', '--callout-border-mix': '22%', '--callout-bar-mix': '22%',
      '--table-radius': '14px', '--table-head-bg': 'color-mix(in srgb, var(--accent) 4%, var(--surface))', '--table-fs': '14.5px', '--table-col-line-w': '0px', '--table-pad-y': '12px',
      '--shadow-modal': '0 24px 70px -12px rgba(8,20,14,.35)',
      '--control-radius': '999px', '--btn-filled-hover-bg': 'color-mix(in srgb, var(--accent) 88%, var(--text))',
      '--badge-radius': '999px',
      '--page-bg-image': 'radial-gradient(900px 340px at 50% -120px, color-mix(in srgb, var(--accent) 9%, transparent), transparent 72%)',
      '--focus-w': '2px',
    },
    css: `
& .search-trigger, & .theme-btn, & .a11y-btn, & .version-select, & .locale-switcher, & .nav-btn { border-radius: 999px; }
& .search-trigger { background: color-mix(in srgb, var(--surface2) 60%, transparent); padding: 0 14px; }
& .nav-tabs-list { align-items: center; gap: 4px; }
& .nav-tab { height: calc(var(--tabs-bar-h) - 12px); padding: 0 14px; border-radius: 999px; }
& .nav-tab::after { display: none; }
& .nav-tab:hover { background: var(--surface2); }
& .nav-tab.active { background: var(--accent-dim); color: var(--accent-light); }
& .nav-tabs-bar { border-bottom-color: color-mix(in srgb, var(--border) 65%, transparent); }
& .docs-nav-top { border-bottom-color: transparent; box-shadow: 100vw 0 0 0 var(--bg); }
& .docs-sidebar { box-shadow: none; }
& .sidebar-item { margin-bottom: 1px; }
& .sidebar-subgroup { border-left-color: color-mix(in srgb, var(--border) 80%, transparent); }
& .docs-content .page-subtitle { font-size: 1.1875rem; color: var(--text2); margin-top: 0; }
& .docs-content h1 { margin-top: 4px; }
& .toc-item.active { background: none; }
& .page-nav-btn:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); background: color-mix(in srgb, var(--accent) 4%, var(--bg)); }
& .docs-content a { font-weight: 500; }
& .docs-content blockquote { border-radius: 0 14px 14px 0; background: color-mix(in srgb, var(--accent) 5%, var(--bg)); }
& .docs-content img { border-radius: 14px; }
& .site-footer { background: transparent; }
& .announcement-banner { border-bottom-width: 0; }
`,
  },

  frond: {
    id: 'frond',
    label: 'Frond',
    description: 'Crisp, technical look: strong type hierarchy, monochrome surfaces with one accent, sharp radii and hairline borders.',
    palette: 'ink',
    fonts: {
      sans: `'Inter', 'Inter-fallback', ${SYS_SANS}`,
      mono: MONO_JB,
      google: ['Inter:wght@400;500;600;700', 'JetBrains+Mono:wght@400;500;600'],
    },
    tune: (p) => ({ ...p, sidebarBg: p.bg }),
    tokens: {
      '--radius': '6px', '--radius-lg': '8px',
      '--r-xs': '3px', '--r-sm': '4px', '--r-md': '6px', '--r-lg': '8px', '--r-xl': '10px', '--r-pill': '999px',
      '--nav-h': '56px', '--tabs-bar-h': '42px', '--sidebar-w': '272px', '--content-text-w': '704px', '--toc-w': '208px',
      '--nav-bg': 'color-mix(in srgb, var(--bg) 94%, transparent)', '--nav-blur': '8px', '--nav-border': 'var(--border)',
      '--sidebar-border': 'var(--border)',
      '--sidebar-fs': '14px', '--sidebar-item-pad-y': '6px', '--sb-item-lh': '1.4', '--sb-item-radius': '6px', '--sb-item-mx': '10px', '--sb-item-pl': '12px', '--sb-group-pl': '22px', '--sb-bar-w': '0px',
      '--sb-active-bg': 'var(--accent-dim)', '--sb-active-fg': 'var(--accent-light)', '--sb-active-weight': '500',
      '--sb-group-fs': '13.5px', '--sb-group-weight': '650', '--sb-group-transform': 'none', '--sb-group-tracking': '-.005em', '--sb-group-color': 'var(--text)',
      '--sb-group-pt': '22px', '--sb-group-pb': '6px',
      '--toc-fs': '13px', '--toc-title-fs': '13px', '--toc-title-transform': 'none', '--toc-title-tracking': '0', '--toc-line': 'var(--border)', '--toc-bar-w': '2px',
      '--body-lh': '1.65', '--p-mb': '16px',
      '--h1-size': '2.5rem', '--h1-size-md': '2.125rem', '--h1-size-sm': '1.75rem', '--h1-size-xs': '1.625rem', '--h1-weight': '650', '--h1-tracking': '-.035em', '--h1-lh': '1.1', '--h1-mb': '16px',
      '--h2-size': '1.625rem', '--h2-size-md': '1.5rem', '--h2-size-sm': '1.375rem', '--h2-weight': '650', '--h2-tracking': '-.025em', '--h2-lh': '1.25', '--h2-mt': '48px', '--h2-mb': '14px',
      '--h3-size': '1.1875rem', '--h3-size-md': '1.125rem', '--h3-size-sm': '1.0625rem', '--h3-weight': '650', '--h3-tracking': '-.015em', '--h3-lh': '1.35', '--h3-mt': '34px', '--h3-mb': '10px',
      '--h4-size': '1rem', '--h4-weight': '650', '--h4-tracking': '-.005em', '--h4-mt': '26px',
      '--heading-features': "'cv11'",
      '--logo-weight': '650',
      '--link-underline-color': 'color-mix(in srgb, var(--accent-light) 30%, transparent)', '--link-underline-offset': '2px',
      '--inline-code-bg': 'var(--surface2)', '--inline-code-border': 'var(--border)', '--inline-code-color': 'var(--text)', '--inline-code-fs': '.84em',
      '--code-radius': '8px', '--code-block-fs': '13px', '--code-head-h': '38px',
      '--card-bg': 'var(--bg)', '--card-border': 'var(--border)', '--card-radius': '10px', '--card-pad': '20px', '--card-shadow': 'none',
      '--card-shadow-hover': 'none', '--card-border-hover': 'color-mix(in srgb, var(--accent) 55%, var(--border))', '--card-lift': '0px',
      '--card-title-fs': '15px', '--card-title-weight': '650',
      '--callout-radius': '8px', '--callout-bg-mix': '6%', '--callout-border-mix': '26%', '--callout-bar-mix': '26%',
      '--table-radius': '8px', '--table-head-bg': 'var(--surface)', '--table-fs': '14px', '--table-pad-y': '10px',
      '--shadow-modal': '0 18px 48px -8px rgba(0,0,0,.28)',
      '--control-radius': '6px',
      '--badge-radius': '6px',
      '--focus-w': '2px',
    },
    css: `
& .nav-tab { font-weight: 500; }
& .nav-tabs-bar { background: var(--bg); backdrop-filter: none; -webkit-backdrop-filter: none; }
& .docs-sidebar { box-shadow: none; }
& .sidebar-item.active { font-weight: 550; }
& .docs-content .page-eyebrow { font-size: 12.5px; font-weight: 650; letter-spacing: .01em; text-transform: none; margin-bottom: 8px; }
& .docs-content .page-subtitle { font-size: 1.0625rem; margin-top: 0; }
& .docs-content h2 { padding-top: 0; }
& .docs-content h1 + .page-meta, & .page-meta { border-bottom-color: var(--border); }
& .page-meta { padding-bottom: 18px; }
& .docs-content kbd { border-radius: 4px; }
& .docs-content blockquote { border-radius: 0 8px 8px 0; background: var(--surface); }
& .docs-content hr { margin: 36px 0; }
& .page-nav-btn:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); background: transparent; }
& .search-trigger { background: var(--bg); }
& .search-trigger:hover { background: var(--surface); }
& .toc-item { padding-top: 3px; padding-bottom: 3px; }
`,
  },

  tonal: {
    id: 'tonal',
    label: 'Tonal',
    description: 'Material 3-inspired: surfaces and accents derived from one seed colour, pill indicators, rounded shapes, state layers and strong focus rings.',
    palette: 'iris',
    derive: 'tonal',
    fonts: {
      sans: `'Roboto', 'Roboto-fallback', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', sans-serif`,
      mono: `'Roboto Mono', 'Roboto-Mono-fallback', ${SYS_MONO}`,
      google: ['Roboto:wght@400;500;700', 'Roboto+Mono:wght@400;500'],
      fallbacks: [{ family: 'Roboto-fallback', local: 'Arial', sizeAdjust: '100.54%', ascent: '92.5%', descent: '23.87%' }, { family: 'Roboto-Mono-fallback', local: 'Courier New', sizeAdjust: '100%', ascent: '105%', descent: '27%' }],
    },
    tokens: {
      '--radius': '12px', '--radius-lg': '20px',
      '--r-xs': '8px', '--r-sm': '10px', '--r-md': '12px', '--r-lg': '16px', '--r-xl': '20px', '--r-pill': '999px',
      '--nav-h': '64px', '--tabs-bar-h': '48px', '--sidebar-w': '288px', '--content-text-w': '700px', '--toc-w': '224px',
      '--nav-bg': 'var(--surface)', '--nav-blur': '0px', '--nav-border': 'transparent',
      '--tabs-bar-bg': 'var(--surface)',
      '--sidebar-border-w': '0px',
      '--sidebar-fs': '14px', '--sidebar-item-pad-y': '10px', '--sb-item-lh': '1.3', '--sb-item-radius': '999px', '--sb-item-mx': '12px', '--sb-item-pl': '16px', '--sb-group-pl': '28px', '--sb-bar-w': '0px',
      '--sb-active-bg': 'var(--accent-dim2)', '--sb-active-fg': 'var(--text)', '--sb-active-weight': '600',
      '--sb-hover-bg': 'color-mix(in srgb, var(--text) 8%, transparent)',
      '--sb-group-fs': '14px', '--sb-group-weight': '500', '--sb-group-transform': 'none', '--sb-group-tracking': '.01em', '--sb-group-color': 'var(--text2)',
      '--sb-group-pt': '24px', '--sb-group-pb': '8px',
      '--toc-fs': '13px', '--toc-title-fs': '12px', '--toc-title-transform': 'none', '--toc-title-tracking': '.04em', '--toc-line': 'var(--border)', '--toc-bar-w': '3px',
      '--toc-active-fg': 'var(--accent)',
      '--content-fs': '1rem', '--body-lh': '1.75', '--p-mb': '18px', '--li-mb': '6px',
      '--h1-size': '2.75rem', '--h1-size-md': '2.25rem', '--h1-size-sm': '2rem', '--h1-size-xs': '1.75rem', '--h1-weight': '400', '--h1-tracking': '-.01em', '--h1-lh': '1.16', '--h1-mb': '16px',
      '--h2-size': '1.75rem', '--h2-size-md': '1.5rem', '--h2-size-sm': '1.375rem', '--h2-weight': '400', '--h2-tracking': '0', '--h2-lh': '1.28', '--h2-mt': '52px', '--h2-mb': '16px',
      '--h3-size': '1.375rem', '--h3-size-md': '1.25rem', '--h3-size-sm': '1.125rem', '--h3-weight': '500', '--h3-tracking': '0', '--h3-lh': '1.3', '--h3-mt': '36px', '--h3-mb': '10px',
      '--h4-size': '1.125rem', '--h4-weight': '500', '--h4-tracking': '.005em', '--h4-mt': '28px',
      '--heading-features': 'normal',
      '--logo-weight': '500',
      '--link-underline-color': 'color-mix(in srgb, var(--accent) 40%, transparent)', '--link-underline-offset': '3px', '--link-color': 'var(--accent)',
      '--link-underline-hover': 'var(--accent)',
      '--inline-code-bg': 'var(--surface3)', '--inline-code-border': 'transparent', '--inline-code-color': 'var(--text)', '--inline-code-fs': '.86em',
      '--code-radius': '16px', '--code-border': 'transparent', '--code-bar-bg': 'color-mix(in srgb, var(--text) 5%, var(--code-bg))', '--code-block-fs': '13.5px', '--code-fs': '13.5px', '--code-head-h': '44px',
      '--card-bg': 'var(--surface2)', '--card-border': 'transparent', '--card-radius': '20px', '--card-pad': '24px', '--card-shadow': 'none',
      '--card-bg-hover': 'color-mix(in srgb, var(--accent) 8%, var(--surface2))', '--card-border-hover': 'transparent', '--card-shadow-hover': '0 1px 3px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.1)', '--card-lift': '0px',
      '--card-title-weight': '500',
      '--callout-radius': '16px', '--callout-bg-mix': '12%', '--callout-border-mix': '0%', '--callout-bar-mix': '0%', '--callout-pad': '16px 20px',
      '--table-radius': '16px', '--table-border': 'var(--border)', '--table-head-bg': 'var(--surface2)', '--table-fs': '14.5px', '--table-col-line-w': '0px', '--table-pad-y': '14px',
      '--shadow-modal': '0 8px 12px 6px rgba(0,0,0,.15), 0 4px 4px rgba(0,0,0,.3)',
      '--control-radius': '999px', '--btn-filled-hover-bg': 'color-mix(in srgb, var(--accent) 90%, var(--on-accent))',
      '--badge-radius': '8px',
      '--focus-w': '3px', '--focus-color': 'var(--accent)',
    },
    css: `
& .search-trigger { height: 40px; border-radius: 999px; background: var(--surface3); border-color: transparent; padding: 0 16px; }
& .search-trigger:hover { background: color-mix(in srgb, var(--text) 8%, var(--surface3)); border-color: transparent; }
& .theme-btn, & .a11y-btn { border-radius: 999px; background: transparent; border-color: transparent; width: 40px; height: 40px; }
& .theme-btn:hover, & .a11y-btn:hover, & .nav-menu-btn:hover { background: color-mix(in srgb, var(--text) 8%, transparent); }
& .theme-btn:active, & .a11y-btn:active, & .nav-menu-btn:active { background: color-mix(in srgb, var(--text) 12%, transparent); }
& .version-select, & .locale-switcher { border-radius: 999px; background-color: transparent; border-color: var(--border2); }
& .nav-btn { border-radius: 999px; height: 40px; padding: 0 22px; font-weight: 500; letter-spacing: .01em; }
& .nav-btn-outlined { border-color: var(--border2); color: var(--accent); }
& .nav-btn-filled:hover { box-shadow: 0 1px 3px rgba(0,0,0,.25); }
& .nav-ext-link { border-radius: 999px; padding: 8px 14px; font-weight: 500; }
& .nav-ext-link:hover { background: color-mix(in srgb, var(--text) 8%, transparent); color: var(--text); }
& .nav-tabs-bar { border-bottom: 1px solid var(--border); }
& .nav-tab { font-weight: 500; }
& .nav-tab::after { height: 3px; border-radius: 3px 3px 0 0; left: calc(var(--tab-pad-x) - 2px); right: calc(var(--tab-pad-x) - 2px); }
& .nav-tab.active { color: var(--accent); }
& .nav-tab:hover { background: color-mix(in srgb, var(--text) 6%, transparent); }
& .sidebar-item { margin-bottom: 2px; }
& .sidebar-item:active { background: color-mix(in srgb, var(--text) 12%, transparent); }
& .sidebar-item.active:hover { background: var(--sb-active-bg); }
& .sidebar-tab, & .sidebar-anchor { border-radius: 999px; }
& .sidebar-subgroup { border-left: 0; margin-left: 12px; }
& .docs-nav-top { border-bottom-color: transparent; box-shadow: 100vw 0 0 0 var(--bg); }
& .toc-item { border-radius: 0 999px 999px 0; }
& .toc-item.active { background: var(--accent-dim); }
& .docs-content .page-subtitle { font-size: 1.1875rem; margin-top: 0; }
& .docs-content a { font-weight: 500; }
& .docs-content blockquote { border-left-color: var(--accent); border-radius: 4px 16px 16px 4px; background: var(--surface2); }
& .docs-content th { font-weight: 500; }
& .page-nav-btn { border-color: var(--border); border-radius: 16px; }
& .page-nav-btn:hover { background: color-mix(in srgb, var(--accent) 8%, transparent); border-color: var(--border2); }
& .meta-btn, & .fb-btn { border-radius: 999px; }
& .site-footer { background: var(--surface); }
& *:focus-visible { border-radius: 8px; }
& .sidebar-item:focus-visible { border-radius: 999px; outline-offset: -3px; }
`,
  },

  folio: {
    id: 'folio',
    label: 'Folio',
    description: 'Book and knowledge-base look: narrow reading column, serif headings, quiet chrome, outline-style sidebar and a prominent page title with description.',
    palette: 'paper',
    fonts: {
      sans: `'Inter', 'Inter-fallback', ${SYS_SANS}`,
      heading: `'Source Serif 4', 'Source-Serif-fallback', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif`,
      mono: MONO_JB,
      google: ['Inter:wght@400;500;600;700', 'Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700', 'JetBrains+Mono:wght@400;500;600'],
      fallbacks: [{ family: 'Source-Serif-fallback', local: 'Times New Roman', sizeAdjust: '98.44%', ascent: '105.65%', descent: '34.54%' }],
    },
    layout: { showDescription: true },
    tune: (p) => ({ ...p, sidebarBg: p.bg }),
    tokens: {
      '--radius': '6px', '--radius-lg': '10px',
      '--r-xs': '3px', '--r-sm': '4px', '--r-md': '6px', '--r-lg': '8px', '--r-xl': '10px', '--r-pill': '999px',
      '--nav-h': '58px', '--tabs-bar-h': '44px', '--sidebar-w': '288px', '--content-text-w': '640px', '--toc-w': '216px',
      '--nav-bg': 'color-mix(in srgb, var(--bg) 92%, transparent)', '--nav-blur': '10px', '--nav-border': 'var(--border)',
      '--sidebar-border-w': '0px',
      '--sidebar-fs': '14px', '--sidebar-item-pad-y': '6px', '--sb-item-lh': '1.45', '--sb-item-radius': '0', '--sb-item-mx': '0px', '--sb-bar-w': '2px',
      '--sb-active-bg': 'transparent', '--sb-active-fg': 'var(--accent-light)', '--sb-active-bar': 'var(--accent)', '--sb-active-weight': '600',
      '--sb-hover-bg': 'color-mix(in srgb, var(--text) 4%, transparent)',
      '--sb-group-fs': '11.5px', '--sb-group-weight': '600', '--sb-group-transform': 'uppercase', '--sb-group-tracking': '.09em', '--sb-group-color': 'var(--text3)',
      '--sb-group-pt': '24px', '--sb-group-pb': '8px',
      '--toc-fs': '13px', '--toc-title-fs': '11.5px', '--toc-title-transform': 'uppercase', '--toc-title-tracking': '.09em', '--toc-line': 'var(--border)', '--toc-bar-w': '2px',
      '--content-fs': '1.0625rem', '--body-lh': '1.78', '--p-mb': '20px', '--li-mb': '8px',
      '--prose-color': 'var(--text)',
      '--font-heading': `'Source Serif 4', 'Source-Serif-fallback', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif`,
      '--h1-size': '2.875rem', '--h1-size-md': '2.375rem', '--h1-size-sm': '2rem', '--h1-size-xs': '1.75rem', '--h1-weight': '600', '--h1-tracking': '-.02em', '--h1-lh': '1.12', '--h1-mb': '14px',
      '--h2-size': '1.875rem', '--h2-size-md': '1.625rem', '--h2-size-sm': '1.4375rem', '--h2-weight': '600', '--h2-tracking': '-.012em', '--h2-lh': '1.25', '--h2-mt': '56px', '--h2-mb': '16px',
      '--h3-size': '1.4375rem', '--h3-size-md': '1.3125rem', '--h3-size-sm': '1.1875rem', '--h3-weight': '600', '--h3-tracking': '-.008em', '--h3-lh': '1.3', '--h3-mt': '40px', '--h3-mb': '12px',
      '--h4-size': '1.1875rem', '--h4-weight': '600', '--h4-tracking': '0', '--h4-mt': '32px',
      '--heading-features': 'normal',
      '--logo-weight': '600',
      '--link-underline-color': 'color-mix(in srgb, var(--accent-light) 55%, transparent)', '--link-underline-offset': '3px',
      '--inline-code-bg': 'var(--surface)', '--inline-code-border': 'var(--border)', '--inline-code-color': 'var(--text)', '--inline-code-fs': '.8em',
      '--code-radius': '8px', '--code-block-fs': '13px', '--code-fs': '13px', '--code-head-h': '38px',
      '--card-bg': 'var(--bg)', '--card-border': 'var(--border)', '--card-radius': '10px', '--card-pad': '22px', '--card-shadow': 'none',
      '--card-shadow-hover': '0 2px 10px color-mix(in srgb, var(--text) 8%, transparent)', '--card-border-hover': 'var(--border2)', '--card-lift': '0px',
      '--callout-radius': '8px', '--callout-bg-mix': '7%', '--callout-border-mix': '0%', '--callout-bar-mix': '85%', '--callout-bar-w': '3px',
      '--table-radius': '8px', '--table-head-bg': 'var(--surface)', '--table-fs': '14.5px', '--table-col-line-w': '0px',
      '--shadow-modal': '0 18px 50px -10px rgba(40,30,10,.3)',
      '--control-radius': '6px', '--badge-radius': '4px',
    },
    css: `
& .docs-content .page-subtitle { font-size: 1.3125rem; line-height: 1.5; color: var(--text2); font-family: var(--font-heading); font-weight: 400; margin: 0 0 28px; max-width: 34em; }
& .docs-content .page-eyebrow { letter-spacing: .12em; font-size: 12px; }
& .docs-content h1 { text-wrap: balance; }
& .docs-content h2 { padding-bottom: 8px; border-bottom: 1px solid var(--border); }
& .docs-content a { text-decoration-thickness: 1px; }
& .docs-sidebar { box-shadow: none; }
& .sidebar-scroll { padding-left: 18px; }
& .sidebar-pane { border-left: 1px solid var(--border); margin-left: 4px; }
& .sidebar-pane > .sidebar-section > .sidebar-item, & .sidebar-section > .sidebar-item { margin-left: -1px; }
& .sidebar-subgroup { border-left-color: var(--border); }
& .sidebar-item.active { border-left-color: var(--accent); }
& .sidebar-group-title { padding-left: 20px; }
& .docs-nav-top { background: var(--bg); }
& .page-meta { border-bottom: 0; padding-bottom: 8px; margin-bottom: 20px; }
& .docs-content blockquote { font-family: var(--font-heading); font-size: 1.1em; border-left-color: var(--border2); background: transparent; border-radius: 0; padding: 4px 24px; font-style: italic; }
& .docs-content strong { font-weight: 650; }
& .page-nav-btn { border-radius: 8px; }
& .toc-title { margin-bottom: 12px; }
& .site-footer { background: var(--bg); }
`,
  },

  ledger: {
    id: 'ledger',
    label: 'Ledger',
    description: 'API-reference look: dense sidebar, wide content for parameter and example columns, small precise type and a sober palette.',
    palette: 'steel',
    fonts: {
      sans: `'IBM Plex Sans', 'IBM-Plex-fallback', ${SYS_SANS}`,
      mono: `'IBM Plex Mono', 'IBM-Plex-Mono-fallback', ${SYS_MONO}`,
      google: ['IBM+Plex+Sans:wght@400;500;600;700', 'IBM+Plex+Mono:wght@400;500;600'],
      fallbacks: [{ family: 'IBM-Plex-fallback', local: 'Arial', sizeAdjust: '101.93%', ascent: '101.05%', descent: '27.47%' }, { family: 'IBM-Plex-Mono-fallback', local: 'Courier New', sizeAdjust: '99.98%', ascent: '103.02%', descent: '28%' }],
    },
    tune: (p) => ({ ...p, sidebarBg: p.surface }),
    tokens: {
      '--radius': '6px', '--radius-lg': '8px',
      '--r-xs': '3px', '--r-sm': '4px', '--r-md': '6px', '--r-lg': '8px', '--r-xl': '8px', '--r-pill': '999px',
      '--nav-h': '54px', '--tabs-bar-h': '40px', '--sidebar-w': '252px', '--content-text-w': '760px', '--toc-w': '196px', '--page-w': '1680px',
      '--nav-bg': 'color-mix(in srgb, var(--bg) 96%, transparent)', '--nav-blur': '6px', '--nav-border': 'var(--border)',
      '--sidebar-border': 'var(--border)',
      '--sidebar-fs': '13.5px', '--sidebar-item-pad-y': '4.5px', '--sb-item-lh': '1.4', '--sb-item-radius': '5px', '--sb-item-mx': '8px', '--sb-item-pl': '10px', '--sb-group-pl': '18px', '--sb-bar-w': '0px',
      '--sb-active-bg': 'var(--accent-dim2)', '--sb-active-fg': 'var(--accent-light)', '--sb-active-weight': '600',
      '--sb-group-fs': '12.5px', '--sb-group-weight': '600', '--sb-group-transform': 'none', '--sb-group-tracking': '0', '--sb-group-color': 'var(--text)',
      '--sb-group-pt': '16px', '--sb-group-pb': '4px',
      '--toc-fs': '12.5px', '--toc-title-fs': '12px', '--toc-title-transform': 'none', '--toc-title-tracking': '0', '--toc-line': 'var(--border)', '--toc-bar-w': '2px',
      '--content-fs': '0.9375rem', '--body-lh': '1.62', '--p-mb': '14px', '--li-mb': '4px',
      '--h1-size': '2rem', '--h1-size-md': '1.75rem', '--h1-size-sm': '1.625rem', '--h1-size-xs': '1.5rem', '--h1-weight': '600', '--h1-tracking': '-.02em', '--h1-lh': '1.2', '--h1-mb': '12px',
      '--h2-size': '1.3125rem', '--h2-size-md': '1.25rem', '--h2-size-sm': '1.1875rem', '--h2-weight': '600', '--h2-tracking': '-.012em', '--h2-lh': '1.3', '--h2-mt': '44px', '--h2-mb': '12px',
      '--h3-size': '1.0625rem', '--h3-size-md': '1.0625rem', '--h3-size-sm': '1rem', '--h3-weight': '600', '--h3-tracking': '-.005em', '--h3-lh': '1.35', '--h3-mt': '28px', '--h3-mb': '8px',
      '--h4-size': '.9375rem', '--h4-weight': '600', '--h4-tracking': '0', '--h4-mt': '22px', '--h4-mb': '6px',
      '--heading-features': 'normal',
      '--logo-weight': '600',
      '--link-underline-color': 'color-mix(in srgb, var(--accent-light) 35%, transparent)', '--link-underline-offset': '2px',
      '--inline-code-bg': 'var(--surface2)', '--inline-code-border': 'var(--border)', '--inline-code-color': 'var(--text)', '--inline-code-fs': '.86em',
      '--code-radius': '6px', '--code-block-fs': '12.5px', '--code-fs': '12.5px', '--code-head-h': '34px',
      '--card-bg': 'var(--bg)', '--card-border': 'var(--border)', '--card-radius': '8px', '--card-pad': '16px', '--card-shadow': 'none',
      '--card-shadow-hover': 'none', '--card-border-hover': 'var(--accent)', '--card-lift': '0px', '--card-title-fs': '14.5px', '--card-title-weight': '600',
      '--callout-radius': '6px', '--callout-bg-mix': '7%', '--callout-border-mix': '25%', '--callout-bar-mix': '25%', '--callout-pad': '12px 16px',
      '--table-radius': '6px', '--table-head-bg': 'var(--surface)', '--table-fs': '13.5px', '--table-pad-y': '8px',
      '--shadow-modal': '0 16px 44px -8px rgba(10,20,40,.35)',
      '--control-radius': '6px', '--badge-radius': '4px',
    },
    css: `
& .nav-tab { font-weight: 500; font-size: 13.5px; }
& .nav-tabs-bar { background: var(--bg); backdrop-filter: none; -webkit-backdrop-filter: none; }
& .docs-sidebar { box-shadow: none; }
& .sidebar-item.active { box-shadow: none; }
& .docs-content h2 { padding-top: 28px; border-top: 1px solid var(--border); margin-top: 40px; }
& .docs-content > h2:first-of-type, & .docs-content h1 + h2 { margin-top: 28px; }
& .docs-content .page-eyebrow { font-size: 11.5px; }
& .docs-content .page-subtitle { font-size: 1rem; margin-top: 0; }
& .docs-content table { font-variant-numeric: tabular-nums; }
& .docs-content th { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }
& .page-nav-btn:hover { border-color: var(--accent); background: transparent; }
& .search-trigger { background: var(--bg); }
& .page-meta { padding-bottom: 14px; margin-bottom: 20px; }
`,
  },
};

THEMES.classic = { ...THEMES.default, id: 'classic', label: 'Classic', alias: 'default' };

/** Ids that are an alias of another theme (resolved to the canonical id). */
export const THEME_ALIASES = { classic: 'default' };

export function canonicalThemeId(id) {
  return THEME_ALIASES[id] || id;
}

/** Selector prefix used by theme CSS blocks. */
export const themeSelector = (id) => `html[data-theme-name="${id}"]`;

/**
 * Tonal themes derive surfaces and accents from a seed colour (Material-3-like role mapping).
 * Returns the palette overlay for one mode, keeping any key the user set explicitly.
 */
export function deriveTonal(palette, mode, seedHex) {
  const s = tonalScheme(seedHex, mode);
  const containerOverBg = s.secondaryContainer;
  return {
    ...palette,
    bg: s.bg, surface: s.surface, surface2: s.surface2, surface3: s.surface3, sidebarBg: s.sidebarBg,
    border: s.border, border2: s.border2, text: s.text, text2: s.text2, text3: s.text3,
    accent: s.accent, accentLight: s.accent, onAccent: s.onAccent,
    accentDim: s.container ? withAlpha(parseColor(s.container), mode === 'dark' ? 0.55 : 0.7) : palette.accentDim,
    accentDim2: containerOverBg,
    codeBg: s.codeBg, codeText: s.codeText,
  };
}
