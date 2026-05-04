/**
 * Component preview server — renders preview/**.md files using the actual
 * DocsLit rendering pipeline so you can visually test all 39 components
 * in dark and light mode.
 *
 * Run:  node scripts/preview.js
 * URL:  http://localhost:4000
 */

import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import pc from 'picocolors';
import { parseDoc } from '../src/markdown.js';
import { renderShell } from '../src/template.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PREVIEW_DIR = path.join(ROOT, 'preview');
const PORT = 4000;

const PREVIEW_CONFIG = {
  name: 'Preview',
  sidebar: [
    { group: 'Text & Callouts', pages: ['callouts'] },
    { group: 'Layout',          pages: ['layout'] },
    { group: 'Navigation',      pages: ['navigation'] },
    { group: 'Code',            pages: ['code'] },
    { group: 'Media & Files',   pages: ['media'] },
    { group: 'Data & API',      pages: ['data'] },
    { group: 'Content',         pages: ['content'] },
    { group: 'Utility',         pages: ['utility'] },
  ],
};

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

function broadcast(event) {
  const msg = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

// Watch both preview markdown files and component source files — any change
// triggers a browser reload so edits to components are instantly visible.
const watcher = chokidar.watch([
  path.join(PREVIEW_DIR, '**/*.md'),
  path.join(ROOT, 'src/components/**/*.js'),
  path.join(ROOT, 'src/template.js'),
], { ignoreInitial: true });

watcher.on('all', (event, filePath) => {
  const rel = path.relative(ROOT, filePath);
  console.log(`  ${pc.cyan('~')} ${rel} changed — reloading`);
  broadcast({ type: 'reload' });
});

// API: list pages
app.get('/api/pages', (_req, res) => {
  res.json({ config: PREVIEW_CONFIG });
});

// API: serve a single preview page
app.get('/api/page/:id', async (req, res) => {
  const id = req.params.id;
  const mdPath = path.join(PREVIEW_DIR, `${id}.md`);
  if (!await fs.pathExists(mdPath)) {
    return res.status(404).json({ error: `Preview page "${id}" not found` });
  }
  const raw = await fs.readFile(mdPath, 'utf8');
  const { meta, html } = parseDoc(raw);
  res.json({ id, meta, html });
});

// Catch-all: serve the app shell
app.get('/{*path}', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderShell({ config: PREVIEW_CONFIG, mode: 'dev', port: PORT }));
});

server.listen(PORT, () => {
  console.log(`\n  ${pc.bold('DocsLit')} component preview\n`);
  console.log(`  ${pc.green('✓')} Ready at ${pc.cyan(`http://localhost:${PORT}`)}`);
  console.log(`  ${pc.dim('Watching src/components/ and preview/ for changes\n')}`);
});
