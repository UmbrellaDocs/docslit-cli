import { load, dump, JSON_SCHEMA } from 'js-yaml';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const BOM_RE = /^\uFEFF/;

function stripBom(raw) {
  return BOM_RE.test(raw) ? raw.slice(1) : raw;
}

export function parseFrontmatter(raw) {
  const src = stripBom(raw);
  const match = src.match(FRONTMATTER_RE);
  if (!match) return { data: {}, content: src };

  const data = load(match[1], { schema: JSON_SCHEMA });
  if (data != null && (typeof data !== 'object' || Array.isArray(data))) {
    throw new Error('Frontmatter must be a YAML mapping');
  }
  return { data: data ?? {}, content: match[2] };
}

export function stringifyFrontmatter(content, data) {
  if (!data || typeof data !== 'object' || !Object.keys(data).length) return content;
  return `---\n${dump(data, { lineWidth: -1, noRefs: true })}---\n${content}`;
}

function matter(raw) {
  return parseFrontmatter(raw);
}
matter.stringify = stringifyFrontmatter;

export default matter;
