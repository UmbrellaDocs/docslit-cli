// Small colour toolkit used by the theme system: parsing, WCAG contrast, OKLCH conversion, contrast
// repair, and HCT-like tonal palettes (tone = CIE L*, so tone 40 vs tone 90 has a predictable contrast).
// Pure functions, no dependencies.

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** Parse #rgb, #rrggbb, #rrggbbaa, rgb()/rgba(). Returns { r, g, b, a } (0-255, a 0-1) or null. */
export function parseColor(input) {
  const s = String(input ?? '').trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  m = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(s);
  if (m) {
    let a = 1;
    if (m[4] != null) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  return null;
}

export function toHex({ r, g, b }) {
  const h = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Composite a (possibly translucent) colour over an opaque background. */
export function over(fg, bg) {
  const f = typeof fg === 'string' ? parseColor(fg) : fg;
  const b = typeof bg === 'string' ? parseColor(bg) : bg;
  if (!f || !b) return null;
  const a = f.a ?? 1;
  return { r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 };
}

const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const unlin = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function relativeLuminance(c) {
  const p = typeof c === 'string' ? parseColor(c) : c;
  return 0.2126 * lin(p.r) + 0.7152 * lin(p.g) + 0.0722 * lin(p.b);
}

/** WCAG 2.x contrast ratio. A translucent foreground is composited over `bg` first. */
export function contrastRatio(fg, bg) {
  const b = typeof bg === 'string' ? parseColor(bg) : bg;
  let f = typeof fg === 'string' ? parseColor(fg) : fg;
  if (!f || !b) return NaN;
  if ((f.a ?? 1) < 1) f = over(f, b);
  const l1 = relativeLuminance(f), l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ── OKLab / OKLCH (Björn Ottosson) ──────────────────────────────────────────
export function toOklch(c) {
  const p = typeof c === 'string' ? parseColor(c) : c;
  const r = lin(p.r), g = lin(p.g), b = lin(p.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h: C < 1e-4 ? 0 : h };
}

function oklchToLinear({ L, C, h }) {
  const hr = (h * Math.PI) / 180;
  const A = C * Math.cos(hr), B = C * Math.sin(hr);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (v) => v.every((x) => x >= -0.0005 && x <= 1.0005);

/** OKLCH -> sRGB, reducing chroma until the colour fits the sRGB gamut. */
export function fromOklch({ L, C, h }) {
  let c = C;
  let v = oklchToLinear({ L, C: c, h });
  for (let i = 0; i < 40 && !inGamut(v); i++) { c *= 0.92; v = oklchToLinear({ L, C: c, h }); }
  if (!inGamut(v)) v = oklchToLinear({ L, C: 0, h });
  return { r: unlin(clamp01(v[0])), g: unlin(clamp01(v[1])), b: unlin(clamp01(v[2])), a: 1 };
}

export const hex = (c) => toHex(typeof c === 'string' ? parseColor(c) : c);

// ── Contrast repair ─────────────────────────────────────────────────────────
/**
 * Nudge `fg` (keeping hue and, as far as possible, chroma) until it reaches `min` contrast against every
 * background in `bgs`. Moves lightness away from the backgrounds. Returns a hex colour; returns the input
 * unchanged when it already passes.
 */
export function ensureContrast(fg, bgs, min = 4.5) {
  const list = (Array.isArray(bgs) ? bgs : [bgs]).map((b) => (typeof b === 'string' ? parseColor(b) : b)).filter(Boolean);
  const f0 = typeof fg === 'string' ? parseColor(fg) : fg;
  if (!f0 || !list.length) return fg;
  const worst = (c) => Math.min(...list.map((b) => contrastRatio(c, b)));
  if (worst(f0) >= min) return typeof fg === 'string' ? fg : hex(f0);
  const goal = min + 0.12; // small margin: 8-bit rounding must never land under the threshold
  const lch = toOklch(f0);
  // darker or lighter? pick the direction with the larger achievable contrast against the average background
  const avgL = list.reduce((a, b) => a + toOklch(over(b, { r: 255, g: 255, b: 255 })).L, 0) / list.length;
  const dir = avgL > 0.6 ? -1 : 1;
  for (const d of [dir, -dir]) {
    let lo = d < 0 ? 0 : lch.L, hi = d < 0 ? lch.L : 1;
    let best = null;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const cand = fromOklch({ L: mid, C: lch.C, h: lch.h });
      if (worst(cand) >= goal) { best = cand; if (d < 0) lo = mid; else hi = mid; } else if (d < 0) hi = mid; else lo = mid;
    }
    if (best) return hex(best);
  }
  return dir < 0 ? '#000000' : '#ffffff';
}

/** Black or white, whichever reads better on `bg`. */
export function onColor(bg) {
  return contrastRatio('#ffffff', bg) >= contrastRatio('#000000', bg) ? '#ffffff' : '#000000';
}

/** Change a colour's alpha channel, returning an rgba() string. */
export function withAlpha(c, a) {
  const p = typeof c === 'string' ? parseColor(c) : c;
  return `rgba(${Math.round(p.r)},${Math.round(p.g)},${Math.round(p.b)},${+a.toFixed(3)})`;
}

// ── Tonal palettes (HCT-like: tone is CIE L*) ───────────────────────────────
function toneToY(t) {
  const ft = (t + 16) / 116;
  return t > 8 ? ft ** 3 : t / 903.2962963;
}

/** Colour with the given hue/chroma whose relative luminance matches CIE L* `tone` (0-100). */
export function tonalColor(h, C, tone) {
  if (tone <= 0) return '#000000';
  if (tone >= 100) return '#ffffff';
  const targetY = toneToY(tone);
  let lo = 0, hi = 1, out = null;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    out = fromOklch({ L: mid, C, h });
    if (relativeLuminance(out) < targetY) lo = mid; else hi = mid;
  }
  return hex(out);
}

/**
 * Material-style key tonal palettes derived from one seed colour.
 * Returns functions tone -> hex for primary / secondary / tertiary / neutral / neutralVariant.
 */
export function tonalPalettes(seed) {
  const s = toOklch(seed);
  const hue = s.h;
  const pc = Math.max(0.1, Math.min(s.C, 0.22));
  const mk = (h, c) => (tone) => tonalColor(h, c, tone);
  return {
    seed: hex(seed),
    primary: mk(hue, pc),
    secondary: mk(hue, pc / 3),
    tertiary: mk((hue + 60) % 360, pc / 1.5),
    neutral: mk(hue, Math.min(0.012, pc / 8)),
    neutralVariant: mk(hue, Math.min(0.022, pc / 5)),
  };
}

/**
 * Map a seed colour to docslit theme variables the way Material 3 assigns roles:
 * surfaces step through neutral tones, accent is the primary key tone, outlines are neutral-variant tones.
 */
export function tonalScheme(seed, mode) {
  const p = tonalPalettes(seed);
  const dark = mode === 'dark';
  const accent = dark ? p.primary(80) : p.primary(40);
  const onAccent = dark ? p.primary(20) : p.primary(100);
  const container = dark ? p.primary(30) : p.primary(90);
  const base = {
    bg: dark ? p.neutral(6) : p.neutral(98),
    surface: dark ? p.neutral(10) : p.neutral(96),
    surface2: dark ? p.neutral(17) : p.neutral(94),
    surface3: dark ? p.neutral(22) : p.neutral(90),
    sidebarBg: dark ? p.neutral(10) : p.neutral(96),
    border: dark ? p.neutralVariant(30) : p.neutralVariant(80),
    border2: dark ? p.neutralVariant(40) : p.neutralVariant(70),
    text: dark ? p.neutral(90) : p.neutral(10),
    text2: dark ? p.neutralVariant(80) : p.neutralVariant(30),
    text3: dark ? p.neutralVariant(70) : p.neutralVariant(40),
    accent,
    accentLight: accent,
    onAccent,
    container,
    onContainer: dark ? p.primary(90) : p.primary(10),
    secondaryContainer: dark ? p.secondary(30) : p.secondary(90),
    onSecondaryContainer: dark ? p.secondary(90) : p.secondary(10),
    codeBg: dark ? p.neutral(12) : p.neutral(94),
    codeText: dark ? p.neutral(90) : p.neutral(10),
  };
  return base;
}
