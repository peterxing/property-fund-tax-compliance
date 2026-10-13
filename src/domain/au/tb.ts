// Trial balance view: what the accounts say the distribution components are, the book-to-tax reconciliation and the account list.
import type { AppData, AuFund, AuInputs, BookToTaxRow, Cents, Fund, TbCategoryDef, TbRow, TbRowView, TbView } from "../types.ts";
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
  /** Deductions above the rental income they are set against, which cannot be attributed to members. */
  netRentalLoss: Cents;
  adjustments: Record<string, Cents>;
}

/** pool * part / whole in whole dollars (half away from zero), computed exactly. */
function poolShare(pool: Cents, part: Cents, whole: Cents): Cents {
  if (whole <= 0 || part <= 0 || pool === 0) return 0;
  const dollars = divRound(BigInt(Math.abs(pool)) * BigInt(part), BigInt(whole) * 100n);
  return nz(pool < 0 ? -dollars * 100 : dollars * 100);
}

export function deriveFromTb(data: AppData, fund: AuFund): TbDerivation {
  const rows = tbRowsOf(data, fund.id);
  const sums: Record<string, Cents> = {};
  for (const row of rows) sums[row.category] = (sums[row.category] ?? 0) + row.current;
  const n = (category: string): Cents => sums[category] ?? 0;
  const adjustments = data.taxAdjustments[fund.id] ?? {};
  const adj = (key: string): Cents => adjustments[key] ?? 0;

  const rent = -n("rent");
  const ncmiRent = -n("ncmi-rent");
  const transitional = -n("ncmi-transitional");
  const clean = -n("clean-building");

  // Deductions (expenses, Div 40 and Div 43) are set against each income stream in proportion to the rent it earned.
  const pool = n("deductible-expense") + adj("div40") + adj("div43");
  const whole = rent + ncmiRent + transitional + clean;
  const ncmiShare = poolShare(pool, ncmiRent, whole);
  const cleanShare = poolShare(pool, clean, whole);
  const transitionalShare = poolShare(pool, transitional, whole);
  const otherShare = pool - ncmiShare - transitionalShare - cleanShare;
  const net = {
    other: rent - otherShare,
    ncmi: ncmiRent - ncmiShare,
    transitional: transitional - transitionalShare,
    clean: clean - cleanShare,
  };

  const floor0 = (cents: Cents): Cents => Math.max(0, roundToDollarCents(cents));
  const inputs: AuInputs = {
    cashDistribution: fund.inputs.cashDistribution,
    ausOtherIncome: floor0(net.other),
    ncmi: floor0(net.ncmi),
    excludedNcmi: floor0(net.transitional),
    cleanBuilding: floor0(net.clean),
    interest: floor0(-n("interest-income")),
    discountGainTarp: floor0(trustNetGain(fund.periodEnd, adj("tarpDiscountGross"))),
    otherGainTarp: floor0(adj("tarpOther")),
    foreignIncome: floor0(-n("foreign-income")),
  };

  return {
    inputs,
    sums,
    total: rows.reduce((sum, r) => sum + r.current, 0),
    accountingProfit: nz(-PROFIT_CATEGORIES.reduce((sum, c) => sum + n(c), 0)),
    unmapped: rows.filter((r) => r.category === UNMAPPED_CATEGORY),
    netRentalLoss: Math.max(0, -(net.other + net.ncmi + net.transitional + net.clean)),
    adjustments,
  };
}

/** Rows of the reconciliation from accounting profit to the income attributed to members. */
export function bookToTaxRows(d: TbDerivation): BookToTaxRow[] {
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
      ...(d.netRentalLoss > 0 ? { extra: { label: "Deductions above rental income (not attributed to members)", amount: d.netRentalLoss } } : {}),
    },
    adjustments: data.adjustmentDefs.AU.map((def) => ({ ...def, amount: d.adjustments[def.key] ?? 0 })),
    components,
    derivedInputs: d.inputs,
    rows,
    categories: [...data.tbCategories.AU.map((c) => ({ ...c })), { ...unmappedDef }],
  };
}
