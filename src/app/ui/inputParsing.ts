// Pure parse / format helpers behind MoneyInput and NumberInput (no React, so Node tests can import them).
import type { Cents, Currency } from "../../domain/types.ts";
import { groupDigits, money, parseMoneyInput } from "../../domain/format.ts";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

// U+2212 minus, en dash and em dash all read as a minus sign.
const MINUS_LIKE = /[\u2212\u2013\u2014]/g;

export interface MoneyDraftOptions {
  currency: Currency;
  /** An empty box means "no value" (null) instead of an error. */
  allowEmpty?: boolean;
  min?: Cents;
  max?: Cents;
}

/** The domain parser answers null for everything it rejects, including amounts beyond 2^53 cents; this tells those apart from a typo. */
function beyondExactRange(draft: string): boolean {
  return !Number.isSafeInteger(Math.round(Number(draft.replace(/[^\d.]/g, "")) * 100));
}

/** "1,250,000" / "A$1,250,000.50" / "-1,200" / "(1,200)" -> cents. Letters inside the number ("1e5") are rejected, unlike the permissive domain parser. */
export function parseMoneyDraft(text: string, options: MoneyDraftOptions): ParseResult<Cents | null> {
  const raw = text.replace(MINUS_LIKE, "-").trim();
  if (raw === "") return options.allowEmpty ? { ok: true, value: null } : fail("Enter an amount, for example 1,250,000.");

  // Drop one leading currency marker (A$ S$ AUD SGD $), whether before or after a minus sign or opening bracket.
  const stripped = raw.replace(/^(\(?\s*-?\s*)(?:A\$|S\$|AUD|SGD|\$)\s*/i, "$1");
  if (!/^\(?\s*-?\s*[\d,\s]*\.?\d*\s*\)?$/.test(stripped) || !/\d/.test(stripped)) {
    return fail("Use digits only, for example 1,250,000 or 1,250,000.50.");
  }
  if (/\.\d{3,}/.test(stripped)) return fail("Use at most two decimal places.");

  // The domain parser wants digits on both sides of a point; people type ".5" and "12." (the state a box is often left in).
  const tidy = stripped.replace(/^([^\d.]*)\./, "$10.").replace(/\.(?=\s*\)?\s*$)/, "");
  const cents = parseMoneyInput(tidy);
  if (cents === null || !Number.isSafeInteger(cents)) {
    return fail(beyondExactRange(tidy) ? "That amount is too large." : "Use digits only, for example 1,250,000 or 1,250,000.50.");
  }
  if (options.min !== undefined && cents < options.min) {
    return fail(options.min === 0 ? "Enter zero or a positive amount." : `Enter ${money(options.min, options.currency, 2)} or more.`);
  }
  if (options.max !== undefined && cents > options.max) return fail(`Enter ${money(options.max, options.currency, 2)} or less.`);
  return { ok: true, value: cents };
}

/** Cents -> the text shown in an amount box: grouped digits without the currency symbol; two decimals only when needed. */
export function formatMoneyDraft(cents: Cents | null): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "";
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const body = groupDigits(String(whole)) + (fraction === 0 ? "" : `.${String(fraction).padStart(2, "0")}`);
  return negative ? `-${body}` : body;
}

export interface NumberDraftOptions {
  allowEmpty?: boolean;
  min?: number;
  max?: number;
  /** Only whole numbers (default false). */
  integer?: boolean;
  /** Most decimal places accepted when not integer (default 2). */
  decimals?: number;
}

/** "684,215,000" / "92.5" / "92.5%" -> number. Rejects letters, exponents and out-of-range values with a message that says what to do. */
export function parseNumberDraft(text: string, options: NumberDraftOptions = {}): ParseResult<number | null> {
  const raw = text.replace(MINUS_LIKE, "-").trim();
  if (raw === "") return options.allowEmpty ? { ok: true, value: null } : fail("Enter a number.");
  const cleaned = raw.replace(/[,\s]/g, "").replace(/%$/, "");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return fail("Use digits only, for example 1,250 or 92.5.");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return fail("That number is too large.");
  if (options.integer) {
    if (!Number.isInteger(value)) return fail("Enter a whole number.");
  } else {
    const places = options.decimals ?? 2;
    const fraction = cleaned.split(".")[1] ?? "";
    if (fraction.replace(/0+$/, "").length > places) return fail(places === 0 ? "Enter a whole number." : `Use at most ${places} decimal places.`);
  }
  if (options.min !== undefined && value < options.min) return fail(`Enter ${formatNumberDraft(options.min, options.decimals ?? 2)} or more.`);
  if (options.max !== undefined && value > options.max) return fail(`Enter ${formatNumberDraft(options.max, options.decimals ?? 2)} or less.`);
  return { ok: true, value };
}

/** Number -> grouped text with trailing zeros trimmed ("684,215,000", "92.5"); null -> "". */
export function formatNumberDraft(value: number | null, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole = "0", fraction = ""] = fixed.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  const body = groupDigits(whole) + (trimmed ? `.${trimmed}` : "");
  return value < 0 && body !== "0" ? `-${body}` : body;
}
