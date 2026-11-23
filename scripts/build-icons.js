#!/usr/bin/env node
// Regenerates src/icons/{lucide,fa}.json: compact SVG registries used at BUILD time to
// inline icons (no runtime CDN fetch). Sources are pinned devDependencies:
//   lucide-static (ISC)  and  @fortawesome/fontawesome-free (icons CC BY 4.0, code MIT).
// Run with `npm run icons`. Override package locations with LUCIDE_DIR / FA_DIR.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const pkgDir = (name, env) => process.env[env] || path.dirname(require.resolve(`${name}/package.json`));

const lucideDir = pkgDir('lucide-static', 'LUCIDE_DIR');
const faDir = pkgDir('@fortawesome/fontawesome-free', 'FA_DIR');
const outDir = path.join(root, 'src', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const attrs = (o) => Object.entries(o).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');

// ── Lucide ────────────────────────────────────────────────────────────────────
const nodes = JSON.parse(fs.readFileSync(path.join(lucideDir, 'icon-nodes.json'), 'utf8'));
const inner = (n) => n.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('');
const lucide = { icons: {}, aliases: {} };
const byHash = new Map();
for (const [name, n] of Object.entries(nodes).sort()) {
  const markup = inner(n);
  lucide.icons[name] = markup;
  byHash.set(crypto.createHash('sha1').update(markup).digest('hex'), name);
}
const normSvg = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?>/, '').replace(/<\/svg>/, '').replace(/\s+/g, ' ').replace(/ ?\/>/g, '/>').replace(/> </g, '><').trim();
for (const f of fs.readdirSync(path.join(lucideDir, 'icons')).filter((x) => x.endsWith('.svg'))) {
  const name = f.slice(0, -4);
  if (lucide.icons[name]) continue;
  const body = normSvg(fs.readFileSync(path.join(lucideDir, 'icons', f), 'utf8'));
  // compare against canonical icons by normalised markup
  for (const [cn, m] of Object.entries(lucide.icons)) {
    if (normSvg(`<svg>${m}</svg>`).replace(/ \/>/g, '/>') === body.replace(/ \/>/g, '/>') || m.replace(/ \/>/g, '/>').replace(/></g, '><') === body) { lucide.aliases[name] = cn; break; }
  }
  if (!lucide.aliases[name]) lucide.icons[name] = body;
}
fs.writeFileSync(path.join(outDir, 'lucide.json'), JSON.stringify({ v: JSON.parse(fs.readFileSync(path.join(lucideDir, 'package.json'), 'utf8')).version, ...lucide }));

// ── Font Awesome Free ────────────────────────────────────────────────────────
const fa = { solid: {}, regular: {}, brands: {}, aliases: {} };
for (const style of ['solid', 'regular', 'brands']) {
  for (const f of fs.readdirSync(path.join(faDir, 'svgs', style)).filter((x) => x.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(faDir, 'svgs', style, f), 'utf8');
    const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    const d = [...svg.matchAll(/<path d="([^"]+)"\/>/g)];
    const paths = (svg.match(/<path\b/g) || []).length;
    if (!vb || vb[2] !== '512' || paths !== 1 || d.length !== 1) throw new Error(`Unexpected FA svg shape: ${style}/${f}`);
    fa[style][f.slice(0, -4)] = [Number(vb[1]), d[0][1]];
  }
}
const meta = yaml.load(fs.readFileSync(path.join(faDir, 'metadata', 'icons.yml'), 'utf8'));
for (const [name, m] of Object.entries(meta)) {
  for (const a of m.aliases?.names || []) if (!fa.solid[a] && !fa.regular[a] && !fa.brands[a]) fa.aliases[a] = name;
}
fs.writeFileSync(path.join(outDir, 'fa.json'), JSON.stringify({ v: JSON.parse(fs.readFileSync(path.join(faDir, 'package.json'), 'utf8')).version, ...fa }));

const size = (f) => (fs.statSync(path.join(outDir, f)).size / 1024).toFixed(0);
console.log(`lucide.json ${size('lucide.json')} KB (${Object.keys(lucide.icons).length} icons, ${Object.keys(lucide.aliases).length} aliases)`);
console.log(`fa.json ${size('fa.json')} KB (${Object.keys(fa.solid).length} solid, ${Object.keys(fa.regular).length} regular, ${Object.keys(fa.brands).length} brands, ${Object.keys(fa.aliases).length} aliases)`);
