import assert from "node:assert/strict";
import { test } from "node:test";
import { auModule } from "../../../src/domain/au/index.ts";
import type { AppData, AuInvestorView, CostBaseView, DeferredTaxInvestor, DocBlock } from "../../../src/domain/types.ts";
import { AU_IDS, auFund, ctxFor, freshData, nearDollars, NOW, sum, usd } from "./helpers.ts";

function costBase(data: AppData, id: string, investor?: DeferredTaxInvestor): CostBaseView {
  const fund = auFund(data, id);
  const calc = auModule.fundCalc(data, fund, NOW);
  return auModule.costBaseView(data, fund, calc, investor);
}

const kvRows = (view: CostBaseView, title: string): Record<string, string> => {
  const block = view.propertiesDoc.blocks.find((b): b is Extract<DocBlock, { kind: "kv" }> => b.kind === "kv" && b.title === title);
  assert.ok(block, `block "${title}"`);
  return Object.fromEntries(block.rows.map((r) => [r.label, r.value]));
};

test("Harbourline's properties: tax cost base after capital works, valuation and the unrealised gain", () => {
  const view = costBase(freshData(), "harbourline");
  assert.equal(view.market, "AU");
  assert.equal(view.asAtLabel, "Harbourline Office Trust · valuations at 30 Jun 2026");
  const expected = [
    ["Harbourline Tower", "2014-03-18", true, 536_756_063, 81_170_778, 783_663_852, 246_907_789],
    ["Riverside Place", "2017-08-01", true, 473_142_308, 59_017_751, 406_902_385, -66_239_923],
    ["Collins Quarter", "2026-02-20", false, 304_307_338, 1_836_865, 316_479_632, 12_172_294],
  ] as const;
  assert.equal(view.properties.length, expected.length);
  view.properties.forEach((p, i) => {
    const [name, acquired, discount, costBaseDollars, works, valuation, unrealised] = expected[i];
    assert.equal(p.name, name);
    assert.equal(p.acquired, acquired);
    assert.equal(p.discountApplies, discount);
    assert.equal(p.heldLabel, discount ? "Held 12 months — discount applies" : "Held under 12 months — no discount");
    nearDollars(p.costBase, costBaseDollars, `${name} cost base`);
    nearDollars(p.capitalWorks, works, `${name} capital works`);
    nearDollars(p.valuation, valuation, `${name} valuation`);
    nearDollars(p.unrealised, unrealised, `${name} unrealised`);
    assert.equal(p.unrealised, p.valuation - p.costBase);
  });
  nearDollars(view.propertyTotals.costBase, 1_314_205_709, "total cost base");
  nearDollars(view.propertyTotals.valuation, 1_507_045_869, "total valuation");
  nearDollars(view.propertyTotals.unrealised, 192_840_160, "total unrealised");
});

test("the CGT summary applies losses to gains with no discount first, then the trust's 50% discount", () => {
  const view = costBase(freshData(), "harbourline");
  assert.ok(view.cgtSummary);
  assert.deepEqual(
    view.cgtSummary.map((r) => [r.label, r.emphasis ?? false]),
    [
      ["Gains", false],
      ["Less: losses", false],
      ["Gains held 12 months or more, after losses", false],
      ["Other gains, after losses", false],
      ["Less: 50% CGT discount at the trust", false],
      ["Net capital gain if sold at valuation", true],
    ],
  );
  const dollars = view.cgtSummary.map((r) => r.amount / 100);
  [259_080_083, -66_239_923, 192_840_160, 0, -96_420_080, 96_420_080].forEach((v, i) => nearDollars(view.cgtSummary![i].amount, v, view.cgtSummary![i].label));
  assert.ok(dollars.every((n) => !Object.is(n, -0)));
});

test("deferred tax by investor type, with the basis for the selected one", () => {
  const data = freshData();
  const base = costBase(data, "harbourline");
  assert.ok(base.deferredTax);
  assert.deepEqual(
    base.deferredTax.investors.map((i) => [i.id, i.label]),
    [
      ["foreign-eoi", "Foreign investor — EOI country"],
      ["foreign-non-eoi", "Foreign investor — non-EOI country"],
      ["complying-super", "Australian complying super fund"],
      ["company", "Australian company"],
    ],
  );
  [28_926_024, 57_852_048, 19_284_016, 57_852_048].forEach((v, i) => nearDollars(base.deferredTax!.investors[i].amount, v, base.deferredTax!.investors[i].label));
  assert.equal(base.deferredTax.selected, "foreign-eoi", "the EOI investor is the default");
  assert.equal(base.deferredTax.note, "15% withholding on the fund payment, which includes the gain before the discount.");

  const notes: Record<DeferredTaxInvestor, string> = {
    "foreign-eoi": "15% withholding on the fund payment, which includes the gain before the discount.",
    "foreign-non-eoi": "30% withholding on the fund payment, which includes the gain before the discount.",
    "complying-super": "15% tax after its one-third discount on gains from property held 12 months or more.",
    company: "30% tax with no CGT discount.",
  };
  for (const [investor, note] of Object.entries(notes) as Array<[DeferredTaxInvestor, string]>) {
    const view = costBase(data, "harbourline", investor);
    assert.equal(view.deferredTax?.selected, investor);
    assert.equal(view.deferredTax?.note, note);
    assert.deepEqual(view.deferredTax?.investors, base.deferredTax.investors, "the table does not depend on the selection");
  }
});

test("deferred tax for the other four funds (EOI investor)", () => {
  const data = freshData();
  const expected: Record<string, number> = { southbank: 41_589_080, wattle: 0, kurrajong: 40_151_760, coastline: 10_362_870 };
  for (const [id, dollars] of Object.entries(expected)) nearDollars(costBase(data, id).deferredTax!.investors[0].amount, dollars, id);
});

test("a net capital loss is carried forward and defers no tax", () => {
  const data = freshData();
  for (const p of data.properties.filter((x) => x.fundId === "harbourline")) p.valuation = Math.round(p.valuation / 4);
  const view = costBase(data, "harbourline");
  assert.ok(view.deferredTax);
  assert.ok(view.deferredTax.investors.every((i) => i.amount === 0));
  assert.match(view.deferredTax.note, / Net capital loss of A\$[\d,]+ carries forward to offset later gains\.$/);
  assert.equal(view.cgtSummary?.[5].amount, 0);
  assert.ok(view.cgtSummary?.every((r) => !Object.is(r.amount, -0)));
});

test("a property bought exactly a year before the valuation date has not earned the discount until the next day", () => {
  const data = freshData();
  const collins = data.properties.find((p) => p.id === "harbourline-collins-quarter");
  assert.ok(collins);
  collins.acquired = "2025-06-30";
  assert.equal(costBase(data, "harbourline").properties[2].discountApplies, false);
  collins.acquired = "2025-06-29";
  assert.equal(costBase(data, "harbourline").properties[2].discountApplies, true);
});

test("unit cost base: opening, the AMIT cost base net amount, closing, per unit and unrealised gain", () => {
  const view = costBase(freshData(), "harbourline");
  assert.equal(view.unitPriceLabel, "A$0.720 · market price");
  assert.equal(view.adjustmentLabel, "AMIT cost base net amount");
  assert.equal(view.footnote, "An excess decreases the cost base and a shortfall increases it. Decreases beyond the cost base are a capital gain under CGT event E10.");
  // units, opening, adjustment, closing, cost per unit, market value, unrealised
  const expected = [
    [902_151_600, 610_576_203, -18_464_387, 592_111_816, 0.6563, 649_549_152, 57_437_336],
    [141_268_000, 82_387_498, -2_891_340, 79_496_158, 0.5627, 101_712_960, 22_216_802],
    [211_902_000, 161_723_606, -4_337_010, 157_386_596, 0.7427, 152_569_440, -4_817_156],
    [141_268_000, 89_507_405, -2_891_340, 86_616_065, 0.6131, 101_712_960, 15_096_895],
    [16_090_400, 11_237_535, -329_323, 10_908_212, 0.6779, 11_585_088, 676_876],
  ];
  assert.equal(view.unitRows.length, expected.length);
  view.unitRows.forEach((r, i) => {
    const [units, opening, adjustment, closing, perUnit, marketValue, unrealised] = expected[i];
    assert.equal(r.units, units);
    nearDollars(r.opening, opening, `${r.holder} opening`);
    nearDollars(r.adjustment, adjustment, `${r.holder} adjustment`);
    nearDollars(r.closing, closing, `${r.holder} closing`);
    assert.ok(Math.abs(r.perUnit - perUnit) < 0.0001, `${r.holder} cost per unit ${r.perUnit}`);
    nearDollars(r.marketValue, marketValue, `${r.holder} market value`);
    nearDollars(r.unrealised, unrealised, `${r.holder} unrealised`);
    assert.equal(r.closing, r.opening + r.adjustment);
    assert.equal(r.unrealised, r.marketValue - r.closing);
  });
  const t = view.unitTotals;
  assert.equal(t.units, 1_412_680_000);
  nearDollars(t.opening, 955_432_247, "opening total");
  nearDollars(t.adjustment, -28_913_400, "adjustment total");
  nearDollars(t.closing, 926_518_847, "closing total");
  nearDollars(t.marketValue, 1_017_129_600, "market value total");
  nearDollars(t.unrealised, 90_610_753, "unrealised total");
  assert.equal(t.opening + t.adjustment, t.closing);
});

test("the unit adjustment is the AIIR's cost base net amount with the sign reversed, for every fund", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const fund = auFund(data, id);
    const calc = auModule.fundCalc(data, fund, NOW);
    const investor = auModule.investorView(data, fund, calc, ctxFor(data));
    assert.equal(investor.market, "AU");
    const aiir = (investor as AuInvestorView).aiir;
    const view = auModule.costBaseView(data, fund, calc);
    assert.equal(view.unitRows.length, aiir.lines.length, id);
    for (const row of view.unitRows) {
      const line = aiir.lines.find((l) => l.holderId === row.holderId);
      assert.ok(line);
      assert.equal(row.adjustment, line.costBaseNet === 0 ? 0 : -line.costBaseNet, `${id} ${row.holderId}`);
    }
  }
  const southbank = costBase(data, "southbank");
  assert.ok(southbank.unitRows.every((r) => r.adjustment > 0), "a shortfall increases the cost base");
  assert.ok(southbank.unitRows.every((r) => r.closing > r.opening));
});

test("a cost base cannot go below nil: the excess becomes a CGT event E10 gain", () => {
  const data = freshData();
  data.unitCostBase.harbourline.opening["h-hl-3"] = 1_000_00;
  const view = costBase(data, "harbourline");
  const row = view.unitRows.find((r) => r.holderId === "h-hl-3");
  assert.ok(row);
  assert.equal(row.closing, 0);
  assert.equal(row.perUnit, 0);
  assert.equal(row.unrealised, row.marketValue);
  const e10 = view.unitsCsv.rows.find((r) => r[0] === "Sakuragawa Life Assurance");
  assert.ok(e10);
  assert.equal(e10[10], usd(-(row.opening + row.adjustment)), "E10 gain = the part of the excess beyond the cost base");
  assert.ok((e10[10] as number) > 4_000_000);
  assert.equal(view.unitsCsv.rows.filter((r) => r[10] !== 0).length, 1, "only that investor has an E10 gain");
});

test("the properties spreadsheet and document", () => {
  const view = costBase(freshData(), "harbourline");
  assert.equal(view.propertiesCsv.fileName, "harbourline-office-trust-unrealised-cgt-properties.csv");
  assert.deepEqual(view.propertiesCsv.columns, ["Property", "Location", "Acquired", "Cost", "Improvements", "Capital works claimed", "Tax cost base", "Valuation", "Unrealised gain", "Held 12 months"]);
  assert.deepEqual(view.propertiesCsv.rows.map((r) => [r[0], r[1], r[2], r[9]]), [
    ["Harbourline Tower", "210 Kent Street, Sydney NSW", "2014-03-18", "Yes"],
    ["Riverside Place", "71 Eagle Street, Brisbane QLD", "2017-08-01", "Yes"],
    ["Collins Quarter", "455 Collins Street, Melbourne VIC", "2026-02-20", "No"],
  ]);
  for (const row of view.propertiesCsv.rows) {
    assert.ok(row.slice(3, 9).every((c) => typeof c === "number"));
    assert.ok(Math.abs((row[3] as number) + (row[4] as number) - (row[5] as number) - (row[6] as number)) <= 0.02, "cost + improvements - capital works = tax cost base");
    assert.ok(Math.abs((row[7] as number) - (row[6] as number) - (row[8] as number)) <= 0.02, "valuation - tax cost base = unrealised gain");
  }

  const doc = view.propertiesDoc;
  assert.equal(doc.fileName, "harbourline-office-trust-unrealised-cgt-properties.pdf");
  assert.equal(doc.title, "Unrealised CGT on properties");
  assert.equal(doc.subtitle, view.asAtLabel);
  const table = doc.blocks.find((b): b is Extract<DocBlock, { kind: "table" }> => b.kind === "table");
  assert.ok(table);
  assert.equal(table.rows[0].property, "Harbourline Tower — 210 Kent Street, Sydney NSW");
  assert.equal(table.rows[0].acquired, "18 Mar 2014 · Held 12 months — discount applies");
  assert.equal(table.rows[0].costBase, "A$536,756,063 after A$81,170,778 capital works");
  assert.equal(table.rows[2].acquired, "20 Feb 2026 · Held under 12 months — no discount");
  assert.equal(table.totalRow?.unrealised, "A$192,840,160");
  assert.equal(kvRows(view, "If every property were sold at its valuation")["Net capital gain if sold at valuation"], "A$96,420,080");
  assert.equal(kvRows(view, "Deferred tax by investor type")["Australian company"], "A$57,852,048");
});

test("the unit spreadsheet carries whole-dollar and per-unit figures as numbers", () => {
  const view = costBase(freshData(), "harbourline");
  assert.equal(view.unitsCsv.fileName, "harbourline-office-trust-unit-cost-base.csv");
  assert.deepEqual(view.unitsCsv.columns, [
    "Holder",
    "Tax status",
    "Units",
    "Opening cost base",
    "Adjustment",
    "Closing cost base",
    "Cost per unit",
    "Unit price",
    "Market value",
    "Unrealised gain",
    "CGT event E10 gain",
  ]);
  assert.equal(view.unitsCsv.rows.length, view.unitRows.length);
  view.unitsCsv.rows.forEach((row, i) => {
    const r = view.unitRows[i];
    assert.deepEqual(row.slice(0, 3), [r.holder, r.statusLabel, r.units]);
    assert.ok(row.slice(3).every((c) => typeof c === "number" && Number.isFinite(c)));
    assert.equal(row[3], usd(r.opening));
    assert.equal(row[4], usd(r.adjustment));
    assert.equal(row[5], usd(r.closing));
    assert.equal(row[6], Number(r.perUnit.toFixed(6)));
    assert.equal(row[7], 0.72);
    assert.equal(row[8], usd(r.marketValue));
  });
});

test("every fund has a coherent cost base view, and an empty portfolio is handled", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const view = costBase(data, id);
    assert.equal(view.propertyTotals.costBase, sum(view.properties.map((p) => p.costBase)), id);
    assert.equal(view.propertyTotals.unrealised, sum(view.properties.map((p) => p.unrealised)), id);
    assert.equal(view.unitTotals.units, sum(view.unitRows.map((r) => r.units)), id);
    assert.ok(view.unitPriceLabel.startsWith("A$"), id);
  }
  data.properties = data.properties.filter((p) => p.fundId !== "wattle");
  const empty = costBase(data, "wattle");
  assert.deepEqual(empty.properties, []);
  assert.deepEqual(empty.propertyTotals, { costBase: 0, valuation: 0, unrealised: 0 });
  assert.ok(empty.deferredTax?.investors.every((i) => i.amount === 0));
  assert.ok(empty.cgtSummary?.every((r) => r.amount === 0 && !Object.is(r.amount, -0)));
  assert.equal(empty.propertiesCsv.rows.length, 0);
});

test("a fund from another market is refused", () => {
  const data = freshData();
  const sg = data.funds.find((f) => f.market !== "AU");
  assert.ok(sg);
  assert.throws(() => auModule.costBaseView(data, sg, auModule.fundCalc(data, auFund(data, "wattle"), NOW)), /not an Australian fund/);
});
