import type { RuleEntry } from "./rules.ts";

export interface ValidationResult {
  ok: boolean;
  normalized: string | null;
  reason?: string;
}

const OTHER_UEN_ENTITY_TYPES = new Set([
  "CC", "CD", "CH", "CL", "CM", "CP", "CS", "CX", "DP", "FB", "FC", "FM", "FN", "GA", "GB", "GS", "HS", "LL", "LP", "MB", "MC", "MD", "MH", "MM", "MQ", "NB", "NR", "PA", "PB", "PF", "RF", "RP", "SM", "SS", "TC", "TU", "VH", "XL",
]);

function normalize(value: string): string {
  return value.toUpperCase().replaceAll(/\s+/g, "");
}

function validateBusinessUen(value: string): boolean {
  if (!/^\d{8}[A-Z]$/.test(value)) return false;
  const weights = [10, 4, 9, 3, 8, 2, 7, 1];
  const alphabet = "XMKECAWLJDB";
  const sum = weights.reduce((acc, weight, index) => acc + Number(value[index]) * weight, 0);
  return value[8] === alphabet[sum % 11];
}

function validateLocalCompanyUen(value: string): boolean {
  if (!/^\d{9}[A-Z]$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year > 2099 || year < 1800) return false;
  const weights = [10, 8, 6, 4, 9, 7, 5, 3, 1];
  const alphabet = "ZKCMDNERGWH";
  const sum = weights.reduce((acc, weight, index) => acc + Number(value[index]) * weight, 0);
  return value[9] === alphabet[sum % 11];
}

function validateOtherUen(value: string): boolean {
  if (!/^[RST]\d{2}[A-Z]{2}\d{4}[A-Z]$/.test(value)) return false;
  if (!OTHER_UEN_ENTITY_TYPES.has(value.slice(3, 5))) return false;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWX0123456789";
  const weights = [4, 3, 5, 3, 10, 2, 2, 5, 7];
  const body = value.slice(0, 9);
  const sum = body.split("").reduce((acc, ch, index) => acc + alphabet.indexOf(ch) * weights[index]!, 0);
  const check = alphabet[(sum - 5) % 11];
  return value[9] === check;
}

export function validateUen(value: string): ValidationResult {
  const normalized = normalize(value);
  const ok = validateBusinessUen(normalized) || validateLocalCompanyUen(normalized) || validateOtherUen(normalized);
  return ok ? { ok: true, normalized } : { ok: false, normalized: null, reason: "Value does not match any published UEN format or checksum." };
}

const NRIC_FIN_WEIGHTS = [2, 7, 6, 5, 4, 3, 2] as const;
const NRIC_CHECK = "JZIHGFEDCBA";
const FIN_CHECK = "XWUTRQPNMLK";

export function validateNricFin(value: string): ValidationResult {
  const normalized = normalize(value);
  if (!/^[STFG]\d{7}[A-Z]$/.test(normalized)) return { ok: false, normalized: null, reason: "NRIC/FIN must be a prefix letter, 7 digits and a checksum letter." };
  const digits = normalized.slice(1, 8);
  let sum = digits.split("").reduce((acc, digit, index) => acc + Number(digit) * NRIC_FIN_WEIGHTS[index]!, 0);
  if (normalized[0] === "T" || normalized[0] === "G") sum += 4;
  const alphabet = normalized[0] === "F" || normalized[0] === "G" ? FIN_CHECK : NRIC_CHECK;
  return normalized[8] === alphabet[sum % 11] ? { ok: true, normalized } : { ok: false, normalized: null, reason: "Invalid NRIC/FIN checksum." };
}

export function maskNricFin(value: string): string {
  const normalized = normalize(value);
  if (normalized.length < 4) return "****";
  return `****${normalized.slice(-4)}`;
}

export function validateGstRegistrationNumber(value: string): ValidationResult {
  const normalized = normalize(value);
  const ok = /^M\d{8}$/.test(normalized);
  return ok ? { ok: true, normalized } : { ok: false, normalized: null, reason: "GST registration numbers are modelled as the IRAS-style M followed by 8 digits." };
}

export function validatePostalCode(value: string): ValidationResult {
  const normalized = normalize(value);
  const ok = /^\d{6}$/.test(normalized);
  return ok ? { ok: true, normalized } : { ok: false, normalized: null, reason: "Singapore postal codes must be 6 digits." };
}

export const RULES: RuleEntry[] = [
  {
    id: "identifiers.uen.formats",
    domain: "IDENTIFIERS",
    title: "Singapore UEN formats and checksum algorithms",
    summary: "The engine validates the three common published UEN structures: 8-digit business UENs, 9-digit local-company UENs, and R/S/T-prefixed 'other entity' UENs using their respective checksum algorithms.",
    effectiveFrom: "2022-01-01",
    confidence: "ASSUMPTION",
    notes: "ACRA/Bizfile working pages verified the existence and use of UENs, but no primary checksum specification was retrievable from a working government page in this environment. The checksum implementation is therefore an engine assumption informed by standard market practice.",
    sources: [
      { title: "Bizfile | UEN search", url: "https://www.bizfile.gov.sg/ueninternet/faces/pages/uenSrch.jspx", retrieved: "2026-10-09", publisher: "Bizfile" },
      { title: "ACRA | Using Bizfile's Search Functions", url: "https://www.acra.gov.sg/resources/guides-forms/using-bizfiles-search-functions/", retrieved: "2026-10-09", publisher: "ACRA" },
    ],
  },
  {
    id: "identifiers.nricfin.current",
    domain: "IDENTIFIERS",
    title: "NRIC and FIN checksum validation",
    summary: "The engine validates standard S/T NRIC and F/G FIN identifiers using the standard checksum implementation commonly used in Singapore software and exposes a masking helper for display.",
    effectiveFrom: "2022-01-01",
    confidence: "ASSUMPTION",
    notes: "No working primary checksum specification was retrieved from a government page in this environment. The platform should avoid storing full NRICs unless strictly necessary and should prefer masked values such as ****567A.",
    sources: [
      { title: "ICA | Identity cards", url: "https://www.ica.gov.sg/documents/identity-cards", retrieved: "2026-10-09", publisher: "ICA" },
      { title: "PDPC | Advisory Guidelines on the PDPA for NRIC and other National Identification Numbers", url: "https://www.pdpc.gov.sg/organisations/regulations-decisions/regulatory-guidance/advisory-guidelines-on-the-personal-data-protection-act-for-nric-and-other-national-identification-numbers", retrieved: "2026-10-09", publisher: "PDPC" },
    ],
  },
  {
    id: "identifiers.gst-registration.format",
    domain: "IDENTIFIERS",
    title: "GST registration number format",
    summary: "This module validates GST registration numbers in the common IRAS search format of the letter M followed by 8 digits.",
    effectiveFrom: "2022-01-01",
    confidence: "ASSUMPTION",
    notes: "No primary IRAS checksum or public format specification was retrieved from a working page. The validator remains format-only, as requested.",
    sources: [
      { title: "IRAS | GST Listing Search", url: "https://mytax.iras.gov.sg/ESVWeb/default.aspx?target=GSTListingSearch", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | GST digital services", url: "https://www.iras.gov.sg/digital-services/gst", retrieved: "2026-10-09", publisher: "IRAS" },
    ],
  },
  {
    id: "identifiers.postal-code.current",
    domain: "IDENTIFIERS",
    title: "Singapore postal code format",
    summary: "Singapore postal codes are validated as 6 digits.",
    effectiveFrom: "2022-01-01",
    confidence: "ASSUMPTION",
    notes: "The working SingPost page verified the official postcode lookup service, but did not itself publish a machine-readable format rule; the 6-digit validator is a platform assumption.",
    sources: [{ title: "Singapore Post postal code conventions", url: "https://www.singpost.com/find-postal-code", retrieved: "2026-10-09", publisher: "SingPost" }],
  },
  {
    id: "identifiers.pdpc.masking",
    domain: "IDENTIFIERS",
    title: "Prefer masked NRIC/FIN handling",
    summary: "The platform should avoid storing full NRICs and should prefer masked display values wherever possible.",
    effectiveFrom: "2022-01-01",
    confidence: "VERIFIED",
    sources: [{ title: "PDPC | Advisory Guidelines on the PDPA for NRIC and other National Identification Numbers", url: "https://www.pdpc.gov.sg/organisations/regulations-decisions/regulatory-guidance/advisory-guidelines-on-the-personal-data-protection-act-for-nric-and-other-national-identification-numbers", retrieved: "2026-10-09", publisher: "PDPC" }],
  },
];
