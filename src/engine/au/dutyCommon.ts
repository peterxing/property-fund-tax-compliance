// Helpers shared by the Australian transfer duty modules (transferDuty.ts for NSW, VIC, QLD, WA and SA; transferDutyTerritories.ts for
// TAS, ACT and NT): a duty schedule of bands, how a band is applied, and the small formatting and validation helpers both need.
import type { ISODate } from "../dates.ts";
import { parseISO } from "../dates.ts";
import type { Cents } from "../money.ts";
import { assertCents, floorToDollar, mulBps, mulRatio } from "../money.ts";
import type { ComputationLine } from "../types.ts";

export interface DutyBand {
  from: Cents;
  to?: Cents;
  baseDuty: Cents;
  excessFrom: Cents;
  rateBps?: number;
  /** Cents for every A$100 or part of A$100 (of the excess, or of the whole value when appliesToWholeValue). */
  ratePer100?: Cents;
  appliesToWholeValue?: boolean;
  label: string;
}

export interface TransferSchedule {
  ruleVersion: string;
  minimumDuty: Cents;
  bands: readonly DutyBand[];
}

export interface ForeignSurchargeRate {
  ruleVersion: string;
  rateBps: number;
}

export function dollars(cents: Cents): string {
  return `A$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "21 May 2012", for messages a person reads. */
export function longDate(date: ISODate): string {
  const { y, m, d } = parseISO(date);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function assertDate(date: ISODate, _label: string): ISODate {
  parseISO(date);
  return date;
}

export function assertNonNegativeCents(value: number, label: string): Cents {
  const cents = assertCents(value, label);
  if (cents < 0) throw new RangeError(`${label} cannot be negative.`);
  return cents;
}

export function assertBps(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) throw new RangeError(`${label} must be an integer between 0 and 10,000.`);
  return value;
}

export function proportionalShare(amount: Cents, bps: number): Cents {
  return mulRatio(amount, assertBps(bps, "share"), 10_000);
}

export function line(code: string, label: string, amount: Cents, note?: string, indent = 0): ComputationLine {
  return { code, label, amount, kind: "AMOUNT", source: "RULE", note, indent };
}

export function rateToText(band: DutyBand): string {
  if (band.ratePer100 !== undefined) return `${dollars(band.ratePer100)} per A$100 or part`;
  if (band.rateBps !== undefined) return `${band.rateBps / 100}%`;
  return "0%";
}

function applyRate(value: Cents, band: DutyBand): Cents {
  if (band.rateBps !== undefined) return mulBps(value, band.rateBps);
  if (band.ratePer100 !== undefined) return Math.ceil(value / 10_000) * band.ratePer100;
  return 0;
}

export function applyDutyBand(value: Cents, band: DutyBand): Cents {
  if (value <= band.excessFrom) return band.appliesToWholeValue ? applyRate(value, band) : band.baseDuty;
  const base = band.baseDuty;
  if (band.appliesToWholeValue) return applyRate(value, band);
  if (band.ratePer100 !== undefined) {
    const increments = Math.ceil((value - band.excessFrom) / 10_000);
    return base + increments * band.ratePer100;
  }
  return base + applyRate(value - band.excessFrom, band);
}

export function findBand(schedule: TransferSchedule, value: Cents): DutyBand {
  const band = schedule.bands.find((candidate) => value >= candidate.from && (candidate.to === undefined || value <= candidate.to));
  if (!band) throw new RangeError(`No duty band covers ${value}.`);
  return band;
}

export function computeScheduledDuty(schedule: TransferSchedule, value: Cents, opts: { floorWholeDollar?: boolean } = {}): { duty: Cents; band: DutyBand } {
  const band = findBand(schedule, value);
  let duty = applyDutyBand(value, band);
  if (opts.floorWholeDollar) duty = floorToDollar(duty);
  if (value > 0 && duty < schedule.minimumDuty) duty = schedule.minimumDuty;
  return { duty, band };
}
