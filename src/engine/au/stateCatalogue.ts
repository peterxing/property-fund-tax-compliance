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

export const AU_STATE_TAX_CATALOGUE = [
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
    description: "Verified WA land tax scale and Metropolitan Region Improvement Tax, and the WA general rate of transfer duty with 7% foreign transfer duty on residential property; WA landholder duty and concessional rates are not modelled.",
  },
  {
    state: "SA",
    label: "South Australia",
    transferDutyCoverage: "PARTIAL",
    landTaxCoverage: "FULL",
    description: "Verified South Australian general and trust land tax rates for 2021-22 to 2026-27, and conveyance duty for contracts from 1 July 2018 with no duty on qualifying (non-residential) land; SA landholder duty, the foreign ownership surcharge and earlier contracts are not modelled.",
  },
  {
    state: "TAS",
    label: "Tasmania",
    transferDutyCoverage: "NOT_MODELLED",
    landTaxCoverage: "NOT_MODELLED",
    description: "Catalogued only in this delivery; Tasmania duty and land tax rates need a separate verified implementation.",
  },
  {
    state: "ACT",
    label: "Australian Capital Territory",
    transferDutyCoverage: "NOT_MODELLED",
    landTaxCoverage: "NOT_MODELLED",
    description: "Catalogued only in this delivery; ACT duty and land tax rates need a separate verified implementation.",
  },
  {
    state: "NT",
    label: "Northern Territory",
    transferDutyCoverage: "NOT_MODELLED",
    landTaxCoverage: "NOT_MODELLED",
    description: "Catalogued only in this delivery; NT duty and land tax rates need a separate verified implementation.",
  },
] as const satisfies readonly AuStateTaxCoverage[];

export const AU_MODELLED_TRANSFER_DUTY_STATES = AU_STATE_TAX_CATALOGUE.filter((entry) => entry.transferDutyCoverage !== "NOT_MODELLED").map((entry) => ({ id: entry.state, label: entry.label, description: entry.description })) as readonly { id: AuState; label: string; description: string }[];

export const AU_MODELLED_LAND_TAX_STATES = AU_STATE_TAX_CATALOGUE.filter((entry) => entry.landTaxCoverage !== "NOT_MODELLED").map((entry) => ({ id: entry.state, label: entry.label, description: entry.description })) as readonly { id: AuState; label: string; description: string }[];

if (new Set(AU_STATE_TAX_CATALOGUE.map((entry) => entry.state)).size !== AU_STATES.length) {
  throw new Error("Every AU state must appear exactly once in AU_STATE_TAX_CATALOGUE.");
}
