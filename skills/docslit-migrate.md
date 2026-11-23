---
name: docslit-migrate
description: Migrate documentation from Mintlify, Fern or GitBook (or other MDX/Markdown sites) to DocsLit with `docslit import`, then work through MIGRATION.md or the --json report to fix what could not be converted. Use when asked to migrate, port or import docs, to convert a single page, or to fix leftover MDX/JSX in DocsLit pages.
---

# Migrating docs to DocsLit

DocsLit is Markdown plus `wc-*` web components. `docslit import` converts a whole Mintlify (docs.json or legacy mint.json), Fern or GitBook project: pages, components, code blocks, links, assets, navigation, branding, redirects and analytics. It validates the result and lists everything that still needs a human. Run it first; fix by hand only what it reports.

## 1. Run the importer

```bash
docslit import ./source --out ./docs-site --dry-run     # convert in memory, report only
docslit import ./source --out ./docs-site               # write the project
docslit import ./source --out ./docs-site --json        # machine-readable report (for agents)
```

Options: `--from mintlify|fern|gitbook` (otherwise auto-detected; the detection is printed), `--theme <name>` / `--no-theme`, `--versions tabs|latest`, `--force` (overwrite a non-empty output dir). The source folder is never modified and output is deterministic, so re-running is safe.

Point it at the folder that holds `docs.json`/`mint.json`, at the Fern project root (the folder containing `fern/`, or the `fern/` folder itself), or at the GitBook root (`SUMMARY.md` / `.gitbook.yaml`, including the `root:` setting).

## 2. Read the report

The output contains `MIGRATION.md`; `--json` prints the same data:

```jsonc
{ "source": { "format": "mintlify", "dir": "..." }, "summary": { "pages": 11, "snippets": 3, "assets": 8, "components": 67 },
  "counts": { "error": 2, "warning": 3, "info": 5 },
  "items": [ { "severity": "error", "code": "unknown-component", "file": "installation.mdx", "line": 30,
               "component": "Status", "message": "...", "action": "what the importer did instead", "fix": "how to fix it" } ],
  "components": [ { "from": "Tip", "to": "wc-callout", "count": 4 } ],
  "config": { "mapped": [ { "from": "docs.json colors", "to": "theme" } ], "unmapped": [ { "from": "docs.json search", "note": "..." } ] },
  "validation": { "errors": 0, "warnings": 0, "issues": [] } }
```

Work through `items` in order: errors, then warnings, then info. Every item has `file:line`, what was done instead, and how to fix it. Nothing is silently dropped: unknown or custom components stay in the page inside a warning callout titled "Unconverted component: <Name>".

After each fix run `docslit validate` (zero errors is the goal) and `docslit components <tag> --json` to check attributes.

## 3. Fixing each class of item

| Code | Meaning | Fix |
|---|---|---|
| `unknown-component` / `custom-component` | A React/JSX component that cannot run on a static site | Replace the "Unconverted component" callout with Markdown, a reusable snippet in `docs/_reusables/`, or a custom Lit component in `components/` |
| `component-prop-dropped` | A prop has no DocsLit equivalent (`className`, `zoom`, ...) | Usually nothing; check the page looks right |
| `broken-link` | A link target is not a converted page | Point it at a real page (`/path/without/extension`) |
| `missing-asset` | An image/file referenced in the source does not exist | Add the file under `docs/` or remove the reference |
| `mdx-parse-error` / `legacy-conversion` | The page is not valid MDX; converted with the legacy rewriter | Fix the JSX in the source or review the converted page by hand |
| `redirect-wildcard` | Pattern redirects (`/old/:slug*`) are unsupported | Add one `redirects` entry per path in `docslit.json` |
| `integration-unsupported` / `fern-js` / `custom-js` | Analytics or JS with no equivalent | Paste the snippet into `head` in `docslit.json` |
| `nav-versions` | DocsLit versions are git branches; versions became tabs | Optionally split each version onto a branch and configure `versions` |
| `nav-languages` | i18n needs a `docs.<locale>/` folder per language | Move each language into its folder and set `i18n` |
| `fern-api-snippet` / `fern-runnable-endpoint` | API snippet components that render from the Fern definition | Link to the generated API page, or paste an example |
| `auth-content-dropped` | Content gated by login/roles/groups was removed | Move it to a public page if it should be visible |
| `config-unmapped` | A config key has no DocsLit setting | Informational |

## 4. What the importer converts

- **Components** (every Mintlify and Fern component): callouts, accordions, cards and tiles, tabs, steps, code groups, request/response examples, fields, frames, badges, buttons, files/tree, update, view, color, prompt, tooltips, icons, embeds (`iframe`/`video`), tables, mermaid, math, scroll walkthrough, versions, conditional `If`/`Visibility`. Attributes are mapped one-to-one (`defaultOpen` to `open`, Badge `color` to `variant`, Card `iconSize` x4 to `icon-size`, ...). Run `docslit components --json` for the full reference.
- **Code blocks**: Mintlify and Fern fence meta is understood natively. Fern shows line numbers by default, so `lines` is added unless `showLineNumbers={false}`. Fern `<Code src>` files, including URLs, are copied into `snippets/` and referenced with `file=`.
- **Snippets and variables**: `import X from '/snippets/x.mdx'` becomes `docs/_reusables/x.md` with `<wc-include src="x.md" prop="value" />`; `{prop}` in the snippet becomes `{{prop}}`. `export const name = '...'` plus `{name}` becomes an `attributes` entry plus `{{NAME}}`. Simple pure-markup React components become reusables; others are reported.
- **HTML in MDX**: `className` to `class`, `style={{...}}` to a CSS string, `htmlFor`, MDX comments removed, `{'{'}` escapes, light/dark `<img>` pairs to `![alt](light.png#dark=dark.png)`.
- **Links and assets**: `.md`/`.mdx` suffixes and relative links are rewritten to site paths, Fern slug overrides are honoured, assets are copied and paths rewritten. Non-root `index` pages are renamed `overview` with a redirect from the old URL.
- **Frontmatter**: `sidebarTitle`/`sidebar-title` to `sidebar_title`, Mintlify `tag` to `badge`, `mode`/`layout`, `hidden`, `noindex`, `icon`+`iconType`, Fern `subtitle`, `headline`, `hide-toc`, `max-toc-depth`, `availability`. Keys without an equivalent are listed.
- **Config**: name, description, logo (light/dark), favicon, colors and fonts (to a theme: `peppermint` for Mintlify, `frond` for Fern when installed, plus brand colour overrides), tabs/groups/anchors/dropdowns/products (to `tabs`), versions (tabs), navbar and footer, banner/announcement, redirects, contextual menu, analytics (ga4, gtm, plausible, posthog, fathom), SEO meta tags, custom CSS, OpenAPI (spec copied, API pages generated with `wc-endpoint`).
- **GitBook**: `SUMMARY.md` to the sidebar, `.gitbook.yaml` root, `{% hint %}`, `{% tabs %}`, `{% code %}`, `{% embed %}`, `{% stepper %}`, `{% file %}`, `figure` to `wc-frame`.

## 5. One page or snippet at a time

Use the MCP tool `convert_mdx { source, from }` (or the `migrate-page` prompt): it returns converted Markdown plus the same kind of `issues` list. Then `check_markup`, fix, and `create_page`. MkDocs / Material for MkDocs / Zensical projects import with `docslit import` (`--from mkdocs`): admonitions, tabs, blocks, snippets, code options, icons and the nav are converted; mkdocstrings `:::` blocks are kept (options normalised, `python` written to docslit.json); run `docslit api python <pkg> --search <dir>` once to create the API data (`api/python/<pkg>.json`, commit it), until then each directive shows a placeholder callout. Other platforms (Docusaurus, Sphinx, ...) are imported as plain Markdown/MDX folders with an auto-generated sidebar; convert their admonitions to `wc-callout` by hand.

## Manual conversion reference

Only needed when fixing something the importer left behind. Always confirm tags and attributes with `docslit components <tag> --json`.

| Source | DocsLit |
|---|---|
| `<Note>`, `<Info>`, `<Tip>`, `<Warning>`, `<Check>`, `<Danger>` | `<wc-callout type="note\|info\|tip\|warning\|check\|danger">` |
| `<Callout icon color>` | `<wc-callout icon="..." color="#hex">` |
| `<Card title icon href>` / `<CardGroup cols>` | `<wc-card ...>` / `<wc-tiles cols="2">` |
| `<Tabs>` / `<Tab title>` | `<wc-tabs sync="mintlify">` / `<wc-tab label>` |
| `<Accordion title defaultOpen>` | `<wc-accordion title open>` inside `<wc-accordion-group>` |
| `<Steps>` / `<Step title>` | `<wc-steps>` / `<wc-step title>` (numbering is automatic) |
| `<CodeGroup>` | `<wc-code-group>` with fenced blocks directly inside (blank lines around fences) |
| `<ParamField path="id">` | `<wc-field name="id" in="path">` inside `<wc-fields>` |
| `<Badge color="green">` | `<wc-badge variant="success">` |
| `<Update label>` | `<wc-update label description tags>` |

Rules: opening tag on its own line, a blank line, the body, a blank line, the closing tag. Write `<wc-card></wc-card>`, never `<wc-card />` (only `<wc-include ... />` is self-closing). Icons pass through verbatim (Lucide or Font Awesome names, `fa-brands fa-github`, emoji, image path). Content in `wc-code-block`/`wc-code-tab` is raw text.
