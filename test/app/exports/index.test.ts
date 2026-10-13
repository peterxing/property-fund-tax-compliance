import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as api from "../../../src/app/exports/index.ts";
import { csvText } from "../../../src/app/exports/csv.ts";
import type { CsvModel, DocModel, WorkbookModel } from "../../../src/domain/types.ts";
import { installFakeDom } from "./fake-dom.ts";
import { assertValidPdfStructure, documentText, parsePdf } from "./pdf-reader.ts";
import { readZip } from "./zip-reader.ts";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ------------------------------------------------------------------------------------------------------------- the contract

test("the entry point exports exactly downloadCsv, downloadXlsx and downloadPdf", () => {
  assert.deepEqual(Object.keys(api).sort(), ["downloadCsv", "downloadPdf", "downloadXlsx"]);
  for (const fn of Object.values(api)) assert.equal(typeof fn, "function");
  assert.equal(api.downloadCsv.length, 1);
  assert.equal(api.downloadXlsx.length, 1);
  assert.equal(api.downloadPdf.length, 1);
});

// ------------------------------------------------------------------------------------------------------------- laziness, from the source

const EXPORTS_DIR = new URL("../../../src/app/exports/", import.meta.url);

/** The specifiers of a module's static imports (type-only ones are erased, so they do not count) and of its dynamic imports. */
function importsOf(file: string): { statics: string[]; dynamics: string[] } {
  const code = readFileSync(new URL(file, EXPORTS_DIR), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const statics = [
    ...[...code.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+["']([^"']+)["']/gm)].map((m) => m[1]),
    ...[...code.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1]),
  ];
  const dynamics = [...code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  return { statics, dynamics };
}

test("only the small modules are imported statically; pdfkit, pdf.ts, xlsx.ts and zip.ts are loaded on demand", () => {
  const reachable = new Set<string>();
  const bare: string[] = [];
  const queue = ["index.ts"];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (reachable.has(file)) continue;
    reachable.add(file);
    for (const specifier of importsOf(file).statics) {
      if (specifier.startsWith("./")) queue.push(specifier.slice(2));
      else if (!specifier.startsWith("../")) bare.push(`${file} -> ${specifier}`);
    }
  }
  for (const heavy of ["pdf.ts", "xlsx.ts", "zip.ts"]) assert.ok(!reachable.has(heavy), `${heavy} must not be statically reachable from index.ts (${[...reachable].join(", ")})`);
  assert.deepEqual(bare, [], "no library is imported statically");
  assert.deepEqual(importsOf("index.ts").dynamics.sort(), ["./pdf.ts", "./xlsx.ts", "pdfkit/js/pdfkit.standalone.js"]);
});

test("pdf.ts and xlsx.ts import no library except through what they are given", () => {
  assert.deepEqual(importsOf("pdf.ts").statics.filter((s) => !s.startsWith(".")), [], "pdf.ts gets the PDFDocument constructor from its caller");
  assert.deepEqual(importsOf("xlsx.ts").statics.filter((s) => !s.startsWith(".")), []);
  assert.deepEqual(importsOf("zip.ts").statics.filter((s) => !s.startsWith(".")), []);
});

// ------------------------------------------------------------------------------------------------------------- downloadCsv

test("downloadCsv saves a UTF-8 CSV with a BOM under a clean name", async (t) => {
  const dom = installFakeDom(t);
  const model: CsvModel = {
    fileName: "fund/name: 2025.csv",
    columns: ["Fund", "Amount"],
    rows: [["Harbourline \u2014 Trust, \"Core\"", 1234.5], ["=cmd|' /C calc'!A0", -2]],
  };
  assert.equal(api.downloadCsv(model), undefined, "it is synchronous");
  assert.deepEqual(dom.events, ["create", "append", "click", "remove"]);
  const blob = dom.blobs[0];
  assert.equal(blob.type, "text/csv;charset=utf-8");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "BOM");
  assert.equal(new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }).decode(bytes), csvText(model));
  assert.equal(dom.links[0].download, "fundname- 2025.csv");
  dom.tick(1000);
  assert.equal(dom.events.at(-1), "revoke blob:fake/1");
});

test("downloadCsv wraps a failure in a readable Error that keeps the cause", (t) => {
  installFakeDom(t, { noDocument: true });
  assert.throws(
    () => api.downloadCsv({ fileName: "a.csv", columns: ["a"], rows: [] }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Could not create the CSV file: document is not defined");
      assert.ok(error.cause instanceof ReferenceError);
      return true;
    },
  );
});

test("downloadCsv explains a failure that is not an Error", (t) => {
  const dom = installFakeDom(t);
  const model = { fileName: "a.csv", get columns(): string[] { throw "plain text"; }, rows: [] } as unknown as CsvModel;
  assert.throws(() => api.downloadCsv(model), (error: unknown) => error instanceof Error && error.message === "Could not create the CSV file: plain text" && error.cause === "plain text");
  assert.deepEqual(dom.events, [], "nothing is saved");
});

// ------------------------------------------------------------------------------------------------------------- downloadXlsx

test("downloadXlsx builds the workbook and saves it", async (t) => {
  const dom = installFakeDom(t);
  const model: WorkbookModel = { fileName: "portfolio: FY25.xlsx", sheets: [{ name: "Funds", columns: ["Fund", "Value"], rows: [["Harbourline", 1500000.5], ["Other", 2]] }] };
  const pending = api.downloadXlsx(model);
  assert.ok(pending instanceof Promise, "it returns a promise");
  assert.equal(await pending, undefined);
  assert.deepEqual(dom.events, ["create", "append", "click", "remove"]);
  const blob = dom.blobs[0];
  assert.equal(blob.type, XLSX_MIME);
  assert.equal(dom.links[0].download, "portfolio- FY25.xlsx");
  const files = readZip(new Uint8Array(await blob.arrayBuffer()));
  const names = files.map((f) => f.name);
  for (const required of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]) assert.ok(names.includes(required), `${required} is in the file (${names.join(", ")})`);
  const sheet = new TextDecoder().decode(files.find((f) => f.name === "xl/worksheets/sheet1.xml")?.data);
  assert.ok(sheet.includes("1500000.5"));
  dom.tick(1000);
  assert.equal(dom.events.at(-1), "revoke blob:fake/1");
});

test("downloadXlsx rejects with a readable Error when the workbook cannot be built, and saves nothing", async (t) => {
  const dom = installFakeDom(t);
  const rows = new Array<Array<string | number>>(1_048_576).fill([1]); // plus the header row: one too many
  await assert.rejects(
    api.downloadXlsx({ fileName: "big.xlsx", sheets: [{ name: "Big", columns: ["A"], rows }] }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^Could not create the workbook: Sheet "Big" has 1,048,577 rows but an Excel sheet holds at most 1,048,576\./);
      assert.ok(error.cause instanceof Error);
      return true;
    },
  );
  assert.deepEqual(dom.events, []);
});

test("downloadXlsx rejects, rather than throws, when it fails right away", (t) => {
  installFakeDom(t, { noDocument: true });
  const pending = api.downloadXlsx({ fileName: "a.xlsx", sheets: [{ name: "A", columns: ["a"], rows: [[1]] }] });
  assert.ok(pending instanceof Promise);
  return assert.rejects(pending, /^Error: Could not create the workbook: document is not defined$/);
});

// ------------------------------------------------------------------------------------------------------------- downloadPdf

test("downloadPdf renders the document with the standalone pdfkit build and saves it", async (t) => {
  // pdfkit's standalone build schedules its own timers, so they are left alone here; the URL is released by the real timer a second later.
  const dom = installFakeDom(t, { fakeTimers: false });
  const doc: DocModel = {
    fileName: "Statement: FY25/final.pdf",
    title: "Index test document",
    subtitle: "Harbourline Office Trust",
    blocks: [{ kind: "heading", text: "Summary" }, { kind: "paragraph", text: "Hello from the entry point \u2014 A$1,234.00 \u2212 \u2192 done." }],
  };
  const pending = api.downloadPdf(doc);
  assert.ok(pending instanceof Promise, "it returns a promise");
  assert.equal(await pending, undefined);
  assert.deepEqual(dom.events, ["create", "append", "click", "remove"], "the URL is not released until a second later");
  const blob = dom.blobs[0];
  assert.equal(blob.type, "application/pdf");
  assert.equal(dom.links[0].download, "Statement- FY25final.pdf");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(new TextDecoder("latin1").decode(bytes.slice(0, 5)), "%PDF-");
  assertValidPdfStructure(bytes);
  const pdf = parsePdf(bytes);
  assert.equal(pdf.pages.length, 1);
  const text = documentText(pdf);
  assert.ok(text.includes("Index test document") && text.includes("Summary"));
  assert.ok(text.includes("Hello from the entry point \u2014 A$1,234.00 - -> done."), "the text went through the WinAnsi mapping");
  assert.equal(pdf.info.Title, "Index test document");
});

test("downloadPdf rejects with a readable Error that keeps the cause, and saves nothing", async (t) => {
  const dom = installFakeDom(t, { fakeTimers: false });
  const doc = { fileName: "x.pdf", get title(): string { throw new Error("title exploded"); }, blocks: [] } as unknown as DocModel;
  await assert.rejects(api.downloadPdf(doc), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Could not create the PDF: title exploded");
    assert.ok(error.cause instanceof Error && error.cause.message === "title exploded");
    return true;
  });
  assert.deepEqual(dom.events, []);
});
