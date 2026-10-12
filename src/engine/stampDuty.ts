import type { ISODate } from "./dates.ts";
import { addDays, addMonths, addYears, compareISO } from "./dates.ts";
import type { Bps, Cents } from "./money.ts";
import { floorToDollar, mulBps } from "./money.ts";
import type { RuleEntry } from "./rules.ts";
import { ENGINE_DISCLAIMER, RuleNotFoundError } from "./rules.ts";
import type { Finding } from "./types.ts";

export type StampDutyPropertyKind = "RESIDENTIAL" | "NON_RESIDENTIAL" | "MIXED_COMMERCIAL_RESIDENTIAL";
export type SsdPropertyKind = "RESIDENTIAL" | "INDUSTRIAL";
export type AbsdBuyerKind =
  | "SC"
  | "SPR"
  | "FOREIGNER"
  | "ENTITY"
  | "HOUSING_DEVELOPER"
  | "TRUSTEE"
  | "TRUSTEE_HOUSING_DEVELOPER";

export const ABSD_BUYER_KINDS = [
  { id: "SC", label: "Singapore citizen", description: "Individual Singapore citizen buyer.", usesPropertyCount: true },
  { id: "SPR", label: "Singapore permanent resident", description: "Individual Singapore permanent resident buyer.", usesPropertyCount: true },
  { id: "FOREIGNER", label: "Foreigner", description: "Individual foreign buyer subject to the foreigner ABSD profile.", usesPropertyCount: false },
  {
    id: "ENTITY",
    label: "Entity (includes a trustee of a collective investment scheme / S-REIT trustee)",
    description: "Entity profile for companies, partnerships and other non-individuals, including the IRAS-listed collective-investment-scheme / S-REIT trustee cases.",
    usesPropertyCount: false,
  },
  {
    id: "HOUSING_DEVELOPER",
    label: "Housing developer",
    description: "Licensed housing developer profile with remittable and non-remittable ABSD components.",
    usesPropertyCount: false,
  },
  {
    id: "TRUSTEE",
    label: "Trustee",
    description: "Trustee acquiring residential property and paying ABSD (Trust) upfront, subject to the published refund conditions where applicable.",
    usesPropertyCount: false,
  },
  {
    id: "TRUSTEE_HOUSING_DEVELOPER",
    label: "Trustee for housing developer structure",
    description: "Housing-developer trustee structure tracked separately for UI workflow selection.",
    usesPropertyCount: false,
  },
] as const satisfies readonly { id: AbsdBuyerKind; label: string; description: string; usesPropertyCount: boolean }[];

export const STAMP_DUTY_PROPERTY_KINDS = [
  { id: "RESIDENTIAL", label: "Residential property" },
  { id: "NON_RESIDENTIAL", label: "Non-residential property" },
  { id: "MIXED_COMMERCIAL_RESIDENTIAL", label: "Commercial and residential / mixed-use property" },
] as const satisfies readonly { id: StampDutyPropertyKind; label: string }[];

export const SSD_PROPERTY_KINDS = [
  { id: "RESIDENTIAL", label: "Residential property" },
  { id: "INDUSTRIAL", label: "Industrial property" },
] as const satisfies readonly { id: SsdPropertyKind; label: string }[];

export interface DutyBandBreakdown {
  component: string;
  label: string;
  from: Cents;
  to: Cents | null;
  rateBps: Bps;
  taxableAmount: Cents;
  duty: Cents;
}

export interface StampDutyDeadlineInput {
  executionDate: ISODate;
  executedInSingapore: boolean;
  firstReceivedInSingaporeDate?: ISODate;
}

export interface StampDutyDeadlineResult {
  dueDate: ISODate;
  notes: string[];
}

export interface ComputeBsdInput {
  purchaseDate: ISODate;
  purchasePrice: Cents;
  marketValue: Cents;
  propertyKind: StampDutyPropertyKind;
  residentialShareBps?: number;
  apportionedResidentialValue?: Cents;
  apportionedNonResidentialValue?: Cents;
}

export interface ComputeBsdResult {
  dutiableValue: Cents;
  residentialDutiableValue: Cents;
  nonResidentialDutiableValue: Cents;
  duty: Cents;
  bands: DutyBandBreakdown[];
  ruleVersion: string;
  notes: string[];
  findings: Finding[];
}

export interface AbsdBuyerProfile {
  kind: AbsdBuyerKind;
  residentialPropertyCountBeforePurchase?: number;
  alreadyHasInterestInSameProperty?: boolean;
}

export interface ComputeAbsdInput {
  purchaseDate: ISODate;
  purchasePrice: Cents;
  marketValue: Cents;
  buyers: readonly AbsdBuyerProfile[];
  propertyIndexInTransaction?: number;
  claimAdditionalInterestRemission?: boolean;
  trustBeneficialOwners?: readonly AbsdBuyerProfile[];
}

export interface ComputeAbsdResult {
  dutiableValue: Cents;
  upfrontRateBps: Bps;
  effectiveRateBps: Bps;
  duty: Cents;
  refundableDuty: Cents;
  netDuty: Cents;
  remittableDuty: Cents;
  nonRemittableDuty: Cents;
  ruleVersion: string;
  bands: DutyBandBreakdown[];
  notes: string[];
  findings: Finding[];
}

export interface ComputeSsdInput {
  acquisitionDate: ISODate;
  disposalDate: ISODate;
  sellingPrice: Cents;
  marketValue: Cents;
  propertyKind: SsdPropertyKind;
  residentialShareBps?: number;
  industrialShareBps?: number;
  apportionedDutiableValue?: Cents;
}

export interface ComputeSsdResult {
  dutiableValue: Cents;
  holdingPeriodBand: string;
  rateBps: Bps;
  duty: Cents;
  ruleVersion: string;
  bands: DutyBandBreakdown[];
  notes: string[];
  findings: Finding[];
}

export interface LeaseRentStep {
  from: ISODate;
  to: ISODate;
  rent: Cents;
  frequency: "MONTHLY" | "ANNUAL" | "ONE_OFF";
}

export interface ComputeLeaseDutyInput {
  leaseDate: ISODate;
  leaseStartDate: ISODate;
  leaseEndDate?: ISODate;
  rentSteps: readonly LeaseRentStep[];
  marketAnnualRent?: Cents;
  premium?: Cents;
}

export interface ComputeLeaseDutyResult {
  totalRent: Cents;
  averageAnnualRent: Cents;
  rentDuty: Cents;
  premiumDuty: Cents;
  duty: Cents;
  ruleVersion: string;
  bands: DutyBandBreakdown[];
  notes: string[];
  findings: Finding[];
}

export interface ComputeAcquisitionDutiesInput extends ComputeBsdInput {
  absd?: Omit<ComputeAbsdInput, "purchaseDate" | "purchasePrice" | "marketValue">;
  execution?: StampDutyDeadlineInput;
}

export interface ComputeAcquisitionDutiesResult {
  bsd: ComputeBsdResult;
  absd: ComputeAbsdResult | null;
  totalUpfrontDuty: Cents;
  totalNetDuty: Cents;
  totalRefundableDuty: Cents;
  paymentDeadline: StampDutyDeadlineResult | null;
  notes: string[];
  findings: Finding[];
}

interface ProgressiveTier {
  width?: Cents;
  rateBps: Bps;
  label: string;
}

interface AbsdRateRow {
  from: ISODate;
  to?: ISODate;
  rates: Record<string, Bps>;
}

interface SsdBand {
  upperYearsExclusive?: number;
  rateBps: Bps;
  label: string;
  progressive?: ProgressiveTier[];
}

interface ResidentialSsdRegime {
  from: ISODate;
  to?: ISODate;
  bands: readonly SsdBand[];
  ruleVersion: string;
}

const FIRST_180K = 18_000_000;
const NEXT_180K = 18_000_000;
const NEXT_640K = 64_000_000;
const NEXT_500K = 50_000_000;
const NEXT_1_5M = 150_000_000;

const BSD_REGIMES = [
  {
    from: "0001-01-01",
    to: "2018-02-19",
    ruleVersion: "bsd.pre-2018-02-20",
    residential: [
      { width: FIRST_180K, rateBps: 100, label: "First S$180,000" },
      { width: NEXT_180K, rateBps: 200, label: "Next S$180,000" },
      { rateBps: 300, label: "Remainder" },
    ],
    nonResidential: [
      { width: FIRST_180K, rateBps: 100, label: "First S$180,000" },
      { width: NEXT_180K, rateBps: 200, label: "Next S$180,000" },
      { rateBps: 300, label: "Remainder" },
    ],
  },
  {
    from: "2018-02-20",
    to: "2023-02-14",
    ruleVersion: "bsd.2018-02-20",
    residential: [
      { width: FIRST_180K, rateBps: 100, label: "First S$180,000" },
      { width: NEXT_180K, rateBps: 200, label: "Next S$180,000" },
      { width: NEXT_640K, rateBps: 300, label: "Next S$640,000" },
      { rateBps: 400, label: "Remainder" },
    ],
    nonResidential: [
      { width: FIRST_180K, rateBps: 100, label: "First S$180,000" },
      { width: NEXT_180K, rateBps: 200, label: "Next S$180,000" },
      { width: NEXT_640K, rateBps: 300, label: "Next S$640,000" },
      { rateBps: 300, label: "Remainder" },
    ],
  },
  {
    from: "2023-02-15",
    ruleVersion: "bsd.2023-02-15",
    residential: [
      { width: FIRST_180K, rateBps: 100, label: "First S$180,000" },
      { width: NEXT_180K, rateBps: 200, label: "Next S$180,000" },
      { width: NEXT_640K, rateBps: 300, label: "Next S$640,000" },
      { width: NEXT_500K, rateBps: 400, label: "Next S$500,000" },
      { width: NEXT_1_5M, rateBps: 500, label: "Next S$1,500,000" },
      { rateBps: 600, label: "Remainder" },
    ],
    nonResidential: [
      { width: FIRST_180K, rateBps: 100, label: "First S$180,000" },
      { width: NEXT_180K, rateBps: 200, label: "Next S$180,000" },
      { width: NEXT_640K, rateBps: 300, label: "Next S$640,000" },
      { width: NEXT_500K, rateBps: 400, label: "Next S$500,000" },
      { width: NEXT_1_5M, rateBps: 500, label: "Next S$1,500,000" },
      { rateBps: 500, label: "Remainder" },
    ],
  },
] as const;

const ABSD_RATES: readonly AbsdRateRow[] = [
  {
    from: "2013-01-12",
    to: "2018-07-05",
    rates: { SC_1: 0, SC_2: 700, SC_3P: 1000, SPR_1: 500, SPR_2: 1000, SPR_3P: 1000, FOREIGNER: 1500, ENTITY: 1500, HOUSING_DEVELOPER: 1500 },
  },
  {
    from: "2018-07-06",
    to: "2021-12-15",
    rates: { SC_1: 0, SC_2: 1200, SC_3P: 1500, SPR_1: 500, SPR_2: 1500, SPR_3P: 1500, FOREIGNER: 2000, ENTITY: 2500, HOUSING_DEVELOPER: 2500 },
  },
  {
    from: "2021-12-16",
    to: "2023-04-26",
    rates: { SC_1: 0, SC_2: 1700, SC_3P: 2500, SPR_1: 500, SPR_2: 2500, SPR_3P: 3000, FOREIGNER: 3000, ENTITY: 3500, HOUSING_DEVELOPER: 3500, TRUSTEE: 3500 },
  },
  {
    from: "2023-04-27",
    rates: { SC_1: 0, SC_2: 2000, SC_3P: 3000, SPR_1: 500, SPR_2: 3000, SPR_3P: 3500, FOREIGNER: 6000, ENTITY: 6500, HOUSING_DEVELOPER: 3500, TRUSTEE: 6500 },
  },
];

const RESIDENTIAL_SSD_REGIMES: readonly ResidentialSsdRegime[] = [
  {
    from: "2010-02-20",
    to: "2010-08-29",
    ruleVersion: "ssd.residential.2010-02-20",
    bands: [
      { upperYearsExclusive: 1, rateBps: 0, label: "Up to 1 year", progressive: [{ width: FIRST_180K, rateBps: 100, label: "First S$180,000" }, { width: NEXT_180K, rateBps: 200, label: "Next S$180,000" }, { rateBps: 300, label: "Remainder" }] },
      { rateBps: 0, label: "More than 1 year" },
    ],
  },
  {
    from: "2010-08-30",
    to: "2011-01-13",
    ruleVersion: "ssd.residential.2010-08-30",
    bands: [
      { upperYearsExclusive: 1, rateBps: 0, label: "Up to 1 year", progressive: [{ width: FIRST_180K, rateBps: 100, label: "First S$180,000" }, { width: NEXT_180K, rateBps: 200, label: "Next S$180,000" }, { rateBps: 300, label: "Remainder" }] },
      { upperYearsExclusive: 2, rateBps: 0, label: "More than 1 year and up to 2 years", progressive: [{ width: FIRST_180K, rateBps: 67, label: "First S$180,000" }, { width: NEXT_180K, rateBps: 133, label: "Next S$180,000" }, { rateBps: 200, label: "Remainder" }] },
      { upperYearsExclusive: 3, rateBps: 0, label: "More than 2 years and up to 3 years", progressive: [{ width: FIRST_180K, rateBps: 33, label: "First S$180,000" }, { width: NEXT_180K, rateBps: 67, label: "Next S$180,000" }, { rateBps: 100, label: "Remainder" }] },
      { rateBps: 0, label: "More than 3 years" },
    ],
  },
  {
    from: "2011-01-14",
    to: "2017-03-10",
    ruleVersion: "ssd.residential.2011-01-14",
    bands: [
      { upperYearsExclusive: 1, rateBps: 1600, label: "Up to 1 year" },
      { upperYearsExclusive: 2, rateBps: 1200, label: "More than 1 year and up to 2 years" },
      { upperYearsExclusive: 3, rateBps: 800, label: "More than 2 years and up to 3 years" },
      { upperYearsExclusive: 4, rateBps: 400, label: "More than 3 years and up to 4 years" },
      { rateBps: 0, label: "More than 4 years" },
    ],
  },
  {
    from: "2017-03-11",
    to: "2025-07-03",
    ruleVersion: "ssd.residential.2017-03-11",
    bands: [
      { upperYearsExclusive: 1, rateBps: 1200, label: "Up to 1 year" },
      { upperYearsExclusive: 2, rateBps: 800, label: "More than 1 year and up to 2 years" },
      { upperYearsExclusive: 3, rateBps: 400, label: "More than 2 years and up to 3 years" },
      { rateBps: 0, label: "More than 3 years" },
    ],
  },
  {
    from: "2025-07-04",
    ruleVersion: "ssd.residential.2025-07-04",
    bands: [
      { upperYearsExclusive: 1, rateBps: 1600, label: "Up to 1 year" },
      { upperYearsExclusive: 2, rateBps: 1200, label: "More than 1 year and up to 2 years" },
      { upperYearsExclusive: 3, rateBps: 800, label: "More than 2 years and up to 3 years" },
      { upperYearsExclusive: 4, rateBps: 400, label: "More than 3 years and up to 4 years" },
      { rateBps: 0, label: "More than 4 years" },
    ],
  },
];

const INDUSTRIAL_SSD_BANDS: readonly SsdBand[] = [
  { upperYearsExclusive: 1, rateBps: 1500, label: "Up to 1 year" },
  { upperYearsExclusive: 2, rateBps: 1000, label: "More than 1 year and up to 2 years" },
  { upperYearsExclusive: 3, rateBps: 500, label: "More than 2 years and up to 3 years" },
  { rateBps: 0, label: "More than 3 years" },
];

function assertNonNegative(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer, got ${value}`);
  return value;
}

function assertBpsShare(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) throw new RangeError(`${label} must be between 0 and 10,000 basis points, got ${value}`);
  return value;
}

function pickByDate<T extends { from: ISODate; to?: ISODate }>(rows: readonly T[], date: ISODate, label: string): T {
  const row = rows.find((candidate) => candidate.from <= date && (candidate.to === undefined || candidate.to >= date));
  if (!row) throw new RuleNotFoundError(label, date);
  return row;
}

function progressiveDuty(base: Cents, tiers: readonly ProgressiveTier[], component: string): { duty: Cents; bands: DutyBandBreakdown[] } {
  let remaining = assertNonNegative(base, `${component} base`);
  let cursor = 0;
  const bands: DutyBandBreakdown[] = [];
  let duty = 0;
  for (const tier of tiers) {
    const taxable = tier.width === undefined ? remaining : Math.min(remaining, tier.width);
    const bandDuty = taxable > 0 ? mulBps(taxable, tier.rateBps) : 0;
    if (taxable > 0) {
      bands.push({ component, label: tier.label, from: cursor, to: tier.width === undefined ? null : cursor + tier.width, rateBps: tier.rateBps, taxableAmount: taxable, duty: bandDuty });
    }
    duty += bandDuty;
    remaining -= taxable;
    if (tier.width !== undefined) cursor += tier.width;
    if (remaining <= 0) break;
  }
  return { duty: floorToDollar(duty), bands };
}

function adValoremDuty(base: Cents, rateBps: Bps): Cents {
  if (base <= 0 || rateBps <= 0) return 0;
  const duty = floorToDollar(mulBps(base, rateBps));
  return duty < 100 ? 100 : duty;
}

function higherOf(a: Cents, b: Cents): Cents {
  return Math.max(assertNonNegative(a, "amount a"), assertNonNegative(b, "amount b"));
}

function splitMixedValue(total: Cents, residentialShareBps: number | undefined, apportionedResidentialValue: Cents | undefined, apportionedNonResidentialValue: Cents | undefined): { residential: Cents; nonResidential: Cents } {
  if (apportionedResidentialValue !== undefined || apportionedNonResidentialValue !== undefined) {
    const residential = assertNonNegative(apportionedResidentialValue ?? Math.max(total - (apportionedNonResidentialValue ?? 0), 0), "apportionedResidentialValue");
    const nonResidential = assertNonNegative(apportionedNonResidentialValue ?? Math.max(total - residential, 0), "apportionedNonResidentialValue");
    if (residential + nonResidential !== total) throw new RangeError("Apportioned residential and non-residential values must add up to the dutiable value.");
    return { residential, nonResidential };
  }
  const share = assertBpsShare(residentialShareBps ?? 6000, "residentialShareBps");
  const residential = Math.round((total * share) / 10_000);
  return { residential, nonResidential: total - residential };
}

function absdKeyForBuyer(buyer: AbsdBuyerProfile, propertyIndexInTransaction: number): string {
  const countBefore = Math.max(0, buyer.residentialPropertyCountBeforePurchase ?? 0);
  if (buyer.kind === "SC") return countBefore + propertyIndexInTransaction <= 1 ? "SC_1" : countBefore + propertyIndexInTransaction === 2 ? "SC_2" : "SC_3P";
  if (buyer.kind === "SPR") return countBefore + propertyIndexInTransaction <= 1 ? "SPR_1" : countBefore + propertyIndexInTransaction === 2 ? "SPR_2" : "SPR_3P";
  if (buyer.kind === "FOREIGNER") return "FOREIGNER";
  if (buyer.kind === "ENTITY") return "ENTITY";
  if (buyer.kind === "HOUSING_DEVELOPER") return "HOUSING_DEVELOPER";
  if (buyer.kind === "TRUSTEE") return "TRUSTEE";
  return "HOUSING_DEVELOPER";
}

function rateForBuyer(date: ISODate, buyer: AbsdBuyerProfile, propertyIndexInTransaction: number): Bps {
  if (buyer.kind === "TRUSTEE" && date < "2022-05-09") throw new RuleNotFoundError("ABSD trust rate", date);
  const row = pickByDate(ABSD_RATES, date, "ABSD rate");
  const key = absdKeyForBuyer(buyer, propertyIndexInTransaction);
  const rate = row.rates[key];
  if (rate === undefined) throw new RuleNotFoundError(`ABSD rate for ${key}`, date);
  return rate;
}

function housingDeveloperRemittableRate(date: ISODate): { remittableBps: Bps; nonRemittableBps: Bps } {
  if (date >= "2021-12-16") return { remittableBps: 3500, nonRemittableBps: 500 };
  if (date >= "2018-07-06") return { remittableBps: 2500, nonRemittableBps: 500 };
  if (date >= "2013-01-12") return { remittableBps: 1500, nonRemittableBps: 0 };
  throw new RuleNotFoundError("ABSD housing developer remission split", date);
}

function additionalInterestRemittedRate(date: ISODate, buyer: AbsdBuyerProfile): Bps | null {
  const countBefore = Math.max(0, buyer.residentialPropertyCountBeforePurchase ?? 0);
  if (buyer.kind === "SC") {
    if (countBefore === 1 && buyer.alreadyHasInterestInSameProperty) return 0;
    if (countBefore === 2 && buyer.alreadyHasInterestInSameProperty) return 2000;
    return null;
  }
  if (buyer.kind === "SPR") {
    if (countBefore === 1 && buyer.alreadyHasInterestInSameProperty) return 500;
    if (countBefore === 2 && buyer.alreadyHasInterestInSameProperty && date >= "2023-04-27") return 3000;
  }
  return null;
}

function holdingPeriodBand(disposalDate: ISODate, acquisitionDate: ISODate, bands: readonly SsdBand[]): SsdBand {
  for (const band of bands) {
    if (band.upperYearsExclusive === undefined) return band;
    if (compareISO(disposalDate, addYears(acquisitionDate, band.upperYearsExclusive)) < 0) return band;
  }
  return bands[bands.length - 1]!;
}

function leapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function durationYearsInclusive(start: ISODate, end: ISODate): number {
  const totalDays = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
  return totalDays / (leapYear(Number(start.slice(0, 4))) ? 366 : 365);
}

function leaseMonths(step: LeaseRentStep): number {
  let months = 0;
  let cursor = step.from;
  const endExclusive = addDays(step.to, 1);
  while (compareISO(cursor, endExclusive) < 0) {
    months += 1;
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export function stampDutyDeadline(input: StampDutyDeadlineInput): StampDutyDeadlineResult {
  const notes = ["IRAS says a document should be stamped before signing; this helper returns the latest no-penalty deadline if it has already been signed."];
  if (input.executedInSingapore) return { dueDate: addDays(input.executionDate, 14), notes };
  if (!input.firstReceivedInSingaporeDate) throw new RangeError("firstReceivedInSingaporeDate is required for overseas-executed documents.");
  return { dueDate: addDays(input.firstReceivedInSingaporeDate, 30), notes };
}

export function computeBsd(input: ComputeBsdInput): ComputeBsdResult {
  const dutiableValue = higherOf(input.purchasePrice, input.marketValue);
  const regime = pickByDate(BSD_REGIMES, input.purchaseDate, "BSD rate");
  const findings: Finding[] = [];
  const notes = [ENGINE_DISCLAIMER, "BSD is computed on the higher of consideration and market value, rounded down to the nearest dollar and subject to a minimum duty of S$1."];
  let residentialDutiableValue = 0;
  let nonResidentialDutiableValue = 0;
  if (input.propertyKind === "RESIDENTIAL") residentialDutiableValue = dutiableValue;
  else if (input.propertyKind === "NON_RESIDENTIAL") nonResidentialDutiableValue = dutiableValue;
  else {
    const split = splitMixedValue(dutiableValue, input.residentialShareBps, input.apportionedResidentialValue, input.apportionedNonResidentialValue);
    residentialDutiableValue = split.residential;
    nonResidentialDutiableValue = split.nonResidential;
    notes.push("For mixed commercial/residential land, the residential and non-residential components should follow the valuer-determined apportionment. A basis-point share is only a proxy when explicit component values are unavailable.");
  }
  const residential = progressiveDuty(residentialDutiableValue, regime.residential, "BSD residential component");
  const nonResidential = progressiveDuty(nonResidentialDutiableValue, regime.nonResidential, "BSD non-residential component");
  let duty = floorToDollar(residential.duty + nonResidential.duty);
  if (dutiableValue > 0 && duty < 100) duty = 100;
  if (input.propertyKind === "MIXED_COMMERCIAL_RESIDENTIAL" && input.apportionedResidentialValue === undefined && input.apportionedNonResidentialValue === undefined) {
    findings.push({ id: "STAMP_DUTY.BSD.MIXED_USE_PROXY", severity: "INFO", message: "IRAS' worked example uses a valuer-determined value split, not a simple GFA ratio. Review the apportioned value split before filing." });
  }
  notes.push("Where multiple properties are acquired under one dependent transaction, IRAS requires ad valorem duty to be computed on the total purchase price of the related properties.");
  return { dutiableValue, residentialDutiableValue, nonResidentialDutiableValue, duty, bands: [...residential.bands, ...nonResidential.bands], ruleVersion: regime.ruleVersion, notes, findings };
}

export function computeAbsd(input: ComputeAbsdInput): ComputeAbsdResult {
  if (input.buyers.length === 0) throw new RangeError("At least one buyer profile is required.");
  const dutiableValue = higherOf(input.purchasePrice, input.marketValue);
  const propertyIndex = Math.max(1, input.propertyIndexInTransaction ?? 1);
  const findings: Finding[] = [];
  const notes = [ENGINE_DISCLAIMER, "Where ABSD is applicable, the duty is rounded down to the nearest dollar and the S$1 minimum only applies when the applicable ABSD rate is above 0%."];
  const buyerRates = input.buyers.map((buyer) => rateForBuyer(input.purchaseDate, buyer, propertyIndex));
  let upfrontRateBps = Math.max(...buyerRates);
  let effectiveRateBps = upfrontRateBps;
  let refundableDuty = 0;
  let remittableDuty = 0;
  let nonRemittableDuty = 0;
  const buyerKinds = new Set(input.buyers.map((buyer) => buyer.kind));

  if (input.claimAdditionalInterestRemission) {
    const candidateRates = input.buyers.map((buyer, index) => additionalInterestRemittedRate(input.purchaseDate, buyer) ?? buyerRates[index]!);
    const remittedRate = Math.max(...candidateRates);
    if (remittedRate < effectiveRateBps) {
      effectiveRateBps = remittedRate;
      notes.push("Applied the mechanical partial ABSD remission for acquisition of additional interest in a property which the relevant individual already owns an interest in.");
    } else {
      findings.push({ id: "STAMP_DUTY.ABSD.ADDITIONAL_INTEREST_NOT_MET", severity: "INFO", message: "Additional-interest remission was requested, but the supplied buyer profiles do not meet the mechanical remission conditions published by IRAS." });
    }
  }

  if (buyerKinds.has("HOUSING_DEVELOPER") || buyerKinds.has("TRUSTEE_HOUSING_DEVELOPER")) {
    const split = housingDeveloperRemittableRate(input.purchaseDate);
    remittableDuty = floorToDollar(mulBps(dutiableValue, split.remittableBps));
    nonRemittableDuty = floorToDollar(mulBps(dutiableValue, split.nonRemittableBps));
    upfrontRateBps = split.remittableBps + split.nonRemittableBps;
    effectiveRateBps = split.nonRemittableBps;
    notes.push("For housing developers, the 5% non-remittable component is separated from the remittable ABSD component that remains subject to the statutory remission conditions and timelines.");
  }

  if (buyerKinds.has("TRUSTEE") && input.trustBeneficialOwners && input.trustBeneficialOwners.length > 0) {
    const ineligible = input.trustBeneficialOwners.some((owner) => !["SC", "SPR", "FOREIGNER"].includes(owner.kind));
    if (ineligible) {
      findings.push({ id: "STAMP_DUTY.ABSD.TRUST_REFUND_NOT_MECHANICAL", severity: "WARNING", message: "ABSD (Trust) refund was not computed because the beneficial-owner inputs are not all identifiable individuals." });
    } else {
      const highestOwnerRate = Math.max(...input.trustBeneficialOwners.map((owner) => rateForBuyer(input.purchaseDate, owner, 1)));
      effectiveRateBps = highestOwnerRate;
      refundableDuty = floorToDollar(mulBps(dutiableValue, upfrontRateBps - effectiveRateBps));
      notes.push("ABSD (Trust) refund assumes the trust is for identifiable individual beneficiaries only and that the refund application is made within 6 months after execution.");
    }
  }

  const duty = adValoremDuty(dutiableValue, upfrontRateBps);
  const netDuty = adValoremDuty(dutiableValue, effectiveRateBps);
  if (buyerKinds.has("HOUSING_DEVELOPER") || buyerKinds.has("TRUSTEE_HOUSING_DEVELOPER")) {
    remittableDuty = Math.max(0, duty - netDuty);
    nonRemittableDuty = netDuty;
  } else {
    refundableDuty = Math.max(refundableDuty, duty - netDuty);
    nonRemittableDuty = netDuty;
  }
  return {
    dutiableValue,
    upfrontRateBps,
    effectiveRateBps,
    duty,
    refundableDuty,
    netDuty,
    remittableDuty,
    nonRemittableDuty,
    ruleVersion: `absd.${pickByDate(ABSD_RATES, input.purchaseDate, "ABSD rate").from}`,
    bands: [{ component: "ABSD", label: "ABSD on higher of price or market value", from: 0, to: null, rateBps: upfrontRateBps, taxableAmount: dutiableValue, duty }],
    notes,
    findings,
  };
}

export function computeSsd(input: ComputeSsdInput): ComputeSsdResult {
  const base = higherOf(input.sellingPrice, input.marketValue);
  const notes = [
    ENGINE_DISCLAIMER,
    "SSD is computed on the higher of selling price and market value as at the date of disposal, rounded down to the nearest dollar.",
    "Use the IRAS acquisition date definition for the relevant property class (for example, the date of acceptance of the option to purchase or the date of the contract if there is no option). An exact anniversary falls into the next band because the earlier band applies only while the holding period is less than that anniversary.",
  ];
  const findings: Finding[] = [];
  let dutiableValue = base;
  let band: SsdBand;
  let ruleVersion: string;
  if (input.propertyKind === "RESIDENTIAL") {
    if (input.apportionedDutiableValue !== undefined) dutiableValue = input.apportionedDutiableValue;
    else if (input.residentialShareBps !== undefined) dutiableValue = Math.round((base * assertBpsShare(input.residentialShareBps, "residentialShareBps")) / 10_000);
    const regime = pickByDate(RESIDENTIAL_SSD_REGIMES, input.acquisitionDate, "Residential SSD regime");
    band = holdingPeriodBand(input.disposalDate, input.acquisitionDate, regime.bands);
    ruleVersion = regime.ruleVersion;
  } else {
    if (input.apportionedDutiableValue !== undefined) dutiableValue = input.apportionedDutiableValue;
    else if (input.industrialShareBps !== undefined) dutiableValue = Math.round((base * assertBpsShare(input.industrialShareBps, "industrialShareBps")) / 10_000);
    band = holdingPeriodBand(input.disposalDate, input.acquisitionDate, INDUSTRIAL_SSD_BANDS);
    ruleVersion = "ssd.industrial.2013-01-12";
  }
  const breakdown = band.progressive
    ? progressiveDuty(dutiableValue, band.progressive, `SSD ${input.propertyKind.toLowerCase()}`)
    : { duty: floorToDollar(mulBps(dutiableValue, band.rateBps)), bands: [{ component: `SSD ${input.propertyKind.toLowerCase()}`, label: band.label, from: 0, to: null, rateBps: band.rateBps, taxableAmount: dutiableValue, duty: floorToDollar(mulBps(dutiableValue, band.rateBps)) }] };
  return { dutiableValue, holdingPeriodBand: band.label, rateBps: band.progressive ? 0 : band.rateBps, duty: breakdown.duty, ruleVersion, bands: breakdown.bands, notes, findings };
}

export function computeLeaseDuty(input: ComputeLeaseDutyInput): ComputeLeaseDutyResult {
  if (input.rentSteps.length === 0) throw new RangeError("At least one rent step is required.");
  const findings: Finding[] = [];
  const notes = [ENGINE_DISCLAIMER, "Lease duty is rounded down to the nearest dollar, subject to a minimum duty of S$1."];
  let totalRent = 0;
  for (const step of input.rentSteps) {
    if (compareISO(step.to, step.from) < 0) throw new RangeError("A rent step cannot end before it starts.");
    const rent = assertNonNegative(step.rent, "rent step amount");
    totalRent += Math.round(step.frequency === "ONE_OFF" ? rent : step.frequency === "ANNUAL" ? rent * durationYearsInclusive(step.from, step.to) : rent * leaseMonths(step));
  }
  const leaseYears = input.leaseEndDate ? durationYearsInclusive(input.leaseStartDate, input.leaseEndDate) : 4.0001;
  const contractualAar = input.leaseEndDate ? Math.round(totalRent / leaseYears) : Math.round(totalRent);
  const averageAnnualRent = higherOf(contractualAar, input.marketAnnualRent ?? 0);
  let rentDuty = 0;
  if (averageAnnualRent > 100_000) rentDuty = leaseYears <= 4 ? floorToDollar(mulBps(totalRent, 40)) : floorToDollar(mulBps(averageAnnualRent * 4, 40));
  const premiumDuty = input.premium && input.premium > 0 ? computeBsd({ purchaseDate: input.leaseDate, purchasePrice: input.premium, marketValue: input.premium, propertyKind: "NON_RESIDENTIAL" }).duty : 0;
  let duty = rentDuty + premiumDuty;
  if (duty > 0 && duty < 100) duty = 100;
  const bands: DutyBandBreakdown[] = [];
  if (rentDuty > 0) bands.push({ component: "LEASE_DUTY", label: leaseYears <= 4 ? "0.4% of total rent" : "0.4% of 4 x average annual rent", from: 0, to: null, rateBps: 40, taxableAmount: leaseYears <= 4 ? totalRent : averageAnnualRent * 4, duty: rentDuty });
  if (premiumDuty > 0) bands.push({ component: "LEASE_PREMIUM_BSD", label: "BSD on premium", from: 0, to: null, rateBps: 0, taxableAmount: input.premium!, duty: premiumDuty });
  return { totalRent, averageAnnualRent, rentDuty, premiumDuty, duty, ruleVersion: "lease-duty.current", bands, notes, findings };
}

export function computeAcquisitionDuties(input: ComputeAcquisitionDutiesInput): ComputeAcquisitionDutiesResult {
  const bsd = computeBsd(input);
  const absd = input.absd ? computeAbsd({ ...input.absd, purchaseDate: input.purchaseDate, purchasePrice: input.purchasePrice, marketValue: input.marketValue }) : null;
  const paymentDeadline = input.execution ? stampDutyDeadline(input.execution) : null;
  return {
    bsd,
    absd,
    totalUpfrontDuty: bsd.duty + (absd?.duty ?? 0),
    totalNetDuty: bsd.duty + (absd?.netDuty ?? 0),
    totalRefundableDuty: absd?.refundableDuty ?? 0,
    paymentDeadline,
    notes: [ENGINE_DISCLAIMER, ...(paymentDeadline ? [`Stamping deadline: ${paymentDeadline.dueDate}.`] : [])],
    findings: [...bsd.findings, ...(absd?.findings ?? [])],
  };
}

export const RULES: RuleEntry[] = [
  { id: "stamp-duty.bsd.2018-2023", domain: "STAMP_DUTY", title: "BSD differentiated residential and non-residential rates from 20 Feb 2018", summary: "Residential property uses the 1/2/3/4% tiers from 20 Feb 2018 to 14 Feb 2023; non-residential property remained capped at 3% in that period.", effectiveFrom: "2018-02-20", effectiveTo: "2023-02-14", confidence: "VERIFIED", sources: [{ title: "IRAS | Buyer's Stamp Duty (BSD)", url: "https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/buyer's-stamp-duty-(bsd)", retrieved: "2026-10-09", publisher: "IRAS" }] },
  { id: "stamp-duty.bsd.2023-02-15", domain: "STAMP_DUTY", title: "BSD higher marginal rates from 15 Feb 2023", summary: "From 15 Feb 2023, residential BSD extends to 5% and 6% marginal tiers and non-residential BSD extends to a 5% top rate.", effectiveFrom: "2023-02-15", confidence: "VERIFIED", sources: [{ title: "IRAS | Buyer's Stamp Duty (BSD)", url: "https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/buyer's-stamp-duty-(bsd)", retrieved: "2026-10-09", publisher: "IRAS" }] },
  { id: "stamp-duty.absd.2023-04-27", domain: "STAMP_DUTY", title: "ABSD rates from 27 Apr 2023", summary: "The current ABSD regime charges 20/30% for SC second/third+, 5/30/35% for SPR first/second/third+, 60% for foreigners, 65% for entities, 65% for trustees and 40% gross for housing developers (5% non-remittable plus 35% remittable subject to conditions).", effectiveFrom: "2023-04-27", confidence: "VERIFIED", sources: [{ title: "IRAS | Additional Buyer's Stamp Duty (ABSD)", url: "https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer's-stamp-duty-(absd)", retrieved: "2026-10-09", publisher: "IRAS" }] },
  { id: "stamp-duty.absd.trust.refund", domain: "STAMP_DUTY", title: "ABSD (Trust) refund for identifiable individual beneficiaries", summary: "ABSD (Trust) of 65% is paid upfront and may be refunded down to the highest direct-purchase ABSD profile where the trust is for identifiable individual beneficiaries only and the application is made within 6 months.", effectiveFrom: "2022-05-09", confidence: "VERIFIED", sources: [{ title: "IRAS | Remission of ABSD (Trust)", url: "https://www.iras.gov.sg/taxes/stamp-duty/for-property/appeals-refunds-reliefs-and-remissions/common-stamp-duty-remissions-and-reliefs-for-property/remission-of-absd-(trust)", retrieved: "2026-10-09", publisher: "IRAS" }] },
  { id: "stamp-duty.ssd.residential.2025-07-04", domain: "STAMP_DUTY", title: "Residential SSD holding period and rates from 4 Jul 2025", summary: "For residential properties acquired on or after 4 Jul 2025, SSD applies for up to 4 years at 16%, 12%, 8% and 4% tiers.", effectiveFrom: "2025-07-04", confidence: "VERIFIED", sources: [{ title: "IRAS | Seller's Stamp Duty (SSD) for Residential Property", url: "https://www.iras.gov.sg/taxes/stamp-duty/for-property/selling-or-disposing-property/seller's-stamp-duty-(ssd)-for-residential-property", retrieved: "2026-10-09", publisher: "IRAS" }] },
  { id: "stamp-duty.ssd.industrial.2013-01-12", domain: "STAMP_DUTY", title: "Industrial SSD from 12 Jan 2013", summary: "Industrial SSD applies for up to 3 years at 15%, 10% and 5% on the higher of price and market value.", effectiveFrom: "2013-01-12", confidence: "VERIFIED", sources: [{ title: "IRAS | Seller's Stamp Duty (SSD) for Industrial Property", url: "https://www.iras.gov.sg/taxes/stamp-duty/for-property/selling-or-disposing-property/seller's-stamp-duty-(ssd)-for-industrial-property", retrieved: "2026-10-09", publisher: "IRAS" }] },
  { id: "stamp-duty.lease.current", domain: "STAMP_DUTY", title: "Lease duty on immovable-property tenancy agreements", summary: "Lease duty is exempt where AAR does not exceed S$1,000 and otherwise applies at 0.4% of total rent for terms of 4 years or less or 0.4% of 4 times AAR for longer or indefinite terms. Premiums are charged at BSD rates.", confidence: "VERIFIED", sources: [{ title: "IRAS | Renting a Property", url: "https://www.iras.gov.sg/taxes/stamp-duty/for-property/renting-a-property", retrieved: "2026-10-09", publisher: "IRAS" }] },
  { id: "stamp-duty.deadlines.current", domain: "STAMP_DUTY", title: "Stamping deadlines and late-payment penalties", summary: "Signed-in-Singapore documents must be stamped within 14 days; overseas-signed documents within 30 days after first receipt in Singapore. Late penalties are S$10 or duty if up to 3 months late and S$25 or 4 times duty if over 3 months late.", confidence: "VERIFIED", sources: [{ title: "IRAS | When to Pay Stamp Duty", url: "https://www.iras.gov.sg/taxes/stamp-duty/for-property/paying-stamp-duty/when-to-pay-stamp-duty", retrieved: "2026-10-09", publisher: "IRAS" }, { title: "IRAS | Late Payment or Non-Payment of Stamp Duty", url: "https://www.iras.gov.sg/taxes/stamp-duty/for-property/paying-stamp-duty/late-payment-of-stamp-duty", retrieved: "2026-10-09", publisher: "IRAS" }] },
];
