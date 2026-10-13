import { test } from "node:test";
import assert from "node:assert/strict";
import type { CsvModel } from "../../../src/domain/types.ts";
import { csvText } from "../../../src/app/exports/csv.ts";
import { guardFormula, plainNumber } from "../../../src/app/exports/cells.ts";

const csv = (columns: string[], rows: Array<Array<string | number>>): string => csvText({ fileName: "t.csv", columns, rows });

/** A small RFC 4180 reader (CRLF records, quoted fields) used to prove that what we write reads back as intended. */
function parseCsv(text: string): string[][] {
  assert.ok(text.startsWith("\uFEFF"), "starts with a BOM");
  const input = text.slice(1);
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false;
        i++;
        assert.ok(input[i] === "," || input[i] === "\r", "a closing quote is followed by a separator");
        continue;
      }
      field += ch;
      i++;
    } else if (ch === '"') {
      assert.equal(field, "", "a quote may only open a field");
      quoted = true;
      i++;
    } else if (ch === ",") {
      record.push(field);
      field = "";
      i++;
    } else if (ch === "\r") {
      assert.equal(input[i + 1], "\n", "CR is always followed by LF outside quotes");
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      i += 2;
    } else {
      assert.notEqual(ch, "\n", "a bare LF outside quotes");
      field += ch;
      i++;
    }
  }
  assert.equal(quoted, false, "no unterminated quote");
  assert.equal(field === "" && record.length === 0, true, "the last record is terminated by CRLF");
  return records;
}

test("starts with a UTF-8 BOM and ends every record, the last included, with CRLF", () => {
  const text = csv(["A", "B"], [[1, "x"], [2, "y"]]);
  assert.equal(text, "\uFEFFA,B\r\n1,x\r\n2,y\r\n");
  assert.deepEqual([...new TextEncoder().encode(text).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(!text.replace(/\r\n/g, "").includes("\n"), "no bare LF");
  assert.ok(!text.replace(/\r\n/g, "").includes("\r"), "no bare CR");
});

test("quotes fields that contain a comma, a double quote, CR or LF, and doubles the quotes", () => {
  const text = csv(["plain", "comma", "quote", "lf", "cr", "crlf", "both"], [["a b", "a,b", 'say "hi"', "l1\nl2", "c1\rc2", "d1\r\nd2", 'x,"y"\n']]);
  assert.equal(text, '\uFEFFplain,comma,quote,lf,cr,crlf,both\r\na b,"a,b","say ""hi""","l1\nl2","c1\rc2","d1\r\nd2","x,""y""\n"\r\n');
  assert.deepEqual(parseCsv(text)[1], ["a b", "a,b", 'say "hi"', "l1\nl2", "c1\rc2", "d1\r\nd2", 'x,"y"\n']);
  // headers are quoted by the same rule
  assert.equal(csv(["a,b", 'c"d'], []), '\uFEFF"a,b","c""d"\r\n');
  assert.equal(csv(["x"], [['"']]), '\uFEFFx\r\n""""\r\n');
  assert.equal(csv(["x"], [[" lead and trail "]]), "\uFEFFx\r\n lead and trail \r\n", "spaces alone need no quotes");
});

test("numbers are plain decimals: no grouping, '.' decimal point, no exponent; NaN and Infinity are empty", () => {
  const row = [1234567.891, -42, 0, -0, 0.5, 1e21, 1.5e21, 1e-7, 1.234e-9, 0.1 + 0.2, 123456789012345680000, Number.MAX_SAFE_INTEGER, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const expected = ["1234567.891", "-42", "0", "0", "0.5", "1000000000000000000000", "1500000000000000000000", "0.0000001", "0.000000001234", "0.30000000000000004", "123456789012345680000", "9007199254740991", "", "", ""];
  const text = csv(row.map((_, i) => `c${i}`), [row]);
  assert.deepEqual(parseCsv(text)[1], expected);
  for (const field of expected) assert.ok(!/e/i.test(field), `${field} has no exponent`);
});

test("plainNumber matches Number() for the magnitudes in play and never uses an exponent", () => {
  const samples = [0, 1, -1, 12.5, -0.000123, 1e6, 123456789.123456, 5e-7, 1e-10, -1e-10, 2 ** 53, 1e20, 1e21, 9.99e22, 1e300, 1.7976931348623157e308, 5e-324];
  for (const n of samples) {
    const s = plainNumber(n);
    assert.ok(/^-?\d+(\.\d+)?$/.test(s), `${s} is a plain decimal`);
    assert.equal(Number(s), n, `${s} reads back as ${n}`);
  }
  assert.equal(plainNumber(1e21), "1000000000000000000000");
  assert.equal(plainNumber(-1.5e-7), "-0.00000015");
  assert.equal(plainNumber(Number.NaN), "");
  assert.equal(plainNumber(Number.POSITIVE_INFINITY), "");
});

test("missing cells (undefined, null) are empty and short rows are padded to the header width", () => {
  const text = csv(["a", "b", "c"], [[1, undefined as unknown as string, null as unknown as string], ["only"], []]);
  assert.equal(text, "\uFEFFa,b,c\r\n1,,\r\nonly,,\r\n,,\r\n");
  assert.equal(csv(["a"], [["x", "extra"]]), "\uFEFFa\r\nx,extra\r\n", "cells beyond the header are kept");
});

test("formula-injection guard: a string starting with = + - @ TAB or CR gets a leading apostrophe", () => {
  const strings = ["=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\rcmd", "=HYPERLINK(\"http://x\")", "-", "=", "+cmd|' /C calc'!A0", "@"];
  const text = csv(strings.map((_, i) => `c${i}`), [strings]);
  const [, row] = parseCsv(text);
  assert.deepEqual(row, strings.map((s) => `'${s}`));
  // already safe or merely similar strings are untouched
  const safe = ["'=1", " =1", "1+1", "a=b", "x-y", "\u2212A$1,234.00", "\u2013 dash", "", "0", "A$-5"];
  assert.deepEqual(parseCsv(csv(safe.map((_, i) => `c${i}`), [safe]))[1], safe);
});

test("the guard applies to strings only: numbers (also negative ones) are written unchanged", () => {
  const text = csv(["n"], [[-5], [-0.25], [+7], ["-5"], ["-0.25"]]);
  assert.deepEqual(parseCsv(text).slice(1), [["-5"], ["-0.25"], ["7"], ["'-5"], ["'-0.25"]]);
});

test("the guard also covers headers, and combines with quoting", () => {
  const text = csv(["=bad", "+x,y", "ok"], [["=a,b", "-\"q\"", "@\nline"]]);
  assert.equal(text, "\uFEFF'=bad,\"'+x,y\",ok\r\n\"'=a,b\",\"'-\"\"q\"\"\",\"'@\nline\"\r\n");
  assert.deepEqual(parseCsv(text), [["'=bad", "'+x,y", "ok"], ["'=a,b", "'-\"q\"", "'@\nline"]]);
});

test("guardFormula in isolation", () => {
  for (const s of ["=", "+", "-", "@", "\t", "\r", "=A1", "\tx", "\r\nx"]) assert.equal(guardFormula(s), `'${s}`);
  for (const s of ["", "a", "'", "'=1", " =1", "\n=1", "\u2212", "0-0"]) assert.equal(guardFormula(s), s);
});

test("unicode survives: A$, em dash, accents, other scripts and astral characters", () => {
  const values = ["A$1,234.56", "\u2014", "\u00dcn\u00efcode", "\u65e5\u672c\u8a9e", "\u{1F600}", "\u2212A$5.00", "\u201cquoted\u201d \u2013 \u2022", "caf\u00e9\u00a0au\u202flait"];
  const text = csv(values.map((_, i) => `h${i}`), [values]);
  assert.deepEqual(parseCsv(text)[1], values);
  assert.ok(text.includes("\"A$1,234.56\""), "the comma forces quotes");
  assert.ok(text.includes(",\u2014,"));
  assert.ok(text.includes("\u00dcn\u00efcode"));
  // the file's bytes are UTF-8 with the BOM, and decode back to the same text
  const bytes = new TextEncoder().encode(text);
  assert.equal(new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }).decode(bytes), text);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test("edge cases: empty tables", () => {
  assert.equal(csv([], []), "\uFEFF");
  assert.equal(csv(["a", "b"], []), "\uFEFFa,b\r\n");
  assert.equal(csv([], [[1, 2]]), "\uFEFF1,2\r\n", "no header line without columns");
  assert.equal(csv(["only"], [[""]]), '\uFEFFonly\r\n""\r\n', "a record that is a single empty field is quoted so it is not read as a blank line");
  assert.equal(csv([""], []), '\uFEFF""\r\n');
  assert.equal(csv(["a", "b"], [["", ""]]), "\uFEFFa,b\r\n,\r\n");
});

test("round trip: random cells (separators, quotes, line breaks, formula characters, unicode) read back as the guarded text", () => {
  let seed = 123456789;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const alphabet = ["a", "Z", "0", " ", ",", '"', "\r", "\n", "\t", "=", "+", "-", "@", "'", "\u00e9", "\u2014", "\u2212", "\u{1F600}", ";", "\\", "/"];
  const randomString = () => Array.from({ length: Math.floor(next() * 8) }, () => alphabet[Math.floor(next() * alphabet.length)]).join("");
  const columns = ["c0", "c1", "c2", "c3"];
  const rows: Array<Array<string | number>> = Array.from({ length: 400 }, () => columns.map(() => (next() < 0.25 ? Math.round((next() - 0.5) * 2e7) / 100 : randomString())));
  const parsed = parseCsv(csv(columns, rows));
  assert.equal(parsed.length, rows.length + 1);
  rows.forEach((row, r) => {
    row.forEach((value, c) => {
      const expected = typeof value === "number" ? plainNumber(value) : guardFormula(value);
      assert.equal(parsed[r + 1][c], expected, `row ${r} column ${c}: ${JSON.stringify(value)}`);
    });
  });
});

test("the model is not changed", () => {
  const model: CsvModel = { fileName: "x.csv", columns: ["=a", "b"], rows: [["=1", -1], ["x"]] };
  const snapshot = structuredClone(model);
  csvText(model);
  assert.deepEqual(model, snapshot);
});
