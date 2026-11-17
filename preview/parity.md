---
title: Parity showcase
description: Every content component and attribute added for Mintlify / Fern migration parity.
---

# Parity showcase

Manual / visual QA page for the content components added for Mintlify and Fern parity. Toggle light and dark, resize to a phone width, and tab through the page.

## Icons (build-time, offline-safe)

Names resolve to inline SVG at build time: <wc-icon name="rocket" size="20"></wc-icon> Font Awesome solid, <wc-icon name="fa-regular fa-star" size="20"></wc-icon> regular, <wc-icon name="fa-brands fa-github" size="20"></wc-icon> brands, <wc-icon name="lucide:zap" size="20" color="#f59e0b"></wc-icon> Lucide, <wc-icon name="💡" size="20"></wc-icon> emoji, and a bare legacy name <wc-icon name="warning" size="20"></wc-icon>.

## Callouts

<wc-callout type="info" title="Info">Default icon per type, inline `code` and **bold**.</wc-callout>

<wc-callout type="tip" title="Tip">A helpful suggestion.</wc-callout>

<wc-callout type="warning" title="Warning">Careful with this one.</wc-callout>

<wc-callout type="danger" title="Danger">This cannot be undone.</wc-callout>

<wc-callout type="check" title="Check">All good.</wc-callout>

<wc-callout type="note" title="Note">Supplementary context.</wc-callout>

<wc-callout type="launch" title="Launch">Styled with the accent colour.</wc-callout>

<wc-callout icon="skull-crossbones" color="#8b5cf6" title="Custom callout">Custom icon and colour, no type needed.</wc-callout>

<wc-callout title="No icon" icon="none">Hidden icon.</wc-callout>

## Banner

<wc-banner type="info" dismissible>Info banner, dismissible (remembered across reloads).</wc-banner>

<wc-banner type="warning">Warning banner with a <a href="#icons-build-time-offline-safe">link</a>.</wc-banner>

<wc-banner type="critical" icon="triangle-alert">Critical banner with an icon.</wc-banner>

<wc-banner color="#7c3aed" dark-color="#5b21b6" dismissible>Custom solid colour banner.</wc-banner>

## Badges

<wc-badge>default</wc-badge> <wc-badge variant="success" icon="check">success</wc-badge> <wc-badge variant="warning">warning</wc-badge> <wc-badge variant="orange">orange</wc-badge> <wc-badge variant="danger">danger</wc-badge> <wc-badge variant="info">info</wc-badge> <wc-badge variant="purple">purple</wc-badge> <wc-badge variant="neutral">neutral</wc-badge> <wc-badge variant="launch" minimal>launch minimal</wc-badge> <wc-badge variant="tip" outlined>tip outlined</wc-badge> <wc-badge variant="note" shape="pill">pill</wc-badge> <wc-badge size="xs">xs</wc-badge> <wc-badge size="sm">sm</wc-badge> <wc-badge size="lg">lg</wc-badge> <wc-badge disabled>disabled</wc-badge>

## Tooltips

Hover, focus (Tab) or tap: <wc-tooltip tip="A short tooltip.">plain tip</wc-tooltip>, <wc-tooltip tip="Lit is a small library for web components." headline="Lit" cta="Open lit.dev" href="https://lit.dev">headline and CTA</wc-tooltip>, <wc-tooltip tip="Opens below." position="bottom">bottom</wc-tooltip>, <wc-tooltip tip="Opens to the right." position="right">right</wc-tooltip>.

## Update (changelog)

<wc-update label="2026-10-29" description="v1.2.0" tags="Feature, Fix">

## Bulk imports

Added bulk plant imports and fixed pagination on large gardens.

- Faster import
- Better errors

</wc-update>

<wc-update label="2026-09-12" description="v1.1.0" tags="Improvement">
A shorter entry.
</wc-update>

<wc-update version="1.0.0" date="August 2026" type="added">Compact boxed layout still works.</wc-update>

## Frames

<wc-frame caption="Caption with **bold** and a [link](https://example.com)." hint="Hint text above the frame" border background="subtle">
  <div style="width:100%;height:120px;background:linear-gradient(135deg,#01696f,#4f98a3);border-radius:8px"></div>
</wc-frame>

## Accordions and expandables

<wc-accordion-group>
<wc-accordion title="Open by default" description="With a description line" icon="circle-help" open>

Accordion body with **Markdown** and a list:

- one
- two

</wc-accordion>
<wc-accordion title="Closed item with `code`" icon="fa-solid fa-gear">

Hidden until opened. Press Enter or Space on the header.

</wc-accordion>
</wc-accordion-group>

<wc-expandable title="Nested properties">
Expandable content.
</wc-expandable>

## Steps

<wc-steps>
<wc-step title="Install the CLI" icon="download">
Run `npm install -g docslit`.
</wc-step>
<wc-step title="Initialise a project">
Run `docslit init my-docs`.
</wc-step>
<wc-step title="Build and deploy" icon="rocket">
Run `docslit build`.
</wc-step>
</wc-steps>

<wc-steps title-size="h3">
<wc-step title="Heading-level step">
Title is a real h3: it appears in the table of contents.
</wc-step>
<wc-step title="Second heading step" n="7">
Custom number via the n attribute.
</wc-step>
</wc-steps>

## Tabs

<wc-tabs sync="os">
<wc-tab label="macOS" icon="apple">
Use Homebrew on macOS.
</wc-tab>
<wc-tab label="Linux" icon="fa-brands fa-linux">
Use your package manager.
</wc-tab>
<wc-tab label="Windows" icon="fa-brands fa-windows">
Use winget.
</wc-tab>
</wc-tabs>

<wc-tabs sync="os" border-bottom default-tab="1">
<wc-tab label="macOS">
Synced with the group above; opened on tab index 1 by default.
</wc-tab>
<wc-tab label="Linux">
Linux notes.
</wc-tab>
<wc-tab label="Windows">
Windows notes.
</wc-tab>
</wc-tabs>

## View (switchable views)

<wc-view sync="lang">
<wc-view-panel label="JavaScript" icon="fa-brands fa-js">
JavaScript view.
</wc-view-panel>
<wc-view-panel label="Python" icon="fa-brands fa-python">
Python view.
</wc-view-panel>
</wc-view>

## Cards and tiles

<wc-tiles cols="2">
<wc-card title="Icon card" href="#cards-and-tiles" icon="rocket">
A plain linked card with a named icon.
</wc-card>
<wc-card title="External with CTA" href="https://example.com" icon="fa-brands fa-github" cta="Visit site">
Shows the corner arrow for external links.
</wc-card>
<wc-card title="Horizontal" icon="book" horizontal>
Compact horizontal layout, not a link.
</wc-card>
<wc-card title="Typed card" icon="lightbulb" type="tip" href="#cards-and-tiles">
Callout-themed card.
</wc-card>
<wc-card title="Coloured icon" icon="heart" icon-color="#ef4444" icon-color-dark="#f87171" icon-size="44">
Icon colour with a dark-mode override.
</wc-card>
<wc-card title="Image card" img="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='200'%3E%3Crect width='600' height='200' fill='%2301696f'/%3E%3C/svg%3E" href="#cards-and-tiles">
Image on top.
</wc-card>
</wc-tiles>

<wc-tiles cols="3">
<wc-tile title="Compact tile" description="Icon, title and description." icon="package" href="#cards-and-tiles"></wc-tile>
<wc-tile title="Another tile" description="Tile without a link." icon="zap"></wc-tile>
<wc-tile title="Preview tile" description="Image preview above the title." href="#cards-and-tiles">
<div style="width:100%;height:100px;background:linear-gradient(135deg,#6366f1,#ec4899);border-radius:6px"></div>
</wc-tile>
</wc-tiles>

## Buttons

<wc-button label="Primary" href="#buttons"></wc-button> <wc-button variant="success" icon="check">Success</wc-button> <wc-button variant="warning" right-icon="arrow-right">Warning</wc-button> <wc-button variant="danger">Danger</wc-button> <wc-button variant="outline">Outline</wc-button> <wc-button variant="ghost">Ghost</wc-button> <wc-button variant="none">Plain</wc-button> <wc-button outlined rounded>Outlined rounded</wc-button> <wc-button minimal mono>Minimal mono</wc-button> <wc-button size="sm">Small</wc-button> <wc-button size="lg">Large</wc-button> <wc-button disabled>Disabled</wc-button>

<wc-button full variant="primary" href="https://example.com" target="_blank">Full width external</wc-button>

## Prompt

<wc-prompt title="Generate an SDK" actions="cursor,claude,chatgpt" icon="sparkles">
Generate a TypeScript SDK from my OpenAPI spec and add usage examples.
</wc-prompt>

<wc-prompt title="Description mode" description="A short **summary** is shown; the full prompt below is what gets copied." single-line>
You are a docs assistant. Rewrite the page so it follows the style guide, keep every code sample intact, and list the changes you made.
</wc-prompt>

<wc-prompt title="Header only" hide-prompt actions='[{"label":"Open in my tool","url":"https://example.com/?q={prompt}"}]'>
Hidden prompt body.
</wc-prompt>

## Files and tree

<wc-files>
<wc-dir name="my-docs" comment="project root">
<wc-file name="docslit.json" highlight comment="site config" href="#files-and-tree"></wc-file>
<wc-dir name="docs">
<wc-file name="index.md"></wc-file>
<wc-file name="logo.png"></wc-file>
<wc-file name="data.json"></wc-file>
</wc-dir>
<wc-dir name="src" collapsed highlight>
<wc-file name="main.js"></wc-file>
</wc-dir>
<wc-dir name="static" openable="false">
<wc-file name="robots.txt"></wc-file>
</wc-dir>
</wc-dir>
</wc-files>

## Colours

<wc-colors variant="compact">
<wc-color name="primary" value="#16a34a"></wc-color>
<wc-color name="surface" light="#ffffff" dark="#0b0b0b"></wc-color>
<wc-color name="accent" value="oklch(70% 0.2 145)" variable="--accent"></wc-color>
<wc-color name="warning" value="rgb(245, 158, 11)"></wc-color>
</wc-colors>

<wc-colors variant="table">
<wc-color-row title="Brand">
<wc-color name="brand-500" value="#0ea5e9"></wc-color>
<wc-color name="brand-700" value="#0369a1"></wc-color>
</wc-color-row>
<wc-color-row title="Neutral">
<wc-color name="gray-100" value="#f3f4f6"></wc-color>
<wc-color name="gray-900" value="#111827"></wc-color>
</wc-color-row>
</wc-colors>

## Fields (pre / post / placeholder)

<wc-fields title="Parameters">
<wc-field name="user_id" type="string" in="path" required pre="new" post="beta">
ID of the user.
</wc-field>
<wc-field name="limit" type="integer" default="20" placeholder="20" deprecated>
Page size.
</wc-field>
</wc-fields>

## Copy, download, embeds

Install with <wc-copy clipboard="npm install -g docslit">npm install</wc-copy> and note the version <wc-copy>v2.0</wc-copy>.

<wc-download href="#copy-download-embeds" filename="report.pdf" label="Download report" size="2.4 MB"></wc-download>

<wc-embed src="https://www.youtube.com/embed/4KzFe50RQkQ" title="Privacy-friendly video facade"></wc-embed>

<wc-embed src="https://example.com/embed" title="Generic iframe (lazy)" ratio="4/3"></wc-embed>

## GitHub repository

<wc-github-repo repo="UmbrellaDocs/docslit-cli" description="Static docs generator: Markdown + Lit web components." stars="120" language="JavaScript" live="false"></wc-github-repo>

## Tables

<wc-table sticky searchable placeholder="Filter plants" max-height="14rem">

| Plant | Light | Water |
| --- | --- | --- |
| Fern | Partial shade | Weekly |
| Snake plant | Low to bright indirect | Bi-weekly |
| Monstera | Bright indirect | Weekly |
| Pothos | Low to bright | Weekly |
| Fiddle leaf fig | Bright indirect | Weekly |
| Peace lily | Low to medium | Weekly |
| Rubber plant | Bright indirect | Weekly |
| ZZ plant | Low to bright | Bi-weekly |
| Aloe vera | Bright direct | Bi-weekly |
| Spider plant | Medium to bright | Weekly |

</wc-table>

## Aside

<wc-aside title="Related">
A sticky aside floats right on wide screens and flows inline on small ones.
</wc-aside>

The aside above floats to the right of this paragraph. Add the `sticky` attribute (best near the top of a page) to keep it pinned below the header while scrolling. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

## Conditional content

<wc-if attr="SHOW_BETA">
Shown only when the `SHOW_BETA` attribute is set in docslit.json.
</wc-if>

<wc-if version="unversioned">
Shown in unversioned builds.
</wc-if>

<wc-if for="agents">
This sentence is hidden on the web and appears only in the generated Markdown for AI agents.
</wc-if>

## Scroll walkthrough

<wc-walkthrough>
<wc-walkthrough-step title="Install the SDK" file="Terminal" focus="1">
Add the package to your project.
</wc-walkthrough-step>
<wc-walkthrough-step title="Create the client" file="garden.js">
Point the client at your garden.
<wc-walkthrough-substep focus="1">Import the client.</wc-walkthrough-substep>
<wc-walkthrough-substep focus="3-5">Construct it with an API key.</wc-walkthrough-substep>
</wc-walkthrough-step>
<wc-walkthrough-step title="Add a plant" file="garden.js" highlight="7-11">
Create your first plant record.
</wc-walkthrough-step>
<wc-walkthrough-step title="Done" file="garden.js" focus="12-13">
Log the result.
</wc-walkthrough-step>

```bash title="Terminal"
npm install @plantstore/sdk
```

```js title="garden.js"
import { PlantStore } from "@plantstore/sdk";

const client = new PlantStore({
  apiKey: process.env.PLANT_API_KEY,
});

await client.plants.create({
  name: "Monstera deliciosa",
  light: "bright-indirect",
  wateringDays: 7,
});
console.log("created");
console.log("done");
```
</wc-walkthrough>

## Lists, images, math

Images inside links do not zoom: [![inline logo](data:image/svg+xml;utf8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='80'%20height='24'%3E%3Crect%20width='80'%20height='24'%20fill='%2301696f'/%3E%3C/svg%3E)](https://example.com)

Inline math $E = mc^2$ and display math:

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$
