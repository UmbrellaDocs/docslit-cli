# Changelog

All notable changes to docslit are listed here. Newest versions are at the top.

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
