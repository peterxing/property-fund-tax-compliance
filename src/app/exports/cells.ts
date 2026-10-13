// Cell rules shared by the CSV and XLSX writers so both files treat the same value the same way. Pure: no DOM, no Node APIs.

/**
 * Spreadsheet formula-injection guard (OWASP "CSV Injection"). Excel, Sheets and LibreOffice evaluate a text cell that starts with
 * "=", "+", "-", "@", TAB or CR as a formula, so such a *string* cell gets a leading single quote, which spreadsheets read as "this
 * is text". Only strings are guarded: amounts are number-typed, so a negative amount stays a valid number, and the typographic minus
 * (U+2212) our money formatter prints is not a formula character. An .xlsx inline string is never evaluated, but the same rule is
 * applied there so a CSV and an XLSX export of the same table show the same text.
 */
export function guardFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/**
 * A number as plain decimal text: "." decimal point, no grouping, never an exponent (String() switches to "1e+21" / "1e-7").
 * NaN and +/-Infinity cannot be written to a CSV cell, so they give "" (an empty cell).
 */
export function plainNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  const s = String(n);
  const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(s);
  if (!m) return s;
  const digits = m[2] + (m[3] ?? "");
  const point = 1 + Number(m[4]); // position of the decimal point within `digits`
  let body: string;
  if (point <= 0) body = `0.${"0".repeat(-point)}${digits}`;
  else if (point >= digits.length) body = digits + "0".repeat(point - digits.length);
  else body = `${digits.slice(0, point)}.${digits.slice(point)}`;
  return m[1] + body;
}
