// A small PDF reader for the renderer tests. It understands exactly what pdfkit writes (flate-compressed content streams, text as hex
// strings in TJ arrays, a flat page tree, WinAnsi standard fonts) and returns the text runs of every page with their position, so
// the tests can assert on layout and glyph mapping. It is not a general PDF parser.
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

export interface TextRun {
  text: string;
  /** Left edge, in points from the left edge of the page. */
  x: number;
  /** Baseline, in points from the TOP edge of the page. */
  baseline: number;
  size: number;
  bold: boolean;
}

export interface PdfPage {
  width: number;
  height: number;
  runs: TextRun[];
}

export interface ParsedPdf {
  header: string;
  pages: PdfPage[];
  /** The /Count of the page tree. */
  declaredPageCount: number;
  /** Document information strings (Title, Subject, Producer, Creator, CreationDate), decoded. */
  info: Record<string, string>;
}

interface PdfObject {
  dict: string;
  stream?: Uint8Array;
}

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");

function readObjects(bytes: Uint8Array): { objects: Map<number, PdfObject>; text: string } {
  const text = latin1(bytes);
  const objects = new Map<number, PdfObject>();
  const header = /(?:^|\n)(\d+) 0 obj\n/g;
  let match: RegExpExecArray | null;
  while ((match = header.exec(text))) {
    const number = Number(match[1]);
    const bodyStart = match.index + match[0].length;
    const streamMark = text.indexOf(">>\nstream\n", bodyStart);
    const objectEnd = text.indexOf("endobj", bodyStart);
    if (streamMark !== -1 && (objectEnd === -1 || streamMark < objectEnd)) {
      const dict = text.slice(bodyStart, streamMark + 2);
      const length = Number(/\/Length (\d+)/.exec(dict)?.[1]);
      const dataStart = streamMark + ">>\nstream\n".length;
      let data: Uint8Array = bytes.subarray(dataStart, dataStart + length);
      if (/\/FlateDecode/.test(dict)) data = inflateSync(data);
      objects.set(number, { dict, stream: data });
      header.lastIndex = dataStart + length;
    } else {
      objects.set(number, { dict: text.slice(bodyStart, objectEnd) });
      header.lastIndex = objectEnd;
    }
  }
  return { objects, text };
}

const refOf = (dict: string, key: string): number | undefined => {
  const m = new RegExp(`/${key} (\\d+) 0 R`).exec(dict);
  return m ? Number(m[1]) : undefined;
};

const WIN_ANSI = new TextDecoder("windows-1252");

function hexToText(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return WIN_ANSI.decode(bytes);
}

/** Decodes a PDF literal string "(...)" as pdfkit writes it: ASCII, or UTF-16BE behind a byte order mark. */
function literalToText(body: string): string {
  const source = body.trim();
  if (!source.startsWith("(") || !source.endsWith(")")) throw new Error(`not a literal string: ${source.slice(0, 40)}`);
  const unescaped = source
    .slice(1, -1)
    .replace(/\\([nrtbf()\\])/g, (_all, c: string) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[c] ?? c);
  if (unescaped.startsWith("\u00fe\u00ff")) {
    let out = "";
    for (let i = 2; i + 1 < unescaped.length; i += 2) out += String.fromCharCode((unescaped.charCodeAt(i) << 8) | unescaped.charCodeAt(i + 1));
    return out;
  }
  return unescaped;
}

function readRuns(content: string, fonts: Map<string, string>, pageHeight: number): TextRun[] {
  const runs: TextRun[] = [];
  let x = 0;
  let y = 0;
  let font = "";
  let size = 0;
  for (const line of content.split("\n")) {
    let m: RegExpExecArray | null;
    if ((m = /^1 0 0 1 (\S+) (\S+) Tm$/.exec(line))) {
      x = Number(m[1]);
      y = Number(m[2]);
    } else if ((m = /^\/(\S+) (\S+) Tf$/.exec(line))) {
      font = fonts.get(m[1]) ?? m[1];
      size = Number(m[2]);
    } else if ((m = /^\[(.*)\] TJ$/.exec(line))) {
      const text = [...m[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => hexToText(h[1])).join("");
      runs.push({ text, x, baseline: pageHeight - y, size, bold: /Bold/.test(font) });
    }
  }
  return runs;
}

export function parsePdf(bytes: Uint8Array): ParsedPdf {
  const { objects, text } = readObjects(bytes);
  const header = text.slice(0, text.indexOf("\n"));
  const object = (n: number | undefined, what: string): PdfObject => {
    const found = n === undefined ? undefined : objects.get(n);
    if (!found) throw new Error(`missing object for ${what}`);
    return found;
  };

  const catalog = [...objects.values()].find((o) => /\/Type \/Catalog\b/.test(o.dict));
  if (!catalog) throw new Error("no catalog");
  const tree = object(refOf(catalog.dict, "Pages"), "page tree");
  const declaredPageCount = Number(/\/Count (\d+)/.exec(tree.dict)?.[1]);
  const kids = [...(/\/Kids \[([^\]]*)\]/.exec(tree.dict)?.[1] ?? "").matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));

  const pages: PdfPage[] = kids.map((id) => {
    const page = object(id, `page ${id}`);
    if (!/\/Type \/Page\b(?!s)/.test(page.dict)) throw new Error(`object ${id} is not a page`);
    const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(page.dict);
    if (!box) throw new Error(`page ${id} has no MediaBox`);
    const resources = object(refOf(page.dict, "Resources"), `resources of page ${id}`);
    const fonts = new Map<string, string>();
    const fontBlock = /\/Font <<([^>]*)>>/.exec(resources.dict)?.[1] ?? "";
    for (const f of fontBlock.matchAll(/\/(\w+) (\d+) 0 R/g)) {
      fonts.set(f[1], /\/BaseFont \/([\w-]+)/.exec(object(Number(f[2]), `font ${f[1]}`).dict)?.[1] ?? f[1]);
    }
    const contents = object(refOf(page.dict, "Contents"), `contents of page ${id}`);
    if (!contents.stream) throw new Error(`contents of page ${id} is not a stream`);
    const height = Number(box[2]);
    return { width: Number(box[1]), height, runs: readRuns(latin1(contents.stream), fonts, height) };
  });

  const trailer = text.slice(text.lastIndexOf("trailer"));
  const infoDict = object(refOf(trailer, "Info"), "info dictionary");
  const info: Record<string, string> = {};
  for (const entry of infoDict.dict.matchAll(/\/(\w+) (\d+) 0 R/g)) info[entry[1]] = literalToText(object(Number(entry[2]), `info ${entry[1]}`).dict);
  return { header, pages, declaredPageCount, info };
}

export const pageText = (page: PdfPage): string => page.runs.map((r) => r.text).join("\n");
export const documentText = (pdf: ParsedPdf): string => pdf.pages.map(pageText).join("\n");

/**
 * Checks the file structure a viewer relies on: header, trailing startxref/%%EOF, a cross-reference table whose every offset points at
 * the matching "N 0 obj", and a trailer naming a catalog. Returns the number of objects (including the free entry 0).
 */
export function assertValidPdfStructure(bytes: Uint8Array): number {
  const text = latin1(bytes);
  assert.match(text, /^%PDF-1\.\d\n/, "starts with a PDF header");
  const tail = /\nstartxref\n(\d+)\n%%EOF\n?$/.exec(text);
  assert.ok(tail, "ends with startxref and %%EOF");
  const start = Number(tail[1]);
  const head = /^xref\n0 (\d+)\n/.exec(text.slice(start));
  assert.ok(head, "startxref points at the xref table");
  const count = Number(head[1]);
  const table = text.slice(start + head[0].length);
  const entries = [...table.slice(0, 20 * count).matchAll(/(\d{10}) (\d{5}) ([nf]) \n/g)];
  assert.equal(entries.length, count, "xref has one 20-byte entry per object");
  assert.equal(entries[0][3], "f", "object 0 is the free-list head");
  for (let i = 1; i < count; i++) {
    assert.equal(entries[i][3], "n", `object ${i} is in use`);
    assert.ok(text.startsWith(`${i} 0 obj\n`, Number(entries[i][1])), `the xref offset of object ${i} points at "${i} 0 obj"`);
  }
  const trailer = table.slice(20 * count);
  assert.equal(Number(/\/Size (\d+)/.exec(trailer)?.[1]), count, "trailer /Size matches the xref");
  const root = Number(/\/Root (\d+) 0 R/.exec(trailer)?.[1]);
  assert.match(text.slice(Number(entries[root][1]), Number(entries[root][1]) + 80), /\/Type \/Catalog/, "/Root is the catalog");
  return count;
}
