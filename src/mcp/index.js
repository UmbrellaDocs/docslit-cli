/**
 * `docslit mcp` entry: authoring mode (project dir) or reader mode (site URL).
 * stdout carries ONLY JSON-RPC; everything else goes to stderr.
 */
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { createMcpServer } from './server.js';
import { createAuthoringDefinition } from './authoring.js';
import { createReader } from './reader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PKG_VERSION = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8')).version;

export const MCP_HELP = `
  docslit mcp - Model Context Protocol server over stdio

  Usage:
    docslit mcp [--dir <path>]       AUTHORING mode: tools to write correct docs in a
                                     DocsLit project (default dir: current directory).
                                     Works without a project too (reference tools).
    docslit mcp <url>                READER mode: connect an agent to any published
                                     DocsLit site (llms.txt, <slug>.md, search index).
    docslit mcp --print-config [claude|cursor|vscode] [<url>]
                                     Print a ready-to-paste client config (stdout).

  Client config (e.g. Claude Desktop / Cursor mcpServers entry):
    { "mcpServers": { "docs": { "command": "npx", "args": ["-y", "docslit", "mcp", "https://docs.example.com"] } } }
`;

export function printConfig(client = 'claude', target = null) {
  const args = ['-y', 'docslit', 'mcp', ...(target ? [target] : [])];
  const name = target ? (() => { try { return new URL(target).hostname.split('.').slice(-2, -1)[0] || 'docs'; } catch { return 'docs'; } })() : 'docslit';
  const entry = { command: 'npx', args };
  switch (client) {
    case 'claude':
    case 'cursor':
      return { mcpServers: { [`${name}-docs`.replace(/^docslit-docs$/, 'docslit')]: entry } };
    case 'vscode':
      return { servers: { [`${name}-docs`.replace(/^docslit-docs$/, 'docslit')]: { type: 'stdio', ...entry } } };
    default:
      return null;
  }
}

/** Build the server for given CLI args (testable: no process side effects). */
export function buildServer(argv, { log = () => {}, cwd = process.cwd(), fetchImpl } = {}) {
  const url = argv.find((a) => /^https?:\/\//i.test(a));
  const di = argv.indexOf('--dir');
  if (url) {
    const reader = createReader(url, { ...(fetchImpl ? { fetchImpl } : {}) });
    return createMcpServer({
      name: 'docslit-docs-reader', title: `DocsLit docs (${reader.base.host})`, version: PKG_VERSION,
      instructions: reader.instructions, tools: reader.tools, log,
    });
  }
  const dir = path.resolve(cwd, di !== -1 && argv[di + 1] ? argv[di + 1] : '.');
  const def = createAuthoringDefinition({ dir, version: PKG_VERSION });
  return createMcpServer({
    name: 'docslit-author', title: 'DocsLit authoring', version: PKG_VERSION,
    instructions: def.instructions, tools: def.tools, resources: def.resources, prompts: def.prompts, log,
  });
}

export async function mcp(args = []) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stderr.write(MCP_HELP + '\n');
    process.exit(0);
  }
  const pi = args.indexOf('--print-config');
  if (pi !== -1) {
    const rest = args.filter((a, i) => i !== pi);
    const client = ['claude', 'cursor', 'vscode'].find((c) => rest.includes(c)) || 'claude';
    const target = rest.find((a) => /^https?:\/\//i.test(a)) || null;
    process.stdout.write(JSON.stringify(printConfig(client, target), null, 2) + '\n');
    return;
  }
  const di = args.indexOf('--dir');
  if (di !== -1 && !args[di + 1]) {
    process.stderr.write('  Error: --dir needs a path.\n');
    process.exit(1);
  }
  const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--dir');
  const bad = positional.find((a) => !/^https?:\/\//i.test(a));
  if (bad) {
    process.stderr.write(`  Error: unexpected argument "${bad}". Use --dir <path> for a project or pass an http(s) URL.\n`);
    process.exit(1);
  }
  // Keep stdout pure: route anything that console.log's into stderr.
  const out = process.stdout;
  const toErr = (...a) => console.error(...a);
  console.log = toErr; console.info = toErr; console.debug = toErr; console.warn = toErr;
  const log = (m) => process.stderr.write(`[docslit-mcp] ${m}\n`);
  let server;
  try {
    server = buildServer(args, { log });
  } catch (e) {
    process.stderr.write(`  Error: ${e.message}\n`);
    process.exit(1);
  }
  log(`ready (${positional[0] ? `reader: ${positional[0]}` : 'authoring'})`);
  await server.serve({ input: process.stdin, output: out, log });
}
