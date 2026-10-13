import { test } from "node:test";
import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import { PDF_FOOTER_NOTE, PDF_PRODUCER, fitColumnWidths, renderPdf, toWinAnsiSafe } from "../../../src/app/exports/pdf.ts";
import type { DocBlock, DocModel } from "../../../src/domain/types.ts";
import { assertPageLayout, bodyRuns, runWidth, zoneOf } from "./pdf-layout.ts";
import { assertValidPdfStructure, documentText, pageText, parsePdf } from "./pdf-reader.ts";
import type { ParsedPdf } from "./pdf-reader.ts";

const NOW = new Date("2026-10-13T00:00:00Z");
const render = (doc: DocModel) => renderPdf(doc, { PDFDocument, now: NOW });

async function renderParsed(doc: DocModel): Promise<{ bytes: Uint8Array; pdf: ParsedPdf }> {
  const bytes = await render(doc);
  assertValidPdfStructure(bytes);
  return { bytes, pdf: parsePdf(bytes) };
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const numbered = (prefix: string, count: number, digits = 3) => Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(digits, "0")}`).join(" ");

// ------------------------------------------------------------------------------------------------------------- toWinAnsiSafe

// The 27 characters above U+00FF that WinAnsi (windows-1252) has, in byte order 0x80..0x9F (five bytes are undefined).
const EXTRAS = "\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178";
const LATIN1 = Array.from({ length: 0xff - 0xa1 + 1 }, (_, i) => 0xa1 + i).filter((c) => c !== 0xad).map((c) => String.fromCharCode(c)).join("");
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(0x20 + i)).join("");

// Everything pdfkit can draw with a standard font: printable ASCII, Latin-1 and the extras, plus the newline the layout splits on.
const ENCODABLE = new Set<string>(["\n", ...ASCII, ...LATIN1, " ", ...EXTRAS]);

test("toWinAnsiSafe: the extras listed here are exactly the windows-1252 characters above U+00FF", () => {
  const bytes = [0x80, ...range(0x82, 0x8c), 0x8e, ...range(0x91, 0x9c), 0x9e, 0x9f];
  assert.equal(new TextDecoder("windows-1252").decode(Uint8Array.from(bytes)), EXTRAS);
  assert.equal([...EXTRAS].length, 27);
});

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

test("toWinAnsiSafe: printable ASCII, Latin-1, the cp1252 extras and newlines pass through unchanged", () => {
  for (const text of [ASCII, LATIN1, EXTRAS, "line one\nline two", "", "A$1,234.50", "caf\u00e9 \u00dcn\u00efcode \u00bd \u00a3 \u00a9"]) {
    assert.equal(toWinAnsiSafe(text), text);
  }
  assert.equal(toWinAnsiSafe("A$1,234.50 \u2014 \u201cquoted\u201d \u2018single\u2019 \u2022 item \u00b7 dot \u2013 dash \u2026 \u20ac5"), "A$1,234.50 \u2014 \u201cquoted\u201d \u2018single\u2019 \u2022 item \u00b7 dot \u2013 dash \u2026 \u20ac5");
});

const MAPPINGS: Array<[name: string, input: string, expected: string]> = [
  ["minus sign U+2212 (the money formatter's minus)", "\u2212A$1,234.00", "-A$1,234.00"],
  ["hyphen U+2010", "a\u2010b", "a-b"],
  ["non-breaking hyphen U+2011", "a\u2011b", "a-b"],
  ["figure dash U+2012", "1\u20122", "1-2"],
  ["hyphen bullet U+2043", "a\u2043b", "a-b"],
  ["small hyphen-minus U+FE63", "a\ufe63b", "a-b"],
  ["fullwidth hyphen-minus U+FF0D", "a\uff0db", "a-b"],
  ["horizontal bar U+2015 becomes an em dash", "a\u2015b", "a\u2014b"],
  ["no-break space U+00A0", "A$\u00a01", "A$ 1"],
  ["thin space U+2009", "1\u2009000", "1 000"],
  ["narrow no-break space U+202F", "1\u202f000", "1 000"],
  ["figure space U+2007", "1\u2007000", "1 000"],
  ["ideographic space U+3000", "a\u3000b", "a b"],
  ["tab", "a\tb", "a b"],
  ["CRLF", "a\r\nb", "a\nb"],
  ["CR", "a\rb", "a\nb"],
  ["NEL U+0085", "a\u0085b", "a\nb"],
  ["line separator U+2028", "a\u2028b", "a\nb"],
  ["paragraph separator U+2029", "a\u2029b", "a\nb"],
  ["prime U+2032", "5\u2032", "5'"],
  ["double prime U+2033", "5\u2033", '5"'],
  ["reversed and high-reversed quotes", "\u201b\u201f\u2035\u2036", `'"'"`],
  ["one dot leader U+2024", "a\u2024b", "a.b"],
  ["hyphenation point U+2027 and dot operators", "a\u2027b\u2219c\u22c5d", "a\u00b7b\u00b7c\u00b7d"],
  ["other bullets", "\u2023\u25aa\u25cf\u25e6", "\u2022\u2022\u2022\u2022"],
  ["arrows", "a \u2192 b \u2190 c \u2194 d \u21d2 e", "a -> b <- c <-> d => e"],
  ["comparisons", "a \u2264 b \u2265 c \u2260 d \u2248 e", "a <= b >= c != d ~ e"],
  ["soft hyphen is dropped", "co\u00adop", "coop"],
  ["zero width space, joiners and BOM are dropped", "a\u200bb\u200cc\u200dd\ufeffe\u2060f", "abcdef"],
  ["C0 controls are dropped", "a\u0000b\u0007c\u001bd\u001fe", "abcde"],
  ["C1 controls and DEL are dropped", "a\u0080b\u009fc\u007fd", "abcd"],
  ["a lone combining accent is dropped", "\u0301x", "x"],
  ["an accent composes into the Latin-1 letter", "e\u0301 n\u0303", "\u00e9 \u00f1"],
  ["accented letters outside Latin-1 fall back to the base letter", "\u0107\u010d\u0159\u015b\u017a\u0105", "ccrsza"],
  ["letters with stacked accents", "\u1ed3\u1ea1\u1e63", "oas"],
  ["stroked and dotless letters", "\u0141\u00f3d\u017a \u0110\u1ed3ng \u0126a\u0127 \u0131", "L\u00f3dz Dong Hah i"],
  ["a capital I with dot", "\u0130stanbul", "Istanbul"],
  ["Greek and Cyrillic become ?", "\u03a3\u0434", "??"],
  ["every CJK character is one ?", "\u65e5\u672c\u8a9e", "???"],
  ["an emoji is one ?", "\ud83d\ude00", "?"],
  ["a flag is two ?", "\ud83c\udde6\ud83c\uddfa", "??"],
  ["a family emoji is three ? (the joiners are dropped)", "\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67", "???"],
  ["a lone surrogate is one ?", "x\ud800y\udc00z", "x?y?z"],
  ["a check mark and a cross", "\u2713 \u2717", "? ?"],
];

for (const [name, input, expected] of MAPPINGS) {
  test(`toWinAnsiSafe: ${name}`, () => {
    assert.equal(toWinAnsiSafe(input), expected);
    assert.equal(toWinAnsiSafe(expected), expected, "applying it again changes nothing");
  });
}

test("toWinAnsiSafe: values that are not strings do not throw", () => {
  const loose = toWinAnsiSafe as (value: unknown) => string;
  assert.equal(loose(undefined), "");
  assert.equal(loose(null), "");
  assert.equal(loose(42), "42");
  assert.equal(loose(true), "true");
  assert.equal(loose(12345678901234567890n), "12345678901234567890");
  assert.equal(loose({ toString: () => "\u2212x" }), "-x");
});

test("toWinAnsiSafe: for every code point the result is WinAnsi-encodable, at most 3 characters long, and stable", { timeout: 120_000 }, () => {
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    const out = toWinAnsiSafe(String.fromCodePoint(cp));
    if (out.length > 3) assert.fail(`U+${cp.toString(16)} gives ${JSON.stringify(out)}`);
    for (const ch of out) if (!ENCODABLE.has(ch)) assert.fail(`U+${cp.toString(16)} gives U+${(ch.codePointAt(0) as number).toString(16)}, which WinAnsi cannot draw`);
    if (toWinAnsiSafe(out) !== out) assert.fail(`U+${cp.toString(16)}: ${JSON.stringify(out)} is not stable`);
  }
});

test("toWinAnsiSafe: random mixes of scripts, spaces, controls, marks and emoji stay encodable and stable", () => {
  const pool = [
    ...ASCII, ...LATIN1, ...EXTRAS, "\u2212", "\u00a0", "\u2009", "\u202f", "\u3000", "\t", "\r", "\n", "\r\n", "\u0301", "\u0308", "\u200d", "\u200b", "\ufeff",
    "\u0000", "\u001f", "\u0085", "\u2028", "\ud83d\ude00", "\ud83c\uddfa", "\u65e5", "\u03a3", "\u0434", "\u0142", "\u1ed3", "\u2192", "\u2264", "\ud800", "\udc00",
  ];
  const next = rng(2026);
  for (let n = 0; n < 4000; n++) {
    let text = "";
    for (let k = next() * 40; k > 0; k--) text += pool[Math.floor(next() * pool.length)];
    const out = toWinAnsiSafe(text);
    for (const ch of out) assert.ok(ENCODABLE.has(ch), `${JSON.stringify(text)} gives ${JSON.stringify(out)}`);
    assert.equal(toWinAnsiSafe(out), out, JSON.stringify(text));
    assert.ok(!/\r/.test(out));
  }
});

// ------------------------------------------------------------------------------------------------------------- fitColumnWidths

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
const near = (actual: number[], expected: number[], tolerance = 1e-6) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tolerance, `[${actual.join(", ")}] vs [${expected.join(", ")}]`));
};

test("fitColumnWidths: short columns keep their natural width, the wide one takes what is left", () => {
  const widths = fitColumnWidths([{ natural: 600, min: 40 }, { natural: 40, min: 30 }, { natural: 60, min: 40 }], 500, 8);
  near(widths, [384, 48, 68]);
});

test("fitColumnWidths: when everything fits, spare width is shared in proportion to the natural widths", () => {
  near(fitColumnWidths([{ natural: 100, min: 20 }, { natural: 50, min: 10 }], 600, 0), [400, 200]);
});

test("fitColumnWidths: a column keeps room for its longest word while there is room for it", () => {
  const widths = fitColumnWidths([{ natural: 1000, min: 120 }, { natural: 1000, min: 20 }, { natural: 1000, min: 20 }], 300, 8);
  near(widths, [128, 86, 86]);
  assert.ok(widths[0] >= 120 + 8 - 1e-9);
});

test("fitColumnWidths: one huge word may claim at most 40% of the table", () => {
  const widths = fitColumnWidths([{ natural: 2000, min: 1000 }, { natural: 300, min: 50 }], 400, 0);
  near(widths, [200, 200]);
  const floorOnly = fitColumnWidths([{ natural: 2000, min: 1000 }, { natural: 2000, min: 10 }], 400, 0);
  assert.ok(floorOnly[0] >= 160 - 1e-9 && floorOnly[1] >= 28 - 1e-9, `[${floorOnly.join(", ")}]`);
});

test("fitColumnWidths: when even the longest words do not fit, all columns shrink in proportion", () => {
  const widths = fitColumnWidths([{ natural: 500, min: 100 }, { natural: 500, min: 100 }, { natural: 500, min: 100 }, { natural: 500, min: 100 }], 300, 10);
  near(widths, [75, 75, 75, 75]);
  const uneven = fitColumnWidths([{ natural: 500, min: 150 }, { natural: 500, min: 50 }, { natural: 500, min: 50 }], 200, 0);
  assert.ok(Math.abs(sum(uneven) - 200) < 1e-9);
  assert.ok(uneven[0] > uneven[1] && Math.abs(uneven[1] - uneven[2]) < 1e-9, `[${uneven.join(", ")}]`);
});

test("fitColumnWidths: degenerate input", () => {
  assert.deepEqual(fitColumnWidths([], 500, 8), []);
  assert.deepEqual(fitColumnWidths([{ natural: 10, min: 5 }, { natural: 10, min: 5 }], 0, 8), [0, 0]);
  assert.deepEqual(fitColumnWidths([{ natural: 10, min: 5 }], Number.NaN, 8), [0]);
  assert.deepEqual(fitColumnWidths([{ natural: 10, min: 5 }], -5, 8), [0]);
  const odd = fitColumnWidths([{ natural: Number.NaN, min: Number.POSITIVE_INFINITY }, { natural: -5, min: -1 }, { natural: 0, min: 0 }], 450, 8);
  assert.ok(odd.every((w) => Number.isFinite(w) && w > 0));
  assert.ok(Math.abs(sum(odd) - 450) < 1e-9);
  near(fitColumnWidths([{ natural: 10, min: 5 }], 499.28, 8), [499.28]);
});

test("fitColumnWidths: random tables always add up to the width, stay positive, and wider content never gets a narrower column", () => {
  const next = rng(7);
  for (let round = 0; round < 3000; round++) {
    const n = 1 + Math.floor(next() * 14);
    const total = 100 + next() * 450;
    const pad = next() < 0.5 ? 6 : 8;
    const sharedMin = next() < 0.4 ? next() * 120 : null;
    const cols = Array.from({ length: n }, () => {
      const natural = next() < 0.2 ? 0 : next() * (next() < 0.5 ? 60 : 900);
      const min = sharedMin ?? Math.min(natural, next() * 140);
      return { natural, min };
    });
    const widths = fitColumnWidths(cols, total, pad);
    assert.equal(widths.length, n);
    assert.ok(widths.every((w) => Number.isFinite(w) && w > 0), JSON.stringify({ cols, total, pad, widths }));
    assert.ok(Math.abs(sum(widths) - total) < 1e-7, `sum ${sum(widths)} vs ${total}`);
    if (sharedMin !== null) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (cols[i].natural >= cols[j].natural) assert.ok(widths[i] >= widths[j] - 1e-9, JSON.stringify({ cols, total, pad, widths }));
        }
      }
    }
  }
});

// ------------------------------------------------------------------------------------------------------------- model builders

type TableBlock = Extract<DocBlock, { kind: "table" }>;

function tableBlockOf(rowCount: number, options: { total?: boolean; title?: string } = {}): TableBlock {
  return {
    kind: "table",
    title: options.title ?? "Sweep table",
    columns: [{ key: "name", label: "Name" }, { key: "qty", label: "Qty", align: "right" }, { key: "amount", label: "Amount", align: "right" }],
    rows: Array.from({ length: rowCount }, (_, i) => ({
      name: `Row ${i + 1} alpha ${i % 7 === 6 ? `${numbered("w", 45)} ` : ""}omega ${i + 1}`,
      qty: String(i + 1),
      amount: `A$${((i + 1) * 1234.5).toFixed(2)}`,
    })),
    totalRow: options.total === false ? undefined : { name: "Grand total", qty: String(rowCount), amount: "A$999.00" },
  };
}

function richModel(rowCount = 70): DocModel {
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    property: `Property ${i + 1} \u2014 ${["Sydney", "Melbourne", "Brisbane", "Perth"][i % 4]} office tower with a rather long descriptive name that should wrap`,
    acquired: `${(i % 28) + 1} Jan 20${10 + (i % 15)}`,
    cost: `A$${(1234567 + i * 1111).toLocaleString("en-US")}`,
    value: `A$${(2234567 + i * 2111).toLocaleString("en-US")}`,
    gain: `\u2212A$${(1000 + i * 31).toLocaleString("en-US")}`,
  }));
  return {
    fileName: "demo.pdf",
    title: "AMIT member annual statement \u2014 Harbourline Office Trust",
    subtitle: "Harbourline Office Trust \u00b7 Amma Sakuragawa Life Assurance",
    meta: [
      { label: "Income year", value: "1 Jul 2024 \u2013 30 Jun 2025" },
      { label: "Member", value: "Amma Sakuragawa Life Assurance Co., Ltd." },
      { label: "TFN / ABN", value: "12 345 678 901" },
      { label: "Units held", value: "1,250,000.000000" },
      { label: "Prepared", value: "13 Oct 2026" },
    ],
    blocks: [
      { kind: "heading", text: "Summary" },
      { kind: "paragraph", text: `This statement summarises your share of the trust's net income for the year. It is a demonstration document only. ${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(6)}` },
      { kind: "paragraph", tone: "note", text: "Amounts marked with a minus sign are credits \u2192 see the notes. \u2265 and \u2264 are mapped too. Emoji \ud83d\ude00 becomes ?" },
      { kind: "paragraph", tone: "muted", text: "Figures are in Australian dollars unless stated." },
      {
        kind: "kv",
        title: "Components of distribution",
        rows: [
          { label: "Australian sourced income", value: "A$22,604,000.00" },
          { label: "Capital gains", value: "A$1,200,000.00" },
          { label: "Less: franking offsets", value: "\u2212A$30,000.00" },
          { label: "Net assessable income", value: "A$23,774,000.00", emphasis: true },
        ],
      },
      { kind: "heading", text: "Properties", level: 2 },
      {
        kind: "table",
        title: "Unrealised gains by property",
        columns: [
          { key: "property", label: "Property" },
          { key: "acquired", label: "Acquired" },
          { key: "cost", label: "Tax cost base", align: "right" },
          { key: "value", label: "Valuation", align: "right" },
          { key: "gain", label: "Unrealised gain", align: "right" },
        ],
        rows,
        totalRow: { property: "Total", acquired: "", cost: "A$99,999,999", value: "A$199,999,999", gain: "A$100,000,000" },
      },
      { kind: "heading", text: "Notes", level: 3 },
      {
        kind: "list",
        items: [
          "First item that is quite long and will wrap onto a second line when the text exceeds the available width of the page content area.",
          "Second item",
          "Third item with averyveryveryverylongtokenwithoutanyspacesthatshouldbebrokenacrossmultiplelinesbecauseitistoolongtofit-in-the-column/or/at/slashes/and-dashes-here",
        ],
      },
    ],
    footnotes: ["Debits are positive and credits negative.", "A return of capital reduces the cost of units (ITA s35(15C))."],
  };
}

// ------------------------------------------------------------------------------------------------------------- a rich document

test("rich document: a valid multi-page PDF with a footer on every page, text inside the margins and nothing overlapping", async () => {
  const bytes = await render(richModel());
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-"), "starts with %PDF-");
  assert.ok(text.trimEnd().endsWith("%%EOF"), "ends with %%EOF");
  const pageObjects = text.match(/\/Type \/Page(?![s\w])/g) ?? [];
  assert.ok(pageObjects.length > 1, `the long table forces a page break (${pageObjects.length} pages)`);
  assertValidPdfStructure(bytes);
  const pdf = parsePdf(bytes);
  assert.equal(pdf.pages.length, pageObjects.length);
  assertPageLayout(pdf, "rich document");
});

test("rich document: every block is drawn, in order", async () => {
  const { pdf } = await renderParsed(richModel());
  const all = documentText(pdf);
  const order = [
    "AMIT member annual statement", "Harbourline Office Trust \u00b7 Amma Sakuragawa Life Assurance", "Income year:", "Member:", "TFN / ABN:", "Units held:", "Prepared:", "Summary",
    "This statement summarises", "Amounts marked", "Figures are in Australian dollars", "Components of distribution", "Australian sourced income", "A$22,604,000.00",
    "Net assessable income", "A$23,774,000.00", "Properties", "Unrealised gains by property", "Property 1 \u2014", "Property 70 \u2014", "Total", "A$99,999,999", "Notes",
    "First item", "Second item", "Third item", "Debits are positive and credits negative.", "A return of capital reduces the cost of units",
  ];
  let from = 0;
  for (const needle of order) {
    const at = all.indexOf(needle, from);
    assert.ok(at >= 0, `"${needle}" appears after the previous block`);
    from = at + needle.length;
  }
});

test("rich document: glyph edge cases are drawn as plain WinAnsi text", async () => {
  const { pdf } = await renderParsed(richModel());
  const flat = documentText(pdf).replace(/\n/g, " ");
  assert.ok(flat.includes("credits -> see the notes. >= and <= are mapped too. Emoji ? becomes ?"), "arrows, comparisons and emoji are mapped");
  assert.ok(flat.includes("-A$30,000.00"), "the minus sign U+2212 is a hyphen-minus");
  assert.ok(flat.includes("-A$1,248"), "also inside the table");
  assert.ok(!/[\u2212\u2192\u2265\u2264\ud83d]/.test(flat));
  assert.ok(flat.includes("AMIT member annual statement \u2014 Harbourline"), "the em dash survives (WinAnsi has it)");
  assert.ok(flat.includes("\u00b7"), "the middle dot survives");
});

test("rich document: the table header repeats on every page the table runs onto, and rows are never split", async () => {
  const model = richModel();
  const { pdf } = await renderParsed(model);
  const table = model.blocks.find((b): b is TableBlock => b.kind === "table") as TableBlock;
  const rowPages = assertRowsWhole(pdf, "Property", table.rows.map((row) => String(row.property)));
  const pages = [...new Set(rowPages)];
  assert.ok(pages.length >= 3, `the table runs over ${pages.length} pages`);
  assert.deepEqual(rowPages, [...rowPages].sort((a, b) => a - b), "rows are in order");
  for (const index of pages) {
    const labels = bodyRuns(pdf.pages[index]).filter((r) => r.bold && ["Property", "Acquired", "Tax cost base", "Valuation", "Unrealised gain"].includes(r.text));
    assert.deepEqual(labels.map((r) => r.text).sort(), ["Acquired", "Property", "Tax cost base", "Unrealised gain", "Valuation"], `header on page ${index + 1}`);
    if (index > 0) assert.ok(labels.every((r) => r.baseline < 100), "on pages after the first the header is at the top of the content area");
  }
});

test("rich document: dates, amounts and headers are not wrapped, and amounts line up on the right edge of their column", async () => {
  const { pdf } = await renderParsed(richModel());
  const runs = pdf.pages.flatMap((page) => bodyRuns(page));
  assert.equal(runs.filter((r) => /^\d{1,2} Jan 20\d\d$/.test(r.text)).length, 70, "70 dates in one piece");
  assert.equal(runs.filter((r) => /^-?A\$[\d,]+$/.test(r.text)).length, 70 * 3 + 3, "cost, valuation and gain for every row, plus the total row");
  assert.equal(runs.filter((r) => r.text === "Tax cost base").length, runs.filter((r) => r.text === "Valuation").length, "headers in one piece");
  assert.ok(runs.filter((r) => r.text === "Unrealised gain").length >= 3);
  pdf.pages.forEach((page, index) => {
    const bodies = bodyRuns(page);
    const edges = bodies.filter((r) => r.bold && ["Tax cost base", "Valuation", "Unrealised gain"].includes(r.text)).map((r) => r.x + runWidth(r));
    if (edges.length === 0) return;
    for (const run of bodies.filter((r) => /^-?A\$[\d,]+$/.test(r.text))) {
      const right = run.x + runWidth(run);
      assert.ok(edges.some((e) => Math.abs(e - right) < 0.05), `page ${index + 1}: ${run.text} ends at ${right.toFixed(2)}, header edges ${edges.map((e) => e.toFixed(2)).join(", ")}`);
    }
  });
});

test("rich document: the total row is bold and sits on the page of the last body row", async () => {
  const { pdf } = await renderParsed(richModel());
  const pageOf = (predicate: (text: string) => boolean) => pdf.pages.findIndex((page) => bodyRuns(page).some((r) => predicate(r.text)));
  const totalPage = pdf.pages.findIndex((page) => bodyRuns(page).some((r) => r.bold && r.text === "Total"));
  assert.ok(totalPage >= 0);
  assert.equal(totalPage, pageOf((t) => t.startsWith("Property 70 \u2014")));
  const totalRuns = bodyRuns(pdf.pages[totalPage]).filter((r) => ["A$99,999,999", "A$199,999,999", "A$100,000,000"].includes(r.text));
  assert.equal(totalRuns.length, 3);
  assert.ok(totalRuns.every((r) => r.bold));
});

test("rich document: footer and running title", async () => {
  const { pdf } = await renderParsed(richModel());
  const count = pdf.pages.length;
  pdf.pages.forEach((page, index) => {
    const texts = page.runs.filter((r) => zoneOf(r) === "footer").map((r) => r.text).sort();
    assert.deepEqual(texts, [PDF_FOOTER_NOTE, `Page ${index + 1} of ${count}`].sort());
    const running = page.runs.filter((r) => zoneOf(r) === "running-header");
    assert.equal(running.length, index === 0 ? 0 : 1, index === 0 ? "no running title on the first page" : `one running title on page ${index + 1}`);
  });
  const running = pdf.pages[1].runs.find((r) => zoneOf(r) === "running-header");
  assert.ok(running && running.text.startsWith("AMIT member annual statement \u2014 Harbourline Office Trust"), "the running title starts with the document title");
  assert.ok(running.text.includes("Amma Sakuragawa") || running.text.endsWith("\u2026"), "it carries the subtitle, or is cut with an ellipsis when too long");
  assert.ok(runWidth(running) <= 499.28 + 0.01);
});

test("rich document: the model is not changed by rendering", async () => {
  const model = richModel(12);
  const before = structuredClone(model);
  await render(model);
  assert.deepEqual(model, before);
});

// ------------------------------------------------------------------------------------------------------------- minimal and odd models

test("a minimal model gives one page with the title and the footer", async () => {
  const { pdf } = await renderParsed({ fileName: "min.pdf", title: "Minimal", blocks: [] });
  assert.equal(pdf.pages.length, 1);
  assert.equal(pdf.declaredPageCount, 1);
  assertPageLayout(pdf, "minimal");
  assert.deepEqual(pdf.pages[0].runs.map((r) => r.text).sort(), [PDF_FOOTER_NOTE, "Minimal", "Page 1 of 1"].sort());
  const title = pdf.pages[0].runs.find((r) => r.text === "Minimal");
  assert.ok(title && title.bold && title.size === 20 && title.x === 48, "title is large, bold and at the left margin");
});

test("a minimal model with a subtitle, meta and one of each block", async () => {
  const model: DocModel = {
    fileName: "one.pdf",
    title: "Title",
    subtitle: "Subtitle",
    meta: [{ label: "A", value: "1" }],
    blocks: [
      { kind: "heading", text: "H2" },
      { kind: "heading", text: "H3", level: 3 },
      { kind: "paragraph", text: "normal text" },
      { kind: "paragraph", text: "muted text", tone: "muted" },
      { kind: "paragraph", text: "note text", tone: "note" },
      { kind: "kv", rows: [{ label: "k", value: "v" }] },
      { kind: "table", columns: [{ key: "c", label: "C" }], rows: [{ c: "cell" }] },
      { kind: "list", items: ["item"] },
    ],
    footnotes: ["footnote"],
  };
  const { pdf } = await renderParsed(model);
  assert.equal(pdf.pages.length, 1);
  assertPageLayout(pdf, "one of each");
  const texts = new Set(pdf.pages[0].runs.map((r) => r.text));
  for (const needle of ["Title", "Subtitle", "A:", "1", "H2", "H3", "normal text", "muted text", "note text", "k", "v", "C", "cell", "\u2022", "item", "footnote"]) {
    assert.ok(texts.has(needle), `"${needle}" is drawn`);
  }
  const size = (text: string) => pdf.pages[0].runs.find((r) => r.text === text)?.size;
  assert.ok((size("H2") ?? 0) > (size("H3") ?? 0) && (size("H3") ?? 0) > (size("normal text") ?? 99), "H2 > H3 > body text");
  assert.ok((size("normal text") ?? 0) > (size("muted text") ?? 99), "muted text is smaller");
  assert.ok((size("footnote") ?? 99) < (size("muted text") ?? 0), "footnotes are the smallest");
});

test("models with missing or malformed parts still render a valid PDF", async () => {
  const bad = (value: unknown) => value as DocModel;
  const models: unknown[] = [
    {},
    { title: undefined, blocks: undefined, footnotes: undefined, meta: undefined },
    { fileName: "x.pdf", title: 42, subtitle: null, blocks: [], meta: [null, { label: "only label" }, { value: "only value" }] },
    { fileName: "x.pdf", title: "T", blocks: [null, undefined, 7, "text", { kind: "chart" }, { kind: "paragraph" }, { kind: "heading" }, { kind: "kv" }, { kind: "list" }, { kind: "table" }] },
    { fileName: "x.pdf", title: "T", blocks: [{ kind: "table", columns: [], rows: [{ a: "x" }], title: "Only a title" }] },
    { fileName: "x.pdf", title: "T", blocks: [{ kind: "table", columns: [{ key: "a", label: "A" }, { key: "b", label: "B", align: "right" }], rows: [{}, { a: undefined }, { a: null, b: 5 }, { a: "x", b: "y", c: "z" }], totalRow: {} }] },
    { fileName: "x.pdf", title: "T", blocks: [{ kind: "table", columns: [{ key: "a", label: "A" }], rows: [], totalRow: { a: "only a total" } }] },
    { fileName: "x.pdf", title: "T", blocks: [{ kind: "table", columns: [{ key: "a", label: "A" }], rows: [] }] },
    { fileName: "x.pdf", title: "T", blocks: [{ kind: "list", items: [1, null, "", "   ", "kept"] }, { kind: "kv", rows: [null, { label: "l" }, { value: "v" }] }] },
    { fileName: "x.pdf", title: "", subtitle: "", blocks: [{ kind: "heading", text: "   " }], footnotes: ["", " ", "last"] },
  ];
  for (const [index, model] of models.entries()) {
    const { pdf } = await renderParsed(bad(model));
    assert.ok(pdf.pages.length >= 1, `model ${index}`);
    assertPageLayout(pdf, `odd model ${index}`);
  }
});

test("odd models keep what can be drawn: numbers as text, blank rows, titles without columns, totals without rows", async () => {
  const { pdf } = await renderParsed({
    fileName: "x.pdf",
    title: 42 as unknown as string,
    blocks: [
      { kind: "table", title: "Only a title", columns: [], rows: [{ a: "x" }] },
      { kind: "table", columns: [{ key: "a", label: "A" }], rows: [], totalRow: { a: "only a total" } },
      { kind: "table", columns: [{ key: "a", label: "A" }, { key: "b", label: "B", align: "right" }], rows: [{ a: "x", b: 5 as unknown as string }] },
      { kind: "list", items: [1 as unknown as string, "", "kept"] },
    ],
    footnotes: ["", "last"],
  });
  const texts = pdf.pages.flatMap((p) => p.runs.map((r) => r.text));
  for (const needle of ["42", "Only a title", "A", "only a total", "x", "5", "1", "kept", "last"]) assert.ok(texts.includes(needle), `"${needle}"`);
  assert.equal(texts.filter((t) => t === "\u2022").length, 2, "one bullet per kept item");
});

// ------------------------------------------------------------------------------------------------------------- info dictionary and determinism

test("document info: title, subject, producer, creator and the creation date from deps.now", async () => {
  const { pdf } = await renderParsed(richModel(3));
  assert.deepEqual(pdf.info, {
    Title: "AMIT member annual statement \u2014 Harbourline Office Trust",
    Subject: "Harbourline Office Trust \u00b7 Amma Sakuragawa Life Assurance",
    Producer: PDF_PRODUCER,
    Creator: PDF_PRODUCER,
    CreationDate: "D:20261013000000Z",
  });
  assert.equal(PDF_PRODUCER, "Property Fund Tax Compliance demo");
});

test("document info: the subject falls back to the producer, control characters are blanked, and any Unicode title is kept as is", async () => {
  const plain = await renderParsed({ fileName: "a.pdf", title: "Line one\nLine two\t\u0000x", blocks: [] });
  assert.equal(plain.pdf.info.Title, "Line one Line two x");
  assert.equal(plain.pdf.info.Subject, PDF_PRODUCER);
  const unicode = await renderParsed({ fileName: "a.pdf", title: "Fund \u03a3 \ud83d\ude00 \u2014 caf\u00e9", subtitle: "\u65e5\u672c\u8a9e", blocks: [] });
  assert.equal(unicode.pdf.info.Title, "Fund \u03a3 \ud83d\ude00 \u2014 caf\u00e9");
  assert.equal(unicode.pdf.info.Subject, "\u65e5\u672c\u8a9e");
  assert.ok(unicode.pdf.pages[0].runs.some((r) => r.text === "Fund ? ? \u2014 caf\u00e9"), "while the page shows the WinAnsi-safe text");
});

test("document info: without deps.now the creation date is the current time", async () => {
  const before = Date.now();
  const bytes = await renderPdf({ fileName: "a.pdf", title: "T", blocks: [] }, { PDFDocument });
  const { CreationDate } = parsePdf(bytes).info;
  const m = /^D:(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)Z$/.exec(CreationDate);
  assert.ok(m, CreationDate);
  const stamp = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  assert.ok(stamp >= before - 1000 && stamp <= Date.now() + 1000, CreationDate);
});

test("deterministic: the same model and date give identical bytes, also when rendered concurrently; another date does not", async () => {
  const model = richModel(30);
  const a = await render(model);
  const b = await render(model);
  assert.ok(Buffer.from(a).equals(Buffer.from(b)), "second render is identical");
  const small = richModel(5);
  const [x, y] = await Promise.all([render(model), render(small)]);
  assert.ok(Buffer.from(x).equals(Buffer.from(a)), "concurrent renders do not share state (large)");
  assert.ok(Buffer.from(y).equals(Buffer.from(await render(small))), "concurrent renders do not share state (small)");
  const later = await renderPdf(model, { PDFDocument, now: new Date("2026-10-14T00:00:00Z") });
  assert.ok(!Buffer.from(later).equals(Buffer.from(a)), "another date, another bytes");
  assert.equal(parsePdf(later).info.CreationDate, "D:20261014000000Z");
});

// ------------------------------------------------------------------------------------------------------------- glyphs through pdfkit

test("every character WinAnsi has is drawn and reads back the same (pdfkit's encoding matches cp1252)", async () => {
  const chunks = [ASCII.slice(1, 48), ASCII.slice(48), LATIN1.slice(0, 31), LATIN1.slice(31, 62), LATIN1.slice(62), EXTRAS];
  const { pdf } = await renderParsed({ fileName: "g.pdf", title: "Glyphs", blocks: chunks.map((text) => ({ kind: "paragraph", text: `x ${text} x` })) });
  assertPageLayout(pdf, "glyphs");
  const drawn = new Set(pdf.pages.flatMap((p) => p.runs.map((r) => r.text)));
  for (const chunk of chunks) assert.ok(drawn.has(`x ${chunk} x`), `"${chunk}" reads back`);
});

// ------------------------------------------------------------------------------------------------------------- pathological content

test("long unbroken tokens are cut to fit and nothing is lost, in every block type", async () => {
  const token = "Z".repeat(300);
  const slashed = `${"ZZZZZZZZZZ-".repeat(30)}Z`; // 301 Z's; cut after a dash when there is one
  const model: DocModel = {
    fileName: "long.pdf",
    title: token,
    subtitle: token,
    meta: [{ label: token, value: token }, { label: "b", value: token }],
    blocks: [
      { kind: "heading", text: token },
      { kind: "heading", text: token, level: 3 },
      { kind: "paragraph", text: token },
      { kind: "paragraph", text: token, tone: "note" },
      { kind: "kv", title: token, rows: [{ label: token, value: token }, { label: "x", value: "A$1.00" }] },
      { kind: "table", title: token, columns: [{ key: "a", label: "A" }, { key: "b", label: "B", align: "right" }], rows: [{ a: token, b: token }], totalRow: { a: token, b: token } },
      { kind: "list", items: [token, slashed] },
    ],
    footnotes: [token],
  };
  const { pdf } = await renderParsed(model);
  assertPageLayout(pdf, "long tokens");
  const zs = pdf.pages.reduce((n, page) => n + bodyRuns(page).reduce((m, r) => m + (r.text.match(/Z/g)?.length ?? 0), 0), 0);
  // title, subtitle, 3 in the meta grid, 2 headings, 2 paragraphs, 3 in the key-value block, 5 in the table, 1 list item, 1 footnote
  assert.equal(zs, 19 * 300 + 301, "every Z is on the page");
  assert.ok(pdf.pages.length >= 2);
});

test("a very long unbroken title, paragraph and table cell run over pages without losing text", { timeout: 60_000 }, async () => {
  const token = "Z".repeat(30_000);
  const { pdf } = await renderParsed({
    fileName: "huge.pdf",
    title: token,
    blocks: [{ kind: "paragraph", text: token }, { kind: "table", columns: [{ key: "a", label: "A" }], rows: [{ a: token }, { a: "after" }] }],
  });
  assertPageLayout(pdf, "huge tokens");
  const zs = pdf.pages.reduce((n, page) => n + bodyRuns(page).reduce((m, r) => m + (r.text.match(/Z/g)?.length ?? 0), 0), 0);
  assert.equal(zs, 90_000);
  assert.ok(pdf.pages.length > 20, `${pdf.pages.length} pages`);
  assert.ok(documentText(pdf).includes("after"));
});

test("a 20,000-word paragraph is split across pages with at least two lines on each side, in order, and nothing missing", { timeout: 60_000 }, async () => {
  const { pdf } = await renderParsed({ fileName: "p.pdf", title: "Long", blocks: [{ kind: "paragraph", text: numbered("p", 20_000, 5) }] });
  assertPageLayout(pdf, "long paragraph");
  let next = 1;
  for (const page of pdf.pages) {
    const lines = bodyRuns(page).filter((r) => /^p\d{5}/.test(r.text));
    assert.ok(lines.length >= 2, `page fragment of ${lines.length} line(s)`);
    for (const line of lines) {
      for (const word of line.text.split(" ")) {
        assert.equal(word, `p${String(next++).padStart(5, "0")}`);
      }
    }
  }
  assert.equal(next, 20_001);
});

test("a wide table (12 columns) stays inside the margins with every cell on the page", async () => {
  const columns = Array.from({ length: 12 }, (_, i) => ({ key: `c${i}`, label: `Col ${i + 1}`, align: i % 2 ? ("right" as const) : ("left" as const) }));
  const rows = Array.from({ length: 60 }, (_, r) => Object.fromEntries(columns.map((c, i) => [c.key, i === 0 ? `Line ${r + 1}` : `${(r + 1) * (i + 1)}.50`])));
  const { pdf } = await renderParsed({ fileName: "w.pdf", title: "Wide", blocks: [{ kind: "table", columns, rows, totalRow: Object.fromEntries(columns.map((c, i) => [c.key, i === 0 ? "Total" : `${i}.00`])) }] });
  assertPageLayout(pdf, "12 columns");
  assert.ok(pdf.pages.length >= 2);
  const lines = pdf.pages.flatMap((p) => bodyRuns(p).filter((r) => /^Line \d+$/.test(r.text)).map((r) => r.text));
  assert.deepEqual(lines, Array.from({ length: 60 }, (_, i) => `Line ${i + 1}`));
});

test("a table with 40 narrow columns renders without losing a character", async () => {
  const columns = Array.from({ length: 40 }, (_, i) => ({ key: `c${i}`, label: `H${i}` }));
  const rows = Array.from({ length: 5 }, (_, r) => Object.fromEntries(columns.map((c, i) => [c.key, `v${r}${i}`])));
  const { pdf } = await renderParsed({ fileName: "n.pdf", title: "Narrow", blocks: [{ kind: "table", columns, rows }] });
  assert.equal(pdf.pages.length, 1);
  const ink = pdf.pages[0].runs.filter((r) => r.size < 8).map((r) => r.text).join("").replace(/\s/g, "");
  const expected = columns.map((c) => c.label).join("") + rows.flatMap((row) => Object.values(row)).join("");
  assert.equal([...ink].sort().join(""), [...expected].sort().join(""));
});

test("a 2,000-row table: all rows once and in order, the header on every page, a valid file", { timeout: 120_000 }, async () => {
  const { pdf } = await renderParsed({ fileName: "t.pdf", title: "Big", blocks: [tableBlockOf(2000)] });
  assertPageLayout(pdf, "2,000 rows");
  assert.ok(pdf.pages.length > 40, `${pdf.pages.length} pages`);
  assertTableIntegrity(pdf, 2000, "2,000 rows");
});

// ------------------------------------------------------------------------------------------------------------- pagination sweeps

const pageOfRuns = (pdf: ParsedPdf, predicate: (text: string) => boolean): number[] =>
  pdf.pages.flatMap((page, index) => bodyRuns(page).filter((r) => predicate(r.text)).map(() => index));

/**
 * Rebuilds the table rows from the lines of its first column (lines of one row joined with a space), so every row must come out
 * exactly as given, in order, with no row cut off at the end of a page. Returns the page index of each row.
 */
function assertRowsWhole(pdf: ParsedPdf, firstHeader: string, expected: string[]): number[] {
  const pageOfRow: number[] = [];
  let next = 0;
  pdf.pages.forEach((page, index) => {
    const bodies = bodyRuns(page);
    const header = bodies.find((r) => r.bold && r.text === firstHeader);
    if (!header) return;
    const column = bodies.filter((r) => !r.bold && Math.abs(r.x - header.x) < 0.01 && r.baseline > header.baseline).sort((a, b) => a.baseline - b.baseline);
    let partial = "";
    for (const run of column) {
      if (next >= expected.length) break;
      partial = partial ? `${partial} ${run.text}` : run.text;
      if (partial === expected[next]) {
        pageOfRow[next++] = index;
        partial = "";
      } else {
        assert.ok(expected[next].startsWith(partial), `page ${index + 1}: "${partial}" is not the start of row ${next + 1}`);
      }
    }
    assert.equal(partial, "", `page ${index + 1}: row ${next + 1} is cut off at the end of the page`);
  });
  assert.equal(next, expected.length, "every row is drawn");
  return pageOfRow;
}

/** Every row exactly once and in order, rows in one piece, the header on each page that has rows (and only there), the total with the last row. */
function assertTableIntegrity(pdf: ParsedPdf, rowCount: number, label: string): void {
  const expected = Array.from({ length: rowCount }, (_, i) => `Row ${i + 1} alpha ${i % 7 === 6 ? `${numbered("w", 45)} ` : ""}omega ${i + 1}`);
  const rowPages = assertRowsWhole(pdf, "Name", expected);
  const totalPages = pageOfRuns(pdf, (t) => t === "Grand total");
  assert.equal(totalPages.length, 1, `${label}: one total row`);
  pdf.pages.forEach((page, index) => {
    const header = bodyRuns(page).filter((r) => r.bold && ["Name", "Qty", "Amount"].includes(r.text)).map((r) => r.text).sort();
    const hasContent = rowPages.includes(index) || totalPages[0] === index;
    assert.deepEqual(header, hasContent ? ["Amount", "Name", "Qty"] : [], `${label}: page ${index + 1} has the header exactly when it has rows or the total`);
  });
  if (rowCount > 0) assert.equal(totalPages[0], rowPages[rowCount - 1], `${label}: the total row is on the page of the last row`);
}

function headingIsNotOrphaned(pdf: ParsedPdf, text: string, label: string): void {
  const hits = pdf.pages.flatMap((page, index) => bodyRuns(page).filter((r) => r.text === text).map((run) => ({ page, index, run })));
  assert.equal(hits.length, 1, `${label}: heading is drawn once`);
  const { page, index, run } = hits[0];
  assert.ok(bodyRuns(page).some((r) => r.baseline > run.baseline + 0.5), `${label}: heading at the bottom of page ${index + 1} with nothing under it`);
}

type Follower = "table" | "kv" | "list" | "paragraph";

function followerBlocks(kind: Follower): DocBlock[] {
  switch (kind) {
    case "paragraph":
      return [{ kind: "paragraph", text: numbered("p", 120) }];
    case "list":
      return [{ kind: "list", items: Array.from({ length: 5 }, (_, i) => `list item ${i + 1} ${numbered("l", 6)}`) }];
    case "kv":
      return [{ kind: "kv", title: "Sweep key figures", rows: Array.from({ length: 6 }, (_, i) => ({ label: `kv label ${i + 1}`, value: `A$${i + 1},000.00`, emphasis: i === 5 })) }];
    case "table":
      return [tableBlockOf(7)];
  }
}

function sweepModel(fillers: number, tone: "normal" | "muted" | "note", follower: Follower, level: 2 | 3): DocModel {
  return {
    fileName: "s.pdf",
    title: "Sweep",
    blocks: [
      ...Array.from({ length: fillers }, (_, i): DocBlock => ({ kind: "paragraph", tone, text: `filler ${i + 1}` })),
      { kind: "heading", text: "SWEEP-HEADING", level },
      ...followerBlocks(follower),
    ],
  };
}

test("pagination sweep: a heading is never left alone at the bottom of a page, whatever follows it and wherever it falls", { timeout: 240_000 }, async () => {
  let checked = 0;
  for (const follower of ["table", "kv", "list", "paragraph"] as const) {
    for (const level of [2, 3] as const) {
      for (const tone of ["normal", "note"] as const) {
        for (let fillers = 0; fillers <= 44; fillers++) {
          const label = `${follower}/h${level}/${tone}/${fillers} fillers`;
          const { pdf } = await renderParsed(sweepModel(fillers, tone, follower, level));
          assertPageLayout(pdf, label);
          headingIsNotOrphaned(pdf, "SWEEP-HEADING", label);
          if (follower === "list") {
            const pages = pageOfRuns(pdf, (t) => /^list item [12] /.test(t));
            assert.equal(new Set(pages).size, 1, `${label}: the first two list items stay together`);
          }
          if (follower === "kv") {
            const pages = new Set(pageOfRuns(pdf, (t) => /^(Sweep key figures|kv label \d)$/.test(t)));
            assert.equal(pages.size, 1, `${label}: a short key-value block stays on one page`);
          }
          if (follower === "paragraph") {
            const perPage = pdf.pages.map((_, index) => bodyRuns(pdf.pages[index]).filter((r) => /^p\d{3}/.test(r.text)).length).filter((n) => n > 0);
            assert.ok(perPage.every((n) => n >= 2), `${label}: a paragraph is split with at least two lines on each page (${perPage.join("+")})`);
          }
          if (follower === "table") assertTableIntegrity(pdf, 7, label);
          checked++;
        }
      }
    }
  }
  assert.equal(checked, 4 * 2 * 2 * 45);
});

test("pagination sweep: a heading chain (H2, H3, then a table) stays together with the start of the table", { timeout: 120_000 }, async () => {
  for (let fillers = 0; fillers <= 44; fillers++) {
    const label = `chain/${fillers} fillers`;
    const model: DocModel = {
      fileName: "c.pdf",
      title: "Chain",
      blocks: [
        ...Array.from({ length: fillers }, (_, i): DocBlock => ({ kind: "paragraph", text: `filler ${i + 1}` })),
        { kind: "heading", text: "CHAIN-H2" },
        { kind: "heading", text: "CHAIN-H3", level: 3 },
        tableBlockOf(5),
      ],
    };
    const { pdf } = await renderParsed(model);
    assertPageLayout(pdf, label);
    headingIsNotOrphaned(pdf, "CHAIN-H3", label);
    headingIsNotOrphaned(pdf, "CHAIN-H2", label);
    const h2 = pdf.pages.findIndex((p) => bodyRuns(p).some((r) => r.text === "CHAIN-H2"));
    const h3 = pdf.pages.findIndex((p) => bodyRuns(p).some((r) => r.text === "CHAIN-H3"));
    assert.equal(h2, h3, `${label}: the two headings are on the same page`);
  }
});

test("pagination sweep: tables of 0 to 70 rows at several offsets keep rows whole, repeat the header, and put the total with the last row", { timeout: 240_000 }, async () => {
  for (const fillers of [0, 9, 18, 27, 36]) {
    for (let rows = 0; rows <= 70; rows += rows < 45 ? 1 : 3) {
      const label = `${rows} rows after ${fillers} fillers`;
      const model: DocModel = {
        fileName: "r.pdf",
        title: "Rows",
        blocks: [...Array.from({ length: fillers }, (_, i): DocBlock => ({ kind: "paragraph", text: `filler ${i + 1}` })), tableBlockOf(rows)],
        footnotes: ["A footnote."],
      };
      const { pdf } = await renderParsed(model);
      assertPageLayout(pdf, label);
      assertTableIntegrity(pdf, rows, label);
      if (rows === 0) assert.ok(pdf.pages.some((p) => bodyRuns(p).some((r) => r.text === "Grand total")), `${label}: a table without rows still shows its total`);
    }
  }
});

test("pagination sweep: footnotes are drawn after the content and the last page never holds only a footer", { timeout: 120_000 }, async () => {
  for (let fillers = 0; fillers <= 44; fillers++) {
    const model: DocModel = {
      fileName: "f.pdf",
      title: "Notes",
      blocks: Array.from({ length: fillers }, (_, i): DocBlock => ({ kind: "paragraph", text: `filler ${i + 1}` })),
      footnotes: ["First footnote.", "Second footnote.", "Third footnote."],
    };
    const { pdf } = await renderParsed(model);
    assertPageLayout(pdf, `footnotes after ${fillers} fillers`);
    const last = pdf.pages[pdf.pages.length - 1];
    assert.ok(bodyRuns(last).length > 0, `${fillers} fillers: the last page has content`);
    const notes = pageOfRuns(pdf, (t) => /footnote\.$/.test(t));
    assert.equal(notes.length, 3);
    assert.equal(new Set(notes).size, 1, `${fillers} fillers: footnotes stay together`);
    const lastFiller = pageOfRuns(pdf, (t) => t === `filler ${fillers}`);
    if (fillers > 0) assert.ok(notes[0] >= lastFiller[0], "footnotes come after the content");
  }
});

// ------------------------------------------------------------------------------------------------------------- the browser build

test("the standalone browser build of pdfkit (the one the app loads) renders the same document as the Node build", { timeout: 120_000 }, async () => {
  const standalone = (await import("pdfkit/js/pdfkit.standalone.js")).default;
  assert.equal(typeof standalone, "function");
  const model = richModel(25);
  const node = parsePdf(await render(model));
  const browserBytes = await renderPdf(model, { PDFDocument: standalone, now: NOW });
  assertValidPdfStructure(browserBytes);
  const browser = parsePdf(browserBytes);
  assert.equal(browser.pages.length, node.pages.length);
  assert.deepEqual(browser.pages.map((p) => p.runs), node.pages.map((p) => p.runs));
  assert.deepEqual(browser.info, node.info);
  assertPageLayout(browser, "standalone build");
  assert.equal(pageText(browser.pages[0]), pageText(node.pages[0]));
});
