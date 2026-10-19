import { addDays, addMonths, addYears, compareISO, diffDays, endOfMonth, monthsBetween, parseISO, type ISODate } from "./dates.ts";
import type { Bps, Cents } from "./money.ts";
import { mulBps, ratioBps } from "./money.ts";
import { lookupGstCode, type GstCanonicalCode, type GstCodeDefinition } from "./gstCodes.ts";
import type { RuleEntry } from "./rules.ts";
import { ENGINE_DISCLAIMER } from "./rules.ts";
import type { ComputationLine, Finding, GstFilingFrequency, Jurisdiction, PropertyUse } from "./types.ts";

export interface GstLedgerTransaction {
  date: ISODate;
  documentNo: string;
  counterparty: string;
  taxCode: string;
  netAmount: Cents;
  gstAmount: Cents;
  currency: string;
  propertyRef?: string;
  description?: string;
  contributesToRevenue?: boolean;
  scheme?: "A3PL" | "GMS" | "AMFT" | "MES" | "IGDS";
}

export interface PartialExemptionInput {
  periodStart: ISODate;
  periodEnd: ISODate;
  taxableSupplies: Cents;
  exemptSupplies: Cents;
  regulation33ExemptSupplies?: Cents;
  nonRegulation33ExemptSupplies?: Cents;
  directTaxableInputTax: Cents;
  directReg33InputTax: Cents;
  directExemptInputTax: Cents;
  residualInputTax: Cents;
  overrideRecoverableResidualBps?: Bps;
  overrideClaimableInputTax?: Cents;
  excludedTaxableSuppliesForDeMinimis?: Cents;
  excludedExemptSuppliesForDeMinimis?: Cents;
  periodMonths?: number;
}

export interface PartialExemptionResult {
  deMinimisPass: boolean;
  regulation35Pass: boolean;
  exemptSuppliesPerMonth: Cents;
  exemptSuppliesRatioBps: Bps;
  recoverableResidualBps: Bps;
  claimableInputTax: Cents;
  disallowedInputTax: Cents;
  findings: Finding[];
}

export interface GstReturnAdjustmentClaims {
  touristRefundClaim?: Cents;
  badDebtReliefClaim?: Cents;
  reverseChargeRefundClaim?: Cents;
  preRegistrationInputTaxClaim?: Cents;
}

export interface BuildGstReturnInput {
  periodStart: ISODate;
  periodEnd: ISODate;
  transactions: readonly GstLedgerTransaction[];
  revenue?: Cents;
  partialExemption?: PartialExemptionInput;
  adjustmentClaims?: GstReturnAdjustmentClaims;
  toleranceCents?: Cents;
}

export interface GstF5Boxes {
  box1StandardRatedSupplies: Cents;
  box2ZeroRatedSupplies: Cents;
  box3ExemptSupplies: Cents;
  box4TotalSupplies: Cents;
  box5TaxablePurchases: Cents;
  box6OutputTaxDue: Cents;
  box7InputTaxAndRefundsClaimed: Cents;
  box8NetGst: Cents;
  box9ImportsUnderSuspensionSchemes: Cents;
  box10TouristRefundClaimed: boolean;
  box11BadDebtOrReverseChargeRefundClaimed: boolean;
  box12PreRegistrationInputTaxClaimed: boolean;
  box13Revenue: Cents;
  box14ReverseChargeImportedServicesAndLvg: Cents;
  box15RemoteServicesByMarketplace: Cents;
  box16LvgByMarketplaceOrRedeliverer: Cents;
  box17OwnSupplyOfImportedLvg: Cents;
  box18NetGstBeforeIgds: Cents;
  box19DeferredImportGstPayable: Cents;
  box20TotalTaxAfterIgds: Cents;
  box21IgdsImports: Cents;
}

export interface GstReturnResult {
  boxes: GstF5Boxes;
  lines: ComputationLine[];
  findings: Finding[];
  partialExemption: PartialExemptionResult | null;
  notes: string[];
}

export interface GstRegistrationAssessmentInput {
  assessmentDate: ISODate;
  retrospectiveAnnualTaxableTurnover?: Cents;
  forecastTaxableTurnoverNext12Months?: Cents;
  forecastDate?: ISODate;
}

export interface GstRegistrationAssessmentResult {
  registrationRequired: boolean;
  basis: "RETROSPECTIVE" | "PROSPECTIVE" | null;
  thresholdAmount: Cents;
  applicationDueDate?: ISODate;
  effectiveRegistrationDate?: ISODate;
  findings: Finding[];
}

export interface GstBadDebtReliefInput {
  originalSupplyDate: ISODate;
  paymentDueDate: ISODate;
  writeOffDate: ISODate;
  amountWrittenOff: Cents;
  gstRateDate?: ISODate;
  reasonableRecoveryStepsTaken?: boolean;
}

export interface GstBadDebtReliefResult {
  eligible: boolean;
  claimAmount: Cents;
  findings: Finding[];
}

export interface GstLateFilingPenaltyInput {
  dueDate: ISODate;
  filedDate: ISODate;
}

export interface GstLatePaymentPenaltyInput {
  unpaidTax: Cents;
  dueDate: ISODate;
  paidDate: ISODate;
  /** date IRAS imposed the 5% penalty; defaults to the day after the due date */
  penaltyNoticeDate?: ISODate;
}

export interface PropertySupplyClassificationInput {
  date: ISODate;
  transactionType:
    | "SALE"
    | "LEASE"
    | "AGENT_COMMISSION"
    | "PROPERTY_MANAGEMENT_FEE"
    | "SERVICE_CHARGE"
    | "PREMIUM"
    | "PROPERTY_TAX_RECOVERY"
    | "TRANSFER_OF_GOING_CONCERN"
    | "OVERSEAS_PROPERTY_SUPPLY"
    | "IMPORTED_SERVICE";
  propertyUse?: PropertyUse;
  jurisdiction?: Jurisdiction;
  mixedUseNonResidentialShareBps?: Bps;
  qualifiesAsTransferOfGoingConcern?: boolean;
  buyerAccountsForGstOnReitTransfer?: boolean;
  reverseChargeApplies?: boolean;
}

export interface PropertySupplyClassificationResult {
  suggestedTaxCode: GstCanonicalCode | null;
  splitTreatment?: Array<{ taxCode: GstCanonicalCode; shareBps: Bps; label: string }>;
  legalBasis: string;
  caveat?: string;
}

const GST_RATE_BY_DATE = [
  { from: "1994-04-01", to: "2002-12-31", rateBps: 300 },
  { from: "2003-01-01", to: "2003-12-31", rateBps: 400 },
  { from: "2004-01-01", to: "2007-06-30", rateBps: 500 },
  { from: "2007-07-01", to: "2022-12-31", rateBps: 700 },
  { from: "2023-01-01", to: "2023-12-31", rateBps: 800 },
  { from: "2024-01-01", rateBps: 900 },
] as const;

const PURCHASES_FOR_BOX5 = new Set(["TX", "TXCA", "TXNA", "ZP", "IM", "ME", "IGDS", "TXRC-TS", "TX-ESS", "TXRC-ESS", "IM-ESS", "TX-N33", "TXRC-N33", "IM-N33", "TX-RE", "TXRC-RE", "IM-RE"]);
const DIRECT_TAXABLE_PURCHASE_CODES = new Set(["TX", "TXCA", "IM", "IGDS", "TXRC-TS"]);
const DIRECT_REG33_PURCHASE_CODES = new Set(["TX-ESS", "TXRC-ESS", "IM-ESS"]);
const DIRECT_EXEMPT_PURCHASE_CODES = new Set(["TX-N33", "TXRC-N33", "IM-N33"]);
const RESIDUAL_PURCHASE_CODES = new Set(["TX-RE", "TXRC-RE", "IM-RE"]);
const N1_EXCLUDED_TAXABLE_CODES = new Set(["SRCA-S", "SRCA-C", "SRRC", "SROVR", "SROVR-RS", "SROVR-LVG"]);

function abs(n: number): number {
  return n < 0 ? -n : n;
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function bigint(value: number): bigint {
  return BigInt(Math.trunc(value));
}

function roundHalfUpPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number((bigint(numerator) * 100n + bigint(denominator) / 2n) / bigint(denominator));
}

function lessThanOrEqualRatio(leftNumerator: number, leftDenominator: number, rightNumerator: number, rightDenominator: number): boolean {
  return bigint(leftNumerator) * bigint(leftDenominator) <= bigint(rightNumerator) * bigint(rightDenominator);
}

function expectedGst(definition: GstCodeDefinition, tx: GstLedgerTransaction): Cents {
  if (definition.rateBehavior === "PREVAILING_STANDARD_RATE" || definition.rateBehavior === "IMPORT_GST_DEFERRED") {
    return mulBps(tx.netAmount, gstRateByDate(tx.date));
  }
  return 0;
}

function validateTransaction(tx: GstLedgerTransaction, definition: GstCodeDefinition, tolerance: Cents): Finding[] {
  const findings: Finding[] = [];
  const expected = expectedGst(definition, tx);
  if (abs(expected - tx.gstAmount) > tolerance) {
    findings.push({
      id: "GST.TX.GST_MISMATCH",
      severity: "WARNING",
      message: `GST amount does not match the expected behaviour for code ${definition.code}.`,
      subject: tx.documentNo,
      data: { expectedGst: expected, actualGst: tx.gstAmount },
    });
  }
  if (definition.code === "BL" && tx.gstAmount > 0) {
    findings.push({ id: "GST.TX.BLOCKED_INPUT", severity: "INFO", message: "Blocked-input-tax code detected; GST is not claimable in Box 7.", subject: tx.documentNo, data: { gstAmount: tx.gstAmount } });
  }
  if (tx.currency.toUpperCase() !== "SGD") {
    findings.push({ id: "GST.TX.NON_SGD_ASSUMED_CONVERTED", severity: "INFO", message: "Non-SGD transaction supplied; amounts are assumed already converted into SGD cents for F5 reporting.", subject: tx.documentNo, data: { currency: tx.currency } });
  }
  return findings;
}

export function gstRateByDate(date: ISODate): Bps {
  for (const row of GST_RATE_BY_DATE) {
    if (date >= row.from && (!("to" in row) || row.to === undefined || date <= row.to)) return row.rateBps;
  }
  throw new RangeError(`No GST rate configured for ${date}`);
}

export function computePartialExemption(input: PartialExemptionInput): PartialExemptionResult {
  const findings: Finding[] = [];
  const months = input.periodMonths ?? Math.max(1, monthsBetween(input.periodStart, input.periodEnd) + 1);
  const relevantTaxableSupplies = Math.max(0, input.taxableSupplies - (input.excludedTaxableSuppliesForDeMinimis ?? 0));
  const regulation33ExemptSupplies = Math.max(0, input.regulation33ExemptSupplies ?? 0);
  const nonRegulation33ExemptSupplies = Math.max(0, input.nonRegulation33ExemptSupplies ?? Math.max(0, input.exemptSupplies - regulation33ExemptSupplies));
  const relevantExemptSupplies = Math.max(0, regulation33ExemptSupplies + nonRegulation33ExemptSupplies - (input.excludedExemptSuppliesForDeMinimis ?? 0));
  const relevantTotalSupplies = relevantTaxableSupplies + relevantExemptSupplies;
  const exemptSuppliesPerMonth = months <= 0 ? relevantExemptSupplies : Math.trunc(relevantExemptSupplies / months);
  const exemptSuppliesRatioBps = relevantTotalSupplies === 0 ? 0 : ratioBps(relevantExemptSupplies, relevantTotalSupplies);
  const deMinimisPass = relevantExemptSupplies <= 4_000_000 * months && lessThanOrEqualRatio(relevantExemptSupplies, 100, relevantTotalSupplies, 5);
  const regulation35Pass = relevantTotalSupplies === 0 || lessThanOrEqualRatio(nonRegulation33ExemptSupplies, 100, relevantTotalSupplies, 5);
  const recoveryNumerator = relevantTaxableSupplies + (regulation35Pass ? regulation33ExemptSupplies : 0);
  const roundedRecoverablePercent = relevantTotalSupplies === 0 ? 0 : roundHalfUpPercent(recoveryNumerator, relevantTotalSupplies);
  const recoverableResidualBps = input.overrideRecoverableResidualBps ?? (deMinimisPass ? 10000 : roundedRecoverablePercent * 100);
  const totalInputTax = input.directTaxableInputTax + input.directReg33InputTax + input.directExemptInputTax + input.residualInputTax;
  const claimableInputTax = input.overrideClaimableInputTax
    ?? (deMinimisPass
      ? totalInputTax
      : input.directTaxableInputTax
        + (regulation35Pass ? input.directReg33InputTax : 0)
        + mulBps(input.residualInputTax, recoverableResidualBps));
  const disallowedInputTax = totalInputTax - claimableInputTax;

  if (!regulation35Pass && input.directReg33InputTax > 0) {
    findings.push({ id: "GST.PE.REG35_FAIL", severity: "INFO", message: "The Regulation 35 test fails, so directly attributable input tax on Regulation 33 exempt supplies is not claimable under the standard method." });
  }
  if (!deMinimisPass && input.directExemptInputTax > 0) {
    findings.push({ id: "GST.PE.DIRECT_EXEMPT_BLOCKED", severity: "INFO", message: "Directly attributable input tax on non-Regulation 33 exempt supplies is disallowed because the de minimis test is not met." });
  }
  if (input.overrideRecoverableResidualBps !== undefined) {
    findings.push({ id: "GST.PE.SPECIAL_METHOD_OVERRIDE", severity: "INFO", message: "A special-method or manual override has been applied to residual input-tax recovery.", data: { overrideRecoverableResidualBps: input.overrideRecoverableResidualBps } });
  }

  return {
    deMinimisPass,
    regulation35Pass,
    exemptSuppliesPerMonth,
    exemptSuppliesRatioBps,
    recoverableResidualBps,
    claimableInputTax,
    disallowedInputTax,
    findings,
  };
}

function sumByCode(transactions: readonly GstLedgerTransaction[], codes: ReadonlySet<string>, field: "netAmount" | "gstAmount"): Cents {
  return transactions.reduce((total, tx) => {
    const code = lookupGstCode(tx.taxCode, tx.date)?.code;
    return total + (code && codes.has(code) ? tx[field] : 0);
  }, 0);
}

function defaultRevenue(transactions: readonly GstLedgerTransaction[]): Cents {
  return transactions.reduce((total, tx) => {
    const def = lookupGstCode(tx.taxCode, tx.date);
    if (!def || def.side !== "SUPPLY") return total;
    if (tx.contributesToRevenue === false) return total;
    if (def.code === "DS" || def.code === "OS") return total;
    return total + tx.netAmount;
  }, 0);
}

export function buildGstReturn(input: BuildGstReturnInput): GstReturnResult {
  const tolerance = input.toleranceCents ?? 2;
  const findings: Finding[] = [];
  const inPeriod = input.transactions.filter((tx) => {
    const inside = tx.date >= input.periodStart && tx.date <= input.periodEnd;
    if (!inside) {
      findings.push({ id: "GST.TX.OUTSIDE_PERIOD", severity: "ERROR", message: "Transaction falls outside the GST return period and has been excluded from the computation.", subject: tx.documentNo, data: { txDate: tx.date, periodStart: input.periodStart, periodEnd: input.periodEnd } });
    }
    return inside;
  });
  for (const tx of inPeriod) {
    const definition = lookupGstCode(tx.taxCode, tx.date);
    if (!definition) {
      findings.push({ id: "GST.TX.UNKNOWN_CODE", severity: "ERROR", message: `Unknown GST code ${tx.taxCode}.`, subject: tx.documentNo });
      continue;
    }
    findings.push(...validateTransaction(tx, definition, tolerance));
  }

  const box1StandardRatedSupplies = sumByCode(inPeriod, new Set(["SR", "SRCA-S", "SRCA-C", "DS", "SRRC", "SROVR", "SROVR-RS", "SROVR-LVG", "SRLVG", "NA"]), "netAmount");
  const box2ZeroRatedSupplies = sumByCode(inPeriod, new Set(["ZR"]), "netAmount");
  const box3ExemptSupplies = sumByCode(inPeriod, new Set(["ES33", "ESN33"]), "netAmount");
  const box4TotalSupplies = box1StandardRatedSupplies + box2ZeroRatedSupplies + box3ExemptSupplies;
  const box5TaxablePurchases = sumByCode(inPeriod, PURCHASES_FOR_BOX5, "netAmount");
  const box6OutputTaxDue = sumByCode(inPeriod, new Set(["SR", "SRCA-C", "DS", "SRRC", "SROVR", "SROVR-RS", "SROVR-LVG", "SRLVG"]), "gstAmount");
  const partialExemption = (() => {
    const directTaxableInputTax = sumByCode(inPeriod, DIRECT_TAXABLE_PURCHASE_CODES, "gstAmount");
    const directReg33InputTax = sumByCode(inPeriod, DIRECT_REG33_PURCHASE_CODES, "gstAmount");
    const directExemptInputTax = sumByCode(inPeriod, DIRECT_EXEMPT_PURCHASE_CODES, "gstAmount");
    const residualInputTax = sumByCode(inPeriod, RESIDUAL_PURCHASE_CODES, "gstAmount");
    const hasPartialExemptionCodes = directReg33InputTax !== 0 || directExemptInputTax !== 0 || residualInputTax !== 0 || input.partialExemption !== undefined;
    if (!hasPartialExemptionCodes) return null;
    const derived: PartialExemptionInput = {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      taxableSupplies: box1StandardRatedSupplies + box2ZeroRatedSupplies,
      exemptSupplies: box3ExemptSupplies,
      regulation33ExemptSupplies: sumByCode(inPeriod, new Set(["ES33"]), "netAmount"),
      nonRegulation33ExemptSupplies: sumByCode(inPeriod, new Set(["ESN33"]), "netAmount"),
      directTaxableInputTax,
      directReg33InputTax,
      directExemptInputTax,
      residualInputTax,
      excludedTaxableSuppliesForDeMinimis: sumByCode(inPeriod, N1_EXCLUDED_TAXABLE_CODES, "netAmount"),
      excludedExemptSuppliesForDeMinimis: 0,
    };
    return computePartialExemption({ ...derived, ...(input.partialExemption ?? {}) });
  })();
  const extraClaims = (input.adjustmentClaims?.touristRefundClaim ?? 0) + (input.adjustmentClaims?.badDebtReliefClaim ?? 0) + (input.adjustmentClaims?.reverseChargeRefundClaim ?? 0) + (input.adjustmentClaims?.preRegistrationInputTaxClaim ?? 0);
  const directClaimableInputTax = partialExemption ? partialExemption.claimableInputTax : sumByCode(inPeriod, new Set(["TX", "TXCA", "IM", "IGDS", "TXRC-TS", "TX-ESS", "TXRC-ESS", "IM-ESS"]), "gstAmount");
  const box7InputTaxAndRefundsClaimed = directClaimableInputTax + extraClaims;
  const box8NetGst = box6OutputTaxDue - box7InputTaxAndRefundsClaimed;
  const box9ImportsUnderSuspensionSchemes = inPeriod.reduce((total, tx) => {
    const code = lookupGstCode(tx.taxCode, tx.date)?.code;
    if (code === "ME") return total + tx.netAmount;
    if (code === "TXNA" && tx.scheme === "A3PL") return total + tx.netAmount;
    return total;
  }, 0);
  const box13Revenue = input.revenue ?? defaultRevenue(inPeriod);
  const box14ReverseChargeImportedServicesAndLvg = sumByCode(inPeriod, new Set(["SRRC"]), "netAmount");
  const box15RemoteServicesByMarketplace = sumByCode(inPeriod, new Set(["SROVR", "SROVR-RS"]), "netAmount");
  const box16LvgByMarketplaceOrRedeliverer = sumByCode(inPeriod, new Set(["SROVR-LVG"]), "netAmount");
  const box17OwnSupplyOfImportedLvg = sumByCode(inPeriod, new Set(["SRLVG"]), "netAmount");
  const box19DeferredImportGstPayable = sumByCode(inPeriod, new Set(["IGDS"]), "gstAmount");
  const box21IgdsImports = sumByCode(inPeriod, new Set(["IGDS"]), "netAmount");
  const boxes: GstF5Boxes = {
    box1StandardRatedSupplies,
    box2ZeroRatedSupplies,
    box3ExemptSupplies,
    box4TotalSupplies,
    box5TaxablePurchases,
    box6OutputTaxDue,
    box7InputTaxAndRefundsClaimed,
    box8NetGst,
    box9ImportsUnderSuspensionSchemes,
    box10TouristRefundClaimed: (input.adjustmentClaims?.touristRefundClaim ?? 0) > 0,
    box11BadDebtOrReverseChargeRefundClaimed: ((input.adjustmentClaims?.badDebtReliefClaim ?? 0) + (input.adjustmentClaims?.reverseChargeRefundClaim ?? 0)) > 0,
    box12PreRegistrationInputTaxClaimed: (input.adjustmentClaims?.preRegistrationInputTaxClaim ?? 0) > 0,
    box13Revenue,
    box14ReverseChargeImportedServicesAndLvg,
    box15RemoteServicesByMarketplace,
    box16LvgByMarketplaceOrRedeliverer,
    box17OwnSupplyOfImportedLvg,
    box18NetGstBeforeIgds: box8NetGst,
    box19DeferredImportGstPayable,
    box20TotalTaxAfterIgds: box8NetGst + box19DeferredImportGstPayable,
    box21IgdsImports,
  };
  for (const [box, amount] of Object.entries(boxes)) {
    if (typeof amount === "number" && amount < 0 && !["box8NetGst", "box18NetGstBeforeIgds", "box20TotalTaxAfterIgds"].includes(box)) {
      findings.push({ id: "GST.RETURN.NEGATIVE_BOX", severity: "WARNING", message: `${box} is negative; review source transactions or adjustment classifications.`, data: { amount } });
    }
  }
  const lines: ComputationLine[] = [
    { code: "GST.BOX1", label: "Box 1 - Total value of standard-rated supplies", amount: boxes.box1StandardRatedSupplies, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX2", label: "Box 2 - Total value of zero-rated supplies", amount: boxes.box2ZeroRatedSupplies, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX3", label: "Box 3 - Total value of exempt supplies", amount: boxes.box3ExemptSupplies, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX4", label: "Box 4 - Total value of Box 1 + Box 2 + Box 3", amount: boxes.box4TotalSupplies, kind: "TOTAL", source: "RULE" },
    { code: "GST.BOX5", label: "Box 5 - Total value of taxable purchases", amount: boxes.box5TaxablePurchases, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX6", label: "Box 6 - Output tax due", amount: boxes.box6OutputTaxDue, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX7", label: "Box 7 - Input tax and refunds claimed", amount: boxes.box7InputTaxAndRefundsClaimed, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX8", label: "Box 8 - Net GST to be paid to / claimed from IRAS", amount: boxes.box8NetGst, kind: "TOTAL", source: "RULE" },
    { code: "GST.BOX9", label: "Box 9 - Total value of goods imported under import GST suspension schemes", amount: boxes.box9ImportsUnderSuspensionSchemes, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX10", label: `Box 10 - Tourist refund claims made: ${yesNo(boxes.box10TouristRefundClaimed)}`, amount: input.adjustmentClaims?.touristRefundClaim ?? 0, kind: "INFO", source: "RULE" },
    { code: "GST.BOX11", label: `Box 11 - Bad debt relief / reverse-charge refund claims made: ${yesNo(boxes.box11BadDebtOrReverseChargeRefundClaimed)}`, amount: (input.adjustmentClaims?.badDebtReliefClaim ?? 0) + (input.adjustmentClaims?.reverseChargeRefundClaim ?? 0), kind: "INFO", source: "RULE" },
    { code: "GST.BOX12", label: `Box 12 - Pre-registration input-tax claims made: ${yesNo(boxes.box12PreRegistrationInputTaxClaimed)}`, amount: input.adjustmentClaims?.preRegistrationInputTaxClaim ?? 0, kind: "INFO", source: "RULE" },
    { code: "GST.BOX13", label: "Box 13 - Revenue for the accounting period", amount: boxes.box13Revenue, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX14", label: "Box 14 - Imported services / LVG subject to reverse charge", amount: boxes.box14ReverseChargeImportedServicesAndLvg, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX15", label: "Box 15 - Remote services supplied by electronic marketplace operator", amount: boxes.box15RemoteServicesByMarketplace, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX16", label: "Box 16 - Imported LVG supplied by marketplace / redeliverer", amount: boxes.box16LvgByMarketplaceOrRedeliverer, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX17", label: "Box 17 - Own supply of imported LVG", amount: boxes.box17OwnSupplyOfImportedLvg, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX18", label: "Box 18 - Net GST per Box 8 above", amount: boxes.box18NetGstBeforeIgds, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX19", label: "Box 19 - Deferred import GST payable", amount: boxes.box19DeferredImportGstPayable, kind: "AMOUNT", source: "RULE" },
    { code: "GST.BOX20", label: "Box 20 - Total tax to be paid to / claimed from IRAS", amount: boxes.box20TotalTaxAfterIgds, kind: "TOTAL", source: "RULE" },
    { code: "GST.BOX21", label: "Box 21 - Total value of goods imported under IGDS", amount: boxes.box21IgdsImports, kind: "AMOUNT", source: "RULE" },
  ];
  return {
    boxes,
    lines,
    findings: [...findings, ...(partialExemption?.findings ?? [])],
    partialExemption,
    notes: [
      "Box 7 includes any tourist-refund, bad-debt-relief, reverse-charge-refund or pre-registration input-tax claim amounts provided to the engine.",
      input.revenue === undefined ? "Box 13 defaults to supply-side net amounts unless an explicit revenue figure is supplied." : "Box 13 uses the caller-supplied revenue figure.",
    ],
  };
}

export function classifyPropertySupply(input: PropertySupplyClassificationInput): PropertySupplyClassificationResult {
  if (input.transactionType === "TRANSFER_OF_GOING_CONCERN" && input.qualifiesAsTransferOfGoingConcern) {
    return { suggestedTaxCode: "OS", legalBasis: "IRAS GST real-estate guidance treats a qualifying transfer of a going concern as an excluded transaction outside the GST return.", caveat: "All statutory TOGC conditions must be reviewed separately; the engine only classifies the GST outcome when the qualification fact is supplied." };
  }
  if (input.transactionType === "OVERSEAS_PROPERTY_SUPPLY" || input.jurisdiction === "OVERSEAS") {
    return { suggestedTaxCode: "OS", legalBasis: "Supplies of overseas property outside Singapore are outside the scope of Singapore GST." };
  }
  if (input.transactionType === "IMPORTED_SERVICE") {
    return input.reverseChargeApplies
      ? { suggestedTaxCode: "SRRC", legalBasis: "Imported services and LVG subject to reverse charge are reported as standard-rated supplies by the customer under the reverse-charge rules." }
      : { suggestedTaxCode: "OP", legalBasis: "Imported services outside reverse charge are not Singapore GST supplies and are treated as out-of-scope purchases." };
  }
  if (input.buyerAccountsForGstOnReitTransfer) {
    return { suggestedTaxCode: "SRCA-S", legalBasis: "The seller reports the value as a standard-rated supply but does not charge output tax where the listed GST-registered REIT / approved SPV self-accounts for GST on the property transfer.", caveat: "The invoice should state that the buyer accounts for GST; this is a treatment-driven use of the no-output-tax supply code rather than a sector-specific IRAS code." };
  }
  if (input.propertyUse === "MIXED_USE" && (input.mixedUseNonResidentialShareBps ?? 0) > 0 && (input.mixedUseNonResidentialShareBps ?? 0) < 10000) {
    const share = input.mixedUseNonResidentialShareBps!;
    return { suggestedTaxCode: null, splitTreatment: [{ taxCode: "SR", shareBps: share, label: "Non-residential component" }, { taxCode: "ESN33", shareBps: 10000 - share, label: "Residential component" }], legalBasis: "Only the non-residential component is standard-rated; the residential component remains exempt.", caveat: "A supportable apportionment of the mixed-use value is required." };
  }
  if (input.propertyUse === "RESIDENTIAL" && ["SALE", "LEASE", "PREMIUM", "PROPERTY_TAX_RECOVERY"].includes(input.transactionType)) {
    return { suggestedTaxCode: "ESN33", legalBasis: "Sale and lease of residential property are exempt supplies; recoveries that form part of residential rent follow the exempt treatment." };
  }
  if (["AGENT_COMMISSION", "PROPERTY_MANAGEMENT_FEE", "SERVICE_CHARGE"].includes(input.transactionType)) {
    return { suggestedTaxCode: "SR", legalBasis: "Agent commissions, property-management fees and service-charge recoveries are taxable services even when they relate to residential property.", caveat: "For a landlord making exempt residential supplies, the recipient's input-tax recovery may still be blocked or restricted." };
  }
  return { suggestedTaxCode: "SR", legalBasis: "Sale, lease and related charges for commercial, industrial and other non-residential property are standard-rated supplies." };
}

/**
 * IRAS: the return and payment are due one month after the accounting period ends. A period ending on the last day of a month is due on the
 * last day of the next month (Apr-Jun is due 31 Jul, Jul-Sep 31 Oct); a special period ending mid-month is due on the same day of the next
 * month (5 Apr-5 Jul 2026 is due 5 Aug 2026).
 */
export function gstReturnDueDate(periodEnd: ISODate): ISODate {
  return periodEnd === endOfMonth(periodEnd) ? endOfMonth(addMonths(periodEnd, 1)) : addMonths(periodEnd, 1);
}

export function gstGiroPaymentDate(periodEnd: ISODate): ISODate {
  const next = addMonths(periodEnd, 2);
  return `${next.slice(0, 8)}15`;
}

export function assessGstRegistration(input: GstRegistrationAssessmentInput): GstRegistrationAssessmentResult {
  const thresholdAmount = 100_000_000;
  const findings: Finding[] = [];
  if ((input.retrospectiveAnnualTaxableTurnover ?? 0) > thresholdAmount) {
    const due = addDays(input.assessmentDate, 30);
    const { y } = parseISO(input.assessmentDate);
    return { registrationRequired: true, basis: "RETROSPECTIVE", thresholdAmount, applicationDueDate: due, effectiveRegistrationDate: `${y + 1}-03-01`, findings };
  }
  const forecastTurnover = input.forecastTaxableTurnoverNext12Months ?? 0;
  if (forecastTurnover > thresholdAmount && input.forecastDate) {
    const applicationDueDate = addDays(input.forecastDate, 30);
    const effectiveRegistrationDate = input.forecastDate >= "2025-07-01" ? addMonths(input.forecastDate, 2) : addDays(input.forecastDate, 31);
    return { registrationRequired: true, basis: "PROSPECTIVE", thresholdAmount, applicationDueDate, effectiveRegistrationDate, findings };
  }
  return { registrationRequired: false, basis: null, thresholdAmount, findings };
}

export function computeGstLateFilingPenalty(input: GstLateFilingPenaltyInput): Cents {
  if (compareISO(input.filedDate, input.dueDate) <= 0) return 0;
  const completedMonthsLate = Math.max(0, monthsBetween(input.dueDate, input.filedDate));
  return Math.min((1 + completedMonthsLate) * 20_000, 1_000_000);
}

/**
 * IRAS: 5% once the tax is late; if it is still unpaid 60 days after the 5% penalty is imposed, a further 2% for each month it remains
 * unpaid, counted from the date the tax became payable (IRAS Example 4: due 31 Jul 2025, notice 5 Aug, paid 16 Dec -> Aug-Nov = 4 months),
 * with the additional penalty capped at 50% of the unpaid tax. The notice date is an input because IRAS notices prevail; the default is
 * the day after the due date.
 */
export function computeGstLatePaymentPenalty(input: GstLatePaymentPenaltyInput): Cents {
  if (input.unpaidTax <= 0 || compareISO(input.paidDate, input.dueDate) <= 0) return 0;
  const firstPenalty = mulBps(input.unpaidTax, 500);
  const noticeDate = input.penaltyNoticeDate ?? addDays(input.dueDate, 1);
  if (compareISO(input.paidDate, addDays(noticeDate, 60)) <= 0) return firstPenalty;
  const monthsUnpaid = Math.max(0, monthsBetween(input.dueDate, input.paidDate));
  const additionalPenalty = mulBps(input.unpaidTax, Math.min(monthsUnpaid * 200, 5000));
  return firstPenalty + additionalPenalty;
}

export function latestInputTaxClaimDate(sourceDate: ISODate): ISODate {
  return addYears(sourceDate, 5);
}

export function evaluateBadDebtRelief(input: GstBadDebtReliefInput): GstBadDebtReliefResult {
  const findings: Finding[] = [];
  const twelveMonthsAfterDueDate = addYears(input.paymentDueDate, 1);
  if (input.writeOffDate < twelveMonthsAfterDueDate) {
    findings.push({ id: "GST.BDR.TOO_EARLY", severity: "ERROR", message: "Bad debt relief normally requires the debt to remain unpaid for at least 12 months after the payment due date." });
  }
  if (input.reasonableRecoveryStepsTaken === false) {
    findings.push({ id: "GST.BDR.NO_RECOVERY_STEPS", severity: "ERROR", message: "Bad debt relief generally requires reasonable steps to recover the debt." });
  }
  const eligible = findings.every((finding) => finding.severity !== "ERROR");
  const claimAmount = eligible ? mulBps(input.amountWrittenOff, gstRateByDate(input.gstRateDate ?? input.originalSupplyDate)) : 0;
  return { eligible, claimAmount, findings };
}

export function suggestedGstFilingFrequency(annualRevenue: Cents): GstFilingFrequency {
  if (annualRevenue >= 20_000_000_00) return "MONTHLY";
  return "QUARTERLY";
}

export const RULES = [
  {
    id: "gst.rate-and-f5.1994-plus",
    domain: "GST",
    title: "GST rate history and F5 box construction",
    summary:
      "GST is modelled from the 1994 introduction of GST (3%), through the 2003/2004/2007/2023/2024 rate changes, and the engine builds the current IRAS F5 structure through Box 21.",
    effectiveFrom: "1994-04-01",
    sources: [
      { title: "IRAS | Current GST rates", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/basics-of-gst/current-gst-rates", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | Completing GST returns", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/filing-gst/completing-gst-returns", retrieved: "2026-10-09", publisher: "IRAS" },
    ],
    confidence: "VERIFIED",
    notes: "IRAS' public pages still refer to the F5 as a 15-box return in some headings, but the current completion guide extends the operative box set to Box 21 for current schemes.",
  },
  {
    id: "gst.partial-exemption.real-estate.2022-plus",
    domain: "GST",
    title: "Partial exemption, Regulation 35, property classification and claim timing",
    summary:
      "The engine models the de minimis thresholds with exact cross-multiplication, the Regulation 35 test, whole-percent residual-recovery rounding, real-estate GST characterisation, the 5-year claim window and bad-debt-relief mechanics that can be expressed mechanically.",
    effectiveFrom: "2022-01-01",
    sources: [
      { title: "IRAS | Claiming input tax incurred to make exempt supplies", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/claiming-gst-(input-tax)/claiming-input-tax-incurred-to-make-exempt-supplies", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | GST: Partial Exemption and Input Tax Recovery (6th Edition)", url: "https://www.iras.gov.sg/docs/default-source/e-tax/etax-guide-on-partial-exemption-and-input-tax-recovery-6th-edition.pdf", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | Conditions for claiming input tax", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/claiming-gst-(input-tax)/conditions-for-claiming-input-tax", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | Claim input tax in the correct accounting period", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/claiming-gst-(input-tax)/claim-input-tax-in-the-correct-accounting-period", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | GST and the real estate industry", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/specific-business-sectors/real-estate", retrieved: "2026-10-09", publisher: "IRAS" },
    ],
    confidence: "VERIFIED",
    notes: "A qualifying transfer of a going concern is still classified as out-of-scope when the caller confirms the TOGC condition, but that sub-rule should be manually reviewed because a live IRAS TOGC page URL could not be re-opened on 2026-10-09.",
  },
  {
    id: "gst.registration-and-penalties.2022-plus",
    domain: "FILING",
    title: "GST registration, filing due dates and late penalties",
    summary:
      "The engine models the S$1 million registration threshold, the 2025-07-01 prospective-registration timing change, the F5 due-date helpers, the GIRO deduction timing, late-filing composition fees and late-payment penalties.",
    effectiveFrom: "2022-01-01",
    sources: [
      { title: "IRAS | Do I need to register for GST", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-registration-deregistration/do-i-need-to-register-for-gst", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | GST filing due dates and requests for extension", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/filing-gst/gst-filing-due-dates-and-requests-for-extension", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | Late filing or non-filing of GST returns (F5/F8)", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/filing-gst/late-filing-or-non-filing-of-gst-returns-f5-f8", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | Late payment or non-payment of GST", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-payments-refunds/late-payment-or-non-payment-of-gst", retrieved: "2026-10-09", publisher: "IRAS" },
    ],
    confidence: "VERIFIED",
    notes: "The late-payment helper counts the 60-day trigger and subsequent 30-day blocks from the due date as an engine approximation of the IRAS penalty timeline. IRAS penalty notices prevail if they differ from this mechanical model.",
  },
] as const satisfies readonly RuleEntry[];

export const NOTES = [ENGINE_DISCLAIMER];
