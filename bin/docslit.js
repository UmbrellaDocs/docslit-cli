#!/usr/bin/env node
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

const args = process.argv.slice(2);
const command = args[0];

const help = `
  docslit v${pkg.version}

  Usage:
    docslit init              Scaffold a new docs project
    docslit dev               Start the local dev server
    docslit build             Build a static site to ./dist
    docslit import <dir>      Migrate a Mintlify (or Fern/GitBook) project
                              to DocsLit — converts MDX components, generates
                              docslit.json, and prints a migration report.
    docslit validate [dir]    Check a project for broken links, missing assets,
                              frontmatter errors, and unknown components.
                              Exits 1 if any errors are found.

  DocsLit Cloud:
    docslit login             Authenticate with DocsLit Cloud
    docslit publish           Build and publish your docs to DocsLit Cloud
    docslit projects          List all published projects with URLs and status
    docslit rollback <slug>   Restore a project to a previous deploy
    docslit whoami            Show the currently authenticated user
    docslit delete <slug>     Delete a published project and all its files

  Options:
    --help, -h            Show this help message
    --version, -v         Print version
    --port <number>       Port for dev server (default: 3000)
    --out <dir>           Output directory for build (default: dist)
                          Also used by import (default: <source>-docslit)
    --offline             Inline all page data into index.html so the site
                          works by double-clicking the file (no server needed)
    --dry-run             (import only) Scan and report without writing files
    --strict              (validate only) Treat warnings as errors
`;

if (!command || command === '--help' || command === '-h') {
  console.log(help);
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log(pkg.version);
  process.exit(0);
}

if (command === 'init') {
  const { init } = await import('../src/init.js');
  await init(args.slice(1));
} else if (command === 'dev') {
  const port = getFlag(args, '--port') || 3000;
  const { dev } = await import('../src/dev.js');
  await dev({ port: Number(port) });
} else if (command === 'build') {
  const out = getFlag(args, '--out') || 'dist';
  const offline = args.includes('--offline');
  const { build } = await import('../src/build.js');
  await build({ out, offline });
} else if (command === 'import') {
  const restArgs = args.slice(1);
  if (!restArgs[0] || restArgs[0].startsWith('--')) {
    console.error('  Error: Please provide a source directory.\n');
    console.error('  Usage: docslit import <source-dir> [--out <output-dir>] [--dry-run]\n');
    process.exit(1);
  }
  const { importDocs } = await import('../src/import.js');
  await importDocs(restArgs);
} else if (command === 'validate') {
  const { validate } = await import('../src/validate.js');
  await validate(args.slice(1));
} else if (command === 'login') {
  const { login } = await import('../src/login.js');
  await login(args.slice(1));
} else if (command === 'whoami') {
  const { whoami } = await import('../src/whoami.js');
  await whoami();
} else if (command === 'publish') {
  const { publish } = await import('../src/publish.js');
  await publish(args.slice(1));
} else if (command === 'projects') {
  const { projects } = await import('../src/projects.js');
  await projects();
} else if (command === 'rollback') {
  const { rollback } = await import('../src/rollback.js');
  await rollback(args.slice(1));
} else if (command === 'delete') {
  const { deleteProject } = await import('../src/delete.js');
  await deleteProject(args.slice(1));
} else {
  console.error(`  Unknown command: ${command}\n`);
  console.log(help);
  process.exit(1);
}

function getFlag(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}
