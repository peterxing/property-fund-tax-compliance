/**
 * Shared Australian types and catalogues. Owned by the platform lead: AU engine modules import from here, they never edit it.
 * Pure types and constants only - browser-safe.
 */

/** State or Territory. Transfer duty, land tax and several concessions differ by jurisdiction. */
export type AuState = "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "ACT" | "NT";

export const AU_STATES: readonly { id: AuState; label: string }[] = [
  { id: "NSW", label: "New South Wales" },
  { id: "VIC", label: "Victoria" },
  { id: "QLD", label: "Queensland" },
  { id: "WA", label: "Western Australia" },
  { id: "SA", label: "South Australia" },
  { id: "TAS", label: "Tasmania" },
  { id: "ACT", label: "Australian Capital Territory" },
  { id: "NT", label: "Northern Territory" },
];

/**
 * How an Australian entity is taxed. Drives which computation, distribution statements and withholding rules apply.
 *  AMIT                 - managed investment trust that has made the attribution (AMIT) election: AMMA statements, unders/overs, cost base net amount
 *  MIT                  - managed investment trust that is NOT an AMIT: Division 6 flow-through, MIT withholding, capital account election
 *  UNIT_TRUST           - ordinary (e.g. wholesale / unlisted) unit trust under Division 6 ITAA 1936, not an MIT
 *  PUBLIC_TRADING_TRUST - Division 6C: taxed like a company
 *  DISCRETIONARY_TRUST  - family / discretionary trust
 *  COMPANY              - Australian resident company (Pty Ltd / Ltd) incl. property developer and agency
 */
export type AuTaxRegime = "AMIT" | "MIT" | "UNIT_TRUST" | "PUBLIC_TRADING_TRUST" | "DISCRETIONARY_TRUST" | "COMPANY";

export const AU_TAX_REGIMES: readonly { id: AuTaxRegime; label: string; description: string; isTrust: boolean }[] = [
  { id: "AMIT", label: "Attribution managed investment trust (AMIT)", description: "MIT that has elected into the AMIT regime. Trustee attributes components to members; annual AMMA statements.", isTrust: true },
  { id: "MIT", label: "Managed investment trust (non-AMIT)", description: "Widely-held MIT taxed under Division 6 without the attribution election. MIT withholding applies to foreign residents.", isTrust: true },
  { id: "UNIT_TRUST", label: "Unit trust (non-MIT)", description: "Unlisted or wholesale unit trust taxed under Division 6 ITAA 1936.", isTrust: true },
  { id: "PUBLIC_TRADING_TRUST", label: "Public trading trust (Division 6C)", description: "A trust taxed like a company because it carries on a trading business.", isTrust: true },
  { id: "DISCRETIONARY_TRUST", label: "Discretionary trust", description: "Trustee distributes at its discretion; s100A and streaming rules are relevant.", isTrust: true },
  { id: "COMPANY", label: "Company", description: "Australian resident company taxed at the corporate rate (25% base rate entity or 30%).", isTrust: false },
];

/** Income year identified by the calendar year in which it ENDS: 2026 = 1 July 2025 to 30 June 2026 (ATO "2025-26"). */
export type AuIncomeYear = number;

/**
 * Character (stream) of trust income. Used to carry income from the trust tax computation into distribution components,
 * AMMA statements and MIT fund-payment analysis. Agents may export richer local unions but must be able to map onto these.
 */
export type AuIncomeCharacter =
  | "RENT" // gross rent and other leasing income (Australian real property)
  | "INTEREST"
  | "OTHER_AU_INCOME" // other Australian-sourced assessable income (fees, recoveries, ...)
  | "FRANKED_DIVIDEND" // incl. franked distributions received from other trusts
  | "UNFRANKED_DIVIDEND"
  | "FOREIGN_INCOME"
  | "CAPITAL_GAIN_DISCOUNTABLE" // gross capital gain eligible for the CGT discount (before the discount is applied)
  | "CAPITAL_GAIN_OTHER" // capital gain not discount-eligible (e.g. held under 12 months, or indexation method)
  | "NON_ASSESSABLE_TAX_DEFERRED" // cash distributed out of non-assessable timing differences (Div 40 / Div 43, fair value, ...)
  | "NON_ASSESSABLE_TAX_FREE"
  | "NON_ASSESSABLE_TAX_EXEMPT";

export const AU_INCOME_CHARACTERS: readonly { id: AuIncomeCharacter; label: string; description: string }[] = [
  { id: "RENT", label: "Rent and leasing income", description: "Gross rent and other income from leasing Australian real property." },
  { id: "INTEREST", label: "Interest", description: "Interest income." },
  { id: "OTHER_AU_INCOME", label: "Other Australian income", description: "Other assessable income from Australian sources (recoveries, fees, ...)." },
  { id: "FRANKED_DIVIDEND", label: "Franked dividends / distributions", description: "Franked dividends and franked distributions, with their franking credits." },
  { id: "UNFRANKED_DIVIDEND", label: "Unfranked dividends", description: "Unfranked dividends." },
  { id: "FOREIGN_INCOME", label: "Foreign-sourced income", description: "Income from overseas sources (foreign income tax offsets may apply)." },
  { id: "CAPITAL_GAIN_DISCOUNTABLE", label: "Capital gains - discount eligible", description: "Gross capital gains on assets held 12 months or more (before the CGT discount)." },
  { id: "CAPITAL_GAIN_OTHER", label: "Capital gains - other", description: "Capital gains that are not eligible for the discount." },
  { id: "NON_ASSESSABLE_TAX_DEFERRED", label: "Tax-deferred amounts", description: "Cash distributed that exceeds taxable income because of timing differences; reduces the unit cost base." },
  { id: "NON_ASSESSABLE_TAX_FREE", label: "Tax-free amounts", description: "Non-assessable non-exempt distributions." },
  { id: "NON_ASSESSABLE_TAX_EXEMPT", label: "Tax-exempt amounts", description: "Exempt income distributed." },
];

export const AU_CURRENCY = "AUD";
