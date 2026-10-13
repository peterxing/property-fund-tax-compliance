// Unitholder classes and their s45G withholding treatment. Rates, concession dates and the 90% threshold all come from the engine's
// REIT rules (src/engine/reitTax.ts); this file only maps the app's holder classes onto the engine's and words the results.
import { addDays, diffDays } from "../../engine/dates.ts";
import { computeReitTax, determineReitInvestorTax } from "../../engine/reitTax.ts";
import type { ReitDeclarationStatus, ReitFundExemptionSection, ReitInvestorClass, ReitInvestorTaxResult } from "../../engine/reitTax.ts";
import { mulBps } from "../../engine/money.ts";
import { ratePct } from "../format.ts";
import type { Cents, ISODate, SgHolderClass } from "../types.ts";
import { SG_CLASS_LABEL } from "./util.ts";

interface EngineMapping {
  investorClass: ReitInvestorClass;
  declarationStatus: ReitDeclarationStatus;
  residency: "SG" | "NON_SG";
}

/** "other" holders are the ones with no declaration on file, which the engine treats as MISSING. */
export const ENGINE_MAPPING: Record<SgHolderClass, EngineMapping> = {
  individual: { investorClass: "INDIVIDUAL", declarationStatus: "NOT_REQUIRED", residency: "SG" },
  qualifying: { investorClass: "SINGAPORE_COMPANY", declarationStatus: "FORM_A_VALID", residency: "SG" },
  nrni: { investorClass: "QUALIFYING_NON_RESIDENT_NON_INDIVIDUAL", declarationStatus: "FORM_A_VALID", residency: "NON_SG" },
  "nr-fund": { investorClass: "QUALIFYING_NON_RESIDENT_FUND", declarationStatus: "FORM_A_VALID", residency: "NON_SG" },
  other: { investorClass: "OTHER_NON_RESIDENT_NON_INDIVIDUAL", declarationStatus: "MISSING", residency: "NON_SG" },
};

export function engineTreatment(sgClass: SgHolderClass, distributionDate: ISODate, section?: ReitFundExemptionSection): ReitInvestorTaxResult {
  const m = ENGINE_MAPPING[sgClass];
  return determineReitInvestorTax({ distributionDate, investorClass: m.investorClass, declarationStatus: m.declarationStatus, fundExemptionSection: section });
}

export interface HolderTreatment {
  sgClass: SgHolderClass;
  statusLabel: string;
  rateBps: number;
  rate: number; // 0..1
  final: boolean;
  group: "gross" | "net";
  /** "Exempt · paid gross" | "Paid gross · taxed at own rate" | "10% final" | "17% · not final" */
  rateSummary: string;
  /** "Tax deducted at 10% (final)" | "Tax deducted at 17%"; null when nothing is deducted. */
  partLabel: string | null;
  /** "10% final" | "17% not final"; "" when nothing is deducted. */
  s45gRateLabel: string;
  remark: string;
}

const FINAL_SUFFIX = " (final)";

/** True for a withholding part label that marks a final tax ("Tax deducted at 10% (final)"). */
export const isFinalPart = (label: string): boolean => label.endsWith(FINAL_SUFFIX);

export function holderTreatment(sgClass: SgHolderClass, distributionDate: ISODate): HolderTreatment {
  const e = engineTreatment(sgClass, distributionDate);
  const rateBps = e.withholdingApplies ? e.withholdingRateBps : 0;
  const rate = rateBps / 10000;
  const final = rateBps > 0 && e.finalTax;
  let rateSummary: string;
  if (rateBps === 0) rateSummary = e.treatment === "EXEMPT" ? "Exempt · paid gross" : "Paid gross · taxed at own rate";
  else rateSummary = final ? `${ratePct(rate)} final` : `${ratePct(rate)} · not final`;
  return {
    sgClass,
    statusLabel: SG_CLASS_LABEL[sgClass],
    rateBps,
    rate,
    final,
    group: rateBps > 0 ? "net" : "gross",
    rateSummary,
    partLabel: rateBps === 0 ? null : final ? `Tax deducted at ${ratePct(rate)}${FINAL_SUFFIX}` : `Tax deducted at ${ratePct(rate)}`,
    s45gRateLabel: rateBps === 0 ? "" : final ? `${ratePct(rate)} final` : `${ratePct(rate)} not final`,
    remark: e.remark,
  };
}

/** Tax deducted from a holder's share of the taxable distribution (half away from zero, as the engine rounds). */
export function withholdingOn(taxable: Cents, rateBps: number): Cents {
  return rateBps === 0 || taxable === 0 ? 0 : mulBps(Math.round(taxable), rateBps);
}

/** The notice's wording of a class's rate: "Exempt — paid gross", "10% final", "17% — not final". */
export function noticeRateText(t: HolderTreatment): string {
  return t.rateSummary.replace(" · ", " — ");
}

// ------------------------------------------------------------------------------------------------ wording built from the rates
function phrase(label: string, rates: readonly number[]): string {
  const lo = Math.min(...rates);
  const hi = Math.max(...rates);
  return `${lo === hi ? ratePct(lo) : `${ratePct(lo)}–${ratePct(hi)}`} ${label}`;
}

function bands(date: ISODate) {
  const r = (c: SgHolderClass) => holderTreatment(c, date).rate;
  return { individual: r("individual"), qualifying: r("qualifying"), nrni: r("nrni"), nrFund: r("nr-fund"), other: r("other") };
}

/** "0% individuals & qualifying · 10% qualifying non-residents · 17% others" */
export function componentTreatmentText(date: ISODate): string {
  const b = bands(date);
  return [phrase("individuals & qualifying", [b.individual, b.qualifying]), phrase("qualifying non-residents", [b.nrni, b.nrFund]), phrase("others", [b.other])].join(" · ");
}

/** The notice's tax-treatment cell for the taxable distribution. */
export function noticeTreatmentText(date: ISODate): string {
  const b = bands(date);
  const first =
    Math.max(b.individual, b.qualifying) === 0 ? "Gross to individuals and qualifying unitholders" : phrase("individuals and qualifying unitholders", [b.individual, b.qualifying]);
  return [first, phrase("qualifying non-residents", [b.nrni, b.nrFund]), phrase("others", [b.other])].join(" · ");
}

// ------------------------------------------------------------------------------------------------ concession windows
export interface DateWindow {
  from: ISODate;
  to: ISODate;
}

const windowCache = new Map<string, DateWindow | null>();

function probeGrid(): ISODate[] {
  const grid: ISODate[] = [];
  for (let y = 1990; y <= 2100; y++) grid.push(`${y}-01-01`, `${y}-07-01`);
  return grid;
}

/**
 * The dates between which the engine gives a declared qualifying non-resident class the 10% final rate. Probed from the engine
 * itself (a half-yearly sweep, then a bisection of each edge), so the wording on the rules and the notice can't drift from the rules.
 */
export function concessionWindow(sgClass: "nrni" | "nr-fund", section?: ReitFundExemptionSection): DateWindow | null {
  const cacheKey = `${sgClass}|${section ?? ""}`;
  const cached = windowCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const isFinal = (d: ISODate) => {
    const e = engineTreatment(sgClass, d, section);
    return e.withholdingApplies && e.finalTax;
  };
  const grid = probeGrid();
  const first = grid.findIndex(isFinal);
  let result: DateWindow | null = null;
  if (first >= 0) {
    let last = first;
    while (last + 1 < grid.length && isFinal(grid[last + 1])) last++;
    let from = grid[first];
    if (first > 0) {
      let lo = grid[first - 1];
      let hi = grid[first];
      while (diffDays(lo, hi) > 1) {
        const mid = addDays(lo, Math.floor(diffDays(lo, hi) / 2));
        if (isFinal(mid)) hi = mid;
        else lo = mid;
      }
      from = hi;
    }
    let to = grid[last];
    if (last + 1 < grid.length) {
      let lo = grid[last];
      let hi = grid[last + 1];
      while (diffDays(lo, hi) > 1) {
        const mid = addDays(lo, Math.floor(diffDays(lo, hi) / 2));
        if (isFinal(mid)) lo = mid;
        else hi = mid;
      }
      to = lo;
    }
    result = { from, to };
  }
  windowCache.set(cacheKey, result);
  return result;
}

// ------------------------------------------------------------------------------------------------ trustee position
export interface TrusteePosition {
  income: Cents;
  distributed: Cents;
  retained: Cents;
  payoutRatio: number | null;
  /** The engine's 90% transparency test on this payout. */
  passes: boolean;
  requiredMinimum: Cents;
  thresholdPct: number; // 0..100
  rateBps: number;
  rate: number; // 0..1
  /** Tax on the retained specified income at the trustee (the reference app's figure). */
  trusteeTax: Cents;
  /**
   * The engine's own trustee tax for the same payout. It equals `trusteeTax` when the 90% test passes; when it fails the engine
   * assumes the Comptroller denies transparency and taxes all of the specified income at the trustee (its worst case).
   */
  engineTrusteeTax: Cents;
}

let thresholdCache: number | null = null;

/** The transparency threshold as a percentage, read back from the engine. */
export function transparencyThresholdPct(): number {
  if (thresholdCache === null) {
    const probe = 100_000_000;
    const r = computeReitTax({ distributionDate: "2026-01-01", taxableSpecifiedIncome: probe, taxableSpecifiedIncomeDistributed: 0 });
    thresholdCache = (r.requiredMinimumDistribution / probe) * 100;
  }
  return thresholdCache;
}

/**
 * Passes the payout through the engine for the 90% test and the trustee rate. The tax itself is on the retained income only: the
 * engine's `trusteeTax` is the worst case (a failed test taxes all of the specified income), which docs/parity/sg.md records.
 */
export function trusteePosition(distributionDate: ISODate, incomeCents: Cents, distributedCents: Cents): TrusteePosition {
  const income = Math.round(incomeCents);
  const distributed = Math.round(distributedCents);
  const r = computeReitTax({ distributionDate, taxableSpecifiedIncome: income, taxableSpecifiedIncomeDistributed: distributed });
  const retained = Math.max(0, income - distributed);
  return {
    income,
    distributed,
    retained,
    payoutRatio: income > 0 ? distributed / income : null,
    passes: r.passesTransparencyTest,
    requiredMinimum: r.requiredMinimumDistribution,
    thresholdPct: transparencyThresholdPct(),
    rateBps: r.trusteeTaxRateBps,
    rate: r.trusteeTaxRateBps / 10000,
    trusteeTax: mulBps(retained, r.trusteeTaxRateBps),
    engineTrusteeTax: r.trusteeTax,
  };
}
