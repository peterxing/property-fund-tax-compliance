import assert from "node:assert/strict";
import { test } from "node:test";
import { auModule } from "../../../src/domain/au/index.ts";
import type { AppData, AuInputs, TbRow } from "../../../src/domain/types.ts";
import { AU_IDS, auFund, freshData, NOW } from "./helpers.ts";

const view = (data: AppData, id: string) => auModule.tbView(data, auFund(data, id), NOW);

function policyFixture(): AppData {
  const data = freshData();
  const fund = auFund(data, "coastline");
  fund.expenseAllocation = undefined;
  data.taxAdjustments[fund.id] = { div40: 0, div43: 0, tarpDiscountGross: 0, tarpOther: 0 };
  const rows: TbRow[] = [
    { id: "tb-policy-4000", fundId: fund.id, account: "4000", name: "Other rent", category: "rent", current: -100_000_000, prior: 0 },
    { id: "tb-policy-4010", fundId: fund.id, account: "4010", name: "NCMI rent", category: "ncmi-rent", current: -50_000_000, prior: 0 },
    { id: "tb-policy-4020", fundId: fund.id, account: "4020", name: "Clean rent", category: "clean-building", current: -50_000_000, prior: 0 },
    { id: "tb-policy-5200", fundId: fund.id, account: "5200", name: "Deductible expenses", category: "deductible-expense", current: 30_000_000, prior: 0 },
  ];
  data.tbRows = [...data.tbRows.filter((row) => row.fundId !== fund.id), ...rows];
  return data;
}

test("absent expense allocation and explicit pro-rata derive identical seeded AU trial balances", () => {
  for (const id of AU_IDS) {
    const absent = freshData();
    auFund(absent, id).expenseAllocation = undefined;
    const explicit = freshData();
    auFund(explicit, id).expenseAllocation = { method: "pro-rata" };
    assert.deepEqual(view(explicit, id).derivedInputs, view(absent, id).derivedInputs, id);
    assert.deepEqual(view(explicit, id).bookToTax, view(absent, id).bookToTax, id);
  }
});

test("other-income policy allocates every deduction to Australian income — other", () => {
  const data = policyFixture();
  auFund(data, "coastline").expenseAllocation = { method: "other-income" };
  const inputs = view(data, "coastline").derivedInputs as AuInputs;
  assert.equal(inputs.ausOtherIncome, 70_000_000);
  assert.equal(inputs.ncmi, 50_000_000);
  assert.equal(inputs.cleanBuilding, 50_000_000);
});

test("custom policy uses basis-point shares, exact pool footing and sets any excess against the other income", () => {
  const data = policyFixture();
  auFund(data, "coastline").expenseAllocation = { method: "custom", sharesBps: { other: 5_000, ncmi: 2_500, transitional: 2_500, clean: 0 } };
  const tb = view(data, "coastline");
  const inputs = tb.derivedInputs as AuInputs;
  // A$300,000 pool x 50% / 25% / 25% / 0% = A$150,000, A$75,000, A$75,000, nil.
  // Transitional had no gross rent, so it stays at nil and its A$75,000 is set against the remaining streams pro rata:
  // other A$850,000, NCMI A$425,000 and clean A$500,000 (A$1,775,000) give up A$35,915, A$17,958 and A$21,127.
  assert.equal(inputs.ausOtherIncome, 81_408_500);
  assert.equal(inputs.ncmi, 40_704_200);
  assert.equal(inputs.excludedNcmi, 0);
  assert.equal(inputs.cleanBuilding, 47_887_300);
  assert.equal(inputs.ausOtherIncome + inputs.ncmi + inputs.cleanBuilding, 170_000_000, "attributed income equals rent less every deduction");
  assert.equal(tb.bookToTax.extra, undefined, "no tax loss: the excess is absorbed by other income");
});

test("deductions above all income leave a tax loss carried forward by the trust", () => {
  const data = policyFixture();
  const fund = auFund(data, "coastline");
  fund.expenseAllocation = { method: "other-income" };
  data.tbRows.push({ id: "tb-policy-4300", fundId: fund.id, account: "4300", name: "Interest", category: "interest-income", current: -10_000_000, prior: 0 });
  data.taxAdjustments[fund.id] = { div40: 0, div43: 0, tarpDiscountGross: 0, tarpOther: 5_000_000 };
  const expense = data.tbRows.find((row) => row.id === "tb-policy-5200")!;
  expense.current = 240_000_000;
  const tb = view(data, "coastline");
  const inputs = tb.derivedInputs as AuInputs;
  // A$2.4m of deductions against A$2m rent, A$100,000 interest and a A$50,000 TARP gain: everything is nil and A$250,000 is a loss.
  for (const key of ["ausOtherIncome", "ncmi", "excludedNcmi", "cleanBuilding", "interest", "otherGainTarp"] as const) assert.equal(inputs[key], 0, key);
  assert.equal(tb.bookToTax.extra?.label, "Tax loss carried forward by the trust (not attributed to members)");
  assert.equal(tb.bookToTax.extra?.amount, 25_000_000);
});

test("ordinary income absorbs excess deductions before TARP capital gains", () => {
  const data = policyFixture();
  const fund = auFund(data, "coastline");
  fund.expenseAllocation = { method: "other-income" };
  data.tbRows.push({ id: "tb-policy-4300", fundId: fund.id, account: "4300", name: "Interest", category: "interest-income", current: -10_000_000, prior: 0 });
  data.taxAdjustments[fund.id] = { div40: 0, div43: 0, tarpDiscountGross: 0, tarpOther: 50_000_000 };
  const expense = data.tbRows.find((row) => row.id === "tb-policy-5200")!;
  expense.current = 230_000_000;
  const inputs = view(data, "coastline").derivedInputs as AuInputs;
  // A$2.3m of deductions: A$1m rent, then A$500,000 NCMI + A$500,000 clean + A$100,000 interest (A$1.1m), then A$200,000 of the A$500,000 TARP gain.
  assert.equal(inputs.ausOtherIncome + inputs.ncmi + inputs.cleanBuilding + inputs.interest, 0);
  assert.equal(inputs.otherGainTarp, 30_000_000);
});
