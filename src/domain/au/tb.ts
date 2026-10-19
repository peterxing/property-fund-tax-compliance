// Trial balance view: what the accounts say the distribution components are, the book-to-tax reconciliation and the account list.
import type { AppData, AuExpenseAllocation, AuFund, AuInputs, BookToTaxRow, Cents, Fund, TbCategoryDef, TbRow, TbRowView, TbView } from "../types.ts";
import { UNMAPPED_CATEGORY } from "../types.ts";
import { inputLabel } from "../core/labels.ts";
import { trustNetGain } from "./rates.ts";
import { asAuFund, divRound, nz, roundToDollarCents, tbRowsOf } from "./util.ts";

/** The reference app's wording for a row that has no tax category yet. */
export const UNMAPPED_LABEL = "Needs a tax category";
export const UNMAPPED_TREATMENT = "Excluded until mapped";

/** Categories whose balances make up the accounting profit. */
const PROFIT_CATEGORIES = [
  "rent",
  "ncmi-rent",
  "ncmi-transitional",
  "clean-building",
  "interest-income",
  "foreign-income",
  "deductible-expense",
  "depreciation-book",
  "fair-value",
  "straight-line",
  "book-gain-sale",
  "non-deductible",
] as const;

/** The editable inputs a trial balance can derive, in the order of the distribution table. The cash distribution is a decision, not a derived figure. */
export const DERIVED_KEYS = [
  "ausOtherIncome",
  "ncmi",
  "excludedNcmi",
  "cleanBuilding",
  "interest",
  "discountGainTarp",
  "otherGainTarp",
  "foreignIncome",
] as const satisfies ReadonlyArray<keyof AuInputs>;

export type DerivedKey = (typeof DERIVED_KEYS)[number];

export interface TbDerivation {
  /** The inputs as they would stand after "Update distribution": derived components plus the fund's own cash distribution. */
  inputs: AuInputs;
  /** Σ current by category (debits positive). */
  sums: Record<string, Cents>;
  total: Cents;
  accountingProfit: Cents;
  unmapped: TbRow[];
  /** Deductions above all the assessable income they can be set against: the trust's tax loss, carried forward and not attributed to members. */
  taxLoss: Cents;
  adjustments: Record<string, Cents>;
  manualAdjustments: Array<{ label: string; component: DerivedKey; amount: Cents; reason: string }>;
  prior: Pick<TbDerivation, "sums" | "accountingProfit" | "inputs" | "adjustments" | "taxLoss" | "manualAdjustments">;
}

/** pool * part / whole in whole dollars (half away from zero), computed exactly. */
function poolShare(pool: Cents, part: Cents, whole: Cents): Cents {
  if (whole <= 0 || part <= 0 || pool === 0) return 0;
  const dollars = divRound(BigInt(Math.abs(pool)) * BigInt(part), BigInt(whole) * 100n);
  return nz(pool < 0 ? -dollars * 100 : dollars * 100);
}

const defaultAllocation = (allocation: AuFund["expenseAllocation"]): AuExpenseAllocation => allocation ?? { method: "pro-rata" };

/**
 * Sets `excess` against the amounts in `available` in proportion to their size, never taking more than an amount holds.
 * Returns what each amount gives up and whatever the amounts cannot absorb.
 */
function absorb<K extends string>(excess: Cents, available: Record<K, Cents>): { taken: Record<K, Cents>; left: Cents } {
  const keys = Object.keys(available) as K[];
  const taken = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, Cents>;
  const whole = keys.reduce((sum, key) => sum + available[key], 0);
  if (excess <= 0) return { taken, left: 0 };
  if (excess >= whole) {
    for (const key of keys) taken[key] = available[key];
    return { taken, left: excess - whole };
  }
  for (const key of keys) taken[key] = Math.min(available[key], poolShare(excess, available[key], whole));
  // Whole-dollar rounding can leave the shares a few dollars off; settle the difference on the largest amounts first.
  let difference = excess - keys.reduce((sum, key) => sum + taken[key], 0);
  for (const key of keys.slice().sort((a, b) => available[b] - available[a])) {
    if (difference === 0) break;
    const next = Math.min(available[key], Math.max(0, taken[key] + difference));
    difference -= next - taken[key];
    taken[key] = next;
  }
  return { taken, left: 0 };
}

function allocationShares(pool: Cents, allocation: AuExpenseAllocation, gross: { other: Cents; ncmi: Cents; transitional: Cents; clean: Cents }): Record<"other" | "ncmi" | "transitional" | "clean", Cents> {
  if (allocation.method === "other-income") return { other: pool, ncmi: 0, transitional: 0, clean: 0 };
  if (allocation.method === "custom") {
    const ncmi = poolShare(pool, allocation.sharesBps.ncmi, 10_000);
    const transitional = poolShare(pool, allocation.sharesBps.transitional, 10_000);
    const clean = poolShare(pool, allocation.sharesBps.clean, 10_000);
    return { other: pool - ncmi - transitional - clean, ncmi, transitional, clean };
  }
  const whole = gross.other + gross.ncmi + gross.transitional + gross.clean;
  const ncmi = poolShare(pool, gross.ncmi, whole);
  const clean = poolShare(pool, gross.clean, whole);
  const transitional = poolShare(pool, gross.transitional, whole);
  return { other: pool - ncmi - transitional - clean, ncmi, transitional, clean };
}

function deriveFor(data: AppData, fund: AuFund, field: "current" | "prior", includeCurrentOnlyAdjustments: boolean) {
  const rows = tbRowsOf(data, fund.id);
  const sums: Record<string, Cents> = {};
  for (const row of rows) sums[row.category] = (sums[row.category] ?? 0) + row[field];
  const n = (category: string): Cents => sums[category] ?? 0;
  const adjustments = includeCurrentOnlyAdjustments ? (data.taxAdjustments[fund.id] ?? {}) : {};
  const adj = (key: string): Cents => adjustments[key] ?? 0;
  const manualAdjustments = includeCurrentOnlyAdjustments
    ? data.manualAdjustments
        .filter((a) => a.fundId === fund.id && (DERIVED_KEYS as readonly string[]).includes(a.component))
        .map((a) => ({ label: a.label, component: a.component as DerivedKey, amount: a.amount, reason: a.reason }))
    : [];

  const gross = {
    other: -n("rent"),
    ncmi: -n("ncmi-rent"),
    transitional: -n("ncmi-transitional"),
    clean: -n("clean-building"),
  };

  // Deductions (expenses, Div 40 and Div 43) are set against the rental streams under the fund's allocation policy.
  const pool = n("deductible-expense") + adj("div40") + adj("div43");
  const shares = allocationShares(pool, defaultAllocation(fund.expenseAllocation), gross);
  const net = {
    other: gross.other - shares.other,
    ncmi: gross.ncmi - shares.ncmi,
    transitional: gross.transitional - shares.transitional,
    clean: gross.clean - shares.clean,
  };

  const floor0 = (cents: Cents): Cents => Math.max(0, roundToDollarCents(cents));
  // No trust component goes below nil. Deductions above a stream's income are set against the other assessable income on a
  // reasonable basis (ATO, "Calculating AMIT income – trust components"): first the remaining rent, interest and foreign income,
  // then the TARP capital gains, each pro rata. Anything left is the trust's tax loss.
  const rentalExcess = Object.values(net).reduce((sum, value) => sum + Math.max(0, -value), 0);
  const ordinary = {
    other: Math.max(0, net.other),
    ncmi: Math.max(0, net.ncmi),
    transitional: Math.max(0, net.transitional),
    clean: Math.max(0, net.clean),
    interest: Math.max(0, -n("interest-income")),
    foreign: Math.max(0, -n("foreign-income")),
  };
  const gains = {
    discount: Math.max(0, trustNetGain(fund.periodEnd, adj("tarpDiscountGross"))),
    other: Math.max(0, adj("tarpOther")),
  };
  const fromOrdinary = absorb(rentalExcess, ordinary);
  const fromGains = absorb(fromOrdinary.left, gains);
  const inputs: AuInputs = {
    cashDistribution: fund.inputs.cashDistribution,
    ausOtherIncome: floor0(ordinary.other - fromOrdinary.taken.other),
    ncmi: floor0(ordinary.ncmi - fromOrdinary.taken.ncmi),
    excludedNcmi: floor0(ordinary.transitional - fromOrdinary.taken.transitional),
    cleanBuilding: floor0(ordinary.clean - fromOrdinary.taken.clean),
    interest: floor0(ordinary.interest - fromOrdinary.taken.interest),
    discountGainTarp: floor0(gains.discount - fromGains.taken.discount),
    otherGainTarp: floor0(gains.other - fromGains.taken.other),
    foreignIncome: floor0(ordinary.foreign - fromOrdinary.taken.foreign),
  };
  for (const adjustment of manualAdjustments) {
    inputs[adjustment.component] = Math.max(0, inputs[adjustment.component] + adjustment.amount);
  }

  return {
    inputs,
    sums,
    total: rows.reduce((sum, r) => sum + r.current, 0),
    accountingProfit: nz(-PROFIT_CATEGORIES.reduce((sum, c) => sum + n(c), 0)),
    unmapped: rows.filter((r) => r.category === UNMAPPED_CATEGORY),
    taxLoss: fromGains.left,
    adjustments,
    manualAdjustments,
  };
}

export function deriveFromTb(data: AppData, fund: AuFund): TbDerivation {
  const current = deriveFor(data, fund, "current", true);
  const prior = deriveFor(data, fund, "prior", false);
  return { ...current, prior };
}

/** Rows of the reconciliation from accounting profit to the income attributed to members. */
function withPrior(row: BookToTaxRow, prior: Cents): BookToTaxRow {
  const change = row.amount - prior;
  return { ...row, prior, change, changePct: prior === 0 ? null : (change / Math.abs(prior)) * 100 };
}

export function bookToTaxRows(d: TbDerivation): BookToTaxRow[] {
  const rows: BookToTaxRow[] = [{ label: "Net profit per accounts", amount: d.accountingProfit, kind: "start" }];
  const priorRows = new Map<string, Cents>(bookToTaxRowsNoPrior(d.prior).map((row) => [row.label, row.amount]));
  rows[0] = withPrior(rows[0], priorRows.get(rows[0].label) ?? 0);
  const addRow = (row: BookToTaxRow): void => {
    rows.push(withPrior(row, priorRows.get(row.label) ?? 0));
  };
  for (const row of bookToTaxRowsNoPrior(d).slice(1)) addRow(row);
  return rows;
}

function bookToTaxRowsNoPrior(d: Pick<TbDerivation, "accountingProfit" | "sums" | "adjustments" | "inputs" | "manualAdjustments">): BookToTaxRow[] {
  const rows: BookToTaxRow[] = [{ label: "Net profit per accounts", amount: d.accountingProfit, kind: "start" }];
  // A reconciling item is shown once it is worth more than 50 cents.
  const push = (label: string, amount: Cents): void => {
    if (Math.abs(amount) > 50) rows.push({ label, amount: nz(amount), kind: amount >= 0 ? "add" : "less" });
  };
  const n = (category: string): Cents => d.sums[category] ?? 0;
  const fairValue = -n("fair-value");
  const straightLine = -n("straight-line");
  const disposal = -n("book-gain-sale");
  push(fairValue >= 0 ? "Less: fair value gain" : "Add: fair value loss", -fairValue);
  push(straightLine >= 0 ? "Less: straight-line rent" : "Add: straight-line rent", -straightLine);
  push(disposal >= 0 ? "Less: accounting gain on disposal" : "Add: accounting loss on disposal", -disposal);
  push("Add: accounting depreciation", n("depreciation-book"));
  push("Add: non-deductible expenses", n("non-deductible"));
  push("Less: tax depreciation — Div 40", -(d.adjustments.div40 ?? 0));
  push("Less: capital works — Div 43", -(d.adjustments.div43 ?? 0));
  push("Add: TARP capital gains after discount", d.inputs.discountGainTarp + d.inputs.otherGainTarp);
  for (const adjustment of d.manualAdjustments) push(`Manual adjustment: ${adjustment.label}`, adjustment.amount);
  rows.push({ label: "Net income attributed to members", amount: attributedTotal(d.inputs), kind: "result" });
  return rows;
}

const attributedTotal = (inputs: AuInputs): Cents => DERIVED_KEYS.reduce((sum, key) => sum + inputs[key], 0);

export function tbView(data: AppData, fundIn: Fund, _now: Date): TbView {
  const fund = asAuFund(fundIn);
  const d = deriveFromTb(data, fund);
  const byId = new Map<string, TbCategoryDef>(data.tbCategories.AU.map((c) => [c.id, c]));
  const unmappedDef: TbCategoryDef = { id: UNMAPPED_CATEGORY, label: UNMAPPED_LABEL, treatment: UNMAPPED_TREATMENT };

  const rows: TbRowView[] = tbRowsOf(data, fund.id)
    .slice()
    .sort((a, b) => a.account.localeCompare(b.account))
    .map((row) => {
      const def = row.category === UNMAPPED_CATEGORY ? unmappedDef : byId.get(row.category);
      const change = row.current - row.prior;
      return {
        id: row.id,
        account: row.account,
        name: row.name,
        category: row.category,
        categoryLabel: def?.label ?? row.category,
        treatment: def?.treatment ?? "",
        current: row.current,
        prior: row.prior,
        change,
        changePct: row.prior === 0 ? null : nz((change / Math.abs(row.prior)) * 100),
      };
    });

  const components = DERIVED_KEYS.map((key) => ({
    key: key as string,
    label: inputLabel(key),
    trialBalance: d.inputs[key],
    distribution: fund.inputs[key],
  }))
    .filter((c) => c.trialBalance !== 0 || c.distribution !== 0)
    .map((c) => ({ ...c, agrees: Math.abs(c.trialBalance - c.distribution) <= 1 }));

  const result = attributedTotal(d.inputs);
  const resultPrior = attributedTotal(d.prior.inputs);
  const resultChange = result - resultPrior;
  return {
    fundId: fund.id,
    periodLabel: fund.periodLabel,
    balanced: d.total === 0,
    totalDebitsLessCredits: nz(d.total),
    allMapped: d.unmapped.length === 0,
    matchesDistribution: components.every((c) => c.agrees),
    bookToTax: {
      title: "Reconciliation of accounting profit to taxable income",
      rows: bookToTaxRows(d),
      resultLabel: "Net income attributed to members",
      result,
      resultPrior,
      resultChange,
      resultChangePct: resultPrior === 0 ? null : (resultChange / Math.abs(resultPrior)) * 100,
      ...(d.taxLoss > 0 ? { extra: { label: "Tax loss carried forward by the trust (not attributed to members)", amount: d.taxLoss } } : {}),
    },
    adjustments: data.adjustmentDefs.AU.map((def) => ({ ...def, amount: d.adjustments[def.key] ?? 0 })),
    components,
    derivedInputs: d.inputs,
    rows,
    categories: [...data.tbCategories.AU.map((c) => ({ ...c })), { ...unmappedDef }],
  };
}
