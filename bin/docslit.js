#!/usr/bin/env node
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

const args = process.argv.slice(2);
const command = args[0];

const { renderMainHelp, renderCommandHelp, commandNames } = await import('../src/help.js');
const help = renderMainHelp(pkg.version);

// `docslit <command> --help` / `docslit help [command]` (mcp keeps its own stderr help).
if (command === 'help') {
  const target = args[1];
  const text = target ? renderCommandHelp(target) : help;
  if (!text) await unknownCommand(target);
  console.log(text);
  process.exit(0);
}
if (command && command !== 'mcp' && args.slice(1).some((a) => a === '--help' || a === '-h')) {
  const text = renderCommandHelp(command);
  if (text) {
    console.log(text);
    process.exit(0);
  }
}

if (!command || command === '--help' || command === '-h') {
  console.log(help);
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log(pkg.version);
  process.exit(0);
}

if (command === 'init') {
  const { init } = await import('../src/init.js');
  await init(args.slice(1));
} else if (command === 'new') {
  const { newPage } = await import('../src/new-page.js');
  await newPage(args.slice(1));
} else if (command === 'deploy') {
  const { deploy } = await import('../src/deploy.js');
  await deploy(args.slice(1));
} else if (command === 'dev') {
  const port = getFlag(args, '--port') || 3000;
  const { dev } = await import('../src/dev.js');
  await dev({ port: Number(port), themePicker: args.includes('--theme-picker') });
} else if (command === 'build') {
  const out = getFlag(args, '--out') || 'dist';
  const offline = args.includes('--offline');
  const minify = !args.includes('--no-minify');
  const pdf = args.includes('--pdf');
  const noPdf = args.includes('--no-pdf');
  const pdfDir = getFlag(args, '--pdf-dir');
  const { build } = await import('../src/build.js');
  await build({ out, offline, minify, pdf, noPdf, pdfDir });
} else if (command === 'import') {
  const restArgs = args.slice(1);
  if (!restArgs[0] || restArgs[0].startsWith('--')) {
    console.error('  Error: Please provide a source directory.\n');
    console.error('  Usage: docslit import <source-dir> [--from mintlify|fern|gitbook|mkdocs] [--out <dir>] [--dry-run] [--theme <name>|--no-theme] [--json] [--force]\n');
    process.exit(1);
  }
  const { importDocs } = await import('../src/import.js');
  await importDocs(restArgs);
} else if (command === 'validate') {
  const { validate } = await import('../src/validate.js');
  await validate(args.slice(1));
} else if (command === 'login') {
  const { login } = await import('../src/login.js');
  await login(args.slice(1));
} else if (command === 'logout') {
  const { logout } = await import('../src/login.js');
  await logout();
} else if (command === 'whoami') {
  const { whoami } = await import('../src/whoami.js');
  await whoami();
} else if (command === 'publish') {
  const { publish } = await import('../src/publish.js');
  await publish(args.slice(1));
} else if (command === 'projects') {
  const { projects } = await import('../src/projects.js');
  await projects();
} else if (command === 'rollback') {
  const { rollback } = await import('../src/rollback.js');
  await rollback(args.slice(1));
} else if (command === 'delete') {
  const { deleteProject } = await import('../src/delete.js');
  await deleteProject(args.slice(1));
} else if (command === 'components') {
  const { components } = await import('../src/components-cmd.js');
  await components(args.slice(1));
} else if (command === 'lint') {
  const { lint } = await import('../src/lint.js');
  await lint(args.slice(1));
} else if (command === 'agents') {
  const { agents } = await import('../src/agents-cmd.js');
  await agents(args.slice(1));
} else if (command === 'mcp') {
  const { mcp } = await import('../src/mcp/index.js');
  await mcp(args.slice(1));
} else if (command === 'schema') {
  const { schema } = await import('../src/schema-cmd.js');
  await schema(args.slice(1));
} else if (command === 'theme') {
  const { theme } = await import('../src/theme-cmd.js');
  await theme(args.slice(1));
} else if (command === 'openapi') {
  const subCmd = args[1];
  if (subCmd === 'scaffold') {
    const { openapiScaffold } = await import('../src/openapi-cmd.js');
    await openapiScaffold(args.slice(2));
  } else {
    console.error(`  Unknown openapi subcommand: ${subCmd || '(none)'}\n`);
    console.error(`  Usage: docslit openapi scaffold <spec.yaml> [--overlay overlay.yaml] [--new-only]\n`);
    process.exit(1);
  }
} else {
  await unknownCommand(command);
}

async function unknownCommand(name) {
  console.error(`  Unknown command: ${name}\n`);
  const { nearest } = await import('../src/markup-check.js');
  const suggestion = nearest(String(name), commandNames());
  if (suggestion) console.error(`  Did you mean ${'`'}docslit ${suggestion}${'`'}?\n`);
  console.error(`  Run ${'`'}docslit --help${'`'} to see all commands.`);
  process.exit(1);
}

function getFlag(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}
