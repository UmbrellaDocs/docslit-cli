/**
 * docslit agents init [dir] [--tool claude,cursor,copilot,windsurf,codex,gemini|all] [--force] [--json]
 * docslit agents print [author|migrate|agents-md]
 *
 * Writes instruction files so any AI coding tool knows how to write DocsLit
 * docs in this project. AGENTS.md (the cross-tool standard) is always written;
 * tool-specific files are added for detected tools, or all with `--tool all`.
 */
import fs from 'fs-extra';
import path from 'path';
import pc from 'picocolors';
import { generateAuthorSkill, readMigrateSkill, generateAgentsBlock, splitSkill } from './skill-gen.js';

export const AGENT_TOOLS = ['claude', 'cursor', 'copilot', 'windsurf', 'codex', 'gemini'];
export const BLOCK_START = '<!-- docslit:start -->';
export const BLOCK_END = '<!-- docslit:end -->';
export const GENERATED_MARK = '<!-- docslit:generated -->';
const MCP_ENTRY = { command: 'npx', args: ['-y', 'docslit', 'mcp'] };

// ─── Project inspection ────────────────────────────────────────────────────────

/** Read docslit.json (raw, unexpanded) and summarize what instructions need to know. */
export async function inspectProject(dir) {
  const configPath = path.join(dir, 'docslit.json');
  if (!await fs.pathExists(configPath)) return null;
  let config;
  try { config = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch { config = {}; }

  const project = { name: config.name, docsDir: 'docs', sidebarMode: 'explicit', groups: [] };
  const sb = config.sidebar;
  if (sb === 'auto') project.sidebarMode = 'auto';
  else if (Array.isArray(sb)) {
    const hasAuto = (items) => items.some((it) => it && typeof it === 'object' &&
      (it.autogenerate !== undefined || (Array.isArray(it.pages) && hasAuto(it.pages))));
    if (hasAuto(sb)) project.sidebarMode = 'mixed';
    project.groups = sb.filter((g) => g && typeof g === 'object' && typeof g.group === 'string' && g.autogenerate === undefined)
      .map((g) => g.group);
  }
  const versions = config.versions?.list;
  if (Array.isArray(versions) && versions.length) project.versions = versions.map((v) => v.version).filter(Boolean);
  const locales = config.i18n?.locales;
  if (Array.isArray(locales) && locales.length > 1) {
    project.locales = locales;
    project.defaultLocale = config.i18n.defaultLocale || 'en';
  }
  if (config.openapi) project.openapi = true;
  return project;
}

async function detectTools(dir) {
  const found = [];
  const has = (p) => fs.pathExists(path.join(dir, p));
  if (await has('.claude') || await has('CLAUDE.md')) found.push('claude');
  if (await has('.cursor')) found.push('cursor');
  if (await has('.github')) found.push('copilot');
  if (await has('.windsurf')) found.push('windsurf');
  if (await has('GEMINI.md') || await has('.gemini')) found.push('gemini');
  return found;
}

// ─── File builders ─────────────────────────────────────────────────────────────

function markedBlock(content) {
  return `${BLOCK_START}\n${content.trimEnd()}\n${BLOCK_END}`;
}

function skillMd(name, text) {
  const { meta, body } = splitSkill(text);
  return `---\nname: ${meta.name || name}\ndescription: ${meta.description || ''}\n---\n${GENERATED_MARK}\n\n${body.trimEnd()}\n`;
}

function cursorRule(project) {
  return `---\ndescription: Writing and editing DocsLit documentation pages (Markdown plus wc-* components) in docs/ and docslit.json\nglobs: ${project.docsDir}/**/*.md,docslit.json\nalwaysApply: false\n---\n${GENERATED_MARK}\n\n${generateAgentsBlock({ ...project, skillInstalled: false }).trimEnd()}\n`;
}

function copilotInstructions(project) {
  return `---\napplyTo: "${project.docsDir}/**/*.md"\n---\n${GENERATED_MARK}\n\n${generateAgentsBlock({ ...project, skillInstalled: false }).trimEnd()}\n`;
}

function windsurfRule(project) {
  return `${GENERATED_MARK}\n\n${generateAgentsBlock({ ...project, skillInstalled: false }).trimEnd()}\n`;
}

// ─── Writers ───────────────────────────────────────────────────────────────────

function createReport() {
  return { written: [], updated: [], unchanged: [], skipped: [] };
}

async function writeBlockFile(dir, rel, content, report, { createWith = (block) => `${block}\n` } = {}) {
  const abs = path.join(dir, rel);
  const block = markedBlock(content);
  if (!await fs.pathExists(abs)) {
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(abs, createWith(block));
    report.written.push(rel);
    return;
  }
  const cur = await fs.readFile(abs, 'utf8');
  const start = cur.indexOf(BLOCK_START);
  const end = cur.indexOf(BLOCK_END);
  let next;
  if (start !== -1 && end > start) {
    next = cur.slice(0, start) + block + cur.slice(end + BLOCK_END.length);
  } else {
    next = `${cur.replace(/\s*$/, '')}\n\n${block}\n`;
  }
  if (next === cur) { report.unchanged.push(rel); return; }
  await fs.writeFile(abs, next);
  report.updated.push(rel);
}

async function writeGeneratedFile(dir, rel, content, report, force) {
  const abs = path.join(dir, rel);
  if (!await fs.pathExists(abs)) {
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(abs, content);
    report.written.push(rel);
    return;
  }
  const cur = await fs.readFile(abs, 'utf8');
  if (cur === content) { report.unchanged.push(rel); return; }
  if (!cur.includes(GENERATED_MARK) && !force) {
    report.skipped.push({ file: rel, reason: 'exists and was not generated by docslit (use --force to overwrite)' });
    return;
  }
  await fs.writeFile(abs, content);
  report.updated.push(rel);
}

/** Merge a docslit MCP server into a JSON config without touching other servers. */
async function mergeMcpJson(dir, rel, { key, entry }, report, force) {
  const abs = path.join(dir, rel);
  let data = {};
  let existed = false;
  if (await fs.pathExists(abs)) {
    existed = true;
    try {
      data = JSON.parse(await fs.readFile(abs, 'utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not an object');
    } catch {
      if (!force) { report.skipped.push({ file: rel, reason: 'existing file is not valid JSON (fix it or use --force to replace)' }); return; }
      data = {};
    }
  }
  if (data[key] !== undefined && (typeof data[key] !== 'object' || Array.isArray(data[key]) || data[key] === null)) {
    report.skipped.push({ file: rel, reason: `"${key}" is not an object` });
    return;
  }
  const servers = data[key] || {};
  const before = servers.docslit;
  if (before && JSON.stringify(before) !== JSON.stringify(entry) && !force) {
    report.skipped.push({ file: rel, reason: 'a customised "docslit" server entry already exists (use --force to replace it)' });
    return;
  }
  if (before && JSON.stringify(before) === JSON.stringify(entry)) { report.unchanged.push(rel); return; }
  data[key] = { ...servers, docslit: entry };
  await fs.ensureDir(path.dirname(abs));
  await fs.writeFile(abs, JSON.stringify(data, null, 2) + '\n');
  (existed ? report.updated : report.written).push(rel);
}

// ─── Programmatic API ──────────────────────────────────────────────────────────

/**
 * @param {string} dir project root
 * @param {{ tools?: string[]|'all'|null, force?: boolean }} [opts]  tools null => detect
 * @returns {Promise<{ ok: boolean, error?: string, tools: string[], detected: string[], written: string[], updated: string[], unchanged: string[], skipped: Array<{file:string, reason:string}>, notes: string[] }>}
 */
export async function runAgentsInit(dir, { tools = null, force = false } = {}) {
  dir = path.resolve(dir || '.');
  const project = await inspectProject(dir);
  if (!project) {
    return { ok: false, error: `No docslit.json in ${dir}. Run \`docslit init\` first, or cd into your docs project.`, tools: [], detected: [], written: [], updated: [], unchanged: [], skipped: [], notes: [] };
  }
  const detected = await detectTools(dir);
  let selected;
  if (tools === 'all') selected = [...AGENT_TOOLS];
  else if (Array.isArray(tools) && tools.length) selected = tools;
  else selected = detected;
  const unknown = selected.filter((t) => !AGENT_TOOLS.includes(t));
  if (unknown.length) {
    return { ok: false, error: `Unknown tool: ${unknown.join(', ')}. Choose from ${AGENT_TOOLS.join(', ')}, or "all".`, tools: [], detected, written: [], updated: [], unchanged: [], skipped: [], notes: [] };
  }
  selected = AGENT_TOOLS.filter((t) => selected.includes(t));

  const report = createReport();
  const notes = [];
  const claude = selected.includes('claude');
  await writeBlockFile(dir, 'AGENTS.md', generateAgentsBlock({ ...project, skillInstalled: claude }), report);

  if (claude) {
    await writeGeneratedFile(dir, '.claude/skills/docslit-author/SKILL.md', skillMd('docslit-author', generateAuthorSkill()), report, force);
    await writeGeneratedFile(dir, '.claude/skills/docslit-migrate/SKILL.md', skillMd('docslit-migrate', readMigrateSkill()), report, force);
    const claudeMd = path.join(dir, 'CLAUDE.md');
    if (!await fs.pathExists(claudeMd)) {
      await fs.writeFile(claudeMd, '@AGENTS.md\n');
      report.written.push('CLAUDE.md');
    } else {
      await writeBlockFile(dir, 'CLAUDE.md', 'DocsLit docs instructions live in @AGENTS.md', report);
    }
    await mergeMcpJson(dir, '.mcp.json', { key: 'mcpServers', entry: MCP_ENTRY }, report, force);
  }
  if (selected.includes('cursor')) {
    await writeGeneratedFile(dir, '.cursor/rules/docslit.mdc', cursorRule(project), report, force);
    await mergeMcpJson(dir, '.cursor/mcp.json', { key: 'mcpServers', entry: MCP_ENTRY }, report, force);
  }
  if (selected.includes('copilot')) {
    await writeGeneratedFile(dir, '.github/instructions/docslit.instructions.md', copilotInstructions(project), report, force);
    await mergeMcpJson(dir, '.vscode/mcp.json', { key: 'servers', entry: { type: 'stdio', ...MCP_ENTRY } }, report, force);
  }
  if (selected.includes('windsurf')) {
    await writeGeneratedFile(dir, '.windsurf/rules/docslit.md', windsurfRule(project), report, force);
  }
  if (selected.includes('gemini')) {
    await writeBlockFile(dir, 'GEMINI.md', 'DocsLit docs instructions: @./AGENTS.md', report);
  }
  if (selected.includes('codex')) notes.push('Codex reads AGENTS.md directly; no extra files needed.');
  if (selected.includes('gemini')) notes.push('GEMINI.md imports AGENTS.md with Gemini CLI\'s `@file` syntax.');
  if (selected.includes('windsurf') || selected.includes('copilot') || selected.includes('cursor')) {
    notes.push('MCP is configured where the tool supports a project-level file (Claude Code, Cursor, VS Code Copilot); Windsurf, Codex and Gemini MCP settings are user-level, add `npx -y docslit mcp` there yourself.');
  }

  return { ok: true, tools: selected, detected, ...report, notes };
}

// ─── CLI ───────────────────────────────────────────────────────────────────────

function flagValue(args, flag) {
  const i = args.indexOf(flag);
  if (i !== -1) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : null;
}

const AGENTS_USAGE = `  Usage:
    docslit agents init [dir] [--tool claude,cursor,copilot,windsurf,codex,gemini|all] [--force] [--json]
    docslit agents print [author|migrate|agents-md]
`;

export async function agents(args = []) {
  const sub = args[0];
  const rest = args.slice(1);
  if (sub === 'init') return agentsInit(rest);
  if (sub === 'print') return agentsPrint(rest);
  console.error(`  ${sub ? `Unknown agents subcommand: ${sub}\n` : ''}${AGENTS_USAGE}`);
  process.exit(1);
}

async function agentsInit(args) {
  const json = args.includes('--json');
  const force = args.includes('--force');
  const toolFlag = flagValue(args, '--tool');
  const valueFlags = new Set(['--tool']);
  const positional = args.filter((a, i) => !a.startsWith('--') && !valueFlags.has(args[i - 1]));
  const dir = path.resolve(positional[0] || '.');

  let tools = null;
  if (toolFlag) tools = toolFlag === 'all' ? 'all' : toolFlag.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

  const r = await runAgentsInit(dir, { tools, force });
  if (json) {
    const { ok, ...out } = r;
    process.stdout.write(JSON.stringify(ok ? out : { error: r.error }, null, 2) + '\n');
    process.exit(ok ? 0 : 1);
  }
  if (!r.ok) {
    console.error(`  ${pc.red('✗')} ${r.error}\n`);
    process.exit(1);
  }

  console.log(`\n  ${pc.bold('DocsLit agent setup')}`);
  if (!toolFlag) {
    console.log(r.detected.length
      ? `  ${pc.dim('Detected:')} ${r.detected.join(', ')} ${pc.dim('(use --tool all to write every tool)')}`
      : `  ${pc.dim('No tool config detected; wrote AGENTS.md only. Use --tool <name> or --tool all for more.')}`);
  }
  console.log('');
  for (const f of r.written) console.log(`  ${pc.green('+')} ${f}`);
  for (const f of r.updated) console.log(`  ${pc.cyan('~')} ${f} ${pc.dim('(updated)')}`);
  for (const f of r.unchanged) console.log(`  ${pc.dim('=')} ${pc.dim(`${f} (up to date)`)}`);
  for (const s of r.skipped) console.log(`  ${pc.yellow('!')} ${s.file} ${pc.dim(`skipped: ${s.reason}`)}`);
  for (const n of r.notes) console.log(`  ${pc.dim(n)}`);
  console.log('');
}

async function agentsPrint(args) {
  const what = (args[0] || 'author').toLowerCase();
  let out;
  if (what === 'author') out = generateAuthorSkill();
  else if (what === 'migrate') out = readMigrateSkill();
  else if (what === 'agents-md' || what === 'agents') {
    const project = await inspectProject(path.resolve('.'));
    out = markedBlock(generateAgentsBlock(project || {})) + '\n';
  } else {
    console.error(`  Unknown target: ${what}\n${AGENTS_USAGE}`);
    process.exit(1);
  }
  process.stdout.write(out.endsWith('\n') ? out : out + '\n');
}
