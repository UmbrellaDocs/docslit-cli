/**
 * Lossless PNG encoder for rendered RGBA pixels (used for OG images).
 * Writes RGB when every pixel is opaque, rows unfiltered + zlib level 9 by default.
 */
import zlib from 'zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf);
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Apply PNG filter `type` to one row; returns the filtered bytes and their sum of absolute differences.
function filterRow(row, prev, bpp, type) {
  const out = Buffer.alloc(row.length);
  let sum = 0;
  for (let i = 0; i < row.length; i++) {
    const a = i >= bpp ? row[i - bpp] : 0;
    const b = prev[i];
    const c = i >= bpp ? prev[i - bpp] : 0;
    let p;
    switch (type) {
      case 0: p = 0; break;
      case 1: p = a; break;
      case 2: p = b; break;
      case 3: p = (a + b) >> 1; break;
      default: p = paeth(a, b, c);
    }
    const v = (row[i] - p) & 255;
    out[i] = v;
    sum += v < 128 ? v : 256 - v;
  }
  return { out, sum };
}

/**
 * Minimal lossless PNG encoder (8-bit). Drops the alpha channel when every pixel is opaque.
 * `filter: 'none'` (default) writes every row unfiltered; 'adaptive' picks per row the PNG filter
 * with the smallest sum of absolute differences. For the OG card's dithered gradient 'none' + deflate 9
 * is both smaller and ~10x faster than adaptive, so it is the default.
 */
export function encodePng({ width, height, rgba, filter = 'none', level = 9 }) {
  const px = Buffer.isBuffer(rgba) ? rgba : Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  if (px.length !== width * height * 4) throw new Error('encodePng: rgba length does not match width*height*4');
  let opaque = true;
  for (let i = 3; i < px.length; i += 4) if (px[i] !== 255) { opaque = false; break; }
  const bpp = opaque ? 3 : 4;
  const rl = width * bpp;
  const raw = Buffer.alloc((rl + 1) * height);
  let prev = Buffer.alloc(rl);
  for (let y = 0; y < height; y++) {
    let row;
    if (opaque) {
      row = Buffer.alloc(rl);
      for (let x = 0, s = y * width * 4, d = 0; x < width; x++, s += 4) {
        row[d++] = px[s]; row[d++] = px[s + 1]; row[d++] = px[s + 2];
      }
    } else {
      row = px.subarray(y * rl, (y + 1) * rl);
    }
    let type = 0;
    let data = row;
    if (filter === 'adaptive') {
      let best = Infinity;
      for (let t = 0; t < 5; t++) {
        const r = filterRow(row, prev, bpp, t);
        if (r.sum < best) { best = r.sum; type = t; data = r.out; }
      }
    }
    raw[y * (rl + 1)] = type;
    data.copy(raw, y * (rl + 1) + 1);
    prev = row;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = opaque ? 2 : 6; // colour type: RGB / RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level, memLevel: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
