import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import pc from 'picocolors';

const CONFIG_PATH = path.join(os.homedir(), '.docslit', 'config.json');

export async function projects() {
  if (!existsSync(CONFIG_PATH)) {
    console.error(pc.red('  ✗ Not logged in. Run: docslit login --email you@example.com --name "Your Name"'));
    process.exit(1);
  }

  let cliConfig;
  try {
    cliConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    console.error(pc.red('  ✗ Config file corrupted. Run: docslit login'));
    process.exit(1);
  }

  const { token, apiUrl } = cliConfig;

  let data;
  try {
    const res = await fetch(`${apiUrl}/cloud/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(pc.red(`  ✗ Failed to fetch projects: ${data.error || res.statusText}`));
      process.exit(1);
    }
  } catch (e) {
    console.error(pc.red(`  ✗ Network error: ${e.message}`));
    process.exit(1);
  }

  const list = data.projects ?? [];

  console.log('');

  if (list.length === 0) {
    console.log(pc.dim('  No projects yet. Run: docslit publish'));
    console.log('');
    return;
  }

  // Column widths
  const slugW = Math.max(7, ...list.map(p => p.slug.length));
  const nameW = Math.max(4, ...list.map(p => p.name.length));
  const statusW = 10;

  const header =
    pc.bold('  ' + 'Project'.padEnd(slugW + 2) +
    'Name'.padEnd(nameW + 2) +
    'Status'.padEnd(statusW + 2) +
    'Deployed'.padEnd(20) +
    'URL');

  const divider = '  ' + '─'.repeat(slugW + nameW + statusW + 50);

  console.log(header);
  console.log(pc.dim(divider));

  for (const p of list) {
    const statusColor =
      p.status === 'ready' ? pc.green(p.status.padEnd(statusW)) :
      p.status === 'failed' ? pc.red(p.status.padEnd(statusW)) :
      p.status === 'undeployed' ? pc.dim(p.status.padEnd(statusW)) :
      pc.yellow(p.status.padEnd(statusW));

    const deployedAt = p.deployedAt
      ? formatRelative(new Date(p.deployedAt))
      : pc.dim('—');

    const url = p.url ? pc.cyan(p.url) : pc.dim('—');

    console.log(
      '  ' +
      pc.bold(p.slug.padEnd(slugW + 2)) +
      p.name.padEnd(nameW + 2) +
      statusColor + '  ' +
      deployedAt.padEnd(20) + '  ' +
      url,
    );
  }

  console.log('');
  console.log(pc.dim(`  ${list.length} project${list.length === 1 ? '' : 's'}`));
  console.log('');
}

function formatRelative(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
