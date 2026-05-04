import fs from 'fs-extra';
import path from 'path';
import pc from 'picocolors';

export async function init(args) {
  const dirName = args[0] || 'my-docs';
  const target = path.resolve(process.cwd(), dirName);

  if (await fs.pathExists(target)) {
    console.error(pc.red(`  Error: Directory "${dirName}" already exists.`));
    process.exit(1);
  }

  console.log(`\n  ${pc.bold('DocsLit')} — Scaffolding new project in ${pc.cyan(dirName)}/\n`);

  await fs.ensureDir(path.join(target, 'docs'));
  await fs.ensureDir(path.join(target, 'components'));

  // docslit.json
  await fs.writeFile(path.join(target, 'docslit.json'), JSON.stringify({
    name: dirName,
    sidebar: [
      {
        group: "Getting Started",
        pages: ["introduction", "installation", "quickstart"]
      }
    ]
  }, null, 2));

  // docs/introduction.md
  await fs.writeFile(path.join(target, 'docs', 'introduction.md'), `---
title: Introduction
tag: Guide
readtime: 2 min read
updated: ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
---

# Introduction

Welcome to **${dirName}** docs — powered by [DocsLit](https://docslit.com).

Write standard Markdown and embed interactive web components directly as HTML tags.

## Example

<wc-callout type="info" title="No imports needed">
  Just drop a tag in your Markdown. That's it.
</wc-callout>

<wc-button label="Click me">Click me</wc-button>
`);

  // docs/installation.md
  await fs.writeFile(path.join(target, 'docs', 'installation.md'), `---
title: Installation
tag: Guide
readtime: 3 min read
---

# Installation

DocsLit is an npm CLI. Install it globally or run it directly with \`npx\` — no account, no signup required.

## Requirements

- **Node.js** \`>=24.0.0\` — check with \`node --version\`
- Any package manager: npm, pnpm, or yarn

## Install the CLI

Install globally so \`docslit\` is available anywhere:

\`\`\`bash
npm install -g docslit
\`\`\`

Or use \`pnpm\`:

\`\`\`bash
pnpm add -g docslit
\`\`\`

Or skip the install entirely and use \`npx\`:

\`\`\`bash
npx docslit@latest init my-docs
\`\`\`

Verify the install:

\`\`\`bash
docslit --version
\`\`\`

## Your project config

Running \`docslit init\` already created \`docslit.json\` for you:

\`\`\`json
{
  "name": "${dirName}",
  "sidebar": [
    {
      "group": "Getting Started",
      "pages": ["introduction", "installation", "quickstart"]
    }
  ]
}
\`\`\`

Each entry in \`pages\` maps to a file in \`docs/\`. To add a new page, create \`docs/my-page.md\` and add \`"my-page"\` to the relevant group.

## Using web components

Every page can use built-in Lit web components directly in Markdown — no imports needed:

\`\`\`markdown
<wc-callout type="tip" title="Pro Tip">
  Drop any component tag directly in your Markdown.
</wc-callout>
\`\`\`

<wc-callout type="success" title="Ready to write?">Head to the Quick Start page for a full walkthrough.</wc-callout>
`);

  // docs/quickstart.md
  await fs.writeFile(path.join(target, 'docs', 'quickstart.md'), `---
title: Quick Start
tag: Guide
readtime: 2 min read
---

# Quick Start

Your project is scaffolded and ready. Here's how to go from zero to a live docs site.

## 1. Start the dev server

\`\`\`bash
docslit dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000). The server watches your \`docs/\` folder and hot-reloads on every save — including changes to \`docslit.json\`.

## 2. Write a page

Edit any \`.md\` file in \`docs/\` using standard Markdown. Drop in any built-in web component tag directly:

\`\`\`markdown
---
title: My Page
---

# My Page

<wc-callout type="info" title="Hello">
  This is a Lit web component — no imports needed.
</wc-callout>

<wc-steps>
<wc-step n="1" title="Step one">Do the first thing.</wc-step>
<wc-step n="2" title="Step two">Do the second thing.</wc-step>
</wc-steps>
\`\`\`

## 3. Add the page to the sidebar

Open \`docslit.json\` and add the slug (filename without \`.md\`) to a group:

\`\`\`json
{
  "name": "${dirName}",
  "sidebar": [
    {
      "group": "Getting Started",
      "pages": ["introduction", "installation", "quickstart", "my-page"]
    }
  ]
}
\`\`\`

## 4. Build for production

\`\`\`bash
docslit build
\`\`\`

Outputs a static site to \`dist/\`. Deploy to GitHub Pages, Vercel, Netlify, or any static host.

Want a single file you can open without a server?

\`\`\`bash
docslit build --offline
\`\`\`

This inlines all page data into \`dist/index.html\` so it works by double-clicking the file.
`);

  // .gitignore
  await fs.writeFile(path.join(target, '.gitignore'), `node_modules/\ndist/\n`);

  console.log(`  ${pc.green('✓')} Created ${pc.cyan('docslit.json')}`);
  console.log(`  ${pc.green('✓')} Created ${pc.cyan('docs/introduction.md')}`);
  console.log(`  ${pc.green('✓')} Created ${pc.cyan('docs/installation.md')}`);
  console.log(`  ${pc.green('✓')} Created ${pc.cyan('docs/quickstart.md')}`);
  console.log(`  ${pc.green('✓')} Created ${pc.cyan('components/')} (drop your custom components here)\n`);

  console.log(`  ${pc.bold('Done!')} Now run:\n`);
  console.log(`    ${pc.cyan(`cd ${dirName}`)}`);
  console.log(`    ${pc.cyan('npx docslit dev')}\n`);
}
