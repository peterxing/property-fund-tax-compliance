/**
 * Rule provenance and effective-dating helpers shared by every engine module.
 *
 * Singapore tax parameters change often (Budget announcements, MND cooling measures, IRAS e-Tax guides).
 * Every parameter used by the engine must therefore be:
 *   1. stored as DATA (not buried in if-statements),
 *   2. effective-dated, so historical years still compute with the rules that applied then, and
 *   3. traceable to a primary source (IRAS / MND / MAS / Singapore Statutes Online) with a retrieval date.
 *
 * Each engine module exports a `RULES` array of RuleEntry that the platform shows on the "Rules & sources" page.
 */

import type { ISODate } from "./dates.ts";

export interface RuleSource {
  /** Page or document title, e.g. "IRAS | Property Tax Rates and Sample Calculations" */
  title: string;
  url: string;
  /** Date the source was read, ISO yyyy-mm-dd */
  retrieved: ISODate;
  publisher?: string;
}

export type RuleDomain =
  | "STAMP_DUTY"
  | "PROPERTY_TAX"
  | "CORPORATE_TAX"
  | "CAPITAL_ALLOWANCES"
  | "GST"
  | "REIT_TAX"
  | "WITHHOLDING_TAX"
  | "FILING"
  | "IDENTIFIERS"
  | "OTHER"
  // Australia
  | "AU_INCOME_TAX"
  | "AU_TRUST_TAX"
  | "AU_MIT"
  | "AU_CAPITAL_ALLOWANCES"
  | "AU_CGT"
  | "AU_GST"
  | "AU_TRANSFER_DUTY"
  | "AU_LAND_TAX"
  | "AU_FILING"
  | "AU_IDENTIFIERS";

/**
 * VERIFIED            - read from a primary source (IRAS/MND/MAS/SSO) on `sources[].retrieved`
 * VERIFIED_SECONDARY  - corroborated by a reputable secondary source only (law-firm/Big-4 note)
 * ASSUMPTION          - modelling assumption or simplification; the UI flags these for tax-professional review
 */
export type RuleConfidence = "VERIFIED" | "VERIFIED_SECONDARY" | "ASSUMPTION";

export interface RuleEntry {
  /** Stable id, e.g. "stamp-duty.bsd.residential.2023-02-15" */
  id: string;
  domain: RuleDomain;
  title: string;
  /** One or two sentences a tax professional can read in the UI */
  summary: string;
  effectiveFrom?: ISODate;
  effectiveTo?: ISODate;
  sources: RuleSource[];
  confidence: RuleConfidence;
  /** Known limitations / what the engine does NOT model */
  notes?: string;
}

export interface Effective<T> {
  /** inclusive */
  from: ISODate;
  /** inclusive; omit for "until further notice" */
  to?: ISODate;
  value: T;
}

export function pickEffective<T>(rows: readonly Effective<T>[], date: ISODate): T | undefined {
  let best: Effective<T> | undefined;
  for (const row of rows) {
    if (date >= row.from && (row.to === undefined || date <= row.to)) {
      if (!best || row.from > best.from) best = row;
    }
  }
  return best?.value;
}

export class RuleNotFoundError extends Error {
  readonly what: string;
  readonly date: ISODate;
  constructor(what: string, date: ISODate) {
    super(`No rule data for ${what} effective on ${date}. Add an effective-dated row to the rules table.`);
    this.name = "RuleNotFoundError";
    this.what = what;
    this.date = date;
  }
}

export function requireEffective<T>(rows: readonly Effective<T>[], date: ISODate, what: string): T {
  const v = pickEffective(rows, date);
  if (v === undefined) throw new RuleNotFoundError(what, date);
  return v;
}

export const ENGINE_DISCLAIMER =
  "Calculations are decision-support outputs based on published IRAS/MND/MAS guidance on the stated retrieval dates. " +
  "They are not tax advice. Rates, reliefs and filing rules change; a qualified Singapore tax professional must review " +
  "every computation, assumption and filing before submission to IRAS.";

export const ENGINE_DISCLAIMER_AU =
  "Calculations are decision-support outputs based on published ATO, legislation and State/Territory revenue office guidance on the stated retrieval dates. " +
  "They are not tax advice. Rates, thresholds and filing rules change (many on 1 July or 1 January); a registered Australian tax agent or tax adviser must review " +
  "every computation, assumption and lodgement before submission to the ATO or a State/Territory revenue office.";
