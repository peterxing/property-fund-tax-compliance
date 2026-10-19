import type { ISODate } from "../dates.ts";
import { parseISO } from "../dates.ts";
import type { Cents } from "../money.ts";
import { assertCents, floorToDollar, mulBps, mulRatio } from "../money.ts";
import type { Effective, RuleEntry } from "../rules.ts";
import { ENGINE_DISCLAIMER_AU, pickEffective, requireEffective } from "../rules.ts";
import type { ComputationLine, Finding } from "../types.ts";
import type { AuState } from "./types.ts";

export type AuTransferDutyPropertyKind = "RESIDENTIAL" | "NON_RESIDENTIAL" | "MIXED";
export type AuTransferPurchaserKind = "INDIVIDUAL" | "COMPANY" | "TRUST" | "PARTNERSHIP";
export type AuLandholderKind = "PRIVATE_COMPANY" | "PRIVATE_UNIT_TRUST" | "WHOLESALE_UNIT_TRUST" | "PUBLIC_LANDHOLDER";

export const AU_TRANSFER_DUTY_PROPERTY_KINDS = [
  { id: "RESIDENTIAL", label: "Residential property", description: "Residential land or a residential-related acquisition." },
  { id: "NON_RESIDENTIAL", label: "Non-residential property", description: "Commercial, industrial or other non-residential property." },
  { id: "MIXED", label: "Mixed-use property", description: "Property with both residential and non-residential components; provide a residential split." },
] as const satisfies readonly { id: AuTransferDutyPropertyKind; label: string; description: string }[];

export const AU_TRANSFER_PURCHASER_KINDS = [
  { id: "INDIVIDUAL", label: "Individual", description: "Natural person purchaser or acquirer." },
  { id: "COMPANY", label: "Company", description: "Company or corporation purchaser or acquirer." },
  { id: "TRUST", label: "Trustee", description: "Trustee acquiring for a trust or unit trust." },
  { id: "PARTNERSHIP", label: "Partnership", description: "Partnership or similar collective acquirer." },
] as const satisfies readonly { id: AuTransferPurchaserKind; label: string; description: string }[];

export const AU_LANDHOLDER_KINDS = [
  { id: "PRIVATE_COMPANY", label: "Private company", description: "Unlisted company or corporation." },
  { id: "PRIVATE_UNIT_TRUST", label: "Private unit trust", description: "Private or unlisted unit trust scheme." },
  { id: "WHOLESALE_UNIT_TRUST", label: "Wholesale / qualifying unit trust", description: "Wholesale or similar unit trust that retains the higher significant-interest threshold." },
  { id: "PUBLIC_LANDHOLDER", label: "Public / listed landholder", description: "Listed company, listed trust or public landholder." },
] as const satisfies readonly { id: AuLandholderKind; label: string; description: string }[];

export interface AuTransferPurchaser {
  kind: AuTransferPurchaserKind;
  foreignPerson?: boolean;
  foreignCorporation?: boolean;
  trustWithForeignBeneficiaries?: boolean;
  discretionaryTrustWithPotentialForeignBeneficiary?: boolean;
  foreignOwnerShareBps?: number;
}

export interface ComputeTransferDutyInput {
  state: AuState;
  contractDate: ISODate;
  dutiableValue: Cents;
  propertyKind: AuTransferDutyPropertyKind;
  residentialDutiableValue?: Cents;
  residentialShareBps?: number;
  purchaser: AuTransferPurchaser;
}

export interface ComputeTransferDutyResult {
  state: AuState;
  dutiableValue: Cents;
  residentialDutiableValue: Cents;
  baseDuty: Cents;
  foreignSurchargeDuty: Cents;
  totalDuty: Cents;
  lines: ComputationLine[];
  findings: Finding[];
  notes: string[];
  ruleVersion: string;
}

export interface ComputeLandholderDutyInput {
  state: AuState;
  acquisitionDate: ISODate;
  landholderKind: AuLandholderKind;
  landholdingsValue: Cents;
  acquiredInterestBps: number;
  residentialLandValue?: Cents;
  foreignAcquirer?: boolean;
}

export interface ComputeLandholderDutyResult {
  state: AuState;
  relevantAcquisition: boolean;
  significantInterestThresholdBps: number;
  landholdingsValue: Cents;
  dutiableValue: Cents;
  baseDuty: Cents;
  foreignSurchargeDuty: Cents;
  totalDuty: Cents;
  lines: ComputationLine[];
  findings: Finding[];
  notes: string[];
  ruleVersion: string;
}

interface DutyBand {
  from: Cents;
  to?: Cents;
  baseDuty: Cents;
  excessFrom: Cents;
  rateBps?: number;
  ratePer100?: Cents;
  appliesToWholeValue?: boolean;
  label: string;
}

interface TransferSchedule {
  ruleVersion: string;
  minimumDuty: Cents;
  bands: readonly DutyBand[];
}

interface NswPremiumSchedule {
  ruleVersion: string;
  threshold: Cents;
  baseDuty: Cents;
  rateBps: number;
}

interface LandholderRule {
  ruleVersion: string;
  thresholdBpsByKind: Partial<Record<AuLandholderKind, number>>;
  publicChargeMode: "FULL_VALUE" | "TEN_PERCENT_OF_FULL_DUTY";
  publicChargeFrom?: ISODate;
}

interface ForeignSurchargeRate {
  ruleVersion: string;
  rateBps: number;
}

function dollars(cents: Cents): string {
  return `A$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "21 May 2012", for messages a person reads. */
function longDate(date: ISODate): string {
  const { y, m, d } = parseISO(date);
  return `${d} ${MONTHS[m - 1]} ${y}`;
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

function proportionalShare(amount: Cents, bps: number): Cents {
  return mulRatio(amount, assertBps(bps, "share"), 10_000);
}

function line(code: string, label: string, amount: Cents, note?: string, indent = 0): ComputationLine {
  return { code, label, amount, kind: "AMOUNT", source: "RULE", note, indent };
}

function rateToText(band: DutyBand): string {
  if (band.ratePer100 !== undefined) return `${dollars(band.ratePer100)} per A$100 or part`;
  if (band.rateBps !== undefined) return `${band.rateBps / 100}%`;
  return "0%";
}

function applyDutyBand(value: Cents, band: DutyBand): Cents {
  if (value <= band.excessFrom) return band.appliesToWholeValue ? applyRate(value, band) : band.baseDuty;
  const base = band.baseDuty;
  if (band.appliesToWholeValue) return applyRate(value, band);
  if (band.ratePer100 !== undefined) {
    const increments = Math.ceil((value - band.excessFrom) / 10_000);
    return base + increments * band.ratePer100;
  }
  return base + applyRate(value - band.excessFrom, band);
}

function applyRate(value: Cents, band: DutyBand): Cents {
  if (band.rateBps !== undefined) return mulBps(value, band.rateBps);
  if (band.ratePer100 !== undefined) return Math.ceil(value / 10_000) * band.ratePer100;
  return 0;
}

function findBand(schedule: TransferSchedule, value: Cents): DutyBand {
  const band = schedule.bands.find((candidate) => value >= candidate.from && (candidate.to === undefined || value <= candidate.to));
  if (!band) throw new RangeError(`No duty band covers ${value}.`);
  return band;
}

function computeScheduledDuty(schedule: TransferSchedule, value: Cents, opts: { floorWholeDollar?: boolean } = {}): { duty: Cents; band: DutyBand } {
  const band = findBand(schedule, value);
  let duty = applyDutyBand(value, band);
  if (opts.floorWholeDollar) duty = floorToDollar(duty);
  if (value > 0 && duty < schedule.minimumDuty) duty = schedule.minimumDuty;
  return { duty, band };
}

function resolveResidentialComponent(input: ComputeTransferDutyInput, findings: Finding[]): Cents {
  if (input.propertyKind === "RESIDENTIAL") return input.dutiableValue;
  if (input.propertyKind === "NON_RESIDENTIAL") return 0;
  if (input.residentialDutiableValue !== undefined) {
    const residential = assertNonNegativeCents(input.residentialDutiableValue, "residentialDutiableValue");
    if (residential > input.dutiableValue) throw new RangeError("residentialDutiableValue cannot exceed dutiableValue.");
    return residential;
  }
  if (input.residentialShareBps !== undefined) return proportionalShare(input.dutiableValue, input.residentialShareBps);
  findings.push({
    id: "AU_TRANSFER_DUTY.MIXED_USE_SPLIT_REQUIRED",
    severity: "WARNING",
    message: "Mixed-use property supplied without a residential value split; foreign surcharge and NSW premium-duty components were not calculated.",
  });
  return 0;
}

function isForeignForAcquisition(purchaser: AuTransferPurchaser): boolean {
  return Boolean(
    purchaser.foreignPerson ||
      purchaser.foreignCorporation ||
      purchaser.trustWithForeignBeneficiaries ||
      purchaser.discretionaryTrustWithPotentialForeignBeneficiary,
  );
}

function foreignShareBps(purchaser: AuTransferPurchaser): number {
  if (purchaser.foreignOwnerShareBps !== undefined) return assertBps(purchaser.foreignOwnerShareBps, "foreignOwnerShareBps");
  return isForeignForAcquisition(purchaser) ? 10_000 : 0;
}

const NSW_TRANSFER_SCHEDULES: readonly Effective<TransferSchedule>[] = [
  {
    from: "2026-07-01",
    value: {
      ruleVersion: "nsw.transfer.2026-07-01",
      minimumDuty: 2_000,
      bands: [
        { from: 0, to: 1_800_000, baseDuty: 0, excessFrom: 0, rateBps: 125, label: "A$0 to A$18,000" },
        { from: 1_800_100, to: 3_800_000, baseDuty: 22_500, excessFrom: 1_800_000, rateBps: 150, label: "A$18,001 to A$38,000" },
        { from: 3_800_100, to: 10_300_000, baseDuty: 52_500, excessFrom: 3_800_000, rateBps: 175, label: "A$38,001 to A$103,000" },
        { from: 10_300_100, to: 38_700_000, baseDuty: 166_200, excessFrom: 10_300_000, rateBps: 350, label: "A$103,001 to A$387,000" },
        { from: 38_700_100, to: 129_000_000, baseDuty: 1_160_200, excessFrom: 38_700_000, rateBps: 450, label: "A$387,001 to A$1,290,000" },
        { from: 129_000_100, baseDuty: 5_223_700, excessFrom: 129_000_000, rateBps: 550, label: "Over A$1,290,000" },
      ],
    },
  },
  {
    from: "2025-07-01",
    to: "2026-06-30",
    value: {
      ruleVersion: "nsw.transfer.2025-07-01",
      minimumDuty: 2_000,
      bands: [
        { from: 0, to: 1_700_000, baseDuty: 0, excessFrom: 0, rateBps: 125, label: "A$0 to A$17,000" },
        { from: 1_700_100, to: 3_700_000, baseDuty: 21_200, excessFrom: 1_700_000, rateBps: 150, label: "A$17,001 to A$37,000" },
        { from: 3_700_100, to: 9_900_000, baseDuty: 51_200, excessFrom: 3_700_000, rateBps: 175, label: "A$37,001 to A$99,000" },
        { from: 9_900_100, to: 37_200_000, baseDuty: 159_700, excessFrom: 9_900_000, rateBps: 350, label: "A$99,001 to A$372,000" },
        { from: 37_200_100, to: 124_000_000, baseDuty: 1_115_200, excessFrom: 37_200_000, rateBps: 450, label: "A$372,001 to A$1,240,000" },
        { from: 124_000_100, baseDuty: 5_021_200, excessFrom: 124_000_000, rateBps: 550, label: "Over A$1,240,000" },
      ],
    },
  },
  {
    from: "2024-07-01",
    to: "2025-06-30",
    value: {
      ruleVersion: "nsw.transfer.2024-07-01",
      minimumDuty: 2_000,
      bands: [
        { from: 0, to: 1_700_000, baseDuty: 0, excessFrom: 0, rateBps: 125, label: "A$0 to A$17,000" },
        { from: 1_700_100, to: 3_600_000, baseDuty: 21_200, excessFrom: 1_700_000, rateBps: 150, label: "A$17,001 to A$36,000" },
        { from: 3_600_100, to: 9_700_000, baseDuty: 49_700, excessFrom: 3_600_000, rateBps: 175, label: "A$36,001 to A$97,000" },
        { from: 9_700_100, to: 36_400_000, baseDuty: 156_400, excessFrom: 9_700_000, rateBps: 350, label: "A$97,001 to A$364,000" },
        { from: 36_400_100, to: 121_200_000, baseDuty: 1_090_900, excessFrom: 36_400_000, rateBps: 450, label: "A$364,001 to A$1,212,000" },
        { from: 121_200_100, baseDuty: 4_906_900, excessFrom: 121_200_000, rateBps: 550, label: "Over A$1,212,000" },
      ],
    },
  },
  {
    from: "2024-02-01",
    to: "2024-06-30",
    value: {
      ruleVersion: "nsw.transfer.2024-02-01",
      minimumDuty: 2_000,
      bands: [
        { from: 0, to: 1_600_000, baseDuty: 0, excessFrom: 0, rateBps: 125, label: "A$0 to A$16,000" },
        { from: 1_600_100, to: 3_500_000, baseDuty: 20_000, excessFrom: 1_600_000, rateBps: 150, label: "A$16,001 to A$35,000" },
        { from: 3_500_100, to: 9_300_000, baseDuty: 48_500, excessFrom: 3_500_000, rateBps: 175, label: "A$35,001 to A$93,000" },
        { from: 9_300_100, to: 35_100_000, baseDuty: 150_000, excessFrom: 9_300_000, rateBps: 350, label: "A$93,001 to A$351,000" },
        { from: 35_100_100, to: 116_800_000, baseDuty: 1_053_000, excessFrom: 35_100_000, rateBps: 450, label: "A$351,001 to A$1,168,000" },
        { from: 116_800_100, baseDuty: 4_729_500, excessFrom: 116_800_000, rateBps: 550, label: "Over A$1,168,000" },
      ],
    },
  },
  {
    from: "2023-07-01",
    to: "2024-01-31",
    value: {
      ruleVersion: "nsw.transfer.2023-07-01",
      minimumDuty: 1_000,
      bands: [
        { from: 0, to: 1_600_000, baseDuty: 0, excessFrom: 0, rateBps: 125, label: "A$0 to A$16,000" },
        { from: 1_600_100, to: 3_500_000, baseDuty: 20_000, excessFrom: 1_600_000, rateBps: 150, label: "A$16,001 to A$35,000" },
        { from: 3_500_100, to: 9_300_000, baseDuty: 48_500, excessFrom: 3_500_000, rateBps: 175, label: "A$35,001 to A$93,000" },
        { from: 9_300_100, to: 35_100_000, baseDuty: 150_000, excessFrom: 9_300_000, rateBps: 350, label: "A$93,001 to A$351,000" },
        { from: 35_100_100, to: 116_800_000, baseDuty: 1_053_000, excessFrom: 35_100_000, rateBps: 450, label: "A$351,001 to A$1,168,000" },
        { from: 116_800_100, baseDuty: 4_729_500, excessFrom: 116_800_000, rateBps: 550, label: "Over A$1,168,000" },
      ],
    },
  },
  {
    from: "2022-07-01",
    to: "2023-06-30",
    value: {
      ruleVersion: "nsw.transfer.2022-07-01",
      minimumDuty: 1_000,
      bands: [
        { from: 0, to: 1_500_000, baseDuty: 0, excessFrom: 0, rateBps: 125, label: "A$0 to A$15,000" },
        { from: 1_500_100, to: 3_200_000, baseDuty: 18_700, excessFrom: 1_500_000, rateBps: 150, label: "A$15,001 to A$32,000" },
        { from: 3_200_100, to: 8_700_000, baseDuty: 44_200, excessFrom: 3_200_000, rateBps: 175, label: "A$32,001 to A$87,000" },
        { from: 8_700_100, to: 32_700_000, baseDuty: 140_500, excessFrom: 8_700_000, rateBps: 350, label: "A$87,001 to A$327,000" },
        { from: 32_700_100, to: 108_900_000, baseDuty: 980_500, excessFrom: 32_700_000, rateBps: 450, label: "A$327,001 to A$1,089,000" },
        { from: 108_900_100, baseDuty: 4_409_500, excessFrom: 108_900_000, rateBps: 550, label: "Over A$1,089,000" },
      ],
    },
  },
];

const NSW_PREMIUM_SCHEDULES: readonly Effective<NswPremiumSchedule>[] = [
  { from: "2026-07-01", value: { ruleVersion: "nsw.premium.2026-07-01", threshold: 387_000_000, baseDuty: 19_413_700, rateBps: 700 } },
  { from: "2025-07-01", to: "2026-06-30", value: { ruleVersion: "nsw.premium.2025-07-01", threshold: 372_100_000, baseDuty: 18_666_700, rateBps: 700 } },
  { from: "2024-07-01", to: "2025-06-30", value: { ruleVersion: "nsw.premium.2024-07-01", threshold: 363_600_000, baseDuty: 18_238_900, rateBps: 700 } },
  { from: "2023-07-01", to: "2024-06-30", value: { ruleVersion: "nsw.premium.2023-07-01", threshold: 350_500_000, baseDuty: 17_583_000, rateBps: 700 } },
  { from: "2022-07-01", to: "2023-06-30", value: { ruleVersion: "nsw.premium.2022-07-01", threshold: 326_800_000, baseDuty: 16_394_000, rateBps: 700 } },
];

const NSW_SURCHARGE_PURCHASER_RATES: readonly Effective<ForeignSurchargeRate>[] = [
  { from: "2025-01-01", value: { ruleVersion: "nsw.surcharge.2025-01-01", rateBps: 900 } },
  { from: "2017-07-01", to: "2024-12-31", value: { ruleVersion: "nsw.surcharge.2017-07-01", rateBps: 800 } },
  { from: "2016-06-21", to: "2017-06-30", value: { ruleVersion: "nsw.surcharge.2016-06-21", rateBps: 400 } },
];

const VIC_TRANSFER_SCHEDULES: readonly Effective<TransferSchedule>[] = [
  {
    from: "2021-07-01",
    value: {
      ruleVersion: "vic.transfer.2021-07-01",
      minimumDuty: 0,
      bands: [
        { from: 0, to: 2_500_000, baseDuty: 0, excessFrom: 0, rateBps: 140, label: "A$0 to A$25,000" },
        { from: 2_500_001, to: 13_000_000, baseDuty: 35_000, excessFrom: 2_500_000, rateBps: 240, label: "Above A$25,000 to A$130,000" },
        { from: 13_000_001, to: 96_000_000, baseDuty: 287_000, excessFrom: 13_000_000, rateBps: 600, label: "Above A$130,000 to A$960,000" },
        { from: 96_000_001, to: 200_000_000, baseDuty: 0, excessFrom: 0, rateBps: 550, appliesToWholeValue: true, label: "Above A$960,000 to A$2,000,000" },
        { from: 200_000_001, baseDuty: 11_000_000, excessFrom: 200_000_000, rateBps: 650, label: "More than A$2,000,000" },
      ],
    },
  },
  {
    from: "2008-05-06",
    to: "2021-06-30",
    value: {
      ruleVersion: "vic.transfer.2008-05-06",
      minimumDuty: 0,
      bands: [
        { from: 0, to: 2_500_000, baseDuty: 0, excessFrom: 0, rateBps: 140, label: "A$0 to A$25,000" },
        { from: 2_500_001, to: 13_000_000, baseDuty: 35_000, excessFrom: 2_500_000, rateBps: 240, label: "Above A$25,000 to A$130,000" },
        { from: 13_000_001, to: 96_000_000, baseDuty: 287_000, excessFrom: 13_000_000, rateBps: 600, label: "Above A$130,000 to A$960,000" },
        { from: 96_000_001, baseDuty: 0, excessFrom: 0, rateBps: 550, appliesToWholeValue: true, label: "More than A$960,000" },
      ],
    },
  },
];

const VIC_FOREIGN_SURCHARGE_RATES: readonly Effective<ForeignSurchargeRate>[] = [
  { from: "2019-07-01", value: { ruleVersion: "vic.surcharge.2019-07-01", rateBps: 800 } },
  { from: "2016-07-01", to: "2019-06-30", value: { ruleVersion: "vic.surcharge.2016-07-01", rateBps: 700 } },
  { from: "2015-07-01", to: "2016-06-30", value: { ruleVersion: "vic.surcharge.2015-07-01", rateBps: 300 } },
];

const QLD_TRANSFER_SCHEDULES: readonly Effective<TransferSchedule>[] = [
  {
    from: "2012-09-21",
    value: {
      ruleVersion: "qld.transfer.2012-09-21",
      minimumDuty: 0,
      bands: [
        { from: 0, to: 500_000, baseDuty: 0, excessFrom: 500_000, ratePer100: 0, label: "Not more than A$5,000" },
        { from: 500_001, to: 7_500_000, baseDuty: 0, excessFrom: 500_000, ratePer100: 150, label: "More than A$5,000 up to A$75,000" },
        { from: 7_500_001, to: 54_000_000, baseDuty: 105_000, excessFrom: 7_500_000, ratePer100: 350, label: "A$75,000 to A$540,000" },
        { from: 54_000_001, to: 100_000_000, baseDuty: 1_732_500, excessFrom: 54_000_000, ratePer100: 450, label: "A$540,000 to A$1,000,000" },
        { from: 100_000_001, baseDuty: 3_802_500, excessFrom: 100_000_000, ratePer100: 575, label: "More than A$1,000,000" },
      ],
    },
  },
];

const QLD_FOREIGN_SURCHARGE_RATES: readonly Effective<ForeignSurchargeRate>[] = [
  { from: "2016-10-01", value: { ruleVersion: "qld.surcharge.2016-10-01", rateBps: 800 } },
];

// Western Australia general rate (Department of Treasury and Finance). The page applies it to transactions from 2 July 2014 and directs
// earlier transactions to RevenueWA, so earlier contracts are not modelled.
const WA_TRANSFER_SCHEDULES: readonly Effective<TransferSchedule>[] = [
  {
    from: "2014-07-02",
    value: {
      ruleVersion: "wa.transfer.2014-07-02",
      minimumDuty: 0,
      bands: [
        { from: 0, to: 12_000_000, baseDuty: 0, excessFrom: 0, ratePer100: 190, label: "A$0 to A$120,000" },
        { from: 12_000_001, to: 15_000_000, baseDuty: 228_000, excessFrom: 12_000_000, ratePer100: 285, label: "A$120,001 to A$150,000" },
        { from: 15_000_001, to: 36_000_000, baseDuty: 313_500, excessFrom: 15_000_000, ratePer100: 380, label: "A$150,001 to A$360,000" },
        { from: 36_000_001, to: 72_500_000, baseDuty: 1_111_500, excessFrom: 36_000_000, ratePer100: 475, label: "A$360,001 to A$725,000" },
        { from: 72_500_001, baseDuty: 2_845_300, excessFrom: 72_500_000, ratePer100: 515, label: "A$725,001 and over" },
      ],
    },
  },
];

/** WA foreign transfer duty: 7% of the dutiable value of residential property acquired by a foreign person, from 1 January 2019. */
const WA_FOREIGN_SURCHARGE_RATES: readonly Effective<ForeignSurchargeRate>[] = [
  { from: "2019-01-01", value: { ruleVersion: "wa.surcharge.2019-01-01", rateBps: 700 } },
];

// South Australia conveyance rates (RevenueSA "Rate of stamp duty"). Applied to contracts from 1 July 2018, when duty on qualifying
// (non-residential, non-primary-production) land ended (Stamp Duties Act 1923 s71DC; RevenueSA Information Circular 103); earlier
// contracts, including the phase-out years, are not modelled.
const SA_TRANSFER_FROM = "2018-07-01";
const SA_TRANSFER_SCHEDULES: readonly Effective<TransferSchedule>[] = [
  {
    from: SA_TRANSFER_FROM,
    value: {
      ruleVersion: "sa.transfer.2018-07-01",
      minimumDuty: 0,
      bands: [
        { from: 0, to: 1_200_000, baseDuty: 0, excessFrom: 0, ratePer100: 100, label: "Not more than A$12,000" },
        { from: 1_200_001, to: 3_000_000, baseDuty: 12_000, excessFrom: 1_200_000, ratePer100: 200, label: "More than A$12,000 to A$30,000" },
        { from: 3_000_001, to: 5_000_000, baseDuty: 48_000, excessFrom: 3_000_000, ratePer100: 300, label: "More than A$30,000 to A$50,000" },
        { from: 5_000_001, to: 10_000_000, baseDuty: 108_000, excessFrom: 5_000_000, ratePer100: 350, label: "More than A$50,000 to A$100,000" },
        { from: 10_000_001, to: 20_000_000, baseDuty: 283_000, excessFrom: 10_000_000, ratePer100: 400, label: "More than A$100,000 to A$200,000" },
        { from: 20_000_001, to: 25_000_000, baseDuty: 683_000, excessFrom: 20_000_000, ratePer100: 425, label: "More than A$200,000 to A$250,000" },
        { from: 25_000_001, to: 30_000_000, baseDuty: 895_500, excessFrom: 25_000_000, ratePer100: 475, label: "More than A$250,000 to A$300,000" },
        { from: 30_000_001, to: 50_000_000, baseDuty: 1_133_000, excessFrom: 30_000_000, ratePer100: 500, label: "More than A$300,000 to A$500,000" },
        { from: 50_000_001, baseDuty: 2_133_000, excessFrom: 50_000_000, ratePer100: 550, label: "More than A$500,000" },
      ],
    },
  },
];
const SA_QUALIFYING_LAND_RULE = "sa.qualifying-land.2018-07-01";

const NSW_LANDHOLDER_RULES: readonly Effective<LandholderRule>[] = [
  {
    from: "2024-02-01",
    value: {
      ruleVersion: "nsw.landholder.2024-02-01",
      thresholdBpsByKind: { PRIVATE_COMPANY: 5000, PRIVATE_UNIT_TRUST: 2000, WHOLESALE_UNIT_TRUST: 5000, PUBLIC_LANDHOLDER: 9000 },
      publicChargeMode: "FULL_VALUE",
      publicChargeFrom: "2023-07-01",
    },
  },
  {
    from: "2023-07-01",
    to: "2024-01-31",
    value: {
      ruleVersion: "nsw.landholder.2023-07-01",
      thresholdBpsByKind: { PRIVATE_COMPANY: 5000, PRIVATE_UNIT_TRUST: 5000, WHOLESALE_UNIT_TRUST: 5000, PUBLIC_LANDHOLDER: 9000 },
      publicChargeMode: "FULL_VALUE",
      publicChargeFrom: "2023-07-01",
    },
  },
];

const VIC_LANDHOLDER_RULES: readonly Effective<LandholderRule>[] = [
  {
    from: "2021-07-01",
    value: {
      ruleVersion: "vic.landholder.2021-07-01",
      thresholdBpsByKind: { PRIVATE_COMPANY: 5000, PRIVATE_UNIT_TRUST: 2000, WHOLESALE_UNIT_TRUST: 5000, PUBLIC_LANDHOLDER: 9000 },
      publicChargeMode: "TEN_PERCENT_OF_FULL_DUTY",
    },
  },
  {
    from: "2008-05-06",
    to: "2021-06-30",
    value: {
      ruleVersion: "vic.landholder.2008-05-06",
      thresholdBpsByKind: { PRIVATE_COMPANY: 5000, PRIVATE_UNIT_TRUST: 2000, WHOLESALE_UNIT_TRUST: 5000, PUBLIC_LANDHOLDER: 9000 },
      publicChargeMode: "TEN_PERCENT_OF_FULL_DUTY",
    },
  },
];

const QLD_LANDHOLDER_RULES: readonly Effective<LandholderRule>[] = [
  {
    from: "2011-07-01",
    value: {
      ruleVersion: "qld.landholder.2011-07-01",
      thresholdBpsByKind: { PRIVATE_COMPANY: 5000, PRIVATE_UNIT_TRUST: 5000, WHOLESALE_UNIT_TRUST: 5000, PUBLIC_LANDHOLDER: 9000 },
      publicChargeMode: "TEN_PERCENT_OF_FULL_DUTY",
    },
  },
];

function computeNswTransferDuty(date: ISODate, dutiableValue: Cents, residentialValue: Cents): { duty: Cents; lines: ComputationLine[]; ruleVersion: string } {
  const schedule = requireEffective(NSW_TRANSFER_SCHEDULES, date, "NSW transfer duty");
  const premium = requireEffective(NSW_PREMIUM_SCHEDULES, date, "NSW premium duty");
  let duty: Cents;
  const lines: ComputationLine[] = [];
  if (residentialValue === dutiableValue && residentialValue > premium.threshold) {
    duty = floorToDollar(premium.baseDuty + mulBps(residentialValue - premium.threshold, premium.rateBps));
    lines.push(line("AU.NSW.TRANSFER.PREMIUM", `NSW premium-duty formula (${premium.ruleVersion})`, duty, `A$194,137 + 7% style premium-duty formula above the indexed threshold.`));
    return { duty, lines, ruleVersion: `${schedule.ruleVersion}+${premium.ruleVersion}` };
  }
  if (residentialValue > 0 && residentialValue < dutiableValue) {
    const residentialDuty = residentialValue > premium.threshold
      ? floorToDollar(premium.baseDuty + mulBps(residentialValue - premium.threshold, premium.rateBps))
      : computeScheduledDuty(schedule, residentialValue, { floorWholeDollar: true }).duty;
    const nonResidentialValue = dutiableValue - residentialValue;
    const nonResidentialDuty = computeScheduledDuty(schedule, nonResidentialValue, { floorWholeDollar: true }).duty;
    duty = residentialDuty + nonResidentialDuty;
    lines.push(line("AU.NSW.TRANSFER.RESIDENTIAL_COMPONENT", "NSW duty on residential component", residentialDuty));
    lines.push(line("AU.NSW.TRANSFER.NON_RESIDENTIAL_COMPONENT", "NSW duty on non-residential component", nonResidentialDuty));
    return { duty, lines, ruleVersion: `${schedule.ruleVersion}+${premium.ruleVersion}` };
  }
  const band = computeScheduledDuty(schedule, dutiableValue, { floorWholeDollar: true });
  duty = band.duty;
  lines.push(line("AU.NSW.TRANSFER.BASE", `NSW transfer-duty formula (${band.band.label})`, duty, `${rateToText(band.band)} with NSW whole-dollar truncation.`));
  return { duty, lines, ruleVersion: schedule.ruleVersion };
}

function computeVicTransferDuty(date: ISODate, dutiableValue: Cents): { duty: Cents; lines: ComputationLine[]; ruleVersion: string } {
  const schedule = requireEffective(VIC_TRANSFER_SCHEDULES, date, "VIC land transfer duty");
  const band = computeScheduledDuty(schedule, dutiableValue);
  return {
    duty: band.duty,
    lines: [line("AU.VIC.TRANSFER.BASE", `VIC transfer-duty formula (${band.band.label})`, band.duty, rateToText(band.band))],
    ruleVersion: schedule.ruleVersion,
  };
}

function computeQldTransferDuty(date: ISODate, dutiableValue: Cents): { duty: Cents; lines: ComputationLine[]; ruleVersion: string } {
  const schedule = requireEffective(QLD_TRANSFER_SCHEDULES, date, "QLD transfer duty");
  const band = computeScheduledDuty(schedule, dutiableValue);
  return {
    duty: band.duty,
    lines: [line("AU.QLD.TRANSFER.BASE", `QLD transfer-duty formula (${band.band.label})`, band.duty, rateToText(band.band))],
    ruleVersion: schedule.ruleVersion,
  };
}

function computeWaTransferDuty(date: ISODate, dutiableValue: Cents): { duty: Cents; lines: ComputationLine[]; ruleVersion: string } {
  const schedule = pickEffective(WA_TRANSFER_SCHEDULES, date);
  if (!schedule) throw new RangeError(`Western Australian transfer duty is modelled for transactions from 2 July 2014; this contract is dated ${longDate(date)}.`);
  const band = computeScheduledDuty(schedule, dutiableValue);
  return {
    duty: band.duty,
    lines: [line("AU.WA.TRANSFER.BASE", `WA general rate (${band.band.label})`, band.duty, rateToText(band.band))],
    ruleVersion: schedule.ruleVersion,
  };
}

/**
 * South Australia: the conveyance scale on the whole dutiable value, with no duty on qualifying (non-residential, non-primary-production)
 * land. A mixed-use value is charged the residential share of the duty on the whole value, to the nearest cent, which reproduces RevenueSA
 * Information Circular 103's worked example (A$62,634.55 of A$114,830).
 */
function computeSaTransferDuty(date: ISODate, dutiableValue: Cents, residentialValue: Cents): { duty: Cents; lines: ComputationLine[]; ruleVersion: string } {
  const schedule = date >= SA_TRANSFER_FROM ? pickEffective(SA_TRANSFER_SCHEDULES, date) : undefined;
  if (!schedule) throw new RangeError(`South Australian transfer duty is modelled for contracts from 1 July 2018, when duty on non-residential land ended; this contract is dated ${longDate(date)}.`);
  if (residentialValue === 0) {
    return {
      duty: 0,
      lines: [line("AU.SA.TRANSFER.QUALIFYING_LAND", "SA qualifying land: no duty", 0, "No duty on non-residential, non-primary-production land for contracts from 1 July 2018.")],
      ruleVersion: `${schedule.ruleVersion}+${SA_QUALIFYING_LAND_RULE}`,
    };
  }
  const whole = computeScheduledDuty(schedule, dutiableValue);
  if (residentialValue >= dutiableValue) {
    return {
      duty: whole.duty,
      lines: [line("AU.SA.TRANSFER.BASE", `SA conveyance rate (${whole.band.label})`, whole.duty, rateToText(whole.band))],
      ruleVersion: schedule.ruleVersion,
    };
  }
  const duty = mulRatio(whole.duty, residentialValue, dutiableValue);
  return {
    duty,
    lines: [
      line("AU.SA.TRANSFER.WHOLE_VALUE", `SA conveyance rate on the whole value (${whole.band.label})`, whole.duty, rateToText(whole.band)),
      line("AU.SA.TRANSFER.RESIDENTIAL_SHARE", "Residential share of that duty (qualifying land pays none)", duty, "Apportioned by value, to the nearest cent."),
    ],
    ruleVersion: `${schedule.ruleVersion}+${SA_QUALIFYING_LAND_RULE}`,
  };
}

function surchargeRate(state: AuState, date: ISODate): ForeignSurchargeRate | undefined {
  if (state === "NSW") return requireEffective(NSW_SURCHARGE_PURCHASER_RATES, date, "NSW surcharge purchaser duty");
  if (state === "VIC") return requireEffective(VIC_FOREIGN_SURCHARGE_RATES, date, "VIC foreign purchaser additional duty");
  if (state === "QLD") return requireEffective(QLD_FOREIGN_SURCHARGE_RATES, date, "QLD AFAD");
  if (state === "WA") return pickEffective(WA_FOREIGN_SURCHARGE_RATES, date);
  return undefined;
}

function computeBaseTransferDuty(state: AuState, date: ISODate, dutiableValue: Cents, residentialValue: Cents): { duty: Cents; lines: ComputationLine[]; ruleVersion: string } {
  if (state === "NSW") return computeNswTransferDuty(date, dutiableValue, residentialValue);
  if (state === "VIC") return computeVicTransferDuty(date, dutiableValue);
  if (state === "QLD") return computeQldTransferDuty(date, dutiableValue);
  if (state === "WA") return computeWaTransferDuty(date, dutiableValue);
  if (state === "SA") return computeSaTransferDuty(date, dutiableValue, residentialValue);
  throw new RangeError(`Transfer duty is not modelled for ${state}.`);
}

const MODELLED_TRANSFER_STATES: readonly AuState[] = ["NSW", "VIC", "QLD", "WA", "SA"];

export function computeTransferDuty(input: ComputeTransferDutyInput): ComputeTransferDutyResult {
  assertDate(input.contractDate, "contractDate");
  const dutiableValue = assertNonNegativeCents(input.dutiableValue, "dutiableValue");
  if (!MODELLED_TRANSFER_STATES.includes(input.state)) throw new RangeError(`Transfer duty is not modelled for ${input.state}.`);
  const findings: Finding[] = [];
  const residentialDutiableValue = resolveResidentialComponent({ ...input, dutiableValue }, findings);
  const base = computeBaseTransferDuty(input.state, input.contractDate, dutiableValue, residentialDutiableValue);
  const surchargeBase = proportionalShare(residentialDutiableValue, foreignShareBps(input.purchaser));
  if (input.state === "SA" && surchargeBase > 0) {
    findings.push({
      id: "AU_TRANSFER_DUTY.SA_FOREIGN_SURCHARGE_NOT_MODELLED",
      severity: "WARNING",
      message: "South Australia's foreign ownership surcharge on residential land is not modelled here; add it separately.",
    });
  }
  const foreignRate = surchargeBase > 0 ? surchargeRate(input.state, input.contractDate) : undefined;
  const foreignSurchargeDuty = foreignRate && surchargeBase > 0 ? mulBps(surchargeBase, foreignRate.rateBps) : 0;
  const totalDuty = base.duty + foreignSurchargeDuty;
  const notes = [
    ENGINE_DISCLAIMER_AU,
    "Investor/commercial purchaser settings only: first-home, owner-occupier and other concessional pathways are out of scope.",
    "Mixed-use calculations need a residential split supplied by value or share. The engine does not infer that split from zoning or floor area.",
  ];
  if (input.purchaser.kind === "TRUST") {
    notes.push("Foreign-trust status must be supplied by the caller. NSW discretionary trusts generally need an irrevocable foreign-beneficiary exclusion; VIC and QLD use their own foreign-beneficiary / substantial-interest tests.");
  }
  const lines = [
    line("AU.TRANSFER.DUTIABLE_VALUE", "Dutiable value", dutiableValue),
    ...base.lines,
    ...(foreignSurchargeDuty > 0
      ? [line("AU.TRANSFER.FOREIGN_SURCHARGE", `${input.state} foreign purchaser surcharge`, foreignSurchargeDuty, `${foreignRate!.rateBps / 100}% of the surchargeable residential component.`)]
      : []),
    line("AU.TRANSFER.TOTAL", "Total transfer / stamp duty", totalDuty),
  ];
  return {
    state: input.state,
    dutiableValue,
    residentialDutiableValue,
    baseDuty: base.duty,
    foreignSurchargeDuty,
    totalDuty,
    lines,
    findings,
    notes,
    ruleVersion: foreignSurchargeDuty > 0 ? `${base.ruleVersion}+${foreignRate!.ruleVersion}` : base.ruleVersion,
  };
}

function nswLandholderPublicSupported(date: ISODate): boolean {
  return date >= "2023-07-01";
}

function vicLandholderPhasing(landholdingsValue: Cents, duty: Cents): Cents {
  if (landholdingsValue < 100_000_000 || landholdingsValue >= 200_000_000) return duty;
  return mulRatio(duty, landholdingsValue - 100_000_000, 100_000_000);
}

export function computeLandholderDuty(input: ComputeLandholderDutyInput): ComputeLandholderDutyResult {
  const date = assertDate(input.acquisitionDate, "acquisitionDate");
  const landholdingsValue = assertNonNegativeCents(input.landholdingsValue, "landholdingsValue");
  const acquiredInterestBps = assertBps(input.acquiredInterestBps, "acquiredInterestBps");
  const residentialLandValue = input.residentialLandValue === undefined ? 0 : assertNonNegativeCents(input.residentialLandValue, "residentialLandValue");
  const findings: Finding[] = [];
  const notes = [
    ENGINE_DISCLAIMER_AU,
    "Landholder duty is modelled for direct single-step relevant acquisitions only. Multi-step statement-period reconstructions, deductions for prior exemption acquisitions and non-NSW goods exclusions need manual review.",
  ];

  let rule: LandholderRule;
  if (input.state === "NSW") rule = requireEffective(NSW_LANDHOLDER_RULES, date, "NSW landholder duty");
  else if (input.state === "VIC") rule = requireEffective(VIC_LANDHOLDER_RULES, date, "VIC landholder duty");
  else if (input.state === "QLD") rule = requireEffective(QLD_LANDHOLDER_RULES, date, "QLD landholder duty");
  else throw new RangeError(`Landholder duty is not modelled for ${input.state}.`);

  const threshold = rule.thresholdBpsByKind[input.landholderKind];
  if (threshold === undefined) throw new RangeError(`No landholder threshold defined for ${input.landholderKind}.`);
  if (acquiredInterestBps < threshold) {
    findings.push({
      id: "AU_LANDHOLDER.NO_RELEVANT_ACQUISITION",
      severity: "INFO",
      message: `No relevant acquisition is modelled because the acquired interest (${acquiredInterestBps / 100}%) is below the ${threshold / 100}% threshold for ${input.landholderKind}.`,
    });
    return {
      state: input.state,
      relevantAcquisition: false,
      significantInterestThresholdBps: threshold,
      landholdingsValue,
      dutiableValue: 0,
      baseDuty: 0,
      foreignSurchargeDuty: 0,
      totalDuty: 0,
      lines: [line("AU.LANDHOLDER.TOTAL", "Landholder duty", 0)],
      findings,
      notes,
      ruleVersion: rule.ruleVersion,
    };
  }

  let dutiableValue = landholdingsValue;
  let baseDuty = 0;
  let transferRuleVersion = "";
  if (input.landholderKind !== "PUBLIC_LANDHOLDER") {
    dutiableValue = proportionalShare(landholdingsValue, acquiredInterestBps);
    const transfer = computeBaseTransferDuty(input.state, date, dutiableValue, 0);
    baseDuty = transfer.duty;
    transferRuleVersion = transfer.ruleVersion;
  } else if (input.state === "NSW") {
    if (!nswLandholderPublicSupported(date)) {
      throw new RangeError("NSW public-landholder acquisitions before 1 July 2023 are not modelled.");
    }
    const transfer = computeBaseTransferDuty("NSW", date, landholdingsValue, 0);
    baseDuty = transfer.duty;
    transferRuleVersion = transfer.ruleVersion;
  } else {
    const transfer = computeBaseTransferDuty(input.state, date, landholdingsValue, 0);
    baseDuty = mulRatio(transfer.duty, 1, 10);
    transferRuleVersion = transfer.ruleVersion;
  }
  if (input.state === "VIC") baseDuty = vicLandholderPhasing(landholdingsValue, baseDuty);

  let foreignSurchargeDuty = 0;
  let foreignSurchargeRuleVersion = "";
  if (input.foreignAcquirer && residentialLandValue > 0) {
    if (input.state === "QLD") {
      const foreignRate = surchargeRate("QLD", date)!;
      if (input.landholderKind === "PUBLIC_LANDHOLDER") foreignSurchargeDuty = mulRatio(mulBps(residentialLandValue, foreignRate.rateBps), 1, 10);
      else foreignSurchargeDuty = mulBps(proportionalShare(residentialLandValue, acquiredInterestBps), foreignRate.rateBps);
      foreignSurchargeRuleVersion = foreignRate.ruleVersion;
    } else if (input.state === "VIC") {
      const foreignRate = surchargeRate("VIC", date)!;
      foreignSurchargeDuty = mulBps(proportionalShare(residentialLandValue, acquiredInterestBps), foreignRate.rateBps);
      foreignSurchargeRuleVersion = foreignRate.ruleVersion;
    } else {
      findings.push({
        id: "AU_LANDHOLDER.FOREIGN_SURCHARGE_REVIEW",
        severity: "WARNING",
        message: `${input.state} foreign purchaser surcharge on landholder acquisitions must be reviewed manually; this engine does not model that surcharge for ${input.state}.`,
      });
    }
  }

  const totalDuty = baseDuty + foreignSurchargeDuty;
  const lines = [
    line("AU.LANDHOLDER.VALUE", "Unencumbered landholder value", landholdingsValue),
    line("AU.LANDHOLDER.DUTIABLE_VALUE", "Landholder dutiable value", input.landholderKind === "PUBLIC_LANDHOLDER" && input.state !== "QLD" && input.state !== "VIC" ? landholdingsValue : dutiableValue, `Threshold ${threshold / 100}%`),
    line("AU.LANDHOLDER.BASE_DUTY", "Landholder duty", baseDuty),
    ...(foreignSurchargeDuty > 0 ? [line("AU.LANDHOLDER.FOREIGN_SURCHARGE", "Additional foreign acquirer duty", foreignSurchargeDuty)] : []),
    line("AU.LANDHOLDER.TOTAL", "Total landholder duty", totalDuty),
  ];

  return {
    state: input.state,
    relevantAcquisition: true,
    significantInterestThresholdBps: threshold,
    landholdingsValue,
    dutiableValue: input.landholderKind === "PUBLIC_LANDHOLDER" && input.state !== "QLD" && input.state !== "VIC" ? landholdingsValue : dutiableValue,
    baseDuty,
    foreignSurchargeDuty,
    totalDuty,
    lines,
    findings,
    notes,
    ruleVersion: foreignSurchargeDuty > 0 ? `${rule.ruleVersion}+${transferRuleVersion}+${foreignSurchargeRuleVersion}` : `${rule.ruleVersion}+${transferRuleVersion}`,
  };
}

export const RULES: RuleEntry[] = [
  {
    id: "au-transfer-duty.nsw.general.2026-07-01",
    domain: "AU_TRANSFER_DUTY",
    title: "NSW transfer-duty rates for 2026-27",
    summary: "Revenue NSW indexes transfer-duty and premium-duty thresholds annually. The 2026-27 schedule starts at A$1.25 per A$100 up to A$18,000 and reaches A$52,237 plus 5.5% over A$1.29m; residential premium duty applies above A$3.87m.",
    effectiveFrom: "2026-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "Revenue NSW | How to calculate transfer duty", url: "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty/understanding-transfer-duty/calculate-transfer-duty", retrieved: "2026-10-10", publisher: "Revenue NSW" },
    ],
  },
  {
    id: "au-transfer-duty.nsw.historical.2022-07-01",
    domain: "AU_TRANSFER_DUTY",
    title: "NSW indexed transfer-duty schedules from 1 July 2022 to 30 June 2026",
    summary: "Revenue NSW publishes indexed duty and premium thresholds for each financial year. The engine includes the 2022-23, 2023-24, 2024-25 and 2025-26 schedules so historical recomputations stay aligned to the contract date.",
    effectiveFrom: "2022-07-01",
    effectiveTo: "2026-06-30",
    confidence: "VERIFIED",
    sources: [
      { title: "Revenue NSW | Past thresholds and rates for transfer duty", url: "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty/understanding-transfer-duty/calculate-transfer-duty/past-thresholds-and-rates", retrieved: "2026-10-10", publisher: "Revenue NSW" },
    ],
  },
  {
    id: "au-transfer-duty.nsw.surcharge.2025-01-01",
    domain: "AU_TRANSFER_DUTY",
    title: "NSW surcharge purchaser duty",
    summary: "Foreign persons pay surcharge purchaser duty on residential-related property at 9% from 1 January 2025 and 8% for contracts from 1 July 2017 to 31 December 2024. NSW trust and corporation foreign-status tests follow Chapter 2A and Revenue Ruling G009.",
    effectiveFrom: "2017-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "Revenue NSW | What is surcharge purchaser duty", url: "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty/surcharge-purchaser-duty/what-is-surcharge-purchaser-duty", retrieved: "2026-10-10", publisher: "Revenue NSW" },
      { title: "Revenue NSW | Past thresholds and rates for transfer duty", url: "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty/understanding-transfer-duty/calculate-transfer-duty/past-thresholds-and-rates", retrieved: "2026-10-10", publisher: "Revenue NSW" },
      { title: "Revenue NSW | Surcharge purchaser duty for trusts", url: "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty/surcharge-purchaser-duty/trusts", retrieved: "2026-10-10", publisher: "Revenue NSW" },
    ],
  },
  {
    id: "au-transfer-duty.nsw.landholder.2024-02-01",
    domain: "AU_TRANSFER_DUTY",
    title: "NSW landholder duty",
    summary: "NSW landholder duty applies once a landholder has NSW landholdings of A$2m or more. From 1 February 2024 most private unit trusts use a 20% significant-interest threshold; private companies and registered wholesale or imminent wholesale unit trusts use 50%; public landholders use 90%.",
    effectiveFrom: "2023-07-01",
    confidence: "VERIFIED",
    notes: "The engine models current direct single-step relevant acquisitions. Pre-1 July 2023 public-landholder calculations and multi-step statement-period histories require manual review.",
    sources: [
      { title: "Revenue NSW | What is landholder duty", url: "https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty/landholder-duty/what-is-landholder-duty", retrieved: "2026-10-10", publisher: "Revenue NSW" },
      { title: "Revenue NSW | Liability to pay landholder duty", url: "https://www.revenue.nsw.gov.au/property-professionals-resource-centre/guides-rulings-cpns/topics/landholder-duty/liability-to-pay-landholder-duty", retrieved: "2026-10-10", publisher: "Revenue NSW" },
      { title: "Revenue NSW | How landholder duty is calculated", url: "https://www.revenue.nsw.gov.au/property-professionals-resource-centre/guides-rulings-cpns/topics/landholder-duty/calculating-landholder-duty", retrieved: "2026-10-10", publisher: "Revenue NSW" },
    ],
  },
  {
    id: "au-transfer-duty.vic.general.2021-07-01",
    domain: "AU_TRANSFER_DUTY",
    title: "Victoria non-principal-place-of-residence duty rates",
    summary: "Victoria's general investor rates start at 1.4% up to A$25,000, step through 2.4% and 6%, use a flat 5.5% from A$960,000 to A$2m and A$110,000 plus 6.5% over A$2m from 1 July 2021.",
    effectiveFrom: "2021-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "SRO Victoria | Land transfer duty – non-principal place of residence (current rates)", url: "https://www.sro.vic.gov.au/about-us/rates-and-statistics/current-rates/land-transfer-duty-non-principal-place-residence-current-rates", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
      { title: "SRO Victoria | Premium duty rate for agreements or arrangements entered into on or after 1 July 2021", url: "https://www.sro.vic.gov.au/about-us/rates-and-statistics/current-rates/premium-duty-rate-agreements-or-arrangements-entered-or-after-1-july-2021", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
    ],
  },
  {
    id: "au-transfer-duty.vic.general.pre2021",
    domain: "AU_TRANSFER_DUTY",
    title: "Victoria historical investor duty rates before 1 July 2021",
    summary: "For agreements or arrangements entered into before 1 July 2021, Victoria used the same lower-tier rates but capped the top marginal formula at a flat 5.5% above A$960,000 without the premium 6.5% band.",
    effectiveFrom: "2008-05-06",
    effectiveTo: "2021-06-30",
    confidence: "VERIFIED",
    sources: [
      { title: "SRO Victoria | Land transfer duty – non-principal place of residence (historical rates)", url: "https://www.sro.vic.gov.au/about-us/rates-and-statistics/historical-rates/land-transfer-duty-non-principal-place-residence-historical-rates", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
    ],
  },
  {
    id: "au-transfer-duty.vic.fpad.2019-07-01",
    domain: "AU_TRANSFER_DUTY",
    title: "Victoria foreign purchaser additional duty",
    summary: "Victoria's foreign purchaser additional duty is 8% from 1 July 2019, 7% from 1 July 2016 and 3% from 1 July 2015. It applies to foreign natural persons, foreign corporations and trustees of foreign trusts acquiring residential property.",
    effectiveFrom: "2015-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "SRO Victoria | Foreign purchaser additional duty (current rates)", url: "https://www.sro.vic.gov.au/about-us/rates-and-statistics/current-rates/foreign-purchaser-additional-duty-current-rates", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
      { title: "SRO Victoria | Understanding foreign purchaser additional duty", url: "https://www.sro.vic.gov.au/buying-property/foreign-purchasers-property/understanding-foreign-purchaser-additional-duty", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
    ],
  },
  {
    id: "au-transfer-duty.vic.landholder.current",
    domain: "AU_TRANSFER_DUTY",
    title: "Victoria landholder duty",
    summary: "Victoria treats a company or unit trust with Victorian landholdings of A$1m or more as a landholder. Significant-interest thresholds are 20% for private unit trusts, 50% for private companies and wholesale unit trusts, and 90% for public landholders. Public landholders pay 10% of the duty that would apply to a transfer of all Victorian landholdings.",
    effectiveFrom: "2021-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "SRO Victoria | Understanding landholder duty", url: "https://www.sro.vic.gov.au/buying-property/landholder-duty/understanding-landholder-duty", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
      { title: "SRO Victoria | Examples of landholder duty calculations", url: "https://www.sro.vic.gov.au/buying-property/landholder-duty/examples-landholder-duty-calculations", retrieved: "2026-10-10", publisher: "State Revenue Office Victoria" },
    ],
  },
  {
    id: "au-transfer-duty.qld.general.current",
    domain: "AU_TRANSFER_DUTY",
    title: "Queensland transfer-duty rates",
    summary: "Queensland uses a nil band up to A$5,000 and then A$1.50, A$3.50, A$4.50 and A$5.75 for each A$100 or part of A$100 above the threshold, with the current schedule applying to transfer duty, corporate trustee duty and landholder duty.",
    effectiveFrom: "2012-09-21",
    confidence: "VERIFIED",
    sources: [
      { title: "Queensland Revenue Office | Transfer duty rates", url: "https://qro.qld.gov.au/duties/transfer-duty/calculate/rates/", retrieved: "2026-10-10", publisher: "Queensland Revenue Office" },
    ],
  },
  {
    id: "au-transfer-duty.qld.afad.2016-10-01",
    domain: "AU_TRANSFER_DUTY",
    title: "Queensland additional foreign acquirer duty",
    summary: "Queensland AFAD is 8% for relevant transfer-duty, landholder-duty and corporate-trustee-duty acquisitions of AFAD residential land by foreign individuals, foreign corporations and trustees of foreign trusts.",
    effectiveFrom: "2016-10-01",
    confidence: "VERIFIED",
    sources: [
      { title: "Queensland Revenue Office | Additional foreign acquirer duty", url: "https://qro.qld.gov.au/duties/investors/afad/", retrieved: "2026-10-10", publisher: "Queensland Revenue Office" },
      { title: "Queensland Revenue Office | Types of foreign persons for AFAD", url: "https://qro.qld.gov.au/duties/investors/afad/foreign-persons/", retrieved: "2026-10-10", publisher: "Queensland Revenue Office" },
    ],
  },
  {
    id: "au-transfer-duty.qld.landholder.current",
    domain: "AU_TRANSFER_DUTY",
    title: "Queensland landholder duty",
    summary: "Queensland landholder duty applies once a corporation or listed unit trust has Queensland landholdings of A$2m or more. Relevant acquisitions are generally 50% for private landholders and 90% for public landholders. Public landholder duty is 10% of the transfer duty on all Queensland landholdings.",
    effectiveFrom: "2011-07-01",
    confidence: "VERIFIED",
    sources: [
      { title: "Queensland Revenue Office | Landholders and land-holdings for landholder duty", url: "https://qro.qld.gov.au/duties/investors/landholder/landholders/", retrieved: "2026-10-10", publisher: "Queensland Revenue Office" },
      { title: "Queensland Revenue Office | Relevant acquisitions in a landholder", url: "https://qro.qld.gov.au/duties/investors/landholder/relevant-acquisitions/", retrieved: "2026-10-10", publisher: "Queensland Revenue Office" },
      { title: "Queensland Revenue Office | Calculating landholder duty", url: "https://qro.qld.gov.au/duties/investors/landholder/calculating/", retrieved: "2026-10-10", publisher: "Queensland Revenue Office" },
      { title: "Queensland Revenue Office | Additional foreign acquirer duty for landholder duty", url: "https://qro.qld.gov.au/duties/investors/landholder/afad/", retrieved: "2026-10-10", publisher: "Queensland Revenue Office" },
    ],
  },
  {
    id: "au-transfer-duty.wa.general.2014-07-02",
    domain: "AU_TRANSFER_DUTY",
    title: "Western Australia transfer duty general rate",
    summary: "WA's general rate is A$1.90 for every A$100 or part up to A$120,000, then A$2,280 plus A$2.85, A$3,135 plus A$3.80, A$11,115 plus A$4.75 and, above A$725,000, A$28,453 plus A$5.15 for every A$100 or part above the step. It applies to transactions from 2 July 2014 unless the Duties Act provides otherwise.",
    effectiveFrom: "2014-07-02",
    confidence: "VERIFIED",
    sources: [
      { title: "WA Department of Treasury and Finance | Transfer duty assessment (rates of duty)", url: "https://www.wa.gov.au/organisation/department-of-treasury-and-finance/transfer-duty-assessment", retrieved: "2026-10-19", publisher: "Department of Treasury and Finance, Western Australia" },
    ],
    notes: "Concessional, first home owner and off-the-plan rates, and WA landholder duty, are out of scope. Transactions before 2 July 2014 are not modelled.",
  },
  {
    id: "au-transfer-duty.wa.foreign.2019-01-01",
    domain: "AU_TRANSFER_DUTY",
    title: "Western Australia foreign transfer duty",
    summary: "Foreign persons acquiring residential property in WA pay an additional 7% of the dutiable value, for transactions from 1 January 2019.",
    effectiveFrom: "2019-01-01",
    confidence: "VERIFIED_SECONDARY",
    sources: [
      { title: "WA Government | About foreign buyers duty", url: "https://www.wa.gov.au/service/financial-management/taxation-and-duty/about-foreign-buyers-duty", retrieved: "2026-10-19", publisher: "Department of Treasury and Finance, Western Australia" },
      { title: "Parliament of Western Australia | Explanatory memorandum, Duties Amendment (Additional Duty for Foreign Persons) Bill 2018", url: "https://www.parliament.wa.gov.au/Parliament/Bills.nsf/95E120263B9BC354482582AA002D231D/$File/EM72-1.pdf", retrieved: "2026-10-19", publisher: "Parliament of Western Australia" },
    ],
    notes: "The 7% rate is on the WA Government page; the 1 January 2019 start is taken from the amending Bill's explanatory memorandum and secondary sources. Developer exemptions are not modelled.",
  },
  {
    id: "au-transfer-duty.sa.general.2018-07-01",
    domain: "AU_TRANSFER_DUTY",
    title: "South Australia conveyance duty rates",
    summary: "South Australian duty on a conveyance runs from A$1.00 for every A$100 or part up to A$12,000 to A$21,330 plus A$5.50 for every A$100 or part above A$500,000. Applied to contracts from 1 July 2018 on residential and primary-production land.",
    effectiveFrom: SA_TRANSFER_FROM,
    confidence: "VERIFIED_SECONDARY",
    sources: [
      { title: "RevenueSA | Rate of stamp duty", url: "https://www.revenuesa.sa.gov.au/stamp-duty/rate-of-stamp-duty", retrieved: "2026-10-19", publisher: "RevenueSA" },
      { title: "RevenueSA | Information Circular 103 (worked example: A$2,200,000 gives A$114,830)", url: "https://www.revenuesa.sa.gov.au/resources/publications/information-circulars/information-circulars/ic_103/information-circular-103_21112022", retrieved: "2026-10-19", publisher: "RevenueSA" },
    ],
    notes: "RevenueSA publishes the current table only. Its December 2022 worked example uses the same rates, and secondary sources describe them as unchanged since before 2018, so they are applied from 1 July 2018. Earlier contracts, concessions and the foreign ownership surcharge are not modelled.",
  },
  {
    id: "au-transfer-duty.sa.qualifying-land.2018-07-01",
    domain: "AU_TRANSFER_DUTY",
    title: "South Australia: no duty on qualifying (non-residential) land",
    summary: "No stamp duty applies to a conveyance of non-residential, non-primary-production land (qualifying land) under a contract entered into on or after 1 July 2018. A mixed purchase is charged the residential share of the duty on the whole value, to the nearest cent, as in RevenueSA's worked example.",
    effectiveFrom: SA_TRANSFER_FROM,
    confidence: "VERIFIED",
    sources: [
      { title: "RevenueSA | Information Circular 103: stamp duty on qualifying land", url: "https://www.revenuesa.sa.gov.au/resources/publications/information-circulars/information-circulars/ic_103/information-circular-103_21112022", retrieved: "2026-10-19", publisher: "RevenueSA" },
    ],
    notes: "Stamp Duties Act 1923 s71DC. The 2015-2018 phase-out (one-third and two-thirds reductions) is not modelled; whether land is qualifying land follows the property kind in the profile.",
  },
];
