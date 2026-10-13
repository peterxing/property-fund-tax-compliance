import assert from "node:assert/strict";
import { test } from "node:test";
import { UNMAPPED_LABEL, UNMAPPED_TREATMENT } from "../../../src/domain/au/tb.ts";
import { auModule } from "../../../src/domain/au/index.ts";
import type { AuInputs, TbView } from "../../../src/domain/types.ts";
import { UNMAPPED_CATEGORY } from "../../../src/domain/types.ts";
import { AU_IDS, auFund, freshData, NOW, sum } from "./helpers.ts";

const view = (data: ReturnType<typeof freshData>, id: string): TbView => auModule.tbView(data, auFund(data, id), NOW);
const derived = (tb: TbView): AuInputs => tb.derivedInputs as AuInputs;

const RESULT_DOLLARS: Record<string, number> = {
  harbourline: 59_620_600,
  southbank: 42_148_860,
  wattle: 103_851_000,
  kurrajong: 40_377_800,
  coastline: 18_287_550,
};

test("every seeded trial balance balances and derives the inputs the distribution already carries", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const fund = auFund(data, id);
    const tb = view(data, id);
    assert.equal(tb.fundId, id);
    assert.equal(tb.periodLabel, fund.periodLabel);
    assert.equal(tb.balanced, true, `${id} balanced`);
    assert.equal(tb.totalDebitsLessCredits, 0, `${id} debits less credits`);
    assert.equal(tb.matchesDistribution, true, `${id} matches the distribution`);
    assert.equal(tb.allMapped, id !== "coastline", `${id} mapping`);
    assert.deepEqual(tb.derivedInputs, fund.inputs, `${id}: the sync would leave the distribution as it is`);
    assert.ok(tb.components.every((c) => c.agrees && c.trialBalance === c.distribution), `${id} components agree`);
  }
});

test("components list the editable inputs the trial balance derives, never the cash distribution or the non-attributable line", () => {
  const data = freshData();
  const allowed = new Set<string>(["ausOtherIncome", "ncmi", "excludedNcmi", "cleanBuilding", "interest", "discountGainTarp", "otherGainTarp", "foreignIncome"]);
  for (const id of AU_IDS) {
    const tb = view(data, id);
    assert.ok(tb.components.length > 0);
    for (const c of tb.components) {
      assert.ok(allowed.has(c.key), `${id}: ${c.key} is an input the sync can copy`);
      assert.ok(c.label.length > 0);
    }
    assert.ok(!tb.components.some((c) => c.key === "cashDistribution" || c.key === "taxDeferred"));
    assert.equal(new Set(tb.components.map((c) => c.key)).size, tb.components.length, `${id}: one row per input`);
  }
  assert.deepEqual(
    view(data, "harbourline").components.map((c) => c.key),
    ["ausOtherIncome", "cleanBuilding", "interest", "discountGainTarp"],
  );
  assert.deepEqual(
    view(data, "kurrajong").components.map((c) => c.key),
    ["ausOtherIncome", "ncmi", "interest"],
  );
  assert.deepEqual(
    view(data, "coastline").components.map((c) => c.key),
    ["ausOtherIncome", "interest", "foreignIncome"],
  );
});

test("the reconciliation of accounting profit to taxable income carries the reference's wording and foots", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const { bookToTax } = view(data, id);
    assert.equal(bookToTax.title, "Reconciliation of accounting profit to taxable income");
    assert.equal(bookToTax.resultLabel, "Net income attributed to members");
    assert.equal(bookToTax.result, RESULT_DOLLARS[id] * 100, `${id} result`);
    const first = bookToTax.rows[0];
    const last = bookToTax.rows[bookToTax.rows.length - 1];
    assert.deepEqual([first.label, first.kind], ["Net profit per accounts", "start"]);
    assert.deepEqual([last.label, last.kind, last.amount], ["Net income attributed to members", "result", bookToTax.result]);
    assert.ok(bookToTax.rows.slice(1, -1).every((r) => r.kind === (r.amount >= 0 ? "add" : "less")), `${id}: add and less rows carry their sign`);
    const footed = sum(bookToTax.rows.slice(0, -1).map((r) => r.amount));
    assert.ok(Math.abs(footed - bookToTax.result) <= 100, `${id}: the rows foot to the result within A$1 (${footed} vs ${bookToTax.result})`);
    assert.equal(bookToTax.extra, undefined, `${id}: no unattributable deductions`);
  }
});

test("Harbourline's reconciliation lists each adjustment the trial balance and the preparer's schedule drive", () => {
  const data = freshData();
  const { bookToTax, adjustments } = view(data, "harbourline");
  assert.deepEqual(
    bookToTax.rows.map((r) => [r.label, r.amount / 100]),
    [
      ["Net profit per accounts", 25_668_257],
      ["Add: fair value loss", 41_206_580],
      ["Less: straight-line rent", -1_184_233],
      ["Less: accounting gain on disposal", -6_831_134],
      ["Add: accounting depreciation", 2_382_457],
      ["Add: non-deductible expenses", 41_872],
      ["Less: tax depreciation — Div 40", -1_855_496],
      ["Less: capital works — Div 43", -3_719_703],
      ["Add: TARP capital gains after discount", 3_912_000],
      ["Net income attributed to members", 59_620_600],
    ],
  );
  assert.deepEqual(
    adjustments.map((a) => [a.key, a.amount / 100]),
    [
      ["div40", 1_855_496],
      ["div43", 3_719_703],
      ["tarpDiscountGross", 7_824_000],
      ["tarpOther", 0],
    ],
  );
  assert.ok(adjustments.every((a) => a.label.length > 0 && a.help.length > 0));
  const coastline = view(data, "coastline").bookToTax.rows.map((r) => r.label);
  assert.deepEqual(coastline, [
    "Net profit per accounts",
    "Less: fair value gain",
    "Less: straight-line rent",
    "Add: accounting depreciation",
    "Add: non-deductible expenses",
    "Less: tax depreciation — Div 40",
    "Less: capital works — Div 43",
    "Net income attributed to members",
  ]);
});

test("accounts are listed by number with their category, treatment and movement", () => {
  const data = freshData();
  const tb = view(data, "harbourline");
  assert.equal(tb.rows.length, 17);
  assert.deepEqual(
    tb.rows.map((r) => r.account),
    [...tb.rows.map((r) => r.account)].sort(),
  );
  const rent = tb.rows.find((r) => r.account === "4000");
  assert.ok(rent);
  assert.equal(rent.categoryLabel, "Rental and property income");
  assert.equal(rent.treatment, "Assessable — Australian income, other");
  assert.equal(rent.change, rent.current - rent.prior);
  const disposal = tb.rows.find((r) => r.account === "4400");
  assert.ok(disposal);
  assert.equal(disposal.prior, 0);
  assert.equal(disposal.changePct, null, "no percentage against a zero prior year");
  assert.ok(tb.rows.filter((r) => r.prior !== 0).every((r) => typeof r.changePct === "number" && Number.isFinite(r.changePct)));
});

test("a row with no tax category is flagged, kept out of the derived inputs and keeps the reference's wording", () => {
  assert.equal(UNMAPPED_LABEL, "Needs a tax category");
  assert.equal(UNMAPPED_TREATMENT, "Excluded until mapped");
  const data = freshData();
  const tb = view(data, "coastline");
  assert.equal(tb.allMapped, false);
  const row = tb.rows.find((r) => r.account === "4510");
  assert.ok(row);
  assert.deepEqual([row.category, row.categoryLabel, row.treatment], [UNMAPPED_CATEGORY, UNMAPPED_LABEL, UNMAPPED_TREATMENT]);
  assert.equal(row.current, -18_643_000);
  const last = tb.categories[tb.categories.length - 1];
  assert.deepEqual([last.id, last.label, last.treatment], [UNMAPPED_CATEGORY, UNMAPPED_LABEL, UNMAPPED_TREATMENT]);
  assert.deepEqual(
    tb.categories.slice(0, -1).map((c) => c.id),
    data.tbCategories.AU.map((c) => c.id),
    "the fund's categories come first, in the seed's order",
  );
  assert.equal(tb.matchesDistribution, true, "the unmapped income is excluded rather than guessed");

  const mapped = freshData();
  const unmapped = mapped.tbRows.find((r) => r.fundId === "coastline" && r.account === "4510");
  assert.ok(unmapped);
  unmapped.category = "rent";
  const after = view(mapped, "coastline");
  assert.equal(after.allMapped, true);
  assert.equal(after.matchesDistribution, false, "mapping the account into rent moves the derived income");
  const other = after.components.find((c) => c.key === "ausOtherIncome");
  assert.ok(other);
  assert.equal(other.agrees, false);
  assert.ok(other.trialBalance > other.distribution);
});

test("an unbalanced trial balance is reported with the amount it is out by", () => {
  const data = freshData();
  const cash = data.tbRows.find((r) => r.fundId === "wattle" && r.account === "1000");
  assert.ok(cash);
  cash.current += 12_345;
  const tb = view(data, "wattle");
  assert.equal(tb.balanced, false);
  assert.equal(tb.totalDebitsLessCredits, 12_345);
  assert.equal(view(freshData(), "wattle").totalDebitsLessCredits, 0);
});

test("the derived components follow the accounts and the adjustments, and leave the fund's decisions alone", () => {
  const data = freshData();
  const fund = auFund(data, "southbank");
  const before = derived(view(data, "southbank"));
  fund.inputs.cashDistribution = 123_456;
  const rent = data.tbRows.find((r) => r.fundId === "southbank" && r.account === "4000");
  assert.ok(rent);
  rent.current -= 100_000_00; // A$100,000 more rental income
  data.taxAdjustments.southbank.div43 += 10_000_00;
  const tb = view(data, "southbank");
  assert.equal(derived(tb).cashDistribution, 123_456, "the distribution is a decision, not a trial balance output");
  assert.equal(derived(tb).ausOtherIncome - before.ausOtherIncome, 90_000_00, "income up A$100,000, deductions up A$10,000");
  assert.equal(tb.matchesDistribution, false);
  const row = tb.components.find((c) => c.key === "ausOtherIncome");
  assert.ok(row);
  assert.equal(row.trialBalance - row.distribution, 90_000_00);
  assert.equal(row.distribution, fund.inputs.ausOtherIncome);
  const keys = Object.keys(tb.derivedInputs).sort();
  assert.deepEqual(keys, Object.keys(fund.inputs).sort(), "a full AuInputs, ready to copy");
  assert.ok((Object.values(tb.derivedInputs) as number[]).every((n) => Number.isInteger(n) && n >= 0));
});

test("deductions are shared across the income streams in proportion to the rent each earned", () => {
  const data = freshData();
  const tb = view(data, "kurrajong");
  const inputs = derived(tb);
  const rows = data.tbRows.filter((r) => r.fundId === "kurrajong");
  const credit = (category: string): number => -sum(rows.filter((r) => r.category === category).map((r) => r.current));
  const pool = sum(rows.filter((r) => r.category === "deductible-expense").map((r) => r.current)) + data.taxAdjustments.kurrajong.div40 + data.taxAdjustments.kurrajong.div43;
  const rent = credit("rent");
  const ncmi = credit("ncmi-rent");
  const share = Math.round((pool * ncmi) / (rent + ncmi) / 100) * 100;
  assert.ok(Math.abs(inputs.ncmi - (ncmi - share)) <= 100, "NCMI takes its share of the deductions");
  assert.ok(Math.abs(inputs.ausOtherIncome - (rent - (pool - share))) <= 100, "other income takes the rest");
});

test("deductions above the rent are reported, not attributed", () => {
  const data = freshData();
  const rows = data.tbRows.filter((r) => r.fundId === "wattle" && r.category === "deductible-expense");
  assert.ok(rows.length > 0);
  rows[0].current += 900_000_000_00; // far more expense than rent
  const tb = view(data, "wattle");
  assert.equal(derived(tb).ausOtherIncome, 0, "attributed income never goes below zero");
  assert.ok(tb.bookToTax.extra);
  assert.equal(tb.bookToTax.extra.label, "Deductions above rental income (not attributed to members)");
  assert.ok(tb.bookToTax.extra.amount > 0);
});

test("small reconciling items are left off the reconciliation", () => {
  const data = freshData();
  const straight = data.tbRows.find((r) => r.fundId === "harbourline" && r.account === "4310");
  assert.ok(straight);
  straight.current = -40;
  assert.ok(!view(data, "harbourline").bookToTax.rows.some((r) => r.label === "Less: straight-line rent"), "40 cents of income is not worth a line");
  straight.current = 40;
  assert.ok(!view(data, "harbourline").bookToTax.rows.some((r) => r.label === "Add: straight-line rent"), "nor is 40 cents of expense");
  straight.current = 5_000;
  const shown = view(data, "harbourline").bookToTax.rows.find((r) => r.label === "Add: straight-line rent");
  assert.ok(shown, "A$50 is");
  assert.deepEqual([shown.amount, shown.kind], [5_000, "add"]);
});

test("a fund from another market is refused", () => {
  const data = freshData();
  const sg = data.funds.find((f) => f.market !== "AU");
  assert.ok(sg);
  assert.throws(() => auModule.tbView(data, sg, NOW), /not an Australian fund/);
});
