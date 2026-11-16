import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { COMMANDS, renderMainHelp, renderCommandHelp, commandNames } from './help.js';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(SRC, '..', 'bin', 'docslit.js');

// Which help entry documents the flags parsed by each command module.
const MODULES = {
  'init.js': 'init',
  'new-page.js': 'new',
  'deploy.js': 'deploy',
  'import.js': 'import',
  'validate.js': 'validate',
  'lint.js': 'lint',
  'login.js': 'login',
  'publish.js': 'publish',
  'rollback.js': 'rollback',
  'delete.js': 'delete',
  'components-cmd.js': 'components',
  'agents-cmd.js': 'agents',
  'mcp/index.js': 'mcp',
  'openapi-cmd.js': 'openapi',
  'theme-cmd.js': 'theme',
  'schema-cmd.js': 'schema',
  'whoami.js': 'whoami',
  'projects.js': 'projects',
  'dev.js': 'dev',
  'build.js': 'build',
};

// Flag-like literals that are not CLI options of that command.
const ALLOWLIST = {
  'login.js': ['--name'], // deprecated: only used to print a "no longer used" note
  'mcp/index.js': ['-y'], // part of the printed `npx -y docslit mcp` client config
  'agents-cmd.js': ['-y'], // same
};

const FLAG_RE = /['"`](--?[a-zA-Z][a-zA-Z-]*)(?==|['"`\s])/g;

function flagLiterals(file) {
  const src = fs.readFileSync(file, 'utf8');
  const flags = new Set();
  for (const m of src.matchAll(FLAG_RE)) {
    const f = m[1];
    if (f.startsWith('--') || /^-[a-zA-Z]$/.test(f)) flags.add(f);
  }
  return [...flags];
}

describe('help covers every flag the CLI parses', () => {
  const main = renderMainHelp('0.0.0');

  for (const [file, cmd] of Object.entries(MODULES)) {
    it(`${file}: every --flag literal appears in \`docslit ${cmd} --help\` and the main help`, () => {
      const flags = flagLiterals(path.join(SRC, file)).filter((f) => !(ALLOWLIST[file] || []).includes(f));
      const detail = renderCommandHelp(cmd);
      expect(detail, `no help entry for ${cmd}`).toBeTruthy();
      const GLOBAL = ['--help', '-h']; // documented once under "Global options"
      const missing = flags.filter((f) => !main.includes(f) || (!GLOBAL.includes(f) && !detail.includes(f)));
      expect(missing).toEqual([]);
    });
  }

  it('bin/docslit.js global and build/dev flags are documented', () => {
    const flags = flagLiterals(path.join(SRC, '..', 'bin', 'docslit.js'));
    expect(flags.length).toBeGreaterThan(5);
    expect(flags.filter((f) => !main.includes(f))).toEqual([]);
  });

  it('every dispatched command has a help entry and vice versa', () => {
    const bin = fs.readFileSync(BIN, 'utf8');
    const dispatched = [...bin.matchAll(/command === '([a-z]+)'/g)].map((m) => m[1]);
    const names = new Set(commandNames());
    for (const d of dispatched) {
      if (['help'].includes(d)) continue;
      expect(names.has(d), `command ${d} has no help entry`).toBe(true);
    }
    for (const n of names) expect(bin.includes(`command === '${n}'`), `help entry ${n} is not dispatched`).toBe(true);
  });

  it('has no duplicate command names and groups every command', () => {
    expect(new Set(commandNames()).size).toBe(COMMANDS.length);
    for (const c of COMMANDS) expect(c.group, c.name).toBeTruthy();
  });
});

describe('CLI help behaviour', () => {
  const run = (args) => spawnSync('node', [BIN, ...args], { encoding: 'utf8' });

  it('`docslit <command> --help` prints that command\'s options and exits 0 without running it', () => {
    const r = run(['deploy', '--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--cloudflare');
    expect(r.stdout).toContain('--out <dir>');
    const n = run(['new', '-h']);
    expect(n.status).toBe(0);
    expect(n.stdout).toContain('--position');
  });

  it('`docslit help [command]` works', () => {
    expect(run(['help', 'validate']).stdout).toContain('--format');
    expect(run(['help']).stdout).toContain('Options by command');
  });

  it('unknown commands suggest the nearest command and exit 1', () => {
    const r = run(['biuld']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Unknown command: biuld');
    expect(r.stderr).toContain('Did you mean `docslit build`?');
    expect(run(['validte']).stderr).toContain('docslit validate');
    expect(run(['qqqqqq']).stderr).not.toContain('Did you mean');
  });
});
