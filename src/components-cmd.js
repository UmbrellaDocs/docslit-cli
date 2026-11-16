/**
 * docslit components [tag] [--json] — list built-in wc-* components or show one.
 */
import pc from 'picocolors';
import { getComponentManifest, getComponent, getCategoryLabels } from './component-manifest.js';

function printDetail(c) {
  const labels = getCategoryLabels();
  console.log('');
  console.log(`  ${pc.bold(pc.cyan(`<${c.tag}>`))}  ${pc.dim(labels[c.category] || c.category)}`);
  console.log(`  ${c.description}`);
  console.log('');
  console.log(`  ${pc.bold('Content:')} ${c.content}${c.contentDescription ? pc.dim(` — ${c.contentDescription}`) : ''}`);
  if (c.parents?.length) console.log(`  ${pc.bold('Parents:')} ${c.parents.join(', ')}`);
  if (c.children?.length) console.log(`  ${pc.bold('Children:')} ${c.children.join(', ')}`);
  console.log('');
  if (c.attributes.length) {
    console.log(`  ${pc.bold('Attributes')}`);
    for (const a of c.attributes) {
      const flags = [a.type, a.required ? pc.red('required') : null, a.default != null ? `default: ${a.default}` : null]
        .filter(Boolean).join(', ');
      console.log(`    ${pc.green(a.name)} ${pc.dim(`(${flags})`)}`);
      console.log(`      ${a.description}${a.values ? pc.dim(` [${a.values.join(' | ')}]`) : ''}`);
    }
  } else {
    console.log(`  ${pc.dim('No attributes.')}`);
  }
  console.log('');
  console.log(`  ${pc.bold('Example')}`);
  for (const line of c.example.split('\n')) console.log(`    ${line}`);
  console.log('');
}

function printList(manifest) {
  const labels = getCategoryLabels();
  const byCat = new Map();
  for (const c of manifest) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category).push(c);
  }
  console.log(`\n  ${pc.bold('DocsLit components')} ${pc.dim(`(${manifest.length})`)}\n`);
  for (const [cat, items] of byCat) {
    console.log(`  ${pc.bold(labels[cat] || cat)}`);
    const width = Math.max(...items.map((c) => c.tag.length));
    for (const c of items) {
      const summary = c.description.split(/(?<=\.)\s/)[0];
      console.log(`    ${pc.cyan(c.tag.padEnd(width))}  ${pc.dim(summary)}`);
    }
    console.log('');
  }
  console.log(`  Run ${pc.cyan('docslit components <tag>')} for attributes and an example, or ${pc.cyan('--json')} for machine-readable output.\n`);
}

export async function components(args = []) {
  const json = args.includes('--json');
  const tag = args.find((a) => !a.startsWith('--'));

  if (tag) {
    const c = getComponent(tag);
    if (!c) {
      if (json) process.stdout.write(JSON.stringify({ error: `Unknown component: ${tag}` }, null, 2) + '\n');
      else console.error(`  ${pc.red('✗')} Unknown component: ${tag}\n  Run ${pc.cyan('docslit components')} to list them.\n`);
      process.exit(1);
    }
    if (json) process.stdout.write(JSON.stringify(c, null, 2) + '\n');
    else printDetail(c);
    return;
  }

  const manifest = getComponentManifest();
  if (json) process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
  else printList(manifest);
}
