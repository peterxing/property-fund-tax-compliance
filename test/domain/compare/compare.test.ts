import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { describe, it } from "node:test";
import { compareLines, compareSources, labelSimilarity, normaliseReference, parseAmount, parseTheirFile } from "../../../src/domain/compare/index.ts";
import { seedData } from "../../../src/domain/seed/index.ts";

const NOW = new Date("2026-10-12T09:00:00");

function ctx(data = seedData()) {
  return { now: NOW, user: data.users[0]! };
}

function sample(name: string): string {
  return readFileSync(new URL(`../../../docs/samples/${name}`, import.meta.url), "utf8");
}

describe("parseTheirFile", () => {
  it("parses CSV, TSV, BOMs, quotes, CRLF and accounting amount formats", () => {
    assert.equal(parseAmount("$1,234.50"), 123450);
    assert.equal(parseAmount("A$1,234.50"), 123450);
    assert.equal(parseAmount("S$1,234.50"), 123450);
    assert.equal(parseAmount("(1,234.50)"), -123450);
    assert.equal(parseAmount("1,234.50-"), -123450);
    assert.equal(parseAmount("-1234.5"), -123450);
    assert.equal(parseAmount("A$12"), 1200);
    assert.equal(parseAmount("−1234.50"), -123450);
    const csv = "\uFEFFRef,Label,Amount\r\n1A,\"Australian income, other\",\"A$1,234.50\"\r\n";
    const parsed = parseTheirFile(csv);
    assert.deepEqual([parsed.delimiter, parsed.lines.length, parsed.lines[0]?.reference, parsed.lines[0]?.label, parsed.lines[0]?.amount], [",", 1, "1A", "Australian income, other", 123450]);
    const tsv = "Reference\tDescription\tValue\r\nx\tTaxable income\tS$2,000.00\r\n";
    assert.deepEqual(parseTheirFile(tsv).lines.map((line) => [line.reference, line.label, line.amount]), [["x", "Taxable income", 200000]]);
  });

  it("detects and overrides columns, and lists skipped heading or bad rows", () => {
    const parsed = parseTheirFile("Heading,,\nAmount,Label,Reference\nnot money,Ignored,x\nA$10.00,Australian income,1A\n", { amountColumn: 0, labelColumn: 1, referenceColumn: 2 });
    assert.deepEqual(parsed.detected, { reference: 2, label: 1, amount: 0 });
    assert.equal(parsed.lines.length, 1);
    assert.deepEqual(parsed.skipped.map((row) => [row.index, row.reason]), [[3, "Amount is not a number"]]);
  });

  it("enforces row and byte limits", () => {
    assert.throws(() => parseTheirFile(`Reference,Label,Amount\n${Array.from({ length: 2001 }, (_, i) => `r${i},Line ${i},1`).join("\n")}`), /2,000/);
    assert.throws(() => parseTheirFile(`Reference,Label,Amount\nr,${"x".repeat(1_000_001)},1`), /1 MB/);
    assert.throws(() => parseTheirFile(`${Array.from({ length: 201 }, (_, i) => `c${i}`).join(",")}\n`), /200 columns/);
  });

  it("refuses adversarial wide input within the interactive budget", () => {
    const wide = `${Array.from({ length: 40_000 }, (_, i) => `c${i}`).join(",")}\n`;
    assert.ok(new TextEncoder().encode(wide).byteLength < 1_000_000);
    const started = performance.now();
    assert.throws(() => parseTheirFile(wide), /200 columns/);
    assert.ok(performance.now() - started < 1_000);
  });
});

describe("compareLines", () => {
  const ours = [
    { ref: "AU_BAS.1A", label: "Australian income — other", amount: 10_000, note: "basis" },
    { ref: "component.cleanBuilding", label: "Clean building MIT income", amount: 20_000 },
    { ref: "component.interest", label: "Australian interest", amount: 30_000 },
  ];

  it("matches one-to-one by reference variant, label similarity and manual remap", () => {
    assert.equal(normaliseReference("AU_BAS.1A"), normaliseReference("1A"));
    assert.ok(labelSimilarity("Clean building income", "Clean building MIT income") >= 0.58);
    assert.ok(labelSimilarity("Completely unrelated", "Clean building MIT income") < 0.58);
    const theirs = parseTheirFile("Reference,Label,Amount\n1A,Other income,100.00\n,Clean building income,200.50\nlegacy,Legacy interest,300.00\n").lines;
    const result = compareLines(ours, theirs, { tolerance: 100, remaps: { legacy: "component.interest" } }, "AUD");
    assert.deepEqual(result.counts, { match: 2, "within-tolerance": 1, differs: 0, "only-in-theirs": 0, "only-in-ours": 0 });
  });

  it("classifies every status, sign convention and whole-dollar rounding hints", () => {
    const theirs = parseTheirFile("Reference,Label,Amount\nAU_BAS.1A,Australian income,-100.00\ncomponent.cleanBuilding,Clean building MIT income,199.50\nlegacy,Only theirs,5.00\n").lines;
    const result = compareLines(ours, theirs, { tolerance: 25 }, "AUD");
    assert.equal(result.counts.differs, 2);
    assert.equal(result.counts["only-in-theirs"], 1);
    assert.equal(result.counts["only-in-ours"], 1);
    assert.ok(result.rows.some((row) => row.hint === "Sign convention?"));
    assert.ok(result.rows.some((row) => row.hint === "Rounding to whole dollars?"));
  });

  it("does not reuse the same platform line twice", () => {
    const theirs = parseTheirFile("Reference,Label,Amount\nAU_BAS.1A,First,100.00\n1A,Second,100.00\n").lines;
    const result = compareLines(ours, theirs, {}, "AUD");
    assert.equal(result.counts.match, 1);
    assert.equal(result.counts["only-in-theirs"], 1);
  });

  it("builds headline text and export columns", () => {
    const theirs = parseTheirFile("Reference,Label,Amount\nAU_BAS.1A,Australian income,100.00\ncomponent.cleanBuilding,Clean building MIT income,190.00\n").lines;
    const result = compareLines(ours, theirs, { tolerance: 100 }, "AUD");
    assert.match(result.headline, /1 of 2 comparable lines match; largest difference A\$10.00 on Clean building MIT income\./);
    assert.deepEqual(result.csv.columns, ["status", "their_reference", "their_label", "their_amount", "our_reference", "our_label", "our_amount", "difference", "hint", "our_basis_note"]);
  });
});

describe("compareSources", () => {
  it("returns sources for every seeded fund with unique references and finite amounts", () => {
    const data = seedData();
    for (const fund of data.funds) {
      const sources = compareSources(data, fund.id, ctx(data));
      assert.ok(sources.length >= 6, fund.id);
      for (const source of sources) {
        const refs = source.lines.map((line) => line.ref);
        assert.equal(new Set(refs).size, refs.length, `${fund.id} ${source.id}`);
        assert.ok(source.lines.every((line) => Number.isFinite(line.amount)), `${fund.id} ${source.id}`);
      }
    }
  });

  it("compares the practice files with the expected outcome counts", () => {
    const data = seedData();
    for (const [fundId, file, expected] of [
      ["harbourline", "compare-harbourline-distribution-theirs.csv", { match: 2, "within-tolerance": 1, differs: 2, "only-in-theirs": 1, "only-in-ours": 5 }],
      ["loyang", "compare-loyang-distribution-theirs.csv", { match: 1, "within-tolerance": 1, differs: 1, "only-in-theirs": 1, "only-in-ours": 0 }],
    ] as const) {
      const source = compareSources(data, fundId, ctx(data)).find((s) => s.id === "distribution-components");
      assert.ok(source);
      const result = compareLines(source.lines, parseTheirFile(sample(file)).lines, { tolerance: source.tolerance }, fundId === "harbourline" ? "AUD" : "SGD");
      assert.deepEqual(result.counts, expected, fundId);
    }
  });
});
