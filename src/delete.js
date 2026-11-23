import pc from 'picocolors';
import readline from 'node:readline';
import { requireAuth, bearer, authHint, getFlag } from './cloud-auth.js';

export async function deleteProject(args) {
  const { token, apiUrl } = requireAuth();

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
      headers: bearer(token),
    });
    result = await res.json().catch(() => ({}));
    if (res.status === 404) {
      console.error(pc.red(`  ✗ Project "${slug}" not found (or you don't own it).`));
      process.exit(1);
    }
    if (!res.ok) {
      console.error(pc.red(`  ✗ Delete failed: ${result.error || res.statusText}`));
      const hint = authHint(res.status);
      if (hint) console.error(pc.dim(`  ${hint}`));
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

