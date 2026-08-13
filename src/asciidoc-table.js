/**
 * AsciiDoc table parser (PSV / CSV / DSV / TSV), ported from Asciidoctor's
 * table model: lib/asciidoctor/table.rb + Parser.parse_table / parse_colspecs /
 * parse_cellspec. Supports the table syntax documented at:
 * https://docs.asciidoctor.org/asciidoc/latest/tables/table-ref/
 */

const HORZ = { '<': 'left', '>': 'right', '^': 'center' };
const VERT = { '<': 'top', '>': 'bottom', '^': 'middle' };
const STYLES = {
  d: 'default',
  s: 'strong',
  e: 'emphasis',
  m: 'monospaced',
  h: 'header',
  l: 'literal',
  a: 'asciidoc',
};

// From asciidoctor/rx.rb
const COLUMN_SPEC_RX =
  /^(?:(\d+)\*)?([<^>](?:\.[<^>]?)?|(?:[<^>]?\.)?[<^>])?(\d+%?|~)?([a-z])?$/;
const CELL_SPEC_START_RX =
  /^[ \t]*(?:(\d+(?:\.\d*)?|(?:\d*\.)?\d+)([*+]))?([<^>](?:\.[<^>]?)?|(?:[<^>]?\.)?[<^>])?([a-z])?$/;
const CELL_SPEC_END_RX =
  /[ \t]+(?:(\d+(?:\.\d*)?|(?:\d*\.)?\d+)([*+]))?([<^>](?:\.[<^>]?)?|(?:[<^>]?\.)?[<^>])?([a-z])?$/;

const FORMATS = new Set(['psv', 'csv', 'dsv', 'tsv']);
const DELIMITERS = {
  psv: '|',
  csv: ',',
  dsv: ':',
  tsv: '\t',
  '!sv': '!',
};

const SHORTHAND_OPEN = {
  ',===': 'csv',
  ':===': 'dsv',
};

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyInline(text) {
  let s = escapeHtml(text);
  s = s.replace(/\{vbar\}/g, '|');
  // Constrained + unconstrained bold/italic/mono (subset of AsciiDoc inline)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<![\w*])\*([^*]+)\*(?![\w*])/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<em>$1</em>');
  s = s.replace(/(?<![\w_])_([^_]+)_(?![\w_])/g, '<em>$1</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(
    /https?:\/\/[^\s\[\]]+/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`,
  );
  s = s.replace(
    /link:([^\[]+)\[([^\]]*)\]/g,
    (_, href, label) =>
      `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${label || href}</a>`,
  );
  return s;
}

function styleCellHtml(text, style) {
  const trimmed = text.replace(/\r\n/g, '\n');
  if (style === 'literal') {
    return `<pre class="adoc-literal">${escapeHtml(trimmed.replace(/^\n+/, '').replace(/\n+$/, ''))}</pre>`;
  }
  if (style === 'asciidoc') {
    return formatAsciidocCell(trimmed);
  }
  const paras = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const renderPara = (p) => {
    const inline = applyInline(p.replace(/\n/g, ' '));
    if (style === 'strong') return `<strong>${inline}</strong>`;
    if (style === 'emphasis') return `<em>${inline}</em>`;
    if (style === 'monospaced') return `<code>${inline}</code>`;
    return inline;
  };
  if (paras.length <= 1) return renderPara(paras[0] || trimmed.trim());
  return paras.map((p) => `<p>${renderPara(p)}</p>`).join('');
}

function formatAsciidocCell(text) {
  const lines = text.replace(/^\n+/, '').replace(/\n+$/, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }
    if (/^\s*[*\-]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && (/^\s*[*\-]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*(?:[*\-]|\d+\.)\s+/, ''));
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(
        `<${tag}>${items.map((it) => `<li>${applyInline(it)}</li>`).join('')}</${tag}>`,
      );
      continue;
    }
    const para = [line];
    i += 1;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*[*\-]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${applyInline(para.join(' '))}</p>`);
  }
  return out.join('') || applyInline(text.trim());
}

/**
 * Parse AsciiDoc attribute list body (without surrounding brackets).
 * Supports: %header, cols="1,2", options="header,footer", key=value, key='v'
 */
export function parseAttributeList(raw = '') {
  const attrs = {};
  const options = new Set();
  let i = 0;
  const s = String(raw).trim();

  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i += 1;
    if (i >= s.length) break;

    if (s[i] === '%') {
      i += 1;
      let name = '';
      while (i < s.length && /[a-zA-Z0-9_-]/.test(s[i])) name += s[i++];
      if (name) options.add(name);
      continue;
    }

    let key = '';
    while (i < s.length && /[a-zA-Z0-9_-]/.test(s[i])) key += s[i++];
    if (!key) {
      i += 1;
      continue;
    }

    while (i < s.length && /\s/.test(s[i])) i += 1;
    if (s[i] === '=') {
      i += 1;
      while (i < s.length && /\s/.test(s[i])) i += 1;
      let value = '';
      if (s[i] === '"' || s[i] === "'") {
        const q = s[i++];
        while (i < s.length && s[i] !== q) value += s[i++];
        if (s[i] === q) i += 1;
      } else {
        while (i < s.length && s[i] !== ',') value += s[i++];
        value = value.trim();
      }
      if (key === 'options') {
        for (const opt of value.split(',')) {
          const o = opt.trim();
          if (o) options.add(o);
        }
      } else {
        attrs[key] = value;
      }
    } else {
      // positional / role-like token — ignore unknown for tables
      attrs[key] = '';
    }
  }

  if (options.size) attrs.options = [...options].join(',');
  for (const opt of options) attrs[`${opt}-option`] = '';
  return attrs;
}

export function parseColspecs(records) {
  if (records == null || records === '') return [];
  let cleaned = String(records);
  if (cleaned.includes(' ')) cleaned = cleaned.replace(/ /g, '');

  // Deprecated: single integer → N equal columns
  if (/^\d+$/.test(cleaned)) {
    return Array.from({ length: Number(cleaned) }, () => ({ width: 1 }));
  }

  const specs = [];
  const parts = cleaned.includes(',') ? cleaned.split(',') : cleaned.split(';');
  for (const record of parts) {
    if (record === '') {
      specs.push({ width: 1 });
      continue;
    }
    const m = COLUMN_SPEC_RX.exec(record);
    if (!m) {
      specs.push({ width: 1 });
      continue;
    }
    const spec = {};
    if (m[2]) {
      const [colspec, rowspec] = m[2].split('.');
      if (colspec && HORZ[colspec]) spec.halign = HORZ[colspec];
      if (rowspec && VERT[rowspec]) spec.valign = VERT[rowspec];
    }
    if (m[3]) {
      spec.width = m[3] === '~' ? -1 : parseInt(m[3], 10);
    } else {
      spec.width = 1;
    }
    if (m[4] && STYLES[m[4]]) spec.style = STYLES[m[4]];

    if (m[1]) {
      const n = Number(m[1]);
      for (let i = 0; i < n; i++) specs.push({ ...spec });
    } else {
      specs.push(spec);
    }
  }
  return specs;
}

function parseCellspec(line, pos = 'end', delimiter = '|') {
  let m;
  let rest = '';

  if (pos === 'start') {
    if (!line.includes(delimiter)) return [null, line];
    const idx = line.indexOf(delimiter);
    const specPart = line.slice(0, idx);
    rest = line.slice(idx + delimiter.length);
    m = CELL_SPEC_START_RX.exec(specPart);
    if (!m) return [null, line];
    if (m[0] === '') return [{}, rest];
  } else {
    m = CELL_SPEC_END_RX.exec(line);
    if (!m) return [{}, line];
    if (m[0].trimStart() === '') return [{}, line.replace(/\s+$/, '')];
    rest = line.slice(0, m.index);
  }

  const spec = {};
  if (m[1]) {
    const [colspecRaw, rowspecRaw] = m[1].split('.');
    const colspec = !colspecRaw ? 1 : Number(colspecRaw);
    const rowspec = rowspecRaw === undefined || rowspecRaw === '' ? 1 : Number(rowspecRaw);
    if (m[2] === '+') {
      if (colspec !== 1) spec.colspan = colspec;
      if (rowspec !== 1) spec.rowspan = rowspec;
    } else if (m[2] === '*') {
      if (colspec !== 1) spec.repeatcol = colspec;
    }
  }

  if (m[3]) {
    const [colspec, rowspec] = m[3].split('.');
    if (colspec && HORZ[colspec]) spec.halign = HORZ[colspec];
    if (rowspec && VERT[rowspec]) spec.valign = VERT[rowspec];
  }

  if (m[4] && STYLES[m[4]]) spec.style = STYLES[m[4]];
  return [spec, rest];
}

function assignColumnWidths(columns) {
  if (!columns.length) return;
  let widthBase = 0;
  const autowidthCols = [];
  for (const col of columns) {
    if (col.width < 0) autowidthCols.push(col);
    else widthBase += col.width;
  }

  const precision = 4;
  let total = 0;
  let lastPc = 0;

  if (widthBase > 0 || autowidthCols.length) {
    if (autowidthCols.length) {
      let auto = 0;
      if (widthBase <= 100) {
        auto = Number(((100 - widthBase) / autowidthCols.length).toFixed(precision));
        widthBase = 100;
      }
      for (const col of autowidthCols) col.width = auto;
    }
    for (const col of columns) {
      lastPc = Number(((col.width * 100) / widthBase).toFixed(precision));
      col.pcwidth = lastPc;
      total += lastPc;
    }
  } else {
    lastPc = Number((100 / columns.length).toFixed(precision));
    for (const col of columns) {
      col.pcwidth = lastPc;
      total += lastPc;
    }
  }

  if (total !== 100 && columns.length) {
    columns[columns.length - 1].pcwidth = Number(
      (100 - total + lastPc).toFixed(precision),
    );
  }
}

/**
 * Strip optional title / attribute list / delimiters from authoring source.
 * Accepts either a full AsciiDoc table block or just the inner cell lines.
 */
export function extractTableSource(source, elementAttrs = {}) {
  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && /^\s*$/.test(lines[i])) i += 1;

  let title = elementAttrs.caption || elementAttrs.title || '';
  if (i < lines.length && /^\.[^\s[\].]/.test(lines[i])) {
    title = lines[i].slice(1).trim();
    i += 1;
  }

  let attrs = { ...elementAttrs };
  if (i < lines.length && /^\[.*\]\s*$/.test(lines[i])) {
    const inner = lines[i].replace(/^\[/, '').replace(/\]\s*$/, '');
    attrs = { ...parseAttributeList(inner), ...elementAttrs };
    // Element attrs win on explicit keys; merge options
    if (elementAttrs.options || attrs.options) {
      const set = new Set([
        ...(attrs.options || '').split(',').map((s) => s.trim()).filter(Boolean),
        ...(elementAttrs.options || '').split(',').map((s) => s.trim()).filter(Boolean),
      ]);
      for (const opt of set) attrs[`${opt}-option`] = '';
      attrs.options = [...set].join(',');
    }
    i += 1;
  } else if (elementAttrs.options) {
    for (const opt of String(elementAttrs.options).split(',')) {
      const o = opt.trim();
      if (o) attrs[`${o}-option`] = '';
    }
  }

  let format = attrs.format || 'psv';
  let openDelim = null;
  let closeDelim = null;

  if (i < lines.length) {
    const open = lines[i].trim();
    if (SHORTHAND_OPEN[open]) {
      // ,=== / :=== imply format; |=== keeps attrs.format (default psv)
      format = SHORTHAND_OPEN[open];
      openDelim = open;
      closeDelim = open;
      i += 1;
    } else if (/^[|,:]=+$/.test(open)) {
      openDelim = open;
      closeDelim = open;
      if (open.startsWith(',')) format = 'csv';
      else if (open.startsWith(':')) format = 'dsv';
      else format = attrs.format || 'psv';
      i += 1;
    }
  }

  // Trim matching closing delimiter
  let end = lines.length;
  while (end > i && /^\s*$/.test(lines[end - 1])) end -= 1;
  if (closeDelim && end > i && lines[end - 1].trim() === closeDelim) end -= 1;

  const bodyLines = lines.slice(i, end);
  if (!FORMATS.has(format)) format = 'psv';

  let separator = attrs.separator;
  if (separator === '\\t') separator = '\t';
  if (!separator) {
    separator = format === 'tsv' ? '\t' : DELIMITERS[format] || '|';
  }
  // tsv is csv rules with tab separator
  const parseFormat = format === 'tsv' ? 'csv' : format;

  return { title, attrs, format: parseFormat, originalFormat: format, separator, bodyLines };
}

class ParserContext {
  constructor(table, format, separator, colcount) {
    this.table = table;
    this.format = format;
    this.delimiter = separator;
    this.delimiterRe = new RegExp(separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    this.colcount = colcount;
    this.buffer = '';
    this.cellspecs = [];
    this.cellOpen = false;
    this.activeRowspans = [0];
    this.columnVisits = 0;
    this.currentRow = [];
    this.linenum = -1;
  }

  startsWithDelimiter(line) {
    return line.startsWith(this.delimiter);
  }

  matchDelimiter(line) {
    return this.delimiterRe.exec(line);
  }

  skipPastEscapedDelimiter(pre) {
    this.buffer += `${pre.slice(0, -1)}${this.delimiter}`;
  }

  skipPastDelimiter(pre) {
    this.buffer += `${pre}${this.delimiter}`;
  }

  bufferHasUnclosedQuotes(append = null) {
    const q = '"';
    const record = (append != null ? this.buffer + append : this.buffer).trim();
    if (record === q) return true;
    if (!record.startsWith(q)) return false;
    const qq = q + q;
    const trailing = record.endsWith(q);
    if ((trailing && record.endsWith(qq)) || record.startsWith(qq)) {
      const collapsed = record.split(qq).join('');
      return collapsed.startsWith(q) && !collapsed.endsWith(q);
    }
    return !trailing;
  }

  takeCellspec() {
    return this.cellspecs.shift();
  }

  pushCellspec(cellspec = {}) {
    this.cellspecs.push(cellspec || {});
  }

  keepCellOpen() {
    this.cellOpen = true;
  }

  cellIsOpen() {
    return this.cellOpen;
  }

  closeOpenCell(nextCellspec = {}) {
    this.pushCellspec(nextCellspec);
    if (this.cellOpen) this.closeCell(true);
    this.linenum += 1;
  }

  activateRowspan(rowspan, colspan) {
    for (let i = 1; i < rowspan; i++) {
      this.activeRowspans[i] = (this.activeRowspans[i] || 0) + colspan;
    }
  }

  effectiveColumnVisits() {
    return this.columnVisits + (this.activeRowspans[0] || 0);
  }

  endOfRow() {
    if (this.colcount === -1) return 0;
    const v = this.effectiveColumnVisits();
    if (v < this.colcount) return -1;
    if (v > this.colcount) return 1;
    return 0;
  }

  closeRow(drop = false) {
    if (!drop) this.table.body.push(this.currentRow);
    if (this.colcount === -1) this.colcount = this.columnVisits;
    this.columnVisits = 0;
    this.currentRow = [];
    this.activeRowspans.shift();
    this.activeRowspans[0] = this.activeRowspans[0] || 0;
  }

  closeCell(eol = false) {
    let cellText;
    let cellspec;
    let repeat = 1;

    if (this.format === 'psv') {
      cellText = this.buffer;
      this.buffer = '';
      cellspec = this.takeCellspec();
      if (cellspec) {
        repeat = cellspec.repeatcol || 1;
        delete cellspec.repeatcol;
      } else {
        cellspec = {};
        repeat = 1;
      }
    } else {
      cellText = this.buffer.trim();
      this.buffer = '';
      cellspec = null;
      if (this.format === 'csv' && cellText && cellText.includes('"')) {
        const q = '"';
        if (cellText.startsWith(q) && cellText.endsWith(q)) {
          cellText = cellText.slice(1, -1);
          if (cellText != null) {
            cellText = cellText.trim().replace(/""/g, '"');
          } else {
            cellText = '';
          }
        } else {
          cellText = cellText.replace(/""/g, '"');
        }
      }
    }

    for (let i = 1; i <= repeat; i++) {
      if (this.colcount === -1) {
        this.table.columns.push({
          width: 1,
          halign: 'left',
          valign: 'top',
          style: null,
          index: this.table.columns.length,
        });
        if (cellspec?.colspan && cellspec.colspan > 1) {
          for (let j = 0; j < cellspec.colspan - 1; j++) {
            this.table.columns.push({
              width: 1,
              halign: 'left',
              valign: 'top',
              style: null,
              index: this.table.columns.length,
            });
          }
        }
      }

      const colIndex = this.currentRow.length;
      const column = this.table.columns[colIndex] || {
        width: 1,
        halign: 'left',
        valign: 'top',
        style: null,
      };

      // Mirror Asciidoctor Table#header_row?: only the first row being built
      // is a header when the header option is set (body still empty).
      const inHeader = !!(this.table.hasHeaderOption && this.table.body.length === 0);
      const cell = makeCell(cellText, cellspec, column, inHeader);
      if (cell.rowspan && cell.rowspan > 1) {
        this.activateRowspan(cell.rowspan, cell.colspan || 1);
      }
      this.columnVisits += cell.colspan || 1;
      this.currentRow.push(cell);

      const rowStatus = this.endOfRow();
      if (rowStatus > -1 && (this.colcount !== -1 || this.linenum > 0 || (eol && i === repeat))) {
        if (rowStatus > 0) this.closeRow(true);
        else this.closeRow();
      }
    }
    this.cellOpen = false;
  }

  closeTable() {
    // drop incomplete trailing row (Asciidoctor behavior)
    this.currentRow = [];
    this.columnVisits = 0;
  }
}

function makeCell(text, cellspec, column, inHeader) {
  const spec = cellspec || {};
  let style = inHeader ? null : (spec.style || column.style || null);
  if (inHeader) style = null;

  let cellText;
  if (style === 'asciidoc' || style === 'literal') {
    cellText = text.replace(/\s+$/, '');
    while (cellText.startsWith('\n')) cellText = cellText.slice(1);
    if (style === 'asciidoc' && !text.startsWith('\n')) cellText = cellText.replace(/^\s+/, '');
  } else {
    cellText = text.trim();
  }

  // Unescape \| in PSV content (backslash already removed by parser when splitting;
  // remaining \| from multi-line keep paths)
  cellText = cellText.replace(/\\\|/g, '|').replace(/\{vbar\}/g, '|');

  return {
    text: cellText,
    colspan: spec.colspan || 1,
    rowspan: spec.rowspan || 1,
    halign: spec.halign || column.halign || 'left',
    valign: spec.valign || column.valign || 'top',
    style,
    header: style === 'header' || !!inHeader,
  };
}

function skipBlank(lines, start) {
  let i = start;
  let skipped = 0;
  while (i < lines.length && /^\s*$/.test(lines[i])) {
    skipped += 1;
    i += 1;
  }
  return { index: i, skipped };
}

/**
 * Parse an AsciiDoc table into a structured model.
 *
 * @param {string} source - Full table block or inner cell source
 * @param {object} [elementAttrs] - Attributes from the HTML element
 * @returns {{ title: string, attrs: object, columns: object[], head: object[][], body: object[][], foot: object[][] }}
 */
export function parseAsciiDocTable(source, elementAttrs = {}) {
  const { title, attrs, format, separator, bodyLines } = extractTableSource(
    source,
    elementAttrs,
  );

  const table = {
    columns: [],
    body: [],
    hasHeaderOption: false,
  };

  let explicitColspecs = false;
  if (attrs.cols) {
    const colspecs = parseColspecs(attrs.cols);
    if (colspecs.length) {
      table.columns = colspecs.map((c, index) => ({
        width: c.width ?? 1,
        halign: c.halign || 'left',
        valign: c.valign || 'top',
        style: c.style || null,
        index,
      }));
      explicitColspecs = true;
    }
  }

  let { index: lineIdx, skipped } = skipBlank(bodyLines, 0);
  let implicitHeader = false;
  let implicitHeaderBoundary = null;

  if ('header-option' in attrs) {
    table.hasHeaderOption = true;
  } else if (skipped === 0 && !('noheader-option' in attrs)) {
    table.hasHeaderOption = 'implicit';
    implicitHeader = true;
  }

  const ctx = new ParserContext(
    table,
    format,
    separator,
    table.columns.length ? table.columns.length : -1,
  );

  const reader = {
    lines: bodyLines,
    index: lineIdx,
    hasMore() {
      return this.index < this.lines.length;
    },
    peek() {
      return this.hasMore() ? this.lines[this.index] : null;
    },
    read() {
      if (!this.hasMore()) return null;
      return this.lines[this.index++];
    },
    skipBlanks() {
      let n = 0;
      while (this.hasMore() && /^\s*$/.test(this.lines[this.index])) {
        this.index += 1;
        n += 1;
      }
      return n;
    },
  };

  let loopIdx = -1;

  while (reader.hasMore()) {
    let line = reader.read();
    loopIdx += 1;
    const beyondFirst = loopIdx > 0;

    if (beyondFirst && line === '') {
      line = null;
      if (implicitHeaderBoundary != null) implicitHeaderBoundary += 1;
    } else if (format === 'psv') {
      if (line != null && ctx.startsWithDelimiter(line)) {
        line = line.slice(ctx.delimiter.length);
        ctx.closeOpenCell();
        if (implicitHeaderBoundary != null) implicitHeaderBoundary = null;
      } else if (line != null) {
        const [nextCellspec, rest] = parseCellspec(line, 'start', ctx.delimiter);
        if (nextCellspec) {
          line = rest;
          ctx.closeOpenCell(nextCellspec);
          if (implicitHeaderBoundary != null) implicitHeaderBoundary = null;
        } else if (implicitHeaderBoundary != null && implicitHeaderBoundary === loopIdx) {
          table.hasHeaderOption = false;
          implicitHeader = false;
          implicitHeaderBoundary = null;
        }
      }
    }

    if (!beyondFirst) {
      if (implicitHeader) {
        if (reader.hasMore() && reader.peek() === '') {
          implicitHeaderBoundary = 1;
        } else {
          table.hasHeaderOption = false;
          implicitHeader = false;
        }
      }
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let m;
      if (line != null && (m = ctx.matchDelimiter(line))) {
        const pre = line.slice(0, m.index);
        const post = line.slice(m.index + m[0].length);

        if (format === 'csv') {
          if (ctx.bufferHasUnclosedQuotes(pre)) {
            ctx.skipPastDelimiter(pre);
            line = post;
            if (line === '') break;
            continue;
          }
          ctx.buffer += pre;
        } else if (format === 'dsv') {
          if (pre.endsWith('\\')) {
            ctx.skipPastEscapedDelimiter(pre);
            line = post;
            if (line === '') {
              ctx.buffer += '\n';
              ctx.keepCellOpen();
              break;
            }
            continue;
          }
          ctx.buffer += pre;
        } else {
          // psv
          if (pre.endsWith('\\')) {
            ctx.skipPastEscapedDelimiter(pre);
            line = post;
            if (line === '') {
              ctx.buffer += '\n';
              ctx.keepCellOpen();
              break;
            }
            continue;
          }
          const [nextCellspec, cellText] = parseCellspec(pre, 'end');
          ctx.pushCellspec(nextCellspec);
          ctx.buffer += cellText;
        }

        line = post === '' ? null : post;
        ctx.closeCell();
      } else {
        ctx.buffer += `${line ?? ''}\n`;
        if (format === 'csv') {
          if (ctx.bufferHasUnclosedQuotes()) {
            if (implicitHeaderBoundary != null && loopIdx === 0) {
              table.hasHeaderOption = false;
              implicitHeader = false;
              implicitHeaderBoundary = null;
            }
            ctx.keepCellOpen();
          } else {
            ctx.closeCell(true);
          }
        } else if (format === 'dsv') {
          ctx.closeCell(true);
        } else {
          ctx.keepCellOpen();
        }
        break;
      }
    }

    if (ctx.cellIsOpen()) {
      if (!reader.hasMore()) ctx.closeCell(true);
    } else {
      const n = reader.skipBlanks();
      if (!n && !reader.hasMore()) break;
      if (!reader.hasMore()) break;
    }
  }

  ctx.closeTable();

  if (!explicitColspecs && table.columns.length) {
    assignColumnWidths(table.columns);
  } else if (explicitColspecs) {
    assignColumnWidths(table.columns);
  }

  if (implicitHeader) table.hasHeaderOption = true;

  // Partition header / footer
  const body = table.body;
  let head = [];
  let foot = [];

  if (body.length > 0) {
    if (table.hasHeaderOption) {
      head = [body.shift().map((cell) => ({ ...cell, header: true, style: null }))];
    }
    if (body.length > 0 && 'footer-option' in attrs) {
      foot = [body.pop()];
    }
  }

  return {
    title,
    attrs,
    columns: table.columns,
    head,
    body,
    foot,
  };
}

function cellAttrs(cell) {
  const parts = [];
  if (cell.colspan > 1) parts.push(`colspan="${cell.colspan}"`);
  if (cell.rowspan > 1) parts.push(`rowspan="${cell.rowspan}"`);
  const styles = [];
  if (cell.halign && cell.halign !== 'left') styles.push(`text-align:${cell.halign}`);
  if (cell.valign && cell.valign !== 'top') styles.push(`vertical-align:${cell.valign}`);
  if (styles.length) parts.push(`style="${styles.join(';')}"`);
  if (cell.header && !cell.style) parts.push('class="adoc-header-cell"');
  return parts.length ? ` ${parts.join(' ')}` : '';
}

function renderRow(row, tag) {
  return `<tr>${row
    .map((cell) => {
      const t = cell.header || tag === 'th' ? 'th' : 'td';
      return `<${t}${cellAttrs(cell)}>${styleCellHtml(cell.text, cell.style)}</${t}>`;
    })
    .join('')}</tr>`;
}

/**
 * Render a parsed AsciiDoc table to an HTML string (thead/tbody/tfoot).
 */
export function renderAsciiDocTableHtml(parsed) {
  const {
    title = '',
    attrs = {},
    columns = [],
    head = [],
    body = [],
    foot = [],
  } = parsed;

  const classes = ['adoc-table'];
  if (attrs.frame) classes.push(`frame-${attrs.frame}`);
  if (attrs.grid) classes.push(`grid-${attrs.grid}`);
  if (attrs.stripes) classes.push(`stripes-${attrs.stripes}`);
  else classes.push('stripes-hover');

  const widthStyle =
    attrs.width != null && attrs.width !== ''
      ? ` style="width:${/^\d+$/.test(String(attrs.width)) ? `${attrs.width}%` : attrs.width}"`
      : '';

  const colgroup = columns.length
    ? `<colgroup>${columns
        .map((c) => {
          const w = c.pcwidth != null ? c.pcwidth : null;
          return w != null ? `<col style="width:${w}%">` : '<col>';
        })
        .join('')}</colgroup>`
    : '';

  const caption = title ? `<caption>${escapeHtml(title)}</caption>` : '';
  const thead = head.length
    ? `<thead>${head.map((r) => renderRow(r, 'th')).join('')}</thead>`
    : '';
  const tbody = `<tbody>${body.map((r) => renderRow(r, 'td')).join('')}</tbody>`;
  const tfoot = foot.length
    ? `<tfoot>${foot.map((r) => renderRow(r, 'td')).join('')}</tfoot>`
    : '';

  return `<div class="adoc-table-wrap"><table class="${classes.join(' ')}"${widthStyle}>${caption}${colgroup}${thead}${tbody}${tfoot}</table></div>`;
}

/**
 * Convenience: parse source and return HTML.
 */
export function asciidocTableToHtml(source, elementAttrs = {}) {
  return renderAsciiDocTableHtml(parseAsciiDocTable(source, elementAttrs));
}
