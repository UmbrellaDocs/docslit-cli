/**
 * Bundles Lit 3.x and FlexSearch from node_modules into self-contained ESM
 * files under src/vendor/ using esbuild.
 *
 * Run:  npm run vendor
 */

import esbuild from 'esbuild';
import fs from 'node:fs/promises';
import { ensureDir } from '../src/fs-helpers.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = path.resolve(__dirname, '../src/vendor');
const ROOT = path.resolve(__dirname, '..');

await ensureDir(VENDOR_DIR);

// lit.js is the only bundle that contains Lit's core (lit-html, ReactiveElement,
// LitElement). Every other Lit bundle imports the bare specifier 'lit' for those
// modules, which the page's import map points at lit.js, so a page loads exactly
// one copy of Lit. Bundling each entry on its own would inline a second lit-html
// into lit-unsafe-html.js (and so on), doubling bytes and splitting Lit's state.
const LIT_CORE_RE = /[\\/]node_modules[\\/](?:lit-html[\\/](?:development[\\/])?lit-html\.js|lit-element[\\/](?:development[\\/])?lit-element\.js|@lit[\\/]reactive-element[\\/](?:development[\\/])?(?:reactive-element|css-tag)\.js)$/;
const shareLitCore = {
  name: 'share-lit-core',
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      if (args.pluginData?.skip || args.kind === 'entry-point') return;
      const res = await build.resolve(args.path, { kind: args.kind, resolveDir: args.resolveDir, importer: args.importer, pluginData: { skip: true } });
      if (res.errors.length) return;
      return LIT_CORE_RE.test(res.path) ? { path: 'lit', external: true } : undefined;
    });
  },
};
const LIT_SHARED = { plugins: [shareLitCore] };

const ENTRIES = [
  { entry: 'lit',                          out: 'lit.js' },
  { entry: 'lit/decorators.js',            out: 'lit-decorators.js', ...LIT_SHARED },
  { entry: 'lit/directives/unsafe-html.js', out: 'lit-unsafe-html.js', ...LIT_SHARED },
  // These three are subsets of what 'lit' exports; re-export from it rather than
  // bundling separate copies (they stay in the import map for custom components).
  { entry: '@lit/reactive-element',        out: 'reactive-element.js', stdin: `export * from '@lit/reactive-element';`, ...LIT_SHARED },
  { entry: 'lit-html',                     out: 'lit-html.js', stdin: `export * from 'lit-html';`, ...LIT_SHARED },
  { entry: 'lit-element/lit-element.js',   out: 'lit-element.js', stdin: `export * from 'lit-element/lit-element.js';`, ...LIT_SHARED },
  // FlexSearch's ESM build has BOTH a default export ({ Document, Index, ... })
  // and the same names as named exports. `export *` alone drops the default,
  // which the search runtime (template.js) relies on, so re-export both.
  {
    entry: 'flexsearch',
    out: 'flexsearch.js',
    stdin: `export * from 'flexsearch'; export { default } from 'flexsearch';`,
  },
  // Classic-script build for --offline sites: module imports are blocked on
  // file:// (opaque origin), so offline pages load this with <script> and read
  // window.FlexSearch.
  {
    entry: 'flexsearch',
    out: 'flexsearch.iife.js',
    format: 'iife',
    stdin: `import FS from 'flexsearch'; globalThis.FlexSearch = FS;`,
  },
];

let ok = 0;
for (const item of ENTRIES) {
  const { out } = item;
  const destPath = path.join(VENDOR_DIR, out);
  process.stdout.write(`  Bundling ${out}… `);
  try {
    const result = await esbuild.build({
      stdin: {
        contents: item.stdin || `export * from ${JSON.stringify(item.entry)};`,
        resolveDir: ROOT,
      },
      bundle: true,
      format: item.format || 'esm',
      write: false,
      minify: true,
      legalComments: 'none',
      plugins: item.plugins || [],
    });
    const text = result.outputFiles[0].text;
    await fs.writeFile(destPath, text, 'utf8');
    const kb = (text.length / 1024).toFixed(1);
    console.log(`✓ (${kb} KB)`);
    ok++;
  } catch (err) {
    console.error(`✗ ${err.message}`);
  }
}

console.log(`\n  ${ok}/${ENTRIES.length} files saved to src/vendor/\n`);
if (ok < ENTRIES.length) process.exit(1);
