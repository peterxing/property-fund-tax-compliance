import type { AuState } from "./types.ts";
import { AU_STATES } from "./types.ts";

export type AuCoverageLevel = "FULL" | "PARTIAL" | "NOT_MODELLED";

export interface AuStateTaxCoverage {
  state: AuState;
  label: string;
  transferDutyCoverage: AuCoverageLevel;
  landTaxCoverage: AuCoverageLevel;
  description: string;
}

export const AU_COVERAGE_LEVELS = [
  { id: "FULL", label: "Full", description: "Verified current and historical parameters are modelled for the supported scope." },
  { id: "PARTIAL", label: "Partial", description: "Some verified rules are modelled, but manual review is still required for important gaps." },
  { id: "NOT_MODELLED", label: "Not modelled", description: "The jurisdiction is catalogued for UI selection, but no calculator logic is shipped here." },
] as const satisfies readonly { id: AuCoverageLevel; label: string; description: string }[];

export const AU_STATE_TAX_CATALOGUE: readonly AuStateTaxCoverage[] = [
  {
    state: "NSW",
    label: "New South Wales",
    transferDutyCoverage: "PARTIAL",
    landTaxCoverage: "FULL",
    description: "Verified NSW transfer duty, surcharge purchaser duty and land tax for investment owners; NSW landholder duty for foreign acquirers still needs manual review because Revenue NSW says the surcharge may also apply but does not publish a modelled formula here.",
  },
  {
    state: "VIC",
    label: "Victoria",
    transferDutyCoverage: "FULL",
    landTaxCoverage: "FULL",
    description: "Verified Victorian investor duty, foreign purchaser additional duty, landholder duty and land tax / trust surcharge / absentee surcharge.",
  },
  {
    state: "QLD",
    label: "Queensland",
    transferDutyCoverage: "FULL",
    landTaxCoverage: "FULL",
    description: "Verified Queensland transfer duty, AFAD, landholder duty and land tax for individuals, companies and trusts.",
  },
  {
    state: "WA",
    label: "Western Australia",
    transferDutyCoverage: "PARTIAL",
    landTaxCoverage: "FULL",
    description: "Verified WA land tax scale and Metropolitan Region Improvement Tax, the WA general rate of transfer duty with 7% foreign transfer duty on residential property, and direct single-step WA landholder duty at the general rate for listed and unlisted landholders; excluded interests and complex tracing remain manual-review.",
  },
  {
    state: "SA",
    label: "South Australia",
    transferDutyCoverage: "PARTIAL",
    landTaxCoverage: "FULL",
    description: "Verified South Australian general and trust land tax rates for 2021-22 to 2026-27, conveyance duty back to the 2002 rate chart, qualifying-land phase-out and abolition, 7% foreign ownership surcharge on residential land, and direct residential landholder duty; primary-production and complex tracing remain manual-review.",
  },
  {
    state: "TAS",
    label: "Tasmania",
    transferDutyCoverage: "PARTIAL",
    landTaxCoverage: "FULL",
    description: "Verified Tasmanian property transfer duty and 8% foreign investor duty surcharge on residential property, plus General Land land tax and the 2% foreign investor land tax surcharge; primary-production surcharge pathways and concessions are not modelled.",
  },
  {
    state: "ACT",
    label: "Australian Capital Territory",
    transferDutyCoverage: "FULL",
    landTaxCoverage: "PARTIAL",
    description: "Verified ACT residential and commercial conveyance duty from 1 July 2022, including the commercial duty phase-out thresholds. Residential land tax (2025-26 and 2026-27) and the foreign ownership surcharge are modelled; commercial land tax is a cited nil.",
  },
  {
    state: "NT",
    label: "Northern Territory",
    transferDutyCoverage: "FULL",
    landTaxCoverage: "FULL",
    description: "Verified Northern Territory stamp duty on land from 1 July 2022 using the V-squared formula and percentage bands; no land tax and no foreign-purchaser surcharge are modelled as cited nils.",
  },
];

export const AU_MODELLED_TRANSFER_DUTY_STATES = AU_STATE_TAX_CATALOGUE.filter((entry) => entry.transferDutyCoverage !== "NOT_MODELLED").map((entry) => ({ id: entry.state, label: entry.label, description: entry.description })) as readonly { id: AuState; label: string; description: string }[];

export const AU_MODELLED_LAND_TAX_STATES = AU_STATE_TAX_CATALOGUE.filter((entry) => entry.landTaxCoverage !== "NOT_MODELLED").map((entry) => ({ id: entry.state, label: entry.label, description: entry.description })) as readonly { id: AuState; label: string; description: string }[];

if (new Set(AU_STATE_TAX_CATALOGUE.map((entry) => entry.state)).size !== AU_STATES.length) {
  throw new Error("Every AU state must appear exactly once in AU_STATE_TAX_CATALOGUE.");
}
