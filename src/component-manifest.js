/**
 * Machine-readable manifest of every built-in DocsLit `wc-*` component.
 *
 * Source of truth for tooling (CLI `docslit components`, MCP servers, agent
 * skills). Attributes are derived from the Lit `static properties` in
 * src/components/*.js (public, non-underscore properties) cross-checked with
 * the user docs. component-manifest.test.js fails if a tag defined in
 * src/components is missing here.
 *
 * Entry shape:
 *   { tag, category, description,
 *     attributes: [{ name, type, description, required?, default?, values? }],
 *     content: 'markdown' | 'text' | 'code' | 'json' | 'mermaid' | 'asciidoc' | 'children' | 'none',
 *     contentDescription: string,
 *     parents?: [tag], children?: [tag], selfClosing?: boolean,
 *     selfClosingWith?: attribute that makes the `<tag ... />` form valid (wc-var value), example: string }
 */

const CATEGORY_LABELS = {
  callouts: 'Callouts & text',
  layout: 'Layout',
  navigation: 'Steps & tabs',
  code: 'Code',
  media: 'Media & files',
  data: 'Data & API reference',
  content: 'Cards & buttons',
  utility: 'Utility',
  authoring: 'Authoring (compile-time)',
};

const THEME_ATTR = {
  name: 'theme',
  type: 'string',
  description: 'Pin this component to a color scheme regardless of the page theme.',
  values: ['dark', 'light'],
};

// Tags whose Lit styles define :host([theme="dark"|"light"]).
const THEMED = new Set([
  'wc-tooltip', 'wc-update', 'wc-code-block', 'wc-code-group', 'wc-card', 'wc-prompt', 'wc-tile',
  'wc-asciidoc-table', 'wc-color', 'wc-endpoint', 'wc-field', 'wc-fields', 'wc-mermaid', 'wc-response',
  'wc-response-fields', 'wc-responses', 'wc-runnable-endpoint', 'wc-schema', 'wc-table', 'wc-accordion',
  'wc-aside', 'wc-expandable', 'wc-frame', 'wc-panel', 'wc-copy', 'wc-dir', 'wc-download', 'wc-file',
  'wc-files', 'wc-tree', 'wc-tree-item', 'wc-tabs', 'wc-view',
]);

// Read via getAttribute('sync') in navigation.js (not a Lit property, so the
// static-properties scan alone would miss it; see component-manifest.test.js).
const SYNC_ATTR = {
  name: 'sync',
  type: 'string',
  description: 'Sync key. Tab groups on the same page (wc-tabs and wc-code-group) that share a sync value switch together when the reader picks a tab label, and the choice is remembered in localStorage. Tab labels must match across groups.',
};

function attr(name, type, description, opts = {}) {
  return { name, type, description, ...opts };
}

function def(tag, category, description, attributes, content, contentDescription, example, extra = {}) {
  const attrs = [...attributes];
  if (THEMED.has(tag) && !attrs.some((x) => x.name === 'theme')) attrs.push({ ...THEME_ATTR });
  return { tag, category, description, attributes: attrs, content, contentDescription, ...extra, example };
}

const MANIFEST = [
  // ── Callouts & text ──────────────────────────────────────────────────────
  def('wc-callout', 'callouts',
    'Highlighted block for tips, warnings, notes and other asides, with a default icon per type. Pass icon and color for a custom callout. Body supports full Markdown.',
    [
      attr('type', 'string', 'Visual style (and default icon).', { values: ['info', 'tip', 'warning', 'error', 'danger', 'success', 'check', 'note', 'launch'], default: 'info' }),
      attr('title', 'string', 'Heading shown at the top of the callout (inline Markdown). Omit for body-only.'),
      attr('icon', 'string', 'Custom icon (replaces the type icon; "none" hides it): a Lucide or Font Awesome Free name (rocket, fa-solid fa-gear, lucide:zap), an emoji, an image URL/path, or inline <svg>. Resolved at build time to inline SVG (no CDN request, works offline).'),
      attr('icon-type', 'string', 'Font Awesome style for the icon.', { values: ['solid', 'regular', 'brands'] }),
      attr('color', 'string', 'Custom accent colour (hex or any CSS colour) for the border, tint, icon and title.'),
    ],
    'markdown', 'Callout body. Leave a blank line after the opening tag to use block Markdown (lists, code).',
    `<wc-callout type="warning" title="Heads up">
Back up your \`docslit.json\` before running a migration.
</wc-callout>

<wc-callout icon="rocket" color="#8b5cf6" title="Launch day">
A custom icon and colour.
</wc-callout>`),

  def('wc-alert', 'callouts',
    'Alias of wc-callout (same attributes and behavior).',
    [
      attr('type', 'string', 'Visual style (and default icon).', { values: ['info', 'tip', 'warning', 'error', 'danger', 'success', 'check', 'note', 'launch'] }),
      attr('title', 'string', 'Heading shown at the top.'),
      attr('icon', 'string', 'Custom icon (see wc-callout).'),
      attr('icon-type', 'string', 'Font Awesome style for the icon.', { values: ['solid', 'regular', 'brands'] }),
      attr('color', 'string', 'Custom accent colour.'),
    ],
    'markdown', 'Alert body.',
    `<wc-alert type="error" title="Breaking change">
The \`--legacy\` flag was removed.
</wc-alert>`),

  def('wc-banner', 'callouts',
    'Full-width notice strip, optionally dismissible (the dismissal is remembered per message). Good for announcements inside a page.',
    [
      attr('type', 'string', 'Visual style.', { values: ['info', 'warning', 'error', 'critical', 'success', 'neutral'], default: 'neutral' }),
      attr('dismissible', 'boolean', 'Show a close button so readers can dismiss the banner; stays hidden until the banner text changes.'),
      attr('color', 'string', 'Solid background colour (white text) in light mode, and in dark mode unless dark-color is set.'),
      attr('dark-color', 'string', 'Solid background colour used in dark mode.'),
      attr('icon', 'string', 'Optional leading icon (see wc-icon for accepted values).'),
    ],
    'markdown', 'Banner message.',
    `<wc-banner type="info" dismissible>
Version 2.0 is now available.
</wc-banner>`),

  def('wc-badge', 'callouts',
    'Small inline pill for status or category labels (Stable, Beta, Deprecated...). Supports sizes, shapes, icons and outlined / minimal styles.',
    [
      attr('variant', 'string', 'Colour.', { values: ['default', 'success', 'warning', 'orange', 'danger', 'error', 'info', 'neutral', 'purple', 'note', 'tip', 'launch', 'check', 'white', 'surface'], default: 'default' }),
      attr('label', 'string', 'Badge text. If omitted, the element body is used.'),
      attr('size', 'string', 'Badge size.', { values: ['xs', 'sm', 'md', 'lg'], default: 'md' }),
      attr('shape', 'string', 'Badge shape.', { values: ['rounded', 'pill'], default: 'rounded' }),
      attr('icon', 'string', 'Leading icon (see wc-icon for accepted values).'),
      attr('outlined', 'boolean', 'Transparent background with a border.'),
      attr('minimal', 'boolean', 'Very subtle background, no border.'),
      attr('disabled', 'boolean', 'Reduced-opacity disabled look.'),
    ],
    'text', 'Badge text (alternative to the label attribute).',
    `<wc-badge variant="success" icon="check" shape="pill">Stable</wc-badge>`),

  def('wc-tooltip', 'callouts',
    'Inline text with a hover / focus tooltip. Keyboard accessible (the text is focusable, Escape closes), flips to stay on screen, and supports a headline and a call-to-action link.',
    [
      attr('tip', 'string', 'Tooltip content (inline Markdown). Alias: text.', { required: true }),
      attr('text', 'string', 'Legacy alias of tip.'),
      attr('headline', 'string', 'Bold line shown before the tip text.'),
      attr('cta', 'string', 'Call-to-action link text (needs href).'),
      attr('href', 'string', 'URL for the call-to-action link.'),
      attr('position', 'string', 'Preferred side; flips automatically when there is no room.', { values: ['top', 'bottom', 'left', 'right'], default: 'top' }),
    ],
    'text', 'The inline text the tooltip is attached to.',
    `DocsLit uses <wc-tooltip tip="A library for building web components" headline="Lit" cta="Learn more" href="https://lit.dev">Lit</wc-tooltip> under the hood.`),

  def('wc-update', 'callouts',
    'Changelog entry. Use label (+ description, tags) for the timeline layout with an anchor link on the label, or version / date / type for the compact boxed layout.',
    [
      attr('label', 'string', 'Entry label, usually a date or version. Also the anchor: label="2026-10-29" links as #2026-10-29.'),
      attr('description', 'string', 'Text shown under the label (e.g. a version).'),
      attr('tags', 'string', 'Comma-separated tags shown as chips under the label.'),
      attr('version', 'string', 'Version number for this change.'),
      attr('type', 'string', 'Change type badge (boxed layout).', { values: ['added', 'changed', 'fixed', 'removed', 'deprecated', 'security'] }),
      attr('date', 'string', 'Release date (free-form text, boxed layout).'),
      attr('id', 'string', 'Anchor id. Defaults to a slug of the label.'),
    ],
    'markdown', 'Description of the change.',
    `<wc-update label="2026-10-29" description="v1.2.0" tags="Feature, Fix">
New \`--json\` flag for the \`validate\` command.
</wc-update>`),

  // ── Layout ───────────────────────────────────────────────────────────────
  def('wc-columns', 'layout',
    'Responsive multi-column grid. Collapses to one column on mobile.',
    [
      attr('cols', 'number', 'Number of columns.', { default: '2' }),
      attr('gap', 'string', 'Gap between columns (any CSS length).', { default: '1.5rem' }),
    ],
    'markdown', 'Column contents; each direct child block becomes one column (wrap each in a div or wc-panel).',
    `<wc-columns cols="2">
<div>

**Before**

Manual setup.

</div>
<div>

**After**

One command.

</div>
</wc-columns>`),

  def('wc-frame', 'layout',
    'Frame around an image, embed or other content, with an optional caption and hint.',
    [
      attr('caption', 'string', 'Caption displayed below the content (inline Markdown).'),
      attr('hint', 'string', 'Text shown above the frame.'),
      attr('border', 'boolean', 'Draw a border around the framed content.'),
      attr('background', 'string', 'Frame background.', { values: ['default', 'subtle'], default: 'default' }),
    ],
    'markdown', 'Framed content, typically an image.',
    `<wc-frame caption="The dashboard overview" hint="Click to enlarge" border background="subtle">

![Dashboard](https://example.com/dashboard.png)

</wc-frame>`),

  def('wc-panel', 'layout',
    'Titled box that groups related content.',
    [
      attr('title', 'string', 'Panel header text.'),
      attr('icon', 'string', 'Icon (emoji or short text) shown next to the title.'),
    ],
    'markdown', 'Panel body.',
    `<wc-panel title="Prerequisites" icon="📋">

- Node.js 20 or later
- A docs project

</wc-panel>`),

  def('wc-expandable', 'layout',
    'Lightweight collapsible section (same behaviour as wc-accordion; use it for nested object properties).',
    [
      attr('title', 'string', 'Clickable heading that toggles the section (inline Markdown).'),
      attr('description', 'string', 'Smaller text under the title.'),
      attr('icon', 'string', 'Leading icon (see wc-icon for accepted values).'),
      attr('open', 'boolean', 'Expand the section by default.'),
    ],
    'markdown', 'Hidden content revealed on expand.',
    `<wc-expandable title="Show advanced options">
Set \`DEBUG=1\` to enable verbose logs.
</wc-expandable>`),

  def('wc-accordion', 'layout',
    'Collapsible FAQ-style item (a real button with aria-expanded; opens when the URL hash matches its id or title slug; findable by in-page search). Usually placed inside wc-accordion-group.',
    [
      attr('title', 'string', 'Clickable heading text that toggles the item (inline Markdown).', { required: true }),
      attr('description', 'string', 'Smaller text under the title.'),
      attr('icon', 'string', 'Leading icon (see wc-icon for accepted values).'),
      attr('open', 'boolean', 'Expand the item by default.'),
      attr('id', 'string', 'Anchor id for deep links. Defaults to a slug of the title.'),
    ],
    'markdown', 'Answer or detail content.',
    `<wc-accordion title="Which Node.js version do I need?" description="Short answer: 20.19 or later" icon="circle-help">
Node.js 20.19 or later.
</wc-accordion>`,
    { parents: ['wc-accordion-group'] }),

  def('wc-accordion-group', 'layout',
    'Visually connected stack of wc-accordion items.',
    [],
    'children', 'One or more wc-accordion elements.',
    `<wc-accordion-group>
<wc-accordion title="How do I install it?">
Run \`npm install -g docslit\`.
</wc-accordion>
<wc-accordion title="Is it free?">
Yes, it is Apache-2.0 licensed.
</wc-accordion>
</wc-accordion-group>`,
    { children: ['wc-accordion'] }),

  def('wc-aside', 'layout',
    'Side note or related-content box that floats to the right of the text; sticky keeps it in view while the reader scrolls (inline on small screens).',
    [
      attr('title', 'string', 'Aside heading.'),
      attr('sticky', 'boolean', 'Stay pinned below the header while scrolling.'),
    ],
    'markdown', 'Aside content.',
    `<wc-aside title="Related" sticky>
See also the [quickstart](quickstart).
</wc-aside>`),

  // ── Steps & tabs ─────────────────────────────────────────────────────────
  def('wc-steps', 'navigation',
    'Numbered step-by-step procedure with a connecting rail. Steps are numbered automatically.',
    [
      attr('title-size', 'string', 'Step title level; h2-h4 make real headings that appear in the page table of contents.', { values: ['p', 'h2', 'h3', 'h4'], default: 'p' }),
    ],
    'children', 'One or more wc-step elements.',
    `<wc-steps>
<wc-step title="Install">
Run \`npm install -g docslit\`.
</wc-step>
<wc-step title="Initialize">
Run \`docslit init my-docs\`.
</wc-step>
</wc-steps>`,
    { children: ['wc-step'] }),

  def('wc-step', 'navigation',
    'A single step inside wc-steps. The title is rendered as light-DOM text at build time (readable without JS) and gets an anchor id.',
    [
      attr('title', 'string', 'Step heading shown next to the step marker (inline Markdown).', { required: true }),
      attr('n', 'number', 'Override the auto-generated step number.'),
      attr('icon', 'string', 'Icon shown in the marker instead of the number (see wc-icon for accepted values).'),
      attr('title-size', 'string', 'Title level for this step (overrides wc-steps).', { values: ['p', 'h2', 'h3', 'h4'] }),
      attr('id', 'string', 'Anchor id for deep links. Defaults to a slug of the title.'),

      attr('no-anchor', 'boolean', 'Hide the hover anchor link on a plain-text (p) title.'),
      attr('data-anchor', 'string', 'Set by the build step: the heading id when title-size is h2-h4.'),
      attr('data-title-level', 'string', 'Set by the build step: h2, h3 or h4 when the title is a heading.'),
    ],
    'markdown', 'Step instructions (full Markdown including code blocks).',
    `<wc-steps>
<wc-step title="Build" icon="hammer">
Run \`docslit build\`.
</wc-step>
</wc-steps>`,
    { parents: ['wc-steps'] }),

  def('wc-tabs', 'navigation',
    'Tabbed content switcher for alternative instructions. Arrow keys, Home and End move between tabs; #tab-id in the URL opens a tab.',
    [
      SYNC_ATTR,
      attr('default-tab', 'number', 'Zero-based index of the tab shown first.', { default: '0' }),
      attr('border-bottom', 'boolean', 'Add a bottom border and padding below the tabs to separate them from following content.'),
    ],
    'children', 'One or more wc-tab elements.',
    `<wc-tabs>
<wc-tab label="npm" icon="box">

\`\`\`bash
npm install docslit
\`\`\`

</wc-tab>
<wc-tab label="pnpm">

\`\`\`bash
pnpm add docslit
\`\`\`

</wc-tab>
</wc-tabs>`,
    { children: ['wc-tab'] }),

  def('wc-tab', 'navigation',
    'A single tab panel inside wc-tabs.',
    [
      attr('label', 'string', 'Text of the tab button (inline Markdown). Also the deep-link id (slug of the label) unless id is set.', { required: true }),
      attr('icon', 'string', 'Icon shown before the label (see wc-icon for accepted values).'),
      attr('id', 'string', 'Deep-link id. Defaults to a slug of the label.'),
    ],
    'markdown', 'Tab content (full Markdown). Leave blank lines around fenced code blocks.',
    `<wc-tabs>
<wc-tab label="macOS" icon="apple">
Use Homebrew.
</wc-tab>
</wc-tabs>`,
    { parents: ['wc-tabs'] }),

  def('wc-view', 'navigation',
    'Toggle between alternative views (for example a language or platform switcher) of the same content. Add sync to switch every view group with the same labels together.',
    [SYNC_ATTR],
    'children', 'One or more wc-view-panel elements.',
    `<wc-view>
<wc-view-panel label="REST" icon="globe">
Call the HTTP API directly.
</wc-view-panel>
<wc-view-panel label="SDK">
Use the client library.
</wc-view-panel>
</wc-view>`,
    { children: ['wc-view-panel'] }),

  def('wc-view-panel', 'navigation',
    'A single panel inside wc-view.',
    [
      attr('label', 'string', 'Text of the toggle button for this panel.', { required: true }),
      attr('icon', 'string', 'Icon shown before the label (see wc-icon for accepted values).'),
    ],
    'markdown', 'Panel content.',
    `<wc-view>
<wc-view-panel label="Overview">
Summary content.
</wc-view-panel>
</wc-view>`,
    { parents: ['wc-view'] }),

  // ── Code ─────────────────────────────────────────────────────────────────
  def('wc-var', 'code',
    'Editable variable. As an element with name + default it renders an inline input; every {{NAME}} placeholder on the page updates live. As a self-closing declaration with name + value it defines {{NAME}} at build time and renders nothing.',
    [
      attr('name', 'string', 'Variable name, UPPER_SNAKE_CASE by convention (letters, digits, underscore). Referenced as {{NAME}}.', { required: true }),
      attr('default', 'string', 'Default value shown in the interactive editor before the reader changes it.'),
      attr('value', 'string', 'Compile-time form only: `<wc-var name="X" value="..." />` declares a page-level variable.'),
      attr('readonly', 'boolean', 'Prevent the reader from editing the value.'),
    ],
    'none', 'No content. The compile-time declaration must be self-closing.',
    `Set your domain: <wc-var name="DOMAIN" default="docs.example.com"></wc-var>

\`\`\`bash
rsync -avz dist/ deploy@{{DOMAIN}}:/var/www/html/
\`\`\``,
    { selfClosing: false, selfClosingWith: 'value' }),

  def('wc-code-block', 'code',
    'Syntax-highlighted code with copy button, optional filename header, icon, line numbers, line highlight / focus / diff marks, wrapping and a collapse toggle. Plain fenced code blocks (```lang) are usually preferred and take the same options in the fence meta (```js title="app.js" {1,3-5} lines wrap); use this tag when you want attributes. Shiki notation comments (// [!code ++], [!code --], [!code highlight], [!code focus], [!code error], [!code warning]) are stripped from the display and from Copy.',
    [
      attr('language', 'string', 'Highlighting language, e.g. javascript, python, bash, json, html, css. Shown as a label in the header.'),
      attr('filename', 'string', 'Filename or title displayed in the header bar.'),
      attr('icon', 'string', 'Icon shown before the filename (a wc-icon name: built-in or Font Awesome).'),
      attr('linenumbers', 'string', 'Set to "true" to show line numbers.', { values: ['true', 'false'] }),
      attr('start-line', 'number', 'Number of the first line when line numbers are shown (default 1).'),
      attr('highlight', 'string', 'Lines to highlight, e.g. "1,3-5". In a fence: {1,3-5} or highlight={1,3-5}.'),
      attr('focus', 'string', 'Lines to focus (all other lines are dimmed until the reader hovers or focuses the block), e.g. "2-4".'),
      attr('wrap', 'boolean', 'Wrap long lines instead of scrolling horizontally.'),
      attr('expandable', 'boolean', 'Collapse long blocks (default 10 lines) behind an accessible "Show more" toggle.'),
      attr('max-lines', 'number', 'Collapse after this many lines and add a "Show more" toggle (implies expandable). 0 disables.'),
      attr('nocopy', 'boolean', 'Hide the copy button.'),
      attr('for', 'string', 'Sync token inside a wc-code-group (e.g. "npm"): groups whose tabs share a token switch together. Defaults to the language.'),
      attr('highlighted', 'boolean', 'Content is already syntax highlighted HTML (set by the build; rarely written by hand).'),
    ],
    'code', 'Raw code, shown verbatim (not parsed as Markdown).',
    `<wc-code-block language="json" filename="package.json" linenumbers="true" highlight="2">
{
  "name": "my-docs",
  "private": true
}
</wc-code-block>`),

  def('wc-code-group', 'code',
    'Tabbed group of code snippets (e.g. one per package manager or language). Children are wc-code-tab elements or, Mintlify style, fenced code blocks whose title becomes the tab label. Groups sync with each other by language / label by default (sync="off" disables).',
    [
      { ...SYNC_ATTR, description: 'Sync key (default "code"). Code groups on the page (and wc-tabs with the same sync key) switch together when the reader picks a tab; tabs match by for= token, label or language (js = javascript), and the choice is remembered in localStorage. Use sync="off" to opt out.' },
      attr('dropdown', 'boolean', 'Replace the tab bar with a language dropdown.'),
      attr('nocopy', 'boolean', 'Hide the copy button for every tab.'),
    ],
    'children', 'One or more wc-code-tab elements, or fenced code blocks.',
    `<wc-code-group>
<wc-code-tab label="npm" language="bash">npm install docslit</wc-code-tab>
<wc-code-tab label="pnpm" language="bash">pnpm add docslit</wc-code-tab>
</wc-code-group>`,
    { children: ['wc-code-tab', 'wc-code-block'] }),

  def('wc-code-tab', 'code',
    'A single labelled snippet inside wc-code-group (or wc-endpoint). Content is raw text, not Markdown; with language it is highlighted at build time.',
    [
      attr('label', 'string', 'Tab label.', { required: true }),
      attr('language', 'string', 'Highlighting language for the snippet (also used for language sync between groups).'),
      attr('icon', 'string', 'Icon shown in the tab.'),
      attr('for', 'string', 'Sync token (e.g. "npm"): groups whose tabs share a token switch together. Defaults to the label, then the language.'),
    ],
    'code', 'Raw code or command text (not parsed as Markdown).',
    `<wc-code-group>
<wc-code-tab label="yarn" language="bash">yarn add docslit</wc-code-tab>
</wc-code-group>`,
    { parents: ['wc-code-group', 'wc-endpoint'] }),

  // ── Media & files ────────────────────────────────────────────────────────
  def('wc-icon', 'media',
    'Inline icon. Names are resolved at BUILD time to inline SVG from Lucide (ISC) and Font Awesome Free 6 (CC BY 4.0): no CDN request, works offline, and unknown names are flagged by validate with a suggestion. Also accepts an emoji, an image URL/path or inline <svg>.',
    [
      attr('name', 'string', 'Icon name: rocket, fa-solid fa-gear, fa-brands fa-github, lucide:zap, an emoji, an image URL/path, or inline <svg>. Bare names use the order set by docslit.json icons.library (auto | fontawesome | lucide). Give either name or src.'),
      attr('icon-type', 'string', 'Font Awesome style when the name is bare.', { values: ['solid', 'regular', 'brands'] }),
      attr('size', 'number', 'Icon size in pixels.', { default: '16' }),
      attr('color', 'string', 'Icon color (any CSS color).'),
      attr('src', 'string', 'Image URL/path to use as the icon (wins over name).'),
      attr('label', 'string', 'Accessible name. Icons are decorative (aria-hidden) unless you set this.'),
    ],
    'none', 'No content.',
    `<wc-icon name="rocket" size="20" color="#ff6600"></wc-icon> <wc-icon name="fa-brands fa-github" size="20"></wc-icon>`),

  def('wc-files', 'media',
    'Container for a file/directory tree (wc-dir and wc-file).',
    [],
    'children', 'wc-dir and wc-file elements.',
    `<wc-files>
<wc-dir name="my-docs" open>
<wc-file name="docslit.json" highlight></wc-file>
<wc-dir name="docs" open>
<wc-file name="introduction.md"></wc-file>
</wc-dir>
</wc-dir>
</wc-files>`,
    { children: ['wc-dir', 'wc-file'] }),

  def('wc-dir', 'media',
    'A directory node in a wc-files tree; may contain wc-dir and wc-file. A button toggles it (keyboard accessible).',
    [
      attr('name', 'string', 'Directory name.', { required: true }),
      attr('open', 'boolean', 'Expand the directory (the default).', { default: 'true' }),
      attr('collapsed', 'boolean', 'Start collapsed (use this to make a directory closed by default).'),
      attr('href', 'string', 'Make the directory name a link.'),
      attr('comment', 'string', 'Short comment displayed after the name.'),
      attr('highlight', 'boolean', 'Highlight the directory row.'),
      attr('openable', 'string', 'Set to "false" for a non-interactive, always-open folder.', { values: ['true', 'false'], default: 'true' }),
    ],
    'children', 'Nested wc-dir and wc-file elements.',
    `<wc-files>
<wc-dir name="src" comment="sources" highlight>
<wc-file name="index.js"></wc-file>
<wc-dir name="old" collapsed>
<wc-file name="legacy.js"></wc-file>
</wc-dir>
</wc-dir>
</wc-files>`,
    { parents: ['wc-files', 'wc-dir'], children: ['wc-dir', 'wc-file'] }),

  def('wc-file', 'media',
    'A file node in a wc-files tree. The icon follows the file type.',
    [
      attr('name', 'string', 'File name.', { required: true }),
      attr('highlight', 'boolean', 'Highlight this file to draw attention.', { default: 'false' }),
      attr('comment', 'string', 'Short comment displayed after the file name.'),
      attr('href', 'string', 'Make the file name a link.'),
    ],
    'none', 'No content.',
    `<wc-files>
<wc-file name="docslit.json" highlight comment="site config" href="/configuration"></wc-file>
</wc-files>`,
    { parents: ['wc-files', 'wc-dir'] }),

  def('wc-tree', 'media',
    'Generic expandable tree for non-file hierarchies.',
    [],
    'children', 'wc-tree-item elements.',
    `<wc-tree>
<wc-tree-item title="Organization" open>
<wc-tree-item title="Engineering"></wc-tree-item>
<wc-tree-item title="Design"></wc-tree-item>
</wc-tree-item>
</wc-tree>`,
    { children: ['wc-tree-item'] }),

  def('wc-tree-item', 'media',
    'A node in a wc-tree; may contain nested wc-tree-item elements.',
    [
      attr('title', 'string', 'Node text.'),
      attr('label', 'string', 'Alternative to title for the node text.'),
      attr('open', 'boolean', 'Expand the node by default.'),
      attr('icon', 'string', 'Icon shown before the node text.'),
    ],
    'children', 'Nested wc-tree-item elements.',
    `<wc-tree>
<wc-tree-item title="Root" open>
<wc-tree-item title="Leaf"></wc-tree-item>
</wc-tree-item>
</wc-tree>`,
    { parents: ['wc-tree', 'wc-tree-item'], children: ['wc-tree-item'] }),

  def('wc-download', 'media',
    'Download link styled as a button. With sources it bundles several files into one ZIP in the browser (no dependency; files must be CORS-readable).',
    [
      attr('href', 'string', 'URL or path of the file to download (give href or sources).'),
      attr('filename', 'string', 'Suggested filename (for sources: the ZIP name, default download.zip).'),
      attr('label', 'string', 'Link text. Defaults to the element body, then the filename, then "Download".'),
      attr('size', 'string', 'File size text shown in parentheses, e.g. "2.4 MB".'),
      attr('sources', 'string', 'Comma-, space- or JSON-array-separated URLs to bundle into one ZIP download (instead of href).'),
    ],
    'text', 'Optional link text (alternative to label).',
    `<wc-download href="/files/report.pdf" filename="report.pdf" label="Download report" size="2.4 MB"></wc-download>`),

  def('wc-copy', 'media',
    'Click-to-copy chip that copies a string to the clipboard. Use it inline for versions, commands and keys.',
    [
      attr('text', 'string', 'The text copied to the clipboard (default: the shown text).'),
      attr('label', 'string', 'Displayed text. Defaults to the element body, then the text.'),
      attr('clipboard', 'string', 'Copy this value instead of the displayed text.'),
    ],
    'text', 'Displayed text (alternative to label).',
    `<wc-copy clipboard="npm install -g docslit">npm install</wc-copy>`),

  def('wc-image', 'media',
    'Lazy-loaded image with click-to-zoom lightbox (keyboard accessible, Escape closes) and optional dark-mode variant. Plain Markdown images use it automatically; images inside links or with noZoom do not zoom.',
    [
      attr('src', 'string', 'Image URL or path.', { required: true }),
      attr('alt', 'string', 'Alternative text (always provide it).'),
      attr('dark-src', 'string', 'Image to show instead when the dark theme is active.'),
      attr('width', 'number', 'Width in pixels.'),
      attr('height', 'number', 'Height in pixels.'),
      attr('no-zoom', 'boolean', 'Disable the click-to-zoom lightbox.'),
    ],
    'none', 'No content.',
    `<wc-image src="/images/architecture.png" dark-src="/images/architecture-dark.png" alt="System architecture" width="800" no-zoom></wc-image>`),

  // ── Data & API reference ─────────────────────────────────────────────────
  def('wc-fields', 'data',
    'Parameter list container for request/body/option documentation.',
    [
      attr('title', 'string', 'Section header text.', { default: 'Parameter' }),
      attr('header', 'string', 'Alias of title.'),
    ],
    'children', 'wc-field elements.',
    `<wc-fields title="Request parameters">
<wc-field name="email" type="string" required>
A valid email address.
</wc-field>
<wc-field name="role" type="string" default="viewer" enum="admin,editor,viewer">
The user's role.
</wc-field>
</wc-fields>`,
    { children: ['wc-field'] }),

  def('wc-field', 'data',
    'A single parameter/property row: name, type, flags and a Markdown description. Can nest other wc-field elements for object properties.',
    [
      attr('name', 'string', 'Parameter or property name.', { required: true }),
      attr('type', 'string', 'Data type, e.g. string, number, boolean, object, string[].'),
      attr('required', 'boolean', 'Mark the field as required.'),
      attr('default', 'string', 'Default value when omitted.'),
      attr('deprecated', 'boolean', 'Mark the field as deprecated.'),
      attr('in', 'string', 'Parameter location badge.', { values: ['header', 'path', 'query', 'cookie', 'body'] }),
      attr('description', 'string', 'Description (alternatively put it in the element body).'),
      attr('format', 'string', 'Data format, e.g. uuid, email, date-time.'),
      attr('enum', 'string', 'Comma-separated list of allowed values.'),
      attr('pattern', 'string', 'Regex the value must match.'),
      attr('minimum', 'string', 'Minimum numeric value.'),
      attr('maximum', 'string', 'Maximum numeric value.'),
      attr('minlength', 'string', 'Minimum string length.'),
      attr('maxlength', 'string', 'Maximum string length.'),
      attr('example', 'string', 'Example value.'),
      attr('collapsible', 'boolean', 'Render nested wc-field children as a collapsible section.'),
      attr('pre', 'string', 'Comma-separated labels shown before the field name.'),
      attr('post', 'string', 'Comma-separated labels shown after the field name and flags.'),
      attr('placeholder', 'string', 'Placeholder / example input text shown under the description.'),
    ],
    'markdown', 'Field description (inline Markdown). May also contain nested wc-field elements.',
    `<wc-fields title="Parameters">
<wc-field name="user_id" type="string" in="path" required>
ID of the user.
</wc-field>
</wc-fields>`,
    { parents: ['wc-fields', 'wc-response-fields', 'wc-schema', 'wc-field'], children: ['wc-field'] }),

  def('wc-response-fields', 'data',
    'Like wc-fields but titled for response bodies.',
    [
      attr('title', 'string', 'Section header text.'),
      attr('header', 'string', 'Alias of title.'),
    ],
    'children', 'wc-field elements.',
    `<wc-response-fields title="Response">
<wc-field name="id" type="number">Unique identifier.</wc-field>
<wc-field name="status" type="string">Account status.</wc-field>
</wc-response-fields>`,
    { children: ['wc-field'] }),

  def('wc-responses', 'data',
    'Status-code table container; holds wc-response rows.',
    [],
    'children', 'wc-response elements.',
    `<wc-responses>
<wc-response code="200" description="Success" content-type="application/json"></wc-response>
<wc-response code="404" description="User not found"></wc-response>
</wc-responses>`,
    { children: ['wc-response'] }),

  def('wc-response', 'data',
    'One HTTP status-code row inside wc-responses.',
    [
      attr('code', 'string', 'HTTP status code, e.g. 200 (colored by class 2xx/3xx/4xx/5xx).', { required: true }),
      attr('description', 'string', 'What the response means.'),
      attr('content-type', 'string', 'Response media type, e.g. application/json.'),
    ],
    'none', 'No content.',
    `<wc-responses>
<wc-response code="201" description="Created"></wc-response>
</wc-responses>`,
    { parents: ['wc-responses'] }),

  def('wc-endpoint', 'data',
    'API endpoint header with method badge and URL; body can hold wc-fields, wc-response-fields, wc-responses and wc-code-tab code samples. With ref it is filled from the configured OpenAPI spec at build time.',
    [
      attr('method', 'string', 'HTTP method.', { values: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }),
      attr('url', 'string', 'Endpoint URL path.'),
      attr('ref', 'string', 'OpenAPI operationId to resolve against the spec in docslit.json (openapi). Populates method, url, summary, parameters and responses.'),
      attr('summary', 'string', 'One-line summary rendered in bold above the description.'),
      attr('description', 'string', 'Longer description (inline Markdown).'),
      attr('security', 'string', 'JSON-encoded security requirements.'),
    ],
    'children', 'Optional wc-fields, wc-response-fields, wc-responses, wc-code-tab (code samples) and Markdown.',
    `<wc-endpoint method="POST" url="/api/v1/users" description="Create a new user">
<wc-fields title="Body">
<wc-field name="email" type="string" required>Email address.</wc-field>
</wc-fields>
<wc-code-tab label="cURL">
curl -X POST https://api.example.com/api/v1/users -d '{"email":"a@b.co"}'
</wc-code-tab>
</wc-endpoint>`,
    { children: ['wc-fields', 'wc-response-fields', 'wc-responses', 'wc-code-tab'] }),

  def('wc-api-examples', 'data',
    'Request/response examples panel for an endpoint. Generated by `docslit openapi scaffold`; the data attribute is a JSON blob ({ responses, requestBody }) so it is rarely written by hand.',
    [
      attr('ref', 'string', 'OpenAPI operationId this panel belongs to.'),
      attr('method', 'string', 'HTTP method.', { values: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }),
      attr('url', 'string', 'Endpoint URL path.'),
      attr('data', 'string', 'JSON string of the form {"responses":[...],"requestBody":[...]} with examples.'),
    ],
    'none', 'No content.',
    `<wc-api-examples ref="createUser" method="POST" url="/users" data="{}"></wc-api-examples>`),

  def('wc-runnable-endpoint', 'data',
    'Interactive request builder: readers edit method, URL, headers and body and see the live response (real HTTP request from the browser).',
    [
      attr('method', 'string', 'Initial HTTP method.', { values: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }),
      attr('url', 'string', 'Initial request URL (use a public API or staging endpoint).'),
    ],
    'none', 'No content.',
    `<wc-runnable-endpoint method="GET" url="https://jsonplaceholder.typicode.com/posts/1"></wc-runnable-endpoint>`),

  def('wc-playground', 'data',
    'OpenAPI "Try it" panel with path/query params, auth and a response viewer. Normally generated by `docslit openapi scaffold`.',
    [
      attr('method', 'string', 'HTTP method.', { values: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' }),
      attr('url', 'string', 'Request path.', { default: '/' }),
      attr('server', 'string', 'Base server URL prepended to the path.'),
      attr('proxy', 'string', 'CORS proxy URL (falls back to playground.proxyUrl in docslit.json).'),
      attr('params', 'string', 'JSON array describing parameters.'),
      attr('auth', 'string', 'JSON object describing auth, e.g. {"type":"bearer"}.'),
    ],
    'none', 'No content.',
    `<wc-playground method="GET" url="/users/{id}" server="https://api.example.com"></wc-playground>`),

  def('wc-schema', 'data',
    'Documents a named type/object schema; body holds wc-field rows.',
    [
      attr('type', 'string', 'Type name shown in the header.'),
      attr('description', 'string', 'Description under the header.'),
      attr('extends', 'string', 'Parent type name ("extends X").'),
    ],
    'children', 'wc-field elements describing the properties.',
    `<wc-schema type="User" description="An account holder.">
<wc-field name="id" type="string" required>Unique identifier.</wc-field>
<wc-field name="email" type="string" required>Email address.</wc-field>
</wc-schema>`,
    { children: ['wc-field'] }),

  def('wc-table', 'data',
    'Table helper. Wrap an ordinary Markdown table to add a sticky header and/or a live search box; or build a table from JSON in the headers/rows attributes.',
    [
      attr('headers', 'string', 'JSON array of header strings, e.g. ["Name","Type"]. Use single quotes around the attribute value.'),
      attr('rows', 'string', 'JSON array of row arrays, e.g. [["a","b"]]. Use single quotes around the attribute value.'),
      attr('sticky', 'boolean', 'Keep the header row visible while the table body scrolls (scroll area height: max-height).'),
      attr('searchable', 'boolean', 'Show a search box that filters rows as you type (case-insensitive substring).'),
      attr('placeholder', 'string', 'Placeholder / label for the search box.', { default: 'Filter rows…' }),
      attr('max-height', 'string', 'Maximum height of the scroll area (any CSS length).', { default: '70vh with sticky' }),
    ],
    'markdown', 'A Markdown table (optional; otherwise use headers and rows).',
    `<wc-table sticky searchable placeholder="Filter plants">

| Plant | Light | Water |
| --- | --- | --- |
| Fern | Partial shade | Weekly |
| Monstera | Bright indirect | Weekly |

</wc-table>`),

  def('wc-asciidoc-table', 'data',
    'Table written in AsciiDoc syntax (|=== blocks): cell spans, column specs, multi-line cells, CSV/DSV/TSV input. Rendered to a real table at build time.',
    [
      attr('cols', 'string', 'Comma-separated column specifiers, e.g. "1,2,3" or "3*".'),
      attr('options', 'string', 'Comma-separated options: header, footer, autowidth.'),
      attr('format', 'string', 'Cell data format.', { values: ['psv', 'csv', 'dsv', 'tsv'], default: 'psv' }),
      attr('separator', 'string', 'Override the cell separator.'),
      attr('stripes', 'string', 'Row shading.', { values: ['hover', 'even', 'odd', 'all', 'none'], default: 'hover' }),
      attr('frame', 'string', 'Outer border.', { values: ['all', 'ends', 'sides', 'none'] }),
      attr('grid', 'string', 'Inner lines.', { values: ['all', 'rows', 'cols', 'none'] }),
      attr('width', 'string', 'Table width, e.g. "80%".'),
      attr('caption', 'string', 'Table title.'),
    ],
    'asciidoc', 'AsciiDoc table source delimited by |=== lines.',
    `<wc-asciidoc-table cols="1,2" options="header">
|===
|Flag |Meaning
|\`--strict\` |Treat warnings as errors
|\`--json\` |Machine-readable output
|===
</wc-asciidoc-table>`),

  def('wc-color', 'data',
    'Color swatch; click (or press Enter) to copy the value. Supports any CSS colour and separate light / dark values.',
    [
      attr('value', 'string', 'Colour in any CSS format (hex, rgb, hsl, oklch...). Alias: hex.'),
      attr('hex', 'string', 'Colour in hex, e.g. #3b82f6 (legacy alias of value).'),
      attr('light', 'string', 'Colour shown (and copied) in light mode.'),
      attr('dark', 'string', 'Colour shown (and copied) in dark mode.'),
      attr('name', 'string', 'Display name of the color.'),
      attr('variable', 'string', 'CSS custom property name for this color (copied instead of the value).'),
    ],
    'none', 'No content.',
    `<wc-color value="#3b82f6" name="Primary" variable="--color-primary"></wc-color>`,
    { parents: ['wc-colors', 'wc-color-row'] }),

  def('wc-colors', 'data',
    'Palette container: compact swatch grid, or table with titled rows (wc-color-row).',
    [attr('variant', 'string', 'Layout.', { values: ['compact', 'table'], default: 'compact' })],
    'children', 'wc-color or wc-color-row elements.',
    `<wc-colors variant="compact">
<wc-color name="primary" value="#16a34a"></wc-color>
<wc-color name="surface" light="#ffffff" dark="#0b0b0b"></wc-color>
</wc-colors>`,
    { children: ['wc-color', 'wc-color-row'] }),

  def('wc-color-row', 'data',
    'A titled row of swatches in a table-variant wc-colors.',
    [attr('title', 'string', "The row's label (inline Markdown).")],
    'children', 'wc-color elements.',
    `<wc-colors variant="table">
<wc-color-row title="Brand">
<wc-color name="brand-500" value="#0ea5e9"></wc-color>
<wc-color name="brand-700" value="#0369a1"></wc-color>
</wc-color-row>
</wc-colors>`,
    { parents: ['wc-colors'], children: ['wc-color'] }),

  def('wc-mermaid', 'data',
    'Renders a Mermaid diagram (flowchart, sequence, class, ...) with an expand-to-modal control.',
    [],
    'mermaid', 'Mermaid diagram source.',
    `<wc-mermaid>
graph LR
    A[Write Markdown] --> B[docslit build]
    B --> C[Static HTML]
</wc-mermaid>`),

  // ── Cards & buttons ──────────────────────────────────────────────────────
  def('wc-card', 'content',
    'Content card with optional icon, image, call-to-action and callout theme. Links when href is set; a plain box otherwise.',
    [
      attr('title', 'string', 'Card heading (inline Markdown).'),
      attr('href', 'string', 'Link destination (page slug or external URL). External links open in a new tab.'),
      attr('icon', 'string', 'Icon: Lucide / Font Awesome name, emoji, image URL or inline <svg> (see wc-icon).'),
      attr('icon-name', 'string', 'Legacy alias of icon for named icons.'),
      attr('icon-color', 'string', 'Icon colour (any CSS colour).'),
      attr('icon-color-dark', 'string', 'Icon colour used in dark mode (icon-color is then the light-mode colour).'),
      attr('icon-size', 'number', 'Icon box size in pixels.', { default: '36' }),
      attr('icon-position', 'string', 'Where the icon sits relative to the text.', { values: ['top', 'left'], default: 'top' }),
      attr('horizontal', 'boolean', 'Compact horizontal layout (icon on the left).'),
      attr('img', 'string', 'Image URL/path shown on the card.'),
      attr('img-position', 'string', 'Where the image sits.', { values: ['top', 'left', 'right', 'bottom'], default: 'top' }),
      attr('cta', 'string', 'Call-to-action text shown at the bottom (with an arrow).'),
      attr('arrow', 'string', 'Show ("true") or hide ("false") the corner arrow. Default: shown for external links only.', { values: ['true', 'false'] }),
      attr('type', 'string', 'Callout-style colour theme for the card.', { values: ['info', 'warning', 'note', 'tip', 'check', 'danger'] }),
    ],
    'markdown', 'Card body text.',
    `<wc-card title="Quickstart" href="quickstart" icon="rocket" cta="Start now">
Go from zero to a live site in minutes.
</wc-card>`),

  def('wc-tiles', 'content',
    'Responsive grid that lays out wc-tile (or wc-card) children.',
    [attr('cols', 'number', 'Number of columns. Defaults to automatic sizing.')],
    'children', 'wc-tile or wc-card elements.',
    `<wc-tiles cols="2">
<wc-tile href="installation" icon="package" title="Installation" description="Install the CLI."></wc-tile>
<wc-tile href="quickstart" icon="zap" title="Quickstart" description="Build your first site."></wc-tile>
</wc-tiles>`,
    { children: ['wc-tile', 'wc-card'] }),

  def('wc-tile', 'content',
    'Link tile. Compact (icon, title, description) by default; put an image or SVG inside to get a larger visual preview above the title.',
    [
      attr('title', 'string', 'Tile heading (inline Markdown).', { required: true }),
      attr('description', 'string', 'Short description under the title.'),
      attr('href', 'string', 'Link destination.'),
      attr('icon', 'string', 'Icon: Lucide / Font Awesome name, emoji, image URL (see wc-icon).'),
      attr('icon-name', 'string', 'Legacy alias of icon for named icons.'),
    ],
    'markdown', 'Optional preview content (an image or SVG). Omit for the compact icon layout.',
    `<wc-tile title="API reference" description="Every endpoint." href="api/overview" icon="book"></wc-tile>

<wc-tile title="Dashboard" description="With a preview." href="dashboard">

![Dashboard](https://example.com/dashboard.png)

</wc-tile>`,
    { parents: ['wc-tiles'] }),

  def('wc-button', 'content',
    'Call-to-action button/link with variants, icons and state flags.',
    [
      attr('label', 'string', 'Button text. Defaults to the element body.'),
      attr('href', 'string', 'Link destination (renders an <a>).'),
      attr('variant', 'string', 'Visual style (colour intent).', { values: ['primary', 'outline', 'ghost', 'danger', 'success', 'warning', 'none'], default: 'primary' }),
      attr('size', 'string', 'Button size.', { values: ['sm', 'md', 'lg'], default: 'md' }),
      attr('target', 'string', 'Link target (_blank adds rel=noopener noreferrer).'),
      attr('outlined', 'boolean', 'Transparent background with a coloured border.'),
      attr('minimal', 'boolean', 'Subtle tinted background, no border.'),
      attr('full', 'boolean', 'Full-width button.'),
      attr('rounded', 'boolean', 'Pill-shaped corners.'),
      attr('mono', 'boolean', 'Monospace label.'),
      attr('active', 'boolean', 'Show the active (pressed) ring.'),
      attr('disabled', 'boolean', 'Disable the button.'),
      attr('icon', 'string', 'Icon before the label (see wc-icon for accepted values).'),
      attr('right-icon', 'string', 'Icon after the label.'),
    ],
    'text', 'Button text (alternative to the label attribute).',
    `<wc-button href="quickstart" variant="success" icon="rocket" right-icon="arrow-right" rounded>Get started</wc-button>`),

  def('wc-prompt', 'content',
    'Copyable AI-prompt card with a Copy button and optional open-in-assistant actions.',
    [
      attr('title', 'string', 'Header label.', { default: 'AI Prompt' }),
      attr('description', 'string', 'Text displayed in the card (inline Markdown). When set, the element body is NOT shown but is what gets copied / sent.'),
      attr('icon', 'string', 'Icon before the title (see wc-icon for accepted values). Default: a sparkle.'),
      attr('actions', 'string', 'Open-in buttons: comma-separated cursor, claude, chatgpt, or a JSON array that may include custom { "label", "url", "icon" } objects ({prompt} in url is replaced by the URL-encoded prompt). The Copy button is always present.'),
      attr('single-line', 'boolean', 'Truncate the preview to one line.'),
      attr('hide-prompt', 'boolean', 'Hide the prompt body; show only the header with its actions.'),
    ],
    'text', 'The prompt text; the Copy button copies it.',
    `<wc-prompt title="Ask your assistant" actions="claude,chatgpt">
Write a quickstart page for my project using DocsLit components.
</wc-prompt>`),

  def('wc-embed', 'media',
    'Responsive embed for video and iframes: fixed aspect ratio (no layout shift), lazy loading, and a privacy-friendly facade for YouTube / Vimeo / Loom (nothing is requested from the provider until the reader presses play). Also plays self-hosted video files.',
    [
      attr('src', 'string', 'Embed URL (YouTube, Vimeo, Loom, any iframe URL) or a video file (.mp4, .webm...).', { required: true }),
      attr('title', 'string', 'Accessible title of the embed (also shown on the facade).'),
      attr('ratio', 'string', 'Aspect ratio, e.g. 16/9, 4/3, 1/1, 21/9.', { default: '16/9' }),
      attr('height', 'string', 'Fixed height (px or any CSS length) instead of an aspect ratio.'),
      attr('poster', 'string', 'Poster image: shown behind the facade / as the video poster (a local image keeps the facade request-free).'),
      attr('allow', 'string', 'iframe allow attribute (permissions policy).'),
      attr('autoplay', 'boolean', 'Video files only: autoplay (needs muted; ignored when the reader prefers reduced motion).'),
      attr('muted', 'boolean', 'Video files only: start muted.'),
      attr('loop', 'boolean', 'Video files only: loop.'),
      attr('controls', 'string', 'Video files only: set to "false" to hide controls.', { values: ['true', 'false'] }),
    ],
    'none', 'No content.',
    `<wc-embed src="https://www.youtube.com/embed/4KzFe50RQkQ" title="Product tour" ratio="16/9"></wc-embed>`),

  def('wc-github-repo', 'media',
    'GitHub repository card. Renders instantly from attributes; unless live="false" it then fetches stars, forks, language and description from the public GitHub API (cached for an hour, fails silently offline, space is reserved so nothing shifts).',
    [
      attr('repo', 'string', 'owner/name or a full github.com URL.', { required: true }),
      attr('variant', 'string', 'Card style.', { values: ['inset', 'flat'], default: 'inset' }),
      attr('description', 'string', 'Static description (overrides the fetched one).'),
      attr('stars', 'string', 'Static star count (overrides the fetched one).'),
      attr('forks', 'string', 'Static fork count.'),
      attr('language', 'string', 'Static primary language.'),
      attr('live', 'string', 'Set to "false" to never contact the GitHub API (privacy / offline docs).', { values: ['true', 'false'], default: 'true' }),
    ],
    'none', 'No content.',
    `<wc-github-repo repo="UmbrellaDocs/docslit-cli" description="Static docs generator" stars="120" live="false"></wc-github-repo>`),

  def('wc-walkthrough', 'navigation',
    'Scroll walkthrough: prose steps beside a sticky code panel that follows the reader\'s scroll. Each step names a file and the lines to focus (dim the rest) or highlight. Fenced code blocks inside the element are the files (give each a title). On narrow screens each step shows its own code inline; the panel respects reduced motion and the prose reads fine without JavaScript.',
    [
      attr('layout', 'string', 'Column split; wide gives the code panel more room.', { values: ['default', 'wide'], default: 'default' }),
      attr('panel-height', 'string', 'Height of the code panel (any CSS length).', { default: 'min(70vh, 34rem)' }),
      attr('dim', 'string', 'Fade inactive steps; set "false" to keep them fully visible.', { values: ['true', 'false'], default: 'true' }),
      attr('data-name', 'string', 'Set by the build step on each file panel: the file title.'),
    ],
    'children', 'wc-walkthrough-step elements followed by one fenced code block per file (title="name").',
    `<wc-walkthrough>
<wc-walkthrough-step title="Create the client" file="client.js" focus="1-3">
Import the SDK and construct a client.
</wc-walkthrough-step>
<wc-walkthrough-step title="Send a request" file="client.js" highlight="5-7">
Call the API.
</wc-walkthrough-step>

\`\`\`js title="client.js"
import { Client } from 'sdk';
const client = new Client({ key: 'KEY' });
export default client;

const res = await client.get('/plants');
console.log(res.data);
\`\`\`
</wc-walkthrough>`,
    { children: ['wc-walkthrough-step', 'wc-walkthrough-substep'] }),

  def('wc-walkthrough-step', 'navigation',
    'A step in a wc-walkthrough: prose plus the file and lines it targets while it is in view.',
    [
      attr('title', 'string', 'Step heading (inline Markdown).'),
      attr('description', 'string', 'Short summary under the title.'),
      attr('file', 'string', 'Target file: a file title or its 0-based index. Omitted: keeps the previous step\'s file.'),
      attr('focus', 'string', 'Lines to focus, dimming the rest: "1-5,8".'),
      attr('highlight', 'string', 'Lines to highlight with an accent background, e.g. "3,5-6".'),
      attr('start-line', 'string', 'Line the panel scrolls to (default: the first focused / highlighted line).'),
    ],
    'markdown', 'Step prose; may contain wc-walkthrough-substep elements.',
    `<wc-walkthrough>
<wc-walkthrough-step title="Intro" focus="1">
Start here.
</wc-walkthrough-step>

\`\`\`js title="a.js"
console.log('hi');
\`\`\`
</wc-walkthrough>`,
    { parents: ['wc-walkthrough'], children: ['wc-walkthrough-substep'] }),

  def('wc-walkthrough-substep', 'navigation',
    'A finer-grained target inside a wc-walkthrough-step; it takes over the code panel while it is in view.',
    [
      attr('title', 'string', 'Short heading above the substep prose.'),
      attr('file', 'string', 'Target file (default: the parent step\'s file).'),
      attr('focus', 'string', 'Lines to focus: "1-5,8".'),
      attr('highlight', 'string', 'Lines to highlight.'),
      attr('start-line', 'string', 'Line the panel scrolls to.'),
    ],
    'markdown', 'Substep prose.',
    `<wc-walkthrough>
<wc-walkthrough-step title="Config" file="a.js">
Two settings:
<wc-walkthrough-substep focus="1">The key.</wc-walkthrough-substep>
<wc-walkthrough-substep focus="2">The region.</wc-walkthrough-substep>
</wc-walkthrough-step>

\`\`\`js title="a.js"
const key = 'k';
const region = 'eu';
\`\`\`
</wc-walkthrough>`,
    { parents: ['wc-walkthrough-step'] }),

  // ── Utility ──────────────────────────────────────────────────────────────
  def('wc-anchor', 'utility',
    'Linkable heading-like block: shows a "#" link on hover to copy a deep link.',
    [attr('id', 'string', 'Anchor id. Defaults to a slug of the text content.')],
    'text', 'The anchored text.',
    `<wc-anchor id="important-section">Important section</wc-anchor>`),

  def('wc-indent', 'utility',
    'Indented block with a left border, for nested or secondary content.',
    [
      attr('level', 'number', 'Indentation depth.', { default: '1' }),
      attr('color', 'string', 'Border color (any CSS color).'),
    ],
    'markdown', 'Indented content.',
    `<wc-indent level="1">
Nested explanation text.
</wc-indent>`),

  def('wc-visibility', 'utility',
    'Badge/section that marks content as available for a version or role.',
    [
      attr('version', 'string', 'Version the content applies to.'),
      attr('role', 'string', 'Role the content applies to.'),
      attr('show', 'boolean', 'Reserved visibility flag.'),
    ],
    'markdown', 'Optional content the badge applies to.',
    `<wc-visibility version="0.2" role="admin"></wc-visibility>`),

  def('wc-versions', 'utility',
    'Version switcher that shows one wc-version child at a time.',
    [attr('default', 'string', 'name of the wc-version shown first (defaults to the first child).')],
    'children', 'wc-version elements.',
    `<wc-versions default="0.2">
<wc-version name="0.2">New behavior.</wc-version>
<wc-version name="0.1">Old behavior.</wc-version>
</wc-versions>`,
    { children: ['wc-version'] }),

  def('wc-version', 'utility',
    'Content for one version inside wc-versions.',
    [attr('name', 'string', 'Version label shown on the switcher button (the docs site text says "version", but the attribute is name).', { required: true })],
    'markdown', 'Content for this version.',
    `<wc-versions>
<wc-version name="1.0">Content for 1.0.</wc-version>
</wc-versions>`,
    { parents: ['wc-versions'] }),

  def('wc-page-meta', 'utility',
    'Inline metadata bar (tag, component, read time, updated). Frontmatter renders this automatically; use only for ad-hoc placement.',
    [
      attr('tag', 'string', 'Category label.'),
      attr('component', 'string', 'Technology or component name.'),
      attr('readtime', 'string', 'Reading time text, e.g. "3 min read".'),
      attr('updated', 'string', 'Last-updated text.'),
    ],
    'none', 'No content.',
    `<wc-page-meta tag="Guide" component="Lit" readtime="3 min read" updated="May 2026"></wc-page-meta>`),

  // ── Authoring (compile-time) ─────────────────────────────────────────────
  def('wc-include', 'authoring',
    'Compile-time include of a reusable Markdown snippet from docs/_reusables. Must be self-closing; the included file cannot itself contain wc-include and its frontmatter is ignored.',
    [attr('src', 'string', 'Path of the snippet. Resolved under docs/_reusables (e.g. "snippet.md" or "_reusables/snippet.md"). Any other attribute is a snippet prop: it fills the matching {{name}} placeholder inside the snippet (<wc-include src="water.md" plant="fern" />).', { required: true })],
    'none', 'None. Write it self-closing: <wc-include src="..." />',
    `<wc-include src="snippet.md" />`,
    { selfClosing: true }),

  def('wc-if', 'authoring',
    'Compile-time conditional content. Evaluated at build time: excluded content never reaches the HTML, the search index or the generated .md / llms output. Conditions: version (versioned builds), locale, an attributes variable, and audience (humans vs AI agents). All given conditions must hold.',
    [
      attr('version', 'string', 'Comma-separated versions; true when the build is for one of them.'),
      attr('locale', 'string', 'Comma-separated locales; true for pages under docs.<locale>/ (default locale: en).'),
      attr('attr', 'string', 'Name of an attributes variable (docslit.json attributes or page frontmatter). Alone: true when set and not empty / false / 0.'),
      attr('equals', 'string', 'With attr: comma-separated values the variable must equal.'),
      attr('not-equals', 'string', 'With attr: values the variable must not equal.'),
      attr('not', 'boolean', 'Invert the version / locale / attr condition.'),
      attr('for', 'string', 'Audience: humans = HTML only (dropped from the agent Markdown); agents = agent Markdown only (hidden on the web).', { values: ['humans', 'agents'] }),
    ],
    'markdown', 'Content to include when the condition holds. Leave blank lines around block Markdown.',
    `<wc-if version="2.0">
Only in the 2.0 docs.
</wc-if>

<wc-if for="agents">
Machine-readable hint that only appears in the generated Markdown.
</wc-if>`),
];

export function getComponentManifest() {
  return MANIFEST.map((c) => structuredClone(c));
}

export function getComponent(tag) {
  if (!tag) return null;
  const t = String(tag).toLowerCase();
  const found = MANIFEST.find((c) => c.tag === t || c.tag === `wc-${t}`);
  return found ? structuredClone(found) : null;
}

export function listComponentTags() {
  return MANIFEST.map((c) => c.tag);
}

export function getCategoryLabels() {
  return { ...CATEGORY_LABELS };
}
