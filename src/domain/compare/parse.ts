import type { Cents } from "../types.ts";
import type { ParseOptions, ParsedTheirFile, SkippedRow, TheirLine } from "./types.ts";

const MAX_BYTES = 1_000_000;
const MAX_ROWS = 2_000;
/** Raw rows read before giving up: the data limit plus room for a header and a few heading rows, so work stays bounded. */
const MAX_RAW_ROWS = MAX_ROWS + 50;
const MAX_COLUMNS = 200;
const MAX_ROWS_LABEL = "2,000";

const AMOUNT_HEADER = /\b(amount|value|balance|figure|total|cash|withheld|deducted|tax|distribution|attributed|difference)\b/i;
const LABEL_HEADER = /\b(label|description|line|item|component|name|holder|investor|unitholder)\b/i;
const REF_HEADER = /\b(ref|reference|code|key|box|field)\b/i;

export function parseAmount(text: string): Cents | null {
  let s = text.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (/[−-]\s*$/.test(s)) {
    negative = true;
    s = s.replace(/[−-]\s*$/, "").trim();
  }
  if (/^[−-]/.test(s)) {
    negative = true;
    s = s.replace(/^[−-]\s*/, "");
  }
  s = s.replace(/^(?:A\$|S\$|AUD|SGD|\$)\s*/i, "");
  s = s.replace(/\s+/g, "");
  if (!/^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(s)) return null;
  const numeric = s.replaceAll(",", "");
  const [whole = "0", fraction = ""] = numeric.split(".");
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const value = Number(cents);
  return negative && value !== 0 ? -value : value;
}

function parseDelimited(text: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      if (row.length > MAX_COLUMNS) throw new Error(`The file has too many columns. Upload up to ${MAX_COLUMNS} columns.`);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      if (row.length > MAX_COLUMNS) throw new Error(`The file has too many columns. Upload up to ${MAX_COLUMNS} columns.`);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
        if (rows.length > MAX_RAW_ROWS) throw new Error(`The file has too many rows. Upload up to ${MAX_ROWS_LABEL} rows.`);
      }
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  if (row.length > MAX_COLUMNS) throw new Error(`The file has too many columns. Upload up to ${MAX_COLUMNS} columns.`);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
    if (rows.length > MAX_RAW_ROWS) throw new Error(`The file has too many rows. Upload up to ${MAX_ROWS_LABEL} rows.`);
  }
  return rows;
}

function delimiterOf(text: string): "," | "\t" {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const tabs = (first.match(/\t/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

function headerIndex(rows: string[][]): number {
  const at = rows.findIndex((row) => row.some((cell) => AMOUNT_HEADER.test(cell)) && row.some((cell) => LABEL_HEADER.test(cell) || REF_HEADER.test(cell)));
  return at >= 0 ? at : 0;
}

function checkedColumn(index: number | null | undefined, width: number, name: string): number | null | undefined {
  if (index === null || index === undefined) return index;
  if (!Number.isInteger(index) || index < 0 || index >= width) throw new Error(`${name} is outside the ${width} detected columns.`);
  return index;
}

function detectColumns(rows: string[][], headerAt: number, options: ParseOptions): ParsedTheirFile["detected"] {
  const header = rows[headerAt] ?? [];
  checkedColumn(options.referenceColumn, header.length, "Reference column");
  checkedColumn(options.labelColumn, header.length, "Label column");
  checkedColumn(options.amountColumn, header.length, "Amount column");
  const content = rows.slice(headerAt + 1);
  const amount = options.amountColumn ?? header.findIndex((cell) => AMOUNT_HEADER.test(cell));
  let amountIndex = amount >= 0 ? amount : 0;
  if (options.amountColumn === undefined && amount < 0) {
    const scores = Array.from({ length: header.length }, () => 0);
    for (const row of content) {
      for (let index = 0; index < header.length; index++) {
        if (parseAmount(row[index] ?? "") !== null) scores[index]++;
      }
    }
    amountIndex = scores.reduce((best, score, index) => (score > scores[best]! ? index : best), 0);
  }

  const referenceHeader = header.findIndex((cell) => REF_HEADER.test(cell));
  const labelHeader = header.findIndex((cell, index) => index !== amountIndex && LABEL_HEADER.test(cell));
  const reference = options.referenceColumn !== undefined ? options.referenceColumn : referenceHeader >= 0 ? referenceHeader : null;
  const label = options.labelColumn ?? (labelHeader >= 0 ? labelHeader : header.findIndex((_cell, index) => index !== amountIndex && index !== reference));
  return { reference, label: label >= 0 ? label : 0, amount: amountIndex };
}

export function parseTheirFile(text: string, options: ParseOptions = {}): ParsedTheirFile {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_BYTES) throw new Error("The file is too large. Upload up to 1 MB.");
  const delimiter = delimiterOf(text);
  const rows = parseDelimited(text, delimiter);
  if (rows.length === 0) throw new Error("The file is empty.");

  const headerAt = headerIndex(rows);
  const columns = rows[headerAt]!.map((cell, index) => cell.trim() || `Column ${index + 1}`);
  if (columns.length > MAX_COLUMNS) throw new Error(`The file has too many columns. Upload up to ${MAX_COLUMNS} columns.`);
  const detected = detectColumns(rows, headerAt, options);
  const lines: TheirLine[] = [];
  const skipped: SkippedRow[] = [];

  if (rows.length - headerAt - 1 > MAX_ROWS) throw new Error(`The file has too many rows. Upload up to ${MAX_ROWS_LABEL} rows.`);
  for (let rowIndex = headerAt + 1; rowIndex < rows.length; rowIndex++) {
    const raw = rows[rowIndex]!;
    const amount = parseAmount(raw[detected.amount] ?? "");
    const label = (raw[detected.label] ?? "").trim();
    const reference = detected.reference === null ? "" : (raw[detected.reference] ?? "").trim();
    if (amount === null) {
      skipped.push({ index: rowIndex + 1, reason: "Amount is not a number", raw });
      continue;
    }
    if (!label && !reference) {
      skipped.push({ index: rowIndex + 1, reason: "No label or reference", raw });
      continue;
    }
    lines.push({ index: rowIndex + 1, reference: reference || undefined, label: label || reference, amount, raw });
  }

  return { delimiter, columns, detected, lines, skipped, rowCount: rows.length - headerAt - 1 };
}
