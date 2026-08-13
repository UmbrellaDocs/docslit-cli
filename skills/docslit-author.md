# DocsLit Authoring Skill

You are an expert at writing documentation pages for DocsLit, a static documentation site generator that uses Markdown with `wc-*` web components. Follow these rules exactly to produce valid DocsLit markup.

## Page Structure

Every page is a Markdown file (`.md`) in the `docs/` directory. Pages start with YAML frontmatter:

```yaml
---
title: Page Title
description: Short description for SEO and search
sidebar_title: Short Nav Label
tag: category
readtime: 3 min read
updated: 2025-01-15
---
```

Only `title` is required. All other fields are optional.

Pages are registered in `docslit.json`:

```json
{
  "name": "My Docs",
  "description": "Site description for SEO",
  "url": "https://docs.example.com",
  "sidebar": [
    {
      "group": "Getting Started",
      "pages": ["introduction", "quickstart", "guides/setup"]
    }
  ]
}
```

Page IDs map to files: `"quickstart"` → `docs/quickstart.md`, `"guides/setup"` → `docs/guides/setup.md`.

## Component Reference

All components use `<wc-*>` tags directly in Markdown. Leave a blank line before and after block-level components.

### Callouts & Alerts

```markdown
<wc-callout type="info" title="Note">
Markdown content inside callouts is rendered normally.
</wc-callout>
```

Types: `info`, `warning`, `error`, `success`, `tip`, `note`

```markdown
<wc-banner type="warning" dismissible>
Site-wide banner message.
</wc-banner>
```

### Cards & Tiles

```markdown
<wc-tiles cols="3">
<wc-tile title="Quick Start" description="Get up and running" href="/docs/quickstart" icon-name="zap"></wc-tile>
<wc-tile title="API Reference" description="Full API docs" href="/docs/api" icon-name="book"></wc-tile>
<wc-tile title="Examples" description="Code samples" href="/docs/examples" icon-name="code"></wc-tile>
</wc-tiles>
```

Cards support Markdown content inside:

```markdown
<wc-card title="Feature" href="/docs/feature" icon-name="star">
Rich **Markdown** description with [links](/docs/other).
</wc-card>
```

### Tabs

```markdown
<wc-tabs>
<wc-tab label="JavaScript">

```js
console.log("Hello");
```

</wc-tab>
<wc-tab label="Python">

```python
print("Hello")
```

</wc-tab>
</wc-tabs>
```

### Code Groups (tabbed code blocks)

```markdown
<wc-code-group>
<wc-code-tab label="npm">
npm install @docslit/cli
</wc-code-tab>
<wc-code-tab label="yarn">
yarn add @docslit/cli
</wc-code-tab>
</wc-code-group>
```

Content inside `<wc-code-tab>` is treated as raw text, not Markdown.

### Code Blocks

Standard fenced code blocks work. For named files:

```markdown
<wc-code-block language="json" filename="package.json">
{ "name": "my-app" }
</wc-code-block>
```

Variable substitution: use `{{VARIABLE_NAME}}` (all-caps) inside code blocks. Users can click to edit values.

### Steps

```markdown
<wc-steps>
<wc-step title="Install">

Run the install command:

```bash
npm install @docslit/cli
```

</wc-step>
<wc-step title="Configure">

Create a `docslit.json` file in your project root.

</wc-step>
</wc-steps>
```

Steps are auto-numbered. You can set explicit numbers with `n="1"`.

### Accordion

```markdown
<wc-accordion-group>
<wc-accordion title="How do I install?">

Run `npm install @docslit/cli` globally or as a dev dependency.

</wc-accordion>
<wc-accordion title="What Node version do I need?">

Node 24.0.0 or higher is required.

</wc-accordion>
</wc-accordion-group>
```

Single accordion without a group also works.

### API Fields

```markdown
<wc-fields title="Parameters">
<wc-field name="user_id" type="string" required>
The unique identifier for the user.
</wc-field>
<wc-field name="options" type="object">
Optional configuration.

<wc-field name="options.limit" type="number" default="10">
Maximum number of results.
</wc-field>

</wc-field>
</wc-fields>
```

For response bodies:

```markdown
<wc-response-fields>
<wc-field name="id" type="string">Unique ID</wc-field>
<wc-field name="status" type="string">Current status</wc-field>
</wc-response-fields>
```

### API Endpoints

```markdown
<wc-endpoint method="POST" url="/api/v1/users" description="Create a new user">
<wc-code-tab label="cURL">
curl -X POST https://api.example.com/v1/users \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{"name": "Alice"}'
</wc-code-tab>
</wc-endpoint>
```

### Layout

Columns:

```markdown
<wc-columns cols="2" gap="24px">

Left column content with **Markdown**.

Right column content.

</wc-columns>
```

Panel:

```markdown
<wc-panel title="Summary" icon="📋">
Panel content here.
</wc-panel>
```

Aside (floats right on desktop):

```markdown
<wc-aside title="Related">
- [Other page](/docs/other)
- [API reference](/docs/api)
</wc-aside>
```

### File Trees

```markdown
<wc-files>
<wc-dir name="src">
<wc-file name="index.js" highlight comment="entry point"></wc-file>
<wc-file name="config.js"></wc-file>
<wc-dir name="components">
<wc-file name="button.js"></wc-file>
</wc-dir>
</wc-dir>
<wc-file name="package.json"></wc-file>
</wc-files>
```

### Other Components

```markdown
<!-- Badge -->
<wc-badge variant="success">Stable</wc-badge>
<wc-badge variant="warning">Beta</wc-badge>

<!-- Button -->
<wc-button label="Get Started" href="/docs/quickstart" variant="primary" size="md"></wc-button>

<!-- Tooltip -->
<wc-tooltip text="More information here">hover text</wc-tooltip>

<!-- Copy to clipboard -->
<wc-copy text="npm install @docslit/cli" label="Copy install command"></wc-copy>

<!-- Download link -->
<wc-download href="/files/report.pdf" filename="report.pdf" size="2.4 MB"></wc-download>

<!-- Icon (built-in Lucide icons) -->
<wc-icon name="zap" size="20" color="#ff6600"></wc-icon>

<!-- Mermaid diagrams -->
<wc-mermaid>
graph LR
  A[Start] --> B[End]
</wc-mermaid>

<!-- Expandable section -->
<wc-expandable title="Show details" open>
Expanded by default content.
</wc-expandable>

<!-- Version selector -->
<wc-versions default="v2">
<wc-version name="v1">Version 1 content.</wc-version>
<wc-version name="v2">Version 2 content.</wc-version>
</wc-versions>

<!-- Page metadata bar -->
<wc-page-meta tag="API" readtime="5 min" updated="2025-01-15"></wc-page-meta>

<!-- AI prompt block with copy button -->
<wc-prompt title="Try this prompt">
Explain the difference between REST and GraphQL APIs.
</wc-prompt>

<!-- Update/changelog entry -->
<wc-update version="2.1.0" type="added" date="2025-01-15">
New accordion group component.
</wc-update>

<!-- Visibility control -->
<wc-visibility version="2.0" role="admin">
Admin-only content visible from v2.0.
</wc-visibility>

<!-- Indentation -->
<wc-indent level="2" color="#0070f3">
Indented content with colored left border.
</wc-indent>

<!-- Data table (JSON) -->
<wc-table headers='["Method", "Path", "Description"]' rows='[["GET", "/users", "List users"], ["POST", "/users", "Create user"]]'></wc-table>

<!-- AsciiDoc table syntax -->
<wc-asciidoc-table>
[cols="1,2,3",options="header"]
|===
|Method |Path |Description

|GET
|/users
|List users
|===
</wc-asciidoc-table>

<!-- Schema definition -->
<wc-schema type="User" description="A user object" extends="BaseModel">
<wc-field name="id" type="string" required>Unique identifier</wc-field>
<wc-field name="email" type="string" required>Email address</wc-field>
</wc-schema>

<!-- Frame (for images with captions) -->
<wc-frame caption="Architecture diagram" border>

![diagram](./assets/arch.png)

</wc-frame>
```

### Available Icon Names

Built-in Lucide icons: `check`, `x`, `warning`, `info`, `error`, `arrow-right`, `arrow-left`, `arrow-up`, `arrow-down`, `chevron-right`, `chevron-down`, `external-link`, `link`, `copy`, `download`, `code`, `terminal`, `file`, `folder`, `search`, `star`, `zap`, `book`, `settings`, `user`, `home`, `grid`, `list`, `eye`, `lock`, `package`, `globe`, `cpu`

Unmapped names are fetched from Font Awesome CDN at runtime.

## Critical Rules

1. Always leave a blank line before and after block-level `<wc-*>` tags so Markdown renders correctly inside them
2. Content inside `<wc-code-tab>` and `<wc-code-block>` is raw text — never use Markdown syntax there
3. `<wc-tiles>` should only contain `<wc-tile>` or `<wc-card>` children
4. `<wc-code-group>` should only contain `<wc-code-tab>` children
5. `<wc-steps>` should only contain `<wc-step>` children
6. `<wc-tabs>` should only contain `<wc-tab>` children
7. `<wc-fields>` and `<wc-response-fields>` should only contain `<wc-field>` children
8. `<wc-files>` should only contain `<wc-file>` and `<wc-dir>` children
9. `<wc-accordion-group>` should only contain `<wc-accordion>` or `<wc-expandable>` children
10. Use `icon-name` (not `icon`) for card/tile icon references
11. Use `label` (not `title`) for tab labels
12. Variable names in `{{VARNAME}}` must be all uppercase with underscores only
13. Self-closing tags must use `></wc-*>` format, not `/>` — these are HTML custom elements, not JSX
