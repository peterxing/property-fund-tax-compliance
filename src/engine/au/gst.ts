import { addDays, addMonths, addYears, compareISO, diffDays, monthOf, parseISO, toISO, type ISODate } from "../dates.ts";
import type { Bps, Cents } from "../money.ts";
import { floorToDollar, mulBps, mulRatio, ratioBps } from "../money.ts";
import type { ComputationLine, Finding } from "../types.ts";
import type { Effective, RuleEntry } from "../rules.ts";
import { ENGINE_DISCLAIMER_AU } from "../rules.ts";
import { calculateAuBasDueDate } from "./calendar.ts";
import { AU_GST_CODES, lookupAuGstCode, type AuBasLabel, type AuGstCodeId, type AuGstCodeDefinition } from "./gstCodes.ts";

export type AuGstAccountingMethod = "CASH" | "NON_CASH";
export type AuBasReportingMethod = "FULL" | "SIMPLER_BAS" | "GST_INSTALLMENTS";
export type AuEntitySize = "SMALL" | "MEDIUM" | "LARGE" | "SIGNIFICANT_GLOBAL_ENTITY";
export type AuPropertyKind = "COMMERCIAL" | "NEW_RESIDENTIAL" | "EXISTING_RESIDENTIAL" | "RESIDENTIAL_RENT" | "COMMERCIAL_RESIDENTIAL" | "POTENTIAL_RESIDENTIAL_LAND";

export interface AuGstLedgerTransaction {
  date: ISODate;
  taxCode: AuGstCodeId | string;
  netAmount: Cents;
  gstAmount: Cents;
  amountBasis?: "GST_EXCLUSIVE" | "GST_INCLUSIVE";
  description?: string;
  invoiceDate?: ISODate;
  paymentDate?: ISODate;
  originalDate?: ISODate;
  hasTaxInvoice?: boolean;
  manualBasLabels?: Partial<Record<AuBasLabel, Cents>>;
}

export interface BuildAuBasInput {
  periodStart: ISODate;
  periodEnd: ISODate;
  accountingMethod: AuGstAccountingMethod;
  reportingCycle: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  transactions: readonly AuGstLedgerTransaction[];
  reportingMethod?: AuBasReportingMethod;
  gstTurnoverCents?: Cents;
  usesGstInstalments?: boolean;
  taxAgentConcession?: boolean;
  toleranceCents?: Cents;
  showAmountsAsGstInclusive?: boolean;
}

export interface AuBasLabels {
  g1TotalSales: Cents;
  g2ExportSales: Cents;
  g3OtherGstFreeSales: Cents;
  g4InputTaxedSales: Cents;
  g10CapitalPurchases: Cents;
  g11NonCapitalPurchases: Cents;
  label1aGstOnSales: Cents;
  label1bGstOnPurchases: Cents;
}

export interface AuBasResult {
  labels: AuBasLabels;
  reportedLabels: Partial<Record<AuBasLabel, Cents>>;
  requiredLabels: readonly AuBasLabel[];
  reportingMethod: AuBasReportingMethod;
  dueDate: ISODate;
  netAmount: Cents;
  payable: Cents;
  refundable: Cents;
  findings: Finding[];
  lines: ComputationLine[];
  notes: string[];
}

export interface AuPropertySupplyClassificationInput {
  date: ISODate;
  transactionType: "SALE" | "LEASE" | "MANAGEMENT_FEE" | "SERVICE_CHARGE";
  propertyKind?: AuPropertyKind;
  qualifiesAsGoingConcern?: boolean;
  useMarginScheme?: boolean;
}

export interface AuPropertySupplyClassificationResult {
  suggestedTaxCode: AuGstCodeId;
  legalBasis: string;
  caveat?: string;
}

export interface AuMarginSchemeInput {
  saleDate: ISODate;
  salePrice: Cents;
  method: "CONSIDERATION" | "VALUATION";
  purchasePrice?: Cents;
  valuationAmount?: Cents;
}

export interface AuMarginSchemeResult {
  margin: Cents;
  gstPayable: Cents;
  basG1Amount: Cents;
  lines: ComputationLine[];
  notes: string[];
}

export interface AuGstWithholdingInput {
  contractDate: ISODate;
  contractPrice: Cents;
  supplyType: "FULLY_TAXABLE" | "MARGIN_SCHEME" | "ASSOCIATE_MARKET_VALUE";
  marketValueExGst?: Cents;
  isNewResidentialPremises?: boolean;
  isPotentialResidentialLand?: boolean;
  isCommercialResidentialPremises?: boolean;
  isCommercialProperty?: boolean;
  createdThroughSubstantialRenovations?: boolean;
  purchaserRegisteredForGst?: boolean;
  purchaserAcquiringForCreditablePurpose?: boolean;
  supplierRegisteredOrRequired?: boolean;
}

export interface AuGstWithholdingResult {
  withholdingRequired: boolean;
  amount: Cents;
  reason: string;
  notes: string[];
}

export interface AuInputTaxApportionmentInput {
  taxableSupplies: Cents;
  gstFreeSupplies: Cents;
  inputTaxedSupplies: Cents;
  directCreditableGst: Cents;
  directBlockedGst: Cents;
  residualGst: Cents;
  overrideCreditableUseBps?: Bps;
}

export interface AuInputTaxApportionmentResult {
  creditableUseBps: Bps;
  claimableGst: Cents;
  blockedGst: Cents;
  findings: Finding[];
}

export interface AuDiv129AdjustmentInput {
  purchaseValueExGst: Cents;
  fullInputTaxCredit: Cents;
  previousCreditableUseBps: Bps;
  actualCreditableUseBps: Bps;
  financeRelated?: boolean;
  adjustmentPeriodIndex: number;
}

export interface AuDiv129AdjustmentResult {
  applies: boolean;
  kind: "INCREASING" | "DECREASING" | "NONE";
  amount: Cents;
  maximumAdjustmentPeriods: number;
  findings: Finding[];
}

export interface AuGstRegistrationAssessmentInput {
  assessmentDate: ISODate;
  currentGstTurnover?: Cents;
  projectedGstTurnover?: Cents;
  nonProfit?: boolean;
  providesTaxiOrRideSourcing?: boolean;
  wantsFuelTaxCredits?: boolean;
}

export interface AuGstRegistrationAssessmentResult {
  registrationRequired: boolean;
  threshold: Cents;
  basis: "CURRENT" | "PROJECTED" | "SPECIAL_CATEGORY" | null;
  registerBy?: ISODate;
  findings: Finding[];
}

export interface AuFailureToLodgePenaltyInput {
  dueDate: ISODate;
  lodgedDate: ISODate;
  entitySize: AuEntitySize;
  penaltyDate?: ISODate;
}

export interface AuFailureToLodgePenaltyResult {
  penalty: Cents;
  penaltyUnits: number;
  periodsLate: number;
}

export interface AuGeneralInterestChargeInput {
  principal: Cents;
  dueDate: ISODate;
  paidDate: ISODate;
}

export interface AuGeneralInterestChargeResult {
  interest: Cents;
  daysLate: number;
  endingBalance: Cents;
}

export const AU_GST_ACCOUNTING_METHODS = [
  { id: "CASH", label: "Cash basis", description: "GST is attributed to the BAS period in which payment is received or made." },
  { id: "NON_CASH", label: "Non-cash (accruals)", description: "GST is attributed when an invoice is issued or received, or payment occurs, whichever happens first." },
] as const;

export const AU_BAS_REPORTING_METHODS = [
  { id: "FULL", label: "Full reporting", description: "Current full BAS GST reporting with G1, G2, G3, G10, G11, 1A and 1B." },
  { id: "SIMPLER_BAS", label: "Simpler BAS", description: "Current simplified GST reporting with G1, 1A and 1B only." },
  { id: "GST_INSTALLMENTS", label: "GST instalments", description: "Quarterly instalments with annual actual GST reporting; this helper returns actual GST amounts, not instalment label 1H." },
] as const;

export const AU_ENTITY_SIZES = [
  { id: "SMALL", label: "Individual / small withholder", description: "Base failure-to-lodge multiplier of 1." },
  { id: "MEDIUM", label: "Medium withholder", description: "Base failure-to-lodge multiplier of 2." },
  { id: "LARGE", label: "Large withholder", description: "Base failure-to-lodge multiplier of 5." },
  { id: "SIGNIFICANT_GLOBAL_ENTITY", label: "Significant global entity", description: "Base failure-to-lodge multiplier of 500." },
] as const;

const GST_RATE_BY_DATE: readonly Effective<Bps>[] = [{ from: "2000-07-01", value: 1_000 }];

const FTL_PENALTY_UNIT_ROWS: readonly Effective<number>[] = [
  { from: "2026-07-01", value: 364 },
  { from: "2024-11-07", to: "2026-06-30", value: 330 },
  { from: "2023-07-01", to: "2024-11-06", value: 313 },
];

const GIC_RATES = [
  { from: "2024-07-01", to: "2024-09-30", annualRateBps: 1_136, dailyRateScaled: 3_103_825n },
  { from: "2024-10-01", to: "2024-12-31", annualRateBps: 1_138, dailyRateScaled: 3_109_290n },
  { from: "2025-01-01", to: "2025-03-31", annualRateBps: 1_142, dailyRateScaled: 3_128_767n },
  { from: "2025-04-01", to: "2025-06-30", annualRateBps: 1_117, dailyRateScaled: 3_060_274n },
  { from: "2025-07-01", to: "2025-09-30", annualRateBps: 1_078, dailyRateScaled: 2_953_425n },
  { from: "2025-10-01", to: "2025-12-31", annualRateBps: 1_061, dailyRateScaled: 2_906_849n },
  { from: "2026-01-01", to: "2026-03-31", annualRateBps: 1_065, dailyRateScaled: 2_917_808n },
  { from: "2026-04-01", to: "2026-06-30", annualRateBps: 1_096, dailyRateScaled: 3_002_740n },
  { from: "2026-07-01", to: "2026-09-30", annualRateBps: 1_143, dailyRateScaled: 3_131_507n },
  { from: "2026-10-01", annualRateBps: 1_151, dailyRateScaled: 3_153_425n },
] as const;

const REPORTABLE_FULL: readonly AuBasLabel[] = ["G1", "G2", "G3", "G10", "G11", "1A", "1B"];
const REPORTABLE_SIMPLER: readonly AuBasLabel[] = ["G1", "1A", "1B"];
const RATE_SCALE = 10_000_000_000n;

function abs(n: number): number {
  return n < 0 ? -n : n;
}

function requireGstCode(code: string, date: ISODate): AuGstCodeDefinition {
  const found = lookupAuGstCode(code, date);
  if (!found) throw new RangeError(`Unknown AU GST code ${code} for ${date}`);
  return found;
}

function resolveReportingDate(tx: AuGstLedgerTransaction, code: AuGstCodeDefinition, accountingMethod: AuGstAccountingMethod): ISODate {
  const invoiceDate = tx.invoiceDate ?? tx.date;
  const paymentDate = tx.paymentDate ?? tx.date;
  if (accountingMethod === "CASH") return paymentDate;
  if (code.side === "SUPPLY") return compareISO(invoiceDate, paymentDate) <= 0 ? invoiceDate : paymentDate;
  return compareISO(invoiceDate, paymentDate) <= 0 ? invoiceDate : paymentDate;
}

function inPeriod(date: ISODate, periodStart: ISODate, periodEnd: ISODate): boolean {
  return compareISO(date, periodStart) >= 0 && compareISO(date, periodEnd) <= 0;
}

function expectedGst(tx: AuGstLedgerTransaction, code: AuGstCodeDefinition): Cents | null {
  if (code.rateModel === "ZERO" || code.rateModel === "MANUAL") return code.rateModel === "ZERO" ? 0 : null;
  if (code.rateModel === "STANDARD_10") return mulBps(tx.netAmount, gstRateByDate(tx.date));
  return mulRatio(tx.netAmount, 1, 11);
}

function ignoreCents(amount: Cents): Cents {
  return amount < 0 ? -floorToDollar(-amount) : floorToDollar(amount);
}

interface PreparedTransactionAmounts {
  amountBasis: "GST_EXCLUSIVE" | "GST_INCLUSIVE";
  inferredInclusive: boolean;
  gstExclusiveAmount: Cents;
  gstInclusiveAmount: Cents;
}

function inferAmountBasis(tx: AuGstLedgerTransaction, code: AuGstCodeDefinition, tolerance: Cents): "GST_EXCLUSIVE" | "GST_INCLUSIVE" {
  if (tx.amountBasis) return tx.amountBasis;
  if (code.rateModel !== "STANDARD_10" || tx.gstAmount <= 0) return "GST_EXCLUSIVE";
  const impliedInclusiveGst = mulRatio(tx.netAmount, 1, 11);
  return abs(impliedInclusiveGst - tx.gstAmount) <= tolerance ? "GST_INCLUSIVE" : "GST_EXCLUSIVE";
}

function prepareTransactionAmounts(tx: AuGstLedgerTransaction, code: AuGstCodeDefinition, tolerance: Cents): PreparedTransactionAmounts {
  const amountBasis = inferAmountBasis(tx, code, tolerance);
  if (code.rateModel !== "STANDARD_10") {
    return {
      amountBasis,
      inferredInclusive: tx.amountBasis === undefined && amountBasis === "GST_INCLUSIVE",
      gstExclusiveAmount: tx.netAmount,
      gstInclusiveAmount: tx.netAmount,
    };
  }

  if (amountBasis === "GST_INCLUSIVE") {
    return {
      amountBasis,
      inferredInclusive: tx.amountBasis === undefined,
      gstExclusiveAmount: tx.netAmount - tx.gstAmount,
      gstInclusiveAmount: tx.netAmount,
    };
  }

  return {
    amountBasis,
    inferredInclusive: false,
    gstExclusiveAmount: tx.netAmount,
    gstInclusiveAmount: tx.netAmount + tx.gstAmount,
  };
}

function labelAmountForTransaction(
  tx: AuGstLedgerTransaction,
  code: AuGstCodeDefinition,
  label: AuBasLabel,
  prepared: PreparedTransactionAmounts,
  showAmountsAsGstInclusive: boolean,
): Cents {
  if (label === "1A" || label === "1B") return tx.gstAmount;
  if (label === "G1" || label === "G10" || label === "G11") {
    if (code.rateModel === "STANDARD_10") return showAmountsAsGstInclusive ? prepared.gstInclusiveAmount : prepared.gstExclusiveAmount;
    return tx.netAmount;
  }
  return tx.netAmount;
}

function deriveReportingMethod(input: BuildAuBasInput): AuBasReportingMethod {
  if (input.reportingMethod) return input.reportingMethod;
  if (input.usesGstInstalments) return "GST_INSTALLMENTS";
  if ((input.gstTurnoverCents ?? 0) >= 1_000_000_000) return "FULL";
  return "SIMPLER_BAS";
}

function reportableLabels(method: AuBasReportingMethod): readonly AuBasLabel[] {
  return method === "FULL" ? REPORTABLE_FULL : REPORTABLE_SIMPLER;
}

function attributionBaseDate(tx: AuGstLedgerTransaction, accountingMethod: AuGstAccountingMethod): ISODate {
  if (accountingMethod === "CASH") return tx.originalDate ?? tx.paymentDate ?? tx.date;
  const invoiceDate = tx.originalDate ?? tx.invoiceDate ?? tx.date;
  const paymentDate = tx.paymentDate ?? tx.date;
  return compareISO(invoiceDate, paymentDate) <= 0 ? invoiceDate : paymentDate;
}

function periodEndForDate(date: ISODate, cycle: BuildAuBasInput["reportingCycle"]): ISODate {
  const { y, m } = parseISO(date);
  if (cycle === "MONTHLY") return toQuarterEndOrMonth(y, m, "MONTHLY");
  if (cycle === "ANNUAL") return toISO(m >= 7 ? y + 1 : y, 6, 30);
  return toQuarterEndOrMonth(y, m, "QUARTERLY");
}

function toQuarterEndOrMonth(year: number, month: number, cycle: "MONTHLY" | "QUARTERLY"): ISODate {
  if (cycle === "MONTHLY") return month === 12 ? `${year}-12-31` : `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
  const quarterEndMonth = month <= 3 ? 3 : month <= 6 ? 6 : month <= 9 ? 9 : 12;
  return toISO(year, quarterEndMonth, new Date(Date.UTC(year, quarterEndMonth, 0)).getUTCDate());
}

function findCurrentBasDueDate(input: BuildAuBasInput): ISODate {
  return calculateAuBasDueDate({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    frequency: input.reportingCycle,
    taxAgentConcession: input.taxAgentConcession,
    annualTurnoverCents: input.gstTurnoverCents ?? 0,
  });
}

function findFirstClaimableDueDate(tx: AuGstLedgerTransaction, input: BuildAuBasInput): ISODate {
  const firstDate = attributionBaseDate(tx, input.accountingMethod);
  const firstPeriodEnd = periodEndForDate(firstDate, input.reportingCycle);
  const firstPeriodStart = input.reportingCycle === "ANNUAL" ? toISO(parseISO(firstPeriodEnd).y - 1, 7, 1) : input.reportingCycle === "QUARTERLY" ? addDays(addMonths(firstPeriodEnd, -3), 1) : addDays(addMonths(firstPeriodEnd, -1), 1);
  return calculateAuBasDueDate({ periodStart: firstPeriodStart, periodEnd: firstPeriodEnd, frequency: input.reportingCycle, taxAgentConcession: input.taxAgentConcession, annualTurnoverCents: input.gstTurnoverCents ?? 0 });
}

function latestInputTaxClaimDate(tx: AuGstLedgerTransaction, input: BuildAuBasInput): ISODate {
  return addYears(findFirstClaimableDueDate(tx, input), 4);
}

export function gstRateByDate(date: ISODate): Bps {
  if (compareISO(date, "2000-07-01") < 0) throw new RangeError(`Australian GST did not apply before 2000-07-01, got ${date}`);
  return GST_RATE_BY_DATE[0]!.value;
}

export function classifyAuPropertySupply(input: AuPropertySupplyClassificationInput): AuPropertySupplyClassificationResult {
  if (input.transactionType === "MANAGEMENT_FEE" || input.transactionType === "SERVICE_CHARGE") {
    return { suggestedTaxCode: "SALE_TAXABLE", legalBasis: "Property-management fees and service charges are ordinary taxable supplies at 10%." };
  }
  if (input.qualifiesAsGoingConcern && input.transactionType === "SALE") {
    return { suggestedTaxCode: "SALE_GST_FREE_GOING_CONCERN", legalBasis: "A sale of a going concern is GST-free where the sale is for consideration, the purchaser is registered or required to be registered, and the parties agree in writing.", caveat: "The caller must confirm the statutory going-concern conditions." };
  }
  switch (input.propertyKind) {
    case "RESIDENTIAL_RENT":
      return { suggestedTaxCode: "SALE_INPUT_TAXED_RESIDENTIAL_RENT", legalBasis: "Rent of residential premises for residential accommodation is input taxed." };
    case "EXISTING_RESIDENTIAL":
      return { suggestedTaxCode: "SALE_INPUT_TAXED_EXISTING_RESIDENTIAL", legalBasis: "Sales of existing residential premises are generally input taxed." };
    case "NEW_RESIDENTIAL":
      return input.useMarginScheme
        ? { suggestedTaxCode: "SALE_MARGIN_SCHEME", legalBasis: "Sale of new residential premises is taxable; where the margin scheme is validly chosen, GST is calculated as 1/11 of the margin.", caveat: "A written margin-scheme agreement is required before settlement." }
        : { suggestedTaxCode: "SALE_TAXABLE_NEW_RESIDENTIAL", legalBasis: "Sale of new residential premises is generally a taxable supply." };
    case "COMMERCIAL_RESIDENTIAL":
      return input.transactionType === "LEASE"
        ? { suggestedTaxCode: "SALE_TAXABLE_COMMERCIAL_RESIDENTIAL", legalBasis: "Commercial residential premises remain taxable when leased or sold." }
        : { suggestedTaxCode: input.useMarginScheme ? "SALE_MARGIN_SCHEME" : "SALE_TAXABLE_COMMERCIAL_RESIDENTIAL", legalBasis: "Commercial residential premises are generally taxable." };
    case "COMMERCIAL":
    case "POTENTIAL_RESIDENTIAL_LAND":
    default:
      return input.useMarginScheme && input.transactionType === "SALE"
        ? { suggestedTaxCode: "SALE_MARGIN_SCHEME", legalBasis: "Commercial or development-property sale is taxable; where eligible, the margin scheme substitutes margin reporting for the gross sale price.", caveat: "Check margin-scheme eligibility before use." }
        : { suggestedTaxCode: "SALE_TAXABLE", legalBasis: "Commercial leases and commercial-property sales are generally taxable supplies." };
  }
}

export function computeMarginSchemeGst(input: AuMarginSchemeInput): AuMarginSchemeResult {
  const base = input.method === "CONSIDERATION" ? input.purchasePrice : input.valuationAmount;
  if (base === undefined) throw new RangeError(`A ${input.method.toLowerCase()} amount is required.`);
  const margin = Math.max(0, input.salePrice - base);
  const gstPayable = mulRatio(margin, 1, 11);
  return {
    margin,
    gstPayable,
    basG1Amount: margin,
    lines: [
      { code: "AU_GST.MARGIN_SALE_PRICE", label: "Sale price", amount: input.salePrice, kind: "AMOUNT", source: "RULE" },
      { code: "AU_GST.MARGIN_BASE", label: input.method === "CONSIDERATION" ? "Purchase price" : "Approved valuation", amount: -base, kind: "AMOUNT", source: "RULE" },
      { code: "AU_GST.MARGIN", label: "Margin", amount: margin, kind: "SUBTOTAL", source: "RULE" },
      { code: "AU_GST.MARGIN_GST", label: "GST on margin (1/11)", amount: gstPayable, kind: "TOTAL", source: "RULE" },
    ],
    notes: ["Under current ATO margin-scheme examples, G1 reports the margin rather than the gross contract price."],
  };
}

export function computeGstPropertySettlementWithholding(input: AuGstWithholdingInput): AuGstWithholdingResult {
  if (!input.supplierRegisteredOrRequired) return { withholdingRequired: false, amount: 0, reason: "Supplier is not registered or required to be registered for GST.", notes: [] };
  if (input.isCommercialResidentialPremises || input.isCommercialProperty) return { withholdingRequired: false, amount: 0, reason: "Commercial residential premises and commercial property are excluded from GST-at-settlement withholding.", notes: [] };
  if (!input.isNewResidentialPremises && !input.isPotentialResidentialLand) return { withholdingRequired: false, amount: 0, reason: "Only new residential premises and some potential residential land are in scope.", notes: [] };
  if (input.createdThroughSubstantialRenovations) return { withholdingRequired: false, amount: 0, reason: "New residential premises created through substantial renovations are excluded from purchaser withholding.", notes: [] };
  if (input.isPotentialResidentialLand && input.purchaserRegisteredForGst && input.purchaserAcquiringForCreditablePurpose) {
    return { withholdingRequired: false, amount: 0, reason: "Potential residential land supplied to a GST-registered purchaser acquiring it for a creditable purpose is excluded.", notes: [] };
  }
  let amount = 0;
  if (input.supplyType === "FULLY_TAXABLE") amount = Math.floor(input.contractPrice / 11 / 100) * 100;
  else if (input.supplyType === "MARGIN_SCHEME") amount = Math.floor((input.contractPrice * 7) / 100 / 100) * 100;
  else {
    if (input.marketValueExGst === undefined) throw new RangeError("marketValueExGst is required for associate-market-value withholding.");
    amount = Math.floor((input.marketValueExGst * 10) / 100 / 100) * 100;
  }
  return {
    withholdingRequired: true,
    amount,
    reason: "Purchaser withholding applies.",
    notes: ["The ATO states the purchaser generally withholds 1/11 of the contract price for fully taxable supplies, 7% for eligible margin-scheme supplies, or 10% of GST-exclusive market value for low-value associate transactions. Amounts are rounded down to the nearest whole dollar."],
  };
}

export function apportionAuInputTaxCredits(input: AuInputTaxApportionmentInput): AuInputTaxApportionmentResult {
  const numerator = input.taxableSupplies + input.gstFreeSupplies;
  const denominator = numerator + input.inputTaxedSupplies;
  const creditableUseBps = input.overrideCreditableUseBps ?? ratioBps(numerator, denominator);
  const residualClaimable = mulBps(input.residualGst, creditableUseBps);
  const claimableGst = input.directCreditableGst + residualClaimable;
  const blockedGst = input.directBlockedGst + (input.residualGst - residualClaimable);
  return {
    creditableUseBps,
    claimableGst,
    blockedGst,
    findings: denominator === 0 ? [{ id: "AU_GST.APPORTIONMENT_NO_SUPPLIES", severity: "INFO", message: "No supplies were provided, so residual credits default to zero." }] : [],
  };
}

export function computeChangeInCreditablePurposeAdjustment(input: AuDiv129AdjustmentInput): AuDiv129AdjustmentResult {
  if (input.adjustmentPeriodIndex < 1) throw new RangeError(`adjustmentPeriodIndex must be at least 1, got ${input.adjustmentPeriodIndex}`);
  const threshold = input.financeRelated ? 1_000_000 : 100_000;
  if (input.purchaseValueExGst <= threshold) {
    return { applies: false, kind: "NONE", amount: 0, maximumAdjustmentPeriods: 0, findings: [{ id: "AU_GST.DIV129_BELOW_THRESHOLD", severity: "INFO", message: "No Division 129 adjustment is required because the GST-exclusive purchase value is at or below the ATO threshold." }] };
  }
  const maximumAdjustmentPeriods = input.purchaseValueExGst <= 500_000 ? 2 : input.purchaseValueExGst < 50_000_000 ? 5 : 10;
  if (input.adjustmentPeriodIndex > maximumAdjustmentPeriods) {
    return { applies: false, kind: "NONE", amount: 0, maximumAdjustmentPeriods, findings: [{ id: "AU_GST.DIV129_AFTER_FINAL_PERIOD", severity: "INFO", message: "The supplied adjustment period is after the last adjustment period for this acquisition." }] };
  }
  const delta = input.actualCreditableUseBps - input.previousCreditableUseBps;
  if (delta === 0) return { applies: true, kind: "NONE", amount: 0, maximumAdjustmentPeriods, findings: [] };
  const amount = mulBps(input.fullInputTaxCredit, abs(delta));
  return { applies: true, kind: delta < 0 ? "INCREASING" : "DECREASING", amount, maximumAdjustmentPeriods, findings: [] };
}

export function assessAuGstRegistration(input: AuGstRegistrationAssessmentInput): AuGstRegistrationAssessmentResult {
  const threshold = input.nonProfit ? 15_000_000 : 7_500_000;
  const findings: Finding[] = [];
  if (input.providesTaxiOrRideSourcing || input.wantsFuelTaxCredits) {
    findings.push({ id: "AU_GST.REGISTRATION_SPECIAL_CATEGORY", severity: "INFO", message: "Special-category registration applies regardless of turnover." });
    return { registrationRequired: true, threshold, basis: "SPECIAL_CATEGORY", registerBy: addDays(input.assessmentDate, 21), findings };
  }
  if ((input.currentGstTurnover ?? 0) >= threshold) {
    return { registrationRequired: true, threshold, basis: "CURRENT", registerBy: addDays(input.assessmentDate, 21), findings };
  }
  if ((input.projectedGstTurnover ?? 0) >= threshold) {
    return { registrationRequired: true, threshold, basis: "PROJECTED", registerBy: addDays(input.assessmentDate, 21), findings };
  }
  return { registrationRequired: false, threshold, basis: null, findings };
}

export function computeAuFailureToLodgePenalty(input: AuFailureToLodgePenaltyInput): AuFailureToLodgePenaltyResult {
  const lateDays = Math.max(0, diffDays(input.dueDate, input.lodgedDate));
  if (lateDays === 0) return { penalty: 0, penaltyUnits: 0, periodsLate: 0 };
  const periodsLate = Math.min(5, Math.ceil(lateDays / 28));
  const unitValue = FTL_PENALTY_UNIT_ROWS.find((row) => compareISO(input.penaltyDate ?? addDays(input.dueDate, 1), row.from) >= 0 && (!row.to || compareISO(input.penaltyDate ?? addDays(input.dueDate, 1), row.to) <= 0))?.value;
  if (unitValue === undefined) throw new RangeError(`No penalty-unit data for ${input.penaltyDate ?? addDays(input.dueDate, 1)}`);
  const multiplier = input.entitySize === "SMALL" ? 1 : input.entitySize === "MEDIUM" ? 2 : input.entitySize === "LARGE" ? 5 : 500;
  const penaltyUnits = periodsLate * multiplier;
  return { penalty: penaltyUnits * unitValue * 100, penaltyUnits, periodsLate };
}

export function computeAuGeneralInterestCharge(input: AuGeneralInterestChargeInput): AuGeneralInterestChargeResult {
  const daysLate = Math.max(0, diffDays(input.dueDate, input.paidDate));
  if (daysLate === 0) return { interest: 0, daysLate: 0, endingBalance: input.principal };
  let balance = BigInt(input.principal) * RATE_SCALE;
  for (let day = 1; day <= daysLate; day += 1) {
    const currentDate = addDays(input.dueDate, day);
    const rate = GIC_RATES.find((row) => compareISO(currentDate, row.from) >= 0 && (!("to" in row) || compareISO(currentDate, row.to) <= 0));
    if (!rate) throw new RangeError(`No GIC rate data for ${currentDate}`);
    balance = (balance * (RATE_SCALE + rate.dailyRateScaled) + RATE_SCALE / 2n) / RATE_SCALE;
  }
  const endingBalance = Number((balance + RATE_SCALE / 2n) / RATE_SCALE);
  return { interest: endingBalance - input.principal, daysLate, endingBalance };
}

export function buildAuBas(input: BuildAuBasInput): AuBasResult {
  if (compareISO(input.periodStart, input.periodEnd) > 0) throw new RangeError(`periodStart must be on or before periodEnd, got ${input.periodStart} > ${input.periodEnd}`);
  const tolerance = input.toleranceCents ?? 99;
  const reportingMethod = deriveReportingMethod(input);
  const requiredLabels = reportableLabels(reportingMethod);
  const dueDate = findCurrentBasDueDate(input);
  const showAmountsAsGstInclusive = input.showAmountsAsGstInclusive ?? true;
  const labels: AuBasLabels = { g1TotalSales: 0, g2ExportSales: 0, g3OtherGstFreeSales: 0, g4InputTaxedSales: 0, g10CapitalPurchases: 0, g11NonCapitalPurchases: 0, label1aGstOnSales: 0, label1bGstOnPurchases: 0 };
  const findings: Finding[] = [];
  const workingLines: ComputationLine[] = [];

  for (const [index, tx] of input.transactions.entries()) {
    const code = requireGstCode(String(tx.taxCode), tx.date);
    const reportingDate = resolveReportingDate(tx, code, input.accountingMethod);
    if (!inPeriod(reportingDate, input.periodStart, input.periodEnd)) continue;

    const prepared = prepareTransactionAmounts(tx, code, tolerance);
    const expected = code.rateModel === "STANDARD_10" ? mulBps(prepared.gstExclusiveAmount, gstRateByDate(tx.date)) : expectedGst(tx, code);
    if (expected !== null && abs(expected - tx.gstAmount) > tolerance) {
      findings.push({ id: "AU_GST.RATE_MISMATCH", severity: "WARNING", message: `GST amount does not match the expected amount for ${code.id}.`, subject: code.id, data: { expected, actual: tx.gstAmount, tolerance } });
    }

    if (code.side === "PURCHASE" && code.claimability !== "NONE" && tx.gstAmount > 0) {
      const thresholdInclusive = 8_250;
      if (prepared.gstInclusiveAmount > thresholdInclusive && tx.hasTaxInvoice === false) {
        findings.push({ id: "AU_GST.MISSING_TAX_INVOICE", severity: "WARNING", message: "A valid tax invoice is required to claim a GST credit on purchases over $82.50 including GST.", subject: code.id });
      }
      if (compareISO(dueDate, latestInputTaxClaimDate(tx, input)) > 0) {
        findings.push({ id: "AU_GST.EXPIRED_INPUT_TAX_CREDIT", severity: "WARNING", message: "The four-year time limit for claiming this GST credit has expired.", subject: code.id });
      }
    }

    const addLabel = (label: AuBasLabel, amount: Cents): void => {
      if (label === "G1") labels.g1TotalSales += amount;
      else if (label === "G2") labels.g2ExportSales += amount;
      else if (label === "G3") labels.g3OtherGstFreeSales += amount;
      else if (label === "G4") labels.g4InputTaxedSales += amount;
      else if (label === "G10") labels.g10CapitalPurchases += amount;
      else if (label === "G11") labels.g11NonCapitalPurchases += amount;
      else if (label === "1A") labels.label1aGstOnSales += amount;
      else labels.label1bGstOnPurchases += amount;
    };

    if (tx.manualBasLabels) {
      for (const [label, amount] of Object.entries(tx.manualBasLabels) as [AuBasLabel, Cents][]) addLabel(label, amount);
      workingLines.push({ code: `AU_BAS.TX${index + 1}.MANUAL`, label: tx.description ?? code.label, amount: 0, kind: "HEADING", source: "MANUAL_ADJUSTMENT", note: "Manual BAS label override supplied by caller." });
      for (const [label, amount] of Object.entries(tx.manualBasLabels) as [AuBasLabel, Cents][]) {
        workingLines.push({ code: `AU_BAS.TX${index + 1}.${label}`, label: `${label} manual amount`, amount, kind: "AMOUNT", source: "MANUAL_ADJUSTMENT" });
      }
    } else {
      workingLines.push({ code: `AU_BAS.TX${index + 1}.HEADER`, label: tx.description ?? code.label, amount: 0, kind: "HEADING", source: "RULE", note: prepared.inferredInclusive ? "GST-inclusive amount inferred because GST matched one-eleventh of the supplied amount." : undefined });
      if (code.rateModel === "STANDARD_10") {
        workingLines.push({ code: `AU_BAS.TX${index + 1}.EX_GST`, label: "GST-exclusive working amount", amount: prepared.gstExclusiveAmount, kind: "AMOUNT", source: "RULE" });
        workingLines.push({ code: `AU_BAS.TX${index + 1}.GST`, label: "GST component", amount: tx.gstAmount, kind: "AMOUNT", source: "RULE" });
        workingLines.push({ code: `AU_BAS.TX${index + 1}.IN_GST`, label: "GST-inclusive working amount", amount: prepared.gstInclusiveAmount, kind: "SUBTOTAL", source: "RULE" });
      }
      for (const label of code.basLabels) {
        const amount = labelAmountForTransaction(tx, code, label, prepared, showAmountsAsGstInclusive);
        addLabel(label, amount);
        workingLines.push({
          code: `AU_BAS.TX${index + 1}.${label}`,
          label: `${label} contribution`,
          amount,
          kind: "AMOUNT",
          source: "RULE",
          note:
            label === "G1" || label === "G10" || label === "G11"
              ? showAmountsAsGstInclusive
                ? "BAS-facing amount shown GST-inclusive."
                : "Caller chose GST-exclusive BAS label amounts."
              : undefined,
        });
      }
    }
  }

  const reportedLabels: Partial<Record<AuBasLabel, Cents>> = {};
  for (const label of requiredLabels) {
    reportedLabels[label] = ignoreCents(
      label === "G1" ? labels.g1TotalSales :
      label === "G2" ? labels.g2ExportSales :
      label === "G3" ? labels.g3OtherGstFreeSales :
      label === "G4" ? labels.g4InputTaxedSales :
      label === "G10" ? labels.g10CapitalPurchases :
      label === "G11" ? labels.g11NonCapitalPurchases :
      label === "1A" ? labels.label1aGstOnSales :
      labels.label1bGstOnPurchases,
    );
  }

  const netAmount = labels.label1aGstOnSales - labels.label1bGstOnPurchases;
  const payable = netAmount > 0 ? netAmount : 0;
  const refundable = netAmount < 0 ? -netAmount : 0;
  const lines: ComputationLine[] = [
    ...workingLines,
    { code: "AU_BAS.G1", label: "G1 Total sales", amount: labels.g1TotalSales, kind: "AMOUNT", source: "RULE" },
    { code: "AU_BAS.G2", label: "G2 Export sales", amount: labels.g2ExportSales, kind: "AMOUNT", source: "RULE" },
    { code: "AU_BAS.G3", label: "G3 Other GST-free sales", amount: labels.g3OtherGstFreeSales, kind: "AMOUNT", source: "RULE" },
    { code: "AU_BAS.G4", label: "G4 Input-taxed sales (platform subtotal)", amount: labels.g4InputTaxedSales, kind: "INFO", source: "RULE", note: "Current ATO BAS forms do not require a standalone G4 field." },
    { code: "AU_BAS.G10", label: "G10 Capital purchases", amount: labels.g10CapitalPurchases, kind: "AMOUNT", source: "RULE" },
    { code: "AU_BAS.G11", label: "G11 Non-capital purchases", amount: labels.g11NonCapitalPurchases, kind: "AMOUNT", source: "RULE" },
    { code: "AU_BAS.1A", label: "1A GST on sales", amount: labels.label1aGstOnSales, kind: "AMOUNT", source: "RULE" },
    { code: "AU_BAS.1B", label: "1B GST on purchases", amount: labels.label1bGstOnPurchases, kind: "AMOUNT", source: "RULE" },
    { code: "AU_BAS.NET", label: netAmount >= 0 ? "Net GST payable" : "Net GST refundable", amount: netAmount >= 0 ? netAmount : -netAmount, kind: "TOTAL", source: "RULE" },
  ];

  const notes = [
    reportingMethod === "FULL" ? "Current full BAS GST reporting uses G1, G2, G3, G10, G11, 1A and 1B." : "Current Simpler BAS GST reporting uses G1, 1A and 1B only.",
    reportingMethod === "GST_INSTALLMENTS" ? "GST instalment label 1H is outside this actual-GST builder and must be handled separately." : "G4 is retained as an internal subtotal for apportionment and review even though it is not a current BAS label.",
    `${showAmountsAsGstInclusive ? "G1, G10 and G11 are shown GST-inclusive by default" : "G1, G10 and G11 are shown GST-exclusive because the caller requested it"}; reportedLabels are whole-dollar BAS figures with cents ignored, while labels keep cent-accurate working amounts.`,
  ];

  return { labels, reportedLabels, requiredLabels, reportingMethod, dueDate, netAmount, payable, refundable, findings, lines, notes };
}

export const RULES = [
  {
    id: "au-gst.rate-and-bas.2026-10-10",
    domain: "AU_GST",
    title: "Australian GST rate and BAS label set",
    summary: "GST is 10% on most taxable supplies from 1 July 2000. Current full BAS reporting uses G1, G2, G3, G10, G11, 1A and 1B; Simpler BAS uses G1, 1A and 1B.",
    effectiveFrom: "2000-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "ATO | Goods and services tax (GST)", url: "https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas/goods-and-services-tax-gst", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | GST reporting methods", url: "https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas/goods-and-services-tax-gst/gst-reporting-methods", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Step 1: Sales", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/completing-your-bas-for-gst/complete-your-bas/step-1-sales", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Step 3: Purchases", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/completing-your-bas-for-gst/complete-your-bas/step-3-purchases", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    notes: "The brief expected a G4 input-taxed BAS label, but the current ATO BAS pages read on 2026-10-10 do not include a current standalone G4 field. The engine therefore keeps G4 only as an internal analytic subtotal. The ATO step pages also allow GST-exclusive G1/G10/G11 amounts under the accounts method if that choice is made; this engine defaults to GST-inclusive BAS amounts unless the caller opts out.",
  },
  {
    id: "au-gst.accounting-methods-and-time-limit.2026-10-10",
    domain: "AU_GST",
    title: "Cash basis, non-cash basis and four-year input-tax-credit limit",
    summary: "Cash-basis GST is attributed when payment is made or received; non-cash GST is attributed when invoice or payment happens first; GST credits generally expire four years after the BAS due date for the first period in which they could have been claimed.",
    effectiveFrom: "2000-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "ATO | Choosing an accounting method", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/accounting-for-gst-in-your-business/choosing-an-accounting-method", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Time limits on GST credits and refunds", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/claiming-gst-credits/time-limits-on-gst-credits-and-refunds", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Tax invoices", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    notes: "The engine applies the ATO's $82.50 tax-invoice threshold and four-year claim limit as validation checks; it does not automatically re-open prior BAS periods.",
  },
  {
    id: "au-gst.property.2026-10-10",
    domain: "AU_GST",
    title: "Property classification, margin scheme, GST at settlement and Division 129",
    summary: "Commercial leases and sales are generally taxable, residential rent and existing residential premises are generally input taxed, new residential premises are generally taxable, and GST at settlement usually requires purchaser withholding on new residential premises and some potential residential land.",
    effectiveFrom: "2000-07-01",
    confidence: "VERIFIED_SECONDARY",
    sources: [
      { title: "ATO | Residential premises", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/when-to-charge-gst-and-when-not-to/input-taxed-sales/residential-premises", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Commercial residential premises and GST", url: "https://www.ato.gov.au/businesses-and-organisations/assets-and-property/property/property-used-in-running-a-business/commercial-residential-premises-and-gst", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | GST-free sales", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/when-to-charge-gst-and-when-not-to/gst-free-sales", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Financial supplies", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/when-to-charge-gst-and-when-not-to/input-taxed-sales/financial-supplies", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Calculating the GST payable", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/your-industry/property/gst-and-the-margin-scheme/calculating-the-gst-payable", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | GST at settlement", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/your-industry/property/gst-at-settlement", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | GST at settlement – a guide for suppliers and their representatives", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/your-industry/property/gst-at-settlement-a-guide-for-suppliers-and-their-representatives", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Types of adjustments", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/managing-gst-in-your-business/reporting-paying-and-activity-statements/making-adjustments-on-your-activity-statements/types-of-adjustments", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    notes: "The residential-rent, existing-residential, new-residential, commercial-residential, going-concern, financial-supply, margin-scheme and withholding categories are supported by the cited ATO pages, but the engine's mixed-supply apportionment is only a simple creditable-purpose proxy rather than an ATO-mandated ratio. Special methods, valuation disputes and bespoke withholding variations remain professional-review matters.",
  },
  {
    id: "au-gst.registration-and-penalties.2026-10-10",
    domain: "AU_GST",
    title: "GST registration threshold, FTL penalty units and GIC",
    summary: "GST registration is generally required once current or projected GST turnover reaches $75,000 ($150,000 for non-profits), failure-to-lodge penalties are based on penalty units per 28 days or part thereof, and GIC compounds daily using quarterly ATO rates.",
    effectiveFrom: "2024-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "ATO | How GST registration works", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Failure to lodge on time penalty", url: "https://www.ato.gov.au/individuals-and-families/paying-the-ato/interest-and-penalties/penalties/failure-to-lodge-on-time-penalty", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Penalty units", url: "https://www.ato.gov.au/individuals-and-families/paying-the-ato/interest-and-penalties/penalties/penalty-units", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | General interest charge", url: "https://www.ato.gov.au/individuals-and-families/paying-the-ato/interest-and-penalties/interest-we-charge/general-interest-charge", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | General interest charge rates", url: "https://www.ato.gov.au/tax-rates-and-codes/general-interest-charge-rates", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    notes: "The penalty helper assumes one penalty-unit value for the penalty event date supplied by the caller. It does not model remission, safe harbour or bespoke compliance discretion.",
  },
] as const satisfies readonly RuleEntry[];

export const NOTES = [ENGINE_DISCLAIMER_AU];
