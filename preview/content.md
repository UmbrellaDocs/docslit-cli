---
title: Content
---

# Content

## wc-card

A linked card with an optional emoji icon and title. Hover to see the lift animation.

<wc-columns cols="3">
<wc-card title="Getting Started" icon="🚀" href="#">Install DocsLit and scaffold your first documentation site in under five minutes.</wc-card>
<wc-card title="Components" icon="🧩" href="#">Browse all 39 built-in web components and learn how to use them in your Markdown.</wc-card>
<wc-card title="Configuration" icon="⚙️" href="#">Customise your sidebar, theme, navigation and build output with `docslit.json`.</wc-card>
</wc-columns>

<wc-columns cols="2">
<wc-card title="API Reference" icon="📖" href="#">Full reference for every CLI command, config option, and programmatic API.</wc-card>
<wc-card title="Deploy" icon="☁️" href="#">Deploy your static site to Vercel, Netlify, GitHub Pages, or any CDN.</wc-card>
</wc-columns>

## wc-tiles / wc-tile

A compact icon grid for navigation — icon, title, and short description per tile.

<wc-tiles cols="3">
<wc-tile icon="📝" title="Markdown" description="Write docs in standard GFM Markdown" href="#"></wc-tile>
<wc-tile icon="🧩" title="Components" description="39 built-in Lit web components" href="#"></wc-tile>
<wc-tile icon="🎨" title="Theming" description="Dark, light, and system colour modes" href="#"></wc-tile>
<wc-tile icon="⚡" title="Hot Reload" description="Instant preview while you write" href="#"></wc-tile>
<wc-tile icon="📦" title="Zero Runtime" description="Static HTML — no JS framework required" href="#"></wc-tile>
<wc-tile icon="🔍" title="Search" description="Full-text search coming soon" href="#"></wc-tile>
</wc-tiles>

Two-column tiles:

<wc-tiles cols="2">
<wc-tile icon="🌐" title="Deploy anywhere" description="Output is plain HTML — host on S3, Vercel, Netlify, or your own server." href="#"></wc-tile>
<wc-tile icon="🔒" title="Private docs" description="No external tracking or analytics. Works fully offline after first load." href="#"></wc-tile>
</wc-tiles>

## wc-button

A call-to-action element with four variants and three sizes. Works as a link (`href`) or a plain button.

**Variants:**

<wc-button variant="primary" label="Primary"></wc-button> <wc-button variant="outline" label="Outline"></wc-button> <wc-button variant="ghost" label="Ghost"></wc-button> <wc-button variant="danger" label="Danger"></wc-button>

**Sizes:**

<wc-button size="sm" label="Small"></wc-button> <wc-button size="md" label="Medium"></wc-button> <wc-button size="lg" label="Large"></wc-button>

**As links:**

<wc-button variant="primary" href="#" label="Read the docs"></wc-button> <wc-button variant="outline" href="#" label="GitHub ↗"></wc-button>

## wc-prompt

An AI prompt display component with a copy button and purple accent. Ideal for documenting LLM prompts, system messages, or example queries.

<wc-prompt title="System prompt">You are a helpful documentation assistant. When answering questions about DocsLit, always cite the specific component name and attribute. Format code examples with the correct language tag. Keep responses concise and practical.</wc-prompt>

<wc-prompt title="User prompt">How do I show a multi-step installation guide using DocsLit web components?</wc-prompt>
