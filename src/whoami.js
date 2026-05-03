import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import pc from 'picocolors';

const CONFIG_PATH = path.join(os.homedir(), '.docslit', 'config.json');

export async function whoami() {
  if (!existsSync(CONFIG_PATH)) {
    console.error(pc.red('  Not logged in. Run: docslit login --email you@example.com --name "Your Name"'));
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    console.error(pc.red('  Config file is corrupted. Run: docslit login'));
    process.exit(1);
  }

  const { token, apiUrl } = config;
  const res = await fetch(`${apiUrl}/cloud/me`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json()).catch(() => null);

  if (!res?.user) {
    console.error(pc.red('  Session expired or invalid. Run: docslit login'));
    process.exit(1);
  }

  const { user } = res;
  console.log('');
  console.log(`  ${pc.bold('Name:')}   ${user.name}`);
  console.log(`  ${pc.bold('Email:')}  ${user.email}`);
  console.log(`  ${pc.bold('API:')}    ${apiUrl}`);
  console.log('');
}
