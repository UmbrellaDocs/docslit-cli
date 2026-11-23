/**
 * docslit schema [config|frontmatter] — print a bundled JSON Schema.
 */
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.join(__dirname, '..', 'schema');

const FILES = {
  config: 'docslit.schema.json',
  docslit: 'docslit.schema.json',
  frontmatter: 'frontmatter.schema.json',
};

export function getSchemaPath(kind = 'config') {
  const file = FILES[kind];
  return file ? path.join(SCHEMA_DIR, file) : null;
}

export async function readSchema(kind = 'config') {
  const p = getSchemaPath(kind);
  if (!p) return null;
  return fs.readJson(p);
}

export async function schema(args = []) {
  const kind = args.find((a) => !a.startsWith('--')) || 'config';
  const s = await readSchema(kind);
  if (!s) {
    console.error(`  Unknown schema: ${kind}\n  Usage: docslit schema [config|frontmatter]\n`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(s, null, 2) + '\n');
}
