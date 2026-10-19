// Cost base & CGT workspace for the Singapore funds: no capital gains tax, so a valuation view of the properties and a unit cost base
// that only moves for returns of capital. Golden values from the reference app's rendered Cost base screens (cents).
import assert from "node:assert/strict";
import { test } from "node:test";
import { sgModule } from "../../../src/domain/sg/index.ts";
import type { AppData, CostBaseView } from "../../../src/domain/types.ts";
import { calcFor, freshData, NOW, sgFund, SG_IDS } from "./helpers.ts";

function costBaseOf(data: AppData, id: string): CostBaseView {
  const fund = sgFund(data, id);
  return sgModule.costBaseView(data, fund, sgModule.fundCalc(data, fund, NOW));
}
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
// IRAS e-Tax Guide para 8.8 (its footnote cites ITA s35(15C)), as the lead worded it.
const RETURN_OF_CAPITAL_FOOTNOTE =
  "Unit holders should reduce their cost of units by the amount of return of capital (ITA s35(15C)). For traders, the reduced cost is used for trading gains; if the return of capital exceeds the cost, the excess is taxable as trading income and the proceeds of all later sales of the remaining units are fully taxable.";

test("Loyang: properties, valuations and unrealised gains match the reference", () => {
  const view = costBaseOf(freshData(), "loyang");
  assert.equal(view.market, "SG");
  assert.equal(view.asAtLabel, "Loyang Logistics REIT · valuations at 30 Jun 2026");
  assert.deepEqual(
    view.properties.map((p) => [p.name, p.location, p.acquired, p.costBase, p.valuation, p.unrealised]),
    [
      ["Loyang Logistics Hub", "Loyang Crescent", "2012-02-20", 172_634_642_900, 248_593_885_800, 75_959_242_900],
      ["Tuas Cold Chain Centre", "Tuas South Avenue", "2016-07-11", 161_424_601_200, 203_394_997_500, 41_970_396_300],
      ["Changi North Distribution Centre", "Changi North Rise", "2019-10-28", 147_972_551_100, 165_729_257_200, 17_756_706_100],
      ["Senoko Industrial Park", "Senoko Drive", "2021-06-14", 131_647_247_700, 135_596_665_100, 3_949_417_400],
    ],
  );
  assert.deepEqual(view.propertyTotals, { costBase: 613_679_042_900, valuation: 753_314_805_600, unrealised: 139_635_762_700 });
  // No capital works deduction and no 12-month discount in Singapore.
  assert.ok(view.properties.every((p) => p.capitalWorks === 0 && p.heldLabel === "" && p.discountApplies === false));
  assert.equal(view.cgtSummary, undefined);
  assert.equal(view.deferredTax, undefined);
});

test("Loyang: the unit cost base moves only by the capital returned", () => {
  const view = costBaseOf(freshData(), "loyang");
  assert.equal(view.unitPriceLabel, "S$1.723 · market price");
  assert.equal(view.adjustmentLabel, "Return of capital reduces the cost of units");
  assert.deepEqual(
    view.unitRows.map((r) => [r.holderId, r.statusLabel, r.units, r.opening, r.adjustment, r.closing, r.marketValue, r.unrealised]),
    [
      ["h-ly-1", "Individual", 1_004_867_500, 162_750_350_000, -150_570_000, 162_599_780_000, 173_138_670_250, 10_538_890_250],
      ["h-ly-2", "Qualifying unitholder", 717_762_500, 100_173_087_800, -107_550_000, 100_065_537_800, 123_670_478_750, 23_604_940_950],
      ["h-ly-3", "Qualifying non-resident non-individual", 574_210_000, 104_872_566_000, -86_040_000, 104_786_526_000, 98_936_383_000, -5_850_143_000],
      ["h-ly-4", "Qualifying non-resident fund · section 13D/13U/13V", 430_657_500, 65_298_012_800, -64_530_000, 65_233_482_800, 74_202_287_250, 8_968_804_450],
      ["h-ly-5", "Qualifying non-resident non-individual", 143_552_500, 23_992_072_900, -21_510_000, 23_970_562_900, 24_734_095_750, 763_532_850],
    ],
  );
  assert.deepEqual(view.unitTotals, {
    units: 2_871_050_000,
    opening: 457_086_089_500,
    adjustment: -430_200_000,
    closing: 456_655_889_500,
    marketValue: 494_681_915_000,
    unrealised: 38_026_025_500,
  });
  const first = view.unitRows[0];
  assert.ok(Math.abs(first.perUnit - 1.618122) < 1e-6, "closing cost base per unit in dollars");
  assert.equal(view.footnote, RETURN_OF_CAPITAL_FOOTNOTE);
  assert.equal(view.sgValuationNote, undefined);
  assert.equal(
    view.sgNote,
    "Singapore doesn't tax capital gains. A gain on disposal is taxed at the trustee only if it's revenue in nature, and a distribution of a capital gain isn't taxable to unitholders.",
  );
});

test("the valuation note appears only when valuations differ from the trial balance by at least S$0.50", () => {
  const data = freshData();
  data.properties.find((p) => p.id === "loyang-loyang-logistics-hub")!.valuation += 49;
  assert.equal(costBaseOf(data, "loyang").sgValuationNote, undefined);
  data.properties.find((p) => p.id === "loyang-loyang-logistics-hub")!.valuation += 1;
  assert.equal(
    costBaseOf(data, "loyang").sgValuationNote,
    "Valuations total S$7,533,148,056.50; investment properties in the trial balance are S$7,533,148,056.00.",
  );
});

test("every fund: totals agree with the rows and the capital distribution", () => {
  const data = freshData();
  const labels: Record<string, string> = { "telok-ayer": "S$0.853 · market price", loyang: "S$1.723 · market price", meranti: "S$1.408 · market price", kallang: "S$0.780 · market price" };
  for (const id of SG_IDS) {
    const view = costBaseOf(data, id);
    const fund = sgFund(data, id);
    assert.equal(view.unitPriceLabel, labels[id], id);
    assert.equal(view.unitTotals.units, fund.unitsOnIssue, id);
    assert.equal(view.unitTotals.closing, view.unitTotals.opening + view.unitTotals.adjustment, id);
    assert.equal(view.unitTotals.unrealised, view.unitTotals.marketValue - view.unitTotals.closing, id);
    assert.equal(0 - view.unitTotals.adjustment, fund.inputs.capitalDistribution, `${id}: the cost base falls by exactly the capital distributed`);
    assert.equal(view.propertyTotals.unrealised, view.propertyTotals.valuation - view.propertyTotals.costBase, id);
    assert.equal(sum(view.properties.map((p) => p.valuation)), view.propertyTotals.valuation, id);
    assert.ok(view.properties.length > 0, id);
    assert.ok(view.unitRows.every((r) => Number.isInteger(r.marketValue) && Number.isInteger(r.closing)), id);
    assert.ok(!view.unitRows.some((r) => Object.is(r.adjustment, -0)), `${id}: no negative zero`);
    assert.deepEqual(
      view.unitRows.map((r) => r.holderId),
      data.holders.filter((h) => h.fundId === id).map((h) => h.id),
      id,
    );
  }
  // Property cost is the cost plus improvements the seed records.
  const view = costBaseOf(data, "telok-ayer");
  const seeded = data.properties.filter((p) => p.fundId === "telok-ayer");
  assert.deepEqual(
    view.properties.map((p) => p.costBase),
    seeded.map((p) => p.cost + p.improvements),
  );
});

test("a fund that returns no capital leaves the unit cost base unchanged", () => {
  const view = costBaseOf(freshData(), "kallang");
  assert.ok(view.unitRows.every((r) => r.adjustment === 0 && r.closing === r.opening));
  assert.equal(view.unitTotals.adjustment, 0);
});

test("the CSV exports follow the reference layout: dollars-and-cents amounts, one row per property and unit holder", () => {
  const view = costBaseOf(freshData(), "loyang");
  assert.equal(view.propertiesCsv.fileName, "loyang-logistics-reit-unrealised-gains.csv");
  assert.deepEqual(view.propertiesCsv.columns, [
    "Property",
    "Location",
    "Acquired",
    "Cost",
    "Improvements",
    "Capital works claimed",
    "Tax cost base",
    "Valuation",
    "Unrealised gain",
    "Held 12 months",
  ]);
  assert.deepEqual(view.propertiesCsv.rows[0], [
    "Loyang Logistics Hub",
    "Loyang Crescent",
    "2012-02-20",
    1_627_093_713,
    99_252_716,
    0,
    1_726_346_429,
    2_485_938_858,
    759_592_429,
    "Yes",
  ]);
  assert.equal(view.propertiesCsv.rows.length, 4);
  assert.equal(view.unitsCsv.fileName, "loyang-logistics-reit-unit-cost-base.csv");
  assert.deepEqual(view.unitsCsv.columns, [
    "Holder",
    "Units",
    "Opening cost base",
    "Adjustment",
    "Closing cost base",
    "Cost per unit",
    "Unit price",
    "Market value",
    "Unrealised gain",
    "Excess over cost base",
  ]);
  assert.deepEqual(view.unitsCsv.rows[2], ["Kestrel Pension Plan", 574_210_000, 1_048_725_660, -860_400, 1_047_865_260, "1.824882", "1.723", 989_363_830, -58_501_430, 0]);
  assert.equal(view.unitsCsv.rows[0][6], "1.723", "the unit price is written to 3 dp");
  assert.equal(view.unitsCsv.rows.length, 5);
  assert.ok(view.unitsCsv.rows.every((r) => r.length === view.unitsCsv.columns.length));
  assert.ok(view.propertiesCsv.rows.every((r) => r.length === view.propertiesCsv.columns.length));
});

test("the CSV marks a property held for 12 months at the period end, to the day", () => {
  const data = freshData();
  const fund = sgFund(data, "loyang"); // period ends 30 Jun 2026
  const owned = data.properties.filter((p) => p.fundId === fund.id);
  owned[0].acquired = "2025-06-30"; // exactly 12 months
  owned[1].acquired = "2025-07-01"; // a day short
  owned[2].acquired = "2025-06-29"; // a day over
  owned[3].acquired = "2026-06-30"; // acquired on the period end
  const view = sgModule.costBaseView(data, fund, sgModule.fundCalc(data, fund, NOW));
  assert.deepEqual(
    view.propertiesCsv.rows.map((r) => r[9]),
    ["Yes", "No", "Yes", "No"],
  );
  assert.ok(view.properties.every((p) => p.discountApplies === false && p.heldLabel === ""), "Singapore has no 12-month discount, so the table never shows one");
});

test("the properties document lists each property with a total", () => {
  const doc = costBaseOf(freshData(), "loyang").propertiesDoc;
  assert.equal(doc.fileName, "loyang-logistics-reit-unrealised-gains.pdf");
  assert.equal(doc.title, "Unrealised gains on properties");
  assert.equal(doc.subtitle, "Loyang Logistics REIT · valuations at 30 Jun 2026");
  const table = doc.blocks[0];
  assert.ok(table.kind === "table");
  assert.equal(table.title, "Tax cost base, valuation and unrealised gain for each property");
  assert.deepEqual(table.rows[0], {
    property: "Loyang Logistics Hub",
    location: "Loyang Crescent",
    acquired: "20 Feb 2012",
    cost: "S$1,726,346,429",
    valuation: "S$2,485,938,858",
    unrealised: "S$759,592,429",
  });
  assert.deepEqual(table.totalRow, { property: "Total", location: "", acquired: "", cost: "S$6,136,790,429", valuation: "S$7,533,148,056", unrealised: "S$1,396,357,627" });
  assert.ok(doc.blocks[1].kind === "paragraph" && doc.blocks[1].text.startsWith("Singapore doesn't tax capital gains."));
});

test("a fund with no unit cost base record shows zero cost rather than failing", () => {
  const data = freshData();
  delete (data.unitCostBase as Record<string, unknown>)["loyang"];
  const view = costBaseOf(data, "loyang");
  assert.equal(view.unitPriceLabel, "S$0.000 · market price");
  assert.equal(view.unitTotals.opening, 0);
  assert.equal(view.unitTotals.marketValue, 0);
  assert.equal(view.unitTotals.adjustment, -430_200_000);
  assert.equal(view.unitTotals.closing, 0, "the cost base can't fall below nil");
  assert.ok(view.unitRows.every((r) => r.opening === 0 && r.closing === 0 && r.perUnit === 0 && r.marketValue === 0 && r.unrealised === 0));
  assert.equal(
    view.unitsCsv.rows.reduce((total, r) => total + Number(r[9]), 0),
    4_302_000,
    "the whole capital return is excess over cost",
  );
  assert.equal(view.properties.length, 4, "property valuations don't depend on the unit price");
});

test("capital returned above a holder's cost leaves a nil cost base and is reported as the excess", () => {
  const data = freshData();
  data.unitCostBase["loyang"].opening["h-ly-1"] = 100_000; // S$1,000 of cost against S$1,505,700 returned
  data.unitCostBase["loyang"].opening["h-ly-2"] = 107_550_000; // exactly the S$1,075,500 returned: nothing left, nothing over
  const view = costBaseOf(data, "loyang");
  const [over, exact, ...rest] = view.unitRows;
  assert.deepEqual([over.opening, over.adjustment, over.closing, over.perUnit, over.unrealised], [100_000, -150_570_000, 0, 0, over.marketValue]);
  assert.equal(over.excessOverCostBase, 150_470_000);
  assert.deepEqual([exact.opening, exact.adjustment, exact.closing, exact.perUnit], [107_550_000, -107_550_000, 0, 0]);
  assert.equal(exact.excessOverCostBase, 0);
  assert.ok(!Object.is(exact.closing, -0));
  assert.ok(rest.every((r) => r.closing === r.opening + r.adjustment), "other holders move by the capital returned only");
  assert.equal(view.unitTotals.adjustment, -430_200_000, "the adjustment column still shows all the capital returned");
  assert.equal(view.unitTotals.closing, sum(view.unitRows.map((r) => r.closing)));
  assert.equal(view.unitTotals.closing, rest.reduce((total, r) => total + r.closing, 0));
  assert.equal(view.unitTotals.unrealised, view.unitTotals.marketValue - view.unitTotals.closing);
  // The excess is 1,505,700 - 1,000 = S$1,504,700 for the first holder only.
  assert.deepEqual(
    view.unitsCsv.rows.map((r) => r[9]),
    [1_504_700, 0, 0, 0, 0],
  );
  assert.deepEqual(view.unitsCsv.rows[0].slice(1, 6), [1_004_867_500, 1_000, -1_505_700, 0, "0.000000"]);
  assert.equal(
    view.footnote,
    `${RETURN_OF_CAPITAL_FOOTNOTE} ` +
      "Cost can't fall below nil, so the closing cost base is nil. Excess over cost base: Individual unitholders (CDP, SRS & CPFIS) S$1,504,700.00.",
  );
});

test("the smallest excess, one cent, is reported and an exact return of cost is not", () => {
  const data = freshData();
  data.unitCostBase["loyang"].opening["h-ly-1"] = 150_569_999;
  const view = costBaseOf(data, "loyang");
  assert.equal(view.unitRows[0].closing, 0);
  assert.equal(view.unitsCsv.rows[0][9], 0.01);
  assert.ok(view.footnote.endsWith("S$0.01."), view.footnote);
  data.unitCostBase["loyang"].opening["h-ly-1"] = 150_570_000;
  const exact = costBaseOf(data, "loyang");
  assert.equal(exact.unitsCsv.rows[0][9], 0);
  assert.ok(!exact.footnote.includes("Excess over cost base"), exact.footnote);
});

test("the investor argument is ignored: it only applies to Australia", () => {
  const data = freshData();
  const fund = sgFund(data, "loyang");
  const calc = calcFor(data, "loyang");
  assert.deepEqual(sgModule.costBaseView(data, fund, calc, "company"), sgModule.costBaseView(data, fund, calc));
});

test("an AU fund is rejected", () => {
  const data = freshData();
  const au = data.funds.find((f) => f.market === "AU");
  assert.ok(au);
  assert.throws(() => sgModule.costBaseView(data, au, calcFor(data, "loyang")), /Singapore module/);
});
