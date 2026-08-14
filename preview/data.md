---
title: Data & API
---

# Data & API

## wc-fields / wc-field

A parameter table for documenting API request bodies, query params, etc.

<wc-fields title="Request body">
<wc-field name="title" type="string" required description="The display title of the document. Shown in the sidebar and browser tab."></wc-field>
<wc-field name="content" type="string" required description="The Markdown source content of the document."></wc-field>
<wc-field name="slug" type="string" description="URL-safe identifier. Auto-derived from title if omitted." default="auto"></wc-field>
<wc-field name="draft" type="boolean" description="When true the page is hidden from production builds but visible in dev mode." default="false"></wc-field>
<wc-field name="tags" type="string[]" description="Optional array of tag strings for filtering and grouping."></wc-field>
</wc-fields>

<wc-fields title="Query parameters">
<wc-field name="limit" type="number" description="Maximum number of results to return." default="20"></wc-field>
<wc-field name="offset" type="number" description="Number of results to skip for pagination." default="0"></wc-field>
<wc-field name="q" type="string" description="Full-text search query string."></wc-field>
<wc-field name="sort" type="enum" description="Sort order for results. One of: `created_asc`, `created_desc`, `title_asc`." default="created_desc"></wc-field>
</wc-fields>

## wc-response-fields

Like `wc-fields` but labelled for response objects.

<wc-response-fields>
<wc-field name="id" type="string" description="The unique document identifier (prefix: `doc_`)."></wc-field>
<wc-field name="title" type="string" description="The document title as stored."></wc-field>
<wc-field name="slug" type="string" description="URL-safe slug derived from the title."></wc-field>
<wc-field name="createdAt" type="ISO 8601" description="Timestamp of when the document was created."></wc-field>
<wc-field name="updatedAt" type="ISO 8601" description="Timestamp of the most recent edit."></wc-field>
<wc-field name="draft" type="boolean" description="Whether the document is in draft state."></wc-field>
</wc-response-fields>

## wc-schema

A named type definition with an optional `extends` reference.

<wc-schema type="Document" description="Represents a single documentation page managed by the API.">
<wc-field name="id" type="string" description="Unique identifier."></wc-field>
<wc-field name="title" type="string" required description="Human-readable title."></wc-field>
<wc-field name="content" type="string" description="Raw Markdown content."></wc-field>
<wc-field name="meta" type="PageMeta" description="Frontmatter metadata parsed from the Markdown source."></wc-field>
</wc-schema>

<wc-schema type="PageMeta" extends="Record&lt;string, unknown&gt;" description="Typed subset of the YAML frontmatter extracted from a Markdown file.">
<wc-field name="title" type="string" description="Page title — overrides the H1 heading in the sidebar."></wc-field>
<wc-field name="draft" type="boolean" description="Hides the page from production builds."></wc-field>
<wc-field name="tag" type="string" description="Short label displayed in the page meta bar."></wc-field>
<wc-field name="updated" type="string" description="Human-readable last-updated date shown in the meta bar."></wc-field>
</wc-schema>

## wc-color

Colour swatches with click-to-copy. Click any swatch to copy the CSS variable or hex value.

<wc-color hex="#01696f" name="Accent" variable="--accent"></wc-color>
<wc-color hex="#4f98a3" name="Accent Light" variable="--accent-light"></wc-color>
<wc-color hex="#0a0a0a" name="Background" variable="--bg"></wc-color>
<wc-color hex="#111111" name="Surface" variable="--surface"></wc-color>
<wc-color hex="#2a2a2a" name="Border" variable="--border"></wc-color>
<wc-color hex="#f0f0f0" name="Text" variable="--text"></wc-color>
<wc-color hex="#a0a0a0" name="Text 2" variable="--text2"></wc-color>

## wc-table

A JSON-driven table with sticky headers and hover rows.

<wc-table headers='["Method","Endpoint","Auth","Description"]' rows='[["GET","/api/v2/documents","Bearer","List all documents"],["POST","/api/v2/documents","Bearer","Create a new document"],["GET","/api/v2/documents/:id","Bearer","Fetch a single document"],["PATCH","/api/v2/documents/:id","Bearer","Update a document"],["DELETE","/api/v2/documents/:id","Bearer","Delete a document"]]'></wc-table>

## wc-asciidoc-table

Author tables using [AsciiDoc table syntax](https://docs.asciidoctor.org/asciidoc/latest/tables/table-ref/). Supports PSV (default), CSV, DSV, TSV, column specs, header/footer options, cell spans, alignment, and cell styles.

<wc-asciidoc-table>
[cols="1,2,3",options="header"]
|===
|Method |Path |Description

|GET
|/users
|List users

|POST
|/users
|Create a user

|GET
|/users/:id
|Fetch one user
|===
</wc-asciidoc-table>

Spans, alignment, and styles:

<wc-asciidoc-table>
|===
|Feature |Notes

2+|Spans both columns

|Right aligned
>|This cell is right-aligned

|Strong
s|Bold cell text

|Monospace
m|GET /v1/items
|===
</wc-asciidoc-table>

CSV format:

<wc-asciidoc-table format="csv" options="header">
|===
Method,Path,Description
GET,/health,Liveness probe
POST,/deploy,Trigger deploy
|===
</wc-asciidoc-table>

## wc-response / wc-responses

HTTP status code tables. `wc-responses` wraps one or more `wc-response` rows.

<wc-responses>
<wc-response code="200" description="Document returned successfully" content-type="application/json"></wc-response>
<wc-response code="201" description="Document created" content-type="application/json"></wc-response>
<wc-response code="400" description="Invalid request body — check required fields" content-type="application/json"></wc-response>
<wc-response code="401" description="Missing or invalid Bearer token"></wc-response>
<wc-response code="404" description="Document not found"></wc-response>
<wc-response code="500" description="Internal server error"></wc-response>
</wc-responses>

## wc-endpoint

Full API endpoint card. Tabs are auto-generated from child components (`wc-fields`, `wc-responses`, `wc-response-fields`, `wc-code-tab`).

<wc-endpoint method="GET" url="/api/v2/documents/:id" summary="Fetch a document" description="Returns a single document by its unique identifier. The `id` must be prefixed with `doc_`." security='[{"BearerAuth":[]}]'>
<wc-fields title="Path parameters">
<wc-field name="id" type="string" required in="path" description="The document identifier (e.g. `doc_abc123`)."></wc-field>
</wc-fields>
<wc-responses>
<wc-response code="200" description="Document found" content-type="application/json"></wc-response>
<wc-response code="401" description="Unauthorized"></wc-response>
<wc-response code="404" description="No document with that ID exists"></wc-response>
</wc-responses>
<wc-response-fields title="Response body">
<wc-field name="id" type="string" description="Unique document ID."></wc-field>
<wc-field name="title" type="string" description="Document title."></wc-field>
<wc-field name="content" type="string" description="Raw Markdown content."></wc-field>
<wc-field name="draft" type="boolean" description="Whether the document is a draft."></wc-field>
<wc-field name="createdAt" type="ISO 8601" description="Creation timestamp."></wc-field>
</wc-response-fields>
<wc-code-tab label="cURL">curl -X GET https://api.docslit.com/api/v2/documents/doc_abc123 \
  -H "Authorization: Bearer $TOKEN"</wc-code-tab>
<wc-code-tab label="JavaScript">const res = await fetch('https://api.docslit.com/api/v2/documents/doc_abc123', {
  headers: { Authorization: `Bearer ${token}` }
});
const doc = await res.json();</wc-code-tab>
<wc-code-tab label="Python">import requests
r = requests.get(
    "https://api.docslit.com/api/v2/documents/doc_abc123",
    headers={"Authorization": f"Bearer {token}"}
)
doc = r.json()</wc-code-tab>
</wc-endpoint>

## wc-api-examples

Response and request-body example viewer driven by a `data` JSON attribute (pre-built from an OpenAPI spec).

<wc-api-examples method="POST" url="/api/v2/documents" data='{"responses":[{"code":"201","content":[{"mediaType":"application/json","examples":[{"summary":"Created","value":{"id":"doc_xyz789","title":"My Guide","slug":"my-guide","draft":false,"createdAt":"2025-01-15T10:30:00Z"}}]}]},{"code":"400","content":[{"mediaType":"application/json","examples":[{"summary":"Validation error","value":{"error":"title is required","field":"title"}}]}]},{"code":"401","content":[{"mediaType":"application/json","examples":[{"summary":"Unauthorized","value":{"error":"Invalid or expired token"}}]}]}],"requestBody":[{"mediaType":"application/json","examples":[{"summary":"Minimal","value":{"title":"My Guide","content":"# Hello\n\nWelcome to my guide."}},{"summary":"Full","value":{"title":"My Guide","slug":"my-guide","content":"# Hello","draft":false,"tags":["tutorial","api"]}}]}]}'></wc-api-examples>

## wc-runnable-endpoint

An interactive REST client that sends live requests from the browser. Pre-populated with `method` and `url` attributes.

<wc-runnable-endpoint method="GET" url="https://httpbin.org/get"></wc-runnable-endpoint>

## wc-playground

OpenAPI-style "Try it" widget. Reads `params` (JSON array of parameter objects with `in`, `name`, `example`) and an optional `auth` descriptor.

<wc-playground method="GET" url="/get" server="https://httpbin.org" params='[{"in":"query","name":"format","example":"json"},{"in":"query","name":"page","example":"1"},{"in":"header","name":"X-Request-ID","example":"preview-001"}]'></wc-playground>

## wc-mermaid

Renders Mermaid diagrams lazily (loads mermaid@10 from CDN on first render).

<wc-mermaid>
flowchart LR
  A[Markdown] --> B[parseDoc]
  B --> C[renderShell]
  C --> D[HTML]
  D --> E[Browser]
  E --> F[Lit Components]
</wc-mermaid>

<wc-mermaid>
sequenceDiagram
  participant CLI
  participant FS as File System
  participant Server as Dev Server
  participant Browser

  CLI->>FS: watch docs/**/*.md
  Browser->>Server: GET /api/page/intro
  Server->>FS: readFile intro.md
  FS-->>Server: raw content
  Server->>Server: parseDoc()
  Server-->>Browser: {meta, html}
  FS->>Server: file changed
  Server->>Browser: ws reload
  Browser->>Browser: window.location.reload()
</wc-mermaid>
