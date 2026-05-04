---
title: Media & Files
---

# Media & Files

## wc-icon

Inline SVG icons from a library of 30 built-in names. Use `size` (px) and `color` attributes.

Default (16 px): <wc-icon name="check"></wc-icon> <wc-icon name="x"></wc-icon> <wc-icon name="warning"></wc-icon> <wc-icon name="info"></wc-icon> <wc-icon name="error"></wc-icon>

Navigation: <wc-icon name="arrow-right"></wc-icon> <wc-icon name="arrow-left"></wc-icon> <wc-icon name="arrow-up"></wc-icon> <wc-icon name="arrow-down"></wc-icon> <wc-icon name="chevron-right"></wc-icon> <wc-icon name="chevron-down"></wc-icon>

Actions: <wc-icon name="copy"></wc-icon> <wc-icon name="download"></wc-icon> <wc-icon name="external-link"></wc-icon> <wc-icon name="link"></wc-icon> <wc-icon name="search"></wc-icon>

Objects: <wc-icon name="file"></wc-icon> <wc-icon name="folder"></wc-icon> <wc-icon name="code"></wc-icon> <wc-icon name="terminal"></wc-icon> <wc-icon name="book"></wc-icon> <wc-icon name="package"></wc-icon>

UI: <wc-icon name="settings"></wc-icon> <wc-icon name="user"></wc-icon> <wc-icon name="home"></wc-icon> <wc-icon name="star"></wc-icon> <wc-icon name="eye"></wc-icon> <wc-icon name="lock"></wc-icon> <wc-icon name="grid"></wc-icon> <wc-icon name="list"></wc-icon>

Scaled up with colour:

<wc-icon name="zap" size="32" color="#fbbf24"></wc-icon> <wc-icon name="star" size="32" color="#c084fc"></wc-icon> <wc-icon name="globe" size="32" color="#4f98a3"></wc-icon> <wc-icon name="cpu" size="32" color="#f87171"></wc-icon>

## wc-files / wc-dir / wc-file

A file-tree explorer. `wc-dir` is collapsible (open by default). Use `highlight` and `comment` on `wc-file`.

<wc-files>
<wc-dir name="my-docs">
  <wc-file name="docslit.json" highlight comment="config"></wc-file>
  <wc-file name="package.json"></wc-file>
  <wc-dir name="docs">
    <wc-file name="introduction.md" highlight comment="start here"></wc-file>
    <wc-file name="quickstart.md"></wc-file>
    <wc-file name="configuration.md"></wc-file>
  </wc-dir>
  <wc-dir name="components">
    <wc-file name="my-button.js"></wc-file>
  </wc-dir>
  <wc-dir name="dist">
    <wc-file name="index.html"></wc-file>
    <wc-file name="pages.json"></wc-file>
  </wc-dir>
</wc-dir>
</wc-files>

## wc-tree / wc-tree-item

A lightweight visual tree using `wc-tree-item` leaves.

<wc-tree>
<wc-tree-item label="Root"></wc-tree-item>
<wc-tree-item label="├── packages"></wc-tree-item>
<wc-tree-item label="│   ├── core"></wc-tree-item>
<wc-tree-item label="│   └── cli"></wc-tree-item>
<wc-tree-item label="└── docs"></wc-tree-item>
</wc-tree>

## wc-download

A download link button with an icon and optional description.

<wc-download href="/dist/docslit-1.2.0.tar.gz" filename="docslit-1.2.0.tar.gz" label="DocsLit v1.2.0" description="Source archive (tar.gz) — 84 KB"></wc-download>

<wc-download href="/dist/docslit-1.2.0.zip" filename="docslit-1.2.0.zip" label="DocsLit v1.2.0" description="Source archive (zip) — 92 KB"></wc-download>

## wc-copy

A click-to-copy code snippet button. Shows ✓ for 2 seconds on success.

<wc-copy text="npm install docslit" label="Copy install command"></wc-copy>

<wc-copy text="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" label="Copy sample JWT"></wc-copy>
