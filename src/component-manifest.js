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
    'Highlighted block for tips, warnings, notes and other asides. Body supports full Markdown.',
    [
      attr('type', 'string', 'Visual style of the callout.', { values: ['info', 'tip', 'warning', 'error', 'success', 'note'], default: 'info' }),
      attr('title', 'string', 'Heading shown at the top of the callout. Omit for body-only.'),
    ],
    'markdown', 'Callout body. Leave a blank line after the opening tag to use block Markdown (lists, code).',
    `<wc-callout type="warning" title="Heads up">
Back up your \`docslit.json\` before running a migration.
</wc-callout>`),

  def('wc-alert', 'callouts',
    'Alias of wc-callout (same attributes and behavior).',
    [
      attr('type', 'string', 'Visual style.', { values: ['info', 'tip', 'warning', 'error', 'success', 'note'] }),
      attr('title', 'string', 'Heading shown at the top.'),
    ],
    'markdown', 'Alert body.',
    `<wc-alert type="error" title="Breaking change">
The \`--legacy\` flag was removed.
</wc-alert>`),

  def('wc-banner', 'callouts',
    'Full-width notice strip, optionally dismissible. Good for announcements inside a page.',
    [
      attr('type', 'string', 'Visual style.', { values: ['info', 'warning', 'error', 'success', 'neutral'], default: 'neutral' }),
      attr('dismissible', 'boolean', 'Show a close button so readers can dismiss the banner.'),
    ],
    'markdown', 'Banner message.',
    `<wc-banner type="info" dismissible>
Version 2.0 is now available.
</wc-banner>`),

  def('wc-badge', 'callouts',
    'Small inline pill for status or category labels (Stable, Beta, Deprecated...).',
    [
      attr('variant', 'string', 'Color scheme.', { values: ['default', 'success', 'warning', 'danger', 'info', 'neutral', 'purple'], default: 'default' }),
      attr('label', 'string', 'Badge text. If omitted, the element body is used.'),
    ],
    'text', 'Badge text (alternative to the label attribute).',
    `<wc-badge variant="success">Stable</wc-badge>`),

  def('wc-tooltip', 'callouts',
    'Inline text with a hover tooltip.',
    [
      attr('text', 'string', 'Tooltip content shown on hover.', { required: true }),
      attr('position', 'string', 'Where the tooltip appears.', { values: ['top', 'bottom'], default: 'top' }),
    ],
    'text', 'The inline text the tooltip is attached to.',
    `DocsLit uses <wc-tooltip text="A library for building web components">Lit</wc-tooltip> under the hood.`),

  def('wc-update', 'callouts',
    'Changelog entry with a version, date and change-type badge.',
    [
      attr('version', 'string', 'Version number for this change.', { required: true }),
      attr('type', 'string', 'Change type badge.', { values: ['added', 'changed', 'fixed', 'removed', 'deprecated', 'security'] }),
      attr('date', 'string', 'Release date (free-form text).'),
    ],
    'markdown', 'Description of the change.',
    `<wc-update version="1.2.0" date="May 2026" type="added">
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
    'Bordered frame around an image or other content, with an optional caption.',
    [
      attr('caption', 'string', 'Caption displayed below the content.'),
      attr('border', 'boolean', 'Draw a border around the framed content.'),
    ],
    'markdown', 'Framed content, typically an image.',
    `<wc-frame caption="The dashboard overview">

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
    'Lightweight collapsible section.',
    [
      attr('title', 'string', 'Clickable heading that toggles the section.'),
      attr('open', 'boolean', 'Expand the section by default.'),
    ],
    'markdown', 'Hidden content revealed on expand.',
    `<wc-expandable title="Show advanced options">
Set \`DEBUG=1\` to enable verbose logs.
</wc-expandable>`),

  def('wc-accordion', 'layout',
    'Collapsible FAQ-style item. Usually placed inside wc-accordion-group.',
    [
      attr('title', 'string', 'Clickable heading text that toggles the item.', { required: true }),
    ],
    'markdown', 'Answer or detail content.',
    `<wc-accordion title="Which Node.js version do I need?">
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
    'Side note or related-links box set apart from the main flow.',
    [attr('title', 'string', 'Aside heading.')],
    'markdown', 'Aside content.',
    `<wc-aside title="Related">
See also the [quickstart](quickstart).
</wc-aside>`),

  // ── Steps & tabs ─────────────────────────────────────────────────────────
  def('wc-steps', 'navigation',
    'Numbered step-by-step procedure. Steps are numbered automatically.',
    [],
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
    'A single step inside wc-steps.',
    [
      attr('title', 'string', 'Step heading shown next to the step number.', { required: true }),
      attr('n', 'number', 'Override the auto-generated step number.'),
    ],
    'markdown', 'Step instructions (full Markdown including code blocks).',
    `<wc-steps>
<wc-step title="Build">
Run \`docslit build\`.
</wc-step>
</wc-steps>`,
    { parents: ['wc-steps'] }),

  def('wc-tabs', 'navigation',
    'Tabbed content switcher for alternative instructions.',
    [SYNC_ATTR],
    'children', 'One or more wc-tab elements.',
    `<wc-tabs>
<wc-tab label="npm">

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
    [attr('label', 'string', 'Text of the tab button.', { required: true })],
    'markdown', 'Tab content (full Markdown). Leave blank lines around fenced code blocks.',
    `<wc-tabs>
<wc-tab label="macOS">
Use Homebrew.
</wc-tab>
</wc-tabs>`,
    { parents: ['wc-tabs'] }),

  def('wc-view', 'navigation',
    'Toggle between alternative views (for example a language or platform switcher) of the same content.',
    [],
    'children', 'One or more wc-view-panel elements.',
    `<wc-view>
<wc-view-panel label="REST">
Call the HTTP API directly.
</wc-view-panel>
<wc-view-panel label="SDK">
Use the client library.
</wc-view-panel>
</wc-view>`,
    { children: ['wc-view-panel'] }),

  def('wc-view-panel', 'navigation',
    'A single panel inside wc-view.',
    [attr('label', 'string', 'Text of the toggle button for this panel.', { required: true })],
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
    'Syntax-highlighted code with copy button, optional filename header and line numbers. Plain fenced code blocks (```lang) are usually preferred; use this tag when you need attributes like filename.',
    [
      attr('language', 'string', 'Highlighting language, e.g. javascript, python, bash, json, html, css.'),
      attr('filename', 'string', 'Filename displayed in the header bar.'),
      attr('linenumbers', 'string', 'Set to "true" to show line numbers.', { values: ['true', 'false'] }),
      attr('highlighted', 'boolean', 'Content is already syntax highlighted HTML (set by the build; rarely written by hand).'),
    ],
    'code', 'Raw code, shown verbatim (not parsed as Markdown).',
    `<wc-code-block language="json" filename="package.json" linenumbers="true">
{
  "name": "my-docs",
  "private": true
}
</wc-code-block>`),

  def('wc-code-group', 'code',
    'Tabbed group of code snippets (e.g. one per package manager or language).',
    [{ ...SYNC_ATTR }],
    'children', 'One or more wc-code-tab elements.',
    `<wc-code-group>
<wc-code-tab label="npm">npm install docslit</wc-code-tab>
<wc-code-tab label="pnpm">pnpm add docslit</wc-code-tab>
</wc-code-group>`,
    { children: ['wc-code-tab'] }),

  def('wc-code-tab', 'code',
    'A single labelled snippet inside wc-code-group (or wc-endpoint). Content is raw text, not Markdown.',
    [attr('label', 'string', 'Tab label.', { required: true })],
    'code', 'Raw code or command text (not parsed as Markdown).',
    `<wc-code-group>
<wc-code-tab label="yarn">yarn add docslit</wc-code-tab>
</wc-code-group>`,
    { parents: ['wc-code-group', 'wc-endpoint'] }),

  // ── Media & files ────────────────────────────────────────────────────────
  def('wc-icon', 'media',
    'Inline icon: one of 33 built-in SVG icons, or any free Font Awesome 6 icon (fetched from the jsDelivr CDN when the page is viewed, so it needs a network connection and will not render offline).',
    [
      attr('name', 'string', 'Built-in icon name (e.g. check, x, warning, info, error, arrow-right, chevron-down, external-link, link, copy, download, code, terminal, file, folder, search, star, zap, book, settings, user, home, grid, list, eye, lock, package, globe, cpu), or a Font Awesome icon as a bare name ("github", "gear") or class string ("fa-brands fa-github", "fa-solid fa-gear", "far fa-star"; fa-solid/fas, fa-regular/far and fa-brands/fab are understood, size and animation modifiers such as fa-lg are ignored). A bare name picks the brands set for well-known brands (github, docker, npm, slack…), otherwise solid.', { required: true }),
      attr('size', 'number', 'Icon size in pixels.'),
      attr('color', 'string', 'Icon color (any CSS color).'),
    ],
    'none', 'No content.',
    `<wc-icon name="zap" size="20" color="#ff6600"></wc-icon>`),

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
    'A directory node in a wc-files tree; may contain wc-dir and wc-file.',
    [
      attr('name', 'string', 'Directory name.', { required: true }),
      attr('open', 'boolean', 'Expand the directory by default.', { default: 'false' }),
    ],
    'children', 'Nested wc-dir and wc-file elements.',
    `<wc-files>
<wc-dir name="src" open>
<wc-file name="index.js"></wc-file>
</wc-dir>
</wc-files>`,
    { parents: ['wc-files', 'wc-dir'], children: ['wc-dir', 'wc-file'] }),

  def('wc-file', 'media',
    'A file node in a wc-files tree.',
    [
      attr('name', 'string', 'File name.', { required: true }),
      attr('highlight', 'boolean', 'Highlight this file to draw attention.', { default: 'false' }),
      attr('comment', 'string', 'Short comment displayed after the file name.'),
    ],
    'none', 'No content.',
    `<wc-files>
<wc-file name="docslit.json" highlight comment="site config"></wc-file>
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
    'Download link styled as a button.',
    [
      attr('href', 'string', 'URL or path of the file to download.', { required: true }),
      attr('filename', 'string', 'Suggested filename for the download.'),
      attr('label', 'string', 'Link text. Defaults to the filename, then "Download".'),
      attr('size', 'string', 'File size text shown in parentheses, e.g. "2.4 MB".'),
    ],
    'none', 'No content (use the label attribute).',
    `<wc-download href="/files/report.pdf" filename="report.pdf" label="Download report" size="2.4 MB"></wc-download>`),

  def('wc-copy', 'media',
    'Click-to-copy button that copies a string to the clipboard.',
    [
      attr('text', 'string', 'The text copied to the clipboard.', { required: true }),
      attr('label', 'string', 'Button label. Defaults to the text.'),
    ],
    'none', 'No content (use the label attribute).',
    `<wc-copy text="npm install -g docslit" label="Copy install command"></wc-copy>`),

  def('wc-image', 'media',
    'Lazy-loaded image with click-to-zoom lightbox and optional dark-mode variant.',
    [
      attr('src', 'string', 'Image URL or path.', { required: true }),
      attr('alt', 'string', 'Alternative text (always provide it).'),
      attr('dark-src', 'string', 'Image to show instead when the dark theme is active.'),
      attr('width', 'number', 'Width in pixels.'),
      attr('height', 'number', 'Height in pixels.'),
    ],
    'none', 'No content.',
    `<wc-image src="/images/architecture.png" dark-src="/images/architecture-dark.png" alt="System architecture" width="800"></wc-image>`),

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
    'Table rendered from JSON passed in attributes (the component reads only the headers/rows attributes; the docs site shows a JSON-body form that the component source does not implement). For ordinary tables prefer GFM Markdown tables.',
    [
      attr('headers', 'string', 'JSON array of header strings, e.g. ["Name","Type"]. Use single quotes around the attribute value.'),
      attr('rows', 'string', 'JSON array of row arrays, e.g. [["a","b"]]. Use single quotes around the attribute value.'),
    ],
    'none', 'No content; data comes from the headers and rows attributes.',
    `<wc-table headers='["Command","Description"]' rows='[["init","Scaffold a project"],["build","Build the static site"]]'></wc-table>`),

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
    'Color swatch; click to copy the hex value. Useful for design-system docs.',
    [
      attr('hex', 'string', 'Color in hex, e.g. #3b82f6.', { required: true }),
      attr('name', 'string', 'Display name of the color.'),
      attr('variable', 'string', 'CSS custom property name for this color.'),
    ],
    'none', 'No content.',
    `<wc-color hex="#3b82f6" name="Primary" variable="--color-primary"></wc-color>`),

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
    'Clickable content card with optional icon and title.',
    [
      attr('title', 'string', 'Card heading.'),
      attr('href', 'string', 'Link destination (page slug or external URL).'),
      attr('icon-name', 'string', 'Built-in icon name displayed on the card.'),
      attr('icon', 'string', 'Emoji or text icon (use icon-name for named icons).'),
    ],
    'markdown', 'Card body text.',
    `<wc-card title="Quickstart" href="quickstart" icon-name="zap">
Go from zero to a live site in minutes.
</wc-card>`),

  def('wc-tiles', 'content',
    'Responsive grid that lays out wc-tile (or wc-card) children.',
    [attr('cols', 'number', 'Number of columns. Defaults to automatic sizing.')],
    'children', 'wc-tile or wc-card elements.',
    `<wc-tiles cols="2">
<wc-tile href="installation" icon-name="package" title="Installation" description="Install the CLI."></wc-tile>
<wc-tile href="quickstart" icon-name="zap" title="Quickstart" description="Build your first site."></wc-tile>
</wc-tiles>`,
    { children: ['wc-tile', 'wc-card'] }),

  def('wc-tile', 'content',
    'Compact link tile with icon, title and description.',
    [
      attr('title', 'string', 'Tile heading.', { required: true }),
      attr('description', 'string', 'Short description under the title.'),
      attr('href', 'string', 'Link destination.'),
      attr('icon-name', 'string', 'Built-in icon name shown above the title.'),
      attr('icon', 'string', 'Emoji or text icon.'),
    ],
    'none', 'No content (use the description attribute).',
    `<wc-tile title="API reference" description="Every endpoint." href="api/overview" icon-name="book"></wc-tile>`,
    { parents: ['wc-tiles'] }),

  def('wc-button', 'content',
    'Call-to-action button/link.',
    [
      attr('label', 'string', 'Button text.', { required: true }),
      attr('href', 'string', 'Link destination.'),
      attr('variant', 'string', 'Visual style.', { values: ['primary', 'outline', 'ghost', 'danger'], default: 'primary' }),
      attr('size', 'string', 'Button size.', { values: ['sm', 'md', 'lg'], default: 'md' }),
    ],
    'none', 'No content (use the label attribute).',
    `<wc-button label="Get started" href="quickstart" variant="primary" size="md"></wc-button>`),

  def('wc-prompt', 'content',
    'Copyable AI-prompt block with a Copy button. Use it to give readers a ready-made prompt for an AI assistant.',
    [attr('title', 'string', 'Header label.', { default: 'AI Prompt' })],
    'text', 'The prompt text; the Copy button copies the element text.',
    `<wc-prompt title="Ask your assistant">
Write a quickstart page for my project using DocsLit components.
</wc-prompt>`),

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
    [attr('src', 'string', 'Path of the snippet. Resolved under docs/_reusables (e.g. "snippet.md" or "_reusables/snippet.md").', { required: true })],
    'none', 'None. Write it self-closing: <wc-include src="..." />',
    `<wc-include src="snippet.md" />`,
    { selfClosing: true }),
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
