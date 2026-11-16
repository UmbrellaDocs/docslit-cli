/**
 * Discovery of a project's custom components (files under <project>/components).
 *
 * A component file's base name is its tag (`components/wc-widget.js` ->
 * `wc-widget`; the build copies the folder verbatim and projects import it
 * themselves), and any tag a file registers via `customElements.define('x-y', …)`
 * counts as well. Shared by `docslit validate` and the MCP/markup checker so both
 * agree on what is "custom" (not just names starting with `wc-`).
 */
import path from 'path';
import fs from 'fs-extra';

const SCRIPT_RE = /\.(?:js|mjs|cjs|ts|mts)$/;

/** @returns {Promise<Set<string>>} tag names (lowercase) */
export async function listCustomComponentTags(dir) {
  const tags = new Set();
  const customDir = path.join(dir, 'components');
  let entries;
  try {
    entries = await fs.readdir(customDir, { withFileTypes: true });
  } catch {
    return tags;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const base = e.name.replace(/\.(?:js|mjs|cjs|ts|mts)$/, '');
    if (e.isDirectory() || SCRIPT_RE.test(e.name)) tags.add(base.toLowerCase());
    if (e.isFile() && SCRIPT_RE.test(e.name)) {
      try {
        const src = await fs.readFile(path.join(customDir, e.name), 'utf8');
        for (const m of src.matchAll(/customElements\s*\.\s*define\(\s*['"`]([a-z][a-z0-9._-]*-[a-z0-9._-]*)['"`]/gi)) {
          tags.add(m[1].toLowerCase());
        }
      } catch { /* unreadable file: base name is enough */ }
    }
  }
  return tags;
}
