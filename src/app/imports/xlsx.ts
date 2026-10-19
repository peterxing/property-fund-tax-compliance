export interface XlsxCsvResult {
  text: string;
  sheetName: string;
  rows: string[][];
}

export const XLSX_IMPORT_LIMITS = {
  maxBytes: 1024 * 1024,
  maxEntries: 128,
  maxEntryBytes: 4 * 1024 * 1024,
  maxTotalEntryBytes: 8 * 1024 * 1024,
  maxRows: 2000,
  maxColumns: 200,
  maxCellChars: 32767,
  /** Total characters of cell text the sheet may produce, so a few repeated shared strings cannot expand into gigabytes. */
  maxOutputChars: 4 * 1024 * 1024,
  maxXmlTokens: 300000,
  maxXmlDepth: 64,
} as const;

/** Compressed bytes fed to the decompressor at a time, so it cannot expand far past the part-size check (deflate expands at most about 1,032 times). */
const INFLATE_SLICE_BYTES = 4 * 1024;
/** Excel limits a custom number format to 255 characters. */
const MAX_FORMAT_CODE_CHARS = 255;
/** The longest real cell reference is "XFD1048576". */
const MAX_CELL_REF_CHARS = 12;

const decoder = new TextDecoder("utf-8", { fatal: true });

function fail(message: string): never {
  throw new Error(message);
}

function group(n: number): string {
  return n.toLocaleString("en-AU");
}

function mb(bytes: number): string {
  return `${Number((Math.ceil((bytes / (1024 * 1024)) * 100) / 100).toFixed(2))} MB`;
}

function localName(name: string): string {
  const at = name.indexOf(":");
  return at >= 0 ? name.slice(at + 1) : name;
}

function safePath(name: string): string {
  if (name === "" || name.startsWith("/") || name.startsWith("\\") || /^[A-Za-z]:/.test(name) || name.includes("\\")) fail(`The workbook contains an unsafe ZIP path: ${name || "(blank)"}.`);
  const parts = name.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) fail(`The workbook contains an unsafe ZIP path: ${name}.`);
  return parts.join("/");
}

function resolvePart(base: string, target: string): string {
  if (target.startsWith("/")) return safePath(target.slice(1));
  const parts = base.split("/");
  parts.pop();
  for (const part of target.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) fail("The workbook contains a relationship outside the package.");
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return safePath(parts.join("/"));
}

interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

function findEnd(view: DataView): number {
  const min = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  fail("This is not a readable .xlsx workbook.");
}

function hasZip64Extra(bytes: Uint8Array, start: number, length: number): boolean {
  let offset = start;
  const end = start + length;
  while (offset + 4 <= end) {
    const id = bytes[offset] | (bytes[offset + 1] << 8);
    const size = bytes[offset + 2] | (bytes[offset + 3] << 8);
    if (id === 0x0001) return true;
    offset += 4 + size;
  }
  return false;
}

function readCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  if (bytes.byteLength > XLSX_IMPORT_LIMITS.maxBytes) fail(`This workbook is ${mb(bytes.byteLength)}. The limit is 1 MB.`);
  if (bytes.byteLength < 22) fail("This is not a readable .xlsx workbook.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEnd(view);
  const entries = view.getUint16(end + 10, true);
  const entriesDisk = view.getUint16(end + 8, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  if (entries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) fail("ZIP64 .xlsx workbooks are not supported.");
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0 || entries !== entriesDisk) fail("Multi-part .xlsx workbooks are not supported.");
  if (entries > XLSX_IMPORT_LIMITS.maxEntries) fail(`This workbook has too many ZIP entries. The limit is ${XLSX_IMPORT_LIMITS.maxEntries}.`);
  if (centralOffset + centralSize !== end || centralOffset > bytes.byteLength) fail("The workbook ZIP directory is not readable.");

  const out: ZipEntry[] = [];
  let cursor = centralOffset;
  let total = 0;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) fail("The workbook ZIP directory is not readable.");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff || hasZip64Extra(bytes, cursor + 46 + nameLength, extraLength)) fail("ZIP64 .xlsx workbooks are not supported.");
    if ((flags & 0x0001) !== 0) fail("Password-protected .xlsx workbooks are not supported.");
    if (method !== 0 && method !== 8) fail("This workbook uses a ZIP compression method the importer does not support.");
    if (size > XLSX_IMPORT_LIMITS.maxEntryBytes) fail(`The workbook contains a part larger than ${mb(XLSX_IMPORT_LIMITS.maxEntryBytes)}.`);
    total += size;
    if (total > XLSX_IMPORT_LIMITS.maxTotalEntryBytes) fail(`The workbook expands to more than ${mb(XLSX_IMPORT_LIMITS.maxTotalEntryBytes)}.`);
    const name = safePath(decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)));
    out.push({ name, method, flags, compressedSize, size, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== end) fail("The workbook ZIP directory has unexpected data.");
  return out;
}

async function inflateRaw(data: Uint8Array, expectedSize: number, name: string): Promise<Uint8Array> {
  let fed = 0;
  const source = new ReadableStream<BufferSource>(
    {
      pull(controller) {
        if (fed >= data.byteLength) {
          controller.close();
          return;
        }
        const end = Math.min(fed + INFLATE_SLICE_BYTES, data.byteLength);
        controller.enqueue(data.slice(fed, end));
        fed = end;
      },
    },
    { highWaterMark: 0 },
  );
  const reader = source.pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (total > XLSX_IMPORT_LIMITS.maxEntryBytes || total > expectedSize) {
      await reader.cancel();
      fail(`The workbook part ${name} expands past its recorded size.`);
    }
  }
  if (total !== expectedSize) fail(`The workbook part ${name} is not the recorded size.`);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = readCentralDirectory(bytes);
  const files = new Map<string, Uint8Array>();
  const ranges: Array<{ name: string; start: number; end: number }> = [];
  for (const entry of entries) {
    const { localOffset } = entry;
    if (localOffset + 30 > bytes.byteLength || view.getUint32(localOffset, true) !== 0x04034b50) fail(`The workbook part ${entry.name} has a bad local header.`);
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const nameLength = view.getUint16(localOffset + 26, true);
    const extraLength = view.getUint16(localOffset + 28, true);
    if ((localFlags & 0x0001) !== 0 || localMethod !== entry.method) fail(`The workbook part ${entry.name} has inconsistent ZIP headers.`);
    if (hasZip64Extra(bytes, localOffset + 30 + nameLength, extraLength)) fail("ZIP64 .xlsx workbooks are not supported.");
    const localName = decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + nameLength));
    if (localName !== entry.name) fail(`The workbook part ${entry.name} has inconsistent ZIP headers.`);
    const dataStart = localOffset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > bytes.byteLength) fail(`The workbook part ${entry.name} is truncated.`);
    const fullEnd = dataEnd;
    const fullStart = localOffset;
    if (ranges.some((range) => Math.max(range.start, fullStart) < Math.min(range.end, fullEnd))) fail(`The workbook part ${entry.name} overlaps another ZIP entry.`);
    ranges.push({ name: entry.name, start: fullStart, end: fullEnd });
    const compressed = bytes.subarray(dataStart, dataEnd);
    const data = entry.method === 0 ? compressed : await inflateRaw(compressed, entry.size, entry.name);
    if (data.byteLength !== entry.size) fail(`The workbook part ${entry.name} is not the recorded size.`);
    files.set(entry.name, data);
  }
  return files;
}

function decodeEntity(name: string): string {
  switch (name) {
    case "amp": return "&";
    case "lt": return "<";
    case "gt": return ">";
    case "quot": return "\"";
    case "apos": return "'";
    default:
      if (name.startsWith("#x") || name.startsWith("#X")) {
        const cp = Number.parseInt(name.slice(2), 16);
        if (Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff) return String.fromCodePoint(cp);
      }
      if (name.startsWith("#")) {
        const cp = Number.parseInt(name.slice(1), 10);
        if (Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff) return String.fromCodePoint(cp);
      }
      fail(`The workbook XML contains an unsupported entity: &${name};`);
  }
}

function xmlText(text: string): string {
  return text.replace(/&([A-Za-z]+|#[0-9]+|#x[0-9A-Fa-f]+);/g, (_m, name: string) => decodeEntity(name));
}

function parseAttrs(raw: string): Map<string, string> {
  const attrs = new Map<string, string>();
  let i = 0;
  while (i < raw.length) {
    while (/\s/.test(raw[i] ?? "")) i++;
    if (i >= raw.length) break;
    const nameStart = i;
    while (/[A-Za-z0-9_:\-.]/.test(raw[i] ?? "")) i++;
    const name = raw.slice(nameStart, i);
    while (/\s/.test(raw[i] ?? "")) i++;
    if (!name || raw[i] !== "=") fail("The workbook XML has an attribute that is not readable.");
    i++;
    while (/\s/.test(raw[i] ?? "")) i++;
    const quote = raw[i];
    if (quote !== "\"" && quote !== "'") fail("The workbook XML has an unquoted attribute.");
    i++;
    const valueStart = i;
    while (i < raw.length && raw[i] !== quote) i++;
    if (i >= raw.length) fail("The workbook XML has an unterminated attribute.");
    attrs.set(localName(name), xmlText(raw.slice(valueStart, i)));
    i++;
  }
  return attrs;
}

interface XmlHandlers {
  start?(name: string, attrs: Map<string, string>, path: readonly string[], selfClosing: boolean): void;
  end?(name: string, path: readonly string[]): void;
  text?(text: string, path: readonly string[]): void;
}

function walkXml(xml: string, handlers: XmlHandlers): void {
  let i = 0;
  let tokens = 0;
  const stack: string[] = [];
  while (i < xml.length) {
    if (++tokens > XLSX_IMPORT_LIMITS.maxXmlTokens) fail("The workbook XML is too complex to import.");
    const lt = xml.indexOf("<", i);
    if (lt < 0) {
      if (i < xml.length) handlers.text?.(xmlText(xml.slice(i)), stack);
      break;
    }
    if (lt > i) handlers.text?.(xmlText(xml.slice(i, lt)), stack);
    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4);
      if (end < 0) fail("The workbook XML has an unterminated comment.");
      i = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt + 9);
      if (end < 0) fail("The workbook XML has unterminated CDATA.");
      handlers.text?.(xml.slice(lt + 9, end), stack);
      i = end + 3;
      continue;
    }
    if (xml.startsWith("<?", lt)) {
      const end = xml.indexOf("?>", lt + 2);
      if (end < 0) fail("The workbook XML has an unterminated declaration.");
      i = end + 2;
      continue;
    }
      if (/^<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml.slice(lt, lt + 32))) fail("The workbook XML contains a DTD or entity declaration, which is not supported.");
      if (xml.startsWith("<!", lt)) {
        const end = xml.indexOf(">", lt + 2);
        if (end < 0) fail("The workbook XML has unsupported markup.");
      i = end + 1;
      continue;
    }
    const gt = xml.indexOf(">", lt + 1);
    if (gt < 0) fail("The workbook XML has an unterminated tag.");
    let body = xml.slice(lt + 1, gt).trim();
    const closing = body.startsWith("/");
    if (closing) {
      const name = localName(body.slice(1).trim());
      const open = stack.pop();
      if (open !== name) fail("The workbook XML has mismatched tags.");
      handlers.end?.(name, stack);
      i = gt + 1;
      continue;
    }
    const selfClosing = body.endsWith("/");
    if (selfClosing) body = body.slice(0, -1).trim();
    const split = body.search(/\s/);
    const rawName = split < 0 ? body : body.slice(0, split);
    const name = localName(rawName);
    const attrs = parseAttrs(split < 0 ? "" : body.slice(split + 1));
    const nextPath = [...stack, name];
    handlers.start?.(name, attrs, nextPath, selfClosing);
    if (!selfClosing) {
      stack.push(name);
      if (stack.length > XLSX_IMPORT_LIMITS.maxXmlDepth) fail("The workbook XML is nested too deeply.");
    } else {
      handlers.end?.(name, stack);
    }
    i = gt + 1;
  }
  if (stack.length > 0) fail("The workbook XML has unclosed tags.");
}

function getXml(files: Map<string, Uint8Array>, path: string, required = false): string {
  const bytes = files.get(path);
  if (!bytes) {
    if (required) fail(`The workbook is missing ${path}.`);
    return "";
  }
  try {
    return decoder.decode(bytes);
  } catch {
    fail(`The workbook part ${path} is not valid UTF-8 XML.`);
  }
}

function parseRelationships(xml: string, base: string): Map<string, string> {
  const rels = new Map<string, string>();
  walkXml(xml, {
    start(name, attrs) {
      if (name !== "Relationship") return;
      const id = attrs.get("Id");
      const target = attrs.get("Target");
      if (id && target) rels.set(id, resolvePart(base, target));
    },
  });
  return rels;
}

interface SheetInfo {
  name: string;
  path: string;
}

function parseWorkbook(xml: string, rels: Map<string, string>): { sheets: SheetInfo[]; date1904: boolean } {
  const sheets: SheetInfo[] = [];
  let date1904 = false;
  walkXml(xml, {
    start(name, attrs, path) {
      if (name === "workbookPr") date1904 = attrs.get("date1904") === "1" || attrs.get("date1904") === "true";
      if (name === "sheet" && path.includes("sheets")) {
        const relId = attrs.get("id");
        const target = relId ? rels.get(relId) : undefined;
        if (target) sheets.push({ name: attrs.get("name") || `Sheet${sheets.length + 1}`, path: target });
      }
    },
  });
  return { sheets, date1904 };
}

const BUILT_IN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** Whether a custom number format shows a date. A linear scan: quoted text, escaped characters and [colour or condition] sections are skipped. */
function looksLikeDateFormat(format: string): boolean {
  if (format.length > MAX_FORMAT_CODE_CHARS) return false;
  let datePart = false;
  for (let i = 0; i < format.length; i++) {
    const ch = format[i]!;
    if (ch === "\"" || ch === "[") {
      const close = format.indexOf(ch === "\"" ? "\"" : "]", i + 1);
      if (close >= 0) {
        i = close;
        continue;
      }
    }
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "0" || ch === "#" || ch === "?") return false;
    const lower = ch.toLowerCase();
    if (lower === "y" || lower === "m" || lower === "d") datePart = true;
  }
  return datePart;
}

function parseDateStyles(xml: string): Set<number> {
  if (!xml) return new Set();
  const dateFormats = new Set<number>();
  const dateStyles = new Set<number>();
  let xfIndex = 0;
  let inCellXfs = false;
  walkXml(xml, {
    start(name, attrs, path) {
      if (name === "numFmt") {
        const id = Number(attrs.get("numFmtId"));
        if (!Number.isInteger(id)) return;
        if (looksLikeDateFormat(attrs.get("formatCode") ?? "")) dateFormats.add(id);
        else dateFormats.delete(id);
      } else if (name === "cellXfs") {
        inCellXfs = true;
        xfIndex = 0;
      } else if (name === "xf" && inCellXfs && path.at(-2) === "cellXfs") {
        const id = Number(attrs.get("numFmtId") ?? "0");
        if (BUILT_IN_DATE_FORMATS.has(id) || dateFormats.has(id)) dateStyles.add(xfIndex);
        xfIndex++;
      }
    },
    end(name) {
      if (name === "cellXfs") inCellXfs = false;
    },
  });
  return dateStyles;
}

function parseSharedStrings(xml: string): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  let inSi = false;
  let inT = false;
  let current = "";
  walkXml(xml, {
    start(name) {
      if (name === "si") {
        inSi = true;
        current = "";
      } else if (inSi && name === "t") {
        inT = true;
      }
    },
    text(text) {
      if (inT) current += text;
    },
    end(name) {
      if (name === "t") inT = false;
      if (name === "si") {
        if (current.length > XLSX_IMPORT_LIMITS.maxCellChars) fail("The workbook contains a text cell that is too long.");
        strings.push(current);
        inSi = false;
      }
    },
  });
  return strings;
}

function columnIndex(ref: string): number {
  const letters = /^[A-Za-z]+/.exec(ref)?.[0] ?? "";
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function rowIndex(ref: string): number {
  const digits = /[0-9]+$/.exec(ref)?.[0] ?? "";
  return digits ? Number(digits) - 1 : -1;
}

function excelDate(serial: number, date1904: boolean): string {
  if (!Number.isFinite(serial) || serial < 0) return String(serial);
  const whole = Math.floor(serial);
  if (!date1904 && whole === 60) return "1900-02-29";
  const epoch = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 31);
  const adjusted = date1904 ? whole : whole >= 60 ? whole - 1 : whole;
  return new Date(epoch + adjusted * 86400000).toISOString().slice(0, 10);
}

function cellValue(type: string, raw: string, style: number, shared: readonly string[], dateStyles: Set<number>, date1904: boolean): string {
  const value = raw.trim();
  if (type === "s") {
    if (value === "") return "";
    const index = Number(value);
    return Number.isInteger(index) && index >= 0 && index < shared.length ? shared[index] : "";
  }
  if (type === "b") return value === "1" || value.toLowerCase() === "true" ? "TRUE" : "FALSE";
  if (type === "e") return value;
  if (type === "str") return raw;
  if (value !== "" && dateStyles.has(style)) return excelDate(Number(value), date1904);
  return value;
}

function parseSheet(xml: string, shared: readonly string[], dateStyles: Set<number>, date1904: boolean): string[][] {
  const rows: string[][] = [];
  let currentRow = -1;
  let nextColumn = 0;
  let outputChars = 0;
  let cell: { row: number; column: number; type: string; style: number; value: string; inline: string; inV: boolean; inT: boolean } | null = null;
  const commit = (): void => {
    if (!cell) return;
    const text = cell.type === "inlineStr" ? cell.inline : cellValue(cell.type, cell.value, cell.style, shared, dateStyles, date1904);
    if (text.length > XLSX_IMPORT_LIMITS.maxCellChars) fail("The workbook contains a text cell that is too long.");
    if (cell.row >= XLSX_IMPORT_LIMITS.maxRows) fail(`The sheet has more than ${group(XLSX_IMPORT_LIMITS.maxRows)} rows.`);
    if (cell.column >= XLSX_IMPORT_LIMITS.maxColumns) fail(`The sheet has more than ${group(XLSX_IMPORT_LIMITS.maxColumns)} columns.`);
    outputChars += text.length;
    if (outputChars > XLSX_IMPORT_LIMITS.maxOutputChars) fail(`The sheet holds more than ${mb(XLSX_IMPORT_LIMITS.maxOutputChars)} of text. Save the sheet as CSV, or split it, and import that instead.`);
    while (rows.length <= cell.row) rows.push([]);
    rows[cell.row]![cell.column] = text;
    cell = null;
  };
  walkXml(xml, {
    start(name, attrs) {
      if (name === "row") {
        const r = Number(attrs.get("r"));
        currentRow = Number.isInteger(r) && r > 0 ? r - 1 : rows.length;
        if (currentRow >= XLSX_IMPORT_LIMITS.maxRows) fail(`The sheet has more than ${group(XLSX_IMPORT_LIMITS.maxRows)} rows.`);
        nextColumn = 0;
        while (rows.length <= currentRow) rows.push([]);
      } else if (name === "c") {
        const rawRef = attrs.get("r") ?? "";
        const ref = rawRef.length <= MAX_CELL_REF_CHARS ? rawRef : "";
        const col = columnIndex(ref);
        const row = rowIndex(ref);
        const column = col >= 0 ? col : nextColumn;
        const actualRow = row >= 0 ? row : currentRow >= 0 ? currentRow : rows.length;
        nextColumn = column + 1;
        cell = { row: actualRow, column, type: attrs.get("t") ?? "n", style: Number(attrs.get("s") ?? "0"), value: "", inline: "", inV: false, inT: false };
      } else if (cell && name === "v") {
        cell.inV = true;
      } else if (cell && name === "t") {
        cell.inT = true;
      }
    },
    text(text) {
      if (!cell) return;
      if (cell.inV) cell.value += text;
      if (cell.inT) cell.inline += text;
    },
    end(name) {
      if (cell && name === "v") cell.inV = false;
      else if (cell && name === "t") cell.inT = false;
      else if (name === "c") commit();
    },
  });
  while (rows.length > 0 && rows[rows.length - 1]!.every((cellText) => (cellText ?? "") === "")) rows.pop();
  let width = 0;
  for (const row of rows) width = Math.max(width, row.length);
  if (width > XLSX_IMPORT_LIMITS.maxColumns) fail(`The sheet has more than ${group(XLSX_IMPORT_LIMITS.maxColumns)} columns.`);
  return rows.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ""));
}

export function rowsToCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map((cell) => /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, "\"\"")}"` : cell).join(",")).join("\r\n");
}

export async function xlsxToCsv(bytes: Uint8Array): Promise<XlsxCsvResult> {
  const files = await readZip(bytes);
  const rels = parseRelationships(getXml(files, "xl/_rels/workbook.xml.rels", true), "xl/workbook.xml");
  const workbook = parseWorkbook(getXml(files, "xl/workbook.xml", true), rels);
  const sheet = workbook.sheets[0];
  if (!sheet) return { text: "", sheetName: "Sheet1", rows: [] };
  const shared = parseSharedStrings(getXml(files, "xl/sharedStrings.xml"));
  const dateStyles = parseDateStyles(getXml(files, "xl/styles.xml"));
  const rows = parseSheet(getXml(files, sheet.path, true), shared, dateStyles, workbook.date1904);
  return { text: rowsToCsv(rows), sheetName: sheet.name, rows };
}
