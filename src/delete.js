import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import pc from 'picocolors';
import readline from 'node:readline';

const CONFIG_PATH = path.join(os.homedir(), '.docslit', 'config.json');

export async function deleteProject(args) {
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

  // Slug can come from positional arg or --project flag
  const slug = args.find(a => !a.startsWith('--')) || getFlag(args, '--project');

  if (!slug) {
    console.error(pc.red('  ✗ Please provide a project slug.'));
    console.error(pc.dim('  Usage: docslit delete <project-slug>'));
    console.error(pc.dim('         docslit delete --project <slug>'));
    process.exit(1);
  }

  // Skip confirmation with --yes / -y
  const skipConfirm = args.includes('--yes') || args.includes('-y');

  if (!skipConfirm) {
    const confirmed = await confirm(
      `  ${pc.yellow('!')} Delete project ${pc.bold(slug)} and all its files? ${pc.dim('(yes/N)')} `,
    );
    if (!confirmed) {
      console.log(pc.dim('  Cancelled.'));
      process.exit(0);
    }
  }

  let result;
  try {
    const res = await fetch(`${apiUrl}/cloud/projects/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    result = await res.json().catch(() => ({}));
    if (res.status === 404) {
      console.error(pc.red(`  ✗ Project "${slug}" not found (or you don't own it).`));
      process.exit(1);
    }
    if (!res.ok) {
      console.error(pc.red(`  ✗ Delete failed: ${result.error || res.statusText}`));
      process.exit(1);
    }
  } catch (e) {
    console.error(pc.red(`  ✗ Network error: ${e.message}`));
    process.exit(1);
  }

  console.log('');
  console.log(pc.green(`  ✓ Project ${pc.bold(slug)} deleted.`));
  console.log('');
}

function confirm(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

function getFlag(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}
