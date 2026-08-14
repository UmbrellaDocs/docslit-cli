---
title: Layout
---

# Layout

## wc-columns

Responsive multi-column grid. Collapses to a single column below 768 px.

<wc-columns cols="2">
<wc-panel title="Left column" icon="◀">Content in the left column of a 2-column layout.</wc-panel>
<wc-panel title="Right column" icon="▶">Content in the right column of a 2-column layout.</wc-panel>
</wc-columns>

<wc-columns cols="3" gap="16px">
<wc-panel title="Authentication">Handle user sign-in, tokens, and session management.</wc-panel>
<wc-panel title="Authorization">Role-based access control and permission checks.</wc-panel>
<wc-panel title="Audit Logs">Track every action taken across your account.</wc-panel>
</wc-columns>

## wc-frame

A framed media container with an optional caption.

<wc-frame caption="The DocsLit component preview running in dark mode." border>
  <div style="width:100%;height:160px;background:linear-gradient(135deg,#01696f,#4f98a3);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-family:Inter,sans-serif;font-size:18px;font-weight:700;letter-spacing:-.01em">Your screenshot here</div>
</wc-frame>

## wc-panel

A titled info panel with an optional emoji icon.

<wc-panel title="Requirements" icon="📋">Your project must be using Node.js 18 or later and have a `docslit.json` configuration file at the root.</wc-panel>

<wc-panel title="⚠️ Before you begin">Make sure you have committed all unsaved changes. This process will overwrite your current configuration.</wc-panel>

<wc-panel>A panel without a title or icon — just a content container with a subtle border.</wc-panel>

## wc-expandable

A single collapsible section, open state controllable via the `open` attribute.

<wc-expandable title="What is DocsLit?">DocsLit is a Markdown-first documentation framework powered by Lit web components. It generates fast, self-contained docs sites with no build step required for the reader.</wc-expandable>

<wc-expandable title="Is it free to use?" open>Yes — DocsLit CLI is open source under the Apache-2.0 license. You can use it for personal and commercial projects at no cost.</wc-expandable>

<wc-expandable title="Which browsers are supported?">All modern browsers that support Custom Elements v1: Chrome 67+, Firefox 63+, Safari 10.1+, and Edge 79+.</wc-expandable>

## wc-accordion

FAQ-style collapsible sections with bolder headings.

<wc-accordion title="How do I install DocsLit?">Run `npm install -g docslit` and then `docslit init` inside your project directory to scaffold a new docs site.</wc-accordion>

<wc-accordion title="Can I use custom web components?">Yes. Place any custom `.js` component file in a `components/` folder at your project root and it will be automatically served and loaded by the dev server.</wc-accordion>

<wc-accordion title="Does DocsLit support search?">Full-text search is on the roadmap. For now, the sidebar navigation and TOC make it easy to browse content.</wc-accordion>

## wc-accordion-group

Groups multiple `wc-accordion` or `wc-expandable` items into a seamless joined panel — removes gaps and rounds only the outer corners.

<wc-accordion-group>
<wc-accordion title="What is DocsLit?">DocsLit is a Markdown-first documentation framework powered by Lit web components. It generates fast, self-contained docs sites with no build step required for the reader.</wc-accordion>
<wc-accordion title="How do I install it?">Run `npm install -g @docslit/cli` then `docslit init` inside your project directory to scaffold a new docs site.</wc-accordion>
<wc-accordion title="Can I mix wc-expandable items?">Yes — `wc-accordion-group` accepts both `wc-accordion` and `wc-expandable` children and joins them seamlessly.</wc-accordion>
<wc-accordion title="Is it open source?">Yes, DocsLit CLI is published under the Apache-2.0 license and available on npm as `@docslit/cli`.</wc-accordion>
</wc-accordion-group>

Mixed `wc-expandable` items:

<wc-accordion-group>
<wc-expandable title="Step 1 — Install">Run `npm install -g @docslit/cli` to install the CLI globally.</wc-expandable>
<wc-expandable title="Step 2 — Initialise" open>Run `docslit init` inside your project to create a starter `docslit.json` and example pages.</wc-expandable>
<wc-expandable title="Step 3 — Develop">Run `docslit dev` to start the dev server with hot reload on `http://localhost:3000`.</wc-expandable>
</wc-accordion-group>

## wc-aside

A float-right sticky sidebar for supplementary content (auto-stacks on mobile).

<wc-aside title="Related">
**wc-panel** — a simpler non-floating box
**wc-expandable** — collapsible sections
**wc-columns** — multi-column layouts
</wc-aside>

Use `wc-aside` to surface quick-reference information alongside long-form content without interrupting the reading flow. It floats to the right of the surrounding paragraph text on desktop and stacks below on mobile.

Aside content stays anchored to the top of its containing block while the main content scrolls past it — great for API reference sidebars, related links, or quick-glance parameter tables.
