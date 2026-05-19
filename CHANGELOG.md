# Changelog

All notable changes to docslit are listed here. Newest versions are at the top.

---

## 0.1.8

### What's new

#### Offline mode overhaul

**Multi-file offline builds with lazy page loading** — offline mode now breaks the monolithic single-HTML output into per-page JS files that self-register on a global and load on demand via script injection. This works from `file://` URLs without a server. Vendor JS is inlined as data URIs to avoid CORS restrictions. Hash-based navigation is used on `file://` with History API fallback. Delegated click handlers support inline content links and web component hrefs (`wc-tile`, `wc-card`, `wc-button`). SEO-only artifacts (`llms.txt`, `.md` files, sitemap) are skipped in offline mode.

**Offline security hardening** — removed DOM-based XSS vectors in `_show404` and `_buildPrevNext` by escaping interpolated values. All inline event handlers are stripped from offline HTML markup and replaced with centralized event delegation. Google Fonts requests are removed for air-gapped compatibility. Fixed versioned offline builds that were writing null shared files to disk.

#### Authoring preprocessor (MVP)

**Compile-time reusable content includes** — added `<wc-include src="..."/>` support with a strict, opinionated policy:
- include targets must resolve under `docs/_reusables/**`
- only `.md` files are allowed
- include tags must be self-closing
- path traversal and symlink escapes are blocked

**Page and global variable precedence** — added compile-time variable expansion with deterministic precedence:
1. global `attributes` from `docslit.json`
2. page frontmatter `attributes`
3. page-local declarations via `<wc-var name="X" value="Y" />`

`{{VAR}}` placeholders in prose now resolve using this precedence chain.

**AsciiDoc-style pass-through escape** — added `pass:[...]` for literal rendering of syntax that should not be processed. Useful for documentation examples like `pass:[{{TOKEN}}]` and `pass:[<wc-include src="..." />]`.

#### LLM and markdown delivery

**Expanded markdown output for AI consumers** — build output `.md` files are now written from preprocessed content (includes and compile-time variables resolved), instead of copying raw source files.

**Expanded markdown in dev/content negotiation** — markdown responses from `.md` routes and `Accept: text/markdown` now return preprocessed markdown, including version-aware branch resolution in versioned docs mode.

**LLM artifacts use expanded content** — `llms-full.txt` and `search-index.json` now source markdown from preprocessed output paths.

#### Version-aware globals

**Built-in version variables on all pages** — added global runtime attributes:
- `DOCSLIT_VERSION`
- `DOCSLIT_BRANCH`

These are available to all pages (dev/build/versioned branch rendering), so docs can expose current version context in prose.

#### Validation and docs authoring

**Preprocessor policy checks in `docslit validate`** — validate now catches:
- invalid include paths and missing include targets
- disallowed nested includes in reusable files
- invalid variable declaration names and unresolved placeholders
- frontmatter in reusable files (warned and ignored)

#### Performance

**Preprocessor fast-path** — pages that contain none of `<wc-include`, `<wc-var ... value=`, `{{...}}`, or `pass:[...]` now skip preprocess work entirely.

**Parallel builds and caching** — page builds now run in parallel, Shiki syntax highlighting results are cached, languages are loaded lazily on demand, and the dev server caches build artifacts. Build timing is reported for visibility into build performance.

**Reduced CLS and render-blocking resources** — `docslit-app.js` is now deferred and Google Fonts CSS is loaded asynchronously. Metric-matched font fallbacks (Inter/JetBrains Mono) are added, and layout space is reserved for `wc-columns`, `wc-tiles`, `wc-tabs`, and `wc-accordion` before component upgrade to eliminate layout shifts.

#### Accessibility and SEO

**WCAG contrast improvements** — light-mode `--text3` darkened from `#999` to `#737373` across all components, teal accent darkened from `#4f98a3` to `#3d7a83` for WCAG AA compliance. Added `aria-label` to theme toggle button, fixed copy button `aria-label` to match visible text, and added `min-width`/`min-height` to menu button for touch target size compliance.

**Dynamic meta descriptions** — the SPA shell now includes a `<meta name="description">` from `config.description`, and updates it dynamically during SPA navigation in all three modes. Falls back to `config.description` when pages lack a frontmatter description.

### Bug fixes

**Include false positives in code examples** — nested include detection now ignores include literals inside fenced/inline code and code components in reusable files, preventing false errors when documenting include syntax.

**Inline formatting regressions resolved with explicit escape** — reverted aggressive inline-code suppression and replaced it with opt-in `pass:[...]` behavior for literal output control.

**Validator relative link resolution** — internal links using relative paths are now resolved correctly during validation. Reusable files under `docs/_reusables/` are excluded from validation to prevent false positives.

---

## 0.1.7

### What's new

#### Syntax highlighting

**Shiki syntax highlighting** — code blocks now use Shiki for build-time syntax highlighting with dual-theme support (`github-dark` and `github-light`). Blocks with recognised languages get highlighted spans injected at parse time, so there's no client-side highlighting cost. Blocks containing `{{VAR}}` patterns fall back to plain text so interactive variable substitution still works. Fenced code block info strings now support `filename="..."` metadata, which is passed through to `wc-code-block`.

**Code components follow the page theme** — `wc-code-block` and `wc-code-group` now inherit the page's light/dark theme via CSS custom properties. A `MutationObserver` watches the root `<html>` class and syncs Shiki's dual-theme colour tokens automatically. Users can still force a specific theme on any individual component with `theme="light"` or `theme="dark"`.

**Code theme toggle** — a kebab menu (⋮) on every code block and code group lets users switch all code components between light and dark mode. The preference is saved to `localStorage` and applied on future visits. The page theme remains independent — this only affects code components.

**Copy button on code groups** — `wc-code-group` now has a copy button matching `wc-code-block`, so users can copy the active tab's code without selecting text.

**Opt-in line numbers** — add `linenumbers="true"` to any `<wc-code-block>` or fenced code block (` ```js linenumbers="true" `) to display a non-selectable line number gutter. Line numbers are off by default and only appear when explicitly requested.

#### Save as PDF

**Client-side PDF export** — a "Save as PDF" button appears in the page meta bar (alongside "Copy as Markdown" and "View as Markdown"). It calls `window.print()` with `@media print` styles that produce clean output:
- Navbar, sidebar, table of contents, and page chrome are hidden
- Accordions and expandables are forced open so no content is lost
- All tab panels are shown sequentially with labelled headers
- Page breaks are prevented inside code blocks, tables, images, and components

Works in both static builds and the dev server.

#### OpenAPI integration

**Spec-driven API reference documentation** — docslit can now generate complete API reference docs from an OpenAPI 3.x specification file. A new `docslit openapi scaffold` command reads your spec, creates one Markdown page per endpoint in `docs/api/`, generates an introduction page from the spec's `info` block, and wires up `docslit.json` with the OpenAPI config and a fully structured sidebar.

Each generated page contains a `<wc-endpoint ref="operationId">` tag that is resolved against the loaded spec at build time and in the dev server. Resolution injects all endpoint data automatically:

- **Path-level parameters** merged into every operation (e.g. shared headers like `X-Request-ID`), following the OpenAPI spec's override rules
- **All request body content types** — not just `application/json` but also `application/x-www-form-urlencoded`, `multipart/form-data`, etc.
- **Recursive schema walking** — nested objects and array items are walked up to 4 levels deep, rendered as collapsible sections
- **Schema composition** — `allOf`, `anyOf`, and `oneOf` schemas are resolved and merged
- **Field constraints** — `maxLength`, `minLength`, `minimum`, `maximum`, `pattern`, `enum`, `format`, `default`, `example`, `deprecated`
- **Response schemas** — success response body fields are extracted and rendered with the same nested/collapsible treatment
- **Request and response examples** from the spec are rendered in the examples panel
- **Security requirements** — operation-level and global security are passed through

Parameters are grouped by location into separate sections: Headers, Path Parameters, Query Parameters, Cookie Parameters, and Body (with the content type shown in the title).

**Sidebar hierarchy from spec metadata** — the scaffold command builds sidebar structure from `x-tagGroups` (top-level groups), tags (sub-sections), and operations (individual pages). Each sidebar entry shows the operation summary as the display title with an HTTP method badge (GET, POST, PUT, DELETE, PATCH) aligned to the right.

**OpenAPI overlays** — configure an overlay file to customize descriptions, add examples, or inject `x-docslit-examples` without modifying the original spec:

```json
{
  "openapi": {
    "spec": "api-spec.yaml",
    "overlay": "overlay.yaml"
  }
}
```

**Custom code examples** — add tabbed code examples to any endpoint using the `x-docslit-examples` vendor extension in your spec or overlay.

**`layout: api` frontmatter** — pages with `layout: api` get a three-column layout with a wider content area and an examples panel on the right. Set automatically by the scaffold command.

**`--new-only` flag** — run `docslit openapi scaffold --new-only` to only create pages for operations that aren't already documented. Scans existing `docs/` files for `<wc-endpoint ref>` tags to detect coverage.

#### Enriched Markdown for AI agents

**API pages serve enriched Markdown** — when an AI agent requests an API page via `Accept: text/markdown` or fetches the `.md` URL directly, it receives fully rendered documentation with parameter tables, request body field trees, response schemas, and JSON examples — instead of the raw `<wc-endpoint ref="...">` tag. This works in both the dev server and static builds. Non-API pages serve their original Markdown source as before.

#### AI agent discovery

**MCP server** — static builds now generate a standalone `mcp-server.js` that implements the Model Context Protocol over stdio. Provides three tools (`list_pages`, `get_page`, `search_docs`) with zero additional dependencies — just Node.js. Compatible with Claude Code, Claude Desktop, Cursor, and any MCP client.

**.well-known/agent.json** — static builds generate a machine-readable agent discovery file listing all available endpoints: `llms.txt`, search index, Markdown URLs, content negotiation, and page slugs. Agents can fetch this single file to learn how to interact with your docs.

**Content negotiation** — AI agents can request any page URL with `Accept: text/markdown` to receive raw Markdown instead of HTML. The dev server handles this natively. For static builds, docslit generates platform-specific middleware: `_middleware.js` for Cloudflare Pages and Netlify edge functions, and `vercel.json` with header-based rewrites for Vercel.

#### AI skills

**Two skill files for AI coding agents** — `docslit-author` teaches agents how to write valid DocsLit pages (all 51 components with syntax, attributes, nesting rules, frontmatter schema, config format). `docslit-migrate` teaches agents how to convert MDX and Mintlify docs (component mapping, attribute renames, icon conversions, common pitfalls). Both are plain Markdown files that work with Claude Code, Cursor, Windsurf, or any agent that reads instruction files.

#### Navigation and layout

**Hybrid sidebar** — sites with both regular documentation pages and an OpenAPI spec now get a dual-sidebar mode. "API Reference" and "Documentation" links in the nav toggle between separate sidebars. The scaffold command no longer creates phantom introduction pages when docs already exist.

**Mobile API examples** — on screens ≤1280px, API examples now appear below the main content instead of being hidden entirely.

#### Component upgrades

**`wc-field` redesign** — single-column Stripe-style layout with inline "Show/Hide child attributes" toggle and bordered nested containers. Enum values render in a dedicated "Possible enum values" box. The Responses tab in API pages is now labelled "Status codes", and HTML tags are stripped from OpenAPI spec descriptions.

**`wc-field` enhancements** — new attributes: `in` (parameter location badge), `format`, `enum`, `pattern`, `minimum`, `maximum`, `minlength`, `maxlength`, `example`, `collapsible` (expandable nested fields), and `description` (supports inline Markdown: bold, italic, code, links). Constraint values display beneath the field name.

**`wc-fields` title** — the section header now uses the `title` attribute instead of hardcoding "Parameter". Spec-driven pages show contextual titles like "Headers", "Query Parameters", or "Body application/json".

**`wc-endpoint` enhancements** — new attributes: `ref` (OpenAPI operationId for spec resolution), `summary`, `description` (supports inline Markdown), `security`. Shows both summary and description when both are present.

**`wc-response-fields` title** — response field sections now support a `title` attribute for contextual headers like "Response body application/json".

### Bug fixes

**Sidebar filter preserves method badges** — the filter was using `textContent` which included badge text (e.g. "Create a userPOST"), then destroying the badge HTML on restore. Now targets the `.api-nav-label` span for label capture and highlight, leaving method badges intact.

**YAML frontmatter escaping** — the scaffold command now properly escapes frontmatter values containing special YAML characters (colons, quotes, brackets, etc.) to prevent parse errors.

**Line numbers removed from code blocks** — automatic line numbers on `wc-code-block` have been removed. The count could drift out of sync with the actual content in certain rendering scenarios, and the feature added visual noise without clear benefit.

**Stale API examples cleared on navigation** — switching between API pages in the SPA no longer shows leftover request/response examples from the previous page.

**Code group dropdown clipping fixed** — the theme toggle dropdown in `wc-code-group` was being clipped by the tab bar's `overflow-x` scrolling context. The scrolling is now scoped to the inner tab container so the dropdown renders above it correctly.

---

## 0.1.6

### What's new

#### Drop-in MDX support

**PascalCase tags work directly in `.md` files** — Mintlify-style component names (`<Tip>`, `<Card>`, `<Steps>`, `<CardGroup>`, `<Accordion>`, etc.) are now recognised at parse time and rewritten to the canonical `wc-*` form before rendering. Most Mintlify and Fern projects can be moved over without touching their source files. The conversion happens in two layers:

1. **Explicit alias map** — ~25 known Mintlify/MDX component names map to their docslit equivalents, including attribute renames (e.g. `<Card icon="...">` → `<wc-card icon-name="...">`, with Font Awesome icon names mapped to Lucide where possible) and special handling (`<Tooltip>` and `<Snippet>` unwrap; `<Icon>` is removed in favour of using `<wc-icon>` directly).
2. **Convention fallback** — any unmapped PascalCase tag is rewritten to `wc-kebab-case`. So a custom `<MyWidget>` becomes `<wc-my-widget>`, automatically picking up a registered custom component if one exists.

`docslit validate` warns on PascalCase tags that resolve to a `wc-*` component which isn't registered, so unsupported components surface at validate time rather than as a blank element in the browser.

This is purely additive — the canonical `wc-*` syntax keeps working unchanged, and both styles can be mixed in a single file. JSX expressions (`{props.foo}`), `import`/`export` statements, and JS-valued attributes are not supported; for those, run `docslit import` for a deep one-time conversion.

#### Navigation and layout

**On-this-page active section tracking** — the right-hand TOC now shows a vertical guide line with a colored accent that follows the user as they scroll. The active section updates via `IntersectionObserver` (no layout thrashing), and clicking a TOC item highlights it instantly without waiting for the smooth-scroll to finish. Sub-headings (h3) are visually indented under their parent h2.

**Scrollbar polish** — fixed a layout flash that occurred when navigating between pages: `loadPage` briefly emptied the content, the browser dropped the scrollbar, the viewport widened by a few pixels, and then snapped back. Now `scrollbar-gutter: stable` reserves the gutter at all times, so SPA page swaps don't reflow.

**Auto-hiding scrollbar** — the document scrollbar is now transparent by default and only fades in while the user is actively scrolling or has moved the mouse to within 24px of the right edge. Replaces the macOS overlay scrollbar fade-in/out, which used to flash visibly during navigation. Disabled animation under `prefers-reduced-motion`.

#### Multi-version documentation

**Multi-version documentation support** — docslit now supports hosting multiple versions of documentation on a single site with a version selector. Versions map to git branches, so teams can maintain separate branches for each product release (e.g. `docs-v1`, `docs-v2`) and build them into a unified site with shareable versioned URLs like `/v2/getting-started`.

This feature is fully opt-in. Add a `versions` block to `docslit.json` to enable it:

```json
{
  "versions": {
    "default": "v2",
    "list": [
      { "version": "v1", "branch": "docs-v1", "tag": "Legacy" },
      { "version": "v2", "branch": "main", "tag": "Latest" }
    ]
  }
}
```

Key capabilities:
- **Deduplicated builds** — the default version is built fully; other versions only build pages that actually differ (detected via `git diff`). Shared pages are stored once and referenced via a `_manifest.json` fallback, keeping storage costs and build times minimal.
- **Version selector** — a dropdown appears in the nav bar showing all versions with optional tags (Latest, Legacy, Deprecated, etc.). Switching versions preserves the current page context.
- **Versioned URLs** — every page gets a version prefix (`/v1/page`, `/v2/page`) for direct linking. The root URL redirects to the default version.
- **Dev server support** — the dev server serves the current branch with full hot-reload. Other versions are available read-only via `git show` from their branches.
- **Per-version sidebars** — each version can have its own sidebar navigation, read from that branch's `docslit.json`.
- **llms.txt** — each version gets its own `llms.txt` and `llms-full.txt`.

#### Search and navigation

**Full-text search** — a Cmd+K / Ctrl+K search modal is now built into the nav bar. It uses FlexSearch (loaded lazily from esm.sh on first open) to search across all pages with instant prefix-matched results as you type. Results are grouped by sidebar section with highlighted matches, and support full keyboard navigation (arrow keys, Enter, Escape).

The search index (`search-index.json`) is generated at build time alongside `llms.txt` in the same pass — zero extra file reads or iteration. Estimated overhead: ~2-5 KB per page (plain text only, no HTML markup). Works across all three modes:
- **Static** — fetches `search-index.json` on first search open
- **Dev** — fetches from a live `/api/search-index` endpoint that rebuilds on every request (always fresh)
- **Offline** — index inlined into the page as `window.__DOCSLIT_SEARCH_INDEX__`

**Sidebar filter** — a filter input is now fixed at the top of the sidebar. As you type, non-matching pages are hidden instantly and matching text is highlighted in yellow. A clear button appears when the filter is active, and a friendly empty state is shown when no pages match. Works on both desktop and mobile sidebar.

**Sidebar filter keyboard navigation** — the sidebar filter input now supports full keyboard navigation. Arrow Down/Up moves through matching results with a visible highlight, Enter opens the selected page (or the only remaining match), and Escape clears the filter. The selection resets on each keystroke so navigation always starts fresh after typing.

**404 page** — navigating to a non-existent page now shows a styled 404 page with the missing slug, a "Go to first page" link, and a "Search docs" button that opens the Cmd+K search modal. Replaces the previous plain-text error message across all three rendering modes (dev, static, offline).

#### Static builds and SEO

**Per-route HTML pages** — static builds now generate a full HTML file for every page route (e.g. `dist/0.1/introduction.html`) instead of a single SPA shell. Each page includes the complete shell structure (nav, sidebar, content, TOC) with pre-rendered content visible before JavaScript loads. Shared CSS and JavaScript are externalized into `docslit.css`, `docslit.js`, and `docslit-app.js` to avoid duplication. This means the built site works on any static host (Netlify, Vercel, GitHub Pages, S3, Cloudflare Pages) without SPA fallback configuration or rewrite rules.

**robots.txt** — static builds now generate a `robots.txt` at the site root with explicit `Allow: /` rules for all crawlers, plus named entries for AI-specific bots (GPTBot, Claude-Web, Google-Extended, OAI-SearchBot, PerplexityBot, Applebot-Extended). References `sitemap.xml` and `llms.txt` when a site URL is configured. Versioned builds list per-version sitemaps.

**sitemap.xml** — static builds now generate an XML sitemap (per the sitemaps.org specification) listing the homepage and all documentation pages with `<lastmod>` dates. Requires `url` in `docslit.json` to produce absolute URLs. Versioned builds generate a separate sitemap per version directory.

**Open Graph and Twitter Card meta tags** — every page now includes `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, and `twitter:card` / `twitter:title` / `twitter:description` tags. A `<link rel="canonical">` tag is also added when a site URL is configured.

**Structured data (JSON-LD)** — every page now includes a `<script type="application/ld+json">` block with a `TechArticle` schema containing the page headline, description, URL, and parent site reference.

#### Variable substitution

**Fenced code block variables** — fenced code blocks (` ```lang `) are now rendered as `<wc-code-block>` elements instead of plain `<pre><code>`. This means `{{VAR}}` placeholders in fenced code blocks are now substituted reactively when the user edits a `<wc-var>` on the page. Copy buttons and line numbers are also now available on all code blocks automatically.

**Inline variable references** — `{{VAR}}` patterns in regular Markdown prose are now automatically converted to `<wc-var name="VAR" readonly>` elements. These display the current variable value inline and update reactively when the variable is changed elsewhere on the page. Variables inside `<wc-code-block>` are left as-is since the component handles its own substitution.

#### Markdown source buttons

**Copy as Markdown / View as Markdown** — every page now shows "Copy as Markdown" and "View as Markdown" buttons in the page meta bar (next to reading time). Copy fetches the raw `.md` source and copies it to the clipboard. View opens the `.md` file in a new tab. Works across dev, static, and offline modes.

**Markdown files at page-level paths** — static builds now place `.md` source files alongside their HTML pages (e.g. `/0.1/introduction.md`) instead of in a `/docs/` subdirectory. The `llms.txt` URLs and SPA fetch paths are updated to match.

#### Nested page IDs

**Folder-based page organization** — page IDs in `docslit.json` now support folder paths (e.g. `getting-started/introduction`). The sidebar strips folder prefixes from labels, showing just the page name. Breadcrumbs include the sidebar group (e.g. "Getting Started > Introduction"). All internal link resolution, `.md` file serving, and static builds work with nested paths.

#### Bug fixes

**`ParamField` / `ResponseField` mappings corrected** — these were pointing at `wc-param` and `wc-response-field`, neither of which is a registered component. They now correctly map to `wc-field`, with the user wrapping groups in `<wc-fields>` or `<wc-response-fields>` themselves (Mintlify has no equivalent wrapper concept). Affects both the parse-time bridge and `docslit import`.

**Validator inline-code consistency** — the unknown-component check now strips inline backtick spans alongside fenced code blocks. Documentation pages that mention a component by name (e.g. `` `<wc-foo>` `` in a table cell) no longer trigger false-positive warnings.

**Validator built-in registry refreshed** — the `BUILTIN_COMPONENTS` set used by validate had drifted from the actual registered components: it referenced several non-existent tags (`wc-codeblock`, `wc-image`, `wc-video`, `wc-math`, `wc-if`, `wc-divider`, `wc-spacer`, `wc-table-row`, `wc-table-cell`) and was missing real ones (`wc-accordion-group`, `wc-icon`, `wc-files`, `wc-tree-item`, `wc-color`, `wc-schema`, `wc-endpoint`, `wc-runnable-endpoint`, `wc-prompt`, `wc-tile`, `wc-version`, `wc-visibility`, `wc-view-panel`, `wc-code-tab`, `wc-fields`, `wc-response-fields`, `wc-field`, `wc-alert`). The set now mirrors `buildComponents()` exactly.

**SPA navigation component rendering** — fixed an issue where web components (`<wc-*>` tags) were stripped during client-side navigation. DOMPurify is now configured to preserve custom elements matching `^wc-` with all attributes.

**Tiles grid layout** — fixed `wc-tiles` overlapping by using CSS grid on the host element directly. Removed the `height:100%` on inner anchors that caused row height miscalculation. Tiles now default to `auto-fill` columns with a 220px minimum when `cols` is not specified.

#### Import improvements

**Import versioning** — the Mintlify import tool now detects versioned navigation (`navigation.versions` in `mint.json`) and offers four strategies:
1. **Branch-based versioning (recommended)** — automatically creates git branches per version, distributes the right pages to each branch, and writes the versioning config.
2. **Keep only latest** — imports just the default version's pages.
3. **Merge all versions** — flattens everything into a single unversioned site.
4. **Skip** — imports all files without versioning config for manual setup later.

**Expanded import detection** — the import tool now recognises 11 documentation frameworks: Mintlify (including `docs.json` and `.mintlifyignore`), Fern, GitBook (including `.gitbook.yaml`), Docusaurus, MkDocs, Sphinx, ReadMe, VuePress, VitePress, Starlight (Astro), and Nextra. Previously only Mintlify, Fern, and GitBook were detected.

**Mintlify tabbed navigation support** — the import tool now correctly handles Mintlify's `navigation.tabs` config format, where groups are nested inside tabs. Previously this caused a crash.

**Import resilience** — the import pipeline no longer crashes on unexpected config structures, malformed navigation, or inaccessible files. Each phase (detection, file conversion, sidebar building, asset copying) now degrades gracefully with a warning instead of a stack trace. If sidebar parsing fails, it falls back to auto-discovery from converted files.

**Orphaned page detection** — after import, any converted files not referenced in the source navigation are added to an "Other Pages" sidebar group and flagged in the report. This prevents silently losing pages that exist on disk but weren't in the original site's nav config.

**Icon support for imported docs** — Mintlify icon names (Font Awesome) are now mapped to built-in Lucide icons where a match exists (e.g. `sliders` → `settings`, `bolt` → `zap`). For icons without a Lucide equivalent, `wc-icon` fetches the individual SVG from Font Awesome's CDN at runtime and renders it inline — no CSS stylesheet needed, works inside any shadow DOM, and each SVG is cached after first fetch.

#### Accessibility

**Comprehensive WCAG 2.1 AA improvements** across the shell and all interactive components:
- Skip-to-content link for keyboard users
- Focus trap in search modal with focus return on close
- `prefers-reduced-motion` support — disables all animations and transitions
- `prefers-contrast` support — boosts borders and text in high contrast mode
- Visible focus indicators (`focus-visible` outlines) on all interactive elements
- ARIA tablist/tab/tabpanel pattern with arrow key navigation on tabs, views, and code groups
- Keyboard support (Enter/Space) on expandable, accordion, directory, and tree item toggles
- Combobox pattern with `aria-activedescendant` on search input, `role="option"` on results
- Semantic `<main>` and `<nav>` landmarks
- Content links underlined by default for color-independent distinguishability
- Appropriate ARIA roles on callouts (`role="alert"` for warnings/errors), version selectors (`aria-pressed`), and copy buttons (dynamic `aria-label`)

#### Components

**Accordion group component** — a new `wc-accordion-group` component visually connects adjacent accordions into a unified group with shared borders and rounded corners on the first and last items. The import tool now maps Mintlify's `<AccordionGroup>` to this component instead of stripping it.

#### Security

**Security improvement** — all git operations now use `isomorphic-git` (pure JavaScript) instead of shelling out to the `git` CLI via `execSync`. This eliminates any command injection risk from branch names or file paths, and removes the requirement for git to be installed on the system.

---

## 0.1.5

### What's new

**Client-side markdown rendering** — Published sites now fetch `.md` files on-demand and render them in the browser using `marked` and `DOMPurify` from esm.sh. The local dev server now also serves raw markdown at both `/page.md` and `/docs/page.md`, so agents and local tooling can fetch source files directly in development.

**LLMs.txt improvements** — Generated `llms.txt` files now include a short header note showing where raw markdown lives for each page using the `{slug}.md` URL pattern, making it clearer for agents how to fetch source content page-by-page.

**Build output accuracy** — Fixed a unit mismatch in `getDirSize` that caused the reported distribution size to be ~1000x smaller than actual.

**Import robustness** — The import tool now gracefully handles malformed MDX frontmatter and JSX expressions:
- Wraps gray-matter parsing in try/catch with regex fallback for files with invalid YAML
- Strips frontmatter values containing HTML/JSX to prevent downstream serialization failures
- Removes inline JSX interpolations `{…}` that aren't inside code blocks or spans
- Falls back to JSON.stringify for frontmatter values that js-yaml can't handle

**Dependency updates** — Replaced `archiver` with `fflate` for zip creation, making the client-side publish consistent with server-side extraction. Publish output now shows both compressed and uncompressed sizes.

---

## 0.1.4

### What's new

**Changelog** — docslit now ships with a changelog so you always know what's new and what changed between versions, written in plain language.

**Component polish**
- `wc-view-panel` — content inside tabbed panels now has correct padding and no longer touches the edges.
- `wc-tree` — lines between items now connect properly using a monospace font and tightened row spacing.
- `wc-files` — highlighted file names are now readable in light mode.
- `wc-anchor` — fixed a layout bug where inline elements like `id` and code snippets were stacking vertically instead of flowing as text.

**Security hardened** — Several security improvements were made under the hood: the local dev server now blocks attempts to read files outside your docs folder, and all page metadata is properly sanitised before being shown in the browser. Your auth token is also stored with restricted file permissions.

**Shareable anchor links** — clicking any heading in the "On this page" sidebar now updates the browser address bar with the anchor fragment so you can copy and share a direct link to any section.

---

## 0.1.3

### What's new

**Open source licence added** — docslit is now officially licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). Free for personal and open source projects. The docs you generate with docslit are always yours — the licence only applies to the tool itself.

---

## 0.1.2

### What's new

**Cards with icons** — `wc-card` and `wc-tile` now support an `iconName` attribute so you can add a built-in icon to any card without writing extra markup.

**Dark and light mode across all components** — Every built-in component now correctly responds to the site's dark/light theme toggle. Switching themes updates colours across the entire page instantly, including code blocks, callouts, cards, and navigation.

**Mobile sidebar** — The navigation sidebar now works on phones and tablets. A hamburger menu button appears on small screens, the sidebar slides in as an overlay, and tapping outside closes it.

**Smarter page loading** — Navigating between pages updates the browser address bar correctly so the back button works as expected and pages can be bookmarked.

**Vendor bundles ship locally** — Lit (the web component library powering docslit's built-in components) is now bundled locally instead of loaded from a CDN. Your docs work fully offline and there are no external network requests.

---

## 0.1.1

### What's new

**Code blocks just work** — `wc-code-block` now captures the raw source text of its children before the browser renders them. This means code examples display as literal source code, not as rendered HTML — no more angle brackets disappearing or tags being interpreted.

**Media, navigation, and utility components** — A full set of new built-in components was added:
- File trees (`wc-files`, `wc-dir`, `wc-file`) for showing project structure
- Visual trees (`wc-tree`, `wc-tree-item`) for hierarchy diagrams
- Download buttons (`wc-download`) for linking to files
- Copy-to-clipboard (`wc-copy`) for code snippets and tokens
- Anchor links (`wc-anchor`) for deep-linking to any paragraph
- Version badges (`wc-version`, `wc-versions`) for API or release documentation

**Preview server** — A built-in preview script lets you browse all the built-in component examples locally before building your docs.

---

## 0.1.0 — Initial release

docslit is a documentation framework built for the modern web. Write your content in Markdown, drop in web components for rich interactive elements, and get a fast, self-hosted docs site with no build step required.

**What you get out of the box:**
- A local dev server with live reload
- A static site builder that outputs plain HTML — host anywhere
- A full library of built-in web components for callouts, tabs, cards, steps, code blocks, and more
- A migration tool to import existing Mintlify, Fern, or GitBook projects
- A validator that checks for broken links, missing pages, and frontmatter errors
- Cloud publishing with a single command
