---
title: Utility
---

# Utility

## wc-anchor

A linkable paragraph wrapper. On hover, a `#` link appears to the left for direct deep-linking.

<wc-anchor id="installation">**Installation** — hover this paragraph to see the anchor link appear to its left. The `id` attribute sets the hash fragment.</wc-anchor>

<wc-anchor id="quick-start">**Quick Start** — if you omit the `id` attribute, the component derives an id from its text content automatically.</wc-anchor>

## wc-indent

Visual indentation with a left border — useful for nested descriptions or hierarchical content.

Parent concept

<wc-indent>First level of indentation with a neutral left border.</wc-indent>

<wc-indent level="2">Second level of indentation — increases padding by one step.</wc-indent>

<wc-indent level="1" color="#4f98a3">Custom accent colour on the left border.</wc-indent>

<wc-indent level="1" color="#f87171">Error-red border for a warning sub-note.</wc-indent>

## wc-visibility

Wraps content with a visibility badge showing the minimum version or role required.

<wc-visibility version="1.2.0">This feature was added in **v1.2.0**. Earlier versions will silently ignore the attribute.</wc-visibility>

<wc-visibility role="admin">The `/admin/purge` endpoint is only accessible to users with the **admin** role.</wc-visibility>

<wc-visibility version="2.0.0" role="beta">This API is in beta and only available to **v2.0.0+** beta-programme participants.</wc-visibility>

## wc-versions / wc-version

A version switcher that reveals different content depending on the selected version. Set the `default` attribute to pre-select a version on load.

<wc-versions default="v2">
<wc-version name="v1">

**v1 API (Legacy)**

```js
const client = require('docslit-v1');
client.connect({ key: process.env.API_KEY });
```

This version is in maintenance mode. No new features will be added.

</wc-version>
<wc-version name="v2">

**v2 API (Current)**

```js
import { DocsLit } from 'docslit';
const client = new DocsLit({ token: process.env.TOKEN });
```

The v2 API uses ES modules and async/await throughout.

</wc-version>
<wc-version name="v3 (beta)">

**v3 API (Beta)**

```js
import { createClient } from 'docslit/v3';
const client = createClient(); // reads DOCSLIT_TOKEN from env
```

v3 auto-discovers your token from the environment — no explicit config needed.

</wc-version>
</wc-versions>

## wc-page-meta

Renders a page metadata bar — tag, component name, read time, and last-updated date. Typically placed just below the `h1`.

<wc-page-meta tag="Reference" component="wc-page-meta" readtime="2 min read" updated="May 4, 2026"></wc-page-meta>

This is an example of content that would follow the page-meta bar. The bar creates visual breathing room between the heading and the first paragraph.

<wc-page-meta tag="Guide" readtime="5 min read" updated="Apr 20, 2026"></wc-page-meta>

You can omit any combination of attributes — only the provided ones will render.
