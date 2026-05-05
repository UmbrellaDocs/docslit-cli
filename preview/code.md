---
title: Code
---

# Code

## wc-code-block

A styled code block with line numbers, word wrap, and an optional header showing the filename and language.

### No header

<wc-code-block>npm install docslit --save-dev</wc-code-block>

### With language label

<wc-code-block language="javascript">import { renderShell } from './template.js';

const html = renderShell({
  config,
  mode: 'dev',
  port: 3000,
});</wc-code-block>

### With filename and language

<wc-code-block filename="docslit.json" language="json">{
  "name": "My Docs",
  "sidebar": [
    {
      "group": "Getting Started",
      "pages": ["introduction", "quickstart", "configuration"]
    },
    {
      "group": "Components",
      "pages": ["callouts", "layout", "navigation", "code"]
    }
  ]
}</wc-code-block>

### Long lines wrap instead of scrolling

<wc-code-block language="bash">curl -X POST https://api.example.com/v2/documents -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfMTIzIn0.abc" -H "Content-Type: application/json" -d '{"title":"Hello","content":"# World"}'</wc-code-block>

### Multi-line with many line numbers

<wc-code-block filename="src/components/callouts.js" language="javascript">class WcCallout extends LitElement {
  static properties = {
    type: { type: String },
    title: { type: String },
  };

  render() {
    const t = this.type || 'info';
    return html`
      &lt;div class="wrap ${t}"&gt;
        ${this.title
          ? html`&lt;div class="title"&gt;${this.title}&lt;/div&gt;`
          : nothing
        }
        &lt;slot&gt;&lt;/slot&gt;
      &lt;/div&gt;
    `;
  }
}
customElements.define('wc-callout', WcCallout);</wc-code-block>

## wc-var

Defines a page-level variable that users can edit inline. All instances of the same variable stay in sync, and `{{VAR_NAME}}` placeholders inside code blocks are substituted automatically. When users copy a code block, the edited value is what gets copied.

### Inline variable

Replace <wc-var name="PROJECT_NAME" default="my-app"></wc-var> with your project name. Click the variable to edit it, every code block on this page updates automatically.

<wc-code-block language="bash">mkdir {{PROJECT_NAME}} && cd {{PROJECT_NAME}}</wc-code-block>

<wc-code-block filename="setup.sh" language="bash">#!/bin/bash
echo "Setting up {{PROJECT_NAME}}..."
git init {{PROJECT_NAME}}
cd {{PROJECT_NAME}}
npm init -y</wc-code-block>

### Multiple variables

Replace <wc-var name="API_KEY" default="your-api-key"></wc-var> with your API key and <wc-var name="REGION" default="us-east-1"></wc-var> with your preferred region.

<wc-code-block language="bash">curl -H "Authorization: Bearer {{API_KEY}}" \
  https://{{REGION}}.api.example.com/v2/status</wc-code-block>

<wc-code-block filename="config.yaml" language="yaml">provider:
  region: {{REGION}}
  credentials:
    api_key: {{API_KEY}}</wc-code-block>

## wc-code-group / wc-code-tab

A tabbed code group for showing the same snippet in multiple languages. Each `wc-code-tab` has a `label` attribute and its content is read as plain text (no HTML parsing).

<wc-code-group>
<wc-code-tab label="npm">npm install docslit</wc-code-tab>
<wc-code-tab label="pnpm">pnpm add docslit</wc-code-tab>
<wc-code-tab label="yarn">yarn add docslit</wc-code-tab>
<wc-code-tab label="bun">bun add docslit</wc-code-tab>
</wc-code-group>

<wc-code-group>
<wc-code-tab label="Node.js">import { docslit } from 'docslit';

const site = await docslit.build({
  dir: './docs',
  out: './dist',
});

console.log(`Built ${site.pages.length} pages`);</wc-code-tab>
<wc-code-tab label="CLI">npx docslit build --out ./dist</wc-code-tab>
<wc-code-tab label="Docker">docker run --rm \
  -v $(pwd)/docs:/app/docs \
  -v $(pwd)/dist:/app/dist \
  docslit/cli build</wc-code-tab>
</wc-code-group>
