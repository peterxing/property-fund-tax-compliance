// CSV writer (RFC 4180). Pure: it returns text and never touches the DOM, so it runs under Node tests as well as in the browser.
import type { CsvModel } from "../../domain/types.ts";
import { guardFormula, plainNumber } from "./cells.ts";

const BOM = "\uFEFF"; // lets Excel open the file as UTF-8 (so "A$", "—" and accents survive)
const EOL = "\r\n";

function field(value: string | number | null | undefined): string {
  let text: string;
  if (typeof value === "number") text = plainNumber(value);
  else if (typeof value === "string") text = guardFormula(value); // formula-injection guard: strings only, see cells.ts
  else if (value === null || value === undefined) text = "";
  else text = guardFormula(String(value));
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function record(cells: ReadonlyArray<string | number | null | undefined>, width: number): string {
  const fields: string[] = [];
  for (let i = 0; i < Math.max(cells.length, width); i++) fields.push(field(cells[i]));
  // A record that is one empty field would read back as a blank line (and be skipped by most parsers), so quote it.
  return fields.length === 1 && fields[0] === "" ? '""' : fields.join(",");
}

/**
 * The CSV file as text: UTF-8 BOM, a header record, one record per row, every record (including the last) ended by CRLF.
 * Numbers are written as plain decimals; NaN, Infinity and missing cells are empty; short rows are padded to the header width.
 */
export function csvText(model: CsvModel): string {
  const width = model.columns.length;
  const records: string[] = [];
  if (width > 0) records.push(record(model.columns, width));
  for (const row of model.rows) records.push(record(row, width));
  return BOM + records.map((r) => r + EOL).join("");
}
