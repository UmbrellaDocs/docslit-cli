import path from 'path';
import fs from 'fs-extra';
import matter from 'gray-matter';

export const VAR_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;
const PASS_TOKEN_RE = /DOCSLIT_PASSBLOCK_(\d+)_END/g;
const NEEDS_PREPROCESS_RE = /<wc-include\b|<wc-var\b[^>]*\bvalue\s*=|\{\{[^}]+\}\}|pass:\[/;

function parseAttrs(attrText = '') {
  const attrs = {};
  const re = /([:@\w-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(attrText)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function formatIncludeChain(chain) {
  if (!chain || !chain.length) return '';
  return chain.join(' -> ');
}

function formatDiag(d) {
  if (!d) return '';
  const where = d.file ? `${d.file}: ` : '';
  return `${where}${d.message}`;
}

function buildErrorMessage(errors) {
  return errors.map((d) => formatDiag(d)).join('\n');
}

function protectSegments(content) {
  const chunks = [];
  let safe = content.replace(/```[\s\S]*?```|<wc-code-block[\s\S]*?<\/wc-code-block>|`[^`\n]+`/g, (m) => {
    const idx = chunks.push(m) - 1;
    return `\x00PROTECTED_${idx}\x00`;
  });
  return {
    safe,
    restore(input) {
      return input.replace(/\x00PROTECTED_(\d+)\x00/g, (_, i) => chunks[Number(i)]);
    },
  };
}

function maskIgnoredSegments(content) {
  return content
    .replace(PASS_TOKEN_RE, (m) => ' '.repeat(m.length))
    .replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length))
    .replace(/<wc-code-block[\s\S]*?<\/wc-code-block>/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`\n]+`/g, (m) => ' '.repeat(m.length));
}

function hasActiveIncludeTag(content) {
  const masked = maskIgnoredSegments(content);
  return /<wc-include\b/i.test(masked);
}

function buildAttributes(globalAttributes, pageAttributes, localAttributes) {
  return {
    ...(globalAttributes || {}),
    ...(pageAttributes || {}),
    ...(localAttributes || {}),
  };
}

function mapIncludeSource(src) {
  const normalized = String(src || '').replace(/\\/g, '/').trim();
  if (!normalized) return null;
  if (normalized.startsWith('/')) {
    if (!normalized.startsWith('/docs/_reusables/')) return null;
    return normalized.slice('/docs/'.length);
  }
  if (normalized.startsWith('_reusables/')) return normalized;
  return `_reusables/${normalized}`;
}

function normalizeRel(relPath) {
  return path.posix.normalize(relPath).replace(/^\/+/, '');
}

function lineOf(src, offset) {
  return src.slice(0, offset).split('\n').length;
}

async function readFromFs(absPath) {
  return fs.readFile(absPath, 'utf8');
}

async function existsInFs(absPath) {
  return fs.pathExists(absPath);
}

export async function preprocessDoc({
  rawBody,
  docsRoot,
  pagePath = null,
  globalAttributes = {},
  pageAttributes = {},
  readFile = readFromFs,
  pathExists = existsInFs,
  strictFsSafety = true,
}) {
  if (!NEEDS_PREPROCESS_RE.test(rawBody || '')) {
    return {
      content: rawBody || '',
      passBlocks: [],
      dependencies: [],
      diagnostics: { errors: [], warnings: [], infos: [] },
      localAttributes: {},
    };
  }

  const diagnostics = { errors: [], warnings: [], infos: [] };
  const dependencies = new Set();
  const localAttributes = {};
  let content = rawBody;
  const passBlocks = [];

  content = content.replace(/pass:\[([\s\S]*?)\]/g, (_, inner) => {
    const idx = passBlocks.push(inner) - 1;
    return `DOCSLIT_PASSBLOCK_${idx}_END`;
  });

  const applyOps = (input, ops) => {
    const sorted = [...ops].sort((a, b) => b.start - a.start);
    let out = input;
    for (const op of sorted) {
      out = out.slice(0, op.start) + op.replacement + out.slice(op.end);
    }
    return out;
  };

  const declarationRe = /<wc-var\b([^>]*?)\/>/g;
  const declarationOps = [];
  {
    const masked = maskIgnoredSegments(content);
    for (const match of masked.matchAll(declarationRe)) {
      const start = match.index || 0;
      const end = start + match[0].length;
      const attrs = parseAttrs(match[1]);
      const name = attrs.name;
      if (!name) continue;
      if (!Object.prototype.hasOwnProperty.call(attrs, 'value')) continue;
      if (!VAR_NAME_RE.test(name)) {
        diagnostics.errors.push({
          file: pagePath,
          line: lineOf(rawBody, start),
          message: `Invalid variable name "${name}" in wc-var declaration`,
        });
        declarationOps.push({ start, end, replacement: '' });
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(localAttributes, name)) {
        diagnostics.infos.push({
          file: pagePath,
          line: lineOf(rawBody, start),
          message: `Variable "${name}" redefined on page; last declaration wins`,
        });
      }
      localAttributes[name] = attrs.value;
      declarationOps.push({ start, end, replacement: '' });
    }
    content = applyOps(content, declarationOps);
  }

  const invalidIncludeRe = /<wc-include\b[^>]*>(?:[\s\S]*?)<\/wc-include>/g;
  {
    const masked = maskIgnoredSegments(content);
    for (const match of masked.matchAll(invalidIncludeRe)) {
      diagnostics.errors.push({
        file: pagePath,
        line: lineOf(rawBody, match.index || 0),
        message: 'wc-include must be self-closing (<wc-include ... />)',
      });
    }
  }

  const includeRe = /<wc-include\b([^>]*?)\/>/g;
  {
    const includeOps = [];
    const masked = maskIgnoredSegments(content);
    const includeMatches = [...masked.matchAll(includeRe)];
    for (const match of includeMatches) {
      const start = match.index || 0;
      const end = start + match[0].length;
      const attrs = parseAttrs(match[1]);
      const src = attrs.src;
      if (!src) {
        diagnostics.errors.push({
          file: pagePath,
          line: lineOf(content, start),
          message: 'wc-include is missing required src attribute',
        });
        continue;
      }
      const mapped = mapIncludeSource(src);
      if (!mapped) {
        diagnostics.errors.push({
          file: pagePath,
          line: lineOf(content, start),
          message: `Invalid include path "${src}" (must be under /docs/_reusables/)`,
        });
        continue;
      }
      const normalized = normalizeRel(mapped);
      if (!normalized.startsWith('_reusables/')) {
        diagnostics.errors.push({
          file: pagePath,
          line: lineOf(content, start),
          message: `Include "${src}" resolves outside docs/_reusables`,
        });
        continue;
      }
      if (normalized.split('/').includes('..')) {
        diagnostics.errors.push({
          file: pagePath,
          line: lineOf(content, start),
          message: `Include "${src}" contains path traversal`,
        });
        continue;
      }
      if (!normalized.endsWith('.md')) {
        diagnostics.errors.push({
          file: pagePath,
          line: lineOf(content, start),
          message: `Include "${src}" must target a .md file`,
        });
        continue;
      }

      const absTarget = path.resolve(docsRoot, normalized);
      const reusablesRoot = path.resolve(docsRoot, '_reusables');
      if (!absTarget.startsWith(reusablesRoot + path.sep)) {
        diagnostics.errors.push({
          file: pagePath,
          line: lineOf(content, start),
          message: `Include "${src}" resolves outside docs/_reusables`,
        });
        continue;
      }
      if (!await pathExists(absTarget)) {
        diagnostics.errors.push({
          file: pagePath,
          line: lineOf(content, start),
          message: `Include target not found: ${normalized}`,
        });
        continue;
      }

      if (strictFsSafety && readFile === readFromFs) {
        const [targetReal, reusablesReal] = await Promise.all([fs.realpath(absTarget), fs.realpath(reusablesRoot)]);
        if (!targetReal.startsWith(reusablesReal + path.sep)) {
          diagnostics.errors.push({
            file: pagePath,
            line: lineOf(content, start),
            message: `Include "${src}" escapes docs/_reusables via symlink`,
          });
          continue;
        }
      }

      dependencies.add(absTarget);
      const rawInclude = await readFile(absTarget);
      if (hasActiveIncludeTag(rawInclude)) {
        diagnostics.errors.push({
          file: pagePath,
          line: lineOf(content, start),
          message: `Nested include is not allowed in reusable file (${normalized})`,
        });
        continue;
      }

      const parsed = matter(rawInclude);
      if (Object.keys(parsed.data || {}).length > 0) {
        diagnostics.warnings.push({
          file: absTarget,
          line: 1,
          message: 'Frontmatter in reusable file is ignored',
        });
      }

      const includeText = parsed.content.replace(/\s+$/, '');
      const sourcePath = `docs/${normalized}`;
      const padded = `\n<!-- BEGIN: Content from file ${sourcePath} -->\n${includeText}\n<!-- END: Content from file ${sourcePath} -->\n`;
      includeOps.push({ start, end, replacement: padded });
    }
    content = applyOps(content, includeOps);
  }

  const attrs = buildAttributes(globalAttributes, pageAttributes, localAttributes);
  const protectedContent = protectSegments(content);
  protectedContent.safe = protectedContent.safe.replace(/\{\{([^}]+)\}\}/g, (full, keyRaw) => {
    const key = keyRaw.trim();
    if (!VAR_NAME_RE.test(key)) {
      diagnostics.warnings.push({
        file: pagePath,
        line: null,
        message: `Invalid variable placeholder "${full}"`,
      });
      return full;
    }
    if (!Object.prototype.hasOwnProperty.call(attrs, key)) {
      diagnostics.warnings.push({
        file: pagePath,
        line: null,
        message: `Undefined variable "${key}"`,
      });
      return full;
    }
    return String(attrs[key]);
  });
  content = protectedContent.restore(protectedContent.safe);

  return {
    content,
    passBlocks,
    dependencies: [...dependencies],
    diagnostics,
    localAttributes,
  };
}

export function assertNoPreprocessErrors(result) {
  if (!result?.diagnostics?.errors?.length) return;
  throw new Error(buildErrorMessage(result.diagnostics.errors));
}

export function formatPreprocessWarnings(result) {
  const warnings = result?.diagnostics?.warnings || [];
  if (!warnings.length) return '';
  return warnings.map((d) => formatDiag(d)).join('\n');
}

export function formatIncludeChainError(chain) {
  return formatIncludeChain(chain);
}
