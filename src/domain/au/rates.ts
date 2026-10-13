// Rates and rules the AU module applies. Everything the engine carries (MIT withholding, the trust CGT discount, the super fund discount,
// the company rate) is read from the engine; only the two rates the engine does not model are local constants.
import { computeCgt } from "../../engine/au/cgt.ts";
import { computeAuCompanyTax } from "../../engine/au/companyTax.ts";
import { determineMemberWithholding } from "../../engine/au/members.ts";
import { addYears, yearOf } from "../../engine/dates.ts";
import type { ISODate } from "../types.ts";

/** Interest paid to a foreign resident: 10% (ITAA 1936 s128B(2); Income Tax (Dividends, Interest and Royalties Withholding Tax) Act 1974 s7(b)). Not in the engine. */
export const INTEREST_WITHHOLDING_BPS = 1000;
/** Tax rate on a complying super fund's taxable income (Income Tax Rates Act 1986 s26). Not in the engine. */
export const COMPLYING_SUPER_RATE_BPS = 1500;

export interface RatePair {
  eoi: number; // basis points for an investor with an address in an information exchange country
  nonEoi: number;
}

export interface AuRates {
  ordinary: RatePair;
  clean: RatePair;
  ncmi: RatePair;
  excluded: RatePair;
  interest: RatePair;
  /** CGT discount a trust passes on (basis points). */
  trustDiscountBps: number;
  /** Company tax rate that applies to gains and income of a company investor (basis points). */
  companyBps: number;
  superBps: number;
}

const cache = new Map<ISODate, AuRates>();

function mitPair(asAt: ISODate, memberClass: "FOREIGN_FUND_EOI" | "FOREIGN_FUND_NON_EOI") {
  const result = determineMemberWithholding({
    trustRegime: "AMIT",
    paymentDate: asAt,
    member: { memberClass },
    actualCashPayment: 400,
    mitRateBuckets: { ordinaryFundPayment: 100, cleanBuildingFundPayment: 100, ncmiFundPayment: 100, excludedFromNcmiFundPayment: 100 },
  });
  const rates = result.bucketRates ?? {};
  return {
    ordinary: rates.ordinaryFundPayment ?? 0,
    clean: rates.cleanBuildingFundPayment ?? 0,
    ncmi: rates.ncmiFundPayment ?? 0,
    excluded: rates.excludedFromNcmiFundPayment ?? 0,
  };
}

/** The rates in force for a payment or income year ending on `asAt`. */
export function auRates(asAt: ISODate): AuRates {
  const hit = cache.get(asAt);
  if (hit) return hit;
  const eoi = mitPair(asAt, "FOREIGN_FUND_EOI");
  const non = mitPair(asAt, "FOREIGN_FUND_NON_EOI");
  const trust = computeCgt({
    label: "Rate probe",
    entityType: "TRUST",
    acquisitionDate: addYears(asAt, -2),
    disposalContractDate: asAt,
    capitalProceeds: 1_000_000,
    acquisitionPrice: 0,
  });
  const company = computeAuCompanyTax({
    incomeYear: yearOf(asAt),
    regime: "COMPANY",
    lines: [],
    netCapitalGainBeforeDiscount: { discountable: 1_000_000, other: 0 },
    aggregatedTurnover: 0,
  });
  const rates: AuRates = {
    ordinary: { eoi: eoi.ordinary, nonEoi: non.ordinary },
    clean: { eoi: eoi.clean, nonEoi: non.clean },
    ncmi: { eoi: eoi.ncmi, nonEoi: non.ncmi },
    excluded: { eoi: eoi.excluded, nonEoi: non.excluded },
    interest: { eoi: INTEREST_WITHHOLDING_BPS, nonEoi: INTEREST_WITHHOLDING_BPS },
    trustDiscountBps: trust.discountPercentageBps,
    companyBps: company.summary.rateBps,
    superBps: COMPLYING_SUPER_RATE_BPS,
  };
  cache.set(asAt, rates);
  return rates;
}

/**
 * First day of the 15% build-to-rent fund payment rate. The engine keeps it private (`BTR_WITHHOLDING_RATES` in engine/au/members.ts,
 * rule au-members.mit-foreign-member-withholding.2008-plus) and refuses an earlier payment date, so `util.test.ts` pins the two together.
 */
export const BUILD_TO_RENT_FROM: ISODate = "2025-01-01";

/** Withholding on an eligible build-to-rent fund payment, read from the engine. The engine takes eligibility as given. Null before the concession starts. */
export function buildToRentRates(asAt: ISODate): RatePair | null {
  if (asAt < BUILD_TO_RENT_FROM) return null;
  const rateFor = (memberClass: "FOREIGN_FUND_EOI" | "FOREIGN_FUND_NON_EOI"): number =>
    determineMemberWithholding({
      trustRegime: "AMIT",
      paymentDate: asAt,
      member: { memberClass },
      actualCashPayment: 100,
      mitRateBuckets: { buildToRentFundPayment: 100 },
    }).bucketRates?.buildToRentFundPayment ?? 0;
  return { eoi: rateFor("FOREIGN_FUND_EOI"), nonEoi: rateFor("FOREIGN_FUND_NON_EOI") };
}

/** A trust's capital gain on `gain` held 12 months or more, after the trust's discount (the discounted amount AMIT members are attributed). */
export function trustNetGain(asAt: ISODate, gain: number): number {
  if (gain <= 0) return 0;
  return computeCgt({
    label: "Trust",
    entityType: "TRUST",
    acquisitionDate: addYears(asAt, -2),
    disposalContractDate: asAt,
    capitalProceeds: gain,
    acquisitionPrice: 0,
  }).netCapitalGain;
}

/** A complying super fund's net capital gain on `gain` held 12 months or more, after its one-third discount. */
export function superNetGain(asAt: ISODate, gain: number): number {
  if (gain <= 0) return 0;
  return computeCgt({
    label: "Complying super fund",
    entityType: "COMPLYING_SUPER_FUND",
    acquisitionDate: addYears(asAt, -2),
    disposalContractDate: asAt,
    capitalProceeds: gain,
    acquisitionPrice: 0,
  }).netCapitalGain;
}

/** Whether a property bought on `acquired` has been held long enough for the discount at `asAt` (the engine's rule: disposal after the first anniversary). */
export function heldForDiscount(acquired: ISODate, asAt: ISODate): boolean {
  return asAt > addYears(acquired, 1);
}
