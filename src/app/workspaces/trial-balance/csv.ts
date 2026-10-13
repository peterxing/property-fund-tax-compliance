// Reads a trial balance from CSV text for the import dialog. Pure (no React, DOM or Node APIs): text in, rows and issues out.
// The text is only ever parsed as data. Nothing in it is evaluated, rendered as markup or sent anywhere.
import { UNMAPPED_CATEGORY } from "../../../domain/types.ts";
import type { Cents, TbCategoryDef, TbCategoryId } from "../../../domain/types.ts";
import { integer } from "../../../domain/format.ts";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 1024 * 1024;
export const MAX_ACCOUNT_CHARS = 30;
export const MAX_NAME_CHARS = 120;
/** Only this many errors (and warnings) are listed; the counts always cover all of them. */
export const MAX_LISTED_ISSUES = 50;
/** The header the import expects, as it reads in a sentence. */
export const HEADER_HELP = "account, name, current and prior (category is optional)";

export type Delimiter = "," | ";" | "\t";

/** The shape the `import-tb` action takes. */
export interface ImportRow {
  account: string;
  name: string;
  category?: TbCategoryId;
  current: Cents;
  prior: Cents;
}

/** `line` is the physical line in the file (the header is line 1), or null for a problem with the whole file. */
export interface CsvIssue {
  line: number | null;
  message: string;
}

export interface TbCsvResult {
  /** No whole-file problem, no row errors, and at least one account. Only then may the rows be imported. */
  ok: boolean;
  /** The accounts that read cleanly, in file order (all of them when `ok`). */
  rows: ImportRow[];
  /** Set when nothing could be read at all (binary, a web page, too big, empty, no usable header). */
  fatal: string | null;
  errors: CsvIssue[];
  errorCount: number;
  warnings: CsvIssue[];
  warningCount: number;
  /** Header cells that were recognised, as account / name / current / prior / category, in file order. */
  columns: string[];
  /** Header cells that were not recognised (and so were ignored), as written in the file. */
  ignoredColumns: string[];
  delimiter: Delimiter;
}

const NOT_TEXT = "This file isn't a CSV text file. Export the trial balance as CSV (UTF-8) and choose that file.";
const LOOKS_LIKE_WEB_PAGE = "This looks like a web page or XML, not a CSV file. Export the trial balance as CSV and choose that file.";
const EMPTY_FILE = "The file is empty.";
const NO_ACCOUNTS = "The file has a header row but no accounts.";

type Field = "account" | "name" | "current" | "prior" | "category";

// Header names are compared lower case with every run of punctuation and spaces read as one space.
const HEADER_ALIASES = new Map<string, Field>([
  ["account", "account"],
  ["account code", "account"],
  ["account number", "account"],
  ["account no", "account"],
  ["acct", "account"],
  ["code", "account"],
  ["gl account", "account"],
  ["gl code", "account"],
  ["name", "name"],
  ["account name", "name"],
  ["description", "name"],
  ["account description", "name"],
  ["current", "current"],
  ["current year", "current"],
  ["current period", "current"],
  ["this year", "current"],
  ["current balance", "current"],
  ["cy", "current"],
  ["prior", "prior"],
  ["prior year", "prior"],
  ["prior period", "prior"],
  ["last year", "prior"],
  ["prior balance", "prior"],
  ["previous", "prior"],
  ["previous year", "prior"],
  ["py", "prior"],
  ["comparative", "prior"],
  ["category", "category"],
  ["tax category", "category"],
  ["tax mapping", "category"],
  ["mapping", "category"],
]);

const normaliseHeader = (cell: string): string => cell.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();
const shorten = (text: string, max = 40): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// ------------------------------------------------------------------------------------------------------------------- amounts
export type AmountResult = { ok: true; cents: Cents } | { ok: false; reason: "empty" | "format" | "decimals" | "large" };

// Brackets or a minus mean a credit. A currency marker is allowed, thousands separators must be proper groups of three, and at most
// two decimals are read: "1,23" or "1.234,56" are refused rather than guessed at.
const AMOUNT_SHAPE = /^(\()?\s*(-)?\s*(?:A\$|S\$|AUD|SGD|\$)?\s*(-)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(\))?$/i;

/** One amount cell -> integer cents: "1,234.56", "(1,234.56)", "-1234", "A$1,200", "−1,200" (typographic minus). Debits positive, credits negative. */
export function parseAmountCell(text: string): AmountResult {
  const raw = text.replace(/[\u2212\u2013]/g, "-").trim();
  if (raw === "") return { ok: false, reason: "empty" };
  if (raw.length > 40) return { ok: false, reason: "format" };
  const match = AMOUNT_SHAPE.exec(raw);
  if (!match) return { ok: false, reason: "format" };
  const [, open, signBefore, signAfter, whole = "", fraction = "", close] = match;
  if (Boolean(open) !== Boolean(close)) return { ok: false, reason: "format" };
  if ((open && (signBefore || signAfter)) || (signBefore && signAfter)) return { ok: false, reason: "format" };
  if (fraction.length > 2) return { ok: false, reason: "decimals" };
  const cents = Number(whole.replaceAll(",", "")) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents)) return { ok: false, reason: "large" };
  const credit = Boolean(open || signBefore || signAfter);
  return { ok: true, cents: credit && cents !== 0 ? -cents : cents };
}

// ------------------------------------------------------------------------------------------------------------------- whole-file checks
const BLOCKED_EXTENSION = /\.(xlsx?|xlsm|xlsb|ods|numbers|pdf|zip|gz|docx?|pptx?|png|jpe?g|gif|webp|bmp|exe|dll|html?|xml|json)$/i;

/** "3.4 MB"; always rounded up, so a size over the limit never reads as "1 MB". */
function megabytes(bytes: number): string {
  return `${Number((Math.ceil((bytes / MAX_IMPORT_BYTES) * 100) / 100).toFixed(2))} MB`;
}

/** Quick checks on a chosen file before it is read: size and an obviously non-CSV extension. Null when the file may be read. */
export function checkImportFile(file: { name: string; size: number }): string | null {
  if (file.size === 0) return EMPTY_FILE;
  if (file.size > MAX_IMPORT_BYTES) return `The file is ${megabytes(file.size)}. The limit is 1 MB.`;
  const extension = BLOCKED_EXTENSION.exec(file.name);
  if (extension) return `That is a .${extension[1]?.toLowerCase()} file, not a CSV file. Export the trial balance as CSV and choose that file.`;
  return null;
}

function utf8Length(text: string): number {
  // A UTF-16 unit takes at most three bytes, so a short text needs no encoding to be known to fit.
  return text.length * 3 <= MAX_IMPORT_BYTES ? text.length : new TextEncoder().encode(text).length;
}

/** What is wrong with the text as a whole (not text, a web page, too big), or null when it may be read as CSV. */
export function contentProblem(text: string): string | null {
  const bytes = utf8Length(text);
  if (bytes > MAX_IMPORT_BYTES) return `The text is ${megabytes(bytes)}. The limit is 1 MB.`;
  const head = text.slice(0, 8192);
  if (text.includes("\u0000") || /[\u0001-\u0008\u000b\u000c\u000e-\u001f]/.test(head)) return NOT_TEXT;
  if ((head.match(/\ufffd/g)?.length ?? 0) > 2 || head.startsWith("%PDF")) return NOT_TEXT;
  if (/^\s*(?:<!doctype\b|<html\b|<head\b|<body\b|<\?xml|<table\b|<!--|<script\b|<svg\b|<div\b)/i.test(head) || /<html\b/i.test(head)) {
    return LOOKS_LIKE_WEB_PAGE;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------------------------- tokenising
interface RawRecord {
  line: number;
  cells: string[];
}

/** The delimiter used by the first non-blank line, counted outside quotes. Commas win ties. */
function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  let started = false;
  for (const ch of text) {
    if (ch === '"') {
      quoted = !quoted;
      started = true;
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (started) break;
    } else if (!quoted && (ch === "," || ch === ";" || ch === "\t")) {
      counts[ch]++;
      started = true;
    } else if (ch.trim() !== "") {
      started = true;
    }
  }
  if (counts[","] >= counts["\t"] && counts[","] >= counts[";"]) return ",";
  return counts["\t"] >= counts[";"] ? "\t" : ";";
}

/** RFC 4180 records: quoted fields with doubled quotes and line breaks inside, CRLF / LF / CR line ends. Blank records are dropped. */
function readRecords(text: string, delimiter: Delimiter): { records: RawRecord[]; unclosedLine: number | null } {
  const records: RawRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let quoteLine = 1;

  const endRecord = (): void => {
    cells.push(cell);
    if (cells.some((c) => c.trim() !== "")) records.push({ line: recordLine, cells });
    cells = [];
    cell = "";
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (ch === "\n" || (ch === "\r" && text[i + 1] !== "\n")) line++;
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === "") {
      cell = "";
      quoted = true;
      quoteLine = line;
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += ch;
    }
  }
  if (quoted) return { records, unclosedLine: quoteLine };
  if (cell !== "" || cells.length > 0) endRecord();
  return { records, unclosedLine: null };
}

// ------------------------------------------------------------------------------------------------------------------- parsing
function failure(fatal: string, delimiter: Delimiter = ","): TbCsvResult {
  return {
    ok: false,
    rows: [],
    fatal,
    errors: [{ line: null, message: fatal }],
    errorCount: 1,
    warnings: [],
    warningCount: 0,
    columns: [],
    ignoredColumns: [],
    delimiter,
  };
}

function categoryLookup(categories: readonly TbCategoryDef[]): Map<string, TbCategoryId> {
  const lookup = new Map<string, TbCategoryId>();
  for (const def of categories) {
    lookup.set(def.id.toLowerCase(), def.id);
    const label = collapse(def.label).toLowerCase();
    if (!lookup.has(label)) lookup.set(label, def.id);
  }
  // A market's own list may leave the "unmapped" entry out, but a file made by this app still names it.
  lookup.set(UNMAPPED_CATEGORY, UNMAPPED_CATEGORY);
  lookup.set("needs a tax category", UNMAPPED_CATEGORY);
  return lookup;
}

const AMOUNT_HELP = "Use digits with an optional decimal point, such as 1,234.56. Write a credit with a minus sign or in brackets.";

function amountProblem(label: string, cell: string, reason: "empty" | "format" | "decimals" | "large"): string {
  const shown = `"${shorten(cell)}"`;
  if (reason === "empty") return `The ${label} amount is empty. Enter 0 if the account has no balance.`;
  if (reason === "decimals") return `The ${label} amount ${shown} has more than two decimal places.`;
  if (reason === "large") return `The ${label} amount ${shown} is too large.`;
  return `The ${label} amount ${shown} is not a valid amount. ${AMOUNT_HELP}`;
}

/**
 * Parses a trial balance CSV (or tab / semicolon separated text pasted from a spreadsheet).
 *
 * The first row names the columns: account, name, current, prior and, optionally, category (other columns are ignored, so a file made by
 * "Download CSV" reads back). A category is matched by id or by label against `categories`. An empty or unknown one gives the row no
 * category (so the account stays unmapped, or keeps the category it has now; an unknown one also raises a warning), while "unmapped" or
 * "Needs a tax category" says so explicitly and comes back as the id "unmapped". Any row error makes the result not `ok`, because an
 * import replaces the whole trial balance.
 */
export function parseTbCsv(input: string, categories: readonly TbCategoryDef[]): TbCsvResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const problem = contentProblem(text);
  if (problem !== null) return failure(problem);
  if (text.trim() === "") return failure(EMPTY_FILE);

  const delimiter = detectDelimiter(text);
  const { records, unclosedLine } = readRecords(text, delimiter);
  const header = records[0];
  if (header === undefined) return failure(unclosedLine !== null ? `The quote opened on line ${unclosedLine} is never closed.` : EMPTY_FILE, delimiter);

  // ---- header
  const index: Partial<Record<Field, number>> = {};
  const columns: string[] = [];
  const ignoredColumns: string[] = [];
  const repeated: string[] = [];
  header.cells.forEach((cell, position) => {
    const shown = cell.trim();
    if (shown === "") return;
    const field = HEADER_ALIASES.get(normaliseHeader(shown));
    if (field === undefined) ignoredColumns.push(shown);
    else if (index[field] !== undefined) repeated.push(field);
    else {
      index[field] = position;
      columns.push(field);
    }
  });
  const missing = (["account", "current", "prior"] as const).filter((field) => index[field] === undefined);
  if (missing.length > 0) {
    const found = header.cells.map((c) => c.trim()).filter(Boolean).join(", ");
    const names = missing.length === 1 ? missing.join("") : `${missing.slice(0, -1).join(", ")} or ${missing[missing.length - 1]}`;
    return failure(
      `The first row must name the columns ${HEADER_HELP}. It has no ${names} column${missing.length > 1 ? "s" : ""}${found ? ` (found: ${shorten(found, 80)})` : ""}.`,
      delimiter,
    );
  }
  if (repeated.length > 0) return failure(`The ${[...new Set(repeated)].join(" and ")} column appears more than once in the first row.`, delimiter);

  const dataRecords = records.slice(1);
  if (dataRecords.length > MAX_IMPORT_ROWS) {
    return failure(`The file has ${integer(dataRecords.length)} accounts. The limit is ${integer(MAX_IMPORT_ROWS)}.`, delimiter);
  }

  const errors: CsvIssue[] = [];
  const warnings: CsvIssue[] = [];
  let errorCount = 0;
  let warningCount = 0;
  const addError = (line: number | null, message: string): void => {
    errorCount++;
    if (errors.length < MAX_LISTED_ISSUES) errors.push({ line, message });
  };
  const addWarning = (line: number | null, message: string): void => {
    warningCount++;
    if (warnings.length < MAX_LISTED_ISSUES) warnings.push({ line, message });
  };
  if (unclosedLine !== null) addError(unclosedLine, "A quote opened here is never closed, so the rest of the file could not be read.");
  if (dataRecords.length === 0 && unclosedLine === null) return { ...failure(NO_ACCOUNTS, delimiter), columns, ignoredColumns };
  if (index.name === undefined) addWarning(null, "There is no name column, so the account codes are used as the account names.");

  // ---- rows
  const lookup = categoryLookup(categories);
  const width = header.cells.length;
  const firstLine = new Map<string, number>();
  const rows: ImportRow[] = [];

  for (const record of dataRecords) {
    const { line } = record;
    let last = record.cells.length;
    while (last > width && (record.cells[last - 1] as string).trim() === "") last--;
    if (last > width) {
      addError(line, `This row has ${last} values but the header has ${width}. Put any value that contains a comma in quotes.`);
      continue;
    }
    const cell = (field: Field): string => {
      const position = index[field];
      return position === undefined ? "" : (record.cells[position] ?? "");
    };

    let valid = true;
    const account = collapse(cell("account"));
    if (account === "") {
      addError(line, "The account code is empty.");
      valid = false;
    } else if (account.length > MAX_ACCOUNT_CHARS) {
      addError(line, `The account code is longer than ${MAX_ACCOUNT_CHARS} characters.`);
      valid = false;
    } else if (firstLine.has(account)) {
      addError(line, `Account ${account} is already on line ${firstLine.get(account)}. Each account can appear once.`);
      valid = false;
    } else {
      firstLine.set(account, line);
    }

    const name = collapse(cell("name"));
    if (name.length > MAX_NAME_CHARS) {
      addError(line, `The account name is longer than ${MAX_NAME_CHARS} characters.`);
      valid = false;
    }

    const amounts: Record<"current" | "prior", Cents> = { current: 0, prior: 0 };
    for (const field of ["current", "prior"] as const) {
      const result = parseAmountCell(cell(field));
      if (result.ok) {
        amounts[field] = result.cents;
      } else {
        addError(line, amountProblem(field, collapse(cell(field)), result.reason));
        valid = false;
      }
    }

    let category: TbCategoryId | undefined;
    const categoryText = collapse(cell("category"));
    if (categoryText !== "") {
      const matched = lookup.get(categoryText.toLowerCase());
      if (matched === undefined) addWarning(line, `The tax category "${shorten(categoryText)}" is not one of this fund's categories and was ignored.`);
      else category = matched;
    }

    if (valid) {
      const row: ImportRow = { account, name: name === "" ? account : name, current: amounts.current, prior: amounts.prior };
      if (category !== undefined) row.category = category;
      rows.push(row);
    }
  }

  return { ok: errorCount === 0 && rows.length > 0, rows, fatal: null, errors, errorCount, warnings, warningCount, columns, ignoredColumns, delimiter };
}
