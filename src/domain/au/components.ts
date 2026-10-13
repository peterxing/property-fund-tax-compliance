// The ten tax-character lines of an AU distribution: their labels, how each is withheld and how the year's inputs map onto them.
import type { AuInputs, Cents } from "../types.ts";
import { ratePct } from "../format.ts";
import type { AuRates, RatePair } from "./rates.ts";

export type AuComponentKey =
  | "ausOtherIncome"
  | "ncmi"
  | "excludedNcmi"
  | "cleanBuilding"
  | "interest"
  | "discountGainTarp"
  | "cgtConcessionTarp"
  | "otherGainTarp"
  | "foreignIncome"
  | "taxDeferred";

/** Which withholding rate bucket a component belongs to. "none" is never withheld. */
export type WithholdingBucket = "ordinary" | "clean" | "ncmi" | "excluded" | "interest" | "none";

export interface ComponentDef {
  key: AuComponentKey;
  label: string;
  short: string;
  /** Attributed to members as assessable or non-assessable income. The AMIT CGT gross-up amount and the other non-attributable amount are not. */
  attributed: boolean;
  bucket: WithholdingBucket;
}

export const COMPONENT_DEFS: readonly ComponentDef[] = [
  { key: "ausOtherIncome", label: "Australian income — other", short: "Other income", attributed: true, bucket: "ordinary" },
  { key: "ncmi", label: "Non-concessional MIT income", short: "NCMI", attributed: true, bucket: "ncmi" },
  { key: "excludedNcmi", label: "Excluded from NCMI — transitional", short: "Excluded NCMI", attributed: true, bucket: "excluded" },
  { key: "cleanBuilding", label: "Clean building MIT income", short: "Clean building", attributed: true, bucket: "clean" },
  { key: "interest", label: "Australian interest", short: "Interest", attributed: true, bucket: "interest" },
  { key: "discountGainTarp", label: "Discounted capital gains — TARP", short: "Discounted gains", attributed: true, bucket: "ordinary" },
  { key: "cgtConcessionTarp", label: "AMIT CGT gross-up amount — TARP", short: "CGT gross-up", attributed: false, bucket: "ordinary" },
  { key: "otherGainTarp", label: "Other capital gains — TARP", short: "Other gains", attributed: true, bucket: "ordinary" },
  { key: "foreignIncome", label: "Assessable foreign income", short: "Foreign income", attributed: true, bucket: "none" },
  { key: "taxDeferred", label: "Other non-attributable amounts", short: "Cost base excess", attributed: false, bucket: "none" },
];

export const COMPONENT_KEYS: readonly AuComponentKey[] = COMPONENT_DEFS.map((d) => d.key);

export function componentDef(key: string): ComponentDef {
  const def = COMPONENT_DEFS.find((d) => d.key === key);
  if (!def) throw new Error(`Unknown AU component ${key}`);
  return def;
}

export type ComponentAmounts = Record<AuComponentKey, Cents>;

/** The year's amounts as the distribution sees them, with the figures derived from them. */
export interface AuAmounts {
  components: ComponentAmounts;
  cash: Cents;
  attributed: Cents;
  cgtConcession: Cents;
  /** cash - attributed - AMIT CGT gross-up amount: > 0 excess (decreases cost base), < 0 shortfall (increases it). */
  costBaseNet: Cents;
  taxDeferred: Cents;
  /** Everything notified as a fund payment: the discounted gain counts twice because the AMIT CGT gross-up amount is added to it. */
  fundPayment: Cents;
  characterTotal: Cents;
}

export function deriveAmounts(inputs: AuInputs): AuAmounts {
  const attributed =
    inputs.ausOtherIncome +
    inputs.ncmi +
    inputs.excludedNcmi +
    inputs.cleanBuilding +
    inputs.interest +
    inputs.discountGainTarp +
    inputs.otherGainTarp +
    inputs.foreignIncome;
  const cgtConcession = inputs.discountGainTarp;
  const costBaseNet = inputs.cashDistribution - attributed - cgtConcession;
  const taxDeferred = Math.max(0, costBaseNet);
  const components: ComponentAmounts = {
    ausOtherIncome: inputs.ausOtherIncome,
    ncmi: inputs.ncmi,
    excludedNcmi: inputs.excludedNcmi,
    cleanBuilding: inputs.cleanBuilding,
    interest: inputs.interest,
    discountGainTarp: inputs.discountGainTarp,
    cgtConcessionTarp: cgtConcession,
    otherGainTarp: inputs.otherGainTarp,
    foreignIncome: inputs.foreignIncome,
    taxDeferred,
  };
  const fundPayment =
    inputs.ausOtherIncome + inputs.ncmi + inputs.excludedNcmi + inputs.cleanBuilding + 2 * inputs.discountGainTarp + inputs.otherGainTarp;
  const characterTotal = COMPONENT_DEFS.reduce((sum, d) => sum + components[d.key], 0);
  return { components, cash: inputs.cashDistribution, attributed, cgtConcession, costBaseNet, taxDeferred, fundPayment, characterTotal };
}

export type HolderRegion = "resident" | "foreign-eoi" | "foreign-non-eoi";

const pairFor = (bucket: WithholdingBucket, rates: AuRates): RatePair | null => (bucket === "none" ? null : rates[bucket]);

/** Withholding rate in basis points for one component and one kind of holder. */
export function rateBps(def: ComponentDef, region: HolderRegion, rates: AuRates): number {
  if (region === "resident") return 0;
  const pair = pairFor(def.bucket, rates);
  if (!pair) return 0;
  return region === "foreign-eoi" ? pair.eoi : pair.nonEoi;
}

const bpsPct = (bps: number): string => ratePct(bps / 10000);

function pairText(pair: RatePair): string {
  return pair.eoi === pair.nonEoi ? bpsPct(pair.eoi) : `${bpsPct(pair.eoi)} EOI · ${bpsPct(pair.nonEoi)} non-EOI`;
}

/** The "Treatment" column of the distribution table, built from the rates in force. */
export function treatmentFor(key: AuComponentKey, rates: AuRates): string {
  switch (key) {
    case "ausOtherIncome":
    case "otherGainTarp":
      return `Fund payment · ${pairText(rates.ordinary)}`;
    case "ncmi":
      return `Fund payment · ${pairText(rates.ncmi)}`;
    case "excludedNcmi":
      return `Fund payment · ${pairText(rates.excluded)} · pre-27 Mar 2018 arrangements`;
    case "cleanBuilding":
      return `Fund payment · ${pairText(rates.clean)}`;
    case "interest":
      return `Interest withholding · ${pairText(rates.interest)}`;
    case "discountGainTarp":
      return `Fund payment · after ${bpsPct(rates.trustDiscountBps)} discount`;
    case "cgtConcessionTarp":
      return "Equals the discount · grossed up into fund payment";
    case "foreignIncome":
      return "No Australian withholding";
    case "taxDeferred":
      return "Cash above attributed amounts · reduces cost base";
  }
}

/** The withholding text shown on a fund payment notice for each notified line. */
export function noticeRateText(line: "other" | "ncmi" | "excludedNcmi" | "clean" | "interest", rates: AuRates): string {
  switch (line) {
    case "other":
      return pairText(rates.ordinary);
    case "ncmi":
      return pairText(rates.ncmi);
    case "excludedNcmi":
      return pairText(rates.excluded);
    case "clean":
      return pairText(rates.clean);
    case "interest":
      return `${pairText(rates.interest)} interest withholding`;
  }
}
