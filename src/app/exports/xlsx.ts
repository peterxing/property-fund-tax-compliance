// Minimal OOXML (.xlsx) writer. Pure: it returns bytes and never touches the DOM, so it runs under Node tests as well as in the browser.
// Parts: [Content_Types].xml, _rels/.rels, xl/workbook.xml, xl/_rels/workbook.xml.rels, xl/styles.xml and one xl/worksheets/sheetN.xml
// per sheet, packed by the store-only ZIP writer in zip.ts. Text is written as inline strings, numbers as numbers.
import type { WorkbookModel } from "../../domain/types.ts";
import { guardFormula } from "./cells.ts";
import { zipStore } from "./zip.ts";

type SheetModel = WorkbookModel["sheets"][number];

export const XLSX_LIMITS = { maxRows: 1_048_576, maxColumns: 16_384, maxCellChars: 32_767, maxSheetNameChars: 31 } as const;

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Style ids = positions in <cellXfs> of styles.xml below.
const STYLE_HEADER = 1;
const STYLE_NUMBER = 2;

const STYLES_XML = `${XML_DECL}<styleSheet xmlns="${NS_MAIN}">` +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF0ECFA"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FFB8B4C6"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/>' +
  '<tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';

// ---------------------------------------------------------------------------------------------------- text and XML safety

/** Removes what XML 1.0 cannot carry: C0 controls other than TAB/LF/CR, U+FFFE/U+FFFF and unpaired surrogates. */
export function stripIllegalXml(s: string): string {
  if (!/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD]/.test(s)) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { out += s[i] + s[i + 1]; i++; }
    } else if (c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd)) {
      out += s[i];
    }
  }
  return out;
}

// SpreadsheetML reads "_xHHHH_" as an escaped character. Every underscore that could start such a sequence is written as "_x005F_"
// (an escaped underscore), which keeps the text exactly as given even when look-alikes touch each other ("_x005F_x0041_").
const protectEscapes = (s: string) => s.replace(/_(?=[xX][0-9A-Fa-f]{4}_)/g, "_x005F_");

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#13;");
}
function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/\t/g, "&#9;").replace(/\n/g, "&#10;");
}
const xmlAttr = (s: string) => escapeAttr(stripIllegalXml(s));

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// ---------------------------------------------------------------------------------------------------- sheet names

function cleanSheetName(raw: string): string {
  let t = stripIllegalXml(raw)
    .replace(/[\\/]/g, "-")
    .replace(/[[\]:*?]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .trim();
  if (t.length > XLSX_LIMITS.maxSheetNameChars) t = truncate(t, XLSX_LIMITS.maxSheetNameChars);
  return t;
}

/** Cuts to `max` UTF-16 units without splitting a surrogate pair or leaving a trailing space or apostrophe. */
function truncate(s: string, max: number): string {
  let t = s.slice(0, max);
  const last = t.charCodeAt(t.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) t = t.slice(0, -1);
  return t.replace(/[\s']+$/, "");
}

/**
 * Excel sheet names: 1-31 characters, none of [ ] : * ? / \, not starting or ending with an apostrophe, not "History" (reserved),
 * unique ignoring case. Forbidden characters are dropped ("/" and "\" become "-"), blanks become "Sheet<n>", duplicates get " (2)".
 */
export function sanitizeSheetNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((raw, i) => {
    let base = cleanSheetName(typeof raw === "string" ? raw : String(raw ?? ""));
    if (base === "") base = `Sheet${i + 1}`;
    if (base.toLowerCase() === "history") base += "_";
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      name = truncate(base, XLSX_LIMITS.maxSheetNameChars - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

// ---------------------------------------------------------------------------------------------------- worksheets

/** 0 -> "A", 25 -> "Z", 26 -> "AA", 27 -> "AB", 16383 -> "XFD". */
export function columnRef(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Characters of the widest line, i.e. what a column has to hold. */
const lineChars = (s: string) => s.split("\n").reduce((m, l) => Math.max(m, l.length), 0);

function numberChars(n: number): number {
  const s = Math.abs(n).toFixed(2);
  return s.length + Math.floor((s.length - 4) / 3) + (n < 0 ? 1 : 0); // "1,234.56" with the grouping commas and sign
}

function columnWidth(chars: number, bold: boolean): number {
  const w = chars * (bold ? 1.15 : 1) + 2;
  return Math.round(Math.min(60, Math.max(8.43, w)) * 100) / 100;
}

function checkSize(sheet: SheetModel, name: string, columnCount: number): void {
  const rowCount = sheet.rows.length + (sheet.columns.length > 0 ? 1 : 0);
  if (rowCount > XLSX_LIMITS.maxRows) {
    throw new Error(`Sheet "${name}" has ${group(rowCount)} rows but an Excel sheet holds at most ${group(XLSX_LIMITS.maxRows)}.`);
  }
  if (columnCount > XLSX_LIMITS.maxColumns) {
    throw new Error(`Sheet "${name}" has ${group(columnCount)} columns but an Excel sheet holds at most ${group(XLSX_LIMITS.maxColumns)}.`);
  }
}

function stringCell(ref: string, text: string, style: number, sheetName: string): string {
  const guarded = guardFormula(stripIllegalXml(text));
  if (guarded === "") return "";
  if (guarded.length > XLSX_LIMITS.maxCellChars) {
    throw new Error(`Cell ${ref} on sheet "${sheetName}" has ${group(guarded.length)} characters but an Excel cell holds at most ${group(XLSX_LIMITS.maxCellChars)}.`);
  }
  const preserve = /^\s|\s$|[\t\r\n]/.test(guarded) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}"${style ? ` s="${style}"` : ""} t="inlineStr"><is><t${preserve}>${escapeText(protectEscapes(guarded))}</t></is></c>`;
}

function valueCell(ref: string, value: unknown, sheetName: string): string {
  if (typeof value === "number") return Number.isFinite(value) ? `<c r="${ref}" s="${STYLE_NUMBER}"><v>${value}</v></c>` : "";
  if (value === null || value === undefined) return "";
  return stringCell(ref, typeof value === "string" ? value : String(value), 0, sheetName);
}

function worksheetXml(sheet: SheetModel, name: string, selected: boolean): string {
  const headers = sheet.columns;
  const hasHeader = headers.length > 0;
  let columnCount = headers.length;
  for (const row of sheet.rows) if (Array.isArray(row) && row.length > columnCount) columnCount = row.length;
  checkSize(sheet, name, columnCount);

  const widths: number[] = new Array(columnCount).fill(0);
  headers.forEach((h, c) => { widths[c] = columnWidth(lineChars(String(h ?? "")), true); });

  const rows: string[] = [];
  let rowNumber = 0;
  if (hasHeader) {
    rowNumber = 1;
    const cells = headers.map((h, c) => stringCell(`${columnRef(c)}1`, String(h ?? ""), STYLE_HEADER, name));
    rows.push(`<row r="1">${cells.join("")}</row>`);
  }
  for (const row of sheet.rows) {
    rowNumber++;
    const cells: string[] = [];
    if (Array.isArray(row)) {
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        const chars = typeof v === "number" ? (Number.isFinite(v) ? numberChars(v) : 0) : v == null ? 0 : lineChars(String(v));
        const w = columnWidth(chars, false);
        if (w > widths[c]) widths[c] = w;
        cells.push(valueCell(`${columnRef(c)}${rowNumber}`, v, name));
      }
    }
    rows.push(cells.length > 0 ? `<row r="${rowNumber}">${cells.join("")}</row>` : `<row r="${rowNumber}"/>`);
  }

  const lastCell = hasHeader || rowNumber > 0 ? `${columnRef(Math.max(columnCount, 1) - 1)}${Math.max(rowNumber, 1)}` : "A1";
  const dimension = lastCell === "A1" ? "A1" : `A1:${lastCell}`;
  const pane = hasHeader
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
    : "";
  const cols = columnCount > 0
    ? `<cols>${widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w || 8.43}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const filter = hasHeader ? `<autoFilter ref="A1:${columnRef(headers.length - 1)}${Math.max(rowNumber, 1)}"/>` : "";

  return `${XML_DECL}<worksheet xmlns="${NS_MAIN}"><dimension ref="${dimension}"/>` +
    `<sheetViews><sheetView${selected ? ' tabSelected="1"' : ""} workbookViewId="0">${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows.join("")}</sheetData>${filter}</worksheet>`;
}

// ---------------------------------------------------------------------------------------------------- package

/**
 * Builds a valid .xlsx workbook: bold, filled, frozen header row with an auto-filter, column widths from the content, numbers as
 * numbers (shown as #,##0.00 with red negatives), text as inline strings. Text cells follow the same formula-injection guard as the
 * CSV export (see cells.ts). Empty strings and non-finite numbers leave the cell empty. A workbook with no sheets gets one empty
 * sheet, because Excel rejects a workbook without any. Throws a readable Error when a sheet exceeds Excel's row, column or cell limits.
 * The output is deterministic: the same model always produces the same bytes.
 */
export function buildXlsx(model: WorkbookModel): Uint8Array<ArrayBuffer> {
  const sheets: SheetModel[] = model.sheets.length > 0 ? [...model.sheets] : [{ name: "Sheet1", columns: [], rows: [] }];
  const names = sanitizeSheetNames(sheets.map((s) => s.name));
  const encoder = new TextEncoder();
  const part = (name: string, xml: string) => ({ name, data: encoder.encode(xml) });

  const worksheetParts = sheets.map((s, i) => part(`xl/worksheets/sheet${i + 1}.xml`, worksheetXml(s, names[i], i === 0)));

  const contentTypes = `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';

  const rootRels = `${XML_DECL}<Relationships xmlns="${NS_PKG_REL}">` +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbookRels = `${XML_DECL}<Relationships xmlns="${NS_PKG_REL}">` +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`;

  // Excel records every auto-filter as a hidden defined name; it opens files without one, but writes them itself, so we do too.
  const filterNames = sheets
    .map((s, i) => (s.columns.length > 0
      ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escapeText(names[i].replace(/'/g, "''"))}'!$A$1:$${columnRef(s.columns.length - 1)}$${s.rows.length + 1}</definedName>`
      : ""))
    .join("");
  const workbook = `${XML_DECL}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
    names.map((n, i) => `<sheet name="${xmlAttr(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets>${filterNames ? `<definedNames>${filterNames}</definedNames>` : ""}</workbook>`;

  return zipStore([
    part("[Content_Types].xml", contentTypes),
    part("_rels/.rels", rootRels),
    part("xl/workbook.xml", workbook),
    part("xl/_rels/workbook.xml.rels", workbookRels),
    part("xl/styles.xml", STYLES_XML),
    ...worksheetParts,
  ]);
}
