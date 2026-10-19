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
  /** Western Australia only: land in the Perth metropolitan region, which also pays MRIT. Treated as metropolitan when omitted. */
  metropolitanRegion?: boolean;
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
  /** Cents for every A$100 or part of A$100 of the excess (South Australia's published form). */
  ratePer100?: Cents;
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
  if (band.ratePer100 !== undefined) return `A$${(band.ratePer100 / 100).toFixed(2)} per A$100 or part`;
  if (band.rateBps !== undefined) return `${band.rateBps / 100}%`;
  if (band.ratePpm !== undefined) return `${band.ratePpm / 10000}%`;
  return "0%";
}

function applyBandRate(amount: Cents, band: TaxBand): Cents {
  if (band.ratePer100 !== undefined) return Math.ceil(amount / 10_000) * band.ratePer100;
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
  if (state === "WA") return holding.metropolitanRegion === false ? 0 : taxableLandValue;
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

// Western Australia: one scale for every owner (trustees are assessed as owners; no trust or foreign surcharge), as published by the
// Department of Treasury and Finance. The page refers to the Land Tax Act 2002 for earlier years; the scale is applied from the engine's
// earliest assessment year.
const WA_GENERAL_SCHEDULES: readonly Effective<LandTaxSchedule>[] = [
  {
    from: "2022-01-01",
    value: {
      ruleVersion: "wa.land-tax.general.2022-01-01",
      threshold: 30_000_000,
      bands: [
        { from: 0, to: 30_000_000, baseTax: 0, excessFrom: 0, rateBps: 0, label: "A$0 to A$300,000" },
        { from: 30_000_001, to: 42_000_000, baseTax: 30_000, excessFrom: 30_000_000, rateBps: 0, label: "A$300,001 to A$420,000" },
        { from: 42_000_001, to: 100_000_000, baseTax: 30_000, excessFrom: 42_000_000, rateBps: 25, label: "A$420,001 to A$1,000,000" },
        { from: 100_000_001, to: 180_000_000, baseTax: 175_000, excessFrom: 100_000_000, rateBps: 90, label: "A$1,000,001 to A$1,800,000" },
        { from: 180_000_001, to: 500_000_000, baseTax: 895_000, excessFrom: 180_000_000, rateBps: 180, label: "A$1,800,001 to A$5,000,000" },
        { from: 500_000_001, to: 1_100_000_000, baseTax: 6_655_000, excessFrom: 500_000_000, rateBps: 200, label: "A$5,000,001 to A$11,000,000" },
        { from: 1_100_000_001, baseTax: 18_655_000, excessFrom: 1_100_000_000, rateBps: 267, label: "A$11,000,001 and over" },
      ],
    },
  },
];

/** Metropolitan Region Improvement Tax: 0.14% of the aggregated value of Perth metropolitan land above A$300,000. */
const WA_MRIT_RULES: readonly Effective<SurchargeRule>[] = [
  { from: "2022-01-01", value: { ruleVersion: "wa.land-tax.mrit.2022-01-01", state: "WA", appliesTo: "ALL_TAXABLE_LAND_OVER_THRESHOLD", threshold: 30_000_000, rateBps: 14 } },
];

const dollarsLabel = (dollars: number): string => `A$${dollars.toLocaleString("en-AU")}`;

/**
 * A South Australian scale as RevenueSA publishes it: nil up to the threshold, then for each step "base plus a rate for every A$100 or
 * part of A$100 above the step". Steps are [step in dollars, base in dollars, cents per A$100].
 */
function saSchedule(ruleVersion: string, thresholdDollars: number, steps: ReadonlyArray<readonly [number, number, number]>): LandTaxSchedule {
  const bands: TaxBand[] = [{ from: 0, to: thresholdDollars * 100, baseTax: 0, excessFrom: 0, rateBps: 0, label: `Does not exceed ${dollarsLabel(thresholdDollars)}` }];
  steps.forEach(([above, base, centsPer100], index) => {
    const next = steps[index + 1];
    bands.push({
      from: above * 100 + 1,
      ...(next ? { to: next[0] * 100 } : {}),
      baseTax: base * 100,
      excessFrom: above * 100,
      ratePer100: centsPer100,
      label: next ? `Exceeds ${dollarsLabel(above)} but not ${dollarsLabel(next[0])}` : `Exceeds ${dollarsLabel(above)}`,
    });
  });
  return { ruleVersion, threshold: thresholdDollars * 100, bands };
}

// RevenueSA "Rates and thresholds" (general and trust rates by financial year). A land tax year runs 1 July to 30 June; the engine picks the
// scale in force on 1 January of the assessment year, so assessment year 2026 uses 2025-26.
const SA_GENERAL_SCHEDULES: readonly Effective<LandTaxSchedule>[] = [
  { from: "2026-07-01", value: saSchedule("sa.land-tax.general.2026-07-01", 936_000, [[936_000, 0, 50], [1_504_000, 2_840, 100], [2_188_000, 9_680, 200], [3_504_000, 36_000, 240]]) },
  { from: "2025-07-01", to: "2026-06-30", value: saSchedule("sa.land-tax.general.2025-07-01", 833_000, [[833_000, 0, 50], [1_338_000, 2_525, 100], [1_946_000, 8_605, 200], [3_116_000, 32_005, 240]]) },
  { from: "2024-07-01", to: "2025-06-30", value: saSchedule("sa.land-tax.general.2024-07-01", 732_000, [[732_000, 0, 50], [1_176_000, 2_220, 100], [1_711_000, 7_570, 200], [2_738_000, 28_110, 240]]) },
  { from: "2023-07-01", to: "2024-06-30", value: saSchedule("sa.land-tax.general.2023-07-01", 668_000, [[668_000, 0, 50], [1_073_000, 2_025, 100], [1_561_000, 6_905, 200], [2_500_000, 25_685, 240]]) },
  { from: "2022-07-01", to: "2023-06-30", value: saSchedule("sa.land-tax.general.2022-07-01", 534_000, [[534_000, 0, 50], [858_000, 1_620, 100], [1_249_000, 5_530, 200], [2_000_000, 20_550, 240]]) },
  { from: "2021-07-01", to: "2022-06-30", value: saSchedule("sa.land-tax.general.2021-07-01", 482_000, [[482_000, 0, 50], [774_000, 1_460, 125], [1_126_000, 5_860, 200], [1_350_000, 10_340, 240]]) },
];

const SA_TRUST_SCHEDULES: readonly Effective<LandTaxSchedule>[] = [
  { from: "2026-07-01", value: saSchedule("sa.land-tax.trust.2026-07-01", 25_000, [[25_000, 125, 50], [936_000, 4_680, 100], [1_504_000, 10_360, 150], [2_188_000, 20_620, 240], [3_504_000, 52_204, 240]]) },
  { from: "2025-07-01", to: "2026-06-30", value: saSchedule("sa.land-tax.trust.2025-07-01", 25_000, [[25_000, 125, 50], [833_000, 4_165, 100], [1_338_000, 9_215, 150], [1_946_000, 18_335, 240], [3_116_000, 46_415, 240]]) },
  { from: "2024-07-01", to: "2025-06-30", value: saSchedule("sa.land-tax.trust.2024-07-01", 25_000, [[25_000, 125, 50], [732_000, 3_660, 100], [1_176_000, 8_100, 150], [1_711_000, 16_125, 240], [2_738_000, 40_773, 240]]) },
  { from: "2023-07-01", to: "2024-06-30", value: saSchedule("sa.land-tax.trust.2023-07-01", 25_000, [[25_000, 125, 50], [668_000, 3_340, 100], [1_073_000, 7_390, 150], [1_561_000, 14_710, 240], [2_500_000, 37_246, 240]]) },
  { from: "2022-07-01", to: "2023-06-30", value: saSchedule("sa.land-tax.trust.2022-07-01", 25_000, [[25_000, 125, 50], [534_000, 2_670, 100], [858_000, 5_910, 150], [1_249_000, 11_775, 240], [2_000_000, 29_799, 240]]) },
  { from: "2021-07-01", to: "2022-06-30", value: saSchedule("sa.land-tax.trust.2021-07-01", 25_000, [[25_000, 125, 50], [482_000, 2_410, 100], [774_000, 5_330, 175], [1_126_000, 11_490, 240], [1_350_000, 16_866, 240]]) },
];

/** RevenueSA issues no assessment when the calculated tax is under A$20. */
const SA_MINIMUM_ASSESSMENT = 2_000;

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

/** SA trust rates apply to a trust unless it is assessed at the general rates (trustSurchargeApplies false: an excluded trust, such as a listed or widely held public unit trust scheme, or a notified fixed or unit trust). */
function saOwnerSchedule(owner: AuLandTaxOwner, yearDate: ISODate): LandTaxSchedule {
  const trust = (owner.kind === "TRUST" || owner.kind === "SPECIAL_TRUST") && owner.trustSurchargeApplies !== false;
  return trust ? requireEffective(SA_TRUST_SCHEDULES, yearDate, "SA trust land tax") : requireEffective(SA_GENERAL_SCHEDULES, yearDate, "SA land tax");
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
  if (state === "WA") {
    const schedule = requireEffective(WA_GENERAL_SCHEDULES, yearDate, "WA land tax");
    return { tax: computeScheduledTax(schedule, totalTaxableLandValue).tax, schedule };
  }
  if (state === "SA") {
    const schedule = saOwnerSchedule(owner, yearDate);
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
  if (state === "WA") {
    // MRIT is charged on the aggregated value of the metropolitan holdings, whoever the owner is.
    const rule = requireEffective(WA_MRIT_RULES, yearDate, "WA Metropolitan Region Improvement Tax");
    if (totalSurchargeableValue <= rule.threshold!) return { tax: 0, ruleVersion: rule.ruleVersion };
    return { tax: mulBps(totalSurchargeableValue - rule.threshold!, rule.rateBps), ruleVersion: rule.ruleVersion };
  }
  return { tax: 0 };
}

const MODELLED_STATES: readonly AuState[] = ["NSW", "VIC", "QLD", "WA", "SA"];

export function computeLandTax(input: ComputeLandTaxInput): ComputeLandTaxResult {
  if (!MODELLED_STATES.includes(input.state)) throw new RangeError(`Land tax is not modelled for ${input.state}.`);
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
  const scheduled = computeGeneralTax(input.state, input.owner, totalTaxableLandValue, yearDate);
  const underMinimum = input.state === "SA" && scheduled.tax > 0 && scheduled.tax < SA_MINIMUM_ASSESSMENT;
  if (underMinimum) {
    findings.push({
      id: "AU_LAND_TAX.SA_BELOW_MINIMUM_ASSESSMENT",
      severity: "INFO",
      message: `The calculated South Australian land tax (A$${(scheduled.tax / 100).toFixed(2)}) is under A$20, so RevenueSA issues no assessment.`,
    });
  }
  const general = underMinimum ? { ...scheduled, tax: 0 } : scheduled;
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
  if (input.state === "WA") {
    notes.push(
      "Western Australian land tax is assessed on land owned at midnight on 30 June before the assessment year. A trustee is assessed as if the land were its own, and WA has no trust or foreign-owner land tax surcharge.",
      "The Metropolitan Region Improvement Tax (0.14% above A$300,000) is charged on land in the Perth metropolitan region; a holding counts as metropolitan unless it is marked otherwise.",
    );
  }
  if (input.state === "SA") {
    notes.push(
      "South Australian land tax is assessed on land owned at midnight on 30 June. Trust rates apply to land held on trust unless the trust is assessed at the general rates (for example a listed or widely held public unit trust scheme, or a fixed or unit trust whose beneficiaries or unitholders RevenueSA has been told about).",
      "Each A$100 or part of A$100 above a step is charged in full, as RevenueSA's tables state.",
    );
  }
  const lines = [
    line("AU.LAND_TAX.TAXABLE_VALUE", "Total taxable land value", totalTaxableLandValue),
    line("AU.LAND_TAX.GENERAL", "General land tax", general.tax, general.schedule.ruleVersion),
    ...(surcharge.tax > 0 ? [line("AU.LAND_TAX.SURCHARGE", input.state === "WA" ? "Metropolitan Region Improvement Tax (MRIT)" : "Foreign / absentee surcharge", surcharge.tax, surcharge.ruleVersion)] : []),
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
  {
    id: "au-land-tax.wa.general.current",
    domain: "AU_LAND_TAX",
    title: "Western Australia land tax scale",
    summary: "Western Australia charges land tax on the aggregated taxable value above A$300,000: A$300 up to A$420,000, then A$300 plus 0.25%, A$1,750 plus 0.9%, A$8,950 plus 1.8%, A$66,550 plus 2% and, above A$11,000,000, A$186,550 plus 2.67% of the excess. Trustees are assessed as owners; there is no trust or foreign-owner surcharge.",
    effectiveFrom: "2022-01-01",
    confidence: "VERIFIED",
    sources: [
      { title: "WA Department of Treasury and Finance | Land tax assessment (land tax rates)", url: "https://www.wa.gov.au/organisation/department-of-treasury-and-finance/land-tax-assessment", retrieved: "2026-10-19", publisher: "Department of Treasury and Finance, Western Australia" },
    ],
    notes: "The page gives the current scale and refers to the Land Tax Act 2002 for earlier years. Secondary sources describe the scale as unchanged since 2018-19, so it is applied from the engine's earliest assessment year (2022).",
  },
  {
    id: "au-land-tax.wa.mrit.current",
    domain: "AU_LAND_TAX",
    title: "WA Metropolitan Region Improvement Tax",
    summary: "Land in the Perth metropolitan region also pays the Metropolitan Region Improvement Tax: 0.14% of the aggregated taxable value above A$300,000, assessed with land tax.",
    effectiveFrom: "2022-01-01",
    confidence: "VERIFIED",
    sources: [
      { title: "WA Department of Treasury and Finance | Land tax assessment (MRIT rates)", url: "https://www.wa.gov.au/organisation/department-of-treasury-and-finance/land-tax-assessment", retrieved: "2026-10-19", publisher: "Department of Treasury and Finance, Western Australia" },
    ],
    notes: "Holdings are treated as metropolitan unless the caller marks them otherwise; the app does not hold a metropolitan-region flag per property, so a WA property outside the region is overstated by the MRIT.",
  },
  {
    id: "au-land-tax.sa.general",
    domain: "AU_LAND_TAX",
    title: "South Australia land tax general rates",
    summary: "South Australian general land tax is nil up to the indexed threshold (A$833,000 for 2025-26, A$936,000 for 2026-27), then 50 cents, A$1.00, A$2.00 and A$2.40 for every A$100 or part above each step. Applies to owners other than trusts and to trusts assessed at the general rates, such as listed or widely held public unit trust schemes.",
    effectiveFrom: "2021-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "RevenueSA | Land tax rates and thresholds (2020-21 to 2026-27 general rates)", url: "https://revenuesa.sa.gov.au/landtax/rates-and-thresholds", retrieved: "2026-10-19", publisher: "RevenueSA" },
      { title: "RevenueSA | Trust types not subject to the trust land tax rates", url: "https://revenuesa.sa.gov.au/landtax/calculate-land-tax/trust-types-not-subject-to-the-trust-land-tax-rates", retrieved: "2026-10-19", publisher: "RevenueSA" },
    ],
    notes: "Each financial year's table is held from 2021-22 to 2026-27. No assessment is issued when the calculated tax is under A$20. Exemptions (principal place of residence, primary production) are out of scope.",
  },
  {
    id: "au-land-tax.sa.trust",
    domain: "AU_LAND_TAX",
    title: "South Australia land tax trust rates",
    summary: "Land held on trust is taxed at the trust rates from A$25,000 (A$125 plus 50 cents for every A$100 or part above A$25,000, rising to A$2.40) unless the trust is assessed at the general rates, for example an excluded trust or a fixed or unit trust whose beneficiaries or unitholders have been notified to RevenueSA.",
    effectiveFrom: "2021-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "RevenueSA | Land tax rates and thresholds (2020-21 to 2026-27 trust rates)", url: "https://revenuesa.sa.gov.au/landtax/rates-and-thresholds", retrieved: "2026-10-19", publisher: "RevenueSA" },
      { title: "RevenueSA | Land held on trust", url: "https://revenuesa.sa.gov.au/landtax/land-held-on-trust", retrieved: "2026-10-19", publisher: "RevenueSA" },
    ],
    notes: "Whether a trust is assessed at the general rates depends on notifications to RevenueSA; the app's Trust surcharge applies setting stands in for that decision.",
  },
];
