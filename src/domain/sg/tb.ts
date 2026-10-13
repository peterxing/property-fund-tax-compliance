// Trial balance workspace for a Singapore fund: the book-to-tax reconciliation, the component comparison and the mapped rows.
import type { AppData, BookToTaxRow, Cents, Fund, SgFund, SgInputs, TbCategoryDef, TbRow, TbRowView, TbView } from "../types.ts";
import { UNMAPPED_CATEGORY } from "../types.ts";
import { roundToDollar } from "../../engine/money.ts";
import { requireSgFund, sumOf } from "./util.ts";

/** Categories that make up the profit and loss; the rest are balance sheet or distributions. */
const PROFIT_AND_LOSS = ["rent", "interest-income", "exempt-income", "deductible-expense", "depreciation-book", "fair-value", "straight-line", "book-gain-sale", "non-deductible"] as const;

/** The reference app's wording for an account that has no tax category yet (its category table gives the same treatment for AU and SG). */
export const UNMAPPED_LABEL = "Needs a tax category";
export const UNMAPPED_TREATMENT = "Excluded until mapped";

/**
 * Half a dollar, in cents. A ledger is balanced when its total is under this, an amount that differs from the distribution by this
 * much or less still agrees with it (as in the reference app), and a reconciling line is shown only when it is over this.
 */
export const TB_TOLERANCE = 50;

export interface SgTbCalc {
  rows: TbRow[];
  totalDebitsLessCredits: Cents;
  allMapped: boolean;
  rent: Cents;
  interest: Cents;
  exempt: Cents;
  deductible: Cents;
  depreciation: Cents;
  /** Credit balance as a positive number: a gain. */
  fairValue: Cents;
  straightLine: Cents;
  gain: Cents;
  nonDeductible: Cents;
  netProfit: Cents;
  totalIncome: Cents;
  totalExpenses: Cents;
  distributions: Cents;
  capitalAllowances: Cents;
  taxableSpecifiedIncome: Cents;
}

export function capitalAllowancesOf(data: AppData, fund: SgFund): Cents {
  return data.taxAdjustments[fund.id]?.capitalAllowances ?? 0;
}

/** Flips a debit balance to a credit one (and back) without producing negative zero for an empty category. */
const negate = (n: Cents): Cents => (n === 0 ? 0 : -n);

export function sgTbCalc(data: AppData, fund: SgFund): SgTbCalc {
  const rows = data.tbRows.filter((r) => r.fundId === fund.id);
  const known = new Set(data.tbCategories.SG.map((c) => c.id));
  const sumCat = (cat: string) => sumOf(rows.filter((r) => r.category === cat).map((r) => r.current));
  const rent = negate(sumCat("rent"));
  const interest = negate(sumCat("interest-income"));
  const deductible = sumCat("deductible-expense");
  const capitalAllowances = capitalAllowancesOf(data, fund);
  const plRows = rows.filter((r) => (PROFIT_AND_LOSS as readonly string[]).includes(r.category));
  return {
    rows,
    totalDebitsLessCredits: sumOf(rows.map((r) => r.current)),
    allMapped: rows.every((r) => r.category !== UNMAPPED_CATEGORY && known.has(r.category)),
    rent,
    interest,
    exempt: negate(sumCat("exempt-income")),
    deductible,
    depreciation: sumCat("depreciation-book"),
    fairValue: negate(sumCat("fair-value")),
    straightLine: negate(sumCat("straight-line")),
    gain: negate(sumCat("book-gain-sale")),
    nonDeductible: sumCat("non-deductible"),
    netProfit: negate(sumOf(plRows.map((r) => r.current))),
    totalIncome: negate(sumOf(plRows.filter((r) => r.current < 0).map((r) => r.current))),
    totalExpenses: sumOf(plRows.filter((r) => r.current > 0).map((r) => r.current)),
    distributions: sumCat("distributions"),
    capitalAllowances,
    taxableSpecifiedIncome: Math.max(0, roundToDollar(rent + interest - deductible - capitalAllowances)),
  };
}

function bookToTax(calc: SgTbCalc): TbView["bookToTax"] {
  const rows: BookToTaxRow[] = [{ label: "Net profit per accounts", amount: calc.netProfit, kind: "start" }];
  // Zero lines are left out; the reference hides anything under 50 cents.
  const add = (label: string, amount: Cents) => {
    if (Math.abs(amount) > TB_TOLERANCE) rows.push({ label, amount, kind: amount < 0 ? "less" : "add" });
  };
  add(calc.fairValue >= 0 ? "Less: fair value gain" : "Add: fair value loss", -calc.fairValue);
  add(calc.straightLine >= 0 ? "Less: straight-line rent" : "Add: straight-line rent", -calc.straightLine);
  add(calc.gain >= 0 ? "Less: accounting gain on disposal" : "Add: accounting loss on disposal", -calc.gain);
  add("Add: accounting depreciation", calc.depreciation);
  add("Add: non-deductible expenses", calc.nonDeductible);
  add("Less: capital allowances", -calc.capitalAllowances);
  add("Less: tax-exempt income", -calc.exempt);
  const result: TbView["bookToTax"] = {
    title: "Reconciliation of accounting profit to taxable income",
    rows,
    resultLabel: "Taxable specified income",
    result: calc.taxableSpecifiedIncome,
  };
  // The view has one slot for the amount available to distribute; a divestment gain is preferred to exempt income when both exist.
  if (calc.gain > 0) result.extra = { label: "Divestment gain available for capital distribution", amount: calc.gain };
  else if (calc.exempt > 0) result.extra = { label: "Tax-exempt income available to distribute", amount: calc.exempt };
  return result;
}

function rowViews(rows: TbRow[], categories: TbCategoryDef[]): TbRowView[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return rows
    .map((r): TbRowView => {
      const cat = byId.get(r.category);
      const change = r.current - r.prior;
      return {
        id: r.id,
        account: r.account,
        name: r.name,
        category: r.category,
        categoryLabel: cat ? cat.label : UNMAPPED_LABEL,
        treatment: cat ? cat.treatment : UNMAPPED_TREATMENT,
        current: r.current,
        prior: r.prior,
        change,
        changePct: r.prior === 0 ? null : (change / Math.abs(r.prior)) * 100,
      };
    })
    .sort((a, b) => a.account.localeCompare(b.account, "en", { numeric: true }));
}

export function sgTbView(data: AppData, fundIn: Fund, _now: Date): TbView {
  const fund = requireSgFund(fundIn);
  const calc = sgTbCalc(data, fund);
  const derived = calc.taxableSpecifiedIncome;
  // Only the taxable specified income is derived from the ledger. The taxable payout, the exempt distribution and the capital
  // distribution are decisions bounded by what is available (see docs/parity/sg.md), so the sync never overwrites them.
  const components = [
    {
      key: "taxableSpecifiedIncome",
      label: "Taxable specified income",
      trialBalance: derived,
      distribution: fund.inputs.taxableSpecifiedIncome,
      agrees: Math.abs(derived - fund.inputs.taxableSpecifiedIncome) <= TB_TOLERANCE,
    },
  ];
  const derivedInputs: SgInputs = { ...fund.inputs, taxableSpecifiedIncome: derived };
  const amounts = data.taxAdjustments[fund.id] ?? {};
  return {
    fundId: fund.id,
    periodLabel: fund.periodLabel,
    balanced: Math.abs(calc.totalDebitsLessCredits) < TB_TOLERANCE,
    totalDebitsLessCredits: calc.totalDebitsLessCredits,
    allMapped: calc.allMapped,
    matchesDistribution: components.every((c) => c.agrees),
    bookToTax: bookToTax(calc),
    adjustments: data.adjustmentDefs.SG.map((def) => ({ ...def, amount: amounts[def.key] ?? 0 })),
    components,
    derivedInputs,
    rows: rowViews(calc.rows, data.tbCategories.SG),
    categories: data.tbCategories.SG.map((c) => ({ ...c })),
  };
}
