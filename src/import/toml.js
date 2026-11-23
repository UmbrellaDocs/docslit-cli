// Minimal TOML reader for `docslit import` (zensical.toml). Covers what docs configs use:
// [tables], [[arrays of tables]], dotted / quoted keys, basic + literal strings (single and
// multi-line), integers, floats, booleans, dates (kept as strings), arrays (multi-line,
// trailing commas) and inline tables. Not a general-purpose TOML implementation.

export class TomlError extends Error {}

export function parseToml(text) {
  const src = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  let i = 0;
  let line = 1;
  const root = {};
  let cur = root;

  const err = (msg) => { throw new TomlError(`${msg} (line ${line})`); };
  const peek = () => src[i];
  const adv = () => { const c = src[i++]; if (c === '\n') line++; return c; };
  const skipWs = () => { while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i++; };
  const skipComment = () => { if (src[i] === '#') while (i < src.length && src[i] !== '\n') i++; };
  // whitespace, newlines and comments (inside arrays / between statements)
  const skipAll = () => {
    for (;;) {
      skipWs(); skipComment();
      if (src[i] === '\n') { adv(); continue; }
      break;
    }
  };

  const readBasic = () => {
    // at opening "
    if (src.startsWith('"""', i)) {
      i += 3; if (src[i] === '\n') adv();
      let out = '';
      while (i < src.length) {
        if (src.startsWith('"""', i)) {
          // allow up to two extra quotes before the delimiter
          let n = 3; while (src[i + n] === '"' && n < 5) n++;
          out += '"'.repeat(n - 3); i += n; return out;
        }
        const c = adv();
        if (c === '\\') {
          if (src[i] === '\n' || /^[ \t]*\n/.test(src.slice(i, i + 200))) { while (/[\s]/.test(src[i] || '')) adv(); continue; }
          out += escape();
        } else out += c;
      }
      err('Unterminated multi-line string');
    }
    i++;
    let out = '';
    while (i < src.length && src[i] !== '"') {
      if (src[i] === '\n') err('Newline in string');
      const c = adv();
      out += c === '\\' ? escape() : c;
    }
    if (src[i] !== '"') err('Unterminated string');
    i++;
    return out;
  };
  const escape = () => {
    const c = adv();
    switch (c) {
      case 'b': return '\b'; case 't': return '\t'; case 'n': return '\n'; case 'f': return '\f'; case 'r': return '\r';
      case 'e': return '\x1b';
      case '"': return '"'; case '\\': return '\\';
      case 'u': { const h = src.slice(i, i + 4); i += 4; return String.fromCodePoint(parseInt(h, 16)); }
      case 'U': { const h = src.slice(i, i + 8); i += 8; return String.fromCodePoint(parseInt(h, 16)); }
      default: return c;
    }
  };
  const readLiteral = () => {
    if (src.startsWith("'''", i)) {
      i += 3; if (src[i] === '\n') adv();
      const end = src.indexOf("'''", i);
      if (end === -1) err('Unterminated multi-line literal string');
      let e = end; while (src[e + 3] === "'" && e - end < 2) e++;
      const out = src.slice(i, e);
      for (const ch of out) if (ch === '\n') line++;
      i = e + 3; return out;
    }
    i++;
    const end = src.indexOf("'", i);
    if (end === -1 || src.slice(i, end).includes('\n')) err('Unterminated literal string');
    const out = src.slice(i, end); i = end + 1; return out;
  };

  const readKeyPart = () => {
    skipWs();
    if (src[i] === '"') return readBasic();
    if (src[i] === "'") return readLiteral();
    const m = /^[A-Za-z0-9_-]+/.exec(src.slice(i));
    if (!m) err('Expected a key');
    i += m[0].length;
    return m[0];
  };
  const readKey = () => {
    const parts = [readKeyPart()];
    for (;;) { skipWs(); if (src[i] === '.') { i++; parts.push(readKeyPart()); } else break; }
    return parts;
  };

  const readValue = () => {
    skipWs();
    const c = peek();
    if (c === '"') return readBasic();
    if (c === "'") return readLiteral();
    if (c === '[') {
      i++;
      const arr = [];
      for (;;) {
        skipAll();
        if (src[i] === ']') { i++; return arr; }
        arr.push(readValue());
        skipAll();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === ']') { i++; return arr; }
        err('Expected , or ] in array');
      }
    }
    if (c === '{') {
      i++;
      const obj = {};
      skipAll();
      if (src[i] === '}') { i++; return obj; }
      for (;;) {
        skipAll();
        if (src[i] === '}') { i++; return obj; } // TOML 1.1 trailing comma
        const key = readKey();
        skipWs();
        if (src[i] !== '=') err('Expected = in inline table');
        i++;
        setPath(obj, key, readValue());
        skipAll();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === '}') { i++; return obj; }
        err('Expected , or } in inline table');
      }
    }
    const rest = src.slice(i);
    let m;
    if ((m = /^(true|false)(?![\w-])/.exec(rest))) { i += m[0].length; return m[1] === 'true'; }
    if ((m = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?/.exec(rest))) { i += m[0].length; return m[0]; }
    if ((m = /^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?/.exec(rest))) { i += m[0].length; return m[0]; }
    if ((m = /^[+-]?(?:inf|nan)\b/.exec(rest))) { i += m[0].length; return m[0].includes('nan') ? NaN : (m[0].startsWith('-') ? -Infinity : Infinity); }
    if ((m = /^0x[0-9A-Fa-f_]+|^0o[0-7_]+|^0b[01_]+/.exec(rest))) { i += m[0].length; return Number(m[0].replace(/_/g, '')); }
    if ((m = /^[+-]?\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?/.exec(rest))) { i += m[0].length; return Number(m[0].replace(/_/g, '')); }
    err(`Unexpected value "${rest.slice(0, 20).split('\n')[0]}"`);
  };

  function setPath(obj, keys, value) {
    let o = obj;
    for (let k = 0; k < keys.length - 1; k++) {
      const key = keys[k];
      if (o[key] === undefined) o[key] = {};
      else if (Array.isArray(o[key])) { o = o[key][o[key].length - 1]; continue; }
      else if (typeof o[key] !== 'object') err(`Key "${keys.slice(0, k + 1).join('.')}" is already a value`);
      o = o[key];
    }
    o[keys[keys.length - 1]] = value;
  }
  function tableAt(keys, isArray) {
    let o = root;
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      const last = k === keys.length - 1;
      if (last && isArray) {
        if (o[key] === undefined) o[key] = [];
        if (!Array.isArray(o[key])) err(`"${keys.join('.')}" is not an array of tables`);
        const t = {}; o[key].push(t); return t;
      }
      if (o[key] === undefined) o[key] = {};
      if (Array.isArray(o[key])) o = o[key][o[key].length - 1];
      else if (typeof o[key] === 'object' && o[key] !== null) o = o[key];
      else err(`"${keys.slice(0, k + 1).join('.')}" is already a value`);
    }
    return o;
  }

  while (i < src.length) {
    skipAll();
    if (i >= src.length) break;
    if (src[i] === '[') {
      const isArr = src[i + 1] === '[';
      i += isArr ? 2 : 1;
      const keys = readKey();
      skipWs();
      if (src[i] !== ']' || (isArr && src[i + 1] !== ']')) err('Expected ] after table name');
      i += isArr ? 2 : 1;
      cur = tableAt(keys, isArr);
    } else {
      const keys = readKey();
      skipWs();
      if (src[i] !== '=') err('Expected =');
      i++;
      setPath(cur, keys, readValue());
    }
    skipWs(); skipComment();
    if (i < src.length && src[i] !== '\n') err('Expected end of line');
  }
  return root;
}
