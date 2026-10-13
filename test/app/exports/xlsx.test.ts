import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import type { WorkbookModel } from "../../../src/domain/types.ts";
import { buildXlsx, columnRef, sanitizeSheetNames, stripIllegalXml, XLSX_LIMITS } from "../../../src/app/exports/xlsx.ts";
import { readZip } from "./zip-reader.ts";
import type { ZipFile } from "./zip-reader.ts";
import { assertWellFormedXml, decodeSpreadsheetEscapes, decodeUtf8Strict, decodeXml } from "./xml-check.ts";

// ---------------------------------------------------------------------------------------------------- helpers

const part = (zip: ZipFile[], name: string): string => {
  const file = zip.find((f) => f.name === name);
  assert.ok(file, `missing part ${name}`);
  return decodeUtf8Strict(file.data);
};

interface Cell {
  ref: string;
  style: number;
  kind: "text" | "number";
  value: string | number;
  preserve: boolean;
  raw: string; // the text exactly as written in the XML (still escaped)
}

const columnIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Reads the cells of a worksheet part, checking on the way that rows and cells are in the ascending order Excel requires. */
function readSheet(xml: string): Map<string, Cell> {
  const cells = new Map<string, Cell>();
  let lastRow = 0;
  for (const row of xml.matchAll(/<row r="(\d+)"(?:\/>|>(.*?)<\/row>)/gs)) {
    const rowNumber = Number(row[1]);
    assert.ok(rowNumber > lastRow, `row ${rowNumber} is out of order`);
    lastRow = rowNumber;
    let lastColumn = -1;
    for (const c of (row[2] ?? "").matchAll(/<c r="([A-Z]+)(\d+)"((?: [a-zA-Z]+="[^"]*")*)(?:\/>|>(.*?)<\/c>)/gs)) {
      assert.equal(Number(c[2]), rowNumber, `cell ${c[1]}${c[2]} sits in row ${rowNumber}`);
      const column = columnIndex(c[1]);
      assert.ok(column > lastColumn, `cell ${c[1]}${c[2]} is out of order`);
      lastColumn = column;
      const attributes = Object.fromEntries([...c[3].matchAll(/ ([a-zA-Z]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
      const inner = c[4] ?? "";
      const ref = `${c[1]}${c[2]}`;
      const style = Number(attributes.s ?? 0);
      if (attributes.t === "inlineStr") {
        const t = /^<is><t( xml:space="preserve")?>(.*)<\/t><\/is>$/s.exec(inner);
        assert.ok(t, `cell ${ref} is not a plain inline string: ${inner}`);
        cells.set(ref, { ref, style, kind: "text", value: decodeSpreadsheetEscapes(decodeXml(t[2])), preserve: t[1] !== undefined, raw: t[2] });
      } else {
        assert.equal(attributes.t, undefined, `cell ${ref} has an unexpected type ${attributes.t}`);
        const v = /^<v>([^<]*)<\/v>$/.exec(inner);
        assert.ok(v, `cell ${ref} is neither a string nor a number: ${inner}`);
        cells.set(ref, { ref, style, kind: "number", value: Number(v[1]), preserve: false, raw: v[1] });
      }
    }
  }
  return cells;
}

const sheetXml = (zip: ZipFile[], n: number) => part(zip, `xl/worksheets/sheet${n}.xml`);

// ---------------------------------------------------------------------------------------------------- a three-sheet workbook

const WIDE_COLUMNS = Array.from({ length: 30 }, (_, i) => `Column ${i + 1}`);

const SPECIAL_ROWS: Array<Array<string | number>> = [
  [`a & b < c > d "q" 'a'`, 1234.5],
  ["\u00dcn\u00efcode \u2014 A$1,234.56 \u{1F600} \u65e5\u672c\u8a9e", -0.25],
  ["  padded  ", 0],
  ["line1\nline2\ttab\r\nline3", 1e21],
  ["bad\u0000\u0001\u0008\u000b\u000c\u000e\ufffe\uffff\ud800 chars\ud83d\ude00", Number.NaN],
  ["_x0041_ and _x005F_x0041_ and x_x0041_y _X0042_ _x0041_x0042_", Number.POSITIVE_INFINITY],
  ["=1+1", Number.NEGATIVE_INFINITY],
  ["+SUM(A1)", ""],
  ["-5 apples", "@cmd"],
  ["\t=tab", "\u2212A$5"],
];

const BRIEF_MODEL: WorkbookModel = {
  fileName: "workbook.xlsx",
  sheets: [
    { name: "Wide", columns: WIDE_COLUMNS, rows: [WIDE_COLUMNS.map((_, i) => i + 0.5), WIDE_COLUMNS.map((_, i) => `r2c${i + 1}`)] },
    { name: "Q1/Q2: [draft]?", columns: ["Text", "Amount"], rows: SPECIAL_ROWS },
    { name: "Empty", columns: [], rows: [] },
  ],
};

test("package: required parts, store-only entries, valid CRC-32 and a fixed DOS date", () => {
  const bytes = buildXlsx(BRIEF_MODEL);
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");
  const zip = readZip(bytes); // verifies headers, central directory, CRC-32 (two implementations) and that no bytes are left over
  assert.deepEqual(zip.map((f) => f.name), [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/styles.xml",
    "xl/worksheets/sheet1.xml",
    "xl/worksheets/sheet2.xml",
    "xl/worksheets/sheet3.xml",
  ]);
  for (const f of zip) {
    assert.equal(f.method, 0, `${f.name} is stored`);
    assert.equal(f.dosDate, (1 << 5) | 1, `${f.name} has the DOS epoch date 1980-01-01`);
    assert.equal(f.dosTime, 0);
    assert.ok(f.data.length > 0);
  }
});

test("package: every XML part is well formed, valid UTF-8 and without a BOM", () => {
  const zip = readZip(buildXlsx(BRIEF_MODEL));
  const roots = new Map<string, string>();
  for (const f of zip) {
    const xml = decodeUtf8Strict(f.data);
    assert.ok(!xml.startsWith("\uFEFF"), `${f.name} has no BOM`);
    roots.set(f.name, assertWellFormedXml(xml, f.name));
  }
  assert.equal(roots.get("[Content_Types].xml"), "Types");
  assert.equal(roots.get("_rels/.rels"), "Relationships");
  assert.equal(roots.get("xl/workbook.xml"), "workbook");
  assert.equal(roots.get("xl/styles.xml"), "styleSheet");
  assert.equal(roots.get("xl/worksheets/sheet2.xml"), "worksheet");
});

test("package: relationships and content types point at parts that exist", () => {
  const zip = readZip(buildXlsx(BRIEF_MODEL));
  const names = new Set(zip.map((f) => f.name));

  const rootRels = part(zip, "_rels/.rels");
  assert.match(rootRels, /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/officeDocument" Target="xl\/workbook\.xml"/);

  const workbook = part(zip, "xl/workbook.xml");
  const rels = new Map([...part(zip, "xl/_rels/workbook.xml.rels").matchAll(/<Relationship Id="(rId\d+)" Type="[^"]*\/(\w+)" Target="([^"]+)"\/>/g)].map((m) => [m[1], { type: m[2], target: m[3] }]));
  const sheets = [...workbook.matchAll(/<sheet name="([^"]*)" sheetId="(\d+)" r:id="(rId\d+)"\/>/g)];
  assert.equal(sheets.length, 3);
  sheets.forEach((s, i) => {
    assert.equal(Number(s[2]), i + 1, "sheetId is 1-based and sequential");
    const rel = rels.get(s[3]);
    assert.ok(rel, `relationship ${s[3]} exists`);
    assert.equal(rel.type, "worksheet");
    assert.ok(names.has(`xl/${rel.target}`), `${rel.target} is in the package`);
  });
  const stylesRel = [...rels.values()].find((r) => r.type === "styles");
  assert.equal(stylesRel?.target, "styles.xml");

  const types = part(zip, "[Content_Types].xml");
  assert.match(types, /<Default Extension="rels" ContentType="application\/vnd\.openxmlformats-package\.relationships\+xml"\/>/);
  assert.match(types, /<Override PartName="\/xl\/workbook\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml"\/>/);
  assert.match(types, /<Override PartName="\/xl\/styles\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.styles\+xml"\/>/);
  for (let n = 1; n <= 3; n++) {
    assert.ok(types.includes(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`));
  }
});

test("styles: bold header, #,##0.00 with red negatives, default font", () => {
  const styles = part(readZip(buildXlsx(BRIEF_MODEL)), "xl/styles.xml");
  assert.ok(styles.includes('formatCode="#,##0.00;[Red]-#,##0.00"'));
  assert.match(styles, /<fonts count="2"><font><sz val="11"\/><name val="Calibri"\/>/); // font 0 is the default, not bold
  assert.match(styles, /<font><b\/>/); // font 1 is bold
  assert.match(styles, /<cellXfs count="3">/);
  const zip = readZip(buildXlsx(BRIEF_MODEL));
  for (let n = 1; n <= 3; n++) {
    for (const s of sheetXml(zip, n).matchAll(/ s="(\d+)"/g)) assert.ok(Number(s[1]) < 3, `style ${s[1]} exists`);
  }
});

test("sheet 1 (30 columns): references past Z are AA, AB... and cell types, styles and order are right", () => {
  const zip = readZip(buildXlsx(BRIEF_MODEL));
  const xml = sheetXml(zip, 1);
  assert.ok(xml.includes('<dimension ref="A1:AD3"/>'));
  const cells = readSheet(xml);
  assert.equal(cells.size, 90);

  for (const ref of ["A1", "Z1", "AA1", "AB1", "AC1", "AD1"]) {
    const cell = cells.get(ref);
    assert.ok(cell, `${ref} exists`);
    assert.equal(cell.kind, "text");
    assert.equal(cell.style, 1, `${ref} uses the bold header style`);
  }
  assert.equal(cells.get("Z1")?.value, "Column 26");
  assert.equal(cells.get("AA1")?.value, "Column 27");
  assert.equal(cells.get("AB1")?.value, "Column 28");
  assert.equal(cells.get("AD1")?.value, "Column 30");

  assert.deepEqual({ ...cells.get("A2") }, { ref: "A2", style: 2, kind: "number", value: 0.5, preserve: false, raw: "0.5" });
  assert.equal(cells.get("Z2")?.value, 25.5);
  assert.equal(cells.get("AA2")?.value, 26.5);
  assert.equal(cells.get("AD2")?.value, 29.5);
  assert.equal(cells.get("AA3")?.value, "r2c27");
  assert.equal(cells.get("AA3")?.style, 0);
  assert.equal(cells.get("AB3")?.kind, "text");
  assert.ok(!xml.includes('r="AE1"'), "nothing beyond AD");

  assert.equal((xml.match(/<col /g) ?? []).length, 30);
  assert.ok(xml.includes('<col min="27" max="27" width="'));
  assert.ok(xml.includes('<autoFilter ref="A1:AD3"/>'));
});

test("sheet 2: special characters are escaped, illegal XML characters stripped, text and numbers keep their value", () => {
  const zip = readZip(buildXlsx(BRIEF_MODEL));
  const xml = sheetXml(zip, 2);
  assertWellFormedXml(xml, "sheet2");
  const cells = readSheet(xml);

  assert.equal(cells.get("A1")?.value, "Text");
  assert.equal(cells.get("B1")?.value, "Amount");
  assert.equal(cells.get("A2")?.value, `a & b < c > d "q" 'a'`);
  assert.ok(cells.get("A2")?.raw.includes("a &amp; b &lt; c &gt; d"), "markup characters are escaped in the file");
  assert.equal(cells.get("A3")?.value, "\u00dcn\u00efcode \u2014 A$1,234.56 \u{1F600} \u65e5\u672c\u8a9e");
  assert.equal(cells.get("A4")?.value, "  padded  ");
  assert.equal(cells.get("A4")?.preserve, true, "leading and trailing blanks need xml:space=preserve");
  assert.equal(cells.get("A3")?.preserve, false);
  assert.equal(cells.get("A5")?.value, "line1\nline2\ttab\r\nline3");
  assert.equal(cells.get("A5")?.preserve, true);
  assert.ok(cells.get("A5")?.raw.includes("&#13;"), "a carriage return survives XML end-of-line normalisation");
  assert.equal(cells.get("A6")?.value, "bad chars\u{1F600}", "controls, U+FFFE/U+FFFF and a lone surrogate are removed, a valid pair stays");

  // "_xHHHH_" look-alikes must read back as typed, also when they touch each other
  assert.equal(cells.get("A7")?.value, "_x0041_ and _x005F_x0041_ and x_x0041_y _X0042_ _x0041_x0042_");
  assert.ok(cells.get("A7")?.raw.startsWith("_x005F_x0041_ and "));

  // formula guard: strings only
  assert.equal(cells.get("A8")?.value, "'=1+1");
  assert.equal(cells.get("A9")?.value, "'+SUM(A1)");
  assert.equal(cells.get("A10")?.value, "'-5 apples");
  assert.equal(cells.get("B10")?.value, "'@cmd");
  assert.equal(cells.get("A11")?.value, "'\t=tab");
  assert.equal(cells.get("B11")?.value, "\u2212A$5", "the typographic minus is not a formula character");

  // numbers are numbers (style 2); NaN, +/-Infinity and "" leave the cell out
  assert.equal(cells.get("B2")?.kind, "number");
  assert.equal(cells.get("B2")?.style, 2);
  assert.equal(cells.get("B2")?.value, 1234.5);
  assert.equal(cells.get("B3")?.value, -0.25);
  assert.equal(cells.get("B4")?.value, 0);
  assert.equal(cells.get("B5")?.value, 1e21);
  for (const ref of ["B6", "B7", "B8", "B9"]) assert.ok(!cells.has(ref), `${ref} is empty`);
  assert.ok(!xml.includes("NaN") && !xml.includes("Infinity"));
});

test("numbers are written so that they read back exactly", () => {
  const values = [0, 1, -1, 0.1 + 0.2, 1234567.891, -98765.4321, 1e21, 1e-7, 123456789012345678, Number.MAX_SAFE_INTEGER, Number.MIN_VALUE, Number.MAX_VALUE, 5e-324];
  const model: WorkbookModel = { fileName: "n.xlsx", sheets: [{ name: "N", columns: ["v"], rows: [...values, -0].map((v) => [v]) }] };
  const cells = readSheet(sheetXml(readZip(buildXlsx(model)), 1));
  values.forEach((v, i) => {
    const cell = cells.get(`A${i + 2}`);
    assert.ok(cell, `A${i + 2} exists`);
    assert.equal(cell.value, v, `value ${v}`);
    assert.match(cell.raw, /^-?\d+(\.\d+)?(e[+-]\d+)?$/, `${cell.raw} is a plain number literal`);
  });
  assert.equal(cells.get(`A${values.length + 2}`)?.raw, "0", "negative zero is written as 0");
});

test("sheet 3 (no columns, no rows): a valid empty sheet without header machinery", () => {
  const zip = readZip(buildXlsx(BRIEF_MODEL));
  const xml = sheetXml(zip, 3);
  assertWellFormedXml(xml, "sheet3");
  assert.ok(xml.includes('<dimension ref="A1"/>'));
  assert.ok(xml.includes("<sheetData></sheetData>"));
  assert.ok(!xml.includes("<pane"));
  assert.ok(!xml.includes("<autoFilter"));
  assert.ok(!xml.includes("<cols>"));
  assert.equal(readSheet(xml).size, 0);
});

test("header row: frozen pane, auto-filter, bold style, first sheet selected, defined filter names", () => {
  const zip = readZip(buildXlsx(BRIEF_MODEL));
  const wide = sheetXml(zip, 1);
  const special = sheetXml(zip, 2);
  assert.ok(wide.includes('<sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'));
  assert.ok(special.includes('<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'));
  assert.ok(special.includes('<autoFilter ref="A1:B11"/>'));
  // schema order of the worksheet children
  const order = ["<dimension", "<sheetViews>", "<sheetFormatPr", "<cols>", "<sheetData>", "<autoFilter"].map((tag) => special.indexOf(tag));
  assert.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])), `child order ${order.join(",")}`);

  const workbook = part(zip, "xl/workbook.xml");
  assert.ok(workbook.includes('<bookViews><workbookView activeTab="0"/></bookViews>'));
  assert.ok(workbook.includes(`<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Wide'!$A$1:$AD$3</definedName>`));
  assert.ok(workbook.includes(`<definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">'Q1-Q2 draft'!$A$1:$B$11</definedName>`));
  assert.equal((workbook.match(/_xlnm\._FilterDatabase/g) ?? []).length, 2, "none for the empty sheet");
});

test("column widths come from the content with sensible limits", () => {
  const model: WorkbookModel = {
    fileName: "w.xlsx",
    sheets: [{
      name: "Widths",
      columns: ["A", "Reporting period", "Long", "Amount"],
      rows: [["x".repeat(100), 1, "y".repeat(5), 1234567.891], ["short", 2, "line one\nline two is longer", -1234.5]],
    }],
  };
  const xml = sheetXml(readZip(buildXlsx(model)), 1);
  const widths = [...xml.matchAll(/<col min="(\d+)" max="(\d+)" width="([\d.]+)" customWidth="1"\/>/g)].map((m) => {
    assert.equal(m[1], m[2]);
    return Number(m[3]);
  });
  assert.deepEqual(widths, [
    60, // "x" x 100 is capped
    20.4, // the bold header "Reporting period" (16 x 1.15 + 2) is the widest content
    20, // the longest line of the multi-line cell ("line two is longer", 18 characters) + 2
    14, // "1,234,567.89" is 12 characters wide
  ]);
  const tiny = sheetXml(readZip(buildXlsx({ fileName: "t.xlsx", sheets: [{ name: "T", columns: ["a"], rows: [["b"]] }] })), 1);
  assert.ok(tiny.includes('width="8.43"'), "never narrower than Excel's default");
});

test("sheets without a header row and sparse rows", () => {
  const model: WorkbookModel = {
    fileName: "s.xlsx",
    sheets: [{
      name: "Bare",
      columns: [],
      rows: [[1, 2], [3], [], ["x", undefined as unknown as number, null as unknown as string, "z"]],
    }],
  };
  const zip = readZip(buildXlsx(model));
  const xml = sheetXml(zip, 1);
  assertWellFormedXml(xml, "bare");
  assert.ok(xml.includes('<dimension ref="A1:D4"/>'));
  assert.ok(!xml.includes("<pane") && !xml.includes("<autoFilter"));
  assert.ok(xml.includes('<row r="3"/>'), "an empty row is kept so later rows keep their numbers");
  const cells = readSheet(xml);
  assert.equal(cells.get("A1")?.value, 1);
  assert.equal(cells.get("A1")?.style, 2);
  assert.equal(cells.get("A2")?.value, 3);
  assert.equal(cells.get("A4")?.value, "x");
  assert.equal(cells.get("D4")?.value, "z");
  assert.ok(!cells.has("B4") && !cells.has("C4"), "undefined and null leave the cell empty");
  assert.ok(!part(zip, "xl/workbook.xml").includes("_FilterDatabase"));
});

test("a workbook without sheets still has one (Excel rejects none)", () => {
  const zip = readZip(buildXlsx({ fileName: "e.xlsx", sheets: [] }));
  const workbook = part(zip, "xl/workbook.xml");
  assertWellFormedXml(workbook, "workbook");
  assert.equal((workbook.match(/<sheet /g) ?? []).length, 1);
  assert.ok(workbook.includes('<sheet name="Sheet1" sheetId="1" r:id="rId1"/>'));
  assertWellFormedXml(sheetXml(zip, 1), "sheet1");
});

test("a header-only sheet is valid and keeps the auto-filter on the header", () => {
  const zip = readZip(buildXlsx({ fileName: "h.xlsx", sheets: [{ name: "H", columns: ["a", "b"], rows: [] }] }));
  const xml = sheetXml(zip, 1);
  assert.ok(xml.includes('<dimension ref="A1:B1"/>'));
  assert.ok(xml.includes('<autoFilter ref="A1:B1"/>'));
  assert.ok(part(zip, "xl/workbook.xml").includes("'H'!$A$1:$B$1"));
});

test("sheet names in the workbook are sanitised and unique", () => {
  const model: WorkbookModel = {
    fileName: "names.xlsx",
    sheets: ["Q1/Q2: [draft]?", "Q1-Q2 draft", "  ", "History", "Bob's <R&D> \"plan\"", "x".repeat(50)].map((name) => ({ name, columns: ["a"], rows: [[1]] })),
  };
  const zip = readZip(buildXlsx(model));
  const workbook = part(zip, "xl/workbook.xml");
  assertWellFormedXml(workbook, "workbook");
  const names = [...workbook.matchAll(/<sheet name="([^"]*)"/g)].map((m) => decodeXml(m[1]));
  assert.deepEqual(names, ["Q1-Q2 draft", "Q1-Q2 draft (2)", "Sheet3", "History_", "Bob's <R&D> \"plan\"", "x".repeat(31)]);
  assert.ok(workbook.includes(`'Bob''s &lt;R&amp;D&gt; "plan"'!$A$1:$A$2`), "the quote in a sheet name is doubled inside the defined name");
});

test("sanitizeSheetNames: forbidden characters, length, blanks, reserved and duplicate names", () => {
  const cases: Array<[string[], string[]]> = [
    [["Report"], ["Report"]],
    [["a:b*c?d[e]f/g\\h"], ["abcdef-g-h"]],
    [["'quoted'"], ["quoted"]],
    [["it's"], ["it's"]],
    [["", "   ", "[]", "?:*"], ["Sheet1", "Sheet2", "Sheet3", "Sheet4"]],
    [["History", "history", "HISTORY"], ["History_", "history_ (2)", "HISTORY_ (3)"]],
    [["Report", "report", "REPORT"], ["Report", "report (2)", "REPORT (3)"]],
    [["Totals", "Totals (2)", "Totals"], ["Totals", "Totals (2)", "Totals (3)"]],
    [["A".repeat(40)], ["A".repeat(31)]],
    [["A".repeat(40), "A".repeat(40), "A".repeat(31)], ["A".repeat(31), `${"A".repeat(27)} (2)`, `${"A".repeat(27)} (3)`]],
    [["tab\tand\nnewline", "ctl\u0000\u0007chars"], ["tab and newline", "ctlchars"]],
    [["a".repeat(30) + "\u{1F600}"], ["a".repeat(30)]], // never splits a surrogate pair
    [["x".repeat(29) + " 'y"], ["x".repeat(29)]], // no trailing blank or apostrophe after cutting
    [["  padded   name  "], ["padded name"]],
  ];
  for (const [input, expected] of cases) assert.deepEqual(sanitizeSheetNames(input), expected, JSON.stringify(input));

  const stress = sanitizeSheetNames(["a/b", "a-b", "A-B", ..."abcdefghij".split("").map(() => "same"), "x".repeat(31), "x".repeat(31), "x".repeat(32)]);
  assert.equal(new Set(stress.map((n) => n.toLowerCase())).size, stress.length, "all names are unique ignoring case");
  for (const n of stress) {
    assert.ok(n.length >= 1 && n.length <= XLSX_LIMITS.maxSheetNameChars, n);
    assert.ok(!/[[\]:*?/\\]/.test(n), n);
    assert.ok(!n.startsWith("'") && !n.endsWith("'"), n);
  }
});

test("columnRef and stripIllegalXml", () => {
  const refs: Array<[number, string]> = [[0, "A"], [1, "B"], [25, "Z"], [26, "AA"], [27, "AB"], [51, "AZ"], [52, "BA"], [701, "ZZ"], [702, "AAA"], [16383, "XFD"]];
  for (const [index, ref] of refs) assert.equal(columnRef(index), ref);
  assert.equal(stripIllegalXml("ok \t\n\r"), "ok \t\n\r");
  assert.equal(stripIllegalXml("a\u0000b\u000bc\u000cd\u001fe\ufffef\uffffg"), "abcdefg");
  assert.equal(stripIllegalXml("\ud83d\ude00 x \ud83d y \ude00 z"), "\u{1F600} x  y  z", "valid pairs stay, lone surrogates go");
  assert.equal(stripIllegalXml("\ud7ff\ue000\ufffd"), "\ud7ff\ue000\ufffd");
});

test("deterministic: the same model gives identical bytes, a different one does not", () => {
  const a = buildXlsx(BRIEF_MODEL);
  const b = buildXlsx(structuredClone(BRIEF_MODEL));
  assert.deepEqual(a, b);
  const changed = structuredClone(BRIEF_MODEL);
  changed.sheets[0].rows[0][0] = 99;
  assert.notDeepEqual(buildXlsx(changed), a);
});

test("limits: too many rows, columns or characters throw a readable error", () => {
  const rows = new Array<Array<string | number>>(XLSX_LIMITS.maxRows).fill([1]);
  assert.throws(() => buildXlsx({ fileName: "x.xlsx", sheets: [{ name: "Big", columns: ["A"], rows }] }), (error: Error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Sheet "Big" has 1,048,577 rows but an Excel sheet holds at most 1,048,576\./);
    return true;
  });
  assert.throws(() => buildXlsx({ fileName: "x.xlsx", sheets: [{ name: "Wide", columns: new Array<string>(XLSX_LIMITS.maxColumns + 1).fill("c"), rows: [] }] }), /Sheet "Wide" has 16,385 columns but an Excel sheet holds at most 16,384\./);
  assert.throws(() => buildXlsx({ fileName: "x.xlsx", sheets: [{ name: "Cols", columns: ["a"], rows: [new Array<number>(XLSX_LIMITS.maxColumns + 1).fill(1)] }] }), /16,385 columns/);
  assert.throws(
    () => buildXlsx({ fileName: "x.xlsx", sheets: [{ name: "Text", columns: ["a"], rows: [["x".repeat(XLSX_LIMITS.maxCellChars + 1)]] }] }),
    /Cell A2 on sheet "Text" has 32,768 characters but an Excel cell holds at most 32,767\./,
  );
  assert.throws(
    () => buildXlsx({ fileName: "x.xlsx", sheets: [{ name: "Text", columns: ["a"], rows: [["=" + "x".repeat(XLSX_LIMITS.maxCellChars - 1)]] }] }),
    /32,768 characters/,
    "the guard apostrophe counts towards the limit",
  );
});

test("limits: exactly at the limits is fine", () => {
  const emptyRows = new Array<Array<string | number>>(XLSX_LIMITS.maxRows - 1).fill([]);
  assert.doesNotThrow(() => buildXlsx({ fileName: "x.xlsx", sheets: [{ name: "Rows", columns: ["A"], rows: emptyRows }] }));
  const wide = buildXlsx({ fileName: "x.xlsx", sheets: [{ name: "Cols", columns: new Array<string>(XLSX_LIMITS.maxColumns).fill("c"), rows: [] }] });
  const xml = sheetXml(readZip(wide), 1);
  assert.ok(xml.includes('<dimension ref="A1:XFD1"/>'));
  const longText = "x".repeat(XLSX_LIMITS.maxCellChars);
  const cells = readSheet(sheetXml(readZip(buildXlsx({ fileName: "x.xlsx", sheets: [{ name: "Text", columns: ["a"], rows: [[longText]] }] })), 1));
  assert.equal((cells.get("A2")?.value as string).length, XLSX_LIMITS.maxCellChars);
});

test("a larger table (20,000 rows x 10 columns) builds into a valid archive", () => {
  const rows = Array.from({ length: 20_000 }, (_, r) => Array.from({ length: 10 }, (_, c) => (c % 2 === 0 ? r * 10 + c + 0.25 : `row ${r} col ${c}`)));
  const model: WorkbookModel = { fileName: "big.xlsx", sheets: [{ name: "Big", columns: Array.from({ length: 10 }, (_, c) => `C${c}`), rows }] };
  const zip = readZip(buildXlsx(model));
  const xml = sheetXml(zip, 1);
  assert.ok(xml.includes('<dimension ref="A1:J20001"/>'));
  assert.ok(xml.includes('<autoFilter ref="A1:J20001"/>'));
  assert.equal((xml.match(/<row /g) ?? []).length, 20_001);
  assertWellFormedXml(xml, "big");
});

// ---------------------------------------------------------------------------------------------------- optional: a real reader

function hasOpenpyxl(): boolean {
  const probe = spawnSync("python", ["-c", "import openpyxl"], { encoding: "utf8", timeout: 15_000 });
  return !probe.error && probe.status === 0;
}

// Bonus check, registered only when Python with openpyxl is installed (nothing is reported otherwise).
if (hasOpenpyxl()) {
  test("openpyxl loads the generated workbook and sees the same sheets and values", () => {
    const script = [
      "import io, json, sys, openpyxl",
      "wb = openpyxl.load_workbook(io.BytesIO(sys.stdin.buffer.read()))",
      "print(json.dumps({ws.title: [[c.value for c in row] for row in ws.iter_rows()] for ws in wb.worksheets}))",
    ].join("\n");
    const run = spawnSync("python", ["-c", script], { input: Buffer.from(buildXlsx(BRIEF_MODEL)), encoding: "utf8", timeout: 60_000 });
    assert.equal(run.status, 0, run.stderr);
    const sheets = JSON.parse(run.stdout) as Record<string, unknown[][]>;
    assert.deepEqual(Object.keys(sheets), ["Wide", "Q1-Q2 draft", "Empty"]);
    assert.equal(sheets.Wide[0][29], "Column 30");
    assert.equal(sheets.Wide[1][26], 26.5);
    assert.equal(sheets["Q1-Q2 draft"][1][0], `a & b < c > d "q" 'a'`);
    assert.equal(sheets["Q1-Q2 draft"][7][0], "'=1+1");
  });
}
