import type { ISODate } from "../dates.ts";
import { parseISO } from "../dates.ts";
import type { Cents } from "../money.ts";
import { allocate, assertCents, mulBps, mulRatio } from "../money.ts";
import type { Effective, RuleEntry } from "../rules.ts";
import { ENGINE_DISCLAIMER_AU, requireEffective } from "../rules.ts";
import type { ComputationLine, Finding } from "../types.ts";
import type { AuState } from "./types.ts";

export type AuLandTaxOwnerKind = "INDIVIDUAL" | "COMPANY" | "TRUST" | "SPECIAL_TRUST";

export const AU_LAND_TAX_OWNER_KINDS = [
  { id: "INDIVIDUAL", label: "Individual", description: "Individual owner or equivalent natural-person assessment." },
  { id: "COMPANY", label: "Company", description: "Company, corporation or similar entity owning land in its own capacity." },
  { id: "TRUST", label: "Trust", description: "Trustee owner, including unit, fixed or discretionary trust structures." },
  { id: "SPECIAL_TRUST", label: "Special trust", description: "Trust taxed under a no-threshold or punitive state trust regime." },
] as const satisfies readonly { id: AuLandTaxOwnerKind; label: string; description: string }[];

export interface AuLandTaxOwner {
  kind: AuLandTaxOwnerKind;
  foreign?: boolean;
  absentee?: boolean;
  trustSurchargeApplies?: boolean;
  specialDisabilityTrust?: boolean;
}

export interface AuLandTaxHolding {
  id: string;
  taxableLandValue: Cents;
  residential?: boolean;
  residentialShareBps?: number;
  surchargeableValue?: Cents;
}

export interface ComputeLandTaxInput {
  state: AuState;
  assessmentDate?: ISODate;
  assessmentYear?: number;
  holdings: readonly AuLandTaxHolding[];
  owner: AuLandTaxOwner;
}

export interface AuLandTaxPropertyAllocation {
  id: string;
  taxableLandValue: Cents;
  surchargeableValue: Cents;
  apportionedGeneralTax: Cents;
  apportionedSurchargeTax: Cents;
  totalTax: Cents;
}

export interface ComputeLandTaxResult {
  state: AuState;
  assessmentYear: number;
  totalTaxableLandValue: Cents;
  totalSurchargeableValue: Cents;
  generalTax: Cents;
  surchargeTax: Cents;
  totalTax: Cents;
  properties: AuLandTaxPropertyAllocation[];
  lines: ComputationLine[];
  findings: Finding[];
  notes: string[];
  ruleVersion: string;
}

interface TaxBand {
  from: Cents;
  to?: Cents;
  baseTax: Cents;
  excessFrom: Cents;
  rateBps?: number;
  ratePpm?: number;
  appliesToWholeValue?: boolean;
  label: string;
}

interface LandTaxSchedule {
  ruleVersion: string;
  threshold: Cents;
  bands: readonly TaxBand[];
}

interface SurchargeRule {
  ruleVersion: string;
  state: AuState;
  appliesTo: "RESIDENTIAL_ONLY" | "ALL_TAXABLE_LAND" | "ALL_TAXABLE_LAND_OVER_THRESHOLD";
  rateBps: number;
  threshold?: Cents;
}

function assertDate(date: ISODate, label: string): ISODate {
  parseISO(date);
  return date;
}

function assertNonNegativeCents(value: number, label: string): Cents {
  const cents = assertCents(value, label);
  if (cents < 0) throw new RangeError(`${label} cannot be negative.`);
  return cents;
}

function assertBps(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) throw new RangeError(`${label} must be an integer between 0 and 10,000.`);
  return value;
}

function line(code: string, label: string, amount: Cents, note?: string, indent = 0): ComputationLine {
  return { code, label, amount, kind: "AMOUNT", source: "RULE", note, indent };
}

function rateToText(band: TaxBand): string {
  if (band.rateBps !== undefined) return `${band.rateBps / 100}%`;
  if (band.ratePpm !== undefined) return `${band.ratePpm / 10000}%`;
  return "0%";
}

function applyBandRate(amount: Cents, band: TaxBand): Cents {
  if (band.rateBps !== undefined) return mulBps(amount, band.rateBps);
  if (band.ratePpm !== undefined) return mulRatio(amount, band.ratePpm, 1_000_000);
  return 0;
}

function findBand(schedule: LandTaxSchedule, totalValue: Cents): TaxBand {
  const band = schedule.bands.find((candidate) => totalValue >= candidate.from && (candidate.to === undefined || totalValue <= candidate.to));
  if (!band) throw new RangeError(`No land-tax band covers ${totalValue}.`);
  return band;
}

function computeScheduledTax(schedule: LandTaxSchedule, totalValue: Cents): { tax: Cents; band: TaxBand } {
  if (totalValue < schedule.threshold) return { tax: 0, band: schedule.bands[0]! };
  if (totalValue === schedule.threshold) {
    const thresholdBand = schedule.bands.find((band) => band.from === totalValue);
    if (!thresholdBand) return { tax: 0, band: schedule.bands[0]! };
    if (thresholdBand.appliesToWholeValue) return { tax: applyBandRate(totalValue, thresholdBand), band: thresholdBand };
    return { tax: thresholdBand.baseTax, band: thresholdBand };
  }
  const band = findBand(schedule, totalValue);
  if (band.appliesToWholeValue) return { tax: applyBandRate(totalValue, band), band };
  return { tax: band.baseTax + applyBandRate(totalValue - band.excessFrom, band), band };
}

function resolveAssessmentYear(input: ComputeLandTaxInput): number {
  if (input.assessmentYear !== undefined) {
    if (!Number.isInteger(input.assessmentYear) || input.assessmentYear < 2022) throw new RangeError("assessmentYear must be an integer year from 2022 onwards.");
    return input.assessmentYear;
  }
  if (!input.assessmentDate) throw new RangeError("Provide assessmentYear or assessmentDate.");
  return parseISO(assertDate(input.assessmentDate, "assessmentDate")).y;
}

function resolveSurchargeableValue(state: AuState, holding: AuLandTaxHolding, findings: Finding[]): Cents {
  const taxableLandValue = assertNonNegativeCents(holding.taxableLandValue, `holding ${holding.id} taxableLandValue`);
  if (holding.surchargeableValue !== undefined) {
    const explicit = assertNonNegativeCents(holding.surchargeableValue, `holding ${holding.id} surchargeableValue`);
    if (explicit > taxableLandValue) throw new RangeError(`Holding ${holding.id} surchargeableValue cannot exceed taxableLandValue.`);
    return explicit;
  }
  if (state !== "NSW") return taxableLandValue;
  if (holding.residential === false) return 0;
  if (holding.residentialShareBps !== undefined) return mulRatio(taxableLandValue, assertBps(holding.residentialShareBps, `holding ${holding.id} residentialShareBps`), 10_000);
  if (holding.residential === true) return taxableLandValue;
  findings.push({
    id: "AU_LAND_TAX.NSW_SURCHARGEABLE_VALUE_ASSUMED",
    severity: "INFO",
    subject: holding.id,
    message: `NSW surcharge land tax was not applied to holding ${holding.id} because its residential / surchargeable portion was not supplied.`,
  });
  return 0;
}

const NSW_GENERAL_SCHEDULES: readonly Effective<LandTaxSchedule>[] = [
  {
    from: "2024-01-01",
    value: {
      ruleVersion: "nsw.land-tax.general.2024-01-01",
      threshold: 107_500_000,
      bands: [
        { from: 0, to: 107_499_999, baseTax: 0, excessFrom: 0, rateBps: 0, label: "Below general threshold" },
        { from: 107_500_100, to: 657_100_000, baseTax: 10_000, excessFrom: 107_500_000, rateBps: 160, label: "Above general threshold" },
        { from: 657_100_100, baseTax: 8_803_600, excessFrom: 657_100_000, rateBps: 200, label: "Premium threshold" },
      ],
    },
  },
  {
    from: "2023-01-01",
    to: "2023-12-31",
    value: {
      ruleVersion: "nsw.land-tax.general.2023-01-01",
      threshold: 96_900_000,
      bands: [
        { from: 0, to: 96_899_999, baseTax: 0, excessFrom: 0, rateBps: 0, label: "Below general threshold" },
        { from: 96_900_100, to: 592_500_000, baseTax: 10_000, excessFrom: 96_900_000, rateBps: 160, label: "Above general threshold" },
        { from: 592_500_100, baseTax: 7_939_600, excessFrom: 592_500_000, rateBps: 200, label: "Premium threshold" },
      ],
    },
  },
  {
    from: "2022-01-01",
    to: "2022-12-31",
    value: {
      ruleVersion: "nsw.land-tax.general.2022-01-01",
      threshold: 82_200_000,
      bands: [
        { from: 0, to: 82_199_999, baseTax: 0, excessFrom: 0, rateBps: 0, label: "Below general threshold" },
        { from: 82_200_100, to: 502_600_000, baseTax: 10_000, excessFrom: 82_200_000, rateBps: 160, label: "Above general threshold" },
        { from: 502_600_100, baseTax: 6_736_400, excessFrom: 502_600_000, rateBps: 200, label: "Premium threshold" },
      ],
    },
  },
];

const NSW_SPECIAL_TRUST_SCHEDULES: readonly Effective<LandTaxSchedule>[] = [
  {
    from: "2024-01-01",
    value: {
      ruleVersion: "nsw.land-tax.special-trust.2024-01-01",
      threshold: 0,
      bands: [
        { from: 0, to: 657_100_000, baseTax: 0, excessFrom: 0, rateBps: 160, label: "No-threshold trust rate" },
        { from: 657_100_100, baseTax: 10_513_600, excessFrom: 657_100_000, rateBps: 200, label: "Premium threshold" },
      ],
    },
  },
  {
    from: "2023-01-01",
    to: "2023-12-31",
    value: {
      ruleVersion: "nsw.land-tax.special-trust.2023-01-01",
      threshold: 0,
      bands: [
        { from: 0, to: 592_500_000, baseTax: 0, excessFrom: 0, rateBps: 160, label: "No-threshold trust rate" },
        { from: 592_500_100, baseTax: 9_480_000, excessFrom: 592_500_000, rateBps: 200, label: "Premium threshold" },
      ],
    },
  },
  {
    from: "2022-01-01",
    to: "2022-12-31",
    value: {
      ruleVersion: "nsw.land-tax.special-trust.2022-01-01",
      threshold: 0,
      bands: [
        { from: 0, to: 502_600_000, baseTax: 0, excessFrom: 0, rateBps: 160, label: "No-threshold trust rate" },
        { from: 502_600_100, baseTax: 8_041_600, excessFrom: 502_600_000, rateBps: 200, label: "Premium threshold" },
      ],
    },
  },
];

const NSW_SURCHARGE_RULES: readonly Effective<SurchargeRule>[] = [
  { from: "2025-01-01", value: { ruleVersion: "nsw.land-tax.surcharge.2025-01-01", state: "NSW", appliesTo: "RESIDENTIAL_ONLY", rateBps: 500 } },
  { from: "2023-01-01", to: "2024-12-31", value: { ruleVersion: "nsw.land-tax.surcharge.2023-01-01", state: "NSW", appliesTo: "RESIDENTIAL_ONLY", rateBps: 400 } },
  { from: "2022-01-01", to: "2022-12-31", value: { ruleVersion: "nsw.land-tax.surcharge.2022-01-01", state: "NSW", appliesTo: "RESIDENTIAL_ONLY", rateBps: 200 } },
];

const VIC_GENERAL_SCHEDULES: readonly Effective<LandTaxSchedule>[] = [
  {
    from: "2024-01-01",
    value: {
      ruleVersion: "vic.land-tax.general.2024-01-01",
      threshold: 5_000_000,
      bands: [
        { from: 0, to: 4_999_999, baseTax: 0, excessFrom: 0, rateBps: 0, label: "Below threshold" },
        { from: 5_000_000, to: 9_999_999, baseTax: 50_000, excessFrom: 5_000_000, rateBps: 0, label: "A$50,000 to < A$100,000" },
        { from: 10_000_000, to: 29_999_999, baseTax: 97_500, excessFrom: 10_000_000, rateBps: 0, label: "A$100,000 to < A$300,000" },
        { from: 30_000_000, to: 59_999_999, baseTax: 135_000, excessFrom: 30_000_000, rateBps: 30, label: "A$300,000 to < A$600,000" },
        { from: 60_000_000, to: 99_999_999, baseTax: 225_000, excessFrom: 60_000_000, rateBps: 60, label: "A$600,000 to < A$1,000,000" },
        { from: 100_000_000, to: 179_999_999, baseTax: 465_000, excessFrom: 100_000_000, rateBps: 90, label: "A$1,000,000 to < A$1,800,000" },
        { from: 180_000_000, to: 299_999_999, baseTax: 1_185_000, excessFrom: 180_000_000, rateBps: 165, label: "A$1,800,000 to < A$3,000,000" },
        { from: 300_000_000, baseTax: 3_165_000, excessFrom: 300_000_000, rateBps: 265, label: "A$3,000,000 and over" },
      ],
    },
  },
  {
    from: "2022-01-01",
    to: "2023-12-31",
    value: {
      ruleVersion: "vic.land-tax.general.2022-01-01",
      threshold: 30_000_000,
      bands: [
        { from: 0, to: 29_999_999, baseTax: 0, excessFrom: 0, rateBps: 0, label: "Below threshold" },
        { from: 30_000_000, to: 59_999_999, baseTax: 37_500, excessFrom: 30_000_000, rateBps: 20, label: "A$300,000 to < A$600,000" },
        { from: 60_000_000, to: 99_999_999, baseTax: 97_500, excessFrom: 60_000_000, rateBps: 50, label: "A$600,000 to < A$1,000,000" },
        { from: 100_000_000, to: 179_999_999, baseTax: 297_500, excessFrom: 100_000_000, rateBps: 80, label: "A$1,000,000 to < A$1,800,000" },
        { from: 180_000_000, to: 299_999_999, baseTax: 937_500, excessFrom: 180_000_000, rateBps: 155, label: "A$1,800,000 to < A$3,000,000" },
        { from: 300_000_000, baseTax: 2_797_500, excessFrom: 300_000_000, rateBps: 255, label: "A$3,000,000 and over" },
      ],
    },
  },
];

const VIC_TRUST_SCHEDULES: readonly Effective<LandTaxSchedule>[] = [
  {
    from: "2024-01-01",
    value: {
      ruleVersion: "vic.land-tax.trust.2024-01-01",
      threshold: 2_500_000,
      bands: [
        { from: 0, to: 2_499_999, baseTax: 0, excessFrom: 0, rateBps: 0, label: "Below threshold" },
        { from: 2_500_000, to: 4_999_999, baseTax: 8_200, excessFrom: 2_500_000, ratePpm: 3750, label: "A$25,000 to < A$50,000" },
        { from: 5_000_000, to: 9_999_999, baseTax: 67_600, excessFrom: 5_000_000, ratePpm: 3750, label: "A$50,000 to < A$100,000" },
        { from: 10_000_000, to: 24_999_999, baseTax: 133_800, excessFrom: 10_000_000, ratePpm: 3750, label: "A$100,000 to < A$250,000" },
        { from: 25_000_000, to: 59_999_999, baseTax: 190_100, excessFrom: 25_000_000, ratePpm: 6750, label: "A$250,000 to < A$600,000" },
        { from: 60_000_000, to: 99_999_999, baseTax: 426_300, excessFrom: 60_000_000, ratePpm: 9750, label: "A$600,000 to < A$1,000,000" },
        { from: 100_000_000, to: 179_999_999, baseTax: 816_300, excessFrom: 100_000_000, ratePpm: 12750, label: "A$1,000,000 to < A$1,800,000" },
        { from: 180_000_000, to: 299_999_999, baseTax: 1_836_300, excessFrom: 180_000_000, ratePpm: 11072, label: "A$1,800,000 to < A$3,000,000" },
        { from: 300_000_000, baseTax: 3_165_000, excessFrom: 300_000_000, rateBps: 265, label: "A$3,000,000 and over" },
      ],
    },
  },
  {
    from: "2022-01-01",
    to: "2023-12-31",
    value: {
      ruleVersion: "vic.land-tax.trust.2022-01-01",
      threshold: 2_500_000,
      bands: [
        { from: 0, to: 2_499_999, baseTax: 0, excessFrom: 0, rateBps: 0, label: "Below threshold" },
        { from: 2_500_000, to: 24_999_999, baseTax: 8_200, excessFrom: 2_500_000, ratePpm: 3750, label: "A$25,000 to < A$250,000" },
        { from: 25_000_000, to: 59_999_999, baseTax: 92_600, excessFrom: 25_000_000, ratePpm: 5750, label: "A$250,000 to < A$600,000" },
        { from: 60_000_000, to: 99_999_999, baseTax: 293_800, excessFrom: 60_000_000, ratePpm: 8750, label: "A$600,000 to < A$1,000,000" },
        { from: 100_000_000, to: 179_999_999, baseTax: 643_800, excessFrom: 100_000_000, ratePpm: 11750, label: "A$1,000,000 to < A$1,800,000" },
        { from: 180_000_000, to: 299_999_999, baseTax: 1_583_800, excessFrom: 180_000_000, ratePpm: 10114, label: "A$1,800,000 to < A$3,000,000" },
        { from: 300_000_000, baseTax: 2_797_500, excessFrom: 300_000_000, rateBps: 255, label: "A$3,000,000 and over" },
      ],
    },
  },
];

const VIC_ABSENTEE_SURCHARGE_RULES: readonly Effective<SurchargeRule>[] = [
  { from: "2024-01-01", value: { ruleVersion: "vic.land-tax.absentee.2024-01-01", state: "VIC", appliesTo: "ALL_TAXABLE_LAND", rateBps: 400 } },
  { from: "2020-01-01", to: "2023-12-31", value: { ruleVersion: "vic.land-tax.absentee.2020-01-01", state: "VIC", appliesTo: "ALL_TAXABLE_LAND", rateBps: 200 } },
];

const QLD_INDIVIDUAL_SCHEDULES: readonly Effective<LandTaxSchedule>[] = [
  {
    from: "2022-01-01",
    value: {
      ruleVersion: "qld.land-tax.individual.2022-01-01",
      threshold: 60_000_000,
      bands: [
        { from: 0, to: 59_999_999, baseTax: 0, excessFrom: 0, rateBps: 0, label: "Below threshold" },
        { from: 60_000_000, to: 99_999_999, baseTax: 50_000, excessFrom: 60_000_000, rateBps: 100, label: "A$600,000 to A$999,999" },
        { from: 100_000_000, to: 299_999_999, baseTax: 450_000, excessFrom: 100_000_000, rateBps: 165, label: "A$1,000,000 to A$2,999,999" },
        { from: 300_000_000, to: 499_999_999, baseTax: 3_750_000, excessFrom: 300_000_000, rateBps: 125, label: "A$3,000,000 to A$4,999,999" },
        { from: 500_000_000, to: 999_999_999, baseTax: 6_250_000, excessFrom: 500_000_000, rateBps: 175, label: "A$5,000,000 to A$9,999,999" },
        { from: 1_000_000_000, baseTax: 15_000_000, excessFrom: 1_000_000_000, rateBps: 225, label: "A$10,000,000 or more" },
      ],
    },
  },
];

const QLD_ABSENTEE_SCHEDULES: readonly Effective<LandTaxSchedule>[] = [
  {
    from: "2022-01-01",
    value: {
      ruleVersion: "qld.land-tax.absentee-base.2022-01-01",
      threshold: 35_000_000,
      bands: [
        { from: 0, to: 34_999_999, baseTax: 0, excessFrom: 0, rateBps: 0, label: "Below threshold" },
        { from: 35_000_000, to: 224_999_999, baseTax: 145_000, excessFrom: 35_000_000, rateBps: 170, label: "A$350,000 to A$2,249,999" },
        { from: 225_000_000, to: 499_999_999, baseTax: 3_375_000, excessFrom: 225_000_000, rateBps: 150, label: "A$2,250,000 to A$4,999,999" },
        { from: 500_000_000, to: 999_999_999, baseTax: 7_500_000, excessFrom: 500_000_000, rateBps: 200, label: "A$5,000,000 to A$9,999,999" },
        { from: 1_000_000_000, baseTax: 17_500_000, excessFrom: 1_000_000_000, rateBps: 250, label: "A$10,000,000 or more" },
      ],
    },
  },
];

const QLD_COMPANY_TRUST_SCHEDULES: readonly Effective<LandTaxSchedule>[] = [
  {
    from: "2022-01-01",
    value: {
      ruleVersion: "qld.land-tax.company-trust.2022-01-01",
      threshold: 35_000_000,
      bands: [
        { from: 0, to: 34_999_999, baseTax: 0, excessFrom: 0, rateBps: 0, label: "Below threshold" },
        { from: 35_000_000, to: 224_999_999, baseTax: 145_000, excessFrom: 35_000_000, rateBps: 170, label: "A$350,000 to A$2,249,999" },
        { from: 225_000_000, to: 499_999_999, baseTax: 3_375_000, excessFrom: 225_000_000, rateBps: 150, label: "A$2,250,000 to A$4,999,999" },
        { from: 500_000_000, to: 999_999_999, baseTax: 7_500_000, excessFrom: 500_000_000, rateBps: 225, label: "A$5,000,000 to A$9,999,999" },
        { from: 1_000_000_000, baseTax: 18_750_000, excessFrom: 1_000_000_000, rateBps: 275, label: "A$10,000,000 or more" },
      ],
    },
  },
];

const QLD_ABSENTEE_SURCHARGE_RULES: readonly Effective<SurchargeRule>[] = [
  { from: "2022-01-01", value: { ruleVersion: "qld.land-tax.absentee.2022-01-01", state: "QLD", appliesTo: "ALL_TAXABLE_LAND_OVER_THRESHOLD", threshold: 35_000_000, rateBps: 300 } },
];

const QLD_FOREIGN_ENTITY_SURCHARGE_RULES: readonly Effective<SurchargeRule>[] = [
  { from: "2022-01-01", value: { ruleVersion: "qld.land-tax.foreign-entity.2022-01-01", state: "QLD", appliesTo: "ALL_TAXABLE_LAND_OVER_THRESHOLD", threshold: 35_000_000, rateBps: 300 } },
];

function nswSchedule(owner: AuLandTaxOwner, yearDate: ISODate): LandTaxSchedule {
  if (owner.kind === "SPECIAL_TRUST") return requireEffective(NSW_SPECIAL_TRUST_SCHEDULES, yearDate, "NSW special trust land tax");
  return requireEffective(NSW_GENERAL_SCHEDULES, yearDate, "NSW land tax");
}

function vicSchedule(owner: AuLandTaxOwner, yearDate: ISODate): LandTaxSchedule {
  if (owner.kind === "TRUST" && owner.trustSurchargeApplies !== false) return requireEffective(VIC_TRUST_SCHEDULES, yearDate, "VIC trust land tax");
  return requireEffective(VIC_GENERAL_SCHEDULES, yearDate, "VIC land tax");
}

function qldSchedule(owner: AuLandTaxOwner, yearDate: ISODate): LandTaxSchedule {
  if (owner.specialDisabilityTrust) return requireEffective(QLD_INDIVIDUAL_SCHEDULES, yearDate, "QLD individual land tax");
  if (owner.kind === "INDIVIDUAL" && owner.absentee) return requireEffective(QLD_ABSENTEE_SCHEDULES, yearDate, "QLD absentee land tax");
  if (owner.kind === "INDIVIDUAL") return requireEffective(QLD_INDIVIDUAL_SCHEDULES, yearDate, "QLD individual land tax");
  return requireEffective(QLD_COMPANY_TRUST_SCHEDULES, yearDate, "QLD company or trust land tax");
}

function computeGeneralTax(state: AuState, owner: AuLandTaxOwner, totalTaxableLandValue: Cents, yearDate: ISODate): { tax: Cents; schedule: LandTaxSchedule } {
  if (state === "NSW") {
    const schedule = nswSchedule(owner, yearDate);
    return { tax: computeScheduledTax(schedule, totalTaxableLandValue).tax, schedule };
  }
  if (state === "VIC") {
    const schedule = vicSchedule(owner, yearDate);
    return { tax: computeScheduledTax(schedule, totalTaxableLandValue).tax, schedule };
  }
  if (state === "QLD") {
    const schedule = qldSchedule(owner, yearDate);
    return { tax: computeScheduledTax(schedule, totalTaxableLandValue).tax, schedule };
  }
  throw new RangeError(`Land tax is not modelled for ${state}.`);
}

function computeSurchargeTax(state: AuState, owner: AuLandTaxOwner, totalTaxableLandValue: Cents, totalSurchargeableValue: Cents, yearDate: ISODate): { tax: Cents; ruleVersion?: string } {
  if (state === "NSW" && owner.foreign) {
    const rule = requireEffective(NSW_SURCHARGE_RULES, yearDate, "NSW surcharge land tax");
    return { tax: mulBps(totalSurchargeableValue, rule.rateBps), ruleVersion: rule.ruleVersion };
  }
  if (state === "VIC" && owner.absentee) {
    const rule = requireEffective(VIC_ABSENTEE_SURCHARGE_RULES, yearDate, "VIC absentee owner surcharge");
    if (totalTaxableLandValue < (owner.kind === "TRUST" && owner.trustSurchargeApplies !== false ? 2_500_000 : 5_000_000)) return { tax: 0, ruleVersion: rule.ruleVersion };
    return { tax: mulBps(totalTaxableLandValue, rule.rateBps), ruleVersion: rule.ruleVersion };
  }
  if (state === "QLD") {
    if (owner.kind === "INDIVIDUAL" && owner.absentee) {
      const rule = requireEffective(QLD_ABSENTEE_SURCHARGE_RULES, yearDate, "QLD absentee surcharge");
      if (totalTaxableLandValue < rule.threshold!) return { tax: 0, ruleVersion: rule.ruleVersion };
      return { tax: mulBps(totalTaxableLandValue - rule.threshold!, rule.rateBps), ruleVersion: rule.ruleVersion };
    }
    if ((owner.kind === "COMPANY" || owner.kind === "TRUST") && owner.foreign) {
      const rule = requireEffective(QLD_FOREIGN_ENTITY_SURCHARGE_RULES, yearDate, "QLD foreign company / trust surcharge");
      if (totalTaxableLandValue < rule.threshold!) return { tax: 0, ruleVersion: rule.ruleVersion };
      return { tax: mulBps(totalTaxableLandValue - rule.threshold!, rule.rateBps), ruleVersion: rule.ruleVersion };
    }
  }
  return { tax: 0 };
}

export function computeLandTax(input: ComputeLandTaxInput): ComputeLandTaxResult {
  if (!["NSW", "VIC", "QLD"].includes(input.state)) throw new RangeError(`Land tax is not modelled for ${input.state}.`);
  const assessmentYear = resolveAssessmentYear(input);
  const yearDate = `${assessmentYear}-01-01`;
  const findings: Finding[] = [];
  if (input.holdings.length === 0) throw new RangeError("At least one holding is required.");
  const holdings = input.holdings.map((holding) => ({
    id: holding.id,
    taxableLandValue: assertNonNegativeCents(holding.taxableLandValue, `holding ${holding.id} taxableLandValue`),
    surchargeableValue: resolveSurchargeableValue(input.state, holding, findings),
  }));
  const totalTaxableLandValue = holdings.reduce((sum, holding) => sum + holding.taxableLandValue, 0);
  const totalSurchargeableValue = holdings.reduce((sum, holding) => sum + holding.surchargeableValue, 0);
  const general = computeGeneralTax(input.state, input.owner, totalTaxableLandValue, yearDate);
  const surcharge = computeSurchargeTax(input.state, input.owner, totalTaxableLandValue, totalSurchargeableValue, yearDate);
  const generalShares = allocate(general.tax, holdings.map((holding) => holding.taxableLandValue));
  const surchargeShares = allocate(surcharge.tax, holdings.map((holding) => holding.surchargeableValue));
  const properties = holdings.map((holding, index) => ({
    id: holding.id,
    taxableLandValue: holding.taxableLandValue,
    surchargeableValue: holding.surchargeableValue,
    apportionedGeneralTax: generalShares[index] ?? 0,
    apportionedSurchargeTax: surchargeShares[index] ?? 0,
    totalTax: (generalShares[index] ?? 0) + (surchargeShares[index] ?? 0),
  }));
  const notes = [
    ENGINE_DISCLAIMER_AU,
    "Owner-occupied, principal-place-of-residence, primary-production and similar exemptions are out of scope for this investor-focused calculator.",
    "Property apportionment is a proportional allocation of the owner-level liability by taxable land value (and by surchargeable value for NSW foreign-owner surcharge).",
  ];
  if (input.state === "NSW") {
    notes.push("NSW inputs should be assessment-year taxable land values. Revenue NSW's separate three-year averaging process is not recreated from raw historical valuations in this module.");
  }
  if (input.state === "VIC") {
    notes.push("Victorian 2024+ rates include the temporary COVID debt repayment land-tax settings published by the SRO.");
  }
  if (input.state === "QLD") {
    notes.push("Queensland land tax is assessed on land owned at midnight on 30 June. The engine expects each holding's taxable land value for that assessment point.");
  }
  const lines = [
    line("AU.LAND_TAX.TAXABLE_VALUE", "Total taxable land value", totalTaxableLandValue),
    line("AU.LAND_TAX.GENERAL", "General land tax", general.tax, general.schedule.ruleVersion),
    ...(surcharge.tax > 0 ? [line("AU.LAND_TAX.SURCHARGE", "Foreign / absentee surcharge", surcharge.tax, surcharge.ruleVersion)] : []),
    line("AU.LAND_TAX.TOTAL", "Total land tax", general.tax + surcharge.tax),
  ];
  return {
    state: input.state,
    assessmentYear,
    totalTaxableLandValue,
    totalSurchargeableValue,
    generalTax: general.tax,
    surchargeTax: surcharge.tax,
    totalTax: general.tax + surcharge.tax,
    properties,
    lines,
    findings,
    notes,
    ruleVersion: surcharge.ruleVersion ? `${general.schedule.ruleVersion}+${surcharge.ruleVersion}` : general.schedule.ruleVersion,
  };
}

export const RULES: RuleEntry[] = [
  {
    id: "au-land-tax.nsw.general.2024-01-01",
    domain: "AU_LAND_TAX",
    title: "NSW land tax thresholds and rates",
    summary: "NSW general land tax applies above the indexed threshold with A$100 plus 1.6% up to the premium threshold and 2% above it. Thresholds are A$1.075m / A$6.571m from 2024 onwards and fixed after the 2024-25 Budget.",
    effectiveFrom: "2022-01-01",
    confidence: "VERIFIED",
    sources: [
      { title: "Revenue NSW | Land tax thresholds and rates", url: "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/thresholds-and-rates", retrieved: "2026-10-10", publisher: "Revenue NSW" },
      { title: "Revenue NSW | How individuals and joint owners are assessed for land tax", url: "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/types-of-landowners/individuals-and-joint-owners", retrieved: "2026-10-10", publisher: "Revenue NSW" },
    ],
  },
  {
    id: "au-land-tax.nsw.special-trust.current",
    domain: "AU_LAND_TAX",
    title: "NSW special-trust land tax",
    summary: "Special or discretionary trusts do not receive the tax-free threshold in NSW and are taxed at 1.6% up to the premium threshold and 2% thereafter.",
    effectiveFrom: "2022-01-01",
    confidence: "VERIFIED",
    sources: [
      { title: "Revenue NSW | How trusts are assessed for land tax", url: "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/types-of-landowners/trusts", retrieved: "2026-10-10", publisher: "Revenue NSW" },
    ],
  },
  {
    id: "au-land-tax.nsw.surcharge.2025-01-01",
    domain: "AU_LAND_TAX",
    title: "NSW surcharge land tax for foreign owners",
    summary: "NSW surcharge land tax applies to residential land owned by foreign persons at 5% from 2025, 4% for 2023-24 and 2% for 2018-22, with no tax-free threshold.",
    effectiveFrom: "2022-01-01",
    confidence: "VERIFIED",
    sources: [
      { title: "Revenue NSW | What is surcharge land tax", url: "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/surcharge-land-tax/what-is-surcharge-land-tax", retrieved: "2026-10-10", publisher: "Revenue NSW" },
      { title: "Revenue NSW | How companies are assessed for land tax", url: "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/types-of-landowners/companies", retrieved: "2026-10-10", publisher: "Revenue NSW" },
    ],
  },
  {
    id: "au-land-tax.vic.general.2024-01-01",
    domain: "AU_LAND_TAX",
    title: "Victoria land tax current rates",
    summary: "Victoria's 2024+ general land tax starts at A$500 once taxable land reaches A$50,000 and steps through the SRO's published 2024-2033 scale, including the temporary COVID debt repayment amounts.",
    effectiveFrom: "2024-01-01",
    confidence: "VERIFIED",
    sources: [
      { title: "SRO Victoria | Land tax (current rates)", url: "https://www.sro.vic.gov.au/about-us/rates-and-statistics/current-rates/land-tax-current-rates", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
      { title: "SRO Victoria | Example of land tax calculation", url: "https://www.sro.vic.gov.au/owning-property/land-tax/new-land-tax/example-land-tax-calculation", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
    ],
  },
  {
    id: "au-land-tax.vic.general.2022-01-01",
    domain: "AU_LAND_TAX",
    title: "Victoria historical land tax rates for 2022-23",
    summary: "Victoria's historical 2022-23 land tax tables are retained for recomputations before the 2024 land-tax redesign.",
    effectiveFrom: "2022-01-01",
    effectiveTo: "2023-12-31",
    confidence: "VERIFIED",
    sources: [
      { title: "SRO Victoria | Land tax (historical rates)", url: "https://www.sro.vic.gov.au/about-us/rates-and-statistics/historical-rates/land-tax-historical-rates", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
    ],
  },
  {
    id: "au-land-tax.vic.trust.current",
    domain: "AU_LAND_TAX",
    title: "Victoria trust surcharge and absentee owner surcharge",
    summary: "Most Victorian trusts use the trust surcharge scale from A$25,000, unless a notified trust falls back to general rates. The absentee owner surcharge is 4% from the 2024 land-tax year and 2% for 2020-2023, applied on top of the base rates.",
    effectiveFrom: "2022-01-01",
    confidence: "VERIFIED",
    sources: [
      { title: "SRO Victoria | Trusts and land tax", url: "https://www.sro.vic.gov.au/owning-property/land-tax/companies-and-trusts/trusts-and-land-tax", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
      { title: "SRO Victoria | Understanding the absentee owner surcharge", url: "https://www.sro.vic.gov.au/owning-property/land-tax/absentee-owner-surcharge/understanding-absentee-owner-surcharge", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
      { title: "SRO Victoria | Land tax (current rates)", url: "https://www.sro.vic.gov.au/about-us/rates-and-statistics/current-rates/land-tax-current-rates", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
      { title: "SRO Victoria | Land tax (historical rates)", url: "https://www.sro.vic.gov.au/about-us/rates-and-statistics/historical-rates/land-tax-historical-rates", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
    ],
  },
  {
    id: "au-land-tax.qld.current",
    domain: "AU_LAND_TAX",
    title: "Queensland land tax for individuals, companies and trusts",
    summary: "Queensland land tax is assessed on freehold land owned at midnight on 30 June. Individuals use a A$600,000 threshold; companies and trustees use A$350,000; foreign companies, foreign trusts and absentee individuals pay an additional 3% surcharge above A$350,000.",
    effectiveFrom: "2022-01-01",
    confidence: "VERIFIED",
    sources: [
      { title: "Queensland Revenue Office | Land tax threshold and rates for individuals", url: "https://qro.qld.gov.au/land-tax/calculate/individual/", retrieved: "2026-10-10", publisher: "Queensland Revenue Office" },
      { title: "Queensland Revenue Office | Land tax threshold and rates for companies and trusts", url: "https://qro.qld.gov.au/land-tax/calculate/company-trust/", retrieved: "2026-10-10", publisher: "Queensland Revenue Office" },
      { title: "Queensland Revenue Office | Land tax threshold and rates for foreign companies and trusts", url: "https://qro.qld.gov.au/land-tax/calculate/foreign-company-trust/", retrieved: "2026-10-10", publisher: "Queensland Revenue Office" },
      { title: "Queensland Revenue Office | Land tax threshold and rates for absentees", url: "https://qro.qld.gov.au/land-tax/calculate/absentee/", retrieved: "2026-10-10", publisher: "Queensland Revenue Office" },
    ],
  },
];
