---
title: Navigation
---

# Navigation

## wc-steps / wc-step

Numbered sequential steps. Step numbers are auto-counted from sibling order.

<wc-steps>
<wc-step title="Install the CLI">Run `npm install -g docslit` to install the DocsLit command globally on your machine.</wc-step>
<wc-step title="Initialise your project">Inside your project directory run `docslit init`. This creates a `docslit.json` config and a `docs/` folder with a starter page.</wc-step>
<wc-step title="Start the dev server">Run `docslit dev` to launch a local preview at `http://localhost:3000`. The page reloads automatically on every save.</wc-step>
<wc-step title="Write your docs">Create Markdown files inside `docs/` and add them to the `sidebar` array in `docslit.json`. Use any of the built-in web components by dropping their tags directly into your Markdown.</wc-step>
<wc-step title="Publish">Run `docslit publish` to build a production-ready static site in the `dist/` folder, ready to deploy to any static host.</wc-step>
</wc-steps>

You can also pin a specific number with the `n` attribute:

<wc-steps>
<wc-step n="42" title="Explicit step number">Use the `n` attribute to hard-code a step number instead of relying on DOM order.</wc-step>
</wc-steps>

## wc-tabs / wc-tab

Tabbed content panels. Each `wc-tab` needs a `label` attribute.

<wc-tabs>
<wc-tab label="JavaScript">

```js
import { docslit } from 'docslit';

const site = docslit({ dir: './docs' });
site.build();
```

</wc-tab>
<wc-tab label="TypeScript">

```ts
import { docslit, type DocsConfig } from 'docslit';

const config: DocsConfig = { dir: './docs' };
const site = docslit(config);
await site.build();
```

</wc-tab>
<wc-tab label="Shell">

```sh
npx docslit init
npx docslit dev --port 4000
npx docslit build
```

</wc-tab>
</wc-tabs>

## wc-view / wc-view-panel

A bordered view with a toolbar-style tab strip — good for showing multiple perspectives of the same concept (e.g. Request / Response / Schema).

<wc-view>
<wc-view-panel label="Request">

**POST** `/api/v2/documents`

Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`

Body:
```json
{
  "title": "Getting Started",
  "content": "# Hello world"
}
```

</wc-view-panel>
<wc-view-panel label="Response">

**201 Created**

```json
{
  "id": "doc_abc123",
  "title": "Getting Started",
  "createdAt": "2026-05-04T10:00:00Z"
}
```

</wc-view-panel>
<wc-view-panel label="Errors">

| Code | Meaning |
|------|---------|
| 401  | Missing or invalid Bearer token |
| 422  | Validation error — check the `errors` array in the response body |
| 429  | Rate limit exceeded |

</wc-view-panel>
</wc-view>
