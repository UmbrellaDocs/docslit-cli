import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import pc from 'picocolors';

const CONFIG_DIR = path.join(os.homedir(), '.docslit');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_API_URL = 'https://docslit.com/api';

export async function login(args) {
  const email = getFlag(args, '--email');
  const name = getFlag(args, '--name');
  const existingToken = getFlag(args, '--token');
  const rawApiUrl = getFlag(args, '--api-url') || DEFAULT_API_URL;
  let apiUrl;
  try {
    const parsed = new URL(rawApiUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error();
    apiUrl = rawApiUrl;
  } catch {
    console.error(pc.red('  Error: --api-url must be a valid http or https URL.'));
    process.exit(1);
  }

  if (!email && !existingToken) {
    console.error(pc.red('  Error: provide --email and --name to create an account, or --token to save an existing token.\n'));
    console.error('  Examples:');
    console.error('    docslit login --email you@example.com --name "Your Name"');
    console.error('    docslit login --token <your-api-token>');
    process.exit(1);
  }

  let token, user;

  if (existingToken) {
    // Verify the existing token
    token = existingToken;
    const res = await fetchJson(`${apiUrl}/cloud/me`, { token });
    if (!res.ok) {
      console.error(pc.red(`  Error: token verification failed — ${res.error}`));
      process.exit(1);
    }
    user = res.user;
  } else {
    // Create account + token
    if (!name) {
      console.error(pc.red('  Error: --name is required when creating an account.\n'));
      process.exit(1);
    }
    console.log(pc.dim(`  Creating account for ${email}…`));
    const res = await fetchJson(`${apiUrl}/cloud/tokens`, {
      method: 'POST',
      body: { email, name },
    });
    if (!res.ok) {
      console.error(pc.red(`  Error: ${res.error}`));
      process.exit(1);
    }
    token = res.token;
    user = res.user;
  }

  // Save to ~/.docslit/config.json (mode 0o600 — owner read/write only)
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify({ token, apiUrl, user }, null, 2), { mode: 0o600 });

  console.log('');
  console.log(pc.green(`  ✓ Logged in as ${pc.bold(user.name)} (${user.email})`));
  console.log(pc.dim(`  Config saved to ${CONFIG_PATH}`));
  console.log('');
}

async function fetchJson(url, { method = 'GET', body = null, token = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, ...data };
  } catch (e) {
    return { ok: false, error: `Network error: ${e.message}` };
  }
}

function getFlag(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}
