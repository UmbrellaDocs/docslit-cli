---
title: Callouts & Notices
---

# Callouts & Notices

## wc-callout

Six semantic types — info, warning, error, success, tip, note.

<wc-callout type="info" title="Information">This is an informational callout. Use it to highlight useful context without urgency.</wc-callout>

<wc-callout type="warning" title="Warning">This action cannot be undone. Please review your changes before proceeding.</wc-callout>

<wc-callout type="error" title="Error">Failed to connect to the API. Check your network connection and try again.</wc-callout>

<wc-callout type="success" title="Success">Your configuration has been saved and is now active across all regions.</wc-callout>

<wc-callout type="tip" title="Pro Tip">Use the `--watch` flag to automatically rebuild on file changes during development.</wc-callout>

<wc-callout type="note" title="Note">This feature is only available on the Pro plan and above.</wc-callout>

### Without a title

<wc-callout type="info">Callouts also work without a title — just a body message.</wc-callout>

## wc-alert

`wc-alert` is an alias for `wc-callout` — registered as a separate element but shares the same implementation.

<wc-alert type="warning">This API endpoint is rate-limited to 100 requests per minute.</wc-alert>

## wc-banner

Full-width inline strip, optionally dismissible.

<wc-banner type="info">📣 New in v1.2: dark mode is now fully supported across all components.</wc-banner>

<wc-banner type="warning" dismissible>⚠️ You are viewing a deprecated API version. Migrate to v3 by December 2026. Click × to dismiss.</wc-banner>

<wc-banner type="success">✅ Deployment successful — live at https://my-docs.example.com</wc-banner>

<wc-banner type="error">🚨 Build failed. Fix the errors below before deploying.</wc-banner>

<wc-banner type="neutral">Scheduled maintenance on Sunday May 10 from 02:00–04:00 UTC.</wc-banner>

## wc-badge

Inline label pills for status, tags, and metadata.

<wc-badge variant="default">Default</wc-badge> <wc-badge variant="success">Stable</wc-badge> <wc-badge variant="warning">Beta</wc-badge> <wc-badge variant="danger">Deprecated</wc-badge> <wc-badge variant="info">New</wc-badge> <wc-badge variant="neutral">Draft</wc-badge> <wc-badge variant="purple">AI</wc-badge>

Using the `label` attribute instead of slot content:

<wc-badge variant="success" label="v1.2.0"></wc-badge> <wc-badge variant="info" label="GET"></wc-badge> <wc-badge variant="danger" label="DELETE"></wc-badge>

## wc-tooltip

Inline text with a hover tooltip. Use `position="bottom"` to flip the tooltip below.

Hover over <wc-tooltip text="The unique identifier for this resource">the id field</wc-tooltip> to read its description.

The `updated` attribute expects <wc-tooltip text="Format: YYYY-MM-DD" position="bottom">an ISO date string</wc-tooltip> in UTC.

## wc-update

Changelog entries — six types: added, changed, fixed, removed, deprecated, security.

<wc-update type="added" version="1.2.0" date="May 2026">Added `wc-mermaid` component for rendering Mermaid diagrams inline in documentation pages.</wc-update>

<wc-update type="changed" version="1.1.0" date="Apr 2026">Updated authentication flow to use OAuth 2.0 PKCE instead of implicit grant for improved security.</wc-update>

<wc-update type="fixed" version="1.0.5" date="Mar 2026">Fixed a regression where the sidebar would not highlight the active page on initial load.</wc-update>

<wc-update type="removed" version="1.0.0" date="Feb 2026">Removed the legacy `v1/sync` endpoint. Use the async `v2/jobs` API instead.</wc-update>

<wc-update type="deprecated" version="0.9.0" date="Jan 2026">The `apiKey` query parameter is deprecated. Pass credentials in the `Authorization` header instead.</wc-update>

<wc-update type="security" version="1.2.1" date="May 2026">Patched an XSS vulnerability in the markdown renderer when processing untrusted user content (CVE-2026-9999).</wc-update>
