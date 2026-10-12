/**
 * Shared domain types used by every engine module and (via src/shared) by the server and the web app.
 * Pure types only - no runtime code, no Node-only imports.
 */

import type { Cents } from "./money.ts";
import type { ISODate } from "./dates.ts";

export type { ISODate, Cents };

/** Customer segments the platform serves. */
export type EntityKind =
  | "REIT" // SGX-listed or unlisted real estate investment trust (tax-transparent trust regime)
  | "PROPERTY_FUND" // private property fund vehicle (trust / company / LP) holding real estate
  | "PROPERTY_COMPANY" // property-owning / investment-holding company or SPV
  | "DEVELOPER" // housing / commercial property developer
  | "AGENCY_PM"; // real-estate agency, property manager, facilities manager

export type Jurisdiction = "SG" | "OVERSEAS";

export type PropertyUse =
  | "RESIDENTIAL"
  | "OFFICE"
  | "RETAIL"
  | "INDUSTRIAL"
  | "HOTEL_SERVICED_RESIDENCE"
  | "MIXED_USE"
  | "LAND"
  | "OTHER_NON_RESIDENTIAL";

/** Month/day of a company's financial year end, e.g. { month: 12, day: 31 }. */
export interface FinancialYearEndRule {
  month: number;
  day: number;
}

export type GstFilingFrequency = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY";

/** How a computation line was produced - drives the colour/flag in the UI and the audit trail. */
export type LineSource =
  | "TB" // straight from the (mapped) trial balance
  | "AUTO_ADJUSTMENT" // engine-generated adjustment (e.g. add back depreciation)
  | "MANUAL_ADJUSTMENT" // preparer-entered adjustment (flagged)
  | "SCHEDULE" // output of a sub-schedule (capital allowances, losses...)
  | "RULE" // derived by applying a tax rule/rate
  | "CARRY_FORWARD" // brought forward from a prior period
  | "OVERRIDE"; // a policy/rule value was manually overridden (flagged)

export type LineKind = "AMOUNT" | "SUBTOTAL" | "TOTAL" | "INFO" | "HEADING" | "PERCENT";

/**
 * One displayable line of any computation (tax computation, GST F5, distribution, property tax...).
 * The web UI renders every computation generically from this shape.
 */
export interface ComputationLine {
  /** stable machine key, e.g. "ADJ.ADD.DEPRECIATION" */
  code: string;
  label: string;
  /** cents for AMOUNT/SUBTOTAL/TOTAL; basis points for PERCENT; ignored for HEADING/INFO */
  amount: number;
  kind: LineKind;
  /** 0 = top level */
  indent?: number;
  /** statutory/guidance reference, e.g. "s14(1)(a) ITA" or "IRAS e-Tax Guide: ..." */
  ref?: string;
  note?: string;
  source?: LineSource;
  /** the line needs human confirmation before sign-off */
  needsReview?: boolean;
}

export type FindingSeverity = "ERROR" | "WARNING" | "INFO";

/** A validation message, reasonableness check, exception or risk flag. */
export interface Finding {
  /** stable rule id, e.g. "TAXCOMP.NEGATIVE_CHARGEABLE_INCOME" */
  id: string;
  severity: FindingSeverity;
  message: string;
  /** optional pointer to what triggered it (line code, property code, account code...) */
  subject?: string;
  /** supporting numbers (e.g. variance %) for exception reports */
  data?: Record<string, number | string | boolean | null>;
}
