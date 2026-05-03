import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import pc from 'picocolors';
import { loadConfig, getAllPageIds } from './config.js';
import { parseDoc } from './markdown.js';
import { renderShell } from './template.js';

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

  // API: serve a single markdown page
  app.get('/api/page/:id', async (req, res) => {
    const id = req.params.id;
    const mdPath = path.join(cwd, 'docs', `${id}.md`);
    if (!await fs.pathExists(mdPath)) {
      return res.status(404).json({ error: `Page "${id}" not found` });
    }
    const raw = await fs.readFile(mdPath, 'utf8');
    const { meta, html } = parseDoc(raw);
    res.json({ id, meta, html });
  });

  // Serve custom user components
  app.use('/components', express.static(path.join(cwd, 'components')));

  // Catch-all: serve the app shell
  app.get('/{*path}', (req, res) => {
    const freshConfig = loadConfig(cwd);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderShell({ config, mode: 'dev', port }));
  });

  server.listen(port, () => {
    console.log(`  ${pc.green('✓')} Ready at ${pc.cyan(`http://localhost:${port}`)}`);
    console.log(`  ${pc.dim('Watching docs/ for changes...')}\n`);
  });
}
