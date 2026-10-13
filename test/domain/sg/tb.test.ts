// Trial balance workspace for the Singapore funds: the book-to-tax reconciliation reproduces the reference app's figures, the derived
// taxable specified income equals the seed input to the cent, and unmapped, unbalanced or disagreeing ledgers are reported.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sgModule } from "../../../src/domain/sg/index.ts";
import { TB_TOLERANCE, UNMAPPED_LABEL, UNMAPPED_TREATMENT, sgTbCalc } from "../../../src/domain/sg/tb.ts";
import { UNMAPPED_CATEGORY } from "../../../src/domain/types.ts";
import type { AppData, TbRow, TbView } from "../../../src/domain/types.ts";
import { freshData, NOW, sgFund, SG_IDS } from "./helpers.ts";

function viewOf(data: AppData, id: string): TbView {
  return sgModule.tbView(data, sgFund(data, id), NOW);
}
function rowOf(data: AppData, id: string): TbRow {
  const row = data.tbRows.find((r) => r.id === id);
  assert.ok(row, `row ${id}`);
  return row;
}
const triples = (view: TbView) => view.bookToTax.rows.map((r) => [r.kind, r.label, r.amount]);
/** The taxable specified income the ledger derives (the view's derived inputs are a market union). */
function derivedIncome(view: TbView): number {
  const inputs = view.derivedInputs;
  assert.ok("taxableSpecifiedIncome" in inputs, "the derived inputs of an SG fund carry the taxable specified income");
  return inputs.taxableSpecifiedIncome;
}

const LABELS = {
  fvGain: "Less: fair value gain",
  fvLoss: "Add: fair value loss",
};

test("the taxable specified income derived from the ledger equals the seed input, cent for cent", () => {
  const data = freshData();
  const expected: Record<string, number> = { "telok-ayer": 5_841_260_000, loyang: 7_124_090_000, meranti: 2_766_430_000, kallang: 4_190_650_000 };
  for (const id of SG_IDS) {
    const view = viewOf(data, id);
    const fund = sgFund(data, id);
    assert.equal(derivedIncome(view), expected[id], id);
    assert.equal(fund.inputs.taxableSpecifiedIncome, expected[id], id);
    assert.deepEqual(view.derivedInputs, fund.inputs, `${id}: syncing from the trial balance changes nothing in the seed`);
    assert.equal(view.bookToTax.result, expected[id], id);
    assert.equal(view.balanced, true, id);
    assert.equal(view.totalDebitsLessCredits, 0, id);
    assert.equal(view.allMapped, true, id);
    assert.equal(view.matchesDistribution, true, id);
    assert.equal(view.fundId, id);
    assert.equal(view.periodLabel, fund.periodLabel);
  }
});

test("Loyang: book-to-tax reconciliation matches the reference", () => {
  const view = viewOf(freshData(), "loyang");
  assert.equal(view.bookToTax.title, "Reconciliation of accounting profit to taxable income");
  assert.deepEqual(triples(view), [
    ["start", "Net profit per accounts", 10_044_835_800],
    ["less", "Less: fair value gain", -2_260_948_000],
    ["less", "Less: straight-line rent", -105_671_200],
    ["less", "Less: accounting gain on disposal", -598_864_000],
    ["add", "Add: accounting depreciation", 228_254_400],
    ["add", "Add: non-deductible expenses", 4_811_700],
    ["less", "Less: capital allowances", -188_328_700],
  ]);
  assert.equal(view.bookToTax.resultLabel, "Taxable specified income");
  assert.equal(view.bookToTax.result, 7_124_090_000);
  assert.deepEqual(view.bookToTax.extra, { label: "Divestment gain available for capital distribution", amount: 598_864_000 });
  assert.deepEqual(view.adjustments, [{ key: "capitalAllowances", label: "Capital allowances", help: "Plant and machinery, replacing accounting depreciation", amount: 188_328_700 }]);
  assert.deepEqual(view.components, [{ key: "taxableSpecifiedIncome", label: "Taxable specified income", trialBalance: 7_124_090_000, distribution: 7_124_090_000, agrees: true }]);
  // The payout and the exempt and capital distributions are decisions: carried over from the fund, never derived.
  assert.deepEqual(view.derivedInputs, { taxableSpecifiedIncome: 7_124_090_000, taxableDistributed: 6_981_610_000, taxExemptDistribution: 0, capitalDistribution: 430_200_000 });
});

test("the reconciliation adds up: net profit plus the adjustments is the taxable specified income", () => {
  const data = freshData();
  for (const id of SG_IDS) {
    const view = viewOf(data, id);
    const total = view.bookToTax.rows.reduce((t, r) => t + r.amount, 0);
    // Whole-dollar rounding is the only difference allowed between the lines and the result.
    assert.ok(Math.abs(total - view.bookToTax.result) < 100, `${id}: ${total} vs ${view.bookToTax.result}`);
    assert.equal(view.bookToTax.rows[0].kind, "start", id);
    assert.ok(view.bookToTax.rows.slice(1).every((r) => (r.kind === "less" ? r.amount < 0 : r.amount > 0)), id);
  }
});

test("Telok Ayer and Meranti: tax-exempt income is taken off the reconciliation and offered as the amount to distribute", () => {
  const data = freshData();
  const ta = viewOf(data, "telok-ayer");
  assert.deepEqual(triples(ta), [
    ["start", "Net profit per accounts", 4_342_648_400],
    ["add", "Add: fair value loss", 1_840_622_500],
    ["less", "Less: straight-line rent", -70_231_800],
    ["add", "Add: accounting depreciation", 197_067_800],
    ["add", "Add: non-deductible expenses", 5_590_300],
    ["less", "Less: capital allowances", -162_597_200],
    ["less", "Less: tax-exempt income", -311_840_000],
  ]);
  assert.deepEqual(ta.bookToTax.extra, { label: "Tax-exempt income available to distribute", amount: 311_840_000 });
  const mr = viewOf(data, "meranti");
  assert.deepEqual(triples(mr), [
    ["start", "Net profit per accounts", 3_907_210_900],
    ["less", LABELS.fvGain, -987_011_500],
    ["less", "Less: straight-line rent", -28_406_700],
    ["add", "Add: accounting depreciation", 95_885_900],
    ["add", "Add: non-deductible expenses", 2_135_200],
    ["less", "Less: capital allowances", -79_113_800],
    ["less", "Less: tax-exempt income", -144_270_000],
  ]);
  assert.deepEqual(mr.bookToTax.extra, { label: "Tax-exempt income available to distribute", amount: 144_270_000 });
});

test("Kallang: losses are added back and there is nothing extra to distribute", () => {
  const view = viewOf(freshData(), "kallang");
  assert.deepEqual(triples(view), [
    ["start", "Net profit per accounts", 3_388_127_600],
    ["add", LABELS.fvLoss, 731_544_000],
    ["add", "Add: straight-line rent", 41_289_000],
    ["add", "Add: accounting depreciation", 148_235_700],
    ["add", "Add: non-deductible expenses", 3_760_400],
    ["less", "Less: capital allowances", -122_306_700],
  ]);
  assert.equal(view.bookToTax.extra, undefined);
  assert.equal(view.rows.length, 16);
});

test("rows are sorted by account number, with the mapping label and treatment of each category", () => {
  const view = viewOf(freshData(), "loyang");
  assert.equal(view.rows.length, 17);
  assert.deepEqual(
    view.rows.map((r) => r.account),
    ["1000", "1100", "2000", "3100", "3200", "4000", "4010", "4100", "4300", "4310", "4400", "5000", "5100", "5200", "5300", "5400", "5500"],
  );
  const cash = view.rows[0];
  assert.deepEqual(cash, {
    id: "tb-loyang-1000",
    account: "1000",
    name: "Cash and cash equivalents",
    category: "balance-sheet",
    categoryLabel: "Balance sheet",
    treatment: "Not part of taxable income",
    current: 2_520_015_400,
    prior: 2_293_214_000,
    change: 226_801_400,
    changePct: view.rows[0].changePct,
  });
  assert.ok(Math.abs((cash.changePct ?? 0) - 9.89011) < 1e-4);
  const gain = view.rows.find((r) => r.account === "4400");
  assert.ok(gain);
  assert.equal(gain.categoryLabel, "Accounting gain on disposal");
  assert.equal(gain.treatment, "Capital — not taxable");
  assert.equal(gain.changePct, null, "no prior balance, no percentage");
  assert.equal(view.categories.length, 11);
  assert.equal(view.categories[0].id, "rent");
  assert.ok(view.rows.every((r) => r.change === r.current - r.prior));
});

test("account numbers sort numerically, not as text", () => {
  const data = freshData();
  const base = rowOf(data, "tb-loyang-1000");
  for (const account of ["999", "50", "10000"]) data.tbRows.push({ ...base, id: `tb-extra-${account}`, account, current: 0, prior: 0 });
  const accounts = viewOf(data, "loyang").rows.map((r) => r.account);
  assert.deepEqual(accounts.slice(0, 3), ["50", "999", "1000"]);
  assert.equal(accounts.at(-1), "10000");
});

test("a row whose category is not mapped is excluded from the distribution and flagged", () => {
  const data = freshData();
  rowOf(data, "tb-loyang-4010").category = UNMAPPED_CATEGORY;
  const view = viewOf(data, "loyang");
  assert.equal(view.allMapped, false);
  assert.equal(view.matchesDistribution, false);
  assert.deepEqual(view.components, [{ key: "taxableSpecifiedIncome", label: "Taxable specified income", trialBalance: 6_253_396_200, distribution: 7_124_090_000, agrees: false }]);
  assert.equal(derivedIncome(view), 6_253_396_200);
  assert.equal(view.bookToTax.rows[0].amount, 10_044_835_800 - 870_693_800);
  const row = view.rows.find((r) => r.id === "tb-loyang-4010");
  assert.ok(row);
  assert.equal(row.categoryLabel, UNMAPPED_LABEL);
  assert.equal(row.treatment, UNMAPPED_TREATMENT);
  assert.equal(row.categoryLabel, "Needs a tax category");
  assert.equal(row.treatment, "Excluded until mapped");
  assert.equal(row.category, UNMAPPED_CATEGORY);
  assert.equal(view.balanced, true, "an unmapped account still balances the ledger");
});

test("an unknown category id is treated as unmapped", () => {
  const data = freshData();
  rowOf(data, "tb-kallang-4000").category = "not-a-category";
  const view = viewOf(data, "kallang");
  assert.equal(view.allMapped, false);
  assert.equal(view.rows.find((r) => r.id === "tb-kallang-4000")?.categoryLabel, UNMAPPED_LABEL);
});

test("the ledger is balanced only when it is out by less than half a dollar", () => {
  const data = freshData();
  const cash = rowOf(data, "tb-loyang-1000");
  cash.current += TB_TOLERANCE - 1;
  assert.equal(viewOf(data, "loyang").balanced, true);
  assert.equal(viewOf(data, "loyang").totalDebitsLessCredits, TB_TOLERANCE - 1);
  cash.current += 1;
  assert.equal(viewOf(data, "loyang").balanced, false);
  cash.current = rowOf(data, "tb-loyang-1000").current - 2 * TB_TOLERANCE;
  assert.equal(viewOf(data, "loyang").balanced, false, "a credit imbalance is out of balance too");
});

test("the distribution agrees with the trial balance when it is within half a dollar, half a dollar included", () => {
  const data = freshData();
  const fund = sgFund(data, "loyang");
  const derived = 7_124_090_000;
  fund.inputs.taxableSpecifiedIncome = derived + TB_TOLERANCE - 1;
  assert.equal(viewOf(data, "loyang").matchesDistribution, true);
  fund.inputs.taxableSpecifiedIncome = derived + TB_TOLERANCE;
  assert.equal(viewOf(data, "loyang").matchesDistribution, true, "exactly half a dollar over still agrees, as in the reference");
  assert.equal(viewOf(data, "loyang").components[0].agrees, true);
  fund.inputs.taxableSpecifiedIncome = derived - TB_TOLERANCE;
  assert.equal(viewOf(data, "loyang").components[0].agrees, true, "and exactly half a dollar under");
  fund.inputs.taxableSpecifiedIncome = derived - TB_TOLERANCE - 1;
  assert.equal(viewOf(data, "loyang").components[0].agrees, false, "a cent more is a difference");
  fund.inputs.taxableSpecifiedIncome = derived + TB_TOLERANCE + 1;
  const view = viewOf(data, "loyang");
  assert.equal(view.matchesDistribution, false);
  assert.equal(view.components[0].agrees, false);
  assert.equal(view.components[0].trialBalance, derived, "the trial balance figure does not move with the input");
});

test("the taxable specified income is rounded to a whole dollar and never negative", () => {
  const data = freshData();
  data.taxAdjustments.loyang.capitalAllowances -= 40;
  assert.equal(derivedIncome(viewOf(data, "loyang")), 7_124_090_000);
  data.taxAdjustments.loyang.capitalAllowances -= 20;
  assert.equal(derivedIncome(viewOf(data, "loyang")), 7_124_090_100);
  const loss = freshData();
  for (const row of loss.tbRows) if (row.fundId === "kallang" && row.category === "rent") row.current = 0;
  const view = viewOf(loss, "kallang");
  assert.equal(derivedIncome(view), 0);
  assert.equal(view.components[0].trialBalance, 0);
});

test("capital allowances missing from the fund count as nil", () => {
  const data = freshData();
  delete data.taxAdjustments.loyang;
  const view = viewOf(data, "loyang");
  assert.deepEqual(view.adjustments, [{ key: "capitalAllowances", label: "Capital allowances", help: "Plant and machinery, replacing accounting depreciation", amount: 0 }]);
  assert.equal(derivedIncome(view), 7_124_090_000 + 188_328_700);
  assert.ok(!view.bookToTax.rows.some((r) => r.label === "Less: capital allowances"));
});

test("reconciling lines under half a dollar are left out, and a disposal loss is added back", () => {
  const data = freshData();
  rowOf(data, "tb-loyang-4310").current = -40;
  assert.ok(!viewOf(data, "loyang").bookToTax.rows.some((r) => r.label.includes("straight-line")));
  rowOf(data, "tb-loyang-4400").current = 598_864_000;
  const view = viewOf(data, "loyang");
  const line = view.bookToTax.rows.find((r) => r.label === "Add: accounting loss on disposal");
  assert.deepEqual(line && [line.kind, line.amount], ["add", 598_864_000]);
  assert.equal(view.bookToTax.extra, undefined, "a loss is not available to distribute");
});

test("a divestment gain is offered ahead of tax-exempt income when there is both", () => {
  const data = freshData();
  const gainRow = rowOf(data, "tb-loyang-4400");
  const exempt = { ...gainRow, id: "tb-loyang-4200", account: "4200", name: "Tax-exempt income", category: "exempt-income", current: -100_000_000, prior: 0 };
  data.tbRows.push(exempt);
  const view = viewOf(data, "loyang");
  assert.deepEqual(view.bookToTax.extra, { label: "Divestment gain available for capital distribution", amount: 598_864_000 });
  assert.ok(view.bookToTax.rows.some((r) => r.label === "Less: tax-exempt income" && r.amount === -100_000_000));
});

test("sgTbCalc totals: income, expenses and net profit per accounts", () => {
  const data = freshData();
  const calc = sgTbCalc(data, sgFund(data, "loyang"));
  assert.equal(calc.totalIncome, 13_090_682_200);
  assert.equal(calc.totalExpenses, 3_045_846_400);
  assert.equal(calc.netProfit, 10_044_835_800);
  assert.equal(calc.distributions, 7_411_810_000);
  assert.equal(calc.rent, 10_031_034_600);
  assert.equal(calc.interest, 94_164_400);
  assert.equal(calc.deductible, 2_812_780_300);
  assert.equal(calc.capitalAllowances, 188_328_700);
  assert.equal(calc.taxableSpecifiedIncome, 7_124_090_000);
});

test("an empty ledger reconciles from nil, with plain zeros rather than negative zero", () => {
  const data = freshData();
  data.tbRows = data.tbRows.filter((r) => r.fundId !== "loyang");
  const calc = sgTbCalc(data, sgFund(data, "loyang"));
  for (const [name, value] of Object.entries(calc)) {
    if (typeof value === "number") assert.ok(!Object.is(value, -0), `${name} is negative zero`);
  }
  assert.equal(calc.netProfit, 0);
  assert.equal(calc.allMapped, true);
  const view = viewOf(data, "loyang");
  assert.deepEqual(triples(view), [["start", "Net profit per accounts", 0], ["less", "Less: capital allowances", -188_328_700]]);
  assert.equal(view.bookToTax.result, 0);
  assert.equal(view.balanced, true);
  assert.equal(view.rows.length, 0);
  assert.equal(view.matchesDistribution, false, "the distribution inputs no longer agree with an empty ledger");
});

test("an AU fund is rejected", () => {
  const data = freshData();
  const au = data.funds.find((f) => f.market === "AU");
  assert.ok(au);
  assert.throws(() => sgModule.tbView(data, au, NOW), /Singapore module/);
});
