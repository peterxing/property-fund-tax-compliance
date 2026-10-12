import type { ISODate } from "./dates.ts";
import type { Bps, Cents } from "./money.ts";
import { allocate, mulBps } from "./money.ts";
import type { RuleEntry } from "./rules.ts";
import { ENGINE_DISCLAIMER } from "./rules.ts";
import { computeReitTax, determineReitInvestorTax, type ReitDeclarationStatus, type ReitFundExemptionSection, type ReitIncomeInput, type ReitInvestorClass } from "./reitTax.ts";
import type { Finding } from "./types.ts";

export interface DistributionPolicy {
  id?: string;
  label?: string;
  taxableIncomePayoutBps: Bps;
  taxExemptIncomePayoutBps: Bps;
  capitalReleaseBps: Bps;
  dpuDecimals: number;
}

export interface DistributionEngineInput {
  distributionDate: ISODate;
  unitsOutstanding: number;
  policy: DistributionPolicy;
  income: Omit<ReitIncomeInput, "distributionDate" | "taxableSpecifiedIncomeDistributed" | "otherTrusteeTaxableIncomeDistributed" | "taxExemptIncomeDistributed" | "capitalDistributionDistributed">;
}

export interface RoundedPerUnit {
  decimals: number;
  scaledAmount: number;
  value: string;
}

export interface DistributionComputationResult {
  policy: DistributionPolicy;
  declaredAmount: Cents;
  distributionPerUnit: RoundedPerUnit;
  reitTaxResult: ReturnType<typeof computeReitTax>;
  sourceInput: ReitIncomeInput;
  findings: Finding[];
}

export interface UnitholderAllocationInput {
  distribution: DistributionComputationResult;
  unitholders: readonly UnitholderRecord[];
  unitsOutstanding?: number;
}

export interface UnitholderRecord {
  holderRef: string;
  maskedId: string;
  unitsHeld: number;
  investorClass: ReitInvestorClass;
  residency: "SG" | "NON_SG";
  declarationStatus: ReitDeclarationStatus;
  fundExemptionSection?: ReitFundExemptionSection;
  throughSingaporePartnership?: boolean;
  fromTradeBusinessOrProfession?: boolean;
  holdsUnitsOnRevenueAccount?: boolean;
}

export interface UnitholderAllocation {
  holderRef: string;
  maskedId: string;
  unitsHeld: number;
  investorClass: ReitInvestorClass;
  residency: "SG" | "NON_SG";
  declarationStatus: ReitDeclarationStatus;
  grossDistribution: Cents;
  transparentTaxableDistribution: Cents;
  trusteeTaxedDistribution: Cents;
  taxExemptDistribution: Cents;
  capitalDistribution: Cents;
  withholdingRateBps: Bps;
  taxDeducted: Cents;
  netCashPaid: Cents;
  taxTreatmentRemark: string;
}

export interface AllocationResult {
  allocations: UnitholderAllocation[];
  totals: {
    grossDistribution: Cents;
    taxDeducted: Cents;
    netCashPaid: Cents;
  };
  findings: Finding[];
}

export interface UnitholderStatement {
  holderRef: string;
  maskedId: string;
  unitsHeld: number;
  distributionDate: ISODate;
  grossDistribution: Cents;
  netCashPaid: Cents;
  breakdown: Array<{ component: string; amount: Cents; note?: string }>;
  taxDeducted: Cents;
  withholdingRateBps: Bps;
  notes: string[];
}

export interface WithholdingReconciliationInput {
  allocation: AllocationResult;
  amountRemittedToIras: Cents;
  statementsIssued: number;
}

export interface WithholdingReconciliationResult {
  deductedPerRegister: Cents;
  amountRemittedToIras: Cents;
  statementsIssued: number;
  expectedStatements: number;
  variance: Cents;
  findings: Finding[];
}

export interface ScenarioModelInput {
  distributionDate: ISODate;
  unitsOutstanding: number;
  income: DistributionEngineInput["income"];
  policies: readonly DistributionPolicy[];
}

export interface ScenarioModelResult {
  label: string;
  declaredAmount: Cents;
  distributionPerUnit: string;
  trusteeTax: Cents;
  retainedSpecifiedIncome: Cents;
  transparencyPass: boolean;
}

function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  const sign = numerator < 0n !== denominator < 0n ? -1n : 1n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return sign * q;
}

function formatScaled(scaledAmount: number, decimals: number): string {
  const neg = scaledAmount < 0;
  const abs = Math.abs(scaledAmount).toString().padStart(decimals + 1, "0");
  const head = abs.slice(0, -decimals) || "0";
  const tail = decimals === 0 ? "" : `.${abs.slice(-decimals)}`;
  return `${neg ? "-" : ""}${head}${tail}`;
}

function computePerUnit(total: Cents, units: number, decimals: number): RoundedPerUnit {
  if (units <= 0) return { decimals, scaledAmount: 0, value: formatScaled(0, decimals) };
  const scale = BigInt(10 ** decimals);
  const scaled = Number(roundDiv(BigInt(total) * scale, BigInt(units * 100)));
  return { decimals, scaledAmount: scaled, value: formatScaled(scaled, decimals) };
}

export function computeDistribution(input: DistributionEngineInput): DistributionComputationResult {
  const findings: Finding[] = [];
  const taxableSpecifiedIncome = input.income.taxableSpecifiedIncome;
  const otherTrusteeTaxableIncome = input.income.otherTrusteeTaxableIncome ?? 0;
  const taxExemptIncome = input.income.taxExemptIncome ?? 0;
  const capitalDistributionPool = input.income.capitalDistributionPool ?? 0;
  const taxableSpecifiedIncomeDistributed = mulBps(taxableSpecifiedIncome, input.policy.taxableIncomePayoutBps);
  const otherTrusteeTaxableIncomeDistributed = mulBps(otherTrusteeTaxableIncome, input.policy.taxableIncomePayoutBps);
  const taxExemptIncomeDistributed = mulBps(taxExemptIncome, input.policy.taxExemptIncomePayoutBps);
  const capitalDistributionDistributed = mulBps(capitalDistributionPool, input.policy.capitalReleaseBps);
  const sourceInput: ReitIncomeInput = {
    distributionDate: input.distributionDate,
    taxableSpecifiedIncome,
    taxableSpecifiedIncomeDistributed,
    otherTrusteeTaxableIncome,
    otherTrusteeTaxableIncomeDistributed,
    taxExemptIncome,
    taxExemptIncomeDistributed,
    capitalDistributionPool,
    capitalDistributionDistributed,
    trusteeTaxRateBps: input.income.trusteeTaxRateBps,
    distributedWithinSameYear: input.income.distributedWithinSameYear,
    lastQuarterDistributionWithinThreeMonths: input.income.lastQuarterDistributionWithinThreeMonths,
    rollOverAdjustments: input.income.rollOverAdjustments,
  };
  const reitTaxResult = computeReitTax(sourceInput);
  if (input.unitsOutstanding <= 0) {
    findings.push({ id: "DISTRIBUTION.UNITS_REQUIRED", severity: "ERROR", message: "Units outstanding must be positive." });
  }
  return {
    policy: input.policy,
    declaredAmount: reitTaxResult.composition.totalDistribution,
    distributionPerUnit: computePerUnit(reitTaxResult.composition.totalDistribution, input.unitsOutstanding, input.policy.dpuDecimals),
    reitTaxResult,
    sourceInput,
    findings: [...findings, ...reitTaxResult.findings],
  };
}

function stableSortedHolders(unitholders: readonly UnitholderRecord[]): UnitholderRecord[] {
  return [...unitholders].sort((a, b) => a.holderRef.localeCompare(b.holderRef) || a.maskedId.localeCompare(b.maskedId));
}

export function allocateToUnitholders(input: UnitholderAllocationInput): AllocationResult {
  const findings: Finding[] = [];
  const holders = stableSortedHolders(input.unitholders);
  const unitsOutstanding = input.unitsOutstanding ?? holders.reduce((total, holder) => total + holder.unitsHeld, 0);
  const holderUnits = holders.map((holder) => holder.unitsHeld);
  if (unitsOutstanding !== holderUnits.reduce((a, b) => a + b, 0)) {
    findings.push({
      id: "DISTRIBUTION.UNITS_MISMATCH",
      severity: "WARNING",
      message: "Supplied units outstanding does not equal the sum of units held; the holder register is used for residual allocation.",
      data: { unitsOutstanding, registerUnits: holderUnits.reduce((a, b) => a + b, 0) },
    });
  }
  const composition = input.distribution.reitTaxResult.composition;
  const transparentParts = allocate(composition.transparentTaxableDistribution, holderUnits);
  const trusteeTaxedParts = allocate(composition.trusteeTaxedDistribution, holderUnits);
  const taxExemptParts = allocate(composition.taxExemptDistribution, holderUnits);
  const capitalParts = allocate(composition.capitalDistribution, holderUnits);
  const allocations = holders.map((holder, index) => {
    const investorTax = determineReitInvestorTax({
      distributionDate: input.distribution.sourceInput.distributionDate,
      investorClass: holder.investorClass,
      declarationStatus: holder.declarationStatus,
      fundExemptionSection: holder.fundExemptionSection,
      throughSingaporePartnership: holder.throughSingaporePartnership,
      fromTradeBusinessOrProfession: holder.fromTradeBusinessOrProfession,
    });
    const transparentTaxableDistribution = transparentParts[index] ?? 0;
    const trusteeTaxedDistribution = trusteeTaxedParts[index] ?? 0;
    const taxExemptDistribution = taxExemptParts[index] ?? 0;
    const capitalDistribution = capitalParts[index] ?? 0;
    const grossDistribution = transparentTaxableDistribution + trusteeTaxedDistribution + taxExemptDistribution + capitalDistribution;
    const taxDeducted = investorTax.withholdingApplies ? mulBps(transparentTaxableDistribution, investorTax.withholdingRateBps) : 0;
    return {
      holderRef: holder.holderRef,
      maskedId: holder.maskedId,
      unitsHeld: holder.unitsHeld,
      investorClass: holder.investorClass,
      residency: holder.residency,
      declarationStatus: holder.declarationStatus,
      grossDistribution,
      transparentTaxableDistribution,
      trusteeTaxedDistribution,
      taxExemptDistribution,
      capitalDistribution,
      withholdingRateBps: investorTax.withholdingRateBps,
      taxDeducted,
      netCashPaid: grossDistribution - taxDeducted,
      taxTreatmentRemark: investorTax.remark,
    } satisfies UnitholderAllocation;
  });
  return {
    allocations,
    totals: {
      grossDistribution: allocations.reduce((a, b) => a + b.grossDistribution, 0),
      taxDeducted: allocations.reduce((a, b) => a + b.taxDeducted, 0),
      netCashPaid: allocations.reduce((a, b) => a + b.netCashPaid, 0),
    },
    findings,
  };
}

export function buildUnitholderStatement(allocation: UnitholderAllocation, distributionDate: ISODate): UnitholderStatement {
  const notes: string[] = [allocation.taxTreatmentRemark];
  if (allocation.capitalDistribution > 0) {
    notes.push("Return of capital should generally reduce the unitholder's cost base; if it exceeds cost, the excess can become taxable trading income.");
  }
  return {
    holderRef: allocation.holderRef,
    maskedId: allocation.maskedId,
    unitsHeld: allocation.unitsHeld,
    distributionDate,
    grossDistribution: allocation.grossDistribution,
    netCashPaid: allocation.netCashPaid,
    breakdown: [
      { component: "Tax-transparent taxable distribution", amount: allocation.transparentTaxableDistribution },
      { component: "Distribution out of trustee-taxed income", amount: allocation.trusteeTaxedDistribution },
      { component: "Tax-exempt distribution", amount: allocation.taxExemptDistribution },
      { component: "Return of capital", amount: allocation.capitalDistribution, note: allocation.capitalDistribution > 0 ? "Reduce cost base." : undefined },
    ],
    taxDeducted: allocation.taxDeducted,
    withholdingRateBps: allocation.withholdingRateBps,
    notes,
  };
}

export function reconcileWithholding(input: WithholdingReconciliationInput): WithholdingReconciliationResult {
  const deductedPerRegister = input.allocation.totals.taxDeducted;
  const variance = input.amountRemittedToIras - deductedPerRegister;
  const findings: Finding[] = [];
  if (variance !== 0) {
    findings.push({
      id: "DISTRIBUTION.WHT_VARIANCE",
      severity: "WARNING",
      message: "Tax deducted per statements does not equal the amount remitted to IRAS.",
      data: { deductedPerRegister, amountRemittedToIras: input.amountRemittedToIras, variance },
    });
  }
  if (input.statementsIssued !== input.allocation.allocations.length) {
    findings.push({
      id: "DISTRIBUTION.STATEMENT_COUNT",
      severity: "WARNING",
      message: "The number of statements issued does not equal the number of allocated holders.",
      data: { statementsIssued: input.statementsIssued, expectedStatements: input.allocation.allocations.length },
    });
  }
  return { deductedPerRegister, amountRemittedToIras: input.amountRemittedToIras, statementsIssued: input.statementsIssued, expectedStatements: input.allocation.allocations.length, variance, findings };
}

export function modelScenarios(input: ScenarioModelInput): ScenarioModelResult[] {
  return input.policies.map((policy) => {
    const result = computeDistribution({ distributionDate: input.distributionDate, unitsOutstanding: input.unitsOutstanding, income: input.income, policy });
    return {
      label: policy.label ?? policy.id ?? `Policy ${policy.taxableIncomePayoutBps}`,
      declaredAmount: result.declaredAmount,
      distributionPerUnit: result.distributionPerUnit.value,
      trusteeTax: result.reitTaxResult.trusteeTax,
      retainedSpecifiedIncome: result.reitTaxResult.retainedSpecifiedIncome,
      transparencyPass: result.reitTaxResult.passesTransparencyTest,
    };
  });
}

export const RULES = [
  {
    id: "reit-distribution.policy-allocation.2022-plus",
    domain: "REIT_TAX",
    title: "REIT distribution policy, holder allocation and withholding reconciliation",
    summary:
      "The engine allocates declared REIT distributions across tax-transparent, trustee-taxed, tax-exempt and capital buckets, then allocates those amounts across holders with deterministic largest-remainder cents reconciliation and investor-class withholding.",
    effectiveFrom: "2022-01-01",
    sources: [
      { title: "IRAS | Income Tax Treatment of REITs and Approved Sub-Trusts (Twelfth Edition)", url: "https://www.iras.gov.sg/docs/default-source/e-tax/e-taxguide_income-tax-treatment-of-reits-and-approved-sub-trusts.pdf", retrieved: "2026-10-09", publisher: "IRAS" },
    ],
    confidence: "VERIFIED",
    notes:
      "Per-holder rounding is a product-engine policy choice rather than an IRAS formula. The engine uses largest-remainder allocation so totals always reconcile exactly to the declared cents.",
  },
] as const satisfies readonly RuleEntry[];

export const NOTES = [ENGINE_DISCLAIMER];
