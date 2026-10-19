import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";
import { buildXlsx } from "../../../src/app/exports/xlsx.ts";
import { crc32 } from "../../../src/app/exports/zip.ts";
import { XLSX_IMPORT_LIMITS, rowsToCsv, xlsxToCsv } from "../../../src/app/imports/xlsx.ts";
import { seedData, workbookModel } from "../../../src/domain/index.ts";
import type { Ctx, WorkbookModel } from "../../../src/domain/types.ts";

const enc = new TextEncoder();
const u16 = (out: number[], n: number) => { out.push(n & 255, (n >>> 8) & 255); };
const u32 = (out: number[], n: number) => { out.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255); };
const bytes = (s: string) => enc.encode(s);
const colRef = (index: number): string => {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

interface Part {
  name: string;
  data: Uint8Array;
  method?: number;
  flags?: number;
  reportedSize?: number;
  centralOffset?: number;
}

function zip(parts: readonly Part[]): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  for (const part of parts) {
    const method = part.method ?? 0;
    const flags = part.flags ?? 0;
    const compressed = method === 8 ? deflateRawSync(part.data) : part.data;
    const name = bytes(part.name);
    const size = part.reportedSize ?? part.data.byteLength;
    const offset = out.length;
    const crc = crc32(part.data);
    u32(out, 0x04034b50); u16(out, 20); u16(out, flags); u16(out, method); u16(out, 0); u16(out, 0); u32(out, crc); u32(out, compressed.byteLength); u32(out, size); u16(out, name.byteLength); u16(out, 0);
    out.push(...name, ...compressed);
    u32(central, 0x02014b50); u16(central, 20); u16(central, 20); u16(central, flags); u16(central, method); u16(central, 0); u16(central, 0); u32(central, crc); u32(central, compressed.byteLength); u32(central, size); u16(central, name.byteLength); u16(central, 0); u16(central, 0); u16(central, 0); u16(central, 0); u32(central, 0); u32(central, part.centralOffset ?? offset);
    central.push(...name);
  }
  const centralOffset = out.length;
  out.push(...central);
  u32(out, 0x06054b50); u16(out, 0); u16(out, 0); u16(out, parts.length); u16(out, parts.length); u32(out, central.length); u32(out, centralOffset); u16(out, 0);
  return new Uint8Array(out);
}

const xml = (s: string) => bytes(`<?xml version="1.0" encoding="UTF-8"?>${s}`);
const sheet = (cells: string): string => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cells}</row></sheetData></worksheet>`;

function workbookPackage(sheetXml: string, options: { shared?: string; styles?: string; date1904?: boolean; method?: number } = {}): Uint8Array {
  const workbookPr = options.date1904 ? '<workbookPr date1904="1"/>' : "";
  const parts: Part[] = [
    { name: "xl/workbook.xml", data: xml(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${workbookPr}<sheets><sheet name="First" sheetId="1" r:id="rId1"/></sheets></workbook>`), method: options.method },
    { name: "xl/_rels/workbook.xml.rels", data: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'), method: options.method },
    { name: "xl/worksheets/sheet1.xml", data: xml(sheetXml), method: options.method },
  ];
  if (options.shared) parts.push({ name: "xl/sharedStrings.xml", data: xml(options.shared), method: options.method });
  if (options.styles) parts.push({ name: "xl/styles.xml", data: xml(options.styles), method: options.method });
  return zip(parts);
}

async function rejectsFast(work: () => Promise<unknown>, pattern: RegExp, maxMs = 500): Promise<void> {
  const started = performance.now();
  await assert.rejects(work, pattern);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < maxMs, `expected failure under ${maxMs} ms, took ${elapsed.toFixed(1)} ms`);
}

function expectedFirstSheetCsv(model: WorkbookModel): string {
  const first = model.sheets[0] ?? { columns: [], rows: [] };
  return rowsToCsv([first.columns, ...first.rows.map((row) => row.map((cell) => String(cell ?? "")))]);
}

describe("xlsxToCsv", () => {
  it("reads workbooks produced by the app's xlsx writer", async () => {
    const model: WorkbookModel = { fileName: "round.xlsx", sheets: [{ name: "Round trip", columns: ["Name", "Amount"], rows: [["Harbourline", 12.5], ["Comma, quote \"ok\"", -7]] }] };
    const result = await xlsxToCsv(buildXlsx(model));
    assert.equal(result.sheetName, "Round trip");
    assert.equal(result.text, "Name,Amount\r\nHarbourline,12.5\r\n\"Comma, quote \"\"ok\"\"\",-7");
  });

  it("reads shared strings, rich text, inline strings, booleans, formula caches, errors and date-formatted numbers from deflated parts", async () => {
    const shared = '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Plain</t></si><si><r><t>Rich </t></r><r><t>text</t></r></si></sst>';
    const styles = '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>';
    const result = await xlsxToCsv(workbookPackage(sheet('<c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Inline</t></is></c><c r="C1" t="b"><v>1</v></c><c r="D1"><f>1+1</f><v>42</v></c><c r="E1" t="e"><v>#N/A</v></c><c r="F1" s="1"><v>61</v></c><c r="G1" t="s"><v>1</v></c>'), { shared, styles, method: 8 }));
    assert.deepEqual(result.rows, [["Plain", "Inline", "TRUE", "42", "#N/A", "1900-03-01", "Rich text"]]);
  });

  it("handles the 1900 leap-year bug boundary and the 1904 date flag", async () => {
    const styles = '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="1"><xf numFmtId="14"/></cellXfs></styleSheet>';
    const bug = await xlsxToCsv(workbookPackage(sheet('<c r="A1" s="0"><v>59</v></c><c r="B1" s="0"><v>60</v></c><c r="C1" s="0"><v>61</v></c>'), { styles }));
    assert.deepEqual(bug.rows, [["1900-02-28", "1900-02-29", "1900-03-01"]], "serial 60 is preserved as Excel's fictitious 1900-02-29 for compatibility");
    const result = await xlsxToCsv(workbookPackage(sheet('<c r="A1" s="0"><v>0</v></c>'), { styles, date1904: true }));
    assert.equal(result.text, "1904-01-01");
  });

  it("reads an empty sheet as empty CSV", async () => {
    const sheet = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>';
    const result = await xlsxToCsv(workbookPackage(sheet));
    assert.equal(result.text, "");
  });

  it("rejects unsafe paths, unsupported methods and ZIP64 quickly with readable messages", async () => {
    await rejectsFast(() => xlsxToCsv(zip([{ name: "../evil.xml", data: bytes("x") }])), /unsafe ZIP path/);
    await rejectsFast(() => xlsxToCsv(zip([{ name: "xl/workbook.xml", data: bytes("x"), method: 99 }])), /compression method/);
    const z64 = zip([{ name: "xl/workbook.xml", data: bytes("x") }]);
    z64[z64.length - 12] = 0xff;
    z64[z64.length - 11] = 0xff;
    await rejectsFast(() => xlsxToCsv(z64), /ZIP64/);
  });

  it("rejects zip bombs and central-directory size bombs quickly", async () => {
    const bomb = new Uint8Array(XLSX_IMPORT_LIMITS.maxEntryBytes + 1024 * 1024);
    await rejectsFast(() => xlsxToCsv(zip([{ name: "xl/workbook.xml", data: bomb, method: 8, reportedSize: XLSX_IMPORT_LIMITS.maxEntryBytes }])), /expands past its recorded size/);
    await rejectsFast(() => xlsxToCsv(zip([
      { name: "xl/a.xml", data: bytes("a"), reportedSize: 3 * 1024 * 1024 },
      { name: "xl/b.xml", data: bytes("b"), reportedSize: 3 * 1024 * 1024 },
      { name: "xl/c.xml", data: bytes("c"), reportedSize: 3 * 1024 * 1024 },
    ])), /expands to more than 8 MB/);
    await rejectsFast(() => xlsxToCsv(zip(Array.from({ length: XLSX_IMPORT_LIMITS.maxEntries + 1 }, (_, i) => ({ name: `xl/${i}.xml`, data: bytes("x") })))), /too many ZIP entries/);
  });

  it("rejects encryption flags and corrupt central-directory offsets quickly", async () => {
    await rejectsFast(() => xlsxToCsv(zip([{ name: "xl/workbook.xml", data: bytes("x"), flags: 1 }])), /Password-protected/);
    await rejectsFast(() => xlsxToCsv(zip([{ name: "xl/workbook.xml", data: bytes("x"), centralOffset: 999999 }])), /bad local header|truncated|directory/);
    await rejectsFast(() => xlsxToCsv(zip([{ name: "xl/a.xml", data: bytes("x") }, { name: "xl/b.xml", data: bytes("y"), centralOffset: 0 }])), /inconsistent ZIP headers|overlaps another ZIP entry/);
  });

  it("rejects XML depth, token floods, DTDs and entity declarations quickly", async () => {
    const deep = `${"<a>".repeat(XLSX_IMPORT_LIMITS.maxXmlDepth + 1)}${"</a>".repeat(XLSX_IMPORT_LIMITS.maxXmlDepth + 1)}`;
    await rejectsFast(() => xlsxToCsv(workbookPackage(sheet(`<c r="A1" t="inlineStr"><is><t>${deep}</t></is></c>`))), /nested too deeply/);

    const flood = `<?xml version="1.0"?><workbook>${"<!--x-->".repeat(XLSX_IMPORT_LIMITS.maxXmlTokens + 1)}</workbook>`;
    await rejectsFast(() => xlsxToCsv(zip([
      { name: "xl/workbook.xml", data: bytes(flood), method: 8 },
      { name: "xl/_rels/workbook.xml.rels", data: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>') },
    ])), /too complex/);

    const dtd = '<!DOCTYPE workbook [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">&lol2;</workbook>';
    await rejectsFast(() => xlsxToCsv(zip([
      { name: "xl/workbook.xml", data: xml(dtd) },
      { name: "xl/_rels/workbook.xml.rels", data: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>') },
    ])), /DTD or entity declaration/);
  });

  it("rejects overlong cells, over-wide sheets and too many rows quickly", async () => {
    await rejectsFast(() => xlsxToCsv(workbookPackage(sheet(`<c r="A1" t="inlineStr"><is><t>${"x".repeat(XLSX_IMPORT_LIMITS.maxCellChars + 1)}</t></is></c>`))), /text cell.*too long/);
    await rejectsFast(() => xlsxToCsv(workbookPackage(sheet(Array.from({ length: XLSX_IMPORT_LIMITS.maxColumns + 1 }, (_, i) => `<c r="${colRef(i)}1"><v>${i}</v></c>`).join("")))), /more than 200 columns/);
    const tooManyRows = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${Array.from({ length: XLSX_IMPORT_LIMITS.maxRows + 1 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>1</v></c></row>`).join("")}</sheetData></worksheet>`;
    await rejectsFast(() => xlsxToCsv(workbookPackage(tooManyRows)), /more than 2,000 rows/);
  });

  it("round-trips app-exported workbook tables through the reader's first-sheet CSV", async () => {
    const data = seedData();
    const ctx: Ctx = { user: data.users[0]!, now: new Date("2026-10-12T09:00:00Z") };
    const models: WorkbookModel[] = [
      { fileName: "export-test-fixture.xlsx", sheets: [{ name: "Funds", columns: ["Fund", "Value"], rows: [["Harbourline", 1500000.5], ["Other", 2]] }] },
      workbookModel(data, ctx, "all"),
      workbookModel(data, ctx, "AU"),
      workbookModel(data, ctx, "SG"),
    ];
    for (const model of models) {
      const result = await xlsxToCsv(buildXlsx(model));
      assert.equal(result.text, expectedFirstSheetCsv(model), model.fileName);
      for (const [index, table] of model.sheets.entries()) {
        const oneSheet: WorkbookModel = { fileName: `${model.fileName}-${index}.xlsx`, sheets: [table] };
        const sheetResult = await xlsxToCsv(buildXlsx(oneSheet));
        assert.equal(sheetResult.text, expectedFirstSheetCsv(oneSheet), `${model.fileName} / ${table.name}`);
      }
    }
  });

  it("reads a shared-string cell with no index as empty, not as the first shared string", async () => {
    const shared = '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>First</t></si></sst>';
    const result = await xlsxToCsv(workbookPackage(sheet('<c r="A1" t="s"/><c r="B1" t="s"><v>0</v></c>'), { shared }));
    assert.deepEqual(result.rows, [["", "First"]]);
  });

  it("stops a few repeated shared strings from expanding past the output limit (security review, alert 1)", async () => {
    const shared = `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>${"A".repeat(XLSX_IMPORT_LIMITS.maxCellChars)}</t></si></sst>`;
    const rows = Array.from({ length: 30 }, (_, r) => `<row r="${r + 1}">${Array.from({ length: 200 }, (_, c) => `<c r="${colRef(c)}${r + 1}" t="s"><v>0</v></c>`).join("")}</row>`).join("");
    const bomb = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
    await rejectsFast(() => xlsxToCsv(workbookPackage(bomb, { shared, method: 8 })), /more than 4 MB of text/);
  });

  it("reads a very long custom number format or cell reference in linear time (security review, alert 2)", async () => {
    const styles = `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="${"[".repeat(1_000_000)}"/></numFmts><cellXfs count="${200}">${'<xf numFmtId="164"/>'.repeat(200)}</cellXfs></styleSheet>`;
    const started = performance.now();
    const result = await xlsxToCsv(workbookPackage(sheet(`<c r="${"1".repeat(200_000)}A" s="1"><v>45000</v></c>`), { styles, method: 8 }));
    assert.ok(performance.now() - started < 1_000, "a pathological style sheet is read quickly");
    assert.deepEqual(result.rows, [["45000"]], "an over-long format is not a date, and an over-long reference falls back to the next column");
  });

  it("still recognises ordinary custom date formats and leaves number formats alone", async () => {
    const formats = [["dd/mm/yyyy", true], ["[$-409]d-mmm-yy;@", true], ["yyyy\\-mm\\-dd", true], ["[h]:mm", true], ["#,##0.00", false], ["0%", false], ["\"Year \"0", false], ["General", false]] as const;
    const numFmts = formats.map(([code], i) => `<numFmt numFmtId="${164 + i}" formatCode="${code.replace(/"/g, "&quot;")}"/>`).join("");
    const xfs = formats.map((_, i) => `<xf numFmtId="${164 + i}"/>`).join("");
    const styles = `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="${formats.length}">${numFmts}</numFmts><cellXfs count="${formats.length}">${xfs}</cellXfs></styleSheet>`;
    const cells = formats.map((_, i) => `<c r="${colRef(i)}1" s="${i}"><v>45000</v></c>`).join("");
    const result = await xlsxToCsv(workbookPackage(sheet(cells), { styles }));
    assert.deepEqual(result.rows[0], formats.map(([, isDate]) => (isDate ? "2023-03-15" : "45000")));
  });

  it("inflates a highly compressible part in slices and still reads it whole (security review, alert 3)", async () => {
    const big = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${"x".repeat(XLSX_IMPORT_LIMITS.maxCellChars)}</t></is></c></row></sheetData>${"<!-- padding -->".repeat(150_000)}</worksheet>`;
    const result = await xlsxToCsv(workbookPackage(big, { method: 8 }));
    assert.equal(result.rows[0]?.[0]?.length, XLSX_IMPORT_LIMITS.maxCellChars);
  });
});
