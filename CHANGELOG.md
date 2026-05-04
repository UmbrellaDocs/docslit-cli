# Changelog

All notable changes to docslit are listed here. Newest versions are at the top.

---

## 0.1.3 — May 2026

### What's new

**Open source licence added** — docslit is now officially licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). Free for personal and open source projects. The docs you generate with docslit are always yours — the licence only applies to the tool itself.

**Security hardened** — Several security improvements were made under the hood: the local dev server now blocks attempts to read files outside your docs folder, and all page metadata is properly sanitised before being shown in the browser. Your auth token is also stored with restricted file permissions so other users on the same machine can't read it.

**Shareable heading links** — Clicking a heading in the "On this page" sidebar now updates the browser address bar with the anchor (e.g. `/quickstart#installation`). You can copy and share that URL and it will scroll directly to the right section.

**Bug fixes in built-in components**
- `wc-tree` / `wc-tree-item` — items were not rendering at all due to a template syntax error. Fixed.
- `wc-anchor` — the `id` and `code` text inside paragraphs were displaying as stacked blocks instead of inline. Fixed.
- `wc-view-panel` — content inside tabbed view panels was touching the left and right edges. Padding is now applied correctly.
- `wc-files` highlighted file names are now readable in light mode.
- `wc-tree` lines now connect visually by switching to a monospace font and removing the gap between rows.

---

## 0.1.2 — Early 2026

### What's new

**Cards with icons** — `wc-card` and `wc-tile` now support an `iconName` attribute so you can add a built-in icon to any card without writing extra markup.

**Dark and light mode across all components** — Every built-in component now correctly responds to the site's dark/light theme toggle. Switching themes updates colours across the entire page instantly, including code blocks, callouts, cards, and navigation.

**Mobile sidebar** — The navigation sidebar now works on phones and tablets. A hamburger menu button appears on small screens, the sidebar slides in as an overlay, and tapping outside closes it.

**Smarter page loading** — Navigating between pages updates the browser address bar correctly so the back button works as expected and pages can be bookmarked.

**Vendor bundles ship locally** — Lit (the web component library powering docslit's built-in components) is now bundled locally instead of loaded from a CDN. Your docs work fully offline and there are no external network requests.

---

## 0.1.1 — Early 2026

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
