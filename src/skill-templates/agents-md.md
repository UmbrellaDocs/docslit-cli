## DocsLit docs

This project is a DocsLit site: Markdown pages in `%%DOCS_DIR%%/` with embeddable `<wc-*>` web components, configured by `docslit.json`.

%%PROJECT%%
### Authoring loop

1. Discover, never guess: `docslit components --json` (all components), `docslit components <tag> --json` (attributes, nesting, example), `docslit schema` / `docslit schema frontmatter`.
2. Create the page: `docslit new <page-id> --title "..." --description "..." --json`%%NEW_HINT%%.
3. Write the content in `%%DOCS_DIR%%/<page-id>.md`.
4. Check: `docslit validate --format json` (is it broken?) and `docslit lint --format json` (is it good?). Fix every error and warning; each issue has a `file`, `line` and `fix`. Repeat until both are clean.

### Rules

- Frontmatter needs `title` and a one-sentence `description` (30 to 200 chars).
- One `# H1` matching the title; do not skip heading levels; no duplicate headings on a page.
- Fenced code blocks always have a language. Images always have alt text. Link text is descriptive, not "click here".
- Blank line before and after every `<wc-*>` block and after its opening tag, or the Markdown body will not render.
- Close components explicitly (`<wc-tile ...></wc-tile>`); only `<wc-include src="..." />` is self-closing.
- Respect nesting: `wc-tabs` > `wc-tab`, `wc-steps` > `wc-step`, `wc-code-group` > `wc-code-tab`, `wc-fields` > `wc-field`, `wc-tiles` > `wc-tile`. Code bodies are raw text, not Markdown.
- Cards, tiles, buttons, callouts and steps take `icon` (a Lucide / Font Awesome name, emoji, image path or URL; `icon-name` is an accepted alias); tabs use `label`. Do not invent attributes; check the manifest.
- Keep pages under about 2500 words and link to related pages with relative slugs (`[Setup](setup)`).
- No TODO/TBD text in prose.

Full reference: `npx docslit agents print author`%%SKILL_HINT%%.
