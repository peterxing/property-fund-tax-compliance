import { computeCit } from "./cit.ts";
import type { ComputeCitResult, StartUpExemptionProfile } from "./cit.ts";
import { computeCapitalAllowances } from "./capitalAllowances.ts";
import type { CapitalAllowanceComputationInput, CapitalAllowanceComputationResult } from "./capitalAllowances.ts";
import { max0, ratioBps, roundToDollar, sum } from "./money.ts";
import type { Cents } from "./money.ts";
import { compareISO, diffDays, financialYearEnd, financialYearStart, yearOfAssessment, type ISODate } from "./dates.ts";
import { ENGINE_DISCLAIMER } from "./rules.ts";
import { getCategory, naturalAmount, totalsByCategory, type MappedTbLine, type TaxCategoryId } from "./taxonomy.ts";
import type { ComputationLine, EntityKind, Finding } from "./types.ts";

const RETRIEVED: ISODate = "2026-10-09";
const DONATION_DEDUCTION_MULTIPLIER_NUMERATOR = 25;
const DONATION_DEDUCTION_MULTIPLIER_DENOMINATOR = 10;

export interface TaxComputationEntityProfile {
  kind: EntityKind;
  uen?: string;
  incorporationDate?: ISODate;
  financialYearStart: ISODate;
  financialYearEnd: ISODate;
  taxResidency: "SG" | "NON_SG";
  principalActivity: string;
  hasOverseasIncome?: boolean;
  isSingaporeIncorporated?: boolean;
  isActiveCompany?: boolean;
  localEmployeeCount?: number;
  pillarTwoInScope?: boolean;
  shareholdingProfile?: {
    shareholderCount?: number;
    allShareholdersAreIndividuals?: boolean;
    hasIndividualShareholderWithAtLeast10Pct?: boolean;
  };
}

export type ManualAdjustmentType =
  | "ADD_BACK"
  | "DEDUCT"
  | "SEPARATE_SOURCE_INCOME"
  | "FURTHER_DEDUCTION"
  | "CURRENT_YEAR_APPROVED_DONATION"
  | "EXEMPT_FOREIGN_INCOME";

export interface ManualAdjustmentInput {
  id: string;
  label: string;
  type: ManualAdjustmentType;
  amount: Cents;
  reason?: string;
}

export interface ManualAdjustmentTypeCatalogueItem {
  id: ManualAdjustmentType;
  label: string;
  description: string;
  effect: "ADD" | "DEDUCT" | "NONE";
}

export const MANUAL_ADJUSTMENT_TYPES: readonly ManualAdjustmentTypeCatalogueItem[] = [
  { id: "ADD_BACK", label: "Add-back", description: "Adds back an accounting expense or deduction that is not tax-deductible.", effect: "ADD" },
  { id: "DEDUCT", label: "Deduct", description: "Deducts non-taxable income or a correction that should reduce adjusted profit.", effect: "DEDUCT" },
  { id: "SEPARATE_SOURCE_INCOME", label: "Separate source income", description: "Removes income from the normal Singapore-taxable pool so it can be reviewed separately (for example foreign-sourced income).", effect: "DEDUCT" },
  { id: "FURTHER_DEDUCTION", label: "Further deduction", description: "Claims an additional tax deduction beyond the accounting expense already recorded, such as a double-deduction style claim.", effect: "DEDUCT" },
  { id: "CURRENT_YEAR_APPROVED_DONATION", label: "Approved donation (current year)", description: "Records an approved donation for the current year; the 250% deduction is applied later against statutory income, not at adjusted-profit stage.", effect: "DEDUCT" },
  { id: "EXEMPT_FOREIGN_INCOME", label: "Exempt foreign income", description: "Removes foreign-sourced income that qualifies for exemption (for example under section 13(9)) from normal taxable income.", effect: "DEDUCT" },
] as const;

export interface DonationCarryForward {
  ya: number;
  amount: Cents;
}

export interface BroughtForwardAmounts {
  unabsorbedLosses: Cents;
  unabsorbedCapitalAllowances: Cents;
  unabsorbedDonations?: readonly DonationCarryForward[];
  shareholdingTestSatisfied: boolean;
  sameBusinessTestSatisfied?: boolean;
}

export interface TaxComputationSummaryInput {
  ya: number;
  accountingProfitBeforeTax: Cents;
  adjustedProfit: Cents;
  statutoryIncome: Cents;
  chargeableIncome: Cents;
  taxPayable: Cents;
}

export interface TaxComputationOptions {
  varianceThresholdBps?: number;
  highAddBackThresholdBps?: number;
}

export interface CapitalAllowanceTotalsInput {
  currentYearCapitalAllowances: Cents;
  currentYearSection14nDeduction?: Cents;
  currentYearBalancingAllowance?: Cents;
  currentYearBalancingCharge?: Cents;
}

export interface TaxComputationInput {
  entity: TaxComputationEntityProfile;
  lines: readonly MappedTbLine[];
  capitalAllowances?: CapitalAllowanceComputationResult | CapitalAllowanceTotalsInput;
  capitalAllowanceScheduleInput?: CapitalAllowanceComputationInput;
  broughtForward?: Partial<BroughtForwardAmounts>;
  manualAdjustments?: readonly ManualAdjustmentInput[];
  priorYearSummary?: TaxComputationSummaryInput;
  options?: TaxComputationOptions;
}

export interface TaxComputationSummary {
  ya: number;
  accountingProfitBeforeTax: Cents;
  adjustedProfit: Cents;
  statutoryIncome: Cents;
  exemptIncome: Cents;
  nonTaxableIncome: Cents;
  capitalAllowancesClaimed: Cents;
  lossesUtilised: Cents;
  chargeableIncomeBeforeExemptions: Cents;
  exemptAmount: Cents;
  chargeableIncome: Cents;
  taxBeforeRebate: Cents;
  citRebate: Cents;
  taxPayable: Cents;
  effectiveRateBps: number;
  unabsorbedLossesCf: Cents;
  unabsorbedCapitalAllowancesCf: Cents;
  donationsCf: Cents;
  donationCarryForwards: readonly DonationCarryForward[];
}

export interface TaxComputationResult {
  ya: number;
  lines: readonly ComputationLine[];
  summary: TaxComputationSummary;
  findings: readonly Finding[];
  notes: readonly string[];
}

function truncToWholeDollar(amount: Cents): Cents {
  return roundToDollar(amount);
}

function sumByNature(lines: readonly MappedTbLine[], nature: "INCOME" | "EXPENSE"): Cents {
  return sum(
    lines
      .filter((line) => getCategory(line.category)?.nature === nature)
      .map((line) => naturalAmount(line)),
  );
}

function buildCategoryFinding(id: string, category: TaxCategoryId, amount: Cents, guidance: string): Finding {
  return {
    id,
    severity: "WARNING",
    message: `${category} has a non-zero balance and requires review: ${guidance}`,
    subject: category,
    data: { amount },
  };
}

function getCapitalAllowanceTotals(input: TaxComputationInput, ya: number): CapitalAllowanceTotalsInput {
  if (input.capitalAllowanceScheduleInput) {
    const computed = computeCapitalAllowances(input.capitalAllowanceScheduleInput);
    const current = computed.yaSummaries.find((row) => row.ya === ya);
    if (!current) return { currentYearCapitalAllowances: 0 };
    return {
      currentYearCapitalAllowances: current.capitalAllowances + current.section19bAllowances + current.industrialBuildingAllowance + current.liaAllowance,
      currentYearSection14nDeduction: current.section14nDeduction,
      currentYearBalancingAllowance: current.balancingAllowance,
      currentYearBalancingCharge: current.balancingCharge,
    };
  }
  const capitalAllowances = input.capitalAllowances;
  if (!capitalAllowances) return { currentYearCapitalAllowances: 0 };
  if ("yaSummaries" in capitalAllowances) {
    const current = capitalAllowances.yaSummaries.find((row) => row.ya === ya);
    if (!current) return { currentYearCapitalAllowances: 0 };
    return {
      currentYearCapitalAllowances: current.capitalAllowances + current.section19bAllowances + current.industrialBuildingAllowance + current.liaAllowance,
      currentYearSection14nDeduction: current.section14nDeduction,
      currentYearBalancingAllowance: current.balancingAllowance,
      currentYearBalancingCharge: current.balancingCharge,
    };
  }
  return capitalAllowances;
}

function determineStartUpProfile(entity: TaxComputationEntityProfile, ya: number): StartUpExemptionProfile | undefined {
  if (!entity.incorporationDate) return undefined;
  return {
    ya,
    incorporationDate: entity.incorporationDate,
    financialYearEndMonth: Number(entity.financialYearEnd.slice(5, 7)),
    financialYearEndDay: Number(entity.financialYearEnd.slice(8, 10)),
    kind: entity.kind,
    isSingaporeIncorporated: entity.isSingaporeIncorporated ?? (entity.kind !== "REIT" && entity.kind !== "PROPERTY_FUND"),
    isSingaporeTaxResident: entity.taxResidency === "SG",
    principalActivity: entity.principalActivity,
    shareholderCount: entity.shareholdingProfile?.shareholderCount,
    allShareholdersAreIndividuals: entity.shareholdingProfile?.allShareholdersAreIndividuals,
    hasIndividualShareholderWithAtLeast10Pct: entity.shareholdingProfile?.hasIndividualShareholderWithAtLeast10Pct,
  };
}

function donationDeductionFromManualAdjustments(adjustments: readonly ManualAdjustmentInput[]): { baseAmount: Cents; deductionAmount: Cents } {
  const baseAmount = sum(adjustments.filter((adj) => adj.type === "CURRENT_YEAR_APPROVED_DONATION").map((adj) => max0(adj.amount)));
  const deductionAmount = baseAmount * DONATION_DEDUCTION_MULTIPLIER_NUMERATOR / DONATION_DEDUCTION_MULTIPLIER_DENOMINATOR;
  return { baseAmount, deductionAmount: Math.round(deductionAmount) };
}

function pushDonationCarryForward(target: DonationCarryForward[], ya: number, amount: Cents): void {
  if (amount <= 0) return;
  const existing = target.find((item) => item.ya === ya);
  if (existing) {
    existing.amount += amount;
    return;
  }
  target.push({ ya, amount });
}

export function computeTaxComputation(input: TaxComputationInput): TaxComputationResult {
  if (compareISO(input.entity.financialYearStart, input.entity.financialYearEnd) >= 0) {
    throw new RangeError("financialYearStart must be before financialYearEnd.");
  }
  const ya = yearOfAssessment(input.entity.financialYearEnd);
  const notes: string[] = [ENGINE_DISCLAIMER];
  const findings: Finding[] = [];
  const computationLines: ComputationLine[] = [];
  const categoryTotals = totalsByCategory([...input.lines]);
  const accountingProfitBeforeTax = sumByNature(input.lines, "INCOME") - sumByNature(input.lines, "EXPENSE");
  const totalDebits = sum(input.lines.map((line) => line.debit));
  const totalCredits = sum(input.lines.map((line) => line.credit));
  if (totalDebits !== totalCredits) {
    findings.push({ id: "TAXCOMP.UNBALANCED_INPUT", severity: "WARNING", message: "Trial balance inputs are not balanced.", data: { totalDebits, totalCredits, difference: totalDebits - totalCredits } });
  }

  computationLines.push({ code: "PBT", label: "Profit / (loss) before tax per accounts", amount: accountingProfitBeforeTax, kind: "TOTAL", source: "TB" });

  let addBacks = 0;
  let nonTaxableIncome = 0;
  let exemptIncome = 0;
  let separateSourceIncome = 0;
  let furtherDeductions = 0;
  const needsReviewCategories: TaxCategoryId[] = ["INC_GAIN_DISPOSAL", "INC_FOREIGN", "EXP_REPAIRS_MAINT", "EXP_ENTERTAINMENT"];

  for (const [categoryId, amount] of Object.entries(categoryTotals) as [TaxCategoryId, Cents][]) {
    const category = getCategory(categoryId);
    if (!category || amount === 0) continue;
    if (category.needsReview || needsReviewCategories.includes(categoryId)) {
      findings.push(buildCategoryFinding(`TAXCOMP.REVIEW.${categoryId}`, categoryId, amount, category.guidance));
    }
    if (category.nature === "EXPENSE" && category.treatment === "NON_DEDUCTIBLE") {
      addBacks += amount;
      computationLines.push({ code: `ADJ.ADD.${categoryId}`, label: `Add back: ${category.label}`, amount, kind: "AMOUNT", source: "AUTO_ADJUSTMENT", ref: category.ref, note: category.guidance, needsReview: category.needsReview });
    }
    if (category.nature === "INCOME" && category.treatment === "NON_TAXABLE") {
      nonTaxableIncome += amount;
      computationLines.push({ code: `ADJ.DEDUCT.${categoryId}`, label: `Deduct: ${category.label}`, amount: -amount, kind: "AMOUNT", source: "AUTO_ADJUSTMENT", ref: category.ref, note: category.guidance, needsReview: category.needsReview });
    }
    if (category.nature === "INCOME" && category.treatment === "EXEMPT") {
      exemptIncome += amount;
      computationLines.push({ code: `ADJ.EXEMPT.${categoryId}`, label: `Deduct exempt income: ${category.label}`, amount: -amount, kind: "AMOUNT", source: "AUTO_ADJUSTMENT", ref: category.ref, note: category.guidance, needsReview: category.needsReview });
    }
    if (categoryId === "INC_FOREIGN") separateSourceIncome += amount;
  }

  const manualAdjustments = [...(input.manualAdjustments ?? [])];
  for (const adjustment of manualAdjustments) {
    const sign = adjustment.type === "ADD_BACK" ? 1 : -1;
    const lineAmount = adjustment.type === "CURRENT_YEAR_APPROVED_DONATION" ? 0 : sign * adjustment.amount;
    computationLines.push({ code: `MANUAL.${adjustment.id}`, label: adjustment.label, amount: lineAmount, kind: adjustment.type === "CURRENT_YEAR_APPROVED_DONATION" ? "INFO" : "AMOUNT", source: "MANUAL_ADJUSTMENT", needsReview: true, note: adjustment.reason });
    if (adjustment.type === "ADD_BACK") addBacks += adjustment.amount;
    if (adjustment.type === "DEDUCT") nonTaxableIncome += adjustment.amount;
    if (adjustment.type === "SEPARATE_SOURCE_INCOME") separateSourceIncome += adjustment.amount;
    if (adjustment.type === "FURTHER_DEDUCTION") furtherDeductions += adjustment.amount;
    if (adjustment.type === "EXEMPT_FOREIGN_INCOME") exemptIncome += adjustment.amount;
  }

  const donationInfo = donationDeductionFromManualAdjustments(manualAdjustments);
  const capitalAllowanceTotals = getCapitalAllowanceTotals(input, ya);
  // "Further deductions" are modelled immediately after the standard accounting-to-tax adjustments because they represent
  // an extra tax deduction on top of an expense already reflected in the accounts (for example a double-deduction style claim).
  // Current-year approved donations remain separate because IRAS applies them later against statutory income.
  const adjustedProfit = accountingProfitBeforeTax + addBacks - nonTaxableIncome - exemptIncome - separateSourceIncome - furtherDeductions;
  computationLines.push({ code: "ADJUSTED_PROFIT", label: "Adjusted profit before capital allowances", amount: adjustedProfit, kind: "SUBTOTAL", source: "RULE" });

  const statutoryIncome = adjustedProfit + max0(capitalAllowanceTotals.currentYearBalancingCharge ?? 0);
  if ((capitalAllowanceTotals.currentYearBalancingCharge ?? 0) > 0) {
    computationLines.push({ code: "BALANCING_CHARGE", label: "Add: balancing charge", amount: capitalAllowanceTotals.currentYearBalancingCharge ?? 0, kind: "AMOUNT", source: "SCHEDULE" });
  }

  const bf = {
    unabsorbedLosses: max0(input.broughtForward?.unabsorbedLosses ?? 0),
    unabsorbedCapitalAllowances: max0(input.broughtForward?.unabsorbedCapitalAllowances ?? 0),
    unabsorbedDonations: [...(input.broughtForward?.unabsorbedDonations ?? [])].sort((a, b) => a.ya - b.ya),
    shareholdingTestSatisfied: input.broughtForward?.shareholdingTestSatisfied ?? true,
    sameBusinessTestSatisfied: input.broughtForward?.sameBusinessTestSatisfied ?? true,
  } satisfies BroughtForwardAmounts;

  let profitAfterCurrentYearDeductions = statutoryIncome;
  const utilisableProfitBeforeBf = max0(profitAfterCurrentYearDeductions);
  const utilisedBfCapitalAllowances = bf.shareholdingTestSatisfied && bf.sameBusinessTestSatisfied ? Math.min(utilisableProfitBeforeBf, bf.unabsorbedCapitalAllowances) : 0;
  if (!bf.shareholdingTestSatisfied || !bf.sameBusinessTestSatisfied) {
    findings.push({ id: "TAXCOMP.SHAREHOLDING_TEST", severity: "WARNING", message: "Brought-forward losses / capital allowances / donations were restricted because the shareholding and/or same-business conditions were not met." });
  }
  profitAfterCurrentYearDeductions -= utilisedBfCapitalAllowances;
  if (utilisedBfCapitalAllowances > 0) computationLines.push({ code: "BF_CA", label: "Less: unabsorbed capital allowances brought forward", amount: -utilisedBfCapitalAllowances, kind: "AMOUNT", source: "CARRY_FORWARD" });

  const currentYearCapitalAllowances = max0(capitalAllowanceTotals.currentYearCapitalAllowances ?? 0) + max0(capitalAllowanceTotals.currentYearBalancingAllowance ?? 0) + max0(capitalAllowanceTotals.currentYearSection14nDeduction ?? 0);
  const utilisedCurrentYearCapitalAllowances = Math.min(max0(profitAfterCurrentYearDeductions), currentYearCapitalAllowances);
  profitAfterCurrentYearDeductions -= utilisedCurrentYearCapitalAllowances;
  if (currentYearCapitalAllowances > 0) computationLines.push({ code: "CY_CA", label: "Less: current-year capital allowances / s14N / balancing allowance", amount: -utilisedCurrentYearCapitalAllowances, kind: "AMOUNT", source: "SCHEDULE" });

  const utilisedLosses = bf.shareholdingTestSatisfied ? Math.min(max0(profitAfterCurrentYearDeductions), bf.unabsorbedLosses) : 0;
  profitAfterCurrentYearDeductions -= utilisedLosses;
  if (utilisedLosses > 0) computationLines.push({ code: "BF_LOSSES", label: "Less: unabsorbed losses brought forward", amount: -utilisedLosses, kind: "AMOUNT", source: "CARRY_FORWARD" });

  let remainingForDonations = profitAfterCurrentYearDeductions;
  let utilisedDonationBf = 0;
  const donationCarryForwards: DonationCarryForward[] = [];
  for (const donation of bf.unabsorbedDonations) {
    if (ya - donation.ya > 5) continue;
    const use = bf.shareholdingTestSatisfied ? Math.min(max0(remainingForDonations), donation.amount) : 0;
    utilisedDonationBf += use;
    remainingForDonations -= use;
    pushDonationCarryForward(donationCarryForwards, donation.ya, donation.amount - use);
  }
  if (utilisedDonationBf > 0) computationLines.push({ code: "BF_DONATIONS", label: "Less: unutilised donations brought forward", amount: -utilisedDonationBf, kind: "AMOUNT", source: "CARRY_FORWARD" });

  const utilisedCurrentYearDonations = Math.min(max0(remainingForDonations), donationInfo.deductionAmount);
  remainingForDonations -= utilisedCurrentYearDonations;
  pushDonationCarryForward(donationCarryForwards, ya, donationInfo.deductionAmount - utilisedCurrentYearDonations);
  if (donationInfo.deductionAmount > 0) computationLines.push({ code: "CY_DONATIONS", label: "Less: approved donations (2.5x)", amount: -utilisedCurrentYearDonations, kind: "AMOUNT", source: "MANUAL_ADJUSTMENT", needsReview: true, note: "Approved donations are entered manually / pre-filled by IRAS." });

  const chargeableIncomeBeforeExemptions = max0(remainingForDonations);
  computationLines.push({ code: "CI_BEFORE_EXEMPTION", label: "Chargeable income before exemptions", amount: chargeableIncomeBeforeExemptions, kind: "SUBTOTAL", source: "RULE" });

  const cit = computeCit({
    ya,
    normalChargeableIncome: chargeableIncomeBeforeExemptions,
    startUpExemption: determineStartUpProfile(input.entity, ya),
    isActiveCompany: input.entity.isActiveCompany,
    localEmployeeCount: input.entity.localEmployeeCount,
    pillarTwoInScope: input.entity.pillarTwoInScope,
    entityIsCompany: input.entity.kind !== "REIT",
  });
  findings.push(...cit.findings);
  computationLines.push(...cit.lines);

  const unabsorbedCapitalAllowancesCf = bf.unabsorbedCapitalAllowances - utilisedBfCapitalAllowances + currentYearCapitalAllowances - utilisedCurrentYearCapitalAllowances;
  const currentYearTradeLossCf = max0(-statutoryIncome);
  const unabsorbedLossesCf = bf.unabsorbedLosses - utilisedLosses + currentYearTradeLossCf;
  const donationsCf = sum(donationCarryForwards.map((item) => item.amount));

  if (statutoryIncome < 0) findings.push({ id: "TAXCOMP.NEGATIVE_STATUTORY_INCOME", severity: "WARNING", message: "Statutory income is negative; verify the mapping and brought-forward logic.", data: { statutoryIncome } });
  const addBackThresholdBps = input.options?.highAddBackThresholdBps ?? 2000;
  if (accountingProfitBeforeTax > 0 && ratioBps(addBacks, accountingProfitBeforeTax) >= addBackThresholdBps) {
    findings.push({ id: "TAXCOMP.HIGH_ADDBACKS", severity: "WARNING", message: "Non-deductible add-backs are high relative to accounting profit.", data: { addBacks, accountingProfitBeforeTax, ratioBps: ratioBps(addBacks, accountingProfitBeforeTax) } });
  }
  if (input.entity.hasOverseasIncome || separateSourceIncome > 0) {
    findings.push({ id: "TAXCOMP.FOREIGN_INCOME", severity: "INFO", message: "Foreign-sourced income has been separated in the working. Confirm any section 13(9) exemption or foreign tax credit treatment manually.", data: { separateSourceIncome } });
  }
  if (input.entity.kind === "REIT") {
    findings.push({ id: "TAXCOMP.REIT_INFO", severity: "INFO", message: "Entity-level tax has been computed as a base case only. Trustee-level tax transparency / distribution treatment must be applied by the REIT distribution module." });
  }
  if (input.entity.kind === "DEVELOPER") {
    findings.push({ id: "TAXCOMP.DEVELOPER_RECOGNITION", severity: "INFO", message: "Developer revenue has been taken from the accounts. For ECI, IRAS expects property developers to use the Completed Contracts Method unless an IRAS concession applies." });
  }
  const periodDays = diffDays(input.entity.financialYearStart, input.entity.financialYearEnd) + 1;
  if (periodDays > 366 && input.entity.incorporationDate && compareISO(input.entity.incorporationDate, input.entity.financialYearStart) >= 0) {
    findings.push({ id: "TAXCOMP.MULTI_YA_PERIOD", severity: "INFO", message: "The first set of accounts appears to exceed 12 months and may need attribution to 2 YAs under IRAS' new-company basis-period guidance." });
  }
  if (input.priorYearSummary) {
    const prior = input.priorYearSummary;
    const varianceBase = Math.abs(prior.chargeableIncome) || 1;
    const varianceBps = ratioBps(Math.abs(chargeableIncomeBeforeExemptions - prior.chargeableIncome), varianceBase);
    if (varianceBps >= (input.options?.varianceThresholdBps ?? 3000)) {
      findings.push({ id: "TAXCOMP.PRIOR_YEAR_VARIANCE", severity: "WARNING", message: "Chargeable income has moved materially versus the prior year summary.", data: { varianceBps, current: chargeableIncomeBeforeExemptions, prior: prior.chargeableIncome } });
    }
  }

  const effectiveRateBps = accountingProfitBeforeTax > 0 ? ratioBps(cit.taxPayable, accountingProfitBeforeTax) : 0;
  if (accountingProfitBeforeTax > 0 && (effectiveRateBps < 0 || effectiveRateBps > 3000)) {
    findings.push({ id: "TAXCOMP.ETR_OUTLIER", severity: "WARNING", message: "The effective tax rate falls outside the platform's default reasonableness band; review exemptions, non-taxable income and manual adjustments.", data: { effectiveRateBps } });
  }

  const summary: TaxComputationSummary = {
    ya,
    accountingProfitBeforeTax,
    adjustedProfit,
    statutoryIncome,
    exemptIncome,
    nonTaxableIncome,
    capitalAllowancesClaimed: utilisedBfCapitalAllowances + utilisedCurrentYearCapitalAllowances,
    lossesUtilised: utilisedLosses,
    chargeableIncomeBeforeExemptions,
    exemptAmount: cit.exemptionAmount,
    chargeableIncome: cit.chargeableIncomeAfterExemption,
    taxBeforeRebate: cit.taxBeforeRebate,
    citRebate: cit.rebate,
    taxPayable: cit.taxPayable,
    effectiveRateBps,
    unabsorbedLossesCf,
    unabsorbedCapitalAllowancesCf,
    donationsCf,
    donationCarryForwards,
  };

  notes.push(...cit.notes);
  return { ya, lines: computationLines, summary, findings, notes };
}

export const RULES = [
  {
    id: "tax-computation.preparing-tax-computation.2022-plus",
    domain: "CORPORATE_TAX",
    title: "IRAS tax computation flow",
    summary: "The computation starts from accounting profit, adjusts for non-taxable income and disallowable expenses, separates certain investment/foreign income, then applies capital allowances, brought-forward items, donations, tax exemptions and CIT rebates.",
    effectiveFrom: "2022-01-01",
    sources: [
      {
        title: "IRAS | Preparing a Tax Computation",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/form-c-s-form-c-s-(lite)-form-c-filing/preparing-a-tax-computation",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
      {
        title: "IRAS | Unutilised Items (Capital Allowances, Trade Losses & Donations)",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/unutilised-items-(capital-allowances-trade-losses-donations)",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
      {
        title: "IRAS | Companies Receiving Foreign Income",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/companies-receiving-foreign-income",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
      {
        title: "IRAS | Tax Treatment of Business Expenses (A-F)",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/business-expenses/tax-treatment-of-business-expenses-(a-f)",
        retrieved: RETRIEVED,
        publisher: "IRAS",
      },
    ],
    confidence: "VERIFIED",
    notes: "This engine does not model foreign tax credit, group relief or loss carry-back mechanics inside the main statement of taxable income.",
  },
] as const;
