/**
 * Bundles Lit 3.x and FlexSearch from node_modules into self-contained ESM
 * files under src/vendor/ using esbuild.
 *
 * Run:  npm run vendor
 */

import esbuild from 'esbuild';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = path.resolve(__dirname, '../src/vendor');
const ROOT = path.resolve(__dirname, '..');

await fs.ensureDir(VENDOR_DIR);

const ENTRIES = [
  { entry: 'lit',                          out: 'lit.js' },
  { entry: 'lit/decorators.js',            out: 'lit-decorators.js' },
  { entry: 'lit/directives/unsafe-html.js', out: 'lit-unsafe-html.js' },
  { entry: '@lit/reactive-element',        out: 'reactive-element.js' },
  { entry: 'lit-html',                     out: 'lit-html.js' },
  { entry: 'lit-element/lit-element.js',   out: 'lit-element.js' },
  { entry: 'flexsearch', out: 'flexsearch.js' },
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
      format: 'esm',
      write: false,
      minify: true,
      legalComments: 'none',
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
