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

  // API: serve a single markdown page (versioned and unversioned)
  // Uses {*path} wildcard to support nested page IDs like commands/check
  app.get('/api/page/{*path}', async (req, res) => {
    const segments = Array.isArray(req.params.path) ? req.params.path.join('/') : req.params.path;
    const vc = getVersionConfig(config);

    let id, version;
    if (vc) {
      const parts = segments.split('/');
      const maybeVersion = parts[0];
      const entry = vc.list.find(v => v.version === maybeVersion);
      if (entry) {
        version = maybeVersion;
        id = parts.slice(1).join('/');
      } else {
        id = segments;
      }
    } else {
      id = segments;
    }

    if (!id) return res.status(400).json({ error: 'Missing page id' });

    if (version) {
      const entry = vc.list.find(v => v.version === version);
      const docsDir = path.join(cwd, 'docs');
      const mdPath = path.resolve(docsDir, `${id}.md`);
      if (mdPath.startsWith(docsDir + path.sep) && await fs.pathExists(mdPath)) {
        const raw = await fs.readFile(mdPath, 'utf8');
        const { meta, html } = parseDoc(raw);
        return res.json({ id, meta, html });
      }
      const raw = await gitReadFile(entry.branch, `docs/${id}.md`, cwd);
      if (raw) {
        const { meta, html } = parseDoc(raw);
        return res.json({ id, meta, html });
      }
      return res.status(404).json({ error: `Page "${id}" not found in version ${version}` });
    }

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

  // API: search index
  async function handleSearchIndex(req, res) {
    const freshConfig = await loadConfig(cwd);
    const pageIds = getAllPageIds(freshConfig);
    const docsDir = path.join(cwd, 'docs');
    const index = [];

    const groupMap = {};
    for (const group of (freshConfig.sidebar || [])) {
      for (const id of (group.pages || [])) groupMap[id] = group.group || 'Pages';
    }

    for (const id of pageIds) {
      const mdPath = path.resolve(docsDir, `${id}.md`);
      if (!mdPath.startsWith(docsDir + path.sep)) continue;
      if (!await fs.pathExists(mdPath)) continue;
      const raw = await fs.readFile(mdPath, 'utf8');
      const { meta } = parseDoc(raw);
      if (meta.draft === true) continue;
      const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
      const body = bodyMatch ? bodyMatch[1].trim() : raw.trim();
      index.push({
        id,
        title: meta.title || id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        group: groupMap[id] || 'Pages',
        desc: meta.description || meta.desc || '',
        body,
      });
    }

    res.json(index);
  }
  app.get('/api/search-index', handleSearchIndex);
  app.get('/api/search-index/:version', handleSearchIndex);

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
