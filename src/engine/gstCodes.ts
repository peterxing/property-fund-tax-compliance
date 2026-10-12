import type { ISODate } from "./dates.ts";
import type { RuleEntry } from "./rules.ts";
import { ENGINE_DISCLAIMER } from "./rules.ts";

export type GstCanonicalCode =
  | "SR"
  | "SRCA-S"
  | "SRCA-C"
  | "SRRC"
  | "SROVR"
  | "SROVR-RS"
  | "SROVR-LVG"
  | "SRLVG"
  | "ZR"
  | "ES33"
  | "ESN33"
  | "DS"
  | "OS"
  | "NA"
  | "TX"
  | "TXCA"
  | "TXNA"
  | "ZP"
  | "IM"
  | "ME"
  | "IGDS"
  | "BL"
  | "NR"
  | "EP"
  | "OP"
  | "TXRC-TS"
  | "TX-ESS"
  | "TXRC-ESS"
  | "IM-ESS"
  | "TX-N33"
  | "TXRC-N33"
  | "IM-N33"
  | "TX-RE"
  | "TXRC-RE"
  | "IM-RE";

export type GstCodeInput = GstCanonicalCode | "TX-E33" | "TXRC-E33" | "IM-E33";
export type GstCodeSide = "SUPPLY" | "PURCHASE";
export type GstRateBehavior =
  | "PREVAILING_STANDARD_RATE"
  | "ZERO_RATED"
  | "EXEMPT"
  | "NO_GST"
  | "OUT_OF_SCOPE"
  | "IMPORT_GST_SUSPENDED"
  | "IMPORT_GST_DEFERRED";
export type GstInputTaxClaimability = "FULL" | "NONE" | "REGULATION_33" | "APPORTION" | "SUBJECT_TO_CONDITIONS" | "NOT_APPLICABLE";

export interface GstCodeDefinition {
  code: GstCanonicalCode;
  side: GstCodeSide;
  description: string;
  rateBehavior: GstRateBehavior;
  feedsBaseBoxes: readonly number[];
  feedsTaxBoxes: readonly number[];
  feedsIndicatorBoxes: readonly number[];
  inputTaxClaimability: GstInputTaxClaimability;
  officialPublishedNow: boolean;
  aliases?: readonly GstCodeInput[];
  effectiveFrom: ISODate;
  effectiveTo?: ISODate;
  notes?: string;
}

const CODE_TABLE: readonly GstCodeDefinition[] = [
  { code: "SR", side: "SUPPLY", description: "Standard-rated local supplies of goods or services.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [1], feedsTaxBoxes: [6], feedsIndicatorBoxes: [], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "SRCA-S", side: "SUPPLY", description: "Customer-accounting supply made by the supplier; value goes to Box 1 but supplier does not charge GST.", rateBehavior: "NO_GST", feedsBaseBoxes: [1], feedsTaxBoxes: [], feedsIndicatorBoxes: [], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "SRCA-C", side: "SUPPLY", description: "Customer-accounting supply accountable by the customer on the supplier's behalf.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [1], feedsTaxBoxes: [6], feedsIndicatorBoxes: [], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "SRRC", side: "SUPPLY", description: "Imported services / low-value goods subject to reverse charge and accounted for by the customer.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [1, 14], feedsTaxBoxes: [6], feedsIndicatorBoxes: [14], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: true, effectiveFrom: "2023-01-01" },
  { code: "SROVR", side: "SUPPLY", description: "Legacy OVR code before the 2023 split into remote-services and LVG sub-codes.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [1, 15], feedsTaxBoxes: [6], feedsIndicatorBoxes: [15], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: false, aliases: ["SROVR"], effectiveFrom: "2022-01-01", effectiveTo: "2022-12-31", notes: "IRAS' 2026 ASR+ guide states that SROVR was replaced by SROVR-RS and SROVR-LVG with effect from 1 Jan 2023." },
  { code: "SROVR-RS", side: "SUPPLY", description: "Remote services supplied by an electronic marketplace operator on behalf of third-party suppliers.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [1, 15], feedsTaxBoxes: [6], feedsIndicatorBoxes: [15], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: true, aliases: ["SROVR"], effectiveFrom: "2023-01-01" },
  { code: "SROVR-LVG", side: "SUPPLY", description: "Imported low-value goods supplied by a redeliverer or electronic marketplace on behalf of third-party suppliers.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [1, 16], feedsTaxBoxes: [6], feedsIndicatorBoxes: [16], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: true, effectiveFrom: "2023-01-01" },
  { code: "SRLVG", side: "SUPPLY", description: "GST-registered supplier's own supply of imported low-value goods.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [1, 17], feedsTaxBoxes: [6], feedsIndicatorBoxes: [17], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: true, effectiveFrom: "2023-01-01" },
  { code: "ZR", side: "SUPPLY", description: "Zero-rated supplies such as exports and qualifying international services.", rateBehavior: "ZERO_RATED", feedsBaseBoxes: [2], feedsTaxBoxes: [], feedsIndicatorBoxes: [], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "ES33", side: "SUPPLY", description: "Regulation 33 exempt supplies.", rateBehavior: "EXEMPT", feedsBaseBoxes: [3], feedsTaxBoxes: [], feedsIndicatorBoxes: [], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "ESN33", side: "SUPPLY", description: "Non-Regulation 33 exempt supplies, including sale and lease of residential property.", rateBehavior: "EXEMPT", feedsBaseBoxes: [3], feedsTaxBoxes: [], feedsIndicatorBoxes: [], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "DS", side: "SUPPLY", description: "Deemed supplies.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [1], feedsTaxBoxes: [6], feedsIndicatorBoxes: [], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "OS", side: "SUPPLY", description: "Out-of-scope supplies not reported in the GST return.", rateBehavior: "OUT_OF_SCOPE", feedsBaseBoxes: [], feedsTaxBoxes: [], feedsIndicatorBoxes: [], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "NA", side: "SUPPLY", description: "Supplies under specific GST schemes where GST need not be charged but the value is still reported as a standard-rated supply.", rateBehavior: "NO_GST", feedsBaseBoxes: [1], feedsTaxBoxes: [], feedsIndicatorBoxes: [], inputTaxClaimability: "NOT_APPLICABLE", officialPublishedNow: true, effectiveFrom: "2024-12-03" },
  { code: "TX", side: "PURCHASE", description: "Standard-rated purchases directly attributable to taxable supplies.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [5], feedsTaxBoxes: [7], feedsIndicatorBoxes: [], inputTaxClaimability: "FULL", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "TXCA", side: "PURCHASE", description: "Prescribed goods purchased under customer accounting; input tax may be claimed subject to normal conditions.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [5], feedsTaxBoxes: [7], feedsIndicatorBoxes: [], inputTaxClaimability: "SUBJECT_TO_CONDITIONS", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "TXNA", side: "PURCHASE", description: "Purchases under specific GST schemes where no GST is charged but the purchase value is reportable in Box 5 (and sometimes Box 9).", rateBehavior: "NO_GST", feedsBaseBoxes: [5], feedsTaxBoxes: [], feedsIndicatorBoxes: [], inputTaxClaimability: "NONE", officialPublishedNow: true, effectiveFrom: "2024-12-03" },
  { code: "ZP", side: "PURCHASE", description: "Zero-rated purchases from GST-registered suppliers.", rateBehavior: "ZERO_RATED", feedsBaseBoxes: [5], feedsTaxBoxes: [], feedsIndicatorBoxes: [], inputTaxClaimability: "NONE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "IM", side: "PURCHASE", description: "Imports of goods with import GST paid.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [5], feedsTaxBoxes: [7], feedsIndicatorBoxes: [], inputTaxClaimability: "SUBJECT_TO_CONDITIONS", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "ME", side: "PURCHASE", description: "Imports under MES / A3PL / other import GST suspension scheme.", rateBehavior: "IMPORT_GST_SUSPENDED", feedsBaseBoxes: [5, 9], feedsTaxBoxes: [], feedsIndicatorBoxes: [9], inputTaxClaimability: "NONE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "IGDS", side: "PURCHASE", description: "Imports under the Import GST Deferment Scheme.", rateBehavior: "IMPORT_GST_DEFERRED", feedsBaseBoxes: [5, 21], feedsTaxBoxes: [7, 19], feedsIndicatorBoxes: [18, 19, 20, 21], inputTaxClaimability: "SUBJECT_TO_CONDITIONS", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "BL", side: "PURCHASE", description: "Blocked / disallowed input-tax expenses.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [], feedsTaxBoxes: [], feedsIndicatorBoxes: [], inputTaxClaimability: "NONE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "NR", side: "PURCHASE", description: "Purchases from non-GST-registered suppliers.", rateBehavior: "NO_GST", feedsBaseBoxes: [], feedsTaxBoxes: [], feedsIndicatorBoxes: [], inputTaxClaimability: "NONE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "EP", side: "PURCHASE", description: "Purchases specifically exempt from GST, such as residential property.", rateBehavior: "EXEMPT", feedsBaseBoxes: [], feedsTaxBoxes: [], feedsIndicatorBoxes: [], inputTaxClaimability: "NONE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "OP", side: "PURCHASE", description: "Out-of-scope purchases, including many overseas supplies outside Singapore GST.", rateBehavior: "OUT_OF_SCOPE", feedsBaseBoxes: [], feedsTaxBoxes: [], feedsIndicatorBoxes: [], inputTaxClaimability: "NONE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "TXRC-TS", side: "PURCHASE", description: "Imported services / LVG under reverse charge directly attributable to taxable supplies.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [5], feedsTaxBoxes: [7], feedsIndicatorBoxes: [], inputTaxClaimability: "FULL", officialPublishedNow: true, effectiveFrom: "2023-01-01" },
  { code: "TX-ESS", side: "PURCHASE", description: "Standard-rated purchases directly attributable to Regulation 33 exempt supplies.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [5], feedsTaxBoxes: [7], feedsIndicatorBoxes: [], inputTaxClaimability: "REGULATION_33", officialPublishedNow: true, aliases: ["TX-E33"], effectiveFrom: "2022-01-01", notes: "IRAS' current ASR+ guide uses TX-ESS, not the older shorthand TX-E33 seen in some ledgers." },
  { code: "TXRC-ESS", side: "PURCHASE", description: "Imported services / LVG under reverse charge directly attributable to Regulation 33 exempt supplies.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [5], feedsTaxBoxes: [7], feedsIndicatorBoxes: [], inputTaxClaimability: "REGULATION_33", officialPublishedNow: true, aliases: ["TXRC-E33"], effectiveFrom: "2023-01-01" },
  { code: "IM-ESS", side: "PURCHASE", description: "Imports directly attributable to Regulation 33 exempt supplies.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [5], feedsTaxBoxes: [7], feedsIndicatorBoxes: [], inputTaxClaimability: "REGULATION_33", officialPublishedNow: true, aliases: ["IM-E33"], effectiveFrom: "2022-01-01" },
  { code: "TX-N33", side: "PURCHASE", description: "Standard-rated purchases directly attributable to non-Regulation 33 exempt supplies.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [5], feedsTaxBoxes: [7], feedsIndicatorBoxes: [], inputTaxClaimability: "NONE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "TXRC-N33", side: "PURCHASE", description: "Imported services / LVG under reverse charge directly attributable to non-Regulation 33 exempt supplies.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [5], feedsTaxBoxes: [7], feedsIndicatorBoxes: [], inputTaxClaimability: "NONE", officialPublishedNow: true, effectiveFrom: "2023-01-01" },
  { code: "IM-N33", side: "PURCHASE", description: "Imports directly attributable to non-Regulation 33 exempt supplies.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [5], feedsTaxBoxes: [7], feedsIndicatorBoxes: [], inputTaxClaimability: "NONE", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "TX-RE", side: "PURCHASE", description: "Residual input tax attributable to both taxable and exempt supplies or general overheads.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [5], feedsTaxBoxes: [7], feedsIndicatorBoxes: [], inputTaxClaimability: "APPORTION", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
  { code: "TXRC-RE", side: "PURCHASE", description: "Residual imported services / LVG under reverse charge.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [5], feedsTaxBoxes: [7], feedsIndicatorBoxes: [], inputTaxClaimability: "APPORTION", officialPublishedNow: true, effectiveFrom: "2023-01-01" },
  { code: "IM-RE", side: "PURCHASE", description: "Residual imports of goods.", rateBehavior: "PREVAILING_STANDARD_RATE", feedsBaseBoxes: [5], feedsTaxBoxes: [7], feedsIndicatorBoxes: [], inputTaxClaimability: "APPORTION", officialPublishedNow: true, effectiveFrom: "2022-01-01" },
] as const;

export const GST_CODES = CODE_TABLE;

export function lookupGstCode(code: string, date: ISODate = "2026-10-09"): GstCodeDefinition | undefined {
  const normalized = code.trim().toUpperCase();
  return GST_CODES.find((entry) => {
    if (date < entry.effectiveFrom) return false;
    if (entry.effectiveTo && date > entry.effectiveTo) return false;
    return entry.code === normalized || Boolean(entry.aliases?.includes(normalized as GstCodeInput));
  });
}

export const RULES = [
  {
    id: "gst.codes.asr-guide.2026",
    domain: "GST",
    title: "IRAS-published GST ledger / draft-return tax codes",
    summary:
      "The engine uses the GST code families reflected in IRAS' current GST-return guidance and a locally retrieved copy of the 2026 ASR+ guide, but the live public ASR+ PDF URL could not be re-opened on 2026-10-09.",
    effectiveFrom: "2022-01-01",
    sources: [
      { title: "IRAS | Completing GST returns", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/filing-gst/completing-gst-returns", retrieved: "2026-10-09", publisher: "IRAS" },
    ],
    confidence: "VERIFIED_SECONDARY",
    notes:
      "The current IRAS ASR+ guide uses TX-ESS / TXRC-ESS / IM-ESS for Regulation 33 exempt purchases. Legacy aliases such as TX-E33 are accepted by lookupGstCode only as compatibility aliases. Because the live public ASR+ PDF URL could not be re-opened, this rule is not marked VERIFIED.",
  },
] as const satisfies readonly RuleEntry[];

export const NOTES = [ENGINE_DISCLAIMER];
