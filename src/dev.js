import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';
import pc from 'picocolors';
import { loadConfig, getAllPageIds, getVersionConfig, getOpenAPIConfig, gitReadFile, getVersionSidebar } from './config.js';
import { parseDoc } from './markdown.js';
import { renderShell } from './template.js';
import { loadSpec, getEndpoints, getApiMeta, resolveSpecRefs, buildApiPageMarkdown } from './openapi.js';
import { initHighlighter } from './highlighter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function dev({ port = 3000 } = {}) {
  const cwd = process.cwd();
  const [config] = await Promise.all([loadConfig(cwd), initHighlighter()]);

  console.log(`\n  ${pc.bold('DocsLit')} dev server starting...\n`);

  // Load OpenAPI spec if configured
  let specData = null;
  let apiMeta = null;
  async function reloadSpec() {
    const openapiConfig = getOpenAPIConfig(config);
    if (!openapiConfig?.spec) return;
    try {
      const spec = await loadSpec(
        path.resolve(cwd, openapiConfig.spec),
        openapiConfig.overlay ? path.resolve(cwd, openapiConfig.overlay) : null,
      );
      specData = getEndpoints(spec);
      apiMeta = getApiMeta(spec);
      console.log(`  ${pc.green('✓')} Loaded OpenAPI spec (${specData.length} endpoints)`);
    } catch (e) {
      console.log(`  ${pc.yellow('⚠')} Failed to load OpenAPI spec: ${e.message}`);
    }
  }
  await reloadSpec();

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
  const watchPaths = [
    path.join(cwd, 'docs/**/*.md'),
    path.join(cwd, 'docslit.json'),
    path.join(cwd, 'components/**/*.js'),
  ];
  const openapiConf = getOpenAPIConfig(config);
  if (openapiConf?.spec) watchPaths.push(path.join(cwd, openapiConf.spec));
  if (openapiConf?.overlay) watchPaths.push(path.join(cwd, openapiConf.overlay));

  const watcher = chokidar.watch(watchPaths, { ignoreInitial: true });

  watcher.on('all', async (event, filePath) => {
    const rel = path.relative(cwd, filePath);
    console.log(`  ${pc.cyan('~')} ${rel} changed — reloading`);
    if (filePath.endsWith('docslit.json')) {
      Object.assign(config, await loadConfig(cwd));
    }
    if (openapiConf?.spec && (filePath.endsWith(openapiConf.spec) || (openapiConf.overlay && filePath.endsWith(openapiConf.overlay)))) {
      await reloadSpec();
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
        let { meta, html } = parseDoc(raw);
        if (specData) html = resolveSpecRefs(html, specData);
        return res.json({ id, meta, html });
      }
      const raw = await gitReadFile(entry.branch, `docs/${id}.md`, cwd);
      if (raw) {
        let { meta, html } = parseDoc(raw);
        if (specData) html = resolveSpecRefs(html, specData);
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
    let { meta, html } = parseDoc(raw);
    if (specData) html = resolveSpecRefs(html, specData);
    res.json({ id, meta, html });
  });

  // Serve raw markdown source for AI agents: GET /page.md or GET /docs/page.md
  app.get(/\.md$/, async (req, res) => {
    let slug = req.path.replace(/\.md$/, '').replace(/^\//, '');
    const vc = config.versions;
    if (vc) {
      for (const v of vc.list) {
        if (slug.startsWith(v.version + '/')) { slug = slug.slice(v.version.length + 1); break; }
      }
    }
    slug = slug.replace(/^docs\//, '');
    const docsDir = path.join(cwd, 'docs');
    const mdPath = path.resolve(docsDir, `${slug}.md`);
    if (!mdPath.startsWith(docsDir + path.sep)) {
      return res.status(400).send('Invalid path');
    }
    if (!await fs.pathExists(mdPath)) {
      return res.status(404).send('Not found');
    }
    const mdRaw = await fs.readFile(mdPath, 'utf8');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    const isApiPage = slug.startsWith('api/') || /^---\n[\s\S]*?layout:\s*api[\s\S]*?\n---/.test(mdRaw);
    res.send(isApiPage && specData ? buildApiPageMarkdown(mdRaw, specData) : mdRaw);
  });

  // API: search index
  async function handleSearchIndex(req, res) {
    const freshConfig = await loadConfig(cwd);
    const pageIds = getAllPageIds(freshConfig);
    const docsDir = path.join(cwd, 'docs');
    const index = [];

    const groupMap = {};
    function mapPages(pages, groupName) {
      for (const item of (pages || [])) {
        if (typeof item === 'string') groupMap[item] = groupName;
        else if (item.id) groupMap[item.id] = groupName;
        else if (item.pages) mapPages(item.pages, groupName);
      }
    }
    for (const group of (freshConfig.sidebar || [])) {
      mapPages(group.pages, group.group || 'Pages');
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

  // Catch-all: serve the app shell (or raw Markdown via Accept header)
  app.get('/{*path}', async (req, res) => {
    const vc = getVersionConfig(config);

    // Content negotiation: serve raw Markdown when Accept: text/markdown
    if (req.accepts('text/markdown') && !req.accepts('text/html')) {
      let slug = req.path.replace(/^\//, '').replace(/\/$/, '') || 'index';
      if (vc) {
        for (const v of vc.list) {
          if (slug.startsWith(v.version + '/')) { slug = slug.slice(v.version.length + 1); break; }
        }
      }
      const docsDir = path.join(cwd, 'docs');
      const mdPath = path.resolve(docsDir, `${slug}.md`);
      if (mdPath.startsWith(docsDir + path.sep) && await fs.pathExists(mdPath)) {
        const mdRaw = await fs.readFile(mdPath, 'utf8');
        const isApi = slug.startsWith('api/') || /^---\n[\s\S]*?layout:\s*api[\s\S]*?\n---/.test(mdRaw);
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        return res.send(isApi && specData ? buildApiPageMarkdown(mdRaw, specData) : mdRaw);
      }
      return res.status(404).send('Not found');
    }

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
    res.send(renderShell({ config: shellConfig, mode: 'dev', port, versionConfig: vc, currentVersion, specData, apiMeta }));
  });

  server.listen(port, () => {
    console.log(`  ${pc.green('✓')} Ready at ${pc.cyan(`http://localhost:${port}`)}`);
    console.log(`  ${pc.dim('Watching docs/ for changes...')}\n`);
  });
}
