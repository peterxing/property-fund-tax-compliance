// The reader of the reference capture (capture.ts) and the fixtures built with it. The coverage test is only as strict as these are.
// PFC_CAPTURE_DIR=<folder with pfc-ref-text-au.decoded.json and pfc-ref-text-sg.decoded.json> also checks the fixtures against the files
// (regenerate them with scripts/capture-fixtures.mjs after changing the reader).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  FIXTURE_FILES,
  FUND_PAGES,
  KINDS,
  PORTFOLIO_PAGES,
  fixtureFrom,
  fixturesFromFolder,
  has,
  normalise,
  searchable,
  stringifyFixture,
  tokensOf,
  type CaptureFixture,
} from "./capture.ts";
import { FUNDS } from "./personas.ts";

const fixtureText = (file: string): string => readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8");
const FIXTURES: Record<"AU" | "SG", CaptureFixture> = { AU: JSON.parse(fixtureText(FIXTURE_FILES.AU)) as CaptureFixture, SG: JSON.parse(fixtureText(FIXTURE_FILES.SG)) as CaptureFixture };

const on = (text: string, kind: Parameters<typeof has>[1], token: string): boolean => has(searchable(text), kind, token);

describe("reading the capture's text", () => {
  it("takes amounts with their suffix and decimals, even where the capture ran two spans together", () => {
    const found = tokensOf("Other incomeA$16.97mInterestA$212.3kForeign incomeA$1.10m\nA$2,760,4500.8655 c/unit");
    assert.deepEqual(found.amount, ["A$16.97m", "A$212.3k", "A$1.10m", "A$2,760,450"]);
    assert.deepEqual(found.figure, ["0.8655"]);
  });

  it("keeps the minus of a negative amount, and writes an amount that carries 'excess' or 'shortfall' without a sign", () => {
    const found = tokensOf("Cost base\t−A$530,410\tA$1,656,270 excess\tA$4,816,860 shortfall\t-A$7");
    assert.deepEqual(found.amount, ["−A$530,410", "~A$1,656,270", "~A$4,816,860", "-A$7"]);
  });

  it("takes percentages, grouped numbers and long decimals, but not years or short counts", () => {
    const found = tokensOf("Units\t1,412,680,000\t0.8655\t12.345678\t2026\t7\n-3%\t12.5%\t100%");
    assert.deepEqual(found.percent, ["-3%", "12.5%", "100%"]);
    assert.deepEqual(found.figure, ["1,412,680,000", "0.8655", "12.345678"]);
  });

  it("takes dates with or without the weekday, whatever the capture's letter case", () => {
    const found = tokensOf("AIIR due\nTue 13 Oct 2026\t30 JUN 2026\nIncome year ended 30 Sep 2026");
    assert.deepEqual(found.date, ["Tue 13 Oct 2026", "30 Jun 2026", "30 Sep 2026"]);
    assert.ok(found.label.includes("Income year ended"), "the words before the date stay a heading");
  });

  it("keeps each heading and sentence, and leaves out words the capture glued together or left beside a number", () => {
    const found = tokensOf("Tax agent signs off; you lodge\nSouthbank IndustrialPartners Fund\nPaid A$12\n684,215,000 units reported");
    assert.deepEqual(found.label, ["Tax agent signs off; you lodge", "units reported"]);
  });

  it("counts every string once per page, in the order the page says it", () => {
    const found = tokensOf("A$5\nA$5\nA$6\t A$5\nTotal\nTotal");
    assert.deepEqual(found.amount, ["A$5", "A$6"]);
    assert.deepEqual(found.label, ["Total"]);
  });
});

describe("looking a string up in our text", () => {
  it("wants the whole amount: more digits, decimals or a different thousands group are another amount", () => {
    assert.ok(on("A$4,324,852 shortfall", "amount", "A$4,324,852"));
    assert.ok(!on("Draft A$4,324,852.42", "amount", "A$4,324,852"));
    assert.ok(!on("A$4,324,8523", "amount", "A$4,324,852"));
    assert.ok(!on("A$14,324,852", "amount", "A$4,324,852"));
    assert.ok(!on("A$324,852", "amount", "A$4,324,852"));
    assert.ok(on("A$4,324,852.42", "amount", "A$4,324,852.42"));
  });

  it("matches the sign: a minus is not missing, an extra minus is not there, and 'excess' or 'shortfall' lets either do", () => {
    assert.ok(on("−A$530,410", "amount", "−A$530,410"));
    assert.ok(on("-A$530,410", "amount", "−A$530,410"));
    assert.ok(!on("A$530,410", "amount", "−A$530,410"));
    assert.ok(!on("−A$530,410", "amount", "A$530,410"));
    assert.ok(on("A$530,410 shortfall", "amount", "~A$530,410"));
    assert.ok(on("−A$530,410", "amount", "~A$530,410"));
    assert.ok(!on("A$530,411", "amount", "~A$530,410"));
  });

  it("does not mind spacing, the non-breaking space or the currency written apart from the number", () => {
    assert.ok(on("Cash\u00a0distribution A$ 21,048,000", "amount", "A$21,048,000"));
    assert.ok(on("S$\u202f837,081.75", "amount", "S$837,081.75"));
    assert.ok(on("Fund payment  ·  15% EOI", "label", "Fund payment · 15% EOI"));
  });

  it("takes a percentage as the whole figure with its sign", () => {
    assert.ok(on("loses 12% of", "percent", "12%"));
    assert.ok(!on("loses 112% of", "percent", "12%"));
    assert.ok(!on("loses 0.12% of", "percent", "12%"));
    assert.ok(on("−3%", "percent", "-3%"));
    assert.ok(!on("3%", "percent", "-3%"));
    assert.ok(!on("-3%", "percent", "3%"));
  });

  it("takes a date as written, not inside a longer number", () => {
    assert.ok(on("Due Tue 13 Oct 2026.", "date", "Tue 13 Oct 2026"));
    assert.ok(!on("Due 13 Oct 2026", "date", "Tue 13 Oct 2026"));
    assert.ok(!on("Due 113 Oct 2026", "date", "13 Oct 2026"));
    assert.ok(!on("Due 13 Oct 20267", "date", "13 Oct 2026"));
  });

  it("takes a figure as a whole number, not the end of a longer one", () => {
    assert.ok(on("0.8655 c/unit", "figure", "0.8655"));
    assert.ok(!on("10.8655", "figure", "0.8655"));
    assert.ok(on("1,412,680,000 units", "figure", "1,412,680,000"));
    assert.ok(!on("A$1,412,680,000", "figure", "1,412,680,000"));
    assert.ok(!on("11,412,680,000", "figure", "1,412,680,000"));
  });

  it("finds a heading whatever its letter case or quotes, and only as written", () => {
    assert.ok(on("WORKFLOW STATUS: Preparing", "label", "Workflow status"));
    assert.ok(on("This fund’s “record”", "label", `This fund's "record"`));
    assert.ok(!on("Record lodgment", "label", "Record the lodgment"));
  });

  it("smooths over the minus sign, spacing and currency spacing in normalise", () => {
    assert.equal(normalise("  −A$ 1,000\u00a0·\u00a0x  "), "-A$1,000 · x");
    assert.equal(searchable("A$ 1"), "a$1");
  });
});

describe("the fixtures", () => {
  it("hold every fund's five pages, and the Singapore file the three portfolio pages", () => {
    for (const fund of FUNDS) {
      const fixture = FIXTURES[fund.market];
      assert.deepEqual(Object.keys(fixture.pages[fund.id] ?? {}), [...FUND_PAGES], `${fund.id} pages`);
      for (const page of FUND_PAGES) {
        const tokens = fixture.pages[fund.id]![page]!;
        assert.deepEqual(Object.keys(tokens), [...KINDS], `${fund.id} ${page} kinds`);
        assert.ok(tokens.label.length > 10, `${fund.id} ${page} has headings`);
        assert.ok(tokens.amount.length + tokens.figure.length > 0, `${fund.id} ${page} has figures`);
      }
    }
    assert.deepEqual(Object.keys(FIXTURES.SG.pages.portfolio ?? {}), [...PORTFOLIO_PAGES]);
    assert.ok(!("portfolio" in FIXTURES.AU.pages), "the AU file has no portfolio pages");
    assert.deepEqual(Object.keys(FIXTURES.AU.pages).sort(), FUNDS.filter((fund) => fund.market === "AU").map((fund) => fund.id).sort());
    assert.deepEqual(Object.keys(FIXTURES.SG.pages).sort(), [...FUNDS.filter((fund) => fund.market === "SG").map((fund) => fund.id), "portfolio"].sort());
  });

  it("say what the captured pages say (a few figures the acceptance criteria depend on)", () => {
    assert.ok(FIXTURES.AU.pages.coastline!.Distributions!.amount.includes("A$21,048,000"));
    assert.ok(FIXTURES.AU.pages.coastline!.Distributions!.amount.includes("A$640,638"));
    assert.ok(FIXTURES.AU.pages.harbourline!["Tax returns"]!.amount.includes("A$55,708,600"));
    assert.ok(FIXTURES.SG.pages.kallang!["Investor reporting"]!.amount.includes("S$837,081.75"));
    assert.ok(FIXTURES.SG.pages.portfolio!.Analytics!.label.some((label) => /loses the most/i.test(label)));
  });

  it("are written the way stringifyFixture writes them, one line per list", () => {
    for (const file of Object.values(FIXTURE_FILES)) {
      const text = fixtureText(file);
      assert.ok(!text.includes("\r"), `${file} has LF line ends`);
      assert.ok(stringifyFixture(JSON.parse(text) as CaptureFixture) === text, `${file} is in the canonical layout`);
    }
  });

  it("are built by name: an unknown fund or a missing page is an error, not a silent gap", () => {
    assert.throws(() => fixtureFrom({ "Nowhere Trust": {} }, "x"), /does not know/);
    const harbourline = FUNDS.find((fund) => fund.id === "harbourline")!;
    assert.throws(() => fixtureFrom({ [harbourline.name]: { Distributions: "A$1" } }, "x"), /no "Trial balance" text/);
    const page = Object.fromEntries(FUND_PAGES.map((name) => [name, "Heading here\nA$12,345"]));
    const fixture = fixtureFrom({ [harbourline.name]: page, portfolio: Object.fromEntries(PORTFOLIO_PAGES.map((name) => [name, "Portfolio"])) }, "x");
    assert.deepEqual(Object.keys(fixture.pages), ["harbourline", "portfolio"]);
    assert.deepEqual(fixture.pages.harbourline!["Cost base & CGT"]!.amount, ["A$12,345"]);
  });

  it("match the capture files when PFC_CAPTURE_DIR points at them", (t) => {
    const folder = process.env.PFC_CAPTURE_DIR;
    if (!folder) {
      t.skip("set PFC_CAPTURE_DIR to the folder with pfc-ref-text-au.decoded.json and pfc-ref-text-sg.decoded.json");
      return;
    }
    const built = fixturesFromFolder(folder);
    for (const market of ["AU", "SG"] as const) {
      assert.ok(stringifyFixture(built[market]) === fixtureText(FIXTURE_FILES[market]), `${FIXTURE_FILES[market]} is stale: run scripts/capture-fixtures.mjs`);
    }
  });
});
