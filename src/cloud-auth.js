// Shared auth/config helpers for the DocsLit Cloud commands (login, logout, publish, whoami, projects,
// rollback, delete). Token sources, in order: DOCSLIT_TOKEN env var (CI / non-interactive), then the
// stored ~/.docslit/config.json written by `docslit login`.
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import pc from 'picocolors';

export const CONFIG_DIR = path.join(os.homedir(), '.docslit');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
export const DEFAULT_API_URL = 'https://docslit.com/api';
export const NOT_LOGGED_IN = 'Not logged in. Run: docslit login   (in CI, set the DOCSLIT_TOKEN environment variable)';

/** Validate an API base URL. https is required, except for localhost development. Returns the URL without a trailing slash. */
export function normalizeApiUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('API URL must be a valid http(s) URL.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    throw new Error('API URL must use https (plain http is only allowed for localhost), otherwise your password/token would be sent unencrypted.');
  }
  return raw.replace(/\/+$/, '');
}

/**
 * Pure resolution of credentials. `stored` is the parsed config file (or null).
 * Returns { token, apiUrl, source: 'env' | 'config', tokenId? } or null when not logged in.
 */
export function resolveAuth({ env = process.env, stored = null } = {}) {
  const envToken = (env.DOCSLIT_TOKEN || '').trim();
  const apiUrl = (env.DOCSLIT_API_URL || '').trim() || stored?.apiUrl || DEFAULT_API_URL;
  if (envToken) return { token: envToken, apiUrl, source: 'env' };
  if (stored?.token) return { token: stored.token, apiUrl, source: 'config', tokenId: stored.tokenId };
  return null;
}

export function readStoredConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return undefined; // corrupted
  }
}

/** Load credentials or exit(1) with a helpful message. */
export function requireAuth() {
  const stored = readStoredConfig();
  const auth = resolveAuth({ stored: stored ?? null });
  if (!auth) {
    if (stored === undefined) console.error(pc.red('  ✗ Config file corrupted. Run: docslit login'));
    else console.error(pc.red(`  ✗ ${NOT_LOGGED_IN}`));
    process.exit(1);
  }
  try {
    auth.apiUrl = normalizeApiUrl(auth.apiUrl);
  } catch (e) {
    console.error(pc.red(`  ✗ ${e.message}`));
    process.exit(1);
  }
  return auth;
}

export function saveConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
  try { chmodSync(CONFIG_PATH, 0o600); } catch { /* best effort (e.g. Windows) */ }
}

export function deleteConfig() {
  rmSync(CONFIG_PATH, { force: true });
}

export function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

/** Extra hint to print after an HTTP error response. */
export function authHint(status) {
  if (status === 401) return 'Your token is invalid or was revoked. Run: docslit login';
  if (status === 403) return null;
  return null;
}

export function promptLine(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Read a line from a TTY without echoing it. Rejects when stdin is not a TTY. */
export function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(new Error('Cannot prompt for a password: stdin is not a terminal. Use --token <token> or the DOCSLIT_TOKEN environment variable.'));
      return;
    }
    process.stdout.write(question);
    let value = '';
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const done = (err) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      process.stdout.write('\n');
      err ? reject(err) : resolve(value);
    };
    const onData = chunk => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') return done();
        if (ch === '\u0003') return done(new Error('Cancelled.'));
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

export function getFlag(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}
