import assert from "node:assert/strict";
import { test } from "node:test";
import { auModule } from "../../../src/domain/au/index.ts";
import type { AppData, AuInputs, AuInvestorView } from "../../../src/domain/types.ts";
import { AU_IDS, auFund, calcFor, ctxFor, freshData, near, sum } from "./helpers.ts";

const GOLDEN_LEAKAGE: Record<string, { distribution: number; withheld: number; totalPct: number }> = {
  harbourline: { distribution: 92_446_000, withheld: 2_504_486, totalPct: 2.7 },
  southbank: { distribution: 47_212_000, withheld: 3_892_099, totalPct: 8.2 },
  wattle: { distribution: 129_688_000, withheld: 2_742_646, totalPct: 2.1 },
  kurrajong: { distribution: 58_036_000, withheld: 2_452_995, totalPct: 4.2 },
  coastline: { distribution: 21_048_000, withheld: 640_638, totalPct: 3.0 },
};

const GOLDEN_MIX: Record<string, { taxable: number; capitalGains: number; taxExempt: number; taxDeferredAndCapital: number }> = {
  harbourline: { taxable: 60.3, capitalGains: 8.5, taxExempt: 0, taxDeferredAndCapital: 31.3 },
  southbank: { taxable: 62.0, capitalGains: 38.0, taxExempt: 0, taxDeferredAndCapital: 0 },
  wattle: { taxable: 70.3, capitalGains: 18.6, taxExempt: 0, taxDeferredAndCapital: 11.1 },
  kurrajong: { taxable: 69.6, capitalGains: 0, taxExempt: 0, taxDeferredAndCapital: 30.4 },
  coastline: { taxable: 86.9, capitalGains: 0, taxExempt: 0, taxDeferredAndCapital: 13.1 },
};

const oneDp = (n: number): number => Math.round(n * 10) / 10;

const MINUS = "\u2212";
const signedNumber = (text: string): number => Number(text.replace(MINUS, "-"));

// The cost base net amount and its c/unit figure as the reference's Distribution tab shows them for each AU fund (the scenario's NOW column is the same pair).
const GOLDEN_COST_BASE: Record<string, { amount: string; perUnit: string }> = {
  harbourline: { amount: "A$28,913,400 excess", perUnit: "2.0467" },
  southbank: { amount: "A$4,816,860 shortfall", perUnit: `${MINUS}0.7040` },
  wattle: { amount: "A$14,430,500 excess", perUnit: "0.6854" },
  kurrajong: { amount: "A$17,658,200 excess", perUnit: "1.8560" },
  coastline: { amount: "A$2,760,450 excess", perUnit: "0.8655" },
};

function zeroFund(data: AppData, id: string): void {
  const fund = auFund(data, id);
  for (const key of Object.keys(fund.inputs) as Array<keyof AuInputs>) fund.inputs[key] = 0;
}

// ------------------------------------------------------------------------------------------------ leakage
test("tax leakage: the final withholding as a share of the distribution, for each fund", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const fund = auFund(data, id);
    const calc = calcFor(data, id);
    const row = auModule.leakage(fund, calc);
    const golden = GOLDEN_LEAKAGE[id];
    assert.equal(row.fundId, id);
    assert.equal(row.fundName, fund.name);
    assert.equal(row.currency, "AUD");
    near(row.distribution / 100, golden.distribution, 1, `${id} distribution`);
    near(row.finalWithholding / 100, golden.withheld, 1, `${id} final withholding`);
    assert.equal(oneDp(row.totalPct), golden.totalPct, `${id} total`);
    assert.equal(row.recoverable, 0, "Australian MIT withholding is final, not a recoverable tax");
    assert.equal(row.trusteeTax, 0, "an AMIT does not pay tax as a trustee");
  }
});

test("leakage is exact: the calculation's cash and withholding, and a percentage that is their ratio", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const calc = calcFor(data, id);
    const row = auModule.leakage(auFund(data, id), calc);
    assert.equal(row.distribution, calc.cash);
    assert.equal(row.finalWithholding, calc.withheld);
    assert.equal(row.finalWithholding, sum(calc.holders.map((h) => h.withheld)), `${id}: the sum of what each investor has withheld`);
    near(row.totalPct, (calc.withheld / calc.cash) * 100, 1e-9, `${id} ratio`);
    assert.ok(row.totalPct >= 0 && row.totalPct < 100);
  }
});

test("leakage with nothing distributed is nil, not a division by zero", () => {
  const data = freshData();
  auFund(data, "harbourline").inputs.cashDistribution = 0;
  const row = auModule.leakage(auFund(data, "harbourline"), calcFor(data, "harbourline"));
  assert.equal(row.distribution, 0);
  assert.equal(row.totalPct, 0);
  assert.ok(Number.isFinite(row.totalPct));
});

// ------------------------------------------------------------------------------------------------ mix
test("distribution mix: taxable income, capital gains and tax deferred amounts as shares of the trust components", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const row = auModule.mix(auFund(data, id), calcFor(data, id));
    const golden = GOLDEN_MIX[id];
    assert.equal(row.fundId, id);
    assert.equal(oneDp(row.taxable), golden.taxable, `${id} taxable`);
    assert.equal(oneDp(row.capitalGains), golden.capitalGains, `${id} capital gains`);
    assert.equal(oneDp(row.taxExempt), golden.taxExempt, `${id} tax exempt`);
    assert.equal(oneDp(row.taxDeferredAndCapital), golden.taxDeferredAndCapital, `${id} tax deferred`);
    near(row.taxable + row.capitalGains + row.taxExempt + row.taxDeferredAndCapital, 100, 1e-9, `${id} shares add up`);
  }
});

test("the mix groups the trust components the way the tax system does", () => {
  const data = freshData();
  const calc = calcFor(data, "harbourline");
  const amount = (key: string): number => calc.components.find((c) => c.key === key)?.amount ?? 0;
  const row = auModule.mix(auFund(data, "harbourline"), calc);
  const expectedTaxable = (amount("ausOtherIncome") + amount("ncmi") + amount("excludedNcmi") + amount("cleanBuilding") + amount("interest") + amount("foreignIncome")) / calc.characterTotal;
  const expectedGains = (amount("discountGainTarp") + amount("cgtConcessionTarp") + amount("otherGainTarp")) / calc.characterTotal;
  near(row.taxable, expectedTaxable * 100, 1e-9);
  near(row.capitalGains, expectedGains * 100, 1e-9);
  near(row.taxDeferredAndCapital, (amount("taxDeferred") / calc.characterTotal) * 100, 1e-9);
});

test("the mix of a fund with nothing to distribute is all nil, not NaN", () => {
  const data = freshData();
  zeroFund(data, "wattle");
  const row = auModule.mix(auFund(data, "wattle"), calcFor(data, "wattle"));
  assert.deepEqual([row.taxable, row.capitalGains, row.taxExempt, row.taxDeferredAndCapital], [0, 0, 0, 0]);
  const leak = auModule.leakage(auFund(data, "wattle"), calcFor(data, "wattle"));
  assert.deepEqual([leak.distribution, leak.finalWithholding, leak.totalPct], [0, 0, 0]);
});

// ------------------------------------------------------------------------------------------------ scenario
test("the distribution scenario starts at the current position", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const fund = auFund(data, id);
    const calc = calcFor(data, id);
    const view = auModule.scenario(data, fund, calc);
    assert.equal(view.fundId, id);
    assert.equal(view.currency, "AUD");
    assert.equal(view.inputKind, "cash");
    assert.equal(view.inputLabel, "Cash distribution for the year");
    assert.equal(view.inputValue, calc.cash);
    assert.equal(view.defaultValue, calc.cash);
    assert.deepEqual(view.rows.map((r) => r.measure), ["Cash distribution", "AMIT cost base net amount", "Per unit (cents)", "Attributed to members"]);
    for (const row of view.rows) assert.equal(row.scenario, row.now, `${id} ${row.measure}: nothing has changed yet`);
    assert.equal(view.note, "Attributed amounts and the fund payment don't change with cash. Paying less than the attributed amounts creates a shortfall that increases members' cost base.");
  }
});

test("Harbourline reads 2.0467 cents per unit now and in the scenario: the AMIT cost base net amount per unit, as the reference shows it", () => {
  const data = freshData();
  const fund = auFund(data, "harbourline");
  const calc = calcFor(data, "harbourline");
  assert.equal(fund.unitsOnIssue, 1_412_680_000);
  const view = auModule.scenario(data, fund, calc);
  assert.deepEqual(view.rows, [
    { measure: "Cash distribution", now: "A$92,446,000", scenario: "A$92,446,000" },
    { measure: "AMIT cost base net amount", now: "A$28,913,400 excess", scenario: "A$28,913,400 excess" },
    { measure: "Per unit (cents)", now: "2.0467", scenario: "2.0467" },
    { measure: "Attributed to members", now: "A$59,620,600", scenario: "A$59,620,600" },
  ]);
  assert.notEqual(view.rows[2].now, "6.5440", "that is the cash per unit, which the scenario does not show");
});

test("the scenario's current column carries each AU fund's cost base net amount and c/unit as the reference shows them", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const view = auModule.scenario(data, auFund(data, id), calcFor(data, id));
    assert.equal(view.rows[1].now, GOLDEN_COST_BASE[id].amount, `${id}: cost base net amount`);
    assert.equal(view.rows[2].now, GOLDEN_COST_BASE[id].perUnit, `${id}: c/unit`);
  }
});

test("Harbourline paying A$80,000,000: the cost base net amount and the per-unit figure move together", () => {
  const data = freshData();
  const fund = auFund(data, "harbourline");
  const calc = calcFor(data, "harbourline");
  const view = auModule.scenario(data, fund, calc, 8_000_000_000);
  assert.equal(view.inputValue, 8_000_000_000);
  assert.deepEqual(view.rows, [
    { measure: "Cash distribution", now: "A$92,446,000", scenario: "A$80,000,000" },
    { measure: "AMIT cost base net amount", now: "A$28,913,400 excess", scenario: "A$16,467,400 excess" },
    { measure: "Per unit (cents)", now: "2.0467", scenario: "1.1657" },
    { measure: "Attributed to members", now: "A$59,620,600", scenario: "A$59,620,600" },
  ]);
  // 8,000,000,000 cash less 5,962,060,000 attributed and 391,200,000 AMIT CGT gross-up amount, over the 1,412,680,000 units on issue.
  near(signedNumber(view.rows[2].scenario), (8_000_000_000 - 5_962_060_000 - 391_200_000) / 1_412_680_000, 0.00005 + 1e-12, "1,646,740,000 / 1,412,680,000");
});

test("Harbourline paying A$1,000,000 instead of A$92,446,000", () => {
  const data = freshData();
  const fund = auFund(data, "harbourline");
  const calc = calcFor(data, "harbourline");
  const view = auModule.scenario(data, fund, calc, 100_000_000);
  assert.equal(view.inputValue, 100_000_000);
  assert.equal(view.defaultValue, 9_244_600_000, "the control's reset value is still the current distribution");
  assert.deepEqual(view.rows, [
    { measure: "Cash distribution", now: "A$92,446,000", scenario: "A$1,000,000" },
    { measure: "AMIT cost base net amount", now: "A$28,913,400 excess", scenario: "A$62,532,600 shortfall" },
    { measure: "Per unit (cents)", now: "2.0467", scenario: `${MINUS}4.4265` },
    { measure: "Attributed to members", now: "A$59,620,600", scenario: "A$59,620,600" },
  ]);
});

test("the current-position scenario is the fund-level cost base net amount, and agrees with the AIIR wherever every unit is on the register", () => {
  const data = freshData();
  const text = (net: number): string => `A$${Math.round(Math.abs(net) / 100).toLocaleString("en-US")} ${net >= 0 ? "excess" : "shortfall"}`;
  for (const id of AU_IDS) {
    const fund = auFund(data, id);
    const calc = calcFor(data, id);
    const view = auModule.scenario(data, fund, calc);
    const attributed = sum(calc.components.filter((c) => c.attributed).map((c) => c.amount));
    const concession = calc.components.find((c) => c.key === "cgtConcessionTarp")?.amount ?? 0;
    assert.equal(view.rows[1].now, text(calc.cash - attributed - concession), `${id}: cash less the attributed amounts and the AMIT CGT gross-up amount`);
    assert.equal(view.rows[3].now, `A$${Math.round(attributed / 100).toLocaleString("en-US")}`, `${id}: attributed to members`);
    near(signedNumber(view.rows[2].now), (calc.cash - attributed - concession) / fund.unitsOnIssue, 0.00005 + 1e-12, `${id}: cost base net amount, in cents per unit on issue`);

    const aiir = (auModule.investorView(data, fund, calc, ctxFor(data)) as AuInvestorView).aiir;
    if (calc.unallocatedUnits === 0) assert.equal(view.rows[1].now, text(aiir.totals.costBaseNet), `${id}: the same figure as the AIIR`);
  }
  // Kurrajong's register is short of the units on issue, so the AIIR covers less than the fund as a whole.
  const kurrajong = auFund(data, "kurrajong");
  const calc = calcFor(data, "kurrajong");
  assert.ok(calc.unallocatedUnits > 0);
  assert.equal(auModule.scenario(data, kurrajong, calc).rows[1].now, "A$17,658,200 excess");
  assert.equal(text((auModule.investorView(data, kurrajong, calc, ctxFor(data)) as AuInvestorView).aiir.totals.costBaseNet), "A$17,635,000 excess");
});

test("moving the cash moves the cost base net amount dollar for dollar, and its per-unit figure with it, and nothing else", () => {
  const data = freshData();
  const fund = auFund(data, "kurrajong");
  const calc = calcFor(data, "kurrajong");
  const attributed = sum(calc.components.filter((c) => c.attributed).map((c) => c.amount));
  const concession = calc.components.find((c) => c.key === "cgtConcessionTarp")?.amount ?? 0;
  const signed = (text: string): number => {
    const dollars = Number(text.replace(/[^0-9]/g, ""));
    return text.endsWith("shortfall") ? -dollars : dollars;
  };
  const current = auModule.scenario(data, fund, calc);
  const base = signed(current.rows[1].scenario);
  for (const cash of [0, 1_00, 5_000_000_00, 58_036_000_00, 60_000_000_00, 250_000_000_00]) {
    const view = auModule.scenario(data, fund, calc, cash);
    const moved = signed(view.rows[1].scenario);
    near(moved, base + (cash - calc.cash) / 100, 1, `cash ${cash}`);
    near(signedNumber(view.rows[2].scenario), (cash - attributed - concession) / fund.unitsOnIssue, 0.00005 + 1e-12, `cash ${cash}: per unit`);
    assert.equal(view.rows[0].scenario, `A$${Math.round(cash / 100).toLocaleString("en-US")}`);
    assert.equal(view.rows[3].scenario, view.rows[3].now, "attributed amounts do not depend on cash");
    assert.deepEqual(view.rows.map((r) => r.now), current.rows.map((r) => r.now), "the current column does not depend on the input");
    assert.equal(view.inputValue, cash);
  }
});

test("the per-unit row is the cost base net amount per unit to 4 dp, with the typographic minus for a shortfall", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const fund = auFund(data, id);
    const calc = calcFor(data, id);
    const attributed = sum(calc.components.filter((c) => c.attributed).map((c) => c.amount));
    const concession = calc.components.find((c) => c.key === "cgtConcessionTarp")?.amount ?? 0;
    for (const cash of [0, Math.round(calc.cash / 2), calc.cash, calc.cash * 2]) {
      const view = auModule.scenario(data, fund, calc, cash);
      const text = view.rows[2].scenario;
      const net = cash - attributed - concession;
      const expected = net / fund.unitsOnIssue;
      const label = `${id} cash ${cash}`;
      assert.match(text, /^\u2212?\d+\.\d{4}$/, label);
      near(signedNumber(text), expected, 0.00005 + 1e-12, label);
      if (text.startsWith(MINUS)) assert.ok(expected < 0, `${label}: only a shortfall is negative`);
      if (expected <= -0.0001) assert.ok(text.startsWith(MINUS), `${label}: a shortfall carries the minus sign`);
      assert.ok(!text.includes("-"), `${label}: never a hyphen-minus`);
      assert.equal(view.rows[1].scenario.endsWith(net >= 0 ? "excess" : "shortfall"), true, `${label}: the cost base wording agrees with the sign`);
    }
  }
});

test("the scenario sign: more than the attributed amounts is an excess, less is a shortfall, exactly equal is nil excess", () => {
  const data = freshData();
  const fund = auFund(data, "wattle");
  const calc = calcFor(data, "wattle");
  const attributed = 103_851_000_00;
  const cb = (cash: number): string => auModule.scenario(data, fund, calc, cash).rows[1].scenario;
  const perUnitAt = (cash: number): string => auModule.scenario(data, fund, calc, cash).rows[2].scenario;
  assert.match(cb(calc.cash), /excess$/);
  assert.match(cb(0), /shortfall$/);
  const wattleConcession = calc.components.find((c) => c.key === "cgtConcessionTarp")?.amount ?? 0;
  assert.equal(cb(attributed + wattleConcession), "A$0 excess");
  assert.equal(cb(attributed + wattleConcession - 100), "A$1 shortfall");
  assert.equal(perUnitAt(attributed + wattleConcession), "0.0000");
  assert.equal(perUnitAt(attributed + wattleConcession - 100), "0.0000", "a shortfall too small to show at 4 dp carries no minus sign");
  assert.match(perUnitAt(attributed + wattleConcession - 100_000_00), /^\u22120\.00\d\d$/, "A$100,000 short: a small negative figure");
  assert.match(perUnitAt(0), /^\u2212\d\.\d{4}$/);
});

test("a scenario input that is not a usable amount falls back safely", () => {
  const data = freshData();
  const fund = auFund(data, "harbourline");
  const calc = calcFor(data, "harbourline");
  const nowView = auModule.scenario(data, fund, calc);
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const view = auModule.scenario(data, fund, calc, bad);
    assert.deepEqual(view.rows, nowView.rows, String(bad));
    assert.equal(view.inputValue, calc.cash);
  }
  const negative = auModule.scenario(data, fund, calc, -500);
  assert.equal(negative.inputValue, 0, "a distribution cannot be negative");
  assert.equal(negative.rows[0].scenario, "A$0");
  assert.equal(negative.rows[1].scenario, "A$63,532,600 shortfall", "paying nothing: the attributed amounts and the AMIT CGT gross-up amount are all shortfall");
  assert.equal(negative.rows[2].scenario, `${MINUS}4.4973`);
  assert.equal(auModule.scenario(data, fund, calc, 1234.56).inputValue, 1235, "whole cents");
  const huge = auModule.scenario(data, fund, calc, 1e15);
  assert.ok(huge.rows.every((r) => !/NaN|Infinity|undefined/.test(`${r.now}${r.scenario}`)));
});

test("the scenario of a fund with no units on issue is well formed", () => {
  const data = freshData();
  const fund = auFund(data, "coastline");
  fund.unitsOnIssue = 0;
  const calc = calcFor(data, "coastline");
  const view = auModule.scenario(data, fund, calc, 1_000_000);
  assert.ok(view.rows.every((r) => !/NaN|Infinity|undefined/.test(`${r.now}${r.scenario}`)), JSON.stringify(view.rows));
  assert.equal(view.rows[2].now, "0.0000", "no units, no per-unit figure");
  assert.equal(view.rows[2].scenario, "0.0000");
});

test("analytics for a fund from another market are refused", () => {
  const data = freshData();
  const sg = data.funds.find((f) => f.market !== "AU");
  assert.ok(sg);
  const calc = calcFor(data, "wattle");
  assert.throws(() => auModule.leakage(sg, calc), /not an Australian fund/);
  assert.throws(() => auModule.mix(sg, calc), /not an Australian fund/);
  assert.throws(() => auModule.scenario(data, sg, calc), /not an Australian fund/);
});

test("analytics read the calculation they are given: nothing is recomputed or mutated", () => {
  const data = freshData();
  const fund = auFund(data, "southbank");
  const calc = calcFor(data, "southbank");
  const before = JSON.stringify(calc);
  auModule.leakage(fund, calc);
  auModule.mix(fund, calc);
  auModule.scenario(data, fund, calc, 1_000_000_00);
  assert.equal(JSON.stringify(calc), before);
});
