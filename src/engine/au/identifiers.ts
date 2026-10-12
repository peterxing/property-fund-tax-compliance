import type { RuleEntry } from "../rules.ts";
import { ENGINE_DISCLAIMER_AU } from "../rules.ts";

export interface ValidationResult {
  ok: boolean;
  normalized: string | null;
  reason?: string;
}

export interface TfnValidationResult {
  ok: boolean;
  reason?: string;
  digits?: 8 | 9;
}

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;
const ACN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const TFN_WEIGHTS = [1, 4, 3, 7, 5, 8, 6, 9, 10] as const;
const TFN_PAYER_CODES = new Set(["000000000", "111111111", "333333333", "444444444"]);

function digitsOnly(value: string): string {
  return value.replaceAll(/\D/g, "");
}

export function validateAbn(value: string): ValidationResult {
  const normalized = digitsOnly(value);
  if (!/^\d{11}$/.test(normalized)) return { ok: false, normalized: null, reason: "ABN must contain 11 digits." };
  const digits = normalized.split("").map(Number);
  digits[0] = (digits[0] ?? 0) - 1;
  const total = digits.reduce((sum, digit, index) => sum + digit * ABN_WEIGHTS[index]!, 0);
  return total % 89 === 0 ? { ok: true, normalized } : { ok: false, normalized: null, reason: "ABN checksum failed." };
}

export function formatAbn(value: string): string {
  const normalized = digitsOnly(value);
  if (!/^\d{11}$/.test(normalized)) throw new RangeError(`ABN must contain 11 digits, got ${value}`);
  return `${normalized.slice(0, 2)} ${normalized.slice(2, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8, 11)}`;
}

export function validateAcn(value: string): ValidationResult {
  const normalized = digitsOnly(value);
  if (!/^\d{9}$/.test(normalized)) return { ok: false, normalized: null, reason: "ACN must contain 9 digits." };
  const digits = normalized.split("").map(Number);
  const sum = ACN_WEIGHTS.reduce((acc, weight, index) => acc + digits[index]! * weight, 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === digits[8] ? { ok: true, normalized } : { ok: false, normalized: null, reason: "ACN checksum failed." };
}

export function formatAcn(value: string): string {
  const normalized = digitsOnly(value);
  if (!/^\d{9}$/.test(normalized)) throw new RangeError(`ACN must contain 9 digits, got ${value}`);
  return `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6, 9)}`;
}

export function deriveAcnFromCompanyAbn(value: string): string | null {
  const abn = validateAbn(value);
  if (!abn.ok || !abn.normalized) return null;
  const candidate = abn.normalized.slice(-9);
  return validateAcn(candidate).ok ? candidate : null;
}

export function validateTfn(value: string): TfnValidationResult {
  const normalized = digitsOnly(value);
  if (!/^\d{8,9}$/.test(normalized)) return { ok: false, reason: "TFN must contain 8 or 9 digits." };
  const padded = normalized.length === 8 ? `0${normalized}` : normalized;
  if (TFN_PAYER_CODES.has(padded) || /^(\d)\1{7,8}$/.test(padded)) {
    return { ok: false, reason: "ATO TFN declaration payer-code values are not personal TFNs." };
  }
  const digits = padded.split("").map(Number);
  const total = digits.reduce((sum, digit, index) => sum + digit * TFN_WEIGHTS[index]!, 0);
  return total % 11 === 0 ? { ok: true, digits: normalized.length as 8 | 9 } : { ok: false, reason: "TFN checksum failed." };
}

export function maskTfn(value: string): string {
  const normalized = digitsOnly(value);
  if (normalized.length === 0) return "***";
  const tail = normalized.slice(-3);
  return `${"*".repeat(Math.max(0, normalized.length - tail.length))}${tail}`;
}

export const RULES = [
  {
    id: "au-identifiers.abn.2026-10-10",
    domain: "AU_IDENTIFIERS",
    title: "ABN format and checksum",
    summary: "ABNs are 11 digits; the public ABR validation approach uses the published weighting table and a modulus-89 test after subtracting 1 from the first digit.",
    effectiveFrom: "2000-07-01",
    confidence: "VERIFIED_SECONDARY",
    sources: [
      { title: "ABN Lookup | Format of the ABN", url: "https://abr.business.gov.au/Help/AbnFormat?SearchText=51824753556", retrieved: "2026-10-10", publisher: "ABR" },
      { title: "ABN Lookup | Web services", url: "https://abr.business.gov.au/Tools/WebServices", retrieved: "2026-10-10", publisher: "ABR" },
    ],
    notes: "The ABR Help page was reachable only as a scheduled-maintenance notice on 2026-10-10, so the checksum table is treated as verified secondary rather than fully re-verified from the live ABR help text on that date.",
  },
  {
    id: "au-identifiers.acn.2026-10-10",
    domain: "AU_IDENTIFIERS",
    title: "ACN format, relationship to company ABNs, and checksum",
    summary: "ACNs are 9 digits and many company ABNs embed the ACN as their final 9 digits; the engine validates ACNs using the standard weighted check-digit method and only derives an ACN from an ABN when the derived 9 digits also pass ACN validation.",
    effectiveFrom: "2000-07-01",
    confidence: "ASSUMPTION",
    sources: [
      { title: "ABN Lookup | Web services", url: "https://abr.business.gov.au/Tools/WebServices", retrieved: "2026-10-10", publisher: "ABR" },
      { title: "ATO | Tax invoices", url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    notes: "A live ASIC checksum specification could not be re-opened from the public site in this environment on 2026-10-10. The ACN checksum implementation is therefore a platform assumption aligned to the standard market formula and checked against published specimen numbers.",
  },
  {
    id: "au-identifiers.tfn.2026-10-10",
    domain: "AU_IDENTIFIERS",
    title: "TFN privacy handling and checksum validation",
    summary: "The engine validates 8-digit and 9-digit TFNs using the standard modulus-11 weighting approach, rejects ATO payer-code placeholders, and never echoes a full TFN back to callers.",
    effectiveFrom: "2000-07-01",
    confidence: "ASSUMPTION",
    sources: [
      { title: "ATO | Tax file number and withholding declarations", url: "https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/payg-withholding/payments-you-need-to-withhold-from/payments-to-employees/tax-file-number-and-withholding-declarations", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Paper TFN declaration form for payees", url: "https://www.ato.gov.au/forms-and-instructions/tfn-declaration/paper-tfn-declaration-form-for-payees", retrieved: "2026-10-10", publisher: "ATO" },
      { title: "ATO | Lodging tax file number (TFN) declaration data online", url: "https://www.ato.gov.au/forms-and-instructions/tfn-declaration-lodging-online", retrieved: "2026-10-10", publisher: "ATO" },
    ],
    notes: "The ATO pages retrieved on 2026-10-10 clearly confirm TFN sensitivity and payer-code placeholders but do not publish a checksum specification in the fetched public material, so the checksum algorithm remains an assumption that must not be treated as authoritative identity evidence.",
  },
] as const satisfies readonly RuleEntry[];

export const NOTES = [ENGINE_DISCLAIMER_AU];
