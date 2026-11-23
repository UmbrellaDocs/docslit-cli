import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const cli = fileURLToPath(new URL('../bin/docslit.js', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));

async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Dev server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (err) {
      if (err.cause?.code !== 'ECONNREFUSED') throw err;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Dev server did not start');
}

async function changeAndWaitForReload(socket, file, content) {
  let interval;
  let timeout;
  let listener;
  try {
    const reload = new Promise((resolve, reject) => {
      listener = data => {
        if (JSON.parse(data.toString()).type === 'reload') resolve();
      };
      socket.on('message', listener);
      timeout = setTimeout(() => reject(new Error(`No reload for ${file}`)), 8000);
      const write = () => writeFile(file, content).catch(reject);
      write();
      interval = setInterval(write, 300);
    });
    await reload;
  } finally {
    clearInterval(interval);
    clearTimeout(timeout);
    socket.off('message', listener);
  }
}

describe('dev server file watching', () => {
  it('reloads for nested reusable content and component changes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'docslit-watch-'));
    let child;
    let socket;
    try {
      await mkdir(path.join(dir, 'docs', '_reusables'), { recursive: true });
      await mkdir(path.join(dir, 'components', 'nested'), { recursive: true });
      await writeFile(path.join(dir, 'docslit.json'), JSON.stringify({
        name: 'Test',
        sidebar: [{ group: 'Guide', pages: ['intro'] }],
      }));
      await writeFile(path.join(dir, 'docs', 'intro.md'), '# Intro\n\n<wc-include src="part.md" />');
      const reusable = path.join(dir, 'docs', '_reusables', 'part.md');
      const component = path.join(dir, 'components', 'nested', 'example.js');
      await writeFile(reusable, 'Original content');
      await writeFile(component, 'export const value = 1;');

      const port = await availablePort();
      child = spawn(process.execPath, [cli, 'dev', '--port', String(port)], {
        cwd: dir,
        stdio: 'ignore',
      });
      const url = `http://127.0.0.1:${port}`;
      await waitForServer(`${url}/api/pages`, child);
      socket = new WebSocket(`ws://127.0.0.1:${port}`);
      await once(socket, 'open');

      const page = async () => (await (await fetch(`${url}/api/page/intro`)).json()).html;
      expect(await page()).toContain('Original content');
      await changeAndWaitForReload(socket, reusable, 'Updated content');
      expect(await page()).toContain('Updated content');
      await changeAndWaitForReload(socket, component, 'export const value = 2;');
    } finally {
      socket?.terminate();
      if (child && child.exitCode === null) {
        child.kill();
        await once(child, 'close');
      }
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  it('reloads the component preview for markdown and component changes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'docslit-preview-'));
    let child;
    let socket;
    try {
      await mkdir(path.join(dir, 'scripts'));
      await mkdir(path.join(dir, 'preview'));
      await cp(path.join(root, 'src'), path.join(dir, 'src'), { recursive: true });
      await symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
      await writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
      const port = await availablePort();
      const previewScript = await readFile(path.join(root, 'scripts', 'preview.js'), 'utf8');
      await writeFile(path.join(dir, 'scripts', 'preview.js'),
        previewScript.replace('const PORT = 4000;', `const PORT = ${port};`));
      const pageFile = path.join(dir, 'preview', 'callouts.md');
      await writeFile(pageFile, '# Original');

      child = spawn(process.execPath, [path.join(dir, 'scripts', 'preview.js')], {
        cwd: dir,
        stdio: 'ignore',
      });
      const url = `http://127.0.0.1:${port}`;
      await waitForServer(`${url}/api/pages`, child);
      socket = new WebSocket(`ws://127.0.0.1:${port}`);
      await once(socket, 'open');

      await changeAndWaitForReload(socket, pageFile, '# Updated');
      const page = await (await fetch(`${url}/api/page/callouts`)).json();
      expect(page.html).toContain('Updated');
      const component = path.join(dir, 'src', 'components', 'code.js');
      const source = await readFile(component, 'utf8');
      await changeAndWaitForReload(socket, component, `${source}\n`);
    } finally {
      socket?.terminate();
      if (child && child.exitCode === null) {
        child.kill();
        await once(child, 'close');
      }
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});
