import { describeTheme } from './theme.js';
// Migration report: collects every item needing attention plus conversion stats,
// and renders them as MIGRATION.md, JSON and a terminal summary.
const SEV_ORDER = { error: 0, warning: 1, info: 2 };

export class Reporter {
  constructor() { this.items = []; this.seen = new Set(); this.components = new Map(); this.mapped = []; this.unmapped = []; }

  add(severity, code, message, { file = null, line = null, action = '', fix = '', component = null } = {}) {
    const key = [severity, code, file, line, message].join('\u0000');
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.items.push({ severity, code, file, line, component, message, action, fix });
  }

  count(source, target) {
    const k = `${source}\u0000${target}`;
    this.components.set(k, (this.components.get(k) || 0) + 1);
  }

  /** key mapped from the source config (for the "config keys mapped" summary) */
  mapKey(from, to) { this.mapped.push({ from, to }); }
  unmapKey(from, note) { this.unmapped.push({ from, note }); }

  sortedItems() {
    return this.items.slice().sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]
      || String(a.file ?? '').localeCompare(String(b.file ?? '')) || (a.line ?? 0) - (b.line ?? 0) || a.code.localeCompare(b.code) || a.message.localeCompare(b.message));
  }

  componentList() {
    return [...this.components].map(([k, count]) => { const [from, to] = k.split('\u0000'); return { from, to, count }; })
      .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
  }

  counts() {
    const c = { error: 0, warning: 0, info: 0 };
    for (const i of this.items) c[i.severity]++;
    return c;
  }
}

const SEV_TITLE = { error: 'Must fix (errors)', warning: 'Review (warnings)', info: 'For your information' };

export function renderMigrationMd(r) {
  const L = [];
  L.push('# DocsLit migration report', '');
  L.push(`Imported from **${r.source.formatLabel}** (\`${r.source.dir}\`) with \`docslit import\`. Generated deterministically; re-running the import regenerates this file.`, '');
  L.push('## Summary', '');
  L.push(`- Pages converted: **${r.summary.pages}**` + (r.summary.pagesFailed ? ` (${r.summary.pagesFailed} failed)` : ''));
  L.push(`- Reusable snippets: **${r.summary.snippets}**`);
  L.push(`- Assets copied: **${r.summary.assets}**`);
  L.push(`- Items needing attention: **${r.counts.error}** errors, **${r.counts.warning}** warnings, ${r.counts.info} notes`);
  if (r.validation) L.push(`- Validation of the result: **${r.validation.errors}** errors, **${r.validation.warnings}** warnings`);
  if (r.theme) L.push(`- Theme: ${describeTheme(r.theme)}`);
  L.push('');
  const bySev = { error: [], warning: [], info: [] };
  for (const i of r.items) bySev[i.severity].push(i);
  const GROUP_AT = 6; // this many items with one code are listed once, with every location
  for (const sev of ['error', 'warning', 'info']) {
    if (!bySev[sev].length) continue;
    L.push(`## ${SEV_TITLE[sev]}`, '');
    const byCode = new Map();
    for (const i of bySev[sev]) { if (!byCode.has(i.code)) byCode.set(i.code, []); byCode.get(i.code).push(i); }
    const done = new Set();
    for (const i of bySev[sev]) {
      const group = byCode.get(i.code);
      if (group.length >= GROUP_AT) {
        if (done.has(i.code)) continue;
        done.add(i.code);
        const files = new Set(group.map((g) => g.file).filter(Boolean));
        L.push(`- **${group.length} items** [\`${i.code}\`] in ${files.size} file${files.size === 1 ? '' : 's'}. First: ${i.message}`);
        if (i.action) L.push(`  - Done instead: ${i.action}`);
        if (i.fix) L.push(`  - How to fix: ${i.fix}`);
        L.push(`  - Where: ${group.map((g) => `\`${g.file || 'project'}${g.line ? ':' + g.line : ''}\``).join(', ')}`);
        continue;
      }
      const where = i.file ? `\`${i.file}${i.line ? ':' + i.line : ''}\`` : 'project';
      L.push(`- **${where}** [\`${i.code}\`]${i.component ? ` <${i.component}>` : ''} ${i.message}`);
      if (i.action) L.push(`  - Done instead: ${i.action}`);
      if (i.fix) L.push(`  - How to fix: ${i.fix}`);
    }
    L.push('');
  }
  if (!r.items.length) L.push('## Needs attention', '', 'Nothing: every page and component converted cleanly.', '');
  if (r.components.length) {
    L.push('## Components converted', '', '| Source | DocsLit | Count |', '|---|---|---|');
    for (const c of r.components) L.push(`| \`${c.from}\` | \`${c.to}\` | ${c.count} |`);
    L.push('');
  }
  if (r.config.mapped.length || r.config.unmapped.length) {
    L.push('## Config', '');
    if (r.config.mapped.length) { L.push('| Source key | docslit.json |', '|---|---|'); for (const m of r.config.mapped) L.push(`| \`${m.from}\` | \`${m.to}\` |`); L.push(''); }
    if (r.config.unmapped.length) { L.push('Not converted:', ''); for (const m of r.config.unmapped) L.push(`- \`${m.from}\`${m.note ? `: ${m.note}` : ''}`); L.push(''); }
  }
  if (r.validation?.issues?.length) {
    L.push('## Validation findings', '');
    for (const v of r.validation.issues) L.push(`- ${v.level} ${v.file || ''}${v.line ? ':' + v.line : ''} ${v.message}`);
    L.push('');
  }
  L.push('## Next steps', '', '1. `docslit validate` and `docslit dev` in the output folder.', '2. Work through the errors and warnings above, top to bottom.', '3. Delete this file when you are done.', '');
  return L.join('\n');
}
