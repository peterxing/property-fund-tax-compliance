// Small runtime guards for action payloads and persisted state (the UI is typed, but reducers and stored JSON must not be trusted).

/** Longest list the app stores or accepts anywhere. */
export const MAX_ARRAY = 20_000;
/** Longest free text the app stores anywhere (query messages, audit detail, help text). */
export const MAX_STRING = 2_000;
/** Longest name, label, subject, reference or id. */
export const MAX_NAME = 200;
/** Longest fund id (a trial balance row id is "tb-<fund id>-<account>", which has to stay within MAX_NAME). */
export const MAX_FUND_ID = 64;
/** Longest trial balance account code. */
export const MAX_ACCOUNT = 64;
/** Most accounts one trial balance import may carry (nine funds of this size still fit under MAX_ARRAY). */
export const MAX_IMPORT_ROWS = 2_000;
/** Calendar years the app accepts in a date. */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2199;

export function isSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/** Amounts in cents that may not be negative. */
export function isAmount(value: unknown): value is number {
  return isSafeInt(value) && value >= 0;
}

/** A real calendar date written YYYY-MM-DD, in MIN_YEAR..MAX_YEAR. */
export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < MIN_YEAR || y > MAX_YEAR) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** A wall-clock stamp YYYY-MM-DDTHH:mm:ss with a real date and time. */
export function isLocalDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return false;
  return isISODate(value.slice(0, 10)) && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60;
}