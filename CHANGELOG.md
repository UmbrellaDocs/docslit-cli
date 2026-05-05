# Changelog

All notable changes to docslit are listed here. Newest versions are at the top.

---

## 0.1.6

### What's new

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
- **SEO pages** — thin HTML pages for each version include version-aware redirects.
- **llms.txt** — each version gets its own `llms.txt` and `llms-full.txt`.

**Import versioning** — the Mintlify import tool now detects versioned navigation (`navigation.versions` in `mint.json`) and offers four strategies:
1. **Branch-based versioning (recommended)** — automatically creates git branches per version, distributes the right pages to each branch, and writes the versioning config.
2. **Keep only latest** — imports just the default version's pages.
3. **Merge all versions** — flattens everything into a single unversioned site.
4. **Skip** — imports all files without versioning config for manual setup later.

**Full-text search** — a Cmd+K / Ctrl+K search modal is now built into the nav bar. It uses FlexSearch (loaded lazily from esm.sh on first open) to search across all pages with instant prefix-matched results as you type. Results are grouped by sidebar section with highlighted matches, and support full keyboard navigation (arrow keys, Enter, Escape).

The search index (`search-index.json`) is generated at build time alongside `llms.txt` in the same pass — zero extra file reads or iteration. Estimated overhead: ~2-5 KB per page (plain text only, no HTML markup). Works across all three modes:
- **Static** — fetches `search-index.json` on first search open
- **Dev** — fetches from a live `/api/search-index` endpoint that rebuilds on every request (always fresh)
- **Offline** — index inlined into the page as `window.__DOCSLIT_SEARCH_INDEX__`

**Sidebar filter** — a filter input is now fixed at the top of the sidebar. As you type, non-matching pages are hidden instantly and matching text is highlighted in yellow. A clear button appears when the filter is active, and a friendly empty state is shown when no pages match. Works on both desktop and mobile sidebar.

**Accessibility** — comprehensive WCAG 2.1 AA improvements across the shell and all interactive components:
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

**Security improvement** — all git operations now use `isomorphic-git` (pure JavaScript) instead of shelling out to the `git` CLI via `execSync`. This eliminates any command injection risk from branch names or file paths, and removes the requirement for git to be installed on the system.

---

## 0.1.5

### What's new

**Client-side markdown rendering** — Published sites now fetch `.md` files on-demand and render them in the browser using `marked` and `DOMPurify` from esm.sh. This replaces the old `pages.json` + full per-page HTML shell architecture. Per-page SEO pages are now thin (~3 KB vs ~80 KB), containing only the rendered content for crawlers while redirecting JS-enabled browsers to the SPA. The local dev server now also serves raw markdown at both `/page.md` and `/docs/page.md`, so agents and local tooling can fetch source files directly in development.

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
