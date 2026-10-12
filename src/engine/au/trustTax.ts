import { max0, mulBps, ratioBps, roundToDollar, sum, type Cents } from "../money.ts";
import { ENGINE_DISCLAIMER_AU, type Effective, type RuleEntry, requireEffective } from "../rules.ts";
import type { ComputationLine, Finding } from "../types.ts";
import type { AuIncomeCharacter, AuIncomeYear, AuTaxRegime } from "./types.ts";
import { auNaturalAmount, auTotalsByCategory, getAuCategory, type AuMappedTbLine, type AuTaxCategoryId } from "./taxonomy.ts";

const RETRIEVED = "2026-10-10";

export type AuTrustManualAdjustmentType = "ADD_BACK" | "DEDUCT" | "ASSESSABLE_INCOME";

export interface AuTrustManualAdjustment {
  id: string;
  label: string;
  amount: Cents;
  type: AuTrustManualAdjustmentType;
  reason?: string;
  character?: AuIncomeCharacter;
}

export interface AuCapitalGainInput {
  discountable: Cents;
  other: Cents;
}

export interface AuForeignResidentBeneficiaryFact {
  label?: string;
  netIncomeAmount: Cents;
  taxpayerClass?: "INDIVIDUAL" | "OTHER";
}

export interface AuTrustDistributionFacts {
  presentlyEntitledNetIncomeAmount?: Cents;
  notPresentlyEntitledNetIncomeAmount?: Cents;
  undistributedTaxMode?: "SECTION_99" | "SECTION_99A";
  foreignResidentBeneficiaries?: readonly AuForeignResidentBeneficiaryFact[];
}

export interface AuTrustTaxInput {
  incomeYear: AuIncomeYear;
  regime: AuTaxRegime;
  lines: readonly AuMappedTbLine[];
  capitalWorksDeduction?: Cents;
  depreciatingAssetsDeduction?: Cents;
  borrowingExpensesDeduction?: Cents;
  blackHoleExpenditureDeduction?: Cents;
  netCapitalGainBeforeDiscount?: AuCapitalGainInput;
  priorYearTaxLossesBroughtForward?: Cents;
  straightLineRentAdjustment?: Cents;
  manualAdjustments?: readonly AuTrustManualAdjustment[];
  distribution?: AuTrustDistributionFacts;
  residentTrustEstate?: boolean;
  tofaReviewRequired?: boolean;
  thinCapitalisationReviewRequired?: boolean;
  division6CReviewRequired?: boolean;
  trustLossReviewRequired?: boolean;
  s100AReviewRequired?: boolean;
}

export interface AuTrustTaxComponent {
  character: AuIncomeCharacter;
  amount: Cents;
}

export interface AuTrusteeTaxLiability {
  basis: "SECTION_99" | "SECTION_99A" | "SECTION_98_FOREIGN_RESIDENT";
  taxableAmount: Cents;
  tax: Cents;
  label: string;
}

export interface AuTrustTaxSummary {
  accountingProfit: Cents;
  netIncomeOfTrustEstate: Cents;
  taxableIncomeForTrustee: Cents;
  discountableCapitalGainGross: Cents;
  discountApplied: Cents;
  components: readonly AuTrustTaxComponent[];
  presentlyEntitledNetIncomeAmount: Cents;
  notPresentlyEntitledNetIncomeAmount: Cents;
  trusteeLevelTax: readonly AuTrusteeTaxLiability[];
}

export interface AuTrustTaxResult {
  incomeYear: AuIncomeYear;
  lines: readonly ComputationLine[];
  summary: AuTrustTaxSummary;
  findings: readonly Finding[];
  notes: readonly string[];
}

interface RateBand {
  upTo: Cents | null;
  bps: number;
  baseTax?: Cents;
  baseOver?: Cents;
}

const RESIDENT_BANDS: Readonly<Record<AuIncomeYear, readonly RateBand[]>> = {
  2023: [
    { upTo: 1_820_000, bps: 0 },
    { upTo: 4_500_000, bps: 1900, baseOver: 1_820_000, baseTax: 0 },
    { upTo: 12_000_000, bps: 3250, baseOver: 4_500_000, baseTax: 509_200 },
    { upTo: 18_000_000, bps: 3700, baseOver: 12_000_000, baseTax: 2_946_700 },
    { upTo: null, bps: 4500, baseOver: 18_000_000, baseTax: 5_166_700 },
  ],
  2024: [
    { upTo: 1_820_000, bps: 0 },
    { upTo: 4_500_000, bps: 1900, baseOver: 1_820_000, baseTax: 0 },
    { upTo: 12_000_000, bps: 3250, baseOver: 4_500_000, baseTax: 509_200 },
    { upTo: 18_000_000, bps: 3700, baseOver: 12_000_000, baseTax: 2_946_700 },
    { upTo: null, bps: 4500, baseOver: 18_000_000, baseTax: 5_166_700 },
  ],
  2025: [
    { upTo: 1_820_000, bps: 0 },
    { upTo: 4_500_000, bps: 1600, baseOver: 1_820_000, baseTax: 0 },
    { upTo: 13_500_000, bps: 3000, baseOver: 4_500_000, baseTax: 428_800 },
    { upTo: 19_000_000, bps: 3700, baseOver: 13_500_000, baseTax: 3_128_800 },
    { upTo: null, bps: 4500, baseOver: 19_000_000, baseTax: 5_163_800 },
  ],
  2026: [
    { upTo: 1_820_000, bps: 0 },
    { upTo: 4_500_000, bps: 1600, baseOver: 1_820_000, baseTax: 0 },
    { upTo: 13_500_000, bps: 3000, baseOver: 4_500_000, baseTax: 428_800 },
    { upTo: 19_000_000, bps: 3700, baseOver: 13_500_000, baseTax: 3_128_800 },
    { upTo: null, bps: 4500, baseOver: 19_000_000, baseTax: 5_163_800 },
  ],
} as const;

const FOREIGN_BANDS: Readonly<Record<AuIncomeYear, readonly RateBand[]>> = {
  2023: [
    { upTo: 12_000_000, bps: 3250, baseOver: 0, baseTax: 0 },
    { upTo: 18_000_000, bps: 3700, baseOver: 12_000_000, baseTax: 3_900_000 },
    { upTo: null, bps: 4500, baseOver: 18_000_000, baseTax: 6_120_000 },
  ],
  2024: [
    { upTo: 13_500_000, bps: 3000, baseOver: 0, baseTax: 0 },
    { upTo: 19_000_000, bps: 3700, baseOver: 13_500_000, baseTax: 4_050_000 },
    { upTo: null, bps: 4500, baseOver: 19_000_000, baseTax: 6_085_000 },
  ],
  2025: [
    { upTo: 13_500_000, bps: 3000, baseOver: 0, baseTax: 0 },
    { upTo: 19_000_000, bps: 3700, baseOver: 13_500_000, baseTax: 4_050_000 },
    { upTo: null, bps: 4500, baseOver: 19_000_000, baseTax: 6_085_000 },
  ],
  2026: [
    { upTo: 13_500_000, bps: 3000, baseOver: 0, baseTax: 0 },
    { upTo: 19_000_000, bps: 3700, baseOver: 13_500_000, baseTax: 4_050_000 },
    { upTo: null, bps: 4500, baseOver: 19_000_000, baseTax: 6_085_000 },
  ],
} as const;

const MEDICARE_LEVY_RATES: readonly Effective<number>[] = [
  { from: "2021-07-01", value: 200 },
];

function medicareLevyRateBps(incomeYear: AuIncomeYear): number {
  return requireEffective(MEDICARE_LEVY_RATES, `${incomeYear - 1}-07-01`, `AU Medicare levy rate for ${incomeYear}`);
}

function toWholeDollar(amount: Cents): Cents {
  return roundToDollar(amount);
}

function applyScale(base: Cents, bps: number, over: Cents, amount: Cents): Cents {
  return base + mulBps(Math.max(0, amount - over), bps);
}

function residentIndividualTax(incomeYear: AuIncomeYear, amount: Cents): Cents {
  const bands = RESIDENT_BANDS[incomeYear];
  if (!bands) throw new RangeError(`Resident trust tax scale not configured for income year ${incomeYear}`);
  const rounded = toWholeDollar(max0(amount));
  for (const band of bands) {
    if (band.upTo === null || rounded <= band.upTo) {
      return applyScale(band.baseTax ?? 0, band.bps, band.baseOver ?? 0, rounded);
    }
  }
  return 0;
}

function foreignResidentIndividualTax(incomeYear: AuIncomeYear, amount: Cents): Cents {
  const bands = FOREIGN_BANDS[incomeYear];
  if (!bands) throw new RangeError(`Foreign resident tax scale not configured for income year ${incomeYear}`);
  const rounded = toWholeDollar(max0(amount));
  for (const band of bands) {
    if (band.upTo === null || rounded <= band.upTo) {
      return applyScale(band.baseTax ?? 0, band.bps, band.baseOver ?? 0, rounded);
    }
  }
  return 0;
}

function pushComponent(target: Map<AuIncomeCharacter, Cents>, character: AuIncomeCharacter | undefined, amount: Cents): void {
  if (!character || amount === 0) return;
  target.set(character, (target.get(character) ?? 0) + amount);
}

function summariseComponents(lines: readonly AuMappedTbLine[], manualAdjustments: readonly AuTrustManualAdjustment[], capitalGains: AuCapitalGainInput | undefined, straightLineRentAdjustment: Cents): readonly AuTrustTaxComponent[] {
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

function addReview(findings: Finding[], id: string, categoryId: AuTaxCategoryId, amount: Cents, guidance: string): void {
  findings.push({ id, severity: "WARNING", subject: categoryId, message: `${categoryId} requires tax review: ${guidance}`, data: { amount } });
}

export function computeAuTrustTax(input: AuTrustTaxInput): AuTrustTaxResult {
  if (input.regime === "PUBLIC_TRADING_TRUST") {
    throw new RangeError("Public trading trusts are taxed like companies; use computeAuCompanyTax instead.");
  }
  if (input.regime === "COMPANY") {
    throw new RangeError("computeAuTrustTax is only for trust regimes.");
  }

  const notes: string[] = [
    ENGINE_DISCLAIMER_AU,
    "This module produces a property-trust style statement of taxable income. It does not model MIT withholding, AMMA statement production, unders/overs, franking-credit offsets, beneficiary tax offsets, or CGT foreign resident withholding.",
  ];
  const findings: Finding[] = [];
  const lines: ComputationLine[] = [];
  const totals = auTotalsByCategory(input.lines);
  const accountingIncome = sum(input.lines.filter((line) => getAuCategory(line.category)?.nature === "INCOME").map((line) => auNaturalAmount(line)));
  const accountingExpenses = sum(input.lines.filter((line) => getAuCategory(line.category)?.nature === "EXPENSE").map((line) => auNaturalAmount(line)));
  const accountingProfit = accountingIncome - accountingExpenses;
  lines.push({ code: "AUTR.PBT", label: "Accounting profit / (loss) before tax", amount: accountingProfit, kind: "TOTAL", source: "TB" });

  let addBacks = 0;
  let deductions = 0;
  for (const [categoryId, amount] of Object.entries(totals) as [AuTaxCategoryId, Cents][]) {
    const category = getAuCategory(categoryId);
    if (!category || amount === 0) continue;
    if (category.needsReview) addReview(findings, `AUTR.REVIEW.${categoryId}`, categoryId, amount, category.guidance);
    if (category.nature === "INCOME" && (category.treatment === "NON_ASSESSABLE" || category.treatment === "CAPITAL" || category.treatment === "TIMING_DIFFERENCE")) {
      deductions += amount;
      lines.push({ code: `AUTR.DEDUCT.${categoryId}`, label: `Deduct: ${category.label}`, amount: -amount, kind: "AMOUNT", source: "AUTO_ADJUSTMENT", note: category.guidance, needsReview: category.needsReview });
    }
    if (category.nature === "EXPENSE" && (category.treatment === "NON_DEDUCTIBLE" || category.treatment === "CAPITAL" || category.treatment === "TIMING_DIFFERENCE")) {
      addBacks += amount;
      lines.push({ code: `AUTR.ADD.${categoryId}`, label: `Add back: ${category.label}`, amount, kind: "AMOUNT", source: "AUTO_ADJUSTMENT", note: category.guidance, needsReview: category.needsReview });
    }
  }

  const manualAdjustments = [...(input.manualAdjustments ?? [])];
  for (const adjustment of manualAdjustments) {
    if (adjustment.type === "ADD_BACK") addBacks += max0(adjustment.amount);
    if (adjustment.type === "DEDUCT") deductions += max0(adjustment.amount);
    if (adjustment.type === "ASSESSABLE_INCOME") deductions -= max0(adjustment.amount);
    lines.push({
      code: `AUTR.MANUAL.${adjustment.id}`,
      label: adjustment.label,
      amount: adjustment.type === "ADD_BACK" ? adjustment.amount : adjustment.type === "DEDUCT" ? -adjustment.amount : adjustment.amount,
      kind: "AMOUNT",
      source: "MANUAL_ADJUSTMENT",
      ...(adjustment.reason ? { note: adjustment.reason } : {}),
      needsReview: true,
    });
  }

  const straightLineRentAdjustment = input.straightLineRentAdjustment ?? 0;
  if (straightLineRentAdjustment !== 0) {
    deductions += straightLineRentAdjustment;
    lines.push({ code: "AUTR.STRAIGHT_LINE_RENT", label: "Deduct straight-line rent timing adjustment", amount: -straightLineRentAdjustment, kind: "AMOUNT", source: "SCHEDULE", note: "Positive amounts reverse non-cash straight-line rent recognised in accounting profit." });
  }

  const scheduleDeductions = max0(input.capitalWorksDeduction ?? 0) + max0(input.depreciatingAssetsDeduction ?? 0) + max0(input.borrowingExpensesDeduction ?? 0) + max0(input.blackHoleExpenditureDeduction ?? 0);
  if (scheduleDeductions > 0) {
    lines.push({ code: "AUTR.SCHEDULE_DEDUCTIONS", label: "Less tax-schedule deductions (Div 40 / Div 43 / borrowing / blackhole)", amount: -scheduleDeductions, kind: "AMOUNT", source: "SCHEDULE" });
  }

  const capitalGains = input.netCapitalGainBeforeDiscount ?? { discountable: 0, other: 0 };
  const discountableGross = max0(capitalGains.discountable);
  const discountApplied = Math.round(discountableGross / 2);
  const discountableIncluded = discountableGross - discountApplied;
  const otherCapitalGain = max0(capitalGains.other);
  if (discountableGross > 0) {
    lines.push({ code: "AUTR.CGT_DISCOUNTABLE_GROSS", label: "Gross discountable capital gains", amount: discountableGross, kind: "AMOUNT", source: "SCHEDULE" });
    lines.push({ code: "AUTR.CGT_DISCOUNT", label: "Less 50% CGT discount for resident trust", amount: -discountApplied, kind: "AMOUNT", source: "RULE", note: "Resident trusts generally reduce eligible capital gains by 50% after capital losses." });
  }
  if (otherCapitalGain > 0) {
    lines.push({ code: "AUTR.CGT_OTHER", label: "Other net capital gains", amount: otherCapitalGain, kind: "AMOUNT", source: "SCHEDULE" });
  }
  const netCapitalGainIncluded = discountableIncluded + otherCapitalGain;

  const preLossNetIncome = accountingProfit + addBacks - deductions - scheduleDeductions + netCapitalGainIncluded;
  let taxLossesApplied = 0;
  if (max0(input.priorYearTaxLossesBroughtForward ?? 0) > 0) {
    taxLossesApplied = Math.min(max0(input.priorYearTaxLossesBroughtForward ?? 0), max0(preLossNetIncome));
    lines.push({ code: "AUTR.TAX_LOSSES", label: "Less prior-year tax losses", amount: -taxLossesApplied, kind: "AMOUNT", source: "CARRY_FORWARD" });
  }
  const netIncomeOfTrustEstate = max0(preLossNetIncome - taxLossesApplied);
  lines.push({ code: "AUTR.NET_INCOME", label: "Net income of the trust estate (s 95 ITAA 1936)", amount: netIncomeOfTrustEstate, kind: "TOTAL", source: "RULE", ref: "s 95 ITAA 1936" });

  const components = summariseComponents(input.lines, manualAdjustments, capitalGains, straightLineRentAdjustment);
  const foreignResidentFacts = [...(input.distribution?.foreignResidentBeneficiaries ?? [])];
  const foreignResidentAmount = sum(foreignResidentFacts.map((fact) => max0(fact.netIncomeAmount)));
  const presentlyEntitledAmount = max0(input.distribution?.presentlyEntitledNetIncomeAmount ?? Math.max(0, netIncomeOfTrustEstate - (input.distribution?.notPresentlyEntitledNetIncomeAmount ?? 0)));
  const undistributedAmount = max0(input.distribution?.notPresentlyEntitledNetIncomeAmount ?? Math.max(0, netIncomeOfTrustEstate - presentlyEntitledAmount));

  const trusteeLevelTax: AuTrusteeTaxLiability[] = [];
  if (undistributedAmount > 0) {
    const mode = input.distribution?.undistributedTaxMode ?? "SECTION_99A";
    const baseTax = mode === "SECTION_99" ? residentIndividualTax(input.incomeYear, undistributedAmount) : mulBps(toWholeDollar(undistributedAmount), 4500);
    const medicareLevy = mulBps(toWholeDollar(undistributedAmount), medicareLevyRateBps(input.incomeYear));
    const tax = baseTax + medicareLevy;
    trusteeLevelTax.push({
      basis: mode,
      taxableAmount: undistributedAmount,
      tax,
      label: mode === "SECTION_99" ? "Trustee tax on income to which no beneficiary is presently entitled (s 99 basis)" : "Trustee tax on income to which no beneficiary is presently entitled (s 99A special-rate basis)",
    });
    lines.push({ code: `AUTR.${mode}.TAX`, label: mode === "SECTION_99" ? "Section 99 trustee tax before Medicare levy" : "Section 99A trustee tax before Medicare levy", amount: baseTax, kind: "AMOUNT", source: "RULE", ref: mode === "SECTION_99" ? "s 99 ITAA 1936" : "s 99A ITAA 1936" });
    lines.push({ code: `AUTR.${mode}.MEDICARE_LEVY`, label: "Medicare levy on trustee assessment", amount: medicareLevy, kind: "AMOUNT", source: "RULE", ref: "s 251S(1)(c) ITAA 1936" });
    lines.push({ code: `AUTR.${mode}`, label: trusteeLevelTax[trusteeLevelTax.length - 1]!.label, amount: tax, kind: "AMOUNT", source: "RULE", ref: mode === "SECTION_99" ? "s 99 ITAA 1936" : "s 99A ITAA 1936" });
    notes.push("Medicare levy is added to trustee assessments under sections 99 and 99A because section 251S(1)(c) applies to trustees assessed and liable to pay tax under those provisions; the engine does not model broader Part VIIB reductions, exemptions or deceased-estate exceptions.");
    findings.push({ id: "AUTR.MEDICARE_LEVY_REVIEW", severity: "INFO", message: "Trustee Medicare levy under sections 99 and 99A is modelled at the published 2% rate, but this module does not test low-income relief, other Part VIIB adjustments or the deceased-estate exception." });
  }
  for (const fact of foreignResidentFacts) {
    if ((fact.taxpayerClass ?? "INDIVIDUAL") !== "INDIVIDUAL") {
      findings.push({ id: "AUTR.FOREIGN_BENEFICIARY_UNMODELLED", severity: "WARNING", message: `Foreign resident beneficiary "${fact.label ?? "unnamed"}" was flagged for trustee assessment, but only individual-rate modelling is supported in this module.` });
      continue;
    }
    const tax = foreignResidentIndividualTax(input.incomeYear, fact.netIncomeAmount);
    trusteeLevelTax.push({ basis: "SECTION_98_FOREIGN_RESIDENT", taxableAmount: fact.netIncomeAmount, tax, label: `Trustee tax on foreign resident beneficiary ${fact.label ?? ""}`.trim() });
    lines.push({ code: `AUTR.S98.${trusteeLevelTax.length}`, label: trusteeLevelTax[trusteeLevelTax.length - 1]!.label, amount: tax, kind: "AMOUNT", source: "RULE", ref: "s 98 ITAA 1936" });
  }

  if (input.regime === "AMIT") notes.push("AMIT attribution, unders/overs, cost-base-net-amount adjustments and AMMA reporting are handled by the distribution agent, not this STI engine.");
  if (input.regime === "MIT") notes.push("MIT withholding and fund-payment analysis are handled outside this module.");
  if (input.tofaReviewRequired ?? true) findings.push({ id: "AUTR.TOFA_REVIEW", severity: "INFO", message: "TOFA and derivative tax timing can materially change the result where derivatives or financing arrangements are significant." });
  if (input.thinCapitalisationReviewRequired) findings.push({ id: "AUTR.THIN_CAP", severity: "INFO", message: "Thin capitalisation / debt deduction creation rules should be reviewed for inward-investing or foreign-controlled groups." });
  if (input.division6CReviewRequired) findings.push({ id: "AUTR.DIV6C", severity: "WARNING", message: "Review whether the trust could be a public trading trust under Division 6C; if so it is taxed like a company." });
  if (input.trustLossReviewRequired || max0(input.priorYearTaxLossesBroughtForward ?? 0) > 0) findings.push({ id: "AUTR.TRUST_LOSSES", severity: "INFO", message: "Trust loss recoupment and income injection tests should be reviewed before relying on prior-year trust losses." });
  if (input.s100AReviewRequired || input.regime === "DISCRETIONARY_TRUST") findings.push({ id: "AUTR.S100A", severity: "INFO", message: "Review present-entitlement arrangements for potential section 100A reimbursement-agreement risk." });
  if (!input.residentTrustEstate) findings.push({ id: "AUTR.NON_RESIDENT_TRUST", severity: "WARNING", message: "This module assumes a resident trust estate for most computations; non-resident trust source apportionment needs manual review." });

  return {
    incomeYear: input.incomeYear,
    lines,
    summary: {
      accountingProfit,
      netIncomeOfTrustEstate,
      taxableIncomeForTrustee: netIncomeOfTrustEstate,
      discountableCapitalGainGross: discountableGross,
      discountApplied,
      components,
      presentlyEntitledNetIncomeAmount: presentlyEntitledAmount,
      notPresentlyEntitledNetIncomeAmount: undistributedAmount,
      trusteeLevelTax,
    },
    findings,
    notes,
  };
}

export const RULES: readonly RuleEntry[] = [
  {
    id: "au-trust-tax.statement-of-taxable-income.2022-07-01",
    domain: "AU_TRUST_TAX",
    title: "Property-trust statement of taxable income",
    summary: "Trust net income is worked out under section 95 as if the trustee were a resident taxpayer, replacing accounting capital and timing items with the tax result and adding CGT, Division 40, Division 43 and borrowing-expense schedules.",
    effectiveFrom: "2022-07-01",
    sources: [
      {
        title: "ITAA 1936 section 95",
        url: "https://www.ato.gov.au/law/view/document?DocID=PAC/19360027/95",
        retrieved: RETRIEVED,
        publisher: "ATO legal database",
      },
      {
        title: "ATO | CGT discount",
        url: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/cgt-discount",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
      {
        title: "ATO | Trust tax return 2025 instructions – general information for trusts",
        url: "https://www.ato.gov.au/forms-and-instructions/trust-tax-return-2025-instructions/general-information-for-trusts",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
    ],
    confidence: "VERIFIED",
    notes: "The STI engine assumes the CGT schedule has already netted capital losses before passing discountable and other net capital gains into this module.",
  },
  {
    id: "au-trust-tax.trustee-assessment.2022-07-01",
    domain: "AU_TRUST_TAX",
    title: "Trustee-level tax where no beneficiary is presently entitled or foreign residents are assessed through the trustee",
    summary: "Section 99 and section 99A deal with income to which no beneficiary is presently entitled. Section 98 can assess a trustee on behalf of certain beneficiaries, including foreign residents. This engine only verifies foreign-resident individual rate modelling and flags the rest for review.",
    effectiveFrom: "2022-07-01",
    sources: [
      {
        title: "ITAA 1936 section 99",
        url: "https://www.ato.gov.au/law/view/document?DocID=PAC/19360027/99",
        retrieved: RETRIEVED,
        publisher: "ATO legal database",
      },
      {
        title: "ITAA 1936 section 99A",
        url: "https://www.ato.gov.au/law/view/document?DocID=PAC/19360027/99A",
        retrieved: RETRIEVED,
        publisher: "ATO legal database",
      },
      {
        title: "ATO | Foreign resident tax rates",
        url: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-foreign-residents",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
      {
        title: "ATO | Australian resident tax rates",
        url: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
      {
        title: "ITAA 1936 section 100A",
        url: "https://www.ato.gov.au/law/view/document?DocID=PAC/19360027/100A",
        retrieved: RETRIEVED,
        publisher: "ATO legal database",
      },
      {
        title: "ITAA 1936 section 251S",
        url: "https://www.ato.gov.au/law/view/document?DocID=PAC/19360027/251S",
        retrieved: RETRIEVED,
        publisher: "ATO legal database",
      },
    ],
    confidence: "ASSUMPTION",
    notes: "Sections 99, 99A and 251S were read directly, and the 2% Medicare levy rate was read from the ATO resident-rates page. The section 99A special-rate percentage is still modelled to the top published resident marginal rate in the cited sources, so the overall rule remains an assumption. Beneficiary classes other than foreign-resident individuals are not modelled.",
  },
  {
    id: "au-trust-tax.trust-loss-review.2022-07-01",
    domain: "AU_TRUST_TAX",
    title: "Trust losses and Division 6C require manual review",
    summary: "Trust loss recoupment depends on Schedule 2F tests that vary by trust type, while public trading trusts under Division 6C are taxed like companies and must not stay in the trust STI workflow.",
    effectiveFrom: "2022-07-01",
    sources: [
      {
        title: "ATO | Trust loss provisions – about trust loss provisions",
        url: "https://www.ato.gov.au/businesses-and-organisations/trusts/trust-income-losses-and-capital-gains/trust-loss-provisions/about-trust-loss-provisions",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
      {
        title: "ATO | Trust loss provisions – which tests to apply",
        url: "https://www.ato.gov.au/businesses-and-organisations/trusts/trust-income-losses-and-capital-gains/trust-loss-provisions/which-tests-to-apply",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
      {
        title: "ATO | Attribution MIT tax return instructions 2026 – how to lodge your AMIT tax return and pay",
        url: "https://www.ato.gov.au/forms-and-instructions/attribution-managed-investment-trust-tax-return-instructions-2026/how-to-lodge-your-amit-tax-return-and-pay",
        retrieved: RETRIEVED,
        publisher: "ATO",
      },
    ],
    confidence: "VERIFIED",
    notes: "Division 6C status, trust loss tests and MIT/AMIT distribution mechanics are flagged for review or handled in other AU agents, not fully determined in this module.",
  },
] as const;
