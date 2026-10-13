// Reading the files the app hands to the browser, without any library: PDF text (PDFKit writes Flate streams with hex-coded TJ/Tj strings),
// the ZIP package behind an .xlsx, and CSV records. Used by the download flow.
import assert from "node:assert/strict";
import { inflateRawSync, inflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------------------------------------------- PDF

/** What a PDF holds: starts with the %PDF- header, ends with %%EOF, has a cross-reference table, and every Flate stream inflates. */
export function expectWholePdf(bytes: Buffer, label: string): void {
  assert.equal(bytes.subarray(0, 5).toString("latin1"), "%PDF-", `${label}: starts with %PDF-`);
  assert.match(bytes.subarray(-12).toString("latin1"), /%%EOF\s*$/, `${label}: ends with %%EOF`);
  const latin = bytes.toString("latin1");
  assert.match(latin, /startxref\s+\d+\s+%%EOF/, `${label}: has a cross-reference pointer`);
  const startxref = Number(/startxref\s+(\d+)/.exec(latin)![1]);
  assert.ok(startxref > 0 && startxref < bytes.length, `${label}: startxref points into the file`);
}

function pdfStreams(bytes: Buffer): string[] {
  const latin = bytes.toString("latin1");
  const streams: string[] = [];
  const pattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (let match = pattern.exec(latin); match; match = pattern.exec(latin)) {
    const body = Buffer.from(match[1]!, "latin1");
    try {
      streams.push(inflateSync(body).toString("latin1"));
    } catch {
      // not a Flate stream (an embedded font or image): carries no page text
    }
  }
  return streams;
}

/** The strings the PDF draws, in drawing order, as the reader sees them (WinAnsi: 0x97 is the em dash). */
export function pdfStrings(bytes: Buffer): string[] {
  const decoder = new TextDecoder("windows-1252");
  const strings: string[] = [];
  for (const stream of pdfStreams(bytes)) {
    const pattern = /\[((?:\s*<[0-9a-fA-F]*>\s*-?[\d.]*)+)\s*\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g;
    for (let match = pattern.exec(stream); match; match = pattern.exec(stream)) {
      const hex = match[1] !== undefined ? Array.from(match[1].matchAll(/<([0-9a-fA-F]*)>/g), (piece) => piece[1]).join("") : match[2]!;
      strings.push(decoder.decode(Buffer.from(hex, "hex")));
    }
  }
  return strings;
}

/** All of the PDF's text on one line, whitespace collapsed. */
export const pdfText = (bytes: Buffer): string => pdfStrings(bytes).join(" ").replace(/\s+/g, " ").trim();

/** The number of pages. */
export const pdfPages = (bytes: Buffer): number => (bytes.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;

// ---------------------------------------------------------------------------------------------------------------- ZIP / XLSX

/** The entries of a ZIP archive by name, each checked against its recorded size and CRC-32. */
export function zipEntries(bytes: Buffer): Map<string, Buffer> {
  assert.equal(bytes.readUInt32LE(0), 0x04034b50, "starts with the local file header signature (PK\\x03\\x04)");
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50) {
      end = at;
      break;
    }
  }
  assert.ok(end >= 0, "has an end-of-central-directory record");
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const entries = new Map<string, Buffer>();
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(at), 0x02014b50, `central directory entry ${index}`);
    const method = bytes.readUInt16LE(at + 10);
    const crc = bytes.readUInt32LE(at + 16);
    const compressed = bytes.readUInt32LE(at + 20);
    const size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    assert.equal(bytes.readUInt32LE(local), 0x04034b50, `${name}: local header`);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const stored = bytes.subarray(start, start + compressed);
    assert.ok([0, 8].includes(method), `${name}: stored or deflated`);
    const data = method === 8 ? inflateRawSync(stored) : stored;
    assert.equal(data.length, size, `${name}: size as recorded`);
    assert.equal(crc32(data), crc, `${name}: CRC-32 as recorded`);
    entries.set(name, Buffer.from(data));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The sheets of an .xlsx in order, each as its name and its rows of cell text (inline strings and numbers; a cell that is not written reads as ""). */
export function workbookSheets(bytes: Buffer): Array<{ name: string; rows: string[][] }> {
  const entries = zipEntries(bytes);
  const part = (name: string): string => {
    const found = entries.get(name);
    assert.ok(found, `${name} is in the package`);
    return found.toString("utf8");
  };
  const unescape = (text: string): string =>
    text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code))).replace(/&amp;/g, "&");
  const columnOf = (reference: string): number => Array.from(/^[A-Z]+/.exec(reference)![0]).reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  const workbook = part("xl/workbook.xml");
  const relationships = part("xl/_rels/workbook.xml.rels");
  const targets = new Map(Array.from(relationships.matchAll(/<Relationship\b[^>]*>/g), (tag) => [/\bId="([^"]*)"/.exec(tag[0])?.[1] ?? "", /\bTarget="([^"]*)"/.exec(tag[0])?.[1] ?? ""] as const));
  return Array.from(workbook.matchAll(/<sheet\b[^>]*>/g), (tag) => {
    const name = unescape(/\bname="([^"]*)"/.exec(tag[0])![1]!);
    const target = targets.get(/\br:id="([^"]*)"/.exec(tag[0])![1]!)!;
    const xml = part(`xl/${target.replace(/^\/?(xl\/)?/, "")}`);
    const rows = Array.from(xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g), (row) => {
      const cells: string[] = [];
      for (const cell of (row[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const reference = /\br="([A-Z]+\d+)"/.exec(cell[1]!)?.[1];
        const inner = cell[2] ?? "";
        const text = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
        cells[reference ? columnOf(reference) : cells.length] = unescape(text);
      }
      return Array.from(cells, (value) => value ?? "");
    });
    return { name, rows };
  });
}

/** Everything the package says, for a search ("this workbook never mentions Kallang"). */
export function workbookText(bytes: Buffer): string {
  return Array.from(zipEntries(bytes).values(), (data) => data.toString("utf8")).join("\n");
}
// ---------------------------------------------------------------------------------------------------------------- CSV

/** The byte order mark Excel needs to read UTF-8. */
export const BOM = "\ufeff";

/** CSV records (RFC 4180: quoted fields, doubled quotes, CRLF or LF) without the byte order mark. */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index++;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && source[index + 1] === "\n") index++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  assert.equal(quoted, false, "every quoted field is closed");
  return records;
}
