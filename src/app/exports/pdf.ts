/// <reference types="pdfkit" />
// PDF renderer for DocModel (the same model the inline document view renders). Pure apart from the pdfkit instance it is given: pdfkit is
// injected (`deps.PDFDocument`) so tests can pass the Node build while the app passes the lazily loaded standalone browser build.
//
// Layout: A4 portrait, 48 pt margins, built-in Helvetica / Helvetica-Bold only. Text is wrapped and positioned here (every pdfkit call
// uses absolute coordinates with lineBreak:false), which keeps page breaks, repeated table headers and column widths under our control.
// Standard fonts only encode WinAnsi, so every string goes through toWinAnsiSafe before it is measured or drawn.
import type { DocBlock, DocModel } from "../../domain/types.ts";

export type PdfDocumentCtor = new (options?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;

export interface PdfDeps {
  PDFDocument: PdfDocumentCtor;
  /** Creation date written to the PDF info dictionary (default: the current time). */
  now?: Date;
}

export const PDF_PRODUCER = "Property Fund Tax Compliance demo";
export const PDF_FOOTER_NOTE = "Demonstration document \u2014 not tax advice";

// ---------------------------------------------------------------------------------------------------- WinAnsi safety

// The 27 characters above U+00FF that WinAnsi (cp1252) can show; pdfkit maps exactly these to single bytes.
const WIN_ANSI_EXTRAS = new Set<number>([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c,
  0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

const REPLACEMENTS = new Map<number, string>([
  // minus and hyphen look-alikes (the money formatter writes U+2212)
  [0x2212, "-"], [0x2010, "-"], [0x2011, "-"], [0x2012, "-"], [0x2043, "-"], [0xfe63, "-"], [0xff0d, "-"],
  [0x2015, "\u2014"],
  // primes and quote look-alikes
  [0x2032, "'"], [0x201b, "'"], [0x2035, "'"], [0x2033, '"'], [0x201f, '"'], [0x2036, '"'],
  [0x2024, "."], [0x2027, "\u00b7"], [0x2219, "\u00b7"], [0x22c5, "\u00b7"],
  [0x2023, "\u2022"], [0x25aa, "\u2022"], [0x25cf, "\u2022"], [0x25e6, "\u2022"],
  // arrows and relations seen in the reference data
  [0x2192, "->"], [0x2190, "<-"], [0x2194, "<->"], [0x21d2, "=>"],
  [0x2264, "<="], [0x2265, ">="], [0x2260, "!="], [0x2248, "~"],
  // letters without a canonical decomposition
  [0x0141, "L"], [0x0142, "l"], [0x0110, "D"], [0x0111, "d"], [0x0126, "H"], [0x0127, "h"], [0x0131, "i"],
]);

const ASCII_ONLY = /^[\x20-\x7e\n]*$/;
const LINE_BREAKS = /\r\n|[\r\u0085\u2028\u2029]/g;
const SPACE_SEPARATOR = /^\p{Zs}$/u;
const MARK_OR_FORMAT = /^[\p{M}\p{Cf}]$/u;
const LETTER_WITH_MARKS = /^[A-Za-z]\p{M}+$/u;

/**
 * Makes text safe for the standard PDF fonts, which only encode WinAnsi (cp1252); anything else would draw as junk and mis-measure.
 * Keeps printable ASCII, "\n" and everything WinAnsi has (Latin-1, curly quotes, en/em dashes, bullet, ellipsis, euro...). Maps U+2212
 * and other minus look-alikes to "-", every Unicode space (NBSP, thin, narrow no-break...) to " ", arrows and comparisons to ASCII
 * ("->", "<=", ...), and letters with accents outside Latin-1 to their base letter. Controls, combining marks and invisible format
 * characters are dropped; every other code point becomes one "?". Never throws, and applying it twice changes nothing.
 */
export function toWinAnsiSafe(text: string): string {
  const input = typeof text === "string" ? text : text == null ? "" : String(text);
  if (ASCII_ONLY.test(input)) return input;
  let out = "";
  for (const ch of input.normalize("NFC").replace(LINE_BREAKS, "\n")) {
    const cp = ch.codePointAt(0) as number;
    if ((cp >= 0x20 && cp <= 0x7e) || cp === 0x0a) out += ch;
    else if (cp === 0x09) out += " ";
    else if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || cp === 0xad) continue;
    else if (cp === 0xa0) out += " ";
    else if (cp <= 0xff || WIN_ANSI_EXTRAS.has(cp)) out += ch;
    else out += replacement(ch, cp);
  }
  return out;
}

function replacement(ch: string, cp: number): string {
  const mapped = REPLACEMENTS.get(cp);
  if (mapped !== undefined) return mapped;
  if (SPACE_SEPARATOR.test(ch)) return " ";
  if (MARK_OR_FORMAT.test(ch)) return "";
  const decomposed = ch.normalize("NFD");
  return LETTER_WITH_MARKS.test(decomposed) ? decomposed[0] : "?";
}

const clean = (value: unknown): string => toWinAnsiSafe(value == null ? "" : typeof value === "string" ? value : String(value));

// ---------------------------------------------------------------------------------------------------- column widths

const MIN_COLUMN = 28;

/**
 * Table column widths (points) that add up to `total`. `natural` is a column's widest unwrapped line, `min` its longest word, `pad` the
 * horizontal padding of a cell. Columns never get narrower than their longest word when there is room for it (capped at 40% of the
 * table so one long token cannot starve the others). When everything fits, the spare width is shared in proportion to the natural
 * widths; otherwise short columns (dates, amounts) keep their natural width and only the wide ones shrink to a common cap.
 */
export function fitColumnWidths(cols: ReadonlyArray<{ natural: number; min: number }>, total: number, pad: number): number[] {
  const n = cols.length;
  if (n === 0) return [];
  if (!(total > 0)) return cols.map(() => 0);
  const positive = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const floor = Math.min(MIN_COLUMN, total / n);
  const lo = cols.map((c) => Math.min(total, Math.max(floor, Math.min(positive(c.min), total * 0.4) + pad)));
  const hi = cols.map((c, i) => Math.max(lo[i], Math.min(positive(c.natural) + pad, total)));
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const sumHi = sum(hi);
  if (sumHi <= total) return hi.map((w) => (w * total) / sumHi);
  const sumLo = sum(lo);
  if (sumLo >= total) return lo.map((w) => (w * total) / sumLo);
  const at = (cap: number) => lo.map((w, i) => Math.min(hi[i], Math.max(w, cap)));
  let low = 0;
  let high = Math.max(...hi);
  for (let step = 0; step < 60; step++) {
    const mid = (low + high) / 2;
    if (sum(at(mid)) > total) high = mid;
    else low = mid;
  }
  const widths = at(low);
  const used = sum(widths);
  return widths.map((w) => (w * total) / used);
}

// ---------------------------------------------------------------------------------------------------- layout primitives

type Face = "regular" | "bold";
const FONT: Record<Face, string> = { regular: "Helvetica", bold: "Helvetica-Bold" };
const GLYPH_BOX = 0.925; // Helvetica ascender + descender (718 + 207) per 1000 em: the height of a text line without line gap

const INK = "#161616";
const MUTED = "#5b5b5b";
const PRIMARY = "#6a34ab";
const ACCENT_DARK = "#552f86";
const PANEL = "#f0ecfa";
const PANEL_SOFT = "#f7f5fc";
const RULE_SOFT = "#e0dbed";
const RULE = "#cfc4e4";

const EPS = 0.01;
const MARGIN = 48;

interface Rule { color: string; width: number }

/** One cell of a row: wrapped lines drawn inside the box [x, x + w). */
interface Box {
  x: number;
  w: number;
  lines: string[];
  face: Face;
  size: number;
  color: string;
  align: "left" | "right";
}

/** A horizontal band of the page content: cells side by side, an optional fill, bar and rules. Rows are the unit of page breaking. */
interface Row {
  boxes: Box[];
  lineH: number;
  padTop: number;
  padBottom: number;
  fill?: string;
  bar?: Rule;
  ruleTop?: Rule;
  ruleBottom?: Rule;
  /** Moves to the next page instead of splitting when it fits on a fresh page. */
  keep: boolean;
}

interface Ctx {
  pdf: PDFKit.PDFDocument;
  left: number;
  width: number;
  top: number;
  bottom: number;
  y: number;
  /** Space the last block asks for below itself; the next block uses the larger of this and its own "before". */
  after: number;
  /** Table header drawn again at the top of every page the table runs onto. */
  repeat: Row | null;
  widths: Map<string, number>;
}

function textWidth(ctx: Ctx, text: string, face: Face, size: number): number {
  const key = `${face}${size}|${text}`;
  const cached = ctx.widths.get(key);
  if (cached !== undefined) return cached;
  const width = ctx.pdf.font(FONT[face]).fontSize(size).widthOfString(text);
  if (text.length <= 80) ctx.widths.set(key, width);
  return width;
}

/** Longest prefix length (at least 1) of `s` that fits in `maxW`; gallops then bisects so very long tokens stay cheap. */
function fitPrefix(s: string, maxW: number, measure: (t: string) => number): number {
  let good = 1;
  let bad = s.length + 1;
  let k = Math.min(8, s.length);
  while (k <= s.length) {
    if (measure(s.slice(0, k)) <= maxW) {
      good = k;
      if (k === s.length) return good;
      k = Math.min(k * 2, s.length);
    } else {
      bad = k;
      break;
    }
  }
  while (bad - good > 1) {
    const mid = (good + bad) >> 1;
    if (measure(s.slice(0, mid)) <= maxW) good = mid;
    else bad = mid;
  }
  return good;
}

const ALNUM = /[A-Za-z0-9]/;

/** Where to cut an over-long token: after a "-" or "/" between alphanumerics when one is available in the second half, else at `fit`. */
function cutPoint(s: string, fit: number): number {
  for (let p = fit; p >= Math.max(4, Math.ceil(fit * 0.4)); p--) {
    if ((s[p - 1] === "-" || s[p - 1] === "/") && ALNUM.test(s[p - 2] ?? "") && ALNUM.test(s[p] ?? "")) return p;
  }
  return fit;
}

function wrapText(text: string, maxW: number, measure: (t: string) => number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ").filter((w) => w !== "");
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (line !== "" && measure(`${line} ${word}`) <= maxW) {
        line = `${line} ${word}`;
        continue;
      }
      if (line !== "") out.push(line);
      let rest = word;
      while (measure(rest) > maxW) {
        const cut = cutPoint(rest, fitPrefix(rest, maxW, measure));
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

function makeBox(ctx: Ctx, text: string, x: number, w: number, face: Face, size: number, color: string, align: "left" | "right" = "left"): Box {
  return { x, w, lines: wrapText(text, w, (s) => textWidth(ctx, s, face, size)), face, size, color, align };
}

interface RowOptions {
  face?: Face;
  size: number;
  color: string;
  lineH?: number;
  indentLeft?: number;
  indentRight?: number;
  padTop?: number;
  padBottom?: number;
  fill?: string;
  bar?: Rule;
  ruleTop?: Rule;
  ruleBottom?: Rule;
  keep?: boolean;
}

function singleRow(ctx: Ctx, text: string, o: RowOptions): Row {
  const indentLeft = o.indentLeft ?? 0;
  const w = Math.max(ctx.width - indentLeft - (o.indentRight ?? 0), 20);
  return {
    boxes: [makeBox(ctx, text, ctx.left + indentLeft, w, o.face ?? "regular", o.size, o.color)],
    lineH: o.lineH ?? o.size * 1.25,
    padTop: o.padTop ?? 0,
    padBottom: o.padBottom ?? 0,
    fill: o.fill,
    bar: o.bar,
    ruleTop: o.ruleTop,
    ruleBottom: o.ruleBottom,
    keep: o.keep ?? true,
  };
}

const lineCount = (row: Row) => Math.max(1, ...row.boxes.map((b) => b.lines.length));
const rowHeight = (row: Row, lines = lineCount(row)) => row.padTop + lines * row.lineH + row.padBottom;

function hline(ctx: Ctx, y: number, rule: Rule): void {
  ctx.pdf.moveTo(ctx.left, y).lineTo(ctx.left + ctx.width, y).lineWidth(rule.width).strokeColor(rule.color).stroke();
}

function drawText(ctx: Ctx, text: string, x: number, y: number, face: Face, size: number, color: string): void {
  ctx.pdf.font(FONT[face]).fontSize(size).fillColor(color).text(text, x, y, { lineBreak: false });
}

/** Draws lines [from, to) of a row at the cursor and moves the cursor down. */
function drawFragment(ctx: Ctx, row: Row, from: number, to: number, first: boolean, last: boolean): void {
  const h = rowHeight(row, to - from);
  if (row.fill) ctx.pdf.rect(ctx.left, ctx.y, ctx.width, h).fill(row.fill);
  if (row.bar) ctx.pdf.rect(ctx.left, ctx.y, row.bar.width, h).fill(row.bar.color);
  if (row.ruleTop && first) hline(ctx, ctx.y, row.ruleTop);
  if (row.ruleBottom && last) hline(ctx, ctx.y + h, row.ruleBottom);
  for (const box of row.boxes) {
    for (let i = from; i < to && i < box.lines.length; i++) {
      const line = box.lines[i];
      if (line === "") continue;
      const top = ctx.y + row.padTop + (i - from) * row.lineH + (row.lineH - GLYPH_BOX * box.size) / 2;
      const x = box.align === "right" ? box.x + box.w - textWidth(ctx, line, box.face, box.size) : box.x;
      drawText(ctx, line, x, top, box.face, box.size, box.color);
    }
  }
  ctx.y += h;
}

const freshY = (ctx: Ctx) => ctx.top + (ctx.repeat ? rowHeight(ctx.repeat) : 0);
const atTop = (ctx: Ctx) => ctx.y <= freshY(ctx) + EPS;

function newPage(ctx: Ctx): void {
  ctx.pdf.addPage();
  ctx.y = ctx.top;
  ctx.after = 0;
  if (ctx.repeat) drawFragment(ctx, ctx.repeat, 0, lineCount(ctx.repeat), true, true);
}

/** Starts a block: leaves the larger of the previous block's "after" and this block's "before", except at the top of a page. */
function begin(ctx: Ctx, before: number): void {
  if (!atTop(ctx)) ctx.y += Math.max(ctx.after, before);
  ctx.after = 0;
}

/** Moves to a new page unless `h` more points fit on this one. */
function ensure(ctx: Ctx, h: number): void {
  if (ctx.y + h > ctx.bottom + EPS && !atTop(ctx)) newPage(ctx);
}

/**
 * Places a row, breaking pages as needed. A row that fits on a fresh page is kept together when `keep` is set; a taller one (or a long
 * paragraph) is split by lines, leaving at least two lines on each side. Every pass either returns, starts a fresh page once, or draws
 * at least one line, so it always terminates.
 */
function placeRow(ctx: Ctx, row: Row): void {
  const total = lineCount(row);
  let from = 0;
  for (;;) {
    const remaining = total - from;
    const room = ctx.bottom - ctx.y;
    if (rowHeight(row, remaining) <= room + EPS) {
      drawFragment(ctx, row, from, total, from === 0, true);
      return;
    }
    const fresh = atTop(ctx);
    if (from === 0 && row.keep && !fresh && rowHeight(row, remaining) <= ctx.bottom - freshY(ctx) + EPS) {
      newPage(ctx);
      continue;
    }
    let fit = Math.floor((room - row.padTop - row.padBottom + EPS) / row.lineH);
    if (total >= 4) {
      if (remaining - fit < 2) fit = remaining - 2;
      if (fit < 2) fit = 0;
    }
    if (fit < 1) {
      if (!fresh) {
        newPage(ctx);
        continue;
      }
      fit = 1;
    }
    drawFragment(ctx, row, from, from + fit, from === 0, false);
    from += fit;
    newPage(ctx);
  }
}

// ---------------------------------------------------------------------------------------------------- blocks

type TableData = {
  title: string;
  columns: Array<{ label: string; align: "left" | "right" }>;
  rows: string[][];
  total: string[] | null;
};
type KvData = { title: string; rows: Array<{ label: string; value: string; emphasis: boolean }> };

function titleBlock(ctx: Ctx, title: string, subtitle: string): void {
  ctx.pdf.rect(ctx.left, ctx.y, 40, 3.5).fill(PRIMARY);
  ctx.y += 3.5 + 9;
  placeRow(ctx, singleRow(ctx, title, { face: "bold", size: 20, color: INK, lineH: 24 }));
  if (subtitle !== "") placeRow(ctx, singleRow(ctx, subtitle, { size: 11.5, color: MUTED, lineH: 15, padTop: 2 }));
  ctx.after = 12;
}

function metaGrid(ctx: Ctx, meta: Array<{ label: string; value: string }>): void {
  if (meta.length === 0) return;
  begin(ctx, 12);
  const size = 9;
  const half = ctx.width / 2;
  const padX = 9;
  const inner = half - 2 * padX;
  const labelWidth = [0, 0];
  meta.forEach((m, i) => {
    labelWidth[i % 2] = Math.max(labelWidth[i % 2], textWidth(ctx, `${m.label}:`, "bold", size));
  });
  const labelBox = labelWidth.map((w) => Math.min(w + 6, inner * 0.45));
  const rowCount = Math.ceil(meta.length / 2);
  for (let r = 0; r < rowCount; r++) {
    const boxes: Box[] = [];
    for (const i of [2 * r, 2 * r + 1]) {
      const item = meta[i];
      if (!item) continue;
      const col = i % 2;
      const x = ctx.left + col * half + padX;
      boxes.push(makeBox(ctx, `${item.label}:`, x, labelBox[col] - 4, "bold", size, MUTED));
      boxes.push(makeBox(ctx, item.value, x + labelBox[col], inner - labelBox[col], "regular", size, INK));
    }
    placeRow(ctx, {
      boxes,
      lineH: 11.5,
      padTop: r === 0 ? 7 : 2.5,
      padBottom: r === rowCount - 1 ? 7 : 2.5,
      fill: PANEL_SOFT,
      bar: { color: PRIMARY, width: 2.5 },
      keep: true,
    });
  }
  ctx.after = 14;
}

/**
 * A block ready to be drawn. `before` is the gap above it, `lead` the height that must fit under that gap together with its start (so a
 * heading is never left alone at the bottom of a page), and `draw` places it.
 */
interface Plan {
  before: number;
  lead: number;
  draw: () => void;
}

function drawPlan(ctx: Ctx, plan: Plan): void {
  begin(ctx, plan.before);
  ensure(ctx, plan.lead);
  plan.draw();
}

/** Height a row needs at its start: all of it when it is kept whole and fits a fresh page (below `reserved` points), else its first two lines. */
function startHeight(ctx: Ctx, row: Row, reserved = 0): number {
  const whole = rowHeight(row);
  return row.keep && whole <= ctx.bottom - ctx.top - reserved ? whole : rowHeight(row, Math.min(lineCount(row), 2));
}

/** A heading asks for room for whatever follows it too (down a chain of headings), so it always has the start of its content under it. */
function headingPlan(ctx: Ctx, text: string, level: 2 | 3, next: Plan | undefined): Plan {
  const small = level === 3;
  const size = small ? 10.5 : 13;
  const row = singleRow(ctx, text, {
    face: "bold",
    size,
    color: small ? INK : ACCENT_DARK,
    padBottom: small ? 0 : 3,
    ruleBottom: small ? undefined : { color: RULE, width: 1 },
  });
  const after = small ? 4 : 6;
  return {
    before: small ? 12 : 18,
    lead: rowHeight(row) + (next ? Math.max(after, next.before) + next.lead : 0),
    draw: () => {
      placeRow(ctx, row);
      ctx.after = after;
    },
  };
}

function paragraphPlan(ctx: Ctx, text: string, tone: "normal" | "muted" | "note"): Plan {
  const note = tone === "note";
  const row = singleRow(ctx, text, {
    size: tone === "muted" ? 9 : note ? 9.5 : 10,
    color: tone === "muted" ? MUTED : INK,
    lineH: tone === "muted" ? 12 : 13,
    indentLeft: note ? 12 : 0,
    indentRight: note ? 8 : 0,
    padTop: note ? 6 : 0,
    padBottom: note ? 6 : 0,
    fill: note ? PANEL : undefined,
    bar: note ? { color: PRIMARY, width: 3 } : undefined,
  });
  row.keep = lineCount(row) <= 4;
  return {
    before: 6,
    lead: startHeight(ctx, row),
    draw: () => {
      placeRow(ctx, row);
      ctx.after = 6;
    },
  };
}

function kvPlan(ctx: Ctx, kv: KvData): Plan {
  const size = 10;
  const lineH = 12.75;
  const padX = 4;
  const padY = 3.5;
  const inner = ctx.width - 2 * padX;
  let natural = 30;
  for (const r of kv.rows) {
    for (const line of r.value.split("\n")) natural = Math.max(natural, textWidth(ctx, line, r.emphasis ? "bold" : "regular", size));
  }
  const valueW = Math.min(natural, inner * 0.55);
  const labelW = inner - valueW - 14;
  const title = kv.title === "" ? null : singleRow(ctx, kv.title, { face: "bold", size: 10.5, color: INK, padBottom: 3 });
  const rows = kv.rows.map((r, i): Row => {
    const face: Face = r.emphasis ? "bold" : "regular";
    const nextEmphasis = kv.rows[i + 1]?.emphasis === true;
    return {
      boxes: [
        makeBox(ctx, r.label, ctx.left + padX, labelW, face, size, INK),
        makeBox(ctx, r.value, ctx.left + padX + labelW + 14, valueW, face, size, INK, "right"),
      ],
      lineH,
      padTop: padY,
      padBottom: padY,
      ruleTop: r.emphasis ? { color: PRIMARY, width: 0.9 } : undefined,
      ruleBottom: nextEmphasis ? undefined : { color: RULE_SOFT, width: 0.5 },
      keep: true,
    };
  });
  const heights = rows.map((r) => rowHeight(r));
  const lead = (title ? rowHeight(title) : 0) + (rows.length <= 8 ? heights.reduce((s, h) => s + h, 0) : (heights[0] ?? 0) + (heights[1] ?? 0));
  return {
    before: 8,
    lead,
    draw: () => {
      if (title) placeRow(ctx, title);
      for (const row of rows) placeRow(ctx, row);
      ctx.after = 10;
    },
  };
}

function tablePlan(ctx: Ctx, t: TableData): Plan {
  const n = t.columns.length;
  const title = t.title === "" ? null : singleRow(ctx, t.title, { face: "bold", size: 10.5, color: INK, padBottom: 4 });
  const titleH = title ? rowHeight(title) : 0;
  if (n === 0) {
    return {
      before: 8,
      lead: titleH,
      draw: () => {
        if (title) placeRow(ctx, title);
        ctx.after = 10;
      },
    };
  }
  const size = n <= 4 ? 9.5 : n <= 6 ? 9 : n <= 9 ? 8 : 7.5;
  const padX = n >= 10 ? 3 : 4;
  const padY = n >= 7 ? 2.5 : 3.5;
  const natural: number[] = new Array(n).fill(0);
  const longest: number[] = new Array(n).fill(0);
  const measure = (text: string, face: Face, col: number) => {
    for (const line of text.split("\n")) {
      natural[col] = Math.max(natural[col], textWidth(ctx, line, face, size));
      for (const word of line.split(" ")) if (word !== "") longest[col] = Math.max(longest[col], textWidth(ctx, word, face, size));
    }
  };
  t.columns.forEach((c, i) => measure(c.label, "bold", i));
  for (const r of t.rows) r.forEach((cell, i) => measure(cell, "regular", i));
  t.total?.forEach((cell, i) => measure(cell, "bold", i));
  const widths = fitColumnWidths(natural.map((v, i) => ({ natural: v, min: longest[i] })), ctx.width, 2 * padX);

  const build = (cells: string[], face: Face, extra: Partial<Row>): Row => {
    let x = ctx.left;
    const boxes = cells.map((text, i) => {
      const box = makeBox(ctx, text, x + padX, Math.max(widths[i] - 2 * padX, 4), face, size, INK, t.columns[i].align);
      x += widths[i];
      return box;
    });
    return { boxes, lineH: size * 1.25, padTop: padY, padBottom: padY, keep: true, ...extra };
  };
  const header = build(t.columns.map((c) => c.label), "bold", { fill: PANEL, ruleBottom: { color: RULE, width: 0.75 } });
  const body = t.rows.map((cells) => build(cells, "regular", { ruleBottom: { color: RULE_SOFT, width: 0.5 } }));
  const total = t.total
    ? build(t.total, "bold", { fill: PANEL_SOFT, ruleTop: { color: PRIMARY, width: 0.9 }, ruleBottom: { color: RULE, width: 0.75 } })
    : null;

  // The title, the header and the start of the first row (with the total when that row is also the last) stay together.
  const headerH = rowHeight(header);
  const first = body[0] ?? total;
  let firstH = first ? startHeight(ctx, first, headerH) : 0;
  if (total && body.length === 1 && firstH === rowHeight(body[0])) firstH += rowHeight(total);
  return {
    before: 8,
    lead: titleH + headerH + firstH,
    draw: () => {
      if (title) placeRow(ctx, title);
      placeRow(ctx, header);
      ctx.repeat = header;
      body.forEach((row, i) => {
        if (total && i === body.length - 1) ensure(ctx, rowHeight(row) + rowHeight(total));
        placeRow(ctx, row);
      });
      if (total) placeRow(ctx, total);
      ctx.repeat = null;
      ctx.after = 10;
    },
  };
}

function listPlan(ctx: Ctx, items: string[]): Plan {
  const size = 10;
  const rows = items.map((item): Row => ({
    boxes: [
      makeBox(ctx, "\u2022", ctx.left + 6, 10, "regular", size, PRIMARY),
      makeBox(ctx, item, ctx.left + 18, ctx.width - 18, "regular", size, INK),
    ],
    lineH: 12.75,
    padTop: 1.5,
    padBottom: 1.5,
    keep: true,
  }));
  // Two items at least, so a single bullet is not left behind.
  const firstH = rows[0] ? startHeight(ctx, rows[0]) : 0;
  const secondH = rows[1] && firstH === rowHeight(rows[0]) ? startHeight(ctx, rows[1]) : 0;
  return {
    before: 6,
    lead: firstH + secondH,
    draw: () => {
      for (const row of rows) placeRow(ctx, row);
      ctx.after = 8;
    },
  };
}

/** Footnotes stay together when they are short; a long list only needs room for its start. */
function footnotePlan(ctx: Ctx, notes: string[]): Plan | undefined {
  if (notes.length === 0) return undefined;
  const rows = notes.map((note, i) => singleRow(ctx, note, {
    size: 8,
    color: MUTED,
    lineH: 10.5,
    padTop: i === 0 ? 6 : 1.5,
    padBottom: 1.5,
    ruleTop: i === 0 ? { color: RULE, width: 0.75 } : undefined,
  }));
  return {
    before: 16,
    lead: Math.min(rows.reduce((s, r) => s + rowHeight(r), 0), 150),
    draw: () => {
      for (const row of rows) placeRow(ctx, row);
    },
  };
}

// ---------------------------------------------------------------------------------------------------- model cleaning

type CleanBlock =
  | { kind: "heading"; text: string; level: 2 | 3 }
  | { kind: "paragraph"; text: string; tone: "normal" | "muted" | "note" }
  | ({ kind: "kv" } & KvData)
  | ({ kind: "table" } & TableData)
  | { kind: "list"; items: string[] };

interface CleanDoc {
  title: string;
  subtitle: string;
  meta: Array<{ label: string; value: string }>;
  blocks: CleanBlock[];
  footnotes: string[];
}

const nonBlank = (s: string) => s.trim() !== "";

/** Copies the model with every string made WinAnsi-safe and every missing field defaulted, so rendering never trips on partial data. */
function cleanModel(doc: DocModel): CleanDoc {
  const blocks: CleanBlock[] = [];
  for (const b of (doc.blocks ?? []) as DocBlock[]) {
    switch (b?.kind) {
      case "heading":
        if (nonBlank(clean(b.text))) blocks.push({ kind: "heading", text: clean(b.text), level: b.level === 3 ? 3 : 2 });
        break;
      case "paragraph":
        if (nonBlank(clean(b.text))) blocks.push({ kind: "paragraph", text: clean(b.text), tone: b.tone === "muted" || b.tone === "note" ? b.tone : "normal" });
        break;
      case "kv": {
        const title = clean(b.title);
        const rows = (b.rows ?? []).map((r) => ({ label: clean(r?.label), value: clean(r?.value), emphasis: r?.emphasis === true }));
        if (title !== "" || rows.length > 0) blocks.push({ kind: "kv", title, rows });
        break;
      }
      case "table": {
        const columns = (b.columns ?? []).map((c) => ({ key: String(c?.key ?? ""), label: clean(c?.label), align: c?.align === "right" ? ("right" as const) : ("left" as const) }));
        const cells = (record: Record<string, string> | undefined) => columns.map((c) => clean(record?.[c.key]));
        const title = clean(b.title);
        if (columns.length > 0 || title !== "") {
          blocks.push({
            kind: "table",
            title,
            columns,
            rows: (b.rows ?? []).map(cells),
            total: b.totalRow ? cells(b.totalRow) : null,
          });
        }
        break;
      }
      case "list": {
        const items = (b.items ?? []).map(clean).filter(nonBlank);
        if (items.length > 0) blocks.push({ kind: "list", items });
        break;
      }
    }
  }
  return {
    title: clean(doc.title),
    subtitle: clean(doc.subtitle),
    meta: (doc.meta ?? []).map((m) => ({ label: clean(m?.label), value: clean(m?.value) })),
    blocks,
    footnotes: (doc.footnotes ?? []).map(clean).filter(nonBlank),
  };
}

// ---------------------------------------------------------------------------------------------------- document

function planBlock(ctx: Ctx, block: CleanBlock, next: Plan | undefined): Plan {
  switch (block.kind) {
    case "heading": return headingPlan(ctx, block.text, block.level, next);
    case "paragraph": return paragraphPlan(ctx, block.text, block.tone);
    case "kv": return kvPlan(ctx, block);
    case "table": return tablePlan(ctx, block);
    case "list": return listPlan(ctx, block.items);
  }
}

function drawDocument(ctx: Ctx, m: CleanDoc): void {
  titleBlock(ctx, m.title, m.subtitle);
  metaGrid(ctx, m.meta);
  // Planned back to front so each heading knows what follows it.
  const notes = footnotePlan(ctx, m.footnotes);
  const plans: Plan[] = [];
  let next = notes;
  for (let i = m.blocks.length - 1; i >= 0; i--) {
    next = planBlock(ctx, m.blocks[i], next);
    plans.push(next);
  }
  plans.reverse();
  if (notes) plans.push(notes);
  for (const plan of plans) drawPlan(ctx, plan);
}

function truncateToWidth(ctx: Ctx, text: string, maxW: number, size: number): string {
  const measure = (s: string) => textWidth(ctx, s, "regular", size);
  if (measure(text) <= maxW) return text;
  const keep = fitPrefix(text, maxW - measure("\u2026"), measure);
  return `${text.slice(0, keep).trimEnd()}\u2026`;
}

/** Footer on every page ("Page n of m" needs the final count, hence buffered pages) and a small running title on pages 2 onwards. */
function decoratePages(ctx: Ctx, m: CleanDoc): void {
  const { start, count } = ctx.pdf.bufferedPageRange();
  const footerTop = ctx.bottom + 12;
  const running = [m.title, m.subtitle].filter(nonBlank).join("  \u00b7  ");
  for (let i = 0; i < count; i++) {
    ctx.pdf.switchToPage(start + i);
    hline(ctx, ctx.bottom + 6, { color: RULE, width: 0.5 });
    drawText(ctx, PDF_FOOTER_NOTE, ctx.left, footerTop, "regular", 8, MUTED);
    const label = `Page ${i + 1} of ${count}`;
    drawText(ctx, label, ctx.left + ctx.width - textWidth(ctx, label, "regular", 8), footerTop, "regular", 8, MUTED);
    if (i > 0 && running !== "") {
      drawText(ctx, truncateToWidth(ctx, running, ctx.width, 8), ctx.left, 26, "regular", 8, MUTED);
      hline(ctx, 40, { color: RULE_SOFT, width: 0.5 });
    }
  }
}

const infoText = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim();

function concat(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let length = 0;
  for (const c of chunks) length += c.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Renders a DocModel to PDF bytes: title block, meta grid, then each block in order, footnotes, and a footer on every page. Document
 * info carries the title, subject (the subtitle, usually the fund name), the producer and `deps.now` as the creation date, so the same
 * model and date always give the same bytes.
 */
export function renderPdf(doc: DocModel, deps: PdfDeps): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    try {
      const model = cleanModel(doc);
      const pdf = new deps.PDFDocument({
        size: "A4",
        layout: "portrait",
        margin: MARGIN,
        bufferPages: true,
        displayTitle: true,
        lang: "en",
        info: {
          Title: infoText(String(doc.title ?? "")),
          Subject: infoText(String(doc.subtitle ?? "")) || PDF_PRODUCER,
          Producer: PDF_PRODUCER,
          Creator: PDF_PRODUCER,
          CreationDate: deps.now ?? new Date(),
        },
      });
      const chunks: Uint8Array[] = [];
      pdf.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      pdf.on("end", () => resolve(concat(chunks)));
      pdf.on("error", reject);

      const ctx: Ctx = {
        pdf,
        left: MARGIN,
        width: pdf.page.width - 2 * MARGIN,
        top: MARGIN,
        bottom: pdf.page.height - MARGIN,
        y: MARGIN,
        after: 0,
        repeat: null,
        widths: new Map(),
      };
      drawDocument(ctx, model);
      decoratePages(ctx, model);
      pdf.end();
    } catch (error) {
      reject(error);
    }
  });
}
