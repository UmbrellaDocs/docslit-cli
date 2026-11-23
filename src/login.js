import os from 'node:os';
import pc from 'picocolors';
import {
  CONFIG_PATH, DEFAULT_API_URL, normalizeApiUrl, readStoredConfig, resolveAuth, saveConfig, deleteConfig,
  bearer, promptLine, promptHidden, getFlag,
} from './cloud-auth.js';

export async function login(args) {
  const emailFlag = getFlag(args, '--email');
  const existingToken = getFlag(args, '--token');
  const label = getFlag(args, '--label') || `CLI on ${os.hostname()}`;

  let apiUrl;
  try {
    apiUrl = normalizeApiUrl(getFlag(args, '--api-url') || process.env.DOCSLIT_API_URL || DEFAULT_API_URL);
  } catch (e) {
    console.error(pc.red(`  Error: ${e.message}`));
    process.exit(1);
  }

  if (args.includes('--name')) {
    console.error(pc.yellow('  Note: --name is no longer used. Accounts are created at the DocsLit website, not from the CLI.'));
  }

  let token, tokenId, user;

  if (existingToken) {
    // Store a token created in the dashboard (Dashboard → API Tokens).
    token = existingToken.trim();
    const res = await fetchJson(`${apiUrl}/cloud/me`, { token });
    if (!res.ok) {
      console.error(pc.red(`  Error: token verification failed — ${res.error}`));
      process.exit(1);
    }
    user = res.user;
  } else {
    if (!process.stdin.isTTY) {
      console.error(pc.red('  Error: interactive login needs a terminal.'));
      console.error('  In scripts/CI, create a token in the dashboard and either:');
      console.error('    export DOCSLIT_TOKEN=<token>            (no login step needed)');
      console.error('    docslit login --token <token>');
      process.exit(1);
    }
    const email = (emailFlag || await promptLine('  Email: ')).trim();
    if (!email) {
      console.error(pc.red('  Error: email is required.'));
      process.exit(1);
    }
    let password;
    try {
      password = await promptHidden('  Password: ');
    } catch (e) {
      console.error(pc.red(`  Error: ${e.message}`));
      process.exit(1);
    }
    if (!password) {
      console.error(pc.red('  Error: password is required.'));
      process.exit(1);
    }
    const res = await fetchJson(`${apiUrl}/cloud/tokens`, { method: 'POST', body: { email, password, label } });
    if (!res.ok) {
      console.error(pc.red(`  Error: ${res.error}`));
      process.exit(1);
    }
    token = res.token;
    tokenId = res.tokenId;
    user = res.user;
  }

  saveConfig({ token, tokenId, apiUrl, user });

  console.log('');
  console.log(pc.green(`  ✓ Logged in as ${pc.bold(user.name)} (${user.email})`));
  console.log(pc.dim(`  Config saved to ${CONFIG_PATH}`));
  console.log('');
}

export async function logout() {
  const stored = readStoredConfig();
  const auth = resolveAuth({ env: {}, stored: stored ?? null });
  if (!auth) {
    console.log(pc.dim('  Not logged in.'));
    return;
  }
  // Best effort: revoke the token server-side too, so a copied config file stops working.
  if (auth.tokenId) {
    try {
      const base = normalizeApiUrl(auth.apiUrl);
      const res = await fetchJson(`${base}/cloud/tokens/${encodeURIComponent(auth.tokenId)}`, { method: 'DELETE', token: auth.token });
      if (!res.ok && res.status !== 401 && res.status !== 404) {
        console.error(pc.yellow(`  Warning: could not revoke the token on the server (${res.error}). Revoke it in the dashboard.`));
      }
    } catch { /* ignore */ }
  }
  deleteConfig();
  console.log(pc.green('  ✓ Logged out.'));
  if (process.env.DOCSLIT_TOKEN) console.log(pc.dim('  Note: DOCSLIT_TOKEN is still set in this environment.'));
}

async function fetchJson(url, { method = 'GET', body = null, token = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) Object.assign(headers, bearer(token));
  try {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    return { ...data, ok: res.ok, status: res.status, error: data.error || (res.ok ? undefined : res.statusText) };
  } catch (e) {
    return { ok: false, error: `Network error: ${e.message}` };
  }
}
