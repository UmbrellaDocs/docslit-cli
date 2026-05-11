# DocsLit Migration Skill

You are an expert at converting documentation from other platforms (Mintlify, Docusaurus, GitBook, MDX-based sites) into valid DocsLit format. DocsLit uses Markdown with `wc-*` web components instead of MDX/JSX components.

## Core Conversion Rules

### MDX → DocsLit: Component Mapping

| MDX / Mintlify Component | DocsLit Component | Notes |
|---|---|---|
| `<Note>` | `<wc-callout type="info" title="Note">` | Fixed type and title |
| `<Info>` | `<wc-callout type="info" title="Info">` | |
| `<Warning>` | `<wc-callout type="warning" title="Warning">` | |
| `<Danger>` | `<wc-callout type="danger" title="Danger">` | |
| `<Caution>` | `<wc-callout type="warning" title="Caution">` | |
| `<Tip>` | `<wc-callout type="tip" title="Tip">` | |
| `<Check>` | `<wc-callout type="success" title="Check">` | |
| `<Success>` | `<wc-callout type="success" title="Success">` | |
| `<Card>` | `<wc-card>` | `icon` attr → `icon-name` |
| `<CardGroup>` | `<wc-tiles>` | `cols` passes through |
| `<Tabs>` | `<wc-tabs>` | |
| `<Tab>` | `<wc-tab>` | `title` attr → `label` |
| `<Accordion>` | `<wc-accordion>` | `title` passes through |
| `<AccordionGroup>` | `<wc-accordion-group>` | |
| `<Steps>` | `<wc-steps>` | |
| `<Step>` | `<wc-step>` | Auto-number with `n="1"`, `n="2"`, etc. |
| `<CodeGroup>` | `<wc-code-group>` | |
| `<Frame>` | `<wc-frame>` | `caption`, `type` pass through |
| `<Columns>` | `<wc-columns>` | |
| `<Column>` | *(unwrap)* | Remove tag, keep content |
| `<Panel>` | `<wc-panel>` | `title` passes through |
| `<Badge>` | `<wc-badge>` | `variant`, `color` pass through |
| `<Expandable>` | `<wc-expandable>` | `title`, `defaultOpen` pass through |
| `<Update>` | `<wc-update>` | `label`, `date` pass through |
| `<ParamField>` | `<wc-field>` | `path`/`query`/`body`/`header` → `name` |
| `<ResponseField>` | `<wc-field>` | `name`, `type`, `required` pass through |
| `<Tooltip>` | *(flatten)* | Remove tag, keep inner text |
| `<Icon>` | *(remove)* | Replace manually with `<wc-icon>` if needed |
| `<Snippet>` | *(flatten)* | Remove tag, keep inner text |

### Unknown PascalCase Components

Any `<PascalCase>` tag without a mapping converts to kebab-case with `wc-` prefix:
- `<MyComponent>` → `<wc-my-component>`
- `<APIDocsCard>` → `<wc-api-docs-card>`

Flag these for manual review — they may need custom handling.

### Font Awesome → Lucide Icon Mapping

When converting `icon` attributes on cards/tiles, map Font Awesome names to Lucide equivalents:

| Font Awesome | Lucide |
|---|---|
| `bolt`, `lightning` | `zap` |
| `cog`, `gear`, `sliders` | `settings` |
| `times`, `xmark` | `x` |
| `exclamation-triangle` | `warning` |
| `info-circle` | `info` |
| `external-link-alt` | `external-link` |
| `file-alt` | `file` |
| `folder-open` | `folder` |
| `search`, `magnifying-glass` | `search` |
| `eye`, `eye-slash` | `eye` |
| `lock`, `unlock` | `lock` |
| `globe`, `earth` | `globe` |
| `microchip`, `server` | `cpu` |

If not in the map, keep the name as-is — it will be fetched from Font Awesome CDN at runtime.

## Step-by-Step Migration Process

### Step 1: Strip MDX Syntax

Remove all lines that start with:
```
import ...
export ...
```

Remove JSX comments: `{/* ... */}`

### Step 2: Convert Components

Apply the component mapping table above. For each component:

1. Parse JSX attributes: handle `name="value"`, `name={true}`, `name={123}`, bare `name`
2. Apply attribute renames (`title` → `label` for tabs, `icon` → `icon-name` for cards)
3. Apply fixed attributes (callout `type` and `title`)
4. Drop complex JSX expressions like `name={someVar}` or `{condition ? 'a' : 'b'}` — these have no Markdown equivalent
5. Convert self-closing `<Component />` to `<wc-component></wc-component>`

### Step 3: Auto-Number Steps

Add `n="1"`, `n="2"`, etc. to each `<wc-step>` inside a `<wc-steps>` block.

### Step 4: Unwrap Layout Wrappers

Remove `<Column>` tags but keep their content inside `<wc-columns>`.

### Step 5: Normalize Frontmatter

```yaml
# Rename
sidebarTitle → sidebar_title

# Remove platform-specific fields
openapi, api, mode, noindex, deprecated
```

Drop any frontmatter value containing HTML/JSX.

### Step 6: Convert Config

**Mintlify `mint.json`** → **DocsLit `docslit.json`**:

```json
// mint.json
{
  "name": "My Docs",
  "navigation": [
    { "group": "Guide", "pages": ["intro", "setup"] }
  ]
}

// docslit.json
{
  "name": "My Docs",
  "sidebar": [
    { "group": "Guide", "pages": ["intro", "setup"] }
  ]
}
```

Key differences:
- `navigation` → `sidebar`
- Remove `anchors`, `tabs`, `topbarLinks`, `topbarCtaButton`, `colors`, `favicon`, etc.
- Keep `name` and page arrays

### Step 7: Flag Items for Manual Review

After conversion, flag:
- Unknown PascalCase components that got convention-fallback treatment
- Dropped JSX expressions (dynamic content)
- `<Tooltip>` and `<Icon>` tags that lost functionality
- Any `<Snippet>` references (may need to inline the snippet content)
- `<ParamField>` with multiple location attributes (only one `name` survives)

## Example Conversion

### Before (MDX/Mintlify)

```mdx
---
title: Getting Started
sidebarTitle: Start Here
openapi: false
---

import { Card } from '/snippets/card'

<Tip>
Make sure you have Node.js installed before continuing.
</Tip>

<Steps>
  <Step title="Install">
    ```bash
    npm install my-sdk
    ```
  </Step>
  <Step title="Configure">
    Create a config file:
    ```json
    { "apiKey": "your-key" }
    ```
  </Step>
</Steps>

<CardGroup cols={2}>
  <Card title="API Reference" icon="code" href="/api">
    Full API documentation.
  </Card>
  <Card title="Examples" icon="book" href="/examples">
    Code samples and tutorials.
  </Card>
</CardGroup>
```

### After (DocsLit)

```markdown
---
title: Getting Started
sidebar_title: Start Here
---

<wc-callout type="tip" title="Tip">
Make sure you have Node.js installed before continuing.
</wc-callout>

<wc-steps>
<wc-step title="Install" n="1">

```bash
npm install my-sdk
```

</wc-step>
<wc-step title="Configure" n="2">

Create a config file:

```json
{ "apiKey": "your-key" }
```

</wc-step>
</wc-steps>

<wc-tiles cols="2">
<wc-card title="API Reference" icon-name="code" href="/api">
Full API documentation.
</wc-card>
<wc-card title="Examples" icon-name="book" href="/examples">
Code samples and tutorials.
</wc-card>
</wc-tiles>
```

### What Changed

1. `import` statement removed
2. `sidebarTitle` → `sidebar_title`, `openapi` removed
3. `<Tip>` → `<wc-callout type="tip" title="Tip">`
4. `<Steps>/<Step>` → `<wc-steps>/<wc-step>` with auto-numbering
5. `<CardGroup>` → `<wc-tiles>`, `cols={2}` → `cols="2"`
6. `<Card>` → `<wc-card>`, `icon` → `icon-name`
7. Blank lines added around block components for proper Markdown rendering

## Common Pitfalls

1. **Forgetting blank lines**: Block-level `wc-*` tags need blank lines before/after for Markdown inside them to render
2. **Using JSX self-closing syntax**: Write `<wc-card></wc-card>` not `<wc-card />`
3. **Leaving JSX expressions**: `{variable}` or `{condition && <X/>}` must be replaced with static content
4. **Column unwrapping**: Don't create a `<wc-column>` component — just put content directly in `<wc-columns>`
5. **Step numbering**: Always add explicit `n` attributes after conversion
6. **Icon attribute name**: Use `icon-name` on cards/tiles, not `icon`
7. **Tab label**: Use `label` attribute, not `title`
8. **Code content**: Content in `<wc-code-tab>` and `<wc-code-block>` is raw text — no Markdown rendering
