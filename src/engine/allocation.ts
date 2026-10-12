import { allocate, max0, ratioBps } from "./money.ts";
import type { Cents } from "./money.ts";
import { ENGINE_DISCLAIMER } from "./rules.ts";
import type { ComputationLine, Finding, Jurisdiction } from "./types.ts";

const RETRIEVED = "2026-10-09";

export type IncomeCharacter = "TAXABLE" | "EXEMPT" | "NON_TAXABLE" | "FOREIGN";
export type AllocationBasis = "DIRECT" | "GROSS_REVENUE" | "ASSET_VALUE" | "PROPERTY_COUNT" | "FIXED_PERCENT";

export interface ExpenseAllocationInputLine {
  category: string;
  amount: Cents;
}

export interface IncomeStreamProperty {
  propertyCode: string;
  jurisdiction: Jurisdiction;
  incomeCharacter: IncomeCharacter;
  grossRevenue: Cents;
  assetValue: Cents;
}

export interface AllocationPolicyLine {
  expenseCategory: string;
  basis: AllocationBasis;
  directPropertyCode?: string;
  fixedPercentToTaxableBps?: number;
}

export interface AllocationOverride {
  expenseCategory: string;
  allocationsByStreamBps: Record<string, number>;
  reason?: string;
}

export interface AllocationRequest {
  expenses: readonly ExpenseAllocationInputLine[];
  properties: readonly IncomeStreamProperty[];
  policies: readonly AllocationPolicyLine[];
  overrides?: readonly AllocationOverride[];
}

export interface AllocationCell {
  expenseCategory: string;
  streamKey: string;
  amount: Cents;
}

export interface AllocationResult {
  matrix: readonly AllocationCell[];
  lines: readonly ComputationLine[];
  findings: readonly Finding[];
  deductibleAgainstTaxableIncome: Cents;
  disallowedAgainstTaxableIncome: Cents;
}

function streamKey(property: IncomeStreamProperty): string {
  return `${property.jurisdiction}_${property.incomeCharacter}`;
}

function pickPolicy(category: string, policies: readonly AllocationPolicyLine[]): AllocationPolicyLine | undefined {
  return policies.find((policy) => policy.expenseCategory === category) ?? policies.find((policy) => policy.expenseCategory === "*");
}

function pickOverride(category: string, overrides: readonly AllocationOverride[]): AllocationOverride | undefined {
  return overrides.find((override) => override.expenseCategory === category);
}

export function allocateExpenses(request: AllocationRequest): AllocationResult {
  const findings: Finding[] = [];
  const streamMap = new Map<string, IncomeStreamProperty[]>();
  for (const property of request.properties) {
    const key = streamKey(property);
    streamMap.set(key, [...(streamMap.get(key) ?? []), property]);
  }
  const streamKeys = [...streamMap.keys()].sort();
  const matrix: AllocationCell[] = [];
  const lines: ComputationLine[] = [];
  let deductibleAgainstTaxableIncome = 0;
  let disallowedAgainstTaxableIncome = 0;

  for (const expense of request.expenses) {
    const override = pickOverride(expense.category, request.overrides ?? []);
    let amounts: Cents[] = [];
    if (override) {
      const orderedBps = streamKeys.map((key) => override.allocationsByStreamBps[key] ?? 0);
      const totalBps = orderedBps.reduce((a, b) => a + b, 0);
      if (totalBps !== 10_000) {
        findings.push({ id: "ALLOC.OVERRIDE_INVALID", severity: "WARNING", message: `Override for ${expense.category} does not sum to 100%.`, subject: expense.category, data: { totalBps } });
      }
      amounts = orderedBps.map((bps) => Math.round(expense.amount * bps / 10_000));
      const diff = expense.amount - amounts.reduce((a, b) => a + b, 0);
      if (amounts.length > 0) amounts[0] = (amounts[0] ?? 0) + diff;
      findings.push({ id: "ALLOC.OVERRIDE_USED", severity: "INFO", message: `Manual allocation override used for ${expense.category}.`, subject: expense.category, data: { hasReason: Boolean(override.reason) } });
    } else {
      const policy = pickPolicy(expense.category, request.policies);
      if (!policy) {
        findings.push({ id: "ALLOC.NO_POLICY", severity: "WARNING", message: `No allocation policy found for ${expense.category}; allocated by gross revenue as default.`, subject: expense.category });
      }
      const basis = policy?.basis ?? "GROSS_REVENUE";
      const weights = streamKeys.map((key) => {
        const properties = streamMap.get(key) ?? [];
        if (basis === "GROSS_REVENUE") return properties.reduce((a, b) => a + max0(b.grossRevenue), 0) / 100;
        if (basis === "ASSET_VALUE") return properties.reduce((a, b) => a + max0(b.assetValue), 0) / 100;
        if (basis === "PROPERTY_COUNT") return properties.length;
        if (basis === "DIRECT") return properties.some((property) => property.propertyCode === policy?.directPropertyCode) ? 1 : 0;
        if (basis === "FIXED_PERCENT") {
          const keyIsTaxable = key === "SG_TAXABLE";
          return keyIsTaxable ? policy?.fixedPercentToTaxableBps ?? 0 : Math.max(0, 10_000 - (policy?.fixedPercentToTaxableBps ?? 0));
        }
        return 0;
      });
      amounts = allocate(expense.amount, weights);
      if (weights.every((weight) => weight === 0)) {
        findings.push({ id: "ALLOC.ZERO_BASIS", severity: "WARNING", message: `No usable basis data was available for ${expense.category}; nothing was allocated.`, subject: expense.category });
      }
    }

    streamKeys.forEach((key, index) => {
      const amount = amounts[index] ?? 0;
      matrix.push({ expenseCategory: expense.category, streamKey: key, amount });
      const character = key.split("_").slice(1).join("_") as IncomeCharacter;
      if (key === "SG_TAXABLE") deductibleAgainstTaxableIncome += amount;
      else if (amount !== 0) disallowedAgainstTaxableIncome += amount;
      lines.push({ code: `ALLOC.${expense.category}.${key}`, label: `${expense.category} -> ${key}`, amount, kind: "AMOUNT", source: override ? "OVERRIDE" : "RULE", needsReview: Boolean(override) });
      if ((character === "EXEMPT" || character === "NON_TAXABLE" || character === "FOREIGN") && amount > 0) {
        findings.push({ id: "ALLOC.DISALLOWED_STREAM", severity: "INFO", message: `${expense.category} has been allocated to ${key}; that portion is not deductible against Singapore taxable income.`, subject: expense.category, data: { amount, ratioBps: ratioBps(amount, expense.amount || 1) } });
      }
    });
  }

  lines.unshift(
    { code: "ALLOC.DEDUCTIBLE", label: "Deductible against SG taxable income", amount: deductibleAgainstTaxableIncome, kind: "TOTAL", source: "RULE" },
    { code: "ALLOC.DISALLOWED", label: "Allocated to exempt / non-taxable / foreign streams", amount: disallowedAgainstTaxableIncome, kind: "TOTAL", source: "RULE" },
  );

  return {
    matrix,
    lines,
    findings,
    deductibleAgainstTaxableIncome,
    disallowedAgainstTaxableIncome,
  };
}

export const RULES = [
  {
    id: "allocation.exempt-income-disallowance.2022-plus",
    domain: "CORPORATE_TAX",
    title: "Expenses attributable to exempt, non-taxable or foreign exempt income are not deductible against Singapore taxable income",
    summary: "The allocation engine supports direct attribution, gross revenue, asset value, property count and fixed-percentage policies so that disallowed expenses are segregated from taxable Singapore income.",
    effectiveFrom: "2022-01-01",
    sources: [
      {
        title: "IRAS | Preparing a Tax Computation",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/form-c-s-form-c-s-(lite)-form-c-filing/preparing-a-tax-computation",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
      {
        title: "IRAS | Companies Receiving Foreign Income",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/companies-receiving-foreign-income",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
    ],
    confidence: "VERIFIED",
    notes: "Allocation bases are configurable policy choices rather than statute-set apportionment formulas; overrides should be reviewed and retained in the audit trail.",
  },
] as const;

export const NOTES = [ENGINE_DISCLAIMER];
