/**
 * Tiny argv helper shared by commands that must reject unknown flags
 * (validate, lint) instead of silently ignoring them.
 *
 *   parseArgs(args, { flags: ['--strict'], options: ['--format'] })
 *     -> { flags: Set, options: { '--format': 'json' }, positional: [...], unknown: ['--bogus'] }
 *
 * Options accept `--name value` and `--name=value`. A lone `--` ends flag
 * parsing. Missing option values are reported as `missing: ['--format']`.
 */
export function parseArgs(args = [], { flags = [], options = [] } = {}) {
  const flagSet = new Set(flags);
  const optSet = new Set(options);
  const out = { flags: new Set(), options: {}, positional: [], unknown: [], missing: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { out.positional.push(...args.slice(i + 1)); break; }
    if (!a.startsWith('-') || a === '-') { out.positional.push(a); continue; }
    const eq = a.indexOf('=');
    const name = a.startsWith('--') && eq !== -1 ? a.slice(0, eq) : a;
    if (flagSet.has(name) && eq === -1) { out.flags.add(name); continue; }
    if (optSet.has(name)) {
      if (eq !== -1) { out.options[name] = a.slice(eq + 1); continue; }
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) { out.missing.push(name); continue; }
      out.options[name] = next;
      i++;
      continue;
    }
    out.unknown.push(a);
  }
  return out;
}

/** Print a usage error to stderr and exit 1 (same convention as `docslit lint`). */
export function usageError(message, hint) {
  console.error(`  Error: ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

export const OUTPUT_FORMATS = ['pretty', 'json', 'github'];

/** Validate the parsed `--format` value (default pretty); exits 1 on a bad one. */
export function resolveFormat(parsed, cmd) {
  const format = parsed.options['--format'] ?? 'pretty';
  if (!OUTPUT_FORMATS.includes(format)) {
    usageError(`Unknown format: ${format}. Use ${OUTPUT_FORMATS.slice(0, -1).join(', ')} or ${OUTPUT_FORMATS.at(-1)}.`, `Run \`docslit ${cmd} --help\` for usage.`);
  }
  return format;
}

/** Exit 1 with a helpful message when the parse found unknown flags or missing option values. */
export function assertCleanArgs(parsed, cmd) {
  if (parsed.unknown.length) {
    usageError(`Unknown option for \`docslit ${cmd}\`: ${parsed.unknown.join(', ')}`, `Run \`docslit ${cmd} --help\` to see the supported options.`);
  }
  if (parsed.missing.length) {
    usageError(`${parsed.missing.join(', ')} needs a value.`, `Run \`docslit ${cmd} --help\` for usage.`);
  }
}
