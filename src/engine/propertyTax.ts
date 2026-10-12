import type { ISODate } from "./dates.ts";
import { addDays, addMonths, compareISO, toISO } from "./dates.ts";
import type { Bps, Cents } from "./money.ts";
import { mulBps } from "./money.ts";
import type { RuleEntry } from "./rules.ts";
import { ENGINE_DISCLAIMER, RuleNotFoundError } from "./rules.ts";
import type { Finding } from "./types.ts";

export type PropertyTaxUsage = "OWNER_OCCUPIED_RESIDENTIAL" | "NON_OWNER_OCCUPIED_RESIDENTIAL" | "NON_RESIDENTIAL_OR_VACANT";
export type OwnerOccupiedResidentialType = "HDB_1_2_ROOM" | "HDB_3_ROOM" | "HDB_4_ROOM" | "HDB_5_ROOM" | "HDB_EXECUTIVE" | "PRIVATE" | "OTHER_OWNER_OCCUPIED";
export type PropertyTaxNoticeKind = "ANNUAL_BILL" | "OTHER_NOTICE" | "VALUATION_NOTICE";

export const PROPERTY_TAX_USAGES = [
  { id: "OWNER_OCCUPIED_RESIDENTIAL", label: "Owner-occupied residential" },
  { id: "NON_OWNER_OCCUPIED_RESIDENTIAL", label: "Non-owner-occupied residential" },
  { id: "NON_RESIDENTIAL_OR_VACANT", label: "Non-residential / vacant / other 10% class" },
] as const satisfies readonly { id: PropertyTaxUsage; label: string }[];

export const OWNER_OCCUPIED_RESIDENTIAL_TYPES = [
  { id: "HDB_1_2_ROOM", label: "HDB 1- or 2-room flat" },
  { id: "HDB_3_ROOM", label: "HDB 3-room flat" },
  { id: "HDB_4_ROOM", label: "HDB 4-room flat" },
  { id: "HDB_5_ROOM", label: "HDB 5-room flat" },
  { id: "HDB_EXECUTIVE", label: "HDB executive / maisonette" },
  { id: "PRIVATE", label: "Private residential property" },
  { id: "OTHER_OWNER_OCCUPIED", label: "Other owner-occupied residential property" },
] as const satisfies readonly { id: OwnerOccupiedResidentialType; label: string }[];

export interface PropertyTaxBandBreakdown {
  segmentId: string;
  label: string;
  from: Cents;
  to: Cents | null;
  rateBps: Bps;
  taxableAmount: Cents;
  annualTax: Cents;
  proratedTax: Cents;
}

export interface PropertyTaxSegment {
  id: string;
  from: ISODate;
  to: ISODate;
  annualValue: Cents;
  usage: PropertyTaxUsage;
  residentialType?: OwnerOccupiedResidentialType;
  ownerShareBps?: number;
  excludedFromNonOwnerResidentialRates?: boolean;
}

export interface PropertyTaxNoticeInput {
  kind: PropertyTaxNoticeKind;
  noticeDate: ISODate;
}

export interface ComputePropertyTaxInput {
  year: number;
  segments: readonly PropertyTaxSegment[];
  notice?: PropertyTaxNoticeInput;
}

export interface PropertyTaxDeadlineSummary {
  paymentDueDate?: ISODate;
  objectionDueDate?: ISODate;
}

export interface ComputePropertyTaxResult {
  year: number;
  grossTax: Cents;
  rebate: Cents;
  netTax: Cents;
  segments: Array<{
    id: string;
    usage: PropertyTaxUsage;
    annualValue: Cents;
    ownerShareBps: number;
    grossTax: Cents;
    rebate: Cents;
    netTax: Cents;
    bands: PropertyTaxBandBreakdown[];
  }>;
  deadlines: PropertyTaxDeadlineSummary;
  ruleVersion: string;
  notes: string[];
  findings: Finding[];
}

export interface ReconcilePropertyTaxInput {
  grossTax?: Cents;
  rebate?: Cents;
  netTax?: Cents;
}

export interface ReconcilePropertyTaxResult {
  matches: boolean;
  findings: Finding[];
}

interface ProgressiveBand {
  width?: Cents;
  rateBps: Bps;
  label: string;
}

interface RebateRule {
  rateBps: Bps;
  cap?: Cents;
}

const OOTR_BY_YEAR: Array<{ fromYear: number; toYear?: number; bands: readonly ProgressiveBand[]; ruleVersion: string }> = [
  {
    fromYear: 2015,
    toYear: 2022,
    ruleVersion: "property-tax.ootr.2015",
    bands: [
      { width: 800_000, rateBps: 0, label: "First S$8,000" },
      { width: 4_700_000, rateBps: 400, label: "Next S$47,000" },
      { width: 1_500_000, rateBps: 600, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 800, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 1000, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 1200, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 1400, label: "Next S$15,000" },
      { rateBps: 1600, label: "Remainder" },
    ],
  },
  {
    fromYear: 2023,
    toYear: 2023,
    ruleVersion: "property-tax.ootr.2023",
    bands: [
      { width: 800_000, rateBps: 0, label: "First S$8,000" },
      { width: 2_200_000, rateBps: 400, label: "Next S$22,000" },
      { width: 1_000_000, rateBps: 500, label: "Next S$10,000" },
      { width: 1_500_000, rateBps: 700, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 1000, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 1400, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 1800, label: "Next S$15,000" },
      { rateBps: 2300, label: "Remainder" },
    ],
  },
  {
    fromYear: 2024,
    toYear: 2024,
    ruleVersion: "property-tax.ootr.2024",
    bands: [
      { width: 800_000, rateBps: 0, label: "First S$8,000" },
      { width: 2_200_000, rateBps: 400, label: "Next S$22,000" },
      { width: 1_000_000, rateBps: 600, label: "Next S$10,000" },
      { width: 1_500_000, rateBps: 1000, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 1400, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 2000, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 2600, label: "Next S$15,000" },
      { rateBps: 3200, label: "Remainder" },
    ],
  },
  {
    fromYear: 2025,
    ruleVersion: "property-tax.ootr.2025",
    bands: [
      { width: 1_200_000, rateBps: 0, label: "First S$12,000" },
      { width: 2_800_000, rateBps: 400, label: "Next S$28,000" },
      { width: 1_000_000, rateBps: 600, label: "Next S$10,000" },
      { width: 2_500_000, rateBps: 1000, label: "Next S$25,000" },
      { width: 1_000_000, rateBps: 1400, label: "Next S$10,000" },
      { width: 1_500_000, rateBps: 2000, label: "Next S$15,000" },
      { width: 4_000_000, rateBps: 2600, label: "Next S$40,000" },
      { rateBps: 3200, label: "Remainder" },
    ],
  },
];

const NOOR_BY_YEAR: Array<{ fromYear: number; toYear?: number; bands: readonly ProgressiveBand[]; ruleVersion: string }> = [
  {
    fromYear: 2015,
    toYear: 2022,
    ruleVersion: "property-tax.noor.2015",
    bands: [
      { width: 3_000_000, rateBps: 1000, label: "First S$30,000" },
      { width: 1_500_000, rateBps: 1200, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 1400, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 1600, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 1800, label: "Next S$15,000" },
      { rateBps: 2000, label: "Remainder" },
    ],
  },
  {
    fromYear: 2023,
    toYear: 2023,
    ruleVersion: "property-tax.noor.2023",
    bands: [
      { width: 3_000_000, rateBps: 1100, label: "First S$30,000" },
      { width: 1_500_000, rateBps: 1600, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 2100, label: "Next S$15,000" },
      { rateBps: 2700, label: "Remainder" },
    ],
  },
  {
    fromYear: 2024,
    ruleVersion: "property-tax.noor.2024",
    bands: [
      { width: 3_000_000, rateBps: 1200, label: "First S$30,000" },
      { width: 1_500_000, rateBps: 2000, label: "Next S$15,000" },
      { width: 1_500_000, rateBps: 2800, label: "Next S$15,000" },
      { rateBps: 3600, label: "Remainder" },
    ],
  },
];

const OO_REBATES: Record<number, Partial<Record<OwnerOccupiedResidentialType, RebateRule>> & { DEFAULT?: RebateRule }> = {
  2023: { DEFAULT: { rateBps: 6000, cap: 6_000 } },
  2024: {
    HDB_1_2_ROOM: { rateBps: 10_000 },
    HDB_3_ROOM: { rateBps: 7000 },
    HDB_4_ROOM: { rateBps: 5000 },
    HDB_5_ROOM: { rateBps: 4000 },
    HDB_EXECUTIVE: { rateBps: 3000 },
    PRIVATE: { rateBps: 1500, cap: 100_000 },
    OTHER_OWNER_OCCUPIED: { rateBps: 1500, cap: 100_000 },
  },
  2025: {
    HDB_1_2_ROOM: { rateBps: 2000 },
    HDB_3_ROOM: { rateBps: 2000 },
    HDB_4_ROOM: { rateBps: 2000 },
    HDB_5_ROOM: { rateBps: 2000 },
    HDB_EXECUTIVE: { rateBps: 2000 },
    PRIVATE: { rateBps: 1500, cap: 100_000 },
    OTHER_OWNER_OCCUPIED: { rateBps: 1500, cap: 100_000 },
  },
  2026: {
    HDB_1_2_ROOM: { rateBps: 1500 },
    HDB_3_ROOM: { rateBps: 1500 },
    HDB_4_ROOM: { rateBps: 1500 },
    HDB_5_ROOM: { rateBps: 1500 },
    HDB_EXECUTIVE: { rateBps: 1500 },
    PRIVATE: { rateBps: 1000, cap: 50_000 },
    OTHER_OWNER_OCCUPIED: { rateBps: 1000, cap: 50_000 },
  },
};

function assertYear(year: number): number {
  if (!Number.isInteger(year) || year < 2015) throw new RangeError(`Property tax year must be an integer year from 2015 onwards, got ${year}`);
  return year;
}

function assertSegmentDates(year: number, segment: PropertyTaxSegment): void {
  if (compareISO(segment.to, segment.from) < 0) throw new RangeError(`Segment ${segment.id} ends before it starts.`);
  const yearStart = toISO(year, 1, 1);
  const yearEnd = toISO(year, 12, 31);
  if (segment.from < yearStart || segment.to > yearEnd) throw new RangeError(`Segment ${segment.id} must fall within calendar year ${year}.`);
}

function leapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInclusive(from: ISODate, to: ISODate): number {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function pickYearRule<T extends { fromYear: number; toYear?: number }>(rows: readonly T[], year: number, label: string): T {
  const row = rows.find((candidate) => candidate.fromYear <= year && (candidate.toYear === undefined || candidate.toYear >= year));
  if (!row) throw new RuleNotFoundError(label, toISO(year, 1, 1));
  return row;
}

function progressiveTax(av: Cents, bands: readonly ProgressiveBand[], segmentId: string, prorationNumerator: number, prorationDenominator: number): { annualTax: Cents; proratedTax: Cents; breakdown: PropertyTaxBandBreakdown[] } {
  let remaining = Math.max(0, av);
  let annualTax = 0;
  let cursor = 0;
  const breakdown: PropertyTaxBandBreakdown[] = [];
  for (const band of bands) {
    const taxable = band.width === undefined ? remaining : Math.min(remaining, band.width);
    const bandAnnualTax = taxable > 0 ? mulBps(taxable, band.rateBps) : 0;
    if (taxable > 0) {
      const proratedTax = Math.round((bandAnnualTax * prorationNumerator) / prorationDenominator);
      breakdown.push({ segmentId, label: band.label, from: cursor, to: band.width === undefined ? null : cursor + band.width, rateBps: band.rateBps, taxableAmount: taxable, annualTax: bandAnnualTax, proratedTax });
    }
    annualTax += bandAnnualTax;
    remaining -= taxable;
    if (band.width !== undefined) cursor += band.width;
    if (remaining <= 0) break;
  }
  return { annualTax, proratedTax: breakdown.reduce((sum, band) => sum + band.proratedTax, 0), breakdown };
}

function rebateRule(year: number, residentialType: OwnerOccupiedResidentialType | undefined): RebateRule | undefined {
  const ruleSet = OO_REBATES[year];
  if (!ruleSet) return undefined;
  return (residentialType && ruleSet[residentialType]) ?? ruleSet.DEFAULT;
}

function applyOwnerOccupierRebate(year: number, residentialType: OwnerOccupiedResidentialType | undefined, proratedOwnerOccupiedTax: Cents): Cents {
  const rule = rebateRule(year, residentialType);
  if (!rule) return 0;
  const candidate = mulBps(proratedOwnerOccupiedTax, rule.rateBps);
  return rule.cap === undefined ? candidate : Math.min(candidate, rule.cap);
}

export function computePropertyTax(input: ComputePropertyTaxInput): ComputePropertyTaxResult {
  const year = assertYear(input.year);
  const findings: Finding[] = [];
  const notes = [
    ENGINE_DISCLAIMER,
    "IRAS property tax is billed annually in advance. This engine prorates annual tax by calendar days for part-year periods and private seller/buyer apportionments; that day-count convention is an implementation assumption because IRAS describes the tax apportionment between private parties as a private arrangement.",
    "IRAS states that residential property tax remains payable regardless of whether the property is owner-occupied, vacant or rented out.",
  ];
  const daysInYear = leapYear(year) ? 366 : 365;
  const segments = input.segments.map((segment) => {
    assertSegmentDates(year, segment);
    const annualValue = Math.max(0, segment.annualValue);
    const ownerShareBps = segment.ownerShareBps ?? 10_000;
    const segmentDays = daysInclusive(segment.from, segment.to);
    let ruleVersion = "";
    let tax = 0;
    let bands: PropertyTaxBandBreakdown[] = [];
    if (segment.usage === "OWNER_OCCUPIED_RESIDENTIAL") {
      const rule = pickYearRule(OOTR_BY_YEAR, year, "Owner-occupier property tax");
      ruleVersion = rule.ruleVersion;
      const calc = progressiveTax(annualValue, rule.bands, segment.id, segmentDays, daysInYear);
      tax = calc.proratedTax;
      bands = calc.breakdown;
    } else if (segment.usage === "NON_OWNER_OCCUPIED_RESIDENTIAL" && !segment.excludedFromNonOwnerResidentialRates) {
      const rule = pickYearRule(NOOR_BY_YEAR, year, "Non-owner-occupier residential property tax");
      ruleVersion = rule.ruleVersion;
      const calc = progressiveTax(annualValue, rule.bands, segment.id, segmentDays, daysInYear);
      tax = calc.proratedTax;
      bands = calc.breakdown;
    } else {
      ruleVersion = "property-tax.other.10pct";
      const annualTax = mulBps(annualValue, 1000);
      const proratedTax = Math.round((annualTax * segmentDays) / daysInYear);
      tax = proratedTax;
      bands = [{ segmentId: segment.id, label: "10% flat rate", from: 0, to: null, rateBps: 1000, taxableAmount: annualValue, annualTax, proratedTax }];
    }
    const rebateBeforeShare = segment.usage === "OWNER_OCCUPIED_RESIDENTIAL" ? applyOwnerOccupierRebate(year, segment.residentialType, tax) : 0;
    const grossTax = Math.round((tax * ownerShareBps) / 10_000);
    const rebate = Math.round((rebateBeforeShare * ownerShareBps) / 10_000);
    if (segment.ownerShareBps !== undefined && segment.ownerShareBps < 10_000) {
      findings.push({ id: "PROPERTY_TAX.OWNER_SHARE_PRIVATE", severity: "INFO", message: `Segment ${segment.id} was apportioned using ownerShareBps=${segment.ownerShareBps}. IRAS still regards all co-owners as jointly liable; this share split is for internal reconciliation only.`, subject: segment.id });
    }
    return { id: segment.id, usage: segment.usage, annualValue, ownerShareBps, grossTax, rebate, netTax: grossTax - rebate, bands, ruleVersion };
  });

  const deadlines: PropertyTaxDeadlineSummary = {};
  if (input.notice) {
    if (input.notice.kind === "ANNUAL_BILL") deadlines.paymentDueDate = toISO(year, 1, 31);
    else deadlines.paymentDueDate = addMonths(input.notice.noticeDate, 1);
    if (input.notice.kind === "VALUATION_NOTICE") deadlines.objectionDueDate = addDays(input.notice.noticeDate, 30);
  }
  deadlines.objectionDueDate ??= toISO(year, 12, 31);
  const ruleVersion = Array.from(new Set(segments.map((segment) => segment.ruleVersion))).join("+");
  const grossTax = segments.reduce((sum, segment) => sum + segment.grossTax, 0);
  const rebate = segments.reduce((sum, segment) => sum + segment.rebate, 0);
  return { year, grossTax, rebate, netTax: grossTax - rebate, segments, deadlines, ruleVersion, notes, findings };
}

export function reconcilePropertyTax(computed: ComputePropertyTaxResult, billed: ReconcilePropertyTaxInput): ReconcilePropertyTaxResult {
  const findings: Finding[] = [];
  const checks: Array<[keyof ReconcilePropertyTaxInput, Cents]> = [
    ["grossTax", computed.grossTax],
    ["rebate", computed.rebate],
    ["netTax", computed.netTax],
  ];
  for (const [field, actual] of checks) {
    const expected = billed[field];
    if (expected === undefined) continue;
    if (expected !== actual) {
      findings.push({
        id: `PROPERTY_TAX.RECON.${field.toUpperCase()}`,
        severity: "WARNING",
        message: `Computed ${field} ${actual} does not match billed ${field} ${expected}.`,
        data: { computed: actual, billed: expected, variance: actual - expected },
      });
    }
  }
  return { matches: findings.length === 0, findings };
}

export const RULES: RuleEntry[] = [
  { id: "property-tax.rates.ootr.2025", domain: "PROPERTY_TAX", title: "Owner-occupier progressive residential tax rates from 1 Jan 2025", summary: "Owner-occupier residential property tax uses 0%, 4%, 6%, 10%, 14%, 20%, 26% and 32% bands from 1 Jan 2025 onward unless changed by a future notice.", effectiveFrom: "2025-01-01", confidence: "VERIFIED", sources: [{ title: "IRAS | Property Tax Rates and Sample Calculations", url: "https://www.iras.gov.sg/taxes/property-tax/property-owners/property-tax-rates", retrieved: "2026-10-09", publisher: "IRAS" }] },
  { id: "property-tax.rates.noor.2024", domain: "PROPERTY_TAX", title: "Non-owner-occupier residential rates from 1 Jan 2024", summary: "Non-owner-occupier residential property tax uses 12%, 20%, 28% and 36% bands from 1 Jan 2024 onward, except for IRAS' excluded property classes that remain on the 10% rule.", effectiveFrom: "2024-01-01", confidence: "VERIFIED", sources: [{ title: "IRAS | Property Tax Rates and Sample Calculations", url: "https://www.iras.gov.sg/taxes/property-tax/property-owners/property-tax-rates", retrieved: "2026-10-09", publisher: "IRAS" }] },
  { id: "property-tax.other.10pct", domain: "PROPERTY_TAX", title: "10% rule for non-residential property and vacant land", summary: "All non-residential property, vacant land and excluded residential-like classes are taxed at 10% of annual value.", confidence: "VERIFIED", sources: [{ title: "IRAS | Property Tax Rates and Sample Calculations", url: "https://www.iras.gov.sg/taxes/property-tax/property-owners/property-tax-rates", retrieved: "2026-10-09", publisher: "IRAS" }, { title: "IRAS | Demolishing or Rebuilding Your Property", url: "https://www.iras.gov.sg/taxes/property-tax/property-owners/your-situation/demolishing-or-rebuilding-my-property", retrieved: "2026-10-09", publisher: "IRAS" }] },
  { id: "property-tax.rebates.2023-2026", domain: "PROPERTY_TAX", title: "Owner-occupier property tax rebates for 2023 to 2026", summary: "IRAS publishes one-off owner-occupier rebates for 2023, 2024, 2025 and 2026, including HDB-specific rates and private-property caps.", effectiveFrom: "2023-01-01", confidence: "VERIFIED", sources: [{ title: "IRAS | Property Tax Reliefs", url: "https://www.iras.gov.sg/taxes/property-tax/property-owners/property-tax-reliefs", retrieved: "2026-10-09", publisher: "IRAS" }] },
  { id: "property-tax.av.current", domain: "PROPERTY_TAX", title: "Annual value rules for buildings and land", summary: "IRAS assesses annual value by comparable gross rent for buildings and at 5% of estimated freehold market value for land and development sites.", confidence: "VERIFIED", sources: [{ title: "IRAS | About Annual Value", url: "https://www.iras.gov.sg/taxes/property-tax/property-owners/annual-value", retrieved: "2026-10-09", publisher: "IRAS" }] },
  { id: "property-tax.deadlines.current", domain: "PROPERTY_TAX", title: "Property tax payment and objection deadlines", summary: "Annual bills are due by 31 Jan, other notices are due 1 month from the notice date, valuation objections are due within 30 days, and general valuation-list objections by 31 Dec.", confidence: "VERIFIED", sources: [{ title: "IRAS | Responsibility for Payment", url: "https://www.iras.gov.sg/taxes/property-tax/property-owners/payments", retrieved: "2026-10-09", publisher: "IRAS" }, { title: "IRAS | How to Object to your Assessment", url: "https://www.iras.gov.sg/taxes/property-tax/property-owners/object-to-annual-value", retrieved: "2026-10-09", publisher: "IRAS" }] },
  { id: "property-tax.private-apportionment.assumption", domain: "PROPERTY_TAX", title: "Day-count proration for private apportionments", summary: "The engine prorates annual tax by calendar days for part-year ownership and occupancy changes as a practical reconciliation convention.", confidence: "ASSUMPTION", notes: "IRAS says apportionment between seller and buyer is a private arrangement and does not prescribe the engine's day-count method.", sources: [{ title: "IRAS | Selling my Property", url: "https://www.iras.gov.sg/taxes/property-tax/property-owners/your-situation/selling-my-property", retrieved: "2026-10-09", publisher: "IRAS" }] },
];
