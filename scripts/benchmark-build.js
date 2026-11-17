#!/usr/bin/env node
/**
 * Run named build benchmark scenarios from config/scenarios.json.
 * Usage: node scripts/benchmark-build.js [scenario-name] [--runs N] [--project DIR] [--out DIR]
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const scenarios = JSON.parse(readFileSync(path.join(root, 'config/scenarios.json'), 'utf8')).scenarios;

const args = process.argv.slice(2);
const runs = Number(getFlag(args, '--runs') ?? 1);
const project = path.resolve(getFlag(args, '--project') || root);
const out = getFlag(args, '--out');
const name = args.find((a, i) => !a.startsWith('--') && !['--runs', '--project', '--out'].includes(args[i - 1])) || 'cold-full';
const scenario = scenarios.find(s => s.name === name);
if (!Number.isSafeInteger(runs) || runs < 1) {
  console.error('--runs must be a positive integer');
  process.exit(1);
}
if (!scenario) {
  console.error(`Unknown scenario: ${name}`);
  console.error(`Available: ${scenarios.map(s => s.name).join(', ')}`);
  process.exit(1);
}

function getFlag(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'bin/docslit.js'), 'build', ...scenario.args, ...(out ? ['--out', out] : [])], {
      cwd: project,
      stdio: 'inherit',
      env: { ...process.env, DOCSLIT_PROFILE: scenario.args.includes('--profile') ? '1' : process.env.DOCSLIT_PROFILE },
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => (code === 0 ? resolve() : reject(new Error(`build exited ${signal || code}`))));
  });
}

console.log(`\nBenchmark: ${scenario.name} — ${scenario.description}`);
console.log(`Args: docslit build ${scenario.args.join(' ')}${out ? ` --out ${out}` : ''}\n`);
console.log(`Project: ${project}\n`);

if (scenario.args.includes('--incremental')) {
  console.log('  Warming incremental cache (not timed)...');
  await runBuild();
}

const times = [];
for (let i = 0; i < runs; i++) {
  const t0 = performance.now();
  await runBuild();
  const elapsed = (performance.now() - t0) / 1000;
  times.push(elapsed);
  console.log(`  Run ${i + 1}: ${elapsed.toFixed(2)}s`);
}

const avg = times.reduce((a, b) => a + b, 0) / times.length;
console.log(`\nAverage: ${avg.toFixed(2)}s (${runs} run${runs !== 1 ? 's' : ''})\n`);
