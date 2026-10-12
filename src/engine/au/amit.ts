import { addMonths, addYears, type ISODate } from "../dates.ts";
import { allocate, type Cents } from "../money.ts";
import type { RuleEntry } from "../rules.ts";
import { ENGINE_DISCLAIMER_AU } from "../rules.ts";
import type { ComputationLine, Finding } from "../types.ts";
import type { AuIncomeCharacter, AuIncomeYear } from "./types.ts";
import type { AuMemberProfile } from "./members.ts";

export type AuCharacterMap = Partial<Record<AuIncomeCharacter, Cents>>;

export interface AmitUnderOverAdjustment {
  character: AuIncomeCharacter;
  amount: Cents;
  adjustmentType: "UNDER" | "OVER";
  baseYear: AuIncomeYear;
}

export interface DetermineTrustComponentsInput {
  incomeYear: AuIncomeYear;
  baseComponents: AuCharacterMap;
  undersOvers?: readonly AmitUnderOverAdjustment[];
  roundingDeficits?: AuCharacterMap;
  roundingSurpluses?: AuCharacterMap;
}

export interface DetermineTrustComponentsResult {
  incomeYear: AuIncomeYear;
  determinedTrustComponents: Record<AuIncomeCharacter, Cents>;
  carryForwardDeficits: Partial<Record<AuIncomeCharacter, Cents>>;
  discoveryYearConsequences: {
    capitalLossesByCharacter: Partial<Record<"CAPITAL_GAIN_DISCOUNTABLE" | "CAPITAL_GAIN_OTHER", Cents>>;
    deductionsByCharacter: Partial<Record<"RENT" | "INTEREST" | "OTHER_AU_INCOME" | "FRANKED_DIVIDEND" | "UNFRANKED_DIVIDEND" | "FOREIGN_INCOME", Cents>>;
    reductionsToExemptOrNaneByCharacter: Partial<Record<"NON_ASSESSABLE_TAX_FREE" | "NON_ASSESSABLE_TAX_EXEMPT", Cents>>;
  };
  working: ComputationLine[];
  findings: Finding[];
  notes: string[];
}

export interface AmitMemberAllocation {
  memberId: string;
  member: AuMemberProfile;
  weight: number;
}

export interface AttributeTrustComponentsInput {
  determinedTrustComponents: AuCharacterMap;
  members: readonly AmitMemberAllocation[];
}

export interface AttributedMemberComponents {
  memberId: string;
  member: AuMemberProfile;
  weight: number;
  components: Record<AuIncomeCharacter, Cents>;
}

export interface AttributeTrustComponentsResult {
  members: AttributedMemberComponents[];
  totals: Record<AuIncomeCharacter, Cents>;
  findings: Finding[];
}

export interface AmitCostBaseNetAmountInput {
  assessableAttributed: Cents;
  naneAttributed: Cents;
  taxOffsets: Cents;
  cashPaymentsOrEntitlements: Cents;
  startingCostBase?: Cents;
}

export interface AmitCostBaseNetAmountResult {
  increaseAmount: Cents;
  reductionAmount: Cents;
  shortfallIncrease: Cents;
  excessDecrease: Cents;
  closingCostBase?: Cents;
  cgtEventE10Gain: Cents;
  working: ComputationLine[];
}

export interface BuildAmmaStatementInput {
  incomeYearEnd: ISODate;
  memberId: string;
  member: AuMemberProfile;
  attributedComponents: AuCharacterMap;
  cashDistribution: Cents;
  taxOffsets: Cents;
  frankingCreditsTaxOffset?: Cents;
  tfnWithheld?: Cents;
  foreignResidentWithheld?: Cents;
  managedInvestmentTrustFundPayments?: Cents;
  amountsWithheldFromManagedInvestmentTrustFundPayments?: Cents;
  paragraph2761052abAmount?: Cents;
  paragraph2761052cAmount?: Cents;
  costBaseNetAmount: AmitCostBaseNetAmountResult;
}

export interface AmmaStatement {
  memberId: string;
  /** Platform field: keep for API compatibility; do not print as an ATO AMMA label. */
  memberClass: AuMemberProfile["memberClass"];
  dueDate: ISODate;
  amendableUntil: ISODate;
  partA: {
    memberNameOrIdentifier: string;
    quotedTaxFileNumberOrAbn: boolean;
    countryOfResidence?: string;
  };
  officialFields: {
    managedInvestmentTrustFundPayments: Cents;
    amountsWithheldFromManagedInvestmentTrustFundPayments: Cents;
    paragraph2761052abAmounts: Cents;
    paragraph2761052cAmounts: Cents;
    shareOfCreditForTaxFileNumberAmountsWithheld: Cents;
    shareOfCreditForForeignResidentWithholdingAmounts: Cents;
    shareOfFrankingCreditFromFrankedDistributions: Cents;
  };
  summary: {
    /** Platform summary alias for UI/model use; official label sits in officialFields. */
    shareOfNetIncomeFromTrusts: Cents;
    /** Platform summary alias for "share of franking credit from franked distributions". */
    frankingCreditOffset: Cents;
    /** Platform summary alias for "share of credit for tax file number amounts withheld". */
    tfnCredit: Cents;
    /** Platform summary alias for "share of credit for foreign resident withholding amounts". */
    foreignResidentCredit: Cents;
    netCapitalGain: Cents;
    assessableForeignIncome: Cents;
  };
  components: {
    byCharacter: Record<AuIncomeCharacter, Cents>;
    grossCashDistribution: Cents;
    taxOffsets: Cents;
    frankingCreditsTaxOffset: Cents;
    costBaseExcessDecrease: Cents;
    costBaseShortfallIncrease: Cents;
  };
  presentation: {
    atoFieldLabels: Record<string, string>;
    platformOnlyFields: readonly string[];
  };
  notes: string[];
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

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function isAssessable(character: AuIncomeCharacter): boolean {
  return !character.startsWith("NON_ASSESSABLE_");
}

function isNane(character: AuIncomeCharacter): boolean {
  return character === "NON_ASSESSABLE_TAX_EXEMPT";
}

function capitalGainAmount(components: AuCharacterMap): Cents {
  return (components.CAPITAL_GAIN_DISCOUNTABLE ?? 0) + (components.CAPITAL_GAIN_OTHER ?? 0);
}

export function ammaDueDate(incomeYearEnd: ISODate): ISODate {
  return addMonths(incomeYearEnd, 3);
}

export function ammaRevisionCutoff(incomeYearEnd: ISODate): ISODate {
  return addYears(incomeYearEnd, 4);
}

export function determineTrustComponents(input: DetermineTrustComponentsInput): DetermineTrustComponentsResult {
  const determinedTrustComponents = zeroed();
  const carryForwardDeficits: Partial<Record<AuIncomeCharacter, Cents>> = {};
  const discoveryYearConsequences: DetermineTrustComponentsResult["discoveryYearConsequences"] = {
    capitalLossesByCharacter: {},
    deductionsByCharacter: {},
    reductionsToExemptOrNaneByCharacter: {},
  };
  const working: ComputationLine[] = [];
  for (const character of ALL_CHARACTERS) {
    const base = assertCents(input.baseComponents[character], `${character} base component`);
    const underNet = sum((input.undersOvers ?? []).filter((row) => row.character === character).map((row) => (row.adjustmentType === "UNDER" ? row.amount : -row.amount)));
    const roundingDeficit = assertCents(input.roundingDeficits?.[character], `${character} rounding deficit`);
    const roundingSurplus = assertCents(input.roundingSurpluses?.[character], `${character} rounding surplus`);
    const adjusted = base + underNet + roundingDeficit - roundingSurplus;
    if (adjusted >= 0) {
      determinedTrustComponents[character] = adjusted;
    } else {
      determinedTrustComponents[character] = 0;
      const residualDecrease = -adjusted;
      if (character === "CAPITAL_GAIN_DISCOUNTABLE" || character === "CAPITAL_GAIN_OTHER") {
        discoveryYearConsequences.capitalLossesByCharacter[character] = residualDecrease;
        working.push({
          code: `AU.AMIT.${character}.DISCOVERY_YEAR_CAPITAL_LOSS`,
          label: `${character} excess decrease treated as capital loss in discovery year`,
          amount: residualDecrease,
          kind: "AMOUNT",
          source: "RULE",
          ref: "ATO unders and overs guidance",
        });
      } else if (character === "NON_ASSESSABLE_TAX_FREE" || character === "NON_ASSESSABLE_TAX_EXEMPT") {
        discoveryYearConsequences.reductionsToExemptOrNaneByCharacter[character] = residualDecrease;
        working.push({
          code: `AU.AMIT.${character}.DISCOVERY_YEAR_REDUCTION`,
          label: `${character} excess decrease applied against discovery-year exempt/NANE amount`,
          amount: residualDecrease,
          kind: "AMOUNT",
          source: "RULE",
          ref: "ATO unders and overs guidance",
        });
      } else {
        discoveryYearConsequences.deductionsByCharacter[character as keyof typeof discoveryYearConsequences.deductionsByCharacter] = residualDecrease;
        working.push({
          code: `AU.AMIT.${character}.DISCOVERY_YEAR_DEDUCTION`,
          label: `${character} excess decrease treated as deduction in discovery year`,
          amount: residualDecrease,
          kind: "AMOUNT",
          source: "RULE",
          ref: "ATO unders and overs guidance",
        });
      }
    }
    working.push({ code: `AU.AMIT.${character}.BASE`, label: `${character} base component`, amount: base, kind: "AMOUNT", source: "RULE" });
    if (underNet !== 0) working.push({ code: `AU.AMIT.${character}.UNDER_OVER`, label: `${character} unders less overs`, amount: underNet, kind: "AMOUNT", source: "RULE" });
    if (roundingDeficit !== 0) working.push({ code: `AU.AMIT.${character}.ROUNDING_DEFICIT`, label: `${character} rounding deficit`, amount: roundingDeficit, kind: "AMOUNT", source: "RULE" });
    if (roundingSurplus !== 0) working.push({ code: `AU.AMIT.${character}.ROUNDING_SURPLUS`, label: `${character} rounding surplus`, amount: -roundingSurplus, kind: "AMOUNT", source: "RULE" });
    working.push({ code: `AU.AMIT.${character}.DETERMINED`, label: `${character} determined trust component`, amount: determinedTrustComponents[character], kind: "TOTAL", source: "RULE" });
  }
  return {
    incomeYear: input.incomeYear,
    determinedTrustComponents,
    carryForwardDeficits,
    discoveryYearConsequences,
    working,
    findings: [],
    notes: [
      "The engine floors each trust component at nil.",
      "Where an over would push a discovery-year component below nil, the residual decrease is modelled using the ATO's unders-and-overs consequences for that character instead of carrying a like-for-like deficit forward.",
    ],
  };
}

export function attributeTrustComponents(input: AttributeTrustComponentsInput): AttributeTrustComponentsResult {
  const totals = zeroed();
  const members = input.members.map((member) => ({ memberId: member.memberId, member: member.member, weight: member.weight, components: zeroed() }));
  const findings: Finding[] = [];
  const weights = input.members.map((member) => member.weight);
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new RangeError("member weights must be finite and non-negative");
  }
  for (const character of ALL_CHARACTERS) {
    const total = assertCents(input.determinedTrustComponents[character], `${character} determined trust component`);
    const parts = allocate(total, weights);
    for (let index = 0; index < members.length; index += 1) {
      members[index]!.components[character] = parts[index] ?? 0;
    }
    totals[character] = parts.reduce((sumParts, part) => sumParts + part, 0);
  }
  return { members, totals, findings };
}

export function computeAmitCostBaseNetAmount(input: AmitCostBaseNetAmountInput): AmitCostBaseNetAmountResult {
  const assessableAttributed = assertCents(input.assessableAttributed, "assessableAttributed");
  const naneAttributed = assertCents(input.naneAttributed, "naneAttributed");
  const taxOffsets = assertCents(input.taxOffsets, "taxOffsets");
  const cashPaymentsOrEntitlements = assertCents(input.cashPaymentsOrEntitlements, "cashPaymentsOrEntitlements");
  const startingCostBase = input.startingCostBase === undefined ? undefined : assertCents(input.startingCostBase, "startingCostBase");
  const increaseAmount = assessableAttributed + naneAttributed;
  const reductionAmount = cashPaymentsOrEntitlements + taxOffsets;
  const shortfallIncrease = Math.max(0, increaseAmount - reductionAmount);
  const excessDecrease = Math.max(0, reductionAmount - increaseAmount);
  const cgtEventE10Gain = startingCostBase === undefined ? 0 : Math.max(0, excessDecrease - startingCostBase);
  const closingCostBase = startingCostBase === undefined ? undefined : Math.max(0, startingCostBase + shortfallIncrease - excessDecrease);
  return {
    increaseAmount,
    reductionAmount,
    shortfallIncrease,
    excessDecrease,
    closingCostBase,
    cgtEventE10Gain,
    working: [
      { code: "AU.AMIT.CBNA.INCREASE", label: "Cost base increase amount", amount: increaseAmount, kind: "AMOUNT", source: "RULE" },
      { code: "AU.AMIT.CBNA.REDUCTION", label: "Cost base reduction amount", amount: reductionAmount, kind: "AMOUNT", source: "RULE" },
      { code: "AU.AMIT.CBNA.SHORTFALL", label: "AMIT cost base net amount – shortfall (increase)", amount: shortfallIncrease, kind: "AMOUNT", source: "RULE" },
      { code: "AU.AMIT.CBNA.EXCESS", label: "AMIT cost base net amount – excess (decrease)", amount: excessDecrease, kind: "AMOUNT", source: "RULE" },
      { code: "AU.AMIT.CBNA.E10", label: "CGT event E10 gain", amount: cgtEventE10Gain, kind: "AMOUNT", source: "RULE" },
    ],
  };
}

export function buildAmmaStatement(input: BuildAmmaStatementInput): AmmaStatement {
  const byCharacter = zeroed();
  for (const character of ALL_CHARACTERS) byCharacter[character] = assertCents(input.attributedComponents[character], `${character} attributed component`);
  const frankingCreditsTaxOffset =
    input.frankingCreditsTaxOffset === undefined
      ? Math.min(assertCents(input.taxOffsets, "taxOffsets"), Math.round((byCharacter.FRANKED_DIVIDEND * 3_000) / 10_000))
      : assertCents(input.frankingCreditsTaxOffset, "frankingCreditsTaxOffset");
  const managedInvestmentTrustFundPayments = assertCents(input.managedInvestmentTrustFundPayments, "managedInvestmentTrustFundPayments");
  const amountsWithheldFromManagedInvestmentTrustFundPayments = assertCents(
    input.amountsWithheldFromManagedInvestmentTrustFundPayments ?? input.foreignResidentWithheld,
    "amountsWithheldFromManagedInvestmentTrustFundPayments",
  );
  const shareOfNetIncomeFromTrusts =
    byCharacter.RENT +
    byCharacter.INTEREST +
    byCharacter.OTHER_AU_INCOME +
    byCharacter.UNFRANKED_DIVIDEND +
    byCharacter.NON_ASSESSABLE_TAX_DEFERRED * 0 +
    byCharacter.NON_ASSESSABLE_TAX_FREE * 0;
  return {
    memberId: input.memberId,
    memberClass: input.member.memberClass,
    dueDate: ammaDueDate(input.incomeYearEnd),
    amendableUntil: ammaRevisionCutoff(input.incomeYearEnd),
    partA: {
      memberNameOrIdentifier: input.memberId,
      quotedTaxFileNumberOrAbn: input.member.quotedTfn === true || input.member.quotedAbn === true,
      countryOfResidence: input.member.countryOfResidence,
    },
    officialFields: {
      managedInvestmentTrustFundPayments,
      amountsWithheldFromManagedInvestmentTrustFundPayments,
      paragraph2761052abAmounts: assertCents(input.paragraph2761052abAmount, "paragraph2761052abAmount"),
      paragraph2761052cAmounts: assertCents(input.paragraph2761052cAmount, "paragraph2761052cAmount"),
      shareOfCreditForTaxFileNumberAmountsWithheld: input.tfnWithheld ?? 0,
      shareOfCreditForForeignResidentWithholdingAmounts: input.foreignResidentWithheld ?? 0,
      shareOfFrankingCreditFromFrankedDistributions: frankingCreditsTaxOffset,
    },
    summary: {
      shareOfNetIncomeFromTrusts,
      frankingCreditOffset: frankingCreditsTaxOffset,
      tfnCredit: input.tfnWithheld ?? 0,
      foreignResidentCredit: input.foreignResidentWithheld ?? 0,
      netCapitalGain: capitalGainAmount(byCharacter),
      assessableForeignIncome: byCharacter.FOREIGN_INCOME,
    },
    components: {
      byCharacter,
      grossCashDistribution: input.cashDistribution,
      taxOffsets: input.taxOffsets,
      frankingCreditsTaxOffset,
      costBaseExcessDecrease: input.costBaseNetAmount.excessDecrease,
      costBaseShortfallIncrease: input.costBaseNetAmount.shortfallIncrease,
    },
    presentation: {
      atoFieldLabels: {
        "officialFields.managedInvestmentTrustFundPayments": "Managed investment trust fund payments",
        "officialFields.amountsWithheldFromManagedInvestmentTrustFundPayments": "Amounts withheld from MIT fund payments",
        "officialFields.paragraph2761052abAmounts": "Para 276-105(2)(a) and (b) amounts",
        "officialFields.paragraph2761052cAmounts": "Para 276-105(2)(c) amounts",
        "officialFields.shareOfCreditForTaxFileNumberAmountsWithheld": "Share of credit for tax file number amounts withheld",
        "officialFields.shareOfCreditForForeignResidentWithholdingAmounts": "Share of credit for foreign resident withholding amounts",
        "officialFields.shareOfFrankingCreditFromFrankedDistributions": "Share of franking credit from franked distributions",
      },
      platformOnlyFields: ["memberClass", "summary.shareOfNetIncomeFromTrusts", "summary.frankingCreditOffset", "summary.tfnCredit", "summary.foreignResidentCredit"],
    },
    notes: [
      "AMMA statements must be given within 3 months after year end and can generally be reissued effectively within 4 years after the relevant income year end.",
      "The cost base net amount reflects the annual netting of assessable and NANE attributions against actual payments and tax offsets.",
    ],
  };
}

export function attributedAssessableIncome(components: AuCharacterMap): Cents {
  return sum(ALL_CHARACTERS.filter(isAssessable).map((character) => components[character] ?? 0));
}

export function attributedNaneIncome(components: AuCharacterMap): Cents {
  return sum(ALL_CHARACTERS.filter(isNane).map((character) => components[character] ?? 0));
}

export const RULES = [
  {
    id: "au-amit.trust-components-and-attribution.2016-plus",
    domain: "AU_TRUST_TAX",
    title: "AMIT trust components, fair-and-reasonable attribution and character retention",
    summary:
      "An AMIT first determines trust components by character, then attributes them to members on a fair and reasonable basis. Character and tax offsets flow through to members, who are treated as if they derived or received the amounts directly.",
    effectiveFrom: "2016-05-05",
    sources: [
      { title: "ATO | Calculating AMIT income trust components", url: "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/attribution-managed-investment-trusts/attribution-method-for-managed-investment-trusts/calculating-amit-income-trust-components", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Attributing amounts to members", url: "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/attribution-managed-investment-trusts/attribution-method-for-managed-investment-trusts/attributing-amounts-to-members", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Character flow through for AMITs", url: "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/attribution-managed-investment-trusts/attribution-method-for-managed-investment-trusts/character-flow-through-for-amits", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    confidence: "VERIFIED",
    notes:
      "The engine accepts already-classified component inputs from the trust tax computation and applies discovery-year adjustments and rounding by character rather than recomputing taxable income from ledger detail.",
  },
  {
    id: "au-amit.unders-overs-and-cbna.2016-plus",
    domain: "AU_TRUST_TAX",
    title: "AMIT unders and overs, annual cost base adjustments and AMMA timing",
    summary:
      "Unders and overs can be adjusted in the discovery year or by reissuing the base-year AMMA and AIIR. The AMIT cost base net amount increases cost base where attributed assessable and NANE amounts exceed cash and offsets, and decreases it in the opposite case, with CGT event E10 once cost base is exhausted.",
    effectiveFrom: "2016-05-05",
    sources: [
      { title: "ATO | Unders and overs for AMITs", url: "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/attribution-managed-investment-trusts/unders-and-overs-for-amits", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Cost base adjustments for AMIT members", url: "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/attribution-managed-investment-trusts/attribution-method-for-managed-investment-trusts/cost-base-adjustments-for-amit-members", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | AMIT reporting requirements", url: "https://www.ato.gov.au/businesses-and-organisations/trusts/specific-rules-for-some-trusts/managed-investment-trusts/managed-investment-trusts-overview/attribution-managed-investment-trusts/amit-reporting-requirements", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | AMMA statement and SDS 2024 about the AMMA statement and SDS", url: "https://www.ato.gov.au/forms-and-instructions/attribution-managed-investment-trust-member-annual-statement-standard-distribution-statement-2024/about-the-amma-statement-and-sds", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    confidence: "VERIFIED",
    notes:
      "The engine exposes both the discovery-year adjustment path and the AMMA reissue timing, but does not prepare amended AIIR data files; it returns structured statement content instead.",
  },
] as const satisfies readonly RuleEntry[];

export const NOTES = [ENGINE_DISCLAIMER_AU];
