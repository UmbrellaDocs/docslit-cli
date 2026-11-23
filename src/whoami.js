import pc from 'picocolors';
import { requireAuth, bearer } from './cloud-auth.js';

export async function whoami() {
  const { token, apiUrl, source } = requireAuth();
  const res = await fetch(`${apiUrl}/cloud/me`, { headers: bearer(token) })
    .then(r => r.json()).catch(() => null);

  if (!res?.user) {
    console.error(pc.red('  Session expired or invalid. Run: docslit login'));
    process.exit(1);
  }

  const { user } = res;
  console.log('');
  console.log(`  ${pc.bold('Name:')}   ${user.name}`);
  console.log(`  ${pc.bold('Email:')}  ${user.email}`);
  console.log(`  ${pc.bold('API:')}    ${apiUrl}`);
  if (source === 'env') console.log(`  ${pc.bold('Auth:')}   ${pc.dim('DOCSLIT_TOKEN environment variable')}`);
  console.log('');
}
