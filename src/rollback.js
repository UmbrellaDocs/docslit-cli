import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import pc from 'picocolors';
import readline from 'node:readline';

const CONFIG_PATH = path.join(os.homedir(), '.docslit', 'config.json');

export async function rollback(args) {
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

  // First positional arg = slug, second = deploy id
  const positional = args.filter(a => !a.startsWith('--'));
  const slug = positional[0] || getFlag(args, '--project');
  const deployId = positional[1] || getFlag(args, '--deploy');
  const skipConfirm = args.includes('--yes') || args.includes('-y');

  if (!slug) {
    console.error(pc.red('  ✗ Please provide a project slug.'));
    console.error(pc.dim('  Usage: docslit rollback <slug> [deploy-id]'));
    process.exit(1);
  }

  // If no deploy id given, list available deploys and prompt
  let targetDeployId = deployId;
  if (!targetDeployId) {
    targetDeployId = await pickDeploy(apiUrl, token, slug);
    if (!targetDeployId) process.exit(0);
  }

  if (!skipConfirm) {
    const confirmed = await confirm(
      `  ${pc.yellow('!')} Roll back ${pc.bold(slug)} to deploy ${pc.dim(targetDeployId.slice(0, 8))}…? ${pc.dim('(yes/N)')} `,
    );
    if (!confirmed) {
      console.log(pc.dim('  Cancelled.'));
      process.exit(0);
    }
  }

  console.log('');
  console.log(`  ${pc.dim('Rolling back')} ${pc.bold(slug)}${pc.dim('…')}`);

  let result;
  try {
    const res = await fetch(
      `${apiUrl}/cloud/projects/${encodeURIComponent(slug)}/rollback`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deployId: targetDeployId }),
      },
    );
    result = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(pc.red(`  ✗ Rollback failed: ${result.error || res.statusText}`));
      process.exit(1);
    }
  } catch (e) {
    console.error(pc.red(`  ✗ Network error: ${e.message}`));
    process.exit(1);
  }

  console.log('');
  console.log(pc.green(`  ✓ Rolled back successfully!`));
  console.log('');
  console.log(`  ${pc.bold('URL:')}    ${pc.cyan(result.url)}`);
  console.log(`  ${pc.bold('Deploy:')} ${result.activeDeployId}`);
  console.log('');
}

async function pickDeploy(apiUrl, token, slug) {
  let data;
  try {
    const res = await fetch(
      `${apiUrl}/cloud/projects/${encodeURIComponent(slug)}/deploys`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(pc.red(`  ✗ ${data.error || res.statusText}`));
      return null;
    }
  } catch (e) {
    console.error(pc.red(`  ✗ Network error: ${e.message}`));
    return null;
  }

  const deploys = data.deploys ?? [];
  if (deploys.length === 0) {
    console.log(pc.dim(`  No deploys found for "${slug}".`));
    return null;
  }

  console.log('');
  console.log(pc.bold(`  Deploys for ${slug}:`));
  console.log('');

  deploys.forEach((d, i) => {
    const statusColor =
      d.status === 'ready' ? pc.green(d.status) :
      d.status === 'failed' ? pc.red(d.status) :
      pc.yellow(d.status);

    const age = formatRelative(new Date(d.createdAt));
    const current = d.isCurrent ? pc.dim(' ← current') : '';
    const archived = d.hasArchive ? '' : pc.dim(' (no archive)');
    console.log(
      `  ${pc.dim(String(i + 1).padStart(2) + '.')} ${pc.bold(d.id.slice(0, 8))}…  ` +
      `${statusColor.padEnd(10)}  ${age.padEnd(14)}${current}${archived}`,
    );
  });

  console.log('');

  const rollbackable = deploys.filter(d => d.hasArchive && d.status === 'ready');
  if (rollbackable.length === 0) {
    console.log(pc.dim('  No archived deploys available to roll back to.'));
    return null;
  }

  const answer = await prompt(
    `  Enter deploy number or ID prefix (or press Enter to cancel): `,
  );

  if (!answer.trim()) return null;

  // Match by number or ID prefix
  const num = parseInt(answer, 10);
  if (!isNaN(num) && num >= 1 && num <= deploys.length) {
    const chosen = deploys[num - 1];
    if (!chosen.hasArchive) {
      console.error(pc.red('  ✗ That deploy has no archive and cannot be restored.'));
      return null;
    }
    return chosen.id;
  }

  const match = deploys.find(d => d.id.startsWith(answer.trim()));
  if (match) {
    if (!match.hasArchive) {
      console.error(pc.red('  ✗ That deploy has no archive and cannot be restored.'));
      return null;
    }
    return match.id;
  }

  console.error(pc.red('  ✗ No matching deploy found.'));
  return null;
}

function confirm(promptText) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

function prompt(text) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(text, answer => {
      rl.close();
      resolve(answer);
    });
  });
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

function getFlag(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}
