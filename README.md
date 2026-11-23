# docslit

The best open-source docs platform, built for AI agents, and the easiest place to move to from Mintlify or Fern.

Write Markdown. Drop in web components. Self-host anywhere. Open source (Apache-2.0).

DocsLit gives AI agents accurate reference data and strict, machine-readable feedback, so they can write valid docs without guessing: discover components, write a page, check it as JSON, fix what the checks report. Published sites are easy for agents to read too: `llms.txt`, a Markdown file per page, content negotiation and an MCP server.

## Agent quick start

In an existing DocsLit project:

```bash
npx docslit agents init          # AGENTS.md + files for the AI tools it detects
npx docslit agents init --tool all
```

Then connect your AI tool to the MCP server. Add this to your client config (`.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor; `docslit agents init` writes both for you):

```json
{
  "mcpServers": {
    "docslit": { "command": "npx", "args": ["-y", "docslit", "mcp"] }
  }
}
```

`npx docslit mcp --print-config claude|cursor|vscode` prints config for a client. Pass a site URL (`npx docslit mcp https://docs.docslit.com`) to let an agent read and search any published DocsLit site.

The loop an agent follows, all with JSON output and no prompts:

```bash
docslit components wc-tabs --json                 # attributes, nesting, example
docslit new guides/setup --title "Set up" --description "..." --json
docslit validate --format json                    # is it broken?
docslit lint --format json                        # is it good?
```

## Quick start

Requires Node.js 22.22.0 or later.

```bash
npm install -g docslit
docslit init my-docs
cd my-docs
docslit dev
```

Or run it without installing: `npx docslit init my-docs`. Requires Node.js 20.19 or later.

## Commands

| Command | Description |
|---------|-------------|
| `docslit init [dir]` | Scaffold a new docs project (also writes `AGENTS.md`; `--no-agents` to skip; `--theme <name>`) |
| `docslit new <page-id>` | Create a page and add it to the sidebar. `--title`, `--group`, `--description`, `--position`, `--json` |
| `docslit dev` | Start the local dev server with hot reload (`--port`, default 3000; `--theme-picker` to try every theme live) |
| `docslit build` | Build a static site to `./dist` (`--out`, `--offline`, `--no-minify`, `--incremental`, `--profile`, `--pdf`, `--no-pdf`, `--pdf-dir`) |
| `docslit cache clean` | Remove the current project's build cache |
| `docslit deploy` | Write hosting recipes: `--github-pages`, `--netlify`, `--cloudflare`, `--out <dir>` |
| `docslit import <dir>` | Migrate a Mintlify, Fern or GitBook project (`--out`, `--from`, `--dry-run`, `--theme`, `--no-theme`, `--versions`, `--force`, `--json`) |
| `docslit validate [dir]` | Check for broken links, missing assets, frontmatter errors, unknown components. `--strict`, `--external`, `--format pretty\|github\|json` |
| `docslit lint [dir]` | Check docs quality: descriptions, headings, code languages, alt text, link text, page length. `--strict`, `--format pretty\|github\|json` |
| `docslit components [tag]` | List the built-in `wc-*` components, or show one's attributes and example (`--json`) |
| `docslit schema [config\|frontmatter]` | Print the JSON Schema for `docslit.json` or page frontmatter |
| `docslit agents init\|print` | Write AI-agent instruction files and MCP config, or print the skills (`--tool`, `--force`, `--json`) |
| `docslit mcp [url]` | MCP server over stdio: authoring tools in a project (`--dir`), or read and search a published site. `--print-config` |
| `docslit theme list\|use\|tokens\|init` | List themes and palettes, switch the theme, print the design tokens, or scaffold a brand theme file |
| `docslit openapi scaffold <spec>` | Generate API reference pages from an OpenAPI spec (`--overlay`, `--new-only`) |
| `docslit login` | Log in to DocsLit Cloud with email and password, or `--token <token>`. In CI set `DOCSLIT_TOKEN` |
| `docslit logout` | Remove stored credentials and revoke the token |
| `docslit publish` | Build and publish to DocsLit Cloud (`--project`, `--out`, `--build`) |
| `docslit projects` | List published projects with URLs and status |
| `docslit rollback <slug> [deploy-id]` | Restore a project to an earlier deploy |
| `docslit whoami` | Show the authenticated user |
| `docslit delete <slug>` | Delete a published project and its files |

Run `docslit --help` for every option, or `docslit <command> --help` for one command.

## What a build gives agents

`docslit build` writes `llms.txt`, `llms-full.txt`, a `.md` file for every page, `.well-known/agent.json`, `search-index.json` and a standalone `mcp-server.js` (version-aware on versioned sites). Sites on DocsLit Cloud also get a hosted MCP endpoint at `/mcp` and `Accept: text/markdown` negotiation.

## Themes

Six prebuilt looks, thirteen palettes, one line of config. A **theme** sets layout, type and shape; a **palette** sets colours; any theme works with any palette and your own brand colours.

```json
{ "theme": "peppermint" }
{ "theme": { "name": "tonal", "palette": "ocean", "colors": { "accent": "#e11d48" }, "radius": "lg" } }
```

| Theme | Look |
|-------|------|
| `default` | The classic DocsLit look, unchanged |
| `peppermint` | Clean, airy product docs (a familiar look for teams coming from Mintlify) |
| `frond` | Crisp and technical (a familiar look for teams coming from Fern) |
| `tonal` | Material 3 inspired, everything derived from one seed colour |
| `folio` | Book and knowledge base: narrow column, serif headings |
| `ledger` | Dense API-reference look with a wide column |

```bash
docslit theme list                    # themes and palettes (--json for agents)
docslit theme use tonal --palette ocean
docslit theme tokens --json           # every design token
docslit dev --theme-picker            # try every combination on your own content
```

Existing configs (`"theme": "ocean"`, theme objects and files) render exactly as before. Colours DocsLit derives meet WCAG AA in the new themes, and `docslit validate` warns about explicit low-contrast colours. Set `"themePicker": true` to ship the live picker in a built site (for galleries and demos).

## Writing features

- **Mintlify and Fern parity:** every component either platform has, plus new `wc-embed`, `wc-github-repo`, `wc-walkthrough`, `wc-colors` and `wc-if` (build-time conditions by version, locale, variable or audience: `for="agents"` content shows only in the Markdown agents read).
- **Icons at build time:** Lucide and Font Awesome Free names, `fa-solid fa-gear`, `lucide:zap`, emoji, images and inline SVG resolve to inline SVG, so they work offline. `docslit validate` flags unknown names.
- **Code blocks:** highlighted, focused and diffed lines, line numbers, collapsing, wrapping and dropdown groups, with Mintlify and Fern fence options understood as they are.
- **Navigation:** top-level `tabs` (header or sidebar), `anchors`, sidebar icons, badges, availability and hidden pages, navbar dropdowns, buttons and GitHub stars, light and dark logos, footer columns and socials, seven page layouts and a configurable "Copy page" contextual menu.
- **Autogenerated sidebars:** `"sidebar": "auto"` or `autogenerate` on a group, with `sidebar_position` and `_category.json`; groups can be `collapsed`.
- **Code import:** pull code from real files with fence meta: ` ```js file="examples/server.js" region="routes" `.
- **Math:** `$$a^2 + b^2 = c^2$$` and `math` fences, rendered with KaTeX at build time.
- **Synced tabs:** `<wc-tabs sync="pkg">` switches every tab group with the same key.
- **Feedback widget:** `"feedback": true` adds "Was this page helpful?" with analytics events and an optional endpoint.

## Build performance

Static builds generate a search index, `llms.txt` and `llms-full.txt`, an MCP
server and agent manifest, and (when `url` is set) a sitemap and robots file by
default. Disable individual generators with `--no-search-index`,
`--no-llms-txt`, `--no-mcp`, or `--no-sitemap`.

Open Graph images (one PNG social card per page) are opt-in: build with
`--og-images`, or set `"ogImage": true` (or `build.ogImages: true`) in
`docslit.json`. They render in a worker pool, are cached by `--incremental`,
and `--no-og-images` turns them off again for a single build. Disabling the search index also disables site search and the
MCP search tool. Offline builds retain their offline search.

The same options can be set persistently in `docslit.json`:

```json
{
  "build": {
    "ogImages": true,
    "searchIndex": false,
    "llmsTxt": false,
    "mcp": false,
    "sitemap": false,
    "cache": true
  }
}
```

Use `--incremental` (or `build.cache`) to reuse parsed and rendered pages,
minified shared assets, OG images, and unchanged documentation indexes.
Reusable `<wc-include>` content is tracked by content hash, so changes
invalidate affected pages. Unchanged page, asset, and media files are not
rewritten. Shared configuration changes can require all pages to be rendered
again. Hooks, some generators, offline output, and PDFs still run.

Incremental builds preserve the output directory. DocsLit records ownership
per output directory and removes stale generated pages, OG images, redirects,
and tracked optional generator outputs only when their contents have not been
modified. Modified or untracked files are preserved; other stale files,
including output from older DocsLit versions, may remain. Use a clean build
when a guaranteed clean output is needed. `docslit cache clean` removes cached
build results without removing generated output or its ownership records.

Use `--profile` for phase timings. To benchmark a project, run
`npm run benchmark -- warm-minimal --project /path/to/project --out bench-minimal --runs 3`.
The warm scenario performs an untimed warm-up; its incremental builds preserve
the output directory. Choose an initially empty `--out` directory for a
minimal output; non-incremental scenarios empty their output directory.

## Validating and linting

```bash
docslit validate            # broken things; exit 1 on errors
docslit validate --strict   # warnings fail too
docslit lint --strict       # quality findings fail too
```

| Check | Level |
|-------|-------|
| `docslit.json` parses and has a `sidebar` | error |
| Every sidebar slug has a matching `.md` file | error |
| Every internal link points to a real page | error |
| Markdown and HTML images exist (absolute, `./`, `../` and bare relative paths); code imports resolve | error |
| Frontmatter has a `title` | warning |
| No `<wc-*>` tags that are not built in or in `components/` | warning |
| Component attributes, enum values, required attributes and nesting are valid | warning |
| No unclosed, stray or malformed component tags | error |
| Math parses in KaTeX | warning |
| Theme names, appearance and colour contrast; navigation (tabs, anchors, navbar, layout); icon names | error or warning |
| No duplicate sidebar slugs | warning |
| Unknown frontmatter keys, orphaned pages | info |

`validate` checks component attributes and nesting against the built-in manifest (the `check_markup` MCP tool runs the same checks on a snippet). Look up one component with `docslit components <tag> --json`. Every issue in `--format json` has a stable `code`, a `line` and a `fix`.

## Switch from Mintlify or Fern

```bash
docslit import ./my-docs --out ./my-docs-site        # auto-detects Mintlify (docs.json or mint.json), Fern or GitBook
docslit import ./my-docs --dry-run --json            # report only, machine-readable
```

One command converts every page (MDX components, code blocks, snippets, links, assets), the navigation and the site config (branding, redirects, analytics, OpenAPI), picks a matching theme (`peppermint` for Mintlify, `frond` for Fern, `folio` for GitBook) with your brand colours on top, validates the result and writes `MIGRATION.md`: every item that needs a human, grouped by severity with `file:line`, what was done instead and how to fix it. Nothing is silently dropped; custom React components are kept inside a marked placeholder callout. The source folder is never modified.

Flags: `--from mintlify|fern|gitbook`, `--out`, `--dry-run`, `--theme <name>` / `--no-theme`, `--versions tabs|latest`, `--force`, `--json`. Known limits (each is reported with a fix): versions become tabs, only the first language is converted, wildcard redirects are skipped, custom JavaScript and React components are not converted.

Agents can migrate page by page with the MCP tool `convert_mdx`, which converts one Mintlify, Fern or GitBook page without writing anything and returns the issues to fix. Run `docslit agents print migrate` for the migration skill.

Full guides and a table of every component conversion are in the [DocsLit documentation](https://docs.docslit.com). The short version:

| Mintlify / Fern | DocsLit |
|----------|---------|
| `<Note>` `<Info>` `<Tip>` `<Warning>` `<Check>` `<Danger>` (Fern also `<Success>` `<Error>` `<Launch>`) | `<wc-callout type="...">` |
| `<Card>` / `<CardGroup>` / `<Tile>` | `<wc-card>` / `<wc-tiles>` / `<wc-tile>` |
| `<Tabs>` / `<Tab>` | `<wc-tabs>` / `<wc-tab>` |
| `<Accordion>` / `<AccordionGroup>` / `<Expandable>` | `<wc-accordion>` / `<wc-accordion-group>` / `<wc-expandable>` |
| `<Steps>` / `<Step>` | `<wc-steps>` / `<wc-step>` |
| `<CodeGroup>` / `<CodeBlocks>` / `<RequestExample>` | `<wc-code-group>` |
| `<ParamField>` / `<ResponseField>` | `<wc-field>` in `<wc-fields>` / `<wc-response-fields>` |
| `<Frame>` `<Badge>` `<Button>` `<Tooltip>` `<Icon>` `<Update>` `<View>` `<Tree>` `<Files>` `<Prompt>` `<Color>` | `wc-frame` `wc-badge` `wc-button` `wc-tooltip` `wc-icon` `wc-update` `wc-view` `wc-files` `wc-files` `wc-prompt` `wc-colors` |
| `<iframe>` / `<video>` | `<wc-embed>` |
| `<Visibility for="agents">` / Fern `<llms-only>` | `<wc-if for="agents">` |
| `import X from '/snippets/x.mdx'` | `docs/_reusables/x.md` + `<wc-include src="x.md" />` |

**MkDocs, Material for MkDocs and Zensical** (`mkdocs.yml`, `mkdocs-*.yml`, `docs/mkdocs.yml` or `zensical.toml`; use `--config <file>` to pick another config) are converted too:

| MkDocs / Material | DocsLit |
|---|---|
| `nav`, `docs_dir`, `site_*`, `repo_url`, `copyright`, `extra.social`, `extra.analytics`, palette, font, logo, favicon | `sidebar` (or `tabs` with `navigation.tabs`), `name`, `url` + `basePath`, `navbar`, `footer`, `analytics`, `theme`, `logo`, `favicon` |
| `!!!` admonitions, `???` / `???+` collapsibles, `/// note` and `/// details` blocks | `<wc-callout>`, `<wc-accordion>` |
| `=== "Tab"` content tabs and `/// tab` (synced with `content.tabs.link`) | `<wc-tabs>` / `<wc-tab>` |
| `--8<--` snippets, FastAPI-style `{* file *}` includes | inlined text, or `file=` code imports |
| fence `title=`, `hl_lines=`, `linenums=`, ```` ```mermaid ```` | `title=`, `{1,3}`, `lines startLine=`, `<wc-mermaid>` |
| `{ #id }`, `{ .md-button }`, `{ width= }`, `++ctrl+c++`, `==mark==`, `:material-*:` / `:fontawesome-*:` icons, definition lists, abbreviations, `\( \)` math, `{{ extra }}` macros | anchors, `<wc-button>`, `<img width>`, `<kbd>`, `<mark>`, `<wc-icon>`, `<dl>`, `<abbr>`, KaTeX, `{{VARS}}` |
| `redirects` plugin, blog posts, pages outside `nav` | `redirects`, a blog group (newest first) with generated index list, category and archive pages and old-URL redirects, a hidden sidebar group |

Pages stay plain Markdown (never MDX), so a stray `<` or `{` never breaks the import. Anything that cannot be carried over is listed in `MIGRATION.md`, never dropped silently: mkdocstrings `:::` blocks (replaced by placeholder callouts), Jinja macros, theme overrides, Material-specific CSS and JavaScript, mike versions and every plugin without an equivalent.

Other Markdown or MDX folders (Docusaurus, Sphinx, VitePress, Starlight, Nextra) import as plain folders with an automatic sidebar.

## docslit.json

```json
{
  "$schema": "https://unpkg.com/docslit/schema/docslit.schema.json",
  "name": "My Docs",
  "url": "https://docs.example.com",
  "sidebar": [
    {
      "group": "Getting Started",
      "pages": ["introduction", "installation", "quickstart"]
    }
  ]
}
```

`docslit schema` prints the full schema. See the [DocsLit documentation](https://docs.docslit.com) for `basePath`, redirects, i18n, versions, the playground and more.

## Markdown + web components

```markdown
---
title: My Page
description: One sentence that feeds search, SEO and llms.txt.
---

# My Page

<wc-callout type="info" title="No imports needed">
Just drop a tag. It works.
</wc-callout>
```

Run `docslit components` for the full list.

## License

Apache-2.0. DocsLit Cloud remains a separate proprietary product.
