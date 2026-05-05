import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import pc from 'picocolors';
import { loadConfig, getAllPageIds, getVersionConfig, gitReadFile, getVersionSidebar } from './config.js';
import { parseDoc } from './markdown.js';
import { renderShell } from './template.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function dev({ port = 3000 } = {}) {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);

  console.log(`\n  ${pc.bold('DocsLit')} dev server starting...\n`);

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

  // Watch for changes
  const watcher = chokidar.watch([
    path.join(cwd, 'docs/**/*.md'),
    path.join(cwd, 'docslit.json'),
    path.join(cwd, 'components/**/*.js'),
  ], { ignoreInitial: true });

  watcher.on('all', async (event, filePath) => {
    const rel = path.relative(cwd, filePath);
    console.log(`  ${pc.cyan('~')} ${rel} changed — reloading`);
    if (filePath.endsWith('docslit.json')) {
      Object.assign(config, await loadConfig(cwd));
    }
    broadcast({ type: 'reload' });
  });

  // API: list pages
  app.get('/api/pages', async (req, res) => {
    const freshConfig = await loadConfig(cwd);
    res.json({ config: freshConfig });
  });

  // API: serve a single markdown page (versioned: /api/page/:version/:id)
  app.get('/api/page/:version/:id', async (req, res) => {
    const { version, id } = req.params;
    const vc = getVersionConfig(config);
    if (!vc) return res.status(400).json({ error: 'Versioning not enabled' });

    const entry = vc.list.find(v => v.version === version);
    if (!entry) return res.status(404).json({ error: `Version "${version}" not found` });

    // For the current branch version, serve from disk
    const docsDir = path.join(cwd, 'docs');
    const mdPath = path.resolve(docsDir, `${id}.md`);
    if (mdPath.startsWith(docsDir + path.sep) && await fs.pathExists(mdPath)) {
      const raw = await fs.readFile(mdPath, 'utf8');
      const { meta, html } = parseDoc(raw);
      return res.json({ id, meta, html });
    }

    // For other versions, try git show
    const raw = await gitReadFile(entry.branch, `docs/${id}.md`, cwd);
    if (raw) {
      const { meta, html } = parseDoc(raw);
      return res.json({ id, meta, html });
    }

    res.status(404).json({ error: `Page "${id}" not found in version ${version}` });
  });

  // API: serve a single markdown page (unversioned)
  app.get('/api/page/:id', async (req, res) => {
    const id = req.params.id;
    const docsDir = path.join(cwd, 'docs');
    const mdPath = path.resolve(docsDir, `${id}.md`);
    if (!mdPath.startsWith(docsDir + path.sep)) {
      return res.status(400).json({ error: 'Invalid page id' });
    }
    if (!await fs.pathExists(mdPath)) {
      return res.status(404).json({ error: `Page "${id}" not found` });
    }
    const raw = await fs.readFile(mdPath, 'utf8');
    const { meta, html } = parseDoc(raw);
    res.json({ id, meta, html });
  });

  // Serve raw markdown source for AI agents: GET /page.md or GET /docs/page.md
  app.get(/\.md$/, async (req, res) => {
    const slug = req.path.replace(/\.md$/, '').replace(/^\//, '').replace(/^docs\//, '');
    const docsDir = path.join(cwd, 'docs');
    const mdPath = path.resolve(docsDir, `${slug}.md`);
    if (!mdPath.startsWith(docsDir + path.sep)) {
      return res.status(400).send('Invalid path');
    }
    if (!await fs.pathExists(mdPath)) {
      return res.status(404).send('Not found');
    }
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(await fs.readFile(mdPath, 'utf8'));
  });

  // Serve local Lit vendor bundles (no CDN requests)
  app.use('/vendor', express.static(path.join(__dirname, 'vendor')));

  // Serve custom user components
  app.use('/components', express.static(path.join(cwd, 'components')));

  // Catch-all: serve the app shell
  app.get('/{*path}', async (req, res) => {
    const vc = getVersionConfig(config);
    let shellConfig = config;
    let currentVersion = null;

    if (vc) {
      currentVersion = vc.default;
      const pathMatch = req.path.match(/^\/([^/]+)\//);
      if (pathMatch) {
        const requestedVersion = pathMatch[1];
        const entry = vc.list.find(v => v.version === requestedVersion);
        if (entry) {
          currentVersion = entry.version;
          if (entry.version !== vc.default) {
            const versionSidebar = await getVersionSidebar(entry.branch, cwd);
            if (versionSidebar.length) shellConfig = { ...config, sidebar: versionSidebar };
          }
        }
      }
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderShell({ config: shellConfig, mode: 'dev', port, versionConfig: vc, currentVersion }));
  });

  server.listen(port, () => {
    console.log(`  ${pc.green('✓')} Ready at ${pc.cyan(`http://localhost:${port}`)}`);
    console.log(`  ${pc.dim('Watching docs/ for changes...')}\n`);
  });
}
