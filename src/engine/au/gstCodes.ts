import type { ISODate } from "../dates.ts";
import type { RuleEntry } from "../rules.ts";
import { ENGINE_DISCLAIMER_AU } from "../rules.ts";

export type AuBasLabel = "G1" | "G2" | "G3" | "G4" | "G10" | "G11" | "1A" | "1B";
export type AuGstCodeSide = "SUPPLY" | "PURCHASE";
export type AuGstClaimability = "FULL" | "APPORTION" | "NONE" | "NOT_APPLICABLE";
export type AuGstRateModel = "STANDARD_10" | "ZERO" | "MARGIN_1_11" | "MANUAL";

export type AuGstCodeId =
  | "SALE_TAXABLE"
  | "SALE_TAXABLE_NEW_RESIDENTIAL"
  | "SALE_TAXABLE_COMMERCIAL_RESIDENTIAL"
  | "SALE_GST_FREE_EXPORT"
  | "SALE_GST_FREE_GOING_CONCERN"
  | "SALE_INPUT_TAXED_RESIDENTIAL_RENT"
  | "SALE_INPUT_TAXED_EXISTING_RESIDENTIAL"
  | "SALE_INPUT_TAXED_FINANCIAL"
  | "SALE_MARGIN_SCHEME"
  | "PURCHASE_CAPITAL_TAXABLE"
  | "PURCHASE_NON_CAPITAL_TAXABLE"
  | "PURCHASE_CAPITAL_GST_FREE"
  | "PURCHASE_NON_CAPITAL_GST_FREE"
  | "PURCHASE_CAPITAL_INPUT_TAXED"
  | "PURCHASE_NON_CAPITAL_INPUT_TAXED"
  | "PURCHASE_CAPITAL_NO_CREDIT"
  | "PURCHASE_NON_CAPITAL_NO_CREDIT"
  | "ADJUSTMENT_GST_ON_SALES"
  | "ADJUSTMENT_GST_ON_PURCHASES"
  | "ADJUSTMENT_REVERSE_CHARGE";

export interface AuBasLabelDefinition {
  id: AuBasLabel;
  label: string;
  description: string;
  official: boolean;
}

export interface AuGstCodeDefinition {
  id: AuGstCodeId;
  label: string;
  description: string;
  side: AuGstCodeSide;
  basLabels: readonly AuBasLabel[];
  claimability: AuGstClaimability;
  rateModel: AuGstRateModel;
  effectiveFrom: ISODate;
  notes?: string;
}

export const AU_BAS_LABELS = [
  { id: "G1", label: "G1 Total sales", description: "All reportable sales for the period, including taxable, GST-free and input-taxed sales.", official: true },
  { id: "G2", label: "G2 Export sales", description: "Export sales included in G1 under the current full-reporting BAS.", official: true },
  { id: "G3", label: "G3 Other GST-free sales", description: "Other GST-free sales included in G1 under the current full-reporting BAS.", official: true },
  { id: "G4", label: "G4 Input-taxed sales", description: "Platform subtotal for input-taxed sales included within G1. Current ATO BAS guidance no longer requires a standalone G4 field.", official: false },
  { id: "G10", label: "G10 Capital purchases", description: "Capital purchases under the current full-reporting BAS.", official: true },
  { id: "G11", label: "G11 Non-capital purchases", description: "Non-capital purchases under the current full-reporting BAS.", official: true },
  { id: "1A", label: "1A GST on sales", description: "GST payable on sales and increasing adjustments.", official: true },
  { id: "1B", label: "1B GST on purchases", description: "GST credits on purchases and decreasing adjustments.", official: true },
] as const satisfies readonly AuBasLabelDefinition[];

const CODE_TABLE = [
  { id: "SALE_TAXABLE", label: "Taxable sale (10%)", description: "General taxable Australian sale, such as a commercial lease, commercial property sale, agency fee or service charge.", side: "SUPPLY", basLabels: ["G1", "1A"], claimability: "NOT_APPLICABLE", rateModel: "STANDARD_10", effectiveFrom: "2000-07-01" },
  { id: "SALE_TAXABLE_NEW_RESIDENTIAL", label: "Taxable sale - new residential premises", description: "Sale of new residential premises that is taxable under the GST law.", side: "SUPPLY", basLabels: ["G1", "1A"], claimability: "NOT_APPLICABLE", rateModel: "STANDARD_10", effectiveFrom: "2000-07-01" },
  { id: "SALE_TAXABLE_COMMERCIAL_RESIDENTIAL", label: "Taxable sale - commercial residential premises", description: "Sale or lease of commercial residential premises such as hotels, motels, inns and boarding houses.", side: "SUPPLY", basLabels: ["G1", "1A"], claimability: "NOT_APPLICABLE", rateModel: "STANDARD_10", effectiveFrom: "2000-07-01" },
  { id: "SALE_GST_FREE_EXPORT", label: "GST-free sale - export", description: "GST-free export of goods or services reportable at G2 as well as G1 under full BAS reporting.", side: "SUPPLY", basLabels: ["G1", "G2"], claimability: "NOT_APPLICABLE", rateModel: "ZERO", effectiveFrom: "2000-07-01" },
  { id: "SALE_GST_FREE_GOING_CONCERN", label: "GST-free sale - going concern", description: "GST-free sale of a going concern when the statutory conditions are satisfied.", side: "SUPPLY", basLabels: ["G1", "G3"], claimability: "NOT_APPLICABLE", rateModel: "ZERO", effectiveFrom: "2000-07-01" },
  { id: "SALE_INPUT_TAXED_RESIDENTIAL_RENT", label: "Input-taxed sale - residential rent", description: "Lease of residential premises for residential accommodation.", side: "SUPPLY", basLabels: ["G1", "G4"], claimability: "NOT_APPLICABLE", rateModel: "ZERO", effectiveFrom: "2000-07-01" },
  { id: "SALE_INPUT_TAXED_EXISTING_RESIDENTIAL", label: "Input-taxed sale - existing residential premises", description: "Sale of existing residential premises that is not a taxable sale of new residential premises.", side: "SUPPLY", basLabels: ["G1", "G4"], claimability: "NOT_APPLICABLE", rateModel: "ZERO", effectiveFrom: "2000-07-01" },
  { id: "SALE_INPUT_TAXED_FINANCIAL", label: "Input-taxed sale - financial supply", description: "Input-taxed financial supply included in G1 and the platform's G4 subtotal.", side: "SUPPLY", basLabels: ["G1", "G4"], claimability: "NOT_APPLICABLE", rateModel: "ZERO", effectiveFrom: "2000-07-01" },
  { id: "SALE_MARGIN_SCHEME", label: "Taxable sale - margin scheme", description: "Taxable real-property sale where GST is calculated as 1/11 of the margin. The value reported to G1 is the margin, not the gross contract price.", side: "SUPPLY", basLabels: ["G1", "1A"], claimability: "NOT_APPLICABLE", rateModel: "MARGIN_1_11", effectiveFrom: "2000-07-01" },
  { id: "PURCHASE_CAPITAL_TAXABLE", label: "Taxable purchase - capital", description: "Capital purchase with GST in the price and a potentially claimable credit.", side: "PURCHASE", basLabels: ["G10", "1B"], claimability: "FULL", rateModel: "STANDARD_10", effectiveFrom: "2000-07-01" },
  { id: "PURCHASE_NON_CAPITAL_TAXABLE", label: "Taxable purchase - non-capital", description: "Non-capital purchase with GST in the price and a potentially claimable credit.", side: "PURCHASE", basLabels: ["G11", "1B"], claimability: "FULL", rateModel: "STANDARD_10", effectiveFrom: "2000-07-01" },
  { id: "PURCHASE_CAPITAL_GST_FREE", label: "GST-free purchase - capital", description: "Capital purchase that is GST-free and therefore has no GST credit but is still a capital purchase for BAS classification.", side: "PURCHASE", basLabels: ["G10"], claimability: "NONE", rateModel: "ZERO", effectiveFrom: "2000-07-01" },
  { id: "PURCHASE_NON_CAPITAL_GST_FREE", label: "GST-free purchase - non-capital", description: "Non-capital purchase that is GST-free and therefore has no GST credit.", side: "PURCHASE", basLabels: ["G11"], claimability: "NONE", rateModel: "ZERO", effectiveFrom: "2000-07-01" },
  { id: "PURCHASE_CAPITAL_INPUT_TAXED", label: "Input-taxed purchase - capital", description: "Capital purchase relating to input-taxed activities or otherwise not carrying GST.", side: "PURCHASE", basLabels: ["G10"], claimability: "NONE", rateModel: "ZERO", effectiveFrom: "2000-07-01" },
  { id: "PURCHASE_NON_CAPITAL_INPUT_TAXED", label: "Input-taxed purchase - non-capital", description: "Non-capital purchase relating to input-taxed activities or otherwise not carrying GST.", side: "PURCHASE", basLabels: ["G11"], claimability: "NONE", rateModel: "ZERO", effectiveFrom: "2000-07-01" },
  { id: "PURCHASE_CAPITAL_NO_CREDIT", label: "Blocked purchase - capital", description: "Capital purchase where GST may be embedded but no credit is claimable, for example private use or no valid tax invoice over the threshold.", side: "PURCHASE", basLabels: ["G10"], claimability: "NONE", rateModel: "STANDARD_10", effectiveFrom: "2000-07-01" },
  { id: "PURCHASE_NON_CAPITAL_NO_CREDIT", label: "Blocked purchase - non-capital", description: "Non-capital purchase where GST may be embedded but no credit is claimable.", side: "PURCHASE", basLabels: ["G11"], claimability: "NONE", rateModel: "STANDARD_10", effectiveFrom: "2000-07-01" },
  { id: "ADJUSTMENT_GST_ON_SALES", label: "GST adjustment - sales", description: "Manual increasing or decreasing GST adjustment that affects 1A but not the platform sales subtotals.", side: "SUPPLY", basLabels: ["1A"], claimability: "NOT_APPLICABLE", rateModel: "MANUAL", effectiveFrom: "2000-07-01" },
  { id: "ADJUSTMENT_GST_ON_PURCHASES", label: "GST adjustment - purchases", description: "Manual increasing or decreasing GST adjustment that affects 1B but not G10 or G11.", side: "PURCHASE", basLabels: ["1B"], claimability: "APPORTION", rateModel: "MANUAL", effectiveFrom: "2000-07-01" },
  { id: "ADJUSTMENT_REVERSE_CHARGE", label: "GST adjustment - reverse charge / other", description: "Manual code for reverse-charge or other adjustments that need user-supplied BAS label overrides.", side: "PURCHASE", basLabels: [], claimability: "APPORTION", rateModel: "MANUAL", effectiveFrom: "2000-07-01", notes: "Use transaction.manualBasLabels to drive 1A and/or 1B for Australian reverse-charge or similar adjustments." },
] as const satisfies readonly AuGstCodeDefinition[];

export const AU_GST_CODES = CODE_TABLE;

export function lookupAuGstCode(id: string, date: ISODate = "2026-10-10"): AuGstCodeDefinition | undefined {
  const normalized = id.trim().toUpperCase();
  return AU_GST_CODES.find((entry) => entry.id === normalized && date >= entry.effectiveFrom);
}

export const RULES = [
  {
    id: "au-gst.codes.platform-catalogue.2026-10-10",
    domain: "AU_GST",
    title: "Platform GST code catalogue mapped to BAS labels",
    summary: "Australia does not publish a single official ledger tax-code list comparable to Singapore's ASR+ codes, so the engine uses a platform catalogue that maps common property-industry transactions cleanly to current BAS labels and GST-credit outcomes.",
    effectiveFrom: "2000-07-01",
    confidence: "VERIFIED_SECONDARY",
    sources: [
      { title: "ATO | Simpler BAS GST bookkeeping guide", url: "https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas/goods-and-services-tax-gst/simpler-bas-gst-bookkeeping-guide", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Step 1: Sales", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/completing-your-bas-for-gst/complete-your-bas/step-1-sales", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Step 3: Purchases", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/completing-your-bas-for-gst/complete-your-bas/step-3-purchases", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | GST-free sales", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/when-to-charge-gst-and-when-not-to/gst-free-sales", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Residential premises", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/when-to-charge-gst-and-when-not-to/input-taxed-sales/residential-premises", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Financial supplies", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/when-to-charge-gst-and-when-not-to/input-taxed-sales/financial-supplies", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Commercial residential premises and GST", url: "https://www.ato.gov.au/businesses-and-organisations/assets-and-property/property/property-used-in-running-a-business/commercial-residential-premises-and-gst", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Calculating the GST payable", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/your-industry/property/gst-and-the-margin-scheme/calculating-the-gst-payable", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    notes: "Current ATO guidance supports the BAS labels and the broad GST classes used here, but Australia does not publish an official ledger-code catalogue and the exact row set, claimability flags, reverse-charge placeholder, and G4 analytic subtotal are platform constructs. Treat the catalogue mapping as verified secondary rather than an official ATO code list.",
  },
] as const satisfies readonly RuleEntry[];

export const NOTES = [ENGINE_DISCLAIMER_AU];
