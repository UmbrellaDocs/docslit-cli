# docslit

The docs framework for the web platform era.

Write Markdown. Drop in web components. Self-host anywhere.

## Quick start

```bash
npm install -g docslit
docslit init my-docs
cd my-docs
docslit dev
```

## Commands

| Command | Description |
|---------|-------------|
| `docslit init [dir]` | Scaffold a new docs project |
| `docslit dev` | Start local dev server (default: port 3000) |
| `docslit build` | Build static site to `./dist` |
| `docslit import <dir>` | Migrate a Mintlify / Fern / GitBook project to DocsLit |
| `docslit validate [dir]` | Check for broken links, missing assets, frontmatter errors, unknown components |

## Options

```
--port <number>   Dev server port (default: 3000)
--out <dir>       Build output directory (default: dist)
                  Also used by import (default: <source>-docslit)
--dry-run         (import only) Scan and report without writing files
--strict          (validate only) treat warnings as errors → exit 1
```

## Validating a project

Run `docslit validate` in any DocsLit project directory to get a full health report:

```bash
docslit validate
# or point at a specific directory
docslit validate ./my-docs
# fail CI on warnings too
docslit validate --strict
```

### What it checks

| Check | Level |
|-------|-------|
| `docslit.json` parses correctly and has a `sidebar` array | error |
| Every sidebar slug has a matching `.md` file | error |
| No duplicate slugs in the sidebar | warning |
| Every `[text](link)` points to a real page slug | error |
| Every image and file reference resolves on disk | error |
| All frontmatter contains a `title` field | warning |
| No unknown frontmatter keys | info |
| No `<wc-*>` tags that aren't built-in or in `components/` | warning |
| No orphaned pages (`.md` files not in the sidebar) | info |

Exit code is `0` when there are no errors (warnings don't fail by default). Use `--strict` to also fail on warnings.

## Migrating from Mintlify

If you have an existing Mintlify project, run:

```bash
docslit import ./my-mintlify-docs
```

This will:

1. **Detect** `mint.json` and read your sidebar navigation automatically
2. **Convert** every MDX component to the equivalent DocsLit [web component](https://lit.dev)
3. **Strip** all `import`/`export` statements (no JSX needed)
4. **Copy** all static assets (images, fonts, PDFs)
5. **Generate** a ready-to-run `docslit.json` config
6. **Print** a full migration report showing what was converted, what needs review, and next steps

The output goes to `./my-mintlify-docs-docslit/` by default (use `--out` to change it).

### Component mapping

| Mintlify | DocsLit |
|----------|---------|
| `<Note>`, `<Info>` | `<wc-callout type="info">` |
| `<Warning>`, `<Caution>` | `<wc-callout type="warning">` |
| `<Danger>` | `<wc-callout type="danger">` |
| `<Tip>` | `<wc-callout type="tip">` |
| `<Check>`, `<Success>` | `<wc-callout type="success">` |
| `<Card>` | `<wc-card>` |
| `<CardGroup>` | `<wc-tiles>` |
| `<Tabs>` / `<Tab>` | `<wc-tabs>` / `<wc-tab>` |
| `<Accordion>` / `<AccordionGroup>` | `<wc-accordion>` (group unwrapped) |
| `<Steps>` / `<Step>` | `<wc-steps>` / `<wc-step>` (auto-numbered) |
| `<CodeGroup>` | `<wc-code-group>` |
| `<Frame>` | `<wc-frame>` |
| `<Badge>` | `<wc-badge>` |
| `<Expandable>` | `<wc-expandable>` |
| `<ParamField>` | `<wc-param>` |
| `<ResponseField>` | `<wc-response-field>` |
| `<Tooltip>` | text content only (inlined) |
| `<Icon>` | removed |

Also works with **Fern** (`fern/fern.config.json`) and **GitBook** (`SUMMARY.md`) projects — DocsLit auto-discovers all `.md`/`.mdx` files and builds the sidebar from the folder structure.

## docslit.json

```json
{
  "name": "My Docs",
  "basePath": "",
  "navbar": { "links": [{ "label": "GitHub", "href": "https://github.com/org/repo", "external": true }] },
  "footer": { "copyright": "© Acme" },
  "analytics": { "provider": "plausible", "domain": "docs.example.com" },
  "sidebar": [
    {
      "group": "Getting Started",
      "pages": ["introduction", "installation", "quickstart"]
    }
  ]
}
```

See the [DocsLit documentation](https://docs.docslit.com) for `basePath`, redirects, i18n, playground, and more.

## License

Apache-2.0. DocsLit Cloud remains a separate proprietary product.

## Markdown + Web Components

```markdown
---
title: My Page
tag: Guide
readtime: 3 min read
updated: May 2025
---

# My Page

<wc-callout type="info" title="No imports needed">
  Just drop a tag. It works.
</wc-callout>

<wc-button label="Click me">Click me</wc-button>
```
