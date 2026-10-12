import { addDays, diffDays, maxDate, minDate, type ISODate } from "../dates.ts";
import { allocate, mulBps, type Bps, type Cents } from "../money.ts";
import type { RuleEntry } from "../rules.ts";
import { ENGINE_DISCLAIMER_AU } from "../rules.ts";
import type { ComputationLine, Finding } from "../types.ts";
import {
  attributedAssessableIncome,
  attributedNaneIncome,
  attributeTrustComponents,
  buildAmmaStatement,
  computeAmitCostBaseNetAmount,
  type AmmaStatement,
  type AuCharacterMap,
} from "./amit.ts";
import { AU_MEMBER_CLASSES, determineMemberWithholding, mitigatesTfnWithholding, type AuMemberClass, type AuMemberProfile } from "./members.ts";
import { buildFundPaymentNotice, computeMitWithholding, type MitFundPaymentBreakdown } from "./mitWithholding.ts";
import type { AuIncomeCharacter, AuTaxRegime } from "./types.ts";

export interface AuDistributionPolicy {
  id?: string;
  label?: string;
  distributableIncomePayoutBps: Bps;
  taxDeferredPayoutBps?: Bps;
  taxFreePayoutBps?: Bps;
  taxExemptPayoutBps?: Bps;
  retainedCashAmount?: Cents;
  dpuDecimals: number;
  attributionMethod?: "RECORD_DATE" | "TIME_WEIGHTED_DAILY";
}

export interface HoldingPeriod {
  readonly from: ISODate;
  readonly to: ISODate;
  readonly units: number;
}

export interface AuDistributionMember {
  readonly memberId: string;
  readonly displayName: string;
  readonly profile: Readonly<Omit<AuMemberProfile, "memberClass"> & { memberClass: AuMemberClass | string }>;
  readonly unitsHeldOnRecordDate: number;
  holdingPeriods?: readonly HoldingPeriod[];
  startingCostBase?: Cents;
}

export interface ExpenseAllocationInput {
  directExpensesByCharacter?: AuCharacterMap;
  sharedExpenses: Cents;
  grossIncomeByCharacter: AuCharacterMap;
}

export interface ExpenseAllocationResult {
  allocatedByCharacter: Record<AuIncomeCharacter, Cents>;
  working: ComputationLine[];
}

export interface DistributionComputationInput {
  trustRegime: Extract<AuTaxRegime, "AMIT" | "MIT" | "UNIT_TRUST">;
  periodStart: ISODate;
  periodEnd: ISODate;
  recordDate: ISODate;
  incomeYearEnd: ISODate;
  unitsOutstanding: number;
  distributableIncome: Cents;
  componentPools: AuCharacterMap;
  frankingCredits?: Cents;
  taxOffsets?: Cents;
  mitFundPaymentBreakdown?: MitFundPaymentBreakdown;
  policy: AuDistributionPolicy;
}

export interface RoundedPerUnit {
  decimals: number;
  scaledAmount: number;
  value: string;
}

export interface DistributionComputationResult {
  trustRegime: Extract<AuTaxRegime, "AMIT" | "MIT" | "UNIT_TRUST">;
  policy: AuDistributionPolicy;
  declaredCashDistribution: Cents;
  retainedCash: Cents;
  assessableCashDistribution: Cents;
  components: Record<AuIncomeCharacter, Cents>;
  distributionPerUnit: RoundedPerUnit;
  fundPaymentBreakdown?: Required<MitFundPaymentBreakdown>;
  working: ComputationLine[];
  findings: Finding[];
}

export interface MemberDistributionAllocation {
  memberId: string;
  displayName: string;
  profile: AuMemberProfile;
  weightUsed: number;
  cashByCharacter: Record<AuIncomeCharacter, Cents>;
  grossCashDistribution: Cents;
  tfnWithheld: Cents;
  mitWithheld: Cents;
  totalWithheld: Cents;
  netCashDistribution: Cents;
  attributedComponents: Record<AuIncomeCharacter, Cents>;
  ammaStatement?: AmmaStatement;
  nonAmitStatement?: NonAmitDistributionStatement;
  fundPaymentNotice?: ReturnType<typeof buildFundPaymentNotice>;
}

export interface DistributionAllocationResult {
  members: MemberDistributionAllocation[];
  totals: {
    grossCashDistribution: Cents;
    totalWithheld: Cents;
    netCashDistribution: Cents;
  };
  findings: Finding[];
}

export interface NonAmitDistributionStatement {
  memberId: string;
  dueDate: ISODate;
  summary: {
    shareOfNetIncomeFromTrusts: Cents;
    frankingCreditOffset: Cents;
    tfnCredit: Cents;
    foreignResidentCredit: Cents;
    netCapitalGain: Cents;
  };
  components: Record<AuIncomeCharacter, Cents>;
  taxOffsets: Cents;
  grossCashDistribution: Cents;
  netCashDistribution: Cents;
}

export interface WithholdingReconciliationInput {
  allocation: DistributionAllocationResult;
  remittedToAto: Cents;
  statementsIssued: number;
}

export interface WithholdingReconciliationResult {
  withheldPerRegister: Cents;
  remittedToAto: Cents;
  statementsIssued: number;
  expectedStatements: number;
  variance: Cents;
  findings: Finding[];
}

export interface DistributionScenarioModelInput {
  trustRegime: Extract<AuTaxRegime, "AMIT" | "MIT" | "UNIT_TRUST">;
  periodStart: ISODate;
  periodEnd: ISODate;
  recordDate: ISODate;
  incomeYearEnd: ISODate;
  unitsOutstanding: number;
  distributableIncome: Cents;
  componentPools: AuCharacterMap;
  policies: readonly AuDistributionPolicy[];
}

export interface DistributionScenarioModelResult {
  label: string;
  declaredCashDistribution: Cents;
  retainedCash: Cents;
  distributionPerUnit: string;
}

const ALL_CHARACTERS: readonly AuIncomeCharacter[] = [
  "RENT",
  "INTEREST",
  "OTHER_AU_INCOME",
  "FRANKED_DIVIDEND",
  "UNFRANKED_DIVIDEND",
  "FOREIGN_INCOME",
  "CAPITAL_GAIN_DISCOUNTABLE",
  "CAPITAL_GAIN_OTHER",
  "NON_ASSESSABLE_TAX_DEFERRED",
  "NON_ASSESSABLE_TAX_FREE",
  "NON_ASSESSABLE_TAX_EXEMPT",
] as const;

function zeroed(): Record<AuIncomeCharacter, Cents> {
  return {
    RENT: 0,
    INTEREST: 0,
    OTHER_AU_INCOME: 0,
    FRANKED_DIVIDEND: 0,
    UNFRANKED_DIVIDEND: 0,
    FOREIGN_INCOME: 0,
    CAPITAL_GAIN_DISCOUNTABLE: 0,
    CAPITAL_GAIN_OTHER: 0,
    NON_ASSESSABLE_TAX_DEFERRED: 0,
    NON_ASSESSABLE_TAX_FREE: 0,
    NON_ASSESSABLE_TAX_EXEMPT: 0,
  };
}

function assertCents(value: number | undefined, label: string): Cents {
  const v = value ?? 0;
  if (!Number.isSafeInteger(v)) throw new RangeError(`${label} must be an integer number of cents, got ${value}`);
  return v;
}

function assertNonNegativeCents(value: number | undefined, label: string): Cents {
  const v = assertCents(value, label);
  if (v < 0) throw new RangeError(`${label} must be non-negative, got ${value}`);
  return v;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function assessableCharacters(): readonly AuIncomeCharacter[] {
  return ALL_CHARACTERS.filter((character) => !character.startsWith("NON_ASSESSABLE_"));
}

function componentTotal(components: AuCharacterMap, characters: readonly AuIncomeCharacter[]): Cents {
  return sum(characters.map((character) => components[character] ?? 0));
}

function largestRemainderComponentAllocation(total: Cents, pools: AuCharacterMap, characters: readonly AuIncomeCharacter[]): Record<AuIncomeCharacter, Cents> {
  const result = zeroed();
  const weights = characters.map((character) => assertNonNegativeCents(pools[character], `${character} component pool`));
  const parts = allocate(total, weights);
  for (let index = 0; index < characters.length; index += 1) result[characters[index]!] = parts[index] ?? 0;
  return result;
}

function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  const negative = numerator < 0n !== denominator < 0n ? -1n : 1n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return negative * q;
}

function formatScaled(scaledAmount: number, decimals: number): string {
  const negative = scaledAmount < 0;
  const abs = Math.abs(scaledAmount).toString().padStart(decimals + 1, "0");
  const head = abs.slice(0, -decimals) || "0";
  const tail = decimals === 0 ? "" : `.${abs.slice(-decimals)}`;
  return `${negative ? "-" : ""}${head}${tail}`;
}

function computePerUnit(total: Cents, units: number, decimals: number): RoundedPerUnit {
  if (units <= 0) return { decimals, scaledAmount: 0, value: formatScaled(0, decimals) };
  const scale = BigInt(10 ** decimals);
  const scaledAmount = Number(roundDiv(BigInt(total) * scale, BigInt(units * 100)));
  return { decimals, scaledAmount, value: formatScaled(scaledAmount, decimals) };
}

function daysHeldWithinPeriod(periodStart: ISODate, periodEnd: ISODate, holding: HoldingPeriod): number {
  const from = maxDate(periodStart, holding.from);
  const to = minDate(periodEnd, holding.to);
  if (to < from) return 0;
  return diffDays(from, addDays(to, 1));
}

function memberWeight(method: "RECORD_DATE" | "TIME_WEIGHTED_DAILY", periodStart: ISODate, periodEnd: ISODate, member: AuDistributionMember): number {
  if (method === "TIME_WEIGHTED_DAILY") {
    return sum((member.holdingPeriods ?? []).map((holding) => daysHeldWithinPeriod(periodStart, periodEnd, holding) * holding.units));
  }
  return member.unitsHeldOnRecordDate;
}

function normaliseFundPaymentBreakdown(input?: MitFundPaymentBreakdown): Required<MitFundPaymentBreakdown> | undefined {
  if (!input) return undefined;
  return {
    ordinaryFundPayment: assertCents(input.ordinaryFundPayment, "ordinaryFundPayment"),
    cleanBuildingFundPayment: assertCents(input.cleanBuildingFundPayment, "cleanBuildingFundPayment"),
    buildToRentFundPayment: assertCents(input.buildToRentFundPayment, "buildToRentFundPayment"),
    ncmiFundPayment: assertCents(input.ncmiFundPayment, "ncmiFundPayment"),
    excludedFromNcmiFundPayment: assertCents(input.excludedFromNcmiFundPayment, "excludedFromNcmiFundPayment"),
    excludedDirAmounts: assertCents(input.excludedDirAmounts, "excludedDirAmounts"),
    excludedForeignSourceAmounts: assertCents(input.excludedForeignSourceAmounts, "excludedForeignSourceAmounts"),
    excludedNonTapCapitalGains: assertCents(input.excludedNonTapCapitalGains, "excludedNonTapCapitalGains"),
  };
}

function normaliseDistributionMemberProfile(profile: AuDistributionMember["profile"]): AuMemberProfile {
  if (!AU_MEMBER_CLASSES.some((row) => row.id === profile.memberClass)) {
    throw new RangeError(`Unknown AU member class ${String(profile.memberClass)}`);
  }
  return profile as AuMemberProfile;
}

export function allocateSharedExpenses(input: ExpenseAllocationInput): ExpenseAllocationResult {
  const allocatedByCharacter = zeroed();
  for (const character of ALL_CHARACTERS) allocatedByCharacter[character] = assertCents(input.directExpensesByCharacter?.[character], `${character} direct expenses`);
  const sharedExpenses = assertCents(input.sharedExpenses, "sharedExpenses");
  const positiveWeights = ALL_CHARACTERS.map((character) => Math.max(0, input.grossIncomeByCharacter[character] ?? 0));
  const sharedParts = allocate(sharedExpenses, positiveWeights);
  for (let index = 0; index < ALL_CHARACTERS.length; index += 1) {
    const character = ALL_CHARACTERS[index]!;
    allocatedByCharacter[character] += sharedParts[index] ?? 0;
  }
  return {
    allocatedByCharacter,
    working: [
      { code: "AU.DIST.EXPENSE.DIRECT", label: "Direct expenses by character", amount: sum(Object.values(allocatedByCharacter)), kind: "AMOUNT", source: "RULE", note: "Shared expenses are apportioned by gross-income weights unless direct tracing is available." },
      { code: "AU.DIST.EXPENSE.SHARED", label: "Shared expense pool", amount: sharedExpenses, kind: "AMOUNT", source: "RULE" },
    ],
  };
}

export function computeDistribution(input: DistributionComputationInput): DistributionComputationResult {
  if (!Number.isSafeInteger(input.unitsOutstanding) || input.unitsOutstanding <= 0) {
    throw new RangeError(`unitsOutstanding must be a positive integer, got ${input.unitsOutstanding}`);
  }
  const distributableIncome = assertCents(input.distributableIncome, "distributableIncome");
  const retainedCashAmount = assertNonNegativeCents(input.policy.retainedCashAmount, "retainedCashAmount");
  const findings: Finding[] = [];
  const working: ComputationLine[] = [];
  const componentPools = zeroed();
  for (const character of ALL_CHARACTERS) componentPools[character] = assertNonNegativeCents(input.componentPools[character], `${character} component pool`);
  const assessablePool = componentTotal(componentPools, assessableCharacters());
  const assessableCashDistributionBeforeRetention = Math.min(assessablePool, mulBps(distributableIncome, input.policy.distributableIncomePayoutBps));
  const taxDeferredDistribution = mulBps(componentPools.NON_ASSESSABLE_TAX_DEFERRED, input.policy.taxDeferredPayoutBps ?? 10_000);
  const taxFreeDistribution = mulBps(componentPools.NON_ASSESSABLE_TAX_FREE, input.policy.taxFreePayoutBps ?? 10_000);
  const taxExemptDistribution = mulBps(componentPools.NON_ASSESSABLE_TAX_EXEMPT, input.policy.taxExemptPayoutBps ?? 10_000);
  const declaredBeforeRetention = assessableCashDistributionBeforeRetention + taxDeferredDistribution + taxFreeDistribution + taxExemptDistribution;
  const retainedCash = Math.min(retainedCashAmount, declaredBeforeRetention);
  const assessableCashDistribution = Math.max(0, assessableCashDistributionBeforeRetention - retainedCash);
  const declaredCashDistribution = Math.max(0, declaredBeforeRetention - retainedCash);
  const components = zeroed();
  const assessableAllocation = largestRemainderComponentAllocation(assessableCashDistribution, componentPools, assessableCharacters());
  for (const character of assessableCharacters()) components[character] = assessableAllocation[character];
  components.NON_ASSESSABLE_TAX_DEFERRED = taxDeferredDistribution;
  components.NON_ASSESSABLE_TAX_FREE = taxFreeDistribution;
  components.NON_ASSESSABLE_TAX_EXEMPT = taxExemptDistribution;
  working.push({ code: "AU.DIST.CASH.DISTRIBUTABLE", label: "Distributable income", amount: distributableIncome, kind: "AMOUNT", source: "RULE" });
  working.push({ code: "AU.DIST.CASH.ASSESSABLE", label: "Assessable cash distribution", amount: assessableCashDistribution, kind: "AMOUNT", source: "RULE" });
  working.push({ code: "AU.DIST.CASH.DECLARED", label: "Declared cash distribution", amount: declaredCashDistribution, kind: "TOTAL", source: "RULE" });
  const totalByComponents = sum(Object.values(components));
  if (declaredCashDistribution !== totalByComponents) {
    findings.push({
      id: "AU.DIST.DECLARED_COMPONENT_MISMATCH",
      severity: "WARNING",
      message: "Declared cash distribution does not reconcile cleanly to the component splits and retained amount.",
      data: { declaredCashDistribution, totalByComponents, retainedCash },
    });
  }
  return {
    trustRegime: input.trustRegime,
    policy: input.policy,
    declaredCashDistribution,
    retainedCash,
    assessableCashDistribution,
    components,
    distributionPerUnit: computePerUnit(declaredCashDistribution, input.unitsOutstanding, input.policy.dpuDecimals),
    fundPaymentBreakdown: normaliseFundPaymentBreakdown(input.mitFundPaymentBreakdown),
    working,
    findings,
  };
}

export function allocateDistributionToMembers(input: DistributionComputationInput & { distribution: DistributionComputationResult; members: readonly AuDistributionMember[] }): DistributionAllocationResult {
  const findings: Finding[] = [];
  const method = input.policy.attributionMethod ?? (input.trustRegime === "AMIT" ? "TIME_WEIGHTED_DAILY" : "RECORD_DATE");
  const weights = input.members.map((member) => memberWeight(method, input.periodStart, input.periodEnd, member));
  const totalTaxOffsets = assertNonNegativeCents(input.taxOffsets, "taxOffsets");
  const allocatedTaxOffsets = totalTaxOffsets > 0 ? allocate(totalTaxOffsets, weights) : input.members.map(() => 0);
  const totalFrankingCredits = assertNonNegativeCents(input.frankingCredits, "frankingCredits");
  const allocatedFrankingCredits = totalFrankingCredits > 0 ? allocate(totalFrankingCredits, weights) : input.members.map(() => 0);
  const memberResults = input.members.map((member) => ({
    member,
    weight: memberWeight(method, input.periodStart, input.periodEnd, member),
    cashByCharacter: zeroed(),
    attributedComponents: zeroed(),
  }));
  for (const character of ALL_CHARACTERS) {
    const cashParts = allocate(input.distribution.components[character] ?? 0, weights);
    const attributedSource = input.trustRegime === "AMIT" ? assertCents(input.componentPools[character], `${character} component pool`) : assertCents(input.distribution.components[character], `${character} cash component`);
    const attributedParts = allocate(attributedSource, weights);
    for (let index = 0; index < memberResults.length; index += 1) {
      memberResults[index]!.cashByCharacter[character] = cashParts[index] ?? 0;
      memberResults[index]!.attributedComponents[character] = attributedParts[index] ?? 0;
    }
  }
  const fundBreakdown = normaliseFundPaymentBreakdown(input.mitFundPaymentBreakdown);
  const fundPaymentBucketsPerMember = fundBreakdown
    ? {
        ordinaryFundPayment: allocate(fundBreakdown.ordinaryFundPayment, weights),
        cleanBuildingFundPayment: allocate(fundBreakdown.cleanBuildingFundPayment, weights),
        buildToRentFundPayment: allocate(fundBreakdown.buildToRentFundPayment, weights),
        ncmiFundPayment: allocate(fundBreakdown.ncmiFundPayment, weights),
        excludedFromNcmiFundPayment: allocate(fundBreakdown.excludedFromNcmiFundPayment, weights),
      }
    : undefined;

  const members: MemberDistributionAllocation[] = memberResults.map((row, index) => {
    const memberProfile = normaliseDistributionMemberProfile(row.member.profile);
    const grossCashDistribution = sum(Object.values(row.cashByCharacter));
    const returnOfCapitalOnly = grossCashDistribution > 0 && grossCashDistribution === row.cashByCharacter.NON_ASSESSABLE_TAX_DEFERRED;
    const tfnBase = mitigatesTfnWithholding(memberProfile) || returnOfCapitalOnly ? 0 : grossCashDistribution;
    const tfnOutcome = determineMemberWithholding({
      trustRegime: input.trustRegime,
      paymentDate: input.recordDate,
      member: memberProfile,
      actualCashPayment: grossCashDistribution,
      tfnWithholdingBase: tfnBase,
      returnOfCapitalOnly,
    });
    const mitOutcome =
      fundPaymentBucketsPerMember && (input.trustRegime === "MIT" || input.trustRegime === "AMIT")
        ? computeMitWithholding({
            paymentDate: input.recordDate,
            incomeYearEnd: input.incomeYearEnd,
            trustRegime: input.trustRegime,
            member: memberProfile,
            paymentAmount: grossCashDistribution,
            fundPaymentBreakdown: {
              ordinaryFundPayment: fundPaymentBucketsPerMember.ordinaryFundPayment[index] ?? 0,
              cleanBuildingFundPayment: fundPaymentBucketsPerMember.cleanBuildingFundPayment[index] ?? 0,
              buildToRentFundPayment: fundPaymentBucketsPerMember.buildToRentFundPayment[index] ?? 0,
              ncmiFundPayment: fundPaymentBucketsPerMember.ncmiFundPayment[index] ?? 0,
              excludedFromNcmiFundPayment: fundPaymentBucketsPerMember.excludedFromNcmiFundPayment[index] ?? 0,
            },
          })
        : undefined;
    const tfnWithheld = tfnOutcome.scenario === "TFN_ABN_WITHHOLDING" ? tfnOutcome.withholdingAmount : 0;
    const mitWithheld = mitOutcome?.withholdingAmount ?? 0;
    const totalWithheld = tfnWithheld + mitWithheld;
    const netCashDistribution = grossCashDistribution - totalWithheld;
    const attributed = row.attributedComponents;
    const taxOffsets = allocatedTaxOffsets[index] ?? 0;
    const frankingCreditsTaxOffset = allocatedFrankingCredits[index] ?? 0;
    const cbna = computeAmitCostBaseNetAmount({
      assessableAttributed: attributedAssessableIncome(attributed),
      naneAttributed: attributedNaneIncome(attributed),
      taxOffsets,
      cashPaymentsOrEntitlements: grossCashDistribution,
      startingCostBase: row.member.startingCostBase,
    });
    const ammaStatement =
      input.trustRegime === "AMIT"
        ? buildAmmaStatement({
            incomeYearEnd: input.incomeYearEnd,
            memberId: row.member.memberId,
            member: memberProfile,
            attributedComponents: attributed,
            cashDistribution: grossCashDistribution,
            taxOffsets,
            frankingCreditsTaxOffset,
            tfnWithheld,
            foreignResidentWithheld: mitWithheld,
            managedInvestmentTrustFundPayments:
              (fundPaymentBucketsPerMember?.ordinaryFundPayment[index] ?? 0) +
              (fundPaymentBucketsPerMember?.cleanBuildingFundPayment[index] ?? 0) +
              (fundPaymentBucketsPerMember?.buildToRentFundPayment[index] ?? 0) +
              (fundPaymentBucketsPerMember?.ncmiFundPayment[index] ?? 0),
            amountsWithheldFromManagedInvestmentTrustFundPayments: mitWithheld,
            costBaseNetAmount: cbna,
          })
        : undefined;
    const nonAmitStatement =
      input.trustRegime !== "AMIT"
        ? {
            memberId: row.member.memberId,
            dueDate: input.incomeYearEnd,
            summary: {
              shareOfNetIncomeFromTrusts:
                attributed.RENT + attributed.INTEREST + attributed.OTHER_AU_INCOME + attributed.UNFRANKED_DIVIDEND,
              frankingCreditOffset: frankingCreditsTaxOffset,
              tfnCredit: tfnWithheld,
              foreignResidentCredit: mitWithheld,
              netCapitalGain: attributed.CAPITAL_GAIN_DISCOUNTABLE + attributed.CAPITAL_GAIN_OTHER,
            },
            components: attributed,
            taxOffsets,
            grossCashDistribution,
            netCashDistribution,
          }
        : undefined;
    const fundPaymentNotice =
      mitOutcome && (mitOutcome.totalFundPayment > 0 || mitOutcome.requiresNotice)
        ? buildFundPaymentNotice({
            payerName: "Trustee",
            recipientName: row.member.displayName,
            recipientMemberClass: memberProfile.memberClass,
            paymentDate: input.recordDate,
            incomeYearEnd: input.incomeYearEnd,
            breakdown: mitOutcome.breakdown,
            withholdingAmount: mitWithheld,
          })
        : undefined;
    return {
      memberId: row.member.memberId,
      displayName: row.member.displayName,
      profile: memberProfile,
      weightUsed: row.weight,
      cashByCharacter: row.cashByCharacter,
      grossCashDistribution,
      tfnWithheld,
      mitWithheld,
      totalWithheld,
      netCashDistribution,
      attributedComponents: attributed,
      ammaStatement,
      nonAmitStatement,
      fundPaymentNotice,
    };
  });
  return {
    members,
    totals: {
      grossCashDistribution: sum(members.map((member) => member.grossCashDistribution)),
      totalWithheld: sum(members.map((member) => member.totalWithheld)),
      netCashDistribution: sum(members.map((member) => member.netCashDistribution)),
    },
    findings,
  };
}

export function reconcileWithholding(input: WithholdingReconciliationInput): WithholdingReconciliationResult {
  const withheldPerRegister = input.allocation.totals.totalWithheld;
  const variance = input.remittedToAto - withheldPerRegister;
  const findings: Finding[] = [];
  if (variance !== 0) {
    findings.push({
      id: "AU.DIST.WITHHOLDING_VARIANCE",
      severity: "WARNING",
      message: "Amounts remitted to the ATO do not equal the withholding deducted from member allocations.",
      data: { withheldPerRegister, remittedToAto: input.remittedToAto, variance },
    });
  }
  if (input.statementsIssued !== input.allocation.members.length) {
    findings.push({
      id: "AU.DIST.STATEMENT_COUNT",
      severity: "WARNING",
      message: "The number of statements issued does not equal the number of allocated members.",
      data: { statementsIssued: input.statementsIssued, expectedStatements: input.allocation.members.length },
    });
  }
  return {
    withheldPerRegister,
    remittedToAto: input.remittedToAto,
    statementsIssued: input.statementsIssued,
    expectedStatements: input.allocation.members.length,
    variance,
    findings,
  };
}

export function modelScenarios(input: DistributionScenarioModelInput): DistributionScenarioModelResult[] {
  return input.policies.map((policy) => {
    const distribution = computeDistribution({
      trustRegime: input.trustRegime,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      recordDate: input.recordDate,
      incomeYearEnd: input.incomeYearEnd,
      unitsOutstanding: input.unitsOutstanding,
      distributableIncome: input.distributableIncome,
      componentPools: input.componentPools,
      policy,
    });
    return {
      label: policy.label ?? policy.id ?? `Policy ${policy.distributableIncomePayoutBps}`,
      declaredCashDistribution: distribution.declaredCashDistribution,
      retainedCash: distribution.retainedCash,
      distributionPerUnit: distribution.distributionPerUnit.value,
    };
  });
}

export const RULES = [
  {
    id: "au-distribution.cash-policy-and-member-allocation.2026",
    domain: "AU_TRUST_TAX",
    title: "AU trust distribution policy, member allocation and statements",
    summary:
      "The engine converts accounting distributable income and the trust's distribution policy into declared cash distributions, allocates those distributions and attributed components by deterministic largest-remainder cents, applies optional time-weighted AMIT attribution, and builds AMMA or non-AMIT statement data with withholding reconciliation.",
    effectiveFrom: "2026-07-01",
    sources: [
      { title: "ATO | Attributing amounts to members", url: "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/attribution-managed-investment-trusts/attribution-method-for-managed-investment-trusts/attributing-amounts-to-members", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | AMMA statement and SDS 2024 example", url: "https://www.ato.gov.au/forms-and-instructions/attribution-managed-investment-trust-member-annual-statement-standard-distribution-statement-2024/amma-statement-or-sds-example", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | AMMA statement and SDS 2024 guidance notes", url: "https://www.ato.gov.au/forms-and-instructions/attribution-managed-investment-trust-member-annual-statement-standard-distribution-statement-2024/guidance-notes", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    confidence: "ASSUMPTION",
    notes:
      "The ATO materials retrieved for this engine clearly support fair-and-reasonable attribution and show record-date style outcomes, but they did not expressly endorse a daily time-weighted method. The TIME_WEIGHTED_DAILY option is therefore an engine assumption for scenario modelling, while RECORD_DATE remains available.",
  },
] as const satisfies readonly RuleEntry[];

export const NOTES = [ENGINE_DISCLAIMER_AU];
