import { max0, mulBps, ratioBps, roundToDollar, sum, type Cents } from "../money.ts";
import { ENGINE_DISCLAIMER_AU, type Effective, type RuleEntry, requireEffective } from "../rules.ts";
import type { ComputationLine, Finding } from "../types.ts";
import type { AuIncomeCharacter, AuIncomeYear, AuTaxRegime } from "./types.ts";
import { auTotalsByCategory, auNaturalAmount, getAuCategory, type AuMappedTbLine, type AuTaxCategoryId } from "./taxonomy.ts";

const RETRIEVED = "2026-10-10";

export type AuCompanyManualAdjustmentType = "ADD_BACK" | "DEDUCT" | "ASSESSABLE_INCOME";

export interface AuCompanyManualAdjustment {
  id: string;
  label: string;
  amount: Cents;
  type: AuCompanyManualAdjustmentType;
  reason?: string;
  character?: AuIncomeCharacter;
}

export interface AuCapitalGainInput {
  discountable: Cents;
  other: Cents;
}

export interface AuCompanyTaxInput {
  incomeYear: AuIncomeYear;
  regime: Extract<AuTaxRegime, "COMPANY" | "PUBLIC_TRADING_TRUST">;
  lines: readonly AuMappedTbLine[];
  capitalWorksDeduction?: Cents;
  depreciatingAssetsDeduction?: Cents;
  borrowingExpensesDeduction?: Cents;
  blackHoleExpenditureDeduction?: Cents;
  netCapitalGainBeforeDiscount?: AuCapitalGainInput;
  priorYearTaxLossesBroughtForward?: Cents;
  manualAdjustments?: readonly AuCompanyManualAdjustment[];
  straightLineRentAdjustment?: Cents;
  aggregatedTurnover: Cents;
  additionalPassiveIncomeAmount?: Cents;
  continuityOfOwnershipTestPassed?: boolean;
  businessContinuityTestPassed?: boolean;
  frankingCreditsReceived?: Cents;
}

export interface AuCompanyTaxComponent {
  character: AuIncomeCharacter;
  amount: Cents;
}

export interface AuCompanyTaxSummary {
  accountingProfit: Cents;
  assessableIncome: Cents;
  taxableIncomeBeforeLosses: Cents;
  taxLossesApplied: Cents;
  taxableIncome: Cents;
  rateBps: number;
  taxBeforeCredits: Cents;
  taxPayable: Cents;
  baseRateEntity: boolean;
  passiveIncomeBps: number;
  passiveIncomeAmount: Cents;
  components: readonly AuCompanyTaxComponent[];
}

export interface AuCompanyTaxResult {
  incomeYear: AuIncomeYear;
  lines: readonly ComputationLine[];
  summary: AuCompanyTaxSummary;
  findings: readonly Finding[];
  notes: readonly string[];
}

interface CompanyRateProfile {
  aggregatedTurnoverThreshold: Cents;
  baseRateEntityRateBps: number;
  generalRateBps: number;
}

const COMPANY_RATE_PROFILES: readonly Effective<CompanyRateProfile>[] = [
  { from: "2017-07-01", to: "2018-06-30", value: { aggregatedTurnoverThreshold: 2_500_000_000, baseRateEntityRateBps: 2750, generalRateBps: 3000 } },
  { from: "2018-07-01", to: "2020-06-30", value: { aggregatedTurnoverThreshold: 5_000_000_000, baseRateEntityRateBps: 2750, generalRateBps: 3000 } },
  { from: "2020-07-01", to: "2021-06-30", value: { aggregatedTurnoverThreshold: 5_000_000_000, baseRateEntityRateBps: 2600, generalRateBps: 3000 } },
  { from: "2021-07-01", to: "2022-06-30", value: { aggregatedTurnoverThreshold: 5_000_000_000, baseRateEntityRateBps: 2500, generalRateBps: 3000 } },
  { from: "2022-07-01", value: { aggregatedTurnoverThreshold: 5_000_000_000, baseRateEntityRateBps: 2500, generalRateBps: 3000 } },
];

const PASSIVE_CHARACTERS = new Set<AuIncomeCharacter>(["RENT", "INTEREST", "FRANKED_DIVIDEND", "UNFRANKED_DIVIDEND", "CAPITAL_GAIN_DISCOUNTABLE", "CAPITAL_GAIN_OTHER"]);

function ruleDate(incomeYear: AuIncomeYear): string {
  return `${incomeYear - 1}-07-01`;
}

function pushComponent(target: Map<AuIncomeCharacter, Cents>, character: AuIncomeCharacter | undefined, amount: Cents): void {
  if (!character || amount === 0) return;
  target.set(character, (target.get(character) ?? 0) + amount);
}

function addFinding(findings: Finding[], id: string, categoryId: AuTaxCategoryId, amount: Cents, guidance: string): void {
  findings.push({ id, severity: "WARNING", subject: categoryId, message: `${categoryId} requires tax review: ${guidance}`, data: { amount } });
}

function toWholeDollar(amount: Cents): Cents {
  return roundToDollar(amount);
}

function companyTaxOnAmount(taxableIncome: Cents, rateBps: number): Cents {
  return mulBps(toWholeDollar(max0(taxableIncome)), rateBps);
}

function summariseComponents(lines: readonly AuMappedTbLine[], manualAdjustments: readonly AuCompanyManualAdjustment[], capitalGains: AuCapitalGainInput | undefined, straightLineRentAdjustment: Cents): readonly AuCompanyTaxComponent[] {
  const totals = auTotalsByCategory(lines);
  const byCharacter = new Map<AuIncomeCharacter, Cents>();
  for (const [categoryId, amount] of Object.entries(totals) as [AuTaxCategoryId, Cents][]) {
    const category = getAuCategory(categoryId);
    if (!category || category.nature !== "INCOME" || amount === 0) continue;
    if (category.treatment === "TAXABLE") pushComponent(byCharacter, category.character, amount);
    if (category.treatment === "TIMING_DIFFERENCE" && category.character === "RENT") pushComponent(byCharacter, "RENT", -amount);
  }
  if (straightLineRentAdjustment !== 0) pushComponent(byCharacter, "RENT", -straightLineRentAdjustment);
  for (const adjustment of manualAdjustments) {
    if (!adjustment.character) continue;
    if (adjustment.type === "ASSESSABLE_INCOME") pushComponent(byCharacter, adjustment.character, adjustment.amount);
    if (adjustment.type === "DEDUCT") pushComponent(byCharacter, adjustment.character, -adjustment.amount);
  }
  if (capitalGains) {
    pushComponent(byCharacter, "CAPITAL_GAIN_DISCOUNTABLE", capitalGains.discountable);
    pushComponent(byCharacter, "CAPITAL_GAIN_OTHER", capitalGains.other);
  }
  return [...byCharacter.entries()].filter(([, amount]) => amount !== 0).map(([character, amount]) => ({ character, amount }));
}

export function computeAuCompanyTax(input: AuCompanyTaxInput): AuCompanyTaxResult {
  if (input.regime !== "COMPANY" && input.regime !== "PUBLIC_TRADING_TRUST") {
    throw new RangeError(`computeAuCompanyTax cannot be used for regime ${input.regime}.`);
  }
  const rateProfile = requireEffective(COMPANY_RATE_PROFILES, ruleDate(input.incomeYear), `AU company tax rate for ${input.incomeYear}`);
  const findings: Finding[] = [];
  const notes: string[] = [ENGINE_DISCLAIMER_AU, "Franking account consequences are out of scope; this computation only recognises assessable franked amounts and a franking-credit review flag."];
  const totals = auTotalsByCategory(input.lines);
  const lines: ComputationLine[] = [];
  const accountingIncome = sum(input.lines.filter((line) => getAuCategory(line.category)?.nature === "INCOME").map((line) => auNaturalAmount(line)));
  const accountingExpenses = sum(input.lines.filter((line) => getAuCategory(line.category)?.nature === "EXPENSE").map((line) => auNaturalAmount(line)));
  const accountingProfit = accountingIncome - accountingExpenses;
  lines.push({ code: "AUCO.PBT", label: "Accounting profit / (loss) before tax", amount: accountingProfit, kind: "TOTAL", source: "TB" });

  let addBacks = 0;
  let deductions = 0;
  let assessableIncome = 0;
  for (const [categoryId, amount] of Object.entries(totals) as [AuTaxCategoryId, Cents][]) {
    const category = getAuCategory(categoryId);
    if (!category || amount === 0) continue;
    if (category.needsReview) addFinding(findings, `AUCO.REVIEW.${categoryId}`, categoryId, amount, category.guidance);
    if (category.nature === "INCOME") {
      if (category.treatment === "TAXABLE") assessableIncome += amount;
      if (category.treatment === "NON_ASSESSABLE" || category.treatment === "CAPITAL" || category.treatment === "TIMING_DIFFERENCE") {
        deductions += amount;
        lines.push({ code: `AUCO.DEDUCT.${categoryId}`, label: `Deduct: ${category.label}`, amount: -amount, kind: "AMOUNT", source: "AUTO_ADJUSTMENT", note: category.guidance, needsReview: category.needsReview });
      }
    }
    if (category.nature === "EXPENSE" && (category.treatment === "NON_DEDUCTIBLE" || category.treatment === "CAPITAL" || category.treatment === "TIMING_DIFFERENCE")) {
      addBacks += amount;
      lines.push({ code: `AUCO.ADD.${categoryId}`, label: `Add back: ${category.label}`, amount, kind: "AMOUNT", source: "AUTO_ADJUSTMENT", note: category.guidance, needsReview: category.needsReview });
    }
  }

  const manualAdjustments = [...(input.manualAdjustments ?? [])];
  for (const adjustment of manualAdjustments) {
    const sign = adjustment.type === "ADD_BACK" ? 1 : -1;
    if (adjustment.type === "ADD_BACK") addBacks += max0(adjustment.amount);
    if (adjustment.type === "DEDUCT") deductions += max0(adjustment.amount);
    if (adjustment.type === "ASSESSABLE_INCOME") assessableIncome += max0(adjustment.amount);
    lines.push({
      code: `AUCO.MANUAL.${adjustment.id}`,
      label: adjustment.label,
      amount: adjustment.type === "ASSESSABLE_INCOME" ? adjustment.amount : sign * adjustment.amount,
      kind: "AMOUNT",
      source: "MANUAL_ADJUSTMENT",
      ...(adjustment.reason ? { note: adjustment.reason } : {}),
      needsReview: true,
    });
  }

  const straightLineRentAdjustment = input.straightLineRentAdjustment ?? 0;
  if (straightLineRentAdjustment !== 0) {
    deductions += straightLineRentAdjustment;
    lines.push({ code: "AUCO.STRAIGHT_LINE_RENT", label: "Deduct straight-line rent timing adjustment", amount: -straightLineRentAdjustment, kind: "AMOUNT", source: "SCHEDULE", note: "Positive amounts reverse non-cash straight-line rent recognised in accounting profit." });
  }

  const capitalGains = input.netCapitalGainBeforeDiscount ?? { discountable: 0, other: 0 };
  const grossCapitalGain = max0(capitalGains.discountable) + max0(capitalGains.other);
  if (grossCapitalGain > 0) {
    assessableIncome += grossCapitalGain;
    lines.push({ code: "AUCO.NET_CAPITAL_GAIN", label: "Net capital gain included (companies do not get the CGT discount)", amount: grossCapitalGain, kind: "AMOUNT", source: "SCHEDULE", note: "The company rate computation includes the full net capital gain passed in from the CGT schedule." });
  }

  const scheduleDeductions = max0(input.capitalWorksDeduction ?? 0) + max0(input.depreciatingAssetsDeduction ?? 0) + max0(input.borrowingExpensesDeduction ?? 0) + max0(input.blackHoleExpenditureDeduction ?? 0);
  const taxableIncomeBeforeLosses = accountingProfit + addBacks - deductions - scheduleDeductions + grossCapitalGain;
  lines.push({ code: "AUCO.TAXABLE_BEFORE_LOSSES", label: "Taxable income before prior-year losses", amount: taxableIncomeBeforeLosses, kind: "SUBTOTAL", source: "RULE" });
  if (scheduleDeductions > 0) {
    lines.push({ code: "AUCO.SCHEDULE_DEDUCTIONS", label: "Less tax-schedule deductions (Div 40 / Div 43 / borrowing / blackhole)", amount: -scheduleDeductions, kind: "AMOUNT", source: "SCHEDULE" });
  }

  const cotPassed = input.continuityOfOwnershipTestPassed ?? true;
  const bctPassed = input.businessContinuityTestPassed ?? true;
  let taxLossesApplied = 0;
  if (max0(input.priorYearTaxLossesBroughtForward ?? 0) > 0) {
    if (cotPassed || bctPassed) {
      taxLossesApplied = Math.min(max0(input.priorYearTaxLossesBroughtForward ?? 0), max0(taxableIncomeBeforeLosses));
    } else {
      findings.push({ id: "AUCO.LOSSES_RESTRICTED", severity: "WARNING", message: "Prior-year tax losses were not used because neither continuity of ownership nor the business continuity test was confirmed." });
    }
  }
  const taxableIncome = max0(taxableIncomeBeforeLosses - taxLossesApplied);
  if (taxLossesApplied > 0) {
    lines.push({ code: "AUCO.BF_LOSSES", label: "Less prior-year tax losses applied", amount: -taxLossesApplied, kind: "AMOUNT", source: "CARRY_FORWARD" });
  }

  const components = summariseComponents(input.lines, manualAdjustments, capitalGains, straightLineRentAdjustment);
  const passiveIncomeAmount = sum(components.filter((component) => PASSIVE_CHARACTERS.has(component.character)).map((component) => max0(component.amount))) + max0(input.additionalPassiveIncomeAmount ?? 0);
  const passiveIncomeBps = ratioBps(passiveIncomeAmount, max0(assessableIncome));
  const baseRateEntity = max0(input.aggregatedTurnover) < rateProfile.aggregatedTurnoverThreshold && passiveIncomeBps <= 8000;
  const rateBps = baseRateEntity ? rateProfile.baseRateEntityRateBps : rateProfile.generalRateBps;
  const taxBeforeCredits = companyTaxOnAmount(taxableIncome, rateBps);
  if (!baseRateEntity && passiveIncomeBps > 8000) {
    findings.push({ id: "AUCO.BRE_PASSIVE_INCOME", severity: "INFO", message: "The 25% base-rate-entity rate was denied because base-rate-entity passive income exceeded 80% of assessable income.", data: { passiveIncomeBps } });
  }
  if (!baseRateEntity && max0(input.aggregatedTurnover) === rateProfile.aggregatedTurnoverThreshold) {
    findings.push({ id: "AUCO.BRE_THRESHOLD", severity: "INFO", message: "The company is not a base rate entity because aggregated turnover must be less than the threshold, not equal to it." });
  }
  if (max0(input.frankingCreditsReceived ?? 0) > 0) {
    findings.push({ id: "AUCO.FRANKING_CREDITS_REVIEW", severity: "WARNING", message: "Franked income was identified but franking-credit gross-up and offsets are not modelled in this module.", data: { frankingCreditsReceived: input.frankingCreditsReceived ?? 0 } });
  }
  if (input.regime === "PUBLIC_TRADING_TRUST") {
    notes.push("This taxpayer is modelled as a public trading trust taxed like a company. Distribution and Division 6 trust concepts are not applied here.");
  }
  lines.push({ code: "AUCO.RATE", label: `Company tax rate (${baseRateEntity ? "base rate entity" : "general"})`, amount: rateBps, kind: "PERCENT", source: "RULE" });
  lines.push({ code: "AUCO.TAXABLE_INCOME", label: "Taxable income", amount: taxableIncome, kind: "SUBTOTAL", source: "RULE" });
  lines.push({ code: "AUCO.TAX_PAYABLE", label: "Tax payable", amount: taxBeforeCredits, kind: "TOTAL", source: "RULE" });

  return {
    incomeYear: input.incomeYear,
    lines,
    summary: {
      accountingProfit,
      assessableIncome,
      taxableIncomeBeforeLosses,
      taxLossesApplied,
      taxableIncome,
      rateBps,
      taxBeforeCredits,
      taxPayable: taxBeforeCredits,
      baseRateEntity,
      passiveIncomeBps,
      passiveIncomeAmount,
      components,
    },
    findings,
    notes,
  };
}

export const RULES: readonly RuleEntry[] = [
  {
    id: "au-company-tax.rate-and-bre.2017-07-01",
    domain: "AU_INCOME_TAX",
    title: "Australian company tax rate and base rate entity test",
    summary: "From 2017–18 onward, the lower company tax rate changed by income year: 27.5% at sub-$25 million turnover for 2017–18, 27.5% at sub-$50 million turnover for 2018–19 and 2019–20, 26% for 2020–21, and 25% from 2021–22 onward. Non-base-rate entities stay at 30%.",
    effectiveFrom: "2017-07-01",
    sources: [
      {
        title: "ATO | Company tax rates – 2025–26",
        url: "https://www.ato.gov.au/tax-rates-and-codes/company-tax-rates/tax-rates-2025-26",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
      {
        title: "ATO | Company tax rate changes",
        url: "https://www.ato.gov.au/tax-rates-and-codes/company-tax-rate-changes",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
      {
        title: "ATO | Lower company tax rate",
        url: "https://www.ato.gov.au/businesses-and-organisations/corporate-tax-measures-and-assurance/privately-owned-and-wealthy-groups/what-attracts-our-attention/business-structure/lower-company-tax-rate",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
    ],
    confidence: "VERIFIED",
    notes: "This module keeps amounts in cents for engine precision. Franking credits, offsets, instalment credits and company-loss ownership tracing are flagged but not fully modelled.",
  },
  {
    id: "au-company-tax.loss-review.2026-07-01",
    domain: "AU_INCOME_TAX",
    title: "Company loss usage needs continuity of ownership or business continuity support",
    summary: "The losses schedule instructions require companies to consider the continuity of majority ownership test and, if failed, the business continuity test before deducting prior-year losses.",
    effectiveFrom: "2026-07-01",
    sources: [
      {
        title: "ATO | Losses schedule 2026 instructions – Part B ownership and business continuity test",
        url: "https://www.ato.gov.au/forms-and-instructions/losses-schedule-2026-instructions/instructions-to-complete-the-losses-schedule-2026/part-b-ownership-and-business-continuity-test",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
    ],
    confidence: "VERIFIED",
    notes: "The engine only consumes caller-supplied pass/fail facts for the ownership and business continuity tests; it does not determine them from share registers.",
  },
] as const;
