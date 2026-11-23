import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { encodePng, generateOgImage } from './og-image.js';

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Independent decoder: parses chunks (checking CRCs), inflates and unfilters.
function decodePng(buf) {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  let pos = 8, ihdr, idat = [], ended = false;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    expect(buf.readUInt32BE(pos + 8 + len)).toBe(zlib.crc32(buf.subarray(pos + 4, pos + 8 + len)));
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') ended = true;
    pos += 12 + len;
  }
  expect(ended).toBe(true);
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const bpp = ihdr[9] === 2 ? 3 : 4;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rl = width * bpp;
  const out = Buffer.alloc(rl * height);
  for (let y = 0; y < height; y++) {
    const t = raw[y * (rl + 1)];
    for (let i = 0; i < rl; i++) {
      const x = raw[y * (rl + 1) + 1 + i];
      const a = i >= bpp ? out[y * rl + i - bpp] : 0;
      const b = y ? out[(y - 1) * rl + i] : 0;
      const c = y && i >= bpp ? out[(y - 1) * rl + i - bpp] : 0;
      const p = [0, a, b, (a + b) >> 1, paeth(a, b, c)][t];
      out[y * rl + i] = (x + p) & 255;
    }
  }
  return { width, height, bpp, pixels: out };
}

function synthetic(w, h, alpha) {
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    px[i] = (x * 13 + y) & 255; px[i + 1] = (y * 7) & 255; px[i + 2] = (x ^ y) & 255;
    px[i + 3] = alpha ? (x * 5 + y * 3) & 255 : 255;
  }
  return px;
}

describe('encodePng', () => {
  for (const filter of ['none', 'adaptive']) {
    it(`round-trips opaque RGB (${filter})`, () => {
      const rgba = synthetic(37, 19, false);
      const d = decodePng(encodePng({ width: 37, height: 19, rgba, filter }));
      expect([d.width, d.height, d.bpp]).toEqual([37, 19, 3]);
      for (let i = 0; i < 37 * 19; i++) {
        expect([...d.pixels.subarray(i * 3, i * 3 + 3)]).toEqual([...rgba.subarray(i * 4, i * 4 + 3)]);
      }
    });
    it(`keeps alpha when not opaque (${filter})`, () => {
      const rgba = synthetic(23, 11, true);
      const d = decodePng(encodePng({ width: 23, height: 11, rgba, filter }));
      expect(d.bpp).toBe(4);
      expect(Buffer.compare(d.pixels, rgba)).toBe(0);
    });
  }

  it('rejects mismatched buffer length', () => {
    expect(() => encodePng({ width: 2, height: 2, rgba: Buffer.alloc(3) })).toThrow();
  });
});

describe('generateOgImage', () => {
  it('writes a lossless PNG much smaller than resvg asPng', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'og-'));
    try {
      const file = path.join(dir, 'a.png');
      const ok = await generateOgImage({ title: 'Getting started with DocsLit', siteName: 'Acme Docs', outFile: file });
      expect(ok).toBe(true);
      const png = await fs.readFile(file);
      const d = decodePng(png);
      expect([d.width, d.height]).toEqual([1200, 630]);
      expect(png.length).toBeLessThan(120 * 1024); // asPng produced ~240-280 KB
      const { Resvg } = await import('@resvg/resvg-js');
      const { buildOgSvg } = await import('./og-image.js');
      const ref = new Resvg(buildOgSvg({ title: 'Getting started with DocsLit', siteName: 'Acme Docs' })).render();
      expect(png.length).toBeLessThan(ref.asPng().length / 2);
      const px = ref.pixels;
      const same = d.bpp === 4
        ? Buffer.compare(d.pixels, px) === 0
        : px.every((v, i) => i % 4 === 3 ? v === 255 : v === d.pixels[(i >> 2) * 3 + (i % 4)]);
      expect(same).toBe(true);
    } finally {
      await fs.remove(dir);
    }
  });
});
