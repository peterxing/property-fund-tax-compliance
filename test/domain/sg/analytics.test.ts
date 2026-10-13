// Analytics for the Singapore funds: tax leakage, distribution mix and the payout scenario. Goldens are the reference app's figures
// (whole dollars, rounded the way the reference prints them) with the exact cents the engine arithmetic produces underneath.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sgModule } from "../../../src/domain/sg/index.ts";
import type { ScenarioView } from "../../../src/domain/types.ts";
import { calcFor, dollars, freshData, NOW, SG_IDS, sgFund } from "./helpers.ts";

const leakageOf = (id: string) => {
  const data = freshData();
  const fund = sgFund(data, id);
  return { fund, calc: calcFor(data, id), row: sgModule.leakage(fund, calcFor(data, id)) };
};

// distribution / final withholding / recoverable / trustee tax (whole dollars) and the combined leakage as a percentage.
const LEAKAGE_GOLDEN: Record<string, [number, number, number, number, number]> = {
  "telok-ayer": [63_436_800, 876_189, 993_014, 0, 2.9],
  loyang: [74_118_100, 2_792_644, 0, 242_216, 4.1],
  meranti: [28_277_100, 1_073_376, 456_185, 141_083, 5.9],
  kallang: [35_620_500, 534_308, 302_774, 1_068_620, 5.4],
};

test("leakage matches the reference for every Singapore fund", () => {
  for (const id of SG_IDS) {
    const { row } = leakageOf(id);
    const [distribution, final, recoverable, trustee, totalPct] = LEAKAGE_GOLDEN[id];
    assert.deepEqual(
      [dollars(row.distribution), dollars(row.finalWithholding), dollars(row.recoverable), dollars(row.trusteeTax), row.totalPct],
      [distribution, final, recoverable, trustee, totalPct],
      id,
    );
  }
});

test("leakage in exact cents, labelled with the fund", () => {
  const { row, fund } = leakageOf("meranti");
  assert.equal(row.fundId, "meranti");
  assert.equal(row.fundName, fund.name);
  assert.equal(row.currency, "SGD");
  assert.equal(row.distribution, 2_827_710_000);
  assert.equal(row.finalWithholding, 107_337_600);
  assert.equal(row.recoverable, 45_618_480);
  assert.equal(row.trusteeTax, 14_108_300);
  assert.equal(leakageOf("kallang").row.finalWithholding, 53_430_750);
  assert.equal(leakageOf("kallang").row.recoverable, 30_277_425);
});

test("leakage splits what is withheld into final and recoverable and adds the trustee's tax", () => {
  for (const id of SG_IDS) {
    const { row, calc } = leakageOf(id);
    assert.equal(row.finalWithholding + row.recoverable, calc.withheld, `${id}: all withholding is accounted for`);
    assert.equal(row.distribution, calc.cash, id);
    assert.equal(row.trusteeTax, calc.sg?.trusteeTax, id);
    assert.equal(row.totalPct, Math.round(((row.finalWithholding + row.recoverable + row.trusteeTax) / row.distribution) * 1000) / 10, id);
  }
});

test("only a fund that fails the 90% test bears trustee tax, and only on what it retained", () => {
  assert.equal(leakageOf("telok-ayer").row.trusteeTax, 0);
  // Kallang retains 15% of S$419,065,000: 17% of S$62,860,000.
  assert.equal(dollars(leakageOf("kallang").row.trusteeTax), 1_068_620);
  // Loyang and Meranti pass the test and still pay the 17% on the little they keep back.
  for (const id of ["loyang", "meranti"]) {
    const { row, calc } = leakageOf(id);
    assert.ok((calc.sg?.payoutRatio ?? 0) >= 0.9, id);
    assert.ok(row.trusteeTax > 0, id);
    assert.equal(row.trusteeTax, Math.round((calc.sg?.retained ?? 0) * 0.17), id);
  }
});

test("a fund with nothing withheld and nothing retained shows no leakage and no NaN", () => {
  const data = freshData();
  for (const h of data.holders) if (h.fundId === "telok-ayer" && "sgClass" in h) h.sgClass = "individual";
  const fund = sgFund(data, "telok-ayer");
  const row = sgModule.leakage(fund, sgModule.fundCalc(data, fund, NOW));
  assert.equal(row.finalWithholding, 0);
  assert.equal(row.recoverable, 0);
  assert.equal(row.trusteeTax, 0);
  assert.equal(row.totalPct, 0);
});

test("leakage reports zero percent rather than NaN when nothing is distributed", () => {
  const data = freshData();
  const fund = sgFund(data, "loyang");
  fund.inputs.taxableDistributed = 0;
  fund.inputs.taxExemptDistribution = 0;
  fund.inputs.capitalDistribution = 0;
  const row = sgModule.leakage(fund, sgModule.fundCalc(data, fund, NOW));
  assert.equal(row.distribution, 0);
  assert.equal(row.totalPct, 0);
  assert.ok(Number.isFinite(row.totalPct));
});

// taxable / capital gains / tax-exempt / tax-deferred and capital, as percentages of the distribution.
const MIX_GOLDEN: Record<string, [number, number, number, number]> = {
  "telok-ayer": [92.1, 0, 4.9, 3.0],
  loyang: [94.2, 0, 0, 5.8],
  meranti: [94.9, 0, 5.1, 0],
  kallang: [100, 0, 0, 0],
};

test("distribution mix matches the reference for every Singapore fund", () => {
  for (const id of SG_IDS) {
    const data = freshData();
    const fund = sgFund(data, id);
    const row = sgModule.mix(fund, sgModule.fundCalc(data, fund, NOW));
    assert.equal(row.fundId, id);
    assert.equal(row.fundName, fund.name);
    assert.deepEqual([row.taxable, row.capitalGains, row.taxExempt, row.taxDeferredAndCapital], MIX_GOLDEN[id], id);
  }
});

test("the mix adds up to 100 (within rounding to one decimal place) and capital gains are not a separate Singapore bucket", () => {
  for (const id of SG_IDS) {
    const data = freshData();
    const fund = sgFund(data, id);
    const row = sgModule.mix(fund, sgModule.fundCalc(data, fund, NOW));
    const total = row.taxable + row.capitalGains + row.taxExempt + row.taxDeferredAndCapital;
    assert.ok(Math.abs(total - 100) <= 0.15, `${id}: ${total}`);
    assert.equal(row.capitalGains, 0);
  }
});

test("the mix of a fund distributing nothing is all zero", () => {
  const data = freshData();
  const fund = sgFund(data, "loyang");
  fund.inputs.taxableDistributed = 0;
  fund.inputs.taxExemptDistribution = 0;
  fund.inputs.capitalDistribution = 0;
  const row = sgModule.mix(fund, sgModule.fundCalc(data, fund, NOW));
  assert.deepEqual([row.taxable, row.capitalGains, row.taxExempt, row.taxDeferredAndCapital], [0, 0, 0, 0]);
});

// ------------------------------------------------------------------------------------------------------------ scenario
function scenarioFor(id: string, value?: number): ScenarioView {
  const data = freshData();
  const fund = sgFund(data, id);
  return sgModule.scenario(data, fund, sgModule.fundCalc(data, fund, NOW), value);
}
const cells = (view: ScenarioView) => view.rows.map((r) => [r.measure, r.now, r.scenario]);
const scenarioColumn = (view: ScenarioView) => view.rows.map((r) => r.scenario);

test("the scenario is a payout percentage and starts at the fund's current payout", () => {
  const view = scenarioFor("loyang");
  assert.equal(view.fundId, "loyang");
  assert.equal(view.currency, "SGD");
  assert.equal(view.inputKind, "payout");
  assert.equal(view.inputLabel, "Taxable payout (% of taxable specified income)");
  assert.equal(view.inputValue, 98);
  assert.equal(view.defaultValue, 98);
  assert.deepEqual(view.rows.map((r) => r.measure), [
    "Taxable distribution",
    "Retained by the trust",
    "Trustee tax at 17%",
    "Withholding on the distribution",
    "Meets the 90% condition",
  ]);
  assert.deepEqual(scenarioColumn(view), view.rows.map((r) => r.now), "with no input the scenario equals today's position");
  assert.deepEqual(scenarioColumn(view), ["S$69,816,100", "S$1,424,800", "S$242,216", "S$2,792,644", "Yes"]);
  assert.match(view.note, /^The 90% condition applies to the year as a whole; withholding scales with the taxable distribution/);
  assert.match(view.note, /98\.0% paid out now/);
});

test("the default payout of each fund is its current taxable distribution over its taxable specified income", () => {
  const defaults: Record<string, number> = { "telok-ayer": 100, loyang: 98, meranti: 97, kallang: 85 };
  for (const id of SG_IDS) {
    const view = scenarioFor(id);
    assert.equal(view.defaultValue, defaults[id], id);
    assert.equal(view.inputValue, defaults[id], id);
    assert.deepEqual(scenarioColumn(view), view.rows.map((r) => r.now), id);
  }
});

test("the 'now' column is the fund's own position whatever the scenario input", () => {
  const base = scenarioFor("loyang");
  for (const value of [0, 50, 85, 89.99, 90, 100, 120, -5, Number.NaN]) {
    assert.deepEqual(scenarioFor("loyang", value).rows.map((r) => r.now), base.rows.map((r) => r.now), String(value));
  }
});

test("Loyang at an 85% payout fails the 90% condition, and the retained 15% bears trustee tax", () => {
  const view = scenarioFor("loyang", 85);
  assert.equal(view.inputValue, 85);
  assert.equal(view.defaultValue, 98);
  assert.deepEqual(scenarioColumn(view), ["S$60,554,765", "S$10,686,135", "S$1,816,643", "S$2,422,191", "No"]);
});

test("the 90% condition passes at exactly 90% and fails a hair below", () => {
  assert.deepEqual(scenarioColumn(scenarioFor("loyang", 90)), ["S$64,116,810", "S$7,124,090", "S$1,211,095", "S$2,564,672", "Yes"]);
  assert.deepEqual(scenarioColumn(scenarioFor("loyang", 89.99)), ["S$64,109,686", "S$7,131,214", "S$1,212,306", "S$2,564,387", "No"]);
});

test("withholding in the scenario is re-worked holder by holder at today's unitholder mix", () => {
  // At 100% Loyang pays out S$71,240,900 of taxable income: 10% on the 40% held by qualifying non-residents.
  const full = scenarioFor("loyang", 100);
  assert.deepEqual(scenarioColumn(full), ["S$71,240,900", "S$0", "S$0", "S$2,849,636", "Yes"]);
  assert.equal(2_849_636, Math.round(71_240_900 * 0.4 * 0.1));
  // Nothing paid out: nothing withheld and everything taxed at the trustee.
  assert.deepEqual(scenarioColumn(scenarioFor("loyang", 0)), ["S$0", "S$71,240,900", "S$12,110,953", "S$0", "No"]);
});

test("a payout outside 0 to 100 is held to the range, and the result says which value it used", () => {
  const high = scenarioFor("loyang", 120);
  assert.equal(high.inputValue, 100);
  assert.deepEqual(scenarioColumn(high), scenarioColumn(scenarioFor("loyang", 100)));
  for (const value of [-5, 0]) {
    const low = scenarioFor("loyang", value);
    assert.equal(low.inputValue, 0, String(value));
    assert.deepEqual(scenarioColumn(low), scenarioColumn(scenarioFor("loyang", 0)));
  }
});

test("a missing or non-finite input falls back to the current payout", () => {
  const base = scenarioFor("loyang");
  for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const view = scenarioFor("loyang", value);
    assert.equal(view.inputValue, 98, String(value));
    assert.deepEqual(cells(view), cells(base), String(value));
  }
  // A value that rounds to the current payout is the current position.
  const near = scenarioFor("loyang", 97.999);
  assert.equal(near.inputValue, 98);
  assert.deepEqual(scenarioColumn(near), scenarioColumn(base));
});

test("the other funds' scenarios", () => {
  assert.deepEqual(scenarioColumn(scenarioFor("telok-ayer")), ["S$58,412,600", "S$0", "S$0", "S$1,869,203", "Yes"]);
  assert.deepEqual(scenarioColumn(scenarioFor("meranti")), ["S$26,834,400", "S$829,900", "S$141,083", "S$1,529,561", "Yes"]);
  assert.deepEqual(scenarioColumn(scenarioFor("meranti", 100)), ["S$27,664,300", "S$0", "S$0", "S$1,576,865", "Yes"]);
  assert.deepEqual(scenarioColumn(scenarioFor("kallang")), ["S$35,620,500", "S$6,286,000", "S$1,068,620", "S$837,082", "No"]);
  assert.deepEqual(scenarioColumn(scenarioFor("kallang", 100)), ["S$41,906,500", "S$0", "S$0", "S$984,803", "Yes"]);
});

test("a scenario that adds up the way the fund does: at today's payout the scenario's withholding is the fund's", () => {
  for (const id of SG_IDS) {
    const data = freshData();
    const calc = calcFor(data, id);
    const view = scenarioFor(id);
    assert.equal(view.rows[3].now, `S$${calc.withheld === 0 ? "0" : Math.round(calc.withheld / 100).toLocaleString("en-US")}`, id);
  }
});

test("analytics functions reject a fund from another market", () => {
  const data = freshData();
  const au = data.funds.find((f) => f.market === "AU");
  assert.ok(au);
  const calc = calcFor(data, "loyang");
  assert.throws(() => sgModule.leakage(au, calc), /Singapore module/);
  assert.throws(() => sgModule.mix(au, calc), /Singapore module/);
  assert.throws(() => sgModule.scenario(data, au, calc), /Singapore module/);
});
