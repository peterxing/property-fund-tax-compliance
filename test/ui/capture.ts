// The reference capture, read the way a person reads a screen: every amount, figure, percentage, date and heading on a page.
//   tokensOf(text)             what the capture's text says (block lines, tab-separated table cells)
//   has(haystack, kind, token) whether the text our app renders says it too; haystack = searchable(page text)
// Both sides go through `searchable` first, so spacing, the minus sign, "A$ 1" against "A$1", curly quotes and letter case do not matter
// (the capture's text is CSS upper case where ours is not: jsdom has no CSS).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FUNDS } from "./personas.ts";

export const KINDS = ["amount", "figure", "percent", "date", "label"] as const;
export type Kind = (typeof KINDS)[number];
export type PageTokens = Record<Kind, string[]>;

export const FUND_PAGES = ["Distributions", "Trial balance", "Tax returns", "Investor reporting", "Cost base & CGT"] as const;
export const PORTFOLIO_PAGES = ["Bulk review", "Analytics", "Access"] as const;

/** One market's expected strings: `pages[fundId or "portfolio"][page]`. */
export interface CaptureFixture {
  source: string;
  pages: Record<string, Record<string, PageTokens>>;
}

// ---------------------------------------------------------------------------------------------------------------- reading the capture
const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
// "−A$530,410", "A$16.97m", "A$212.3k". The capture's inline spans run together ("A$2,760,4500.8655 c/unit"): the thousands groups stop the
// amount where the next number starts.
const AMOUNT = /[-\u2212]?[AS]\$\d+(?:,\d{3})*(?:\.\d+)?(?:[mkb](?![a-z]))?/g;
const DATE = new RegExp(`\\b(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) )?\\d{1,2} (?:${MONTHS}) \\d{4}\\b`, "gi");
const PERCENT = /(?<![\d.])[-\u2212]?\d+(?:\.\d+)?%/g;
const GROUPED = /(?<![\d.,$])\d{1,3}(?:,\d{3})+(?![\d]|,\d)/g;
const DECIMAL = /(?<![\d.,])\d+\.\d{4,6}(?!\d)/g;
const MASK = "\u0001";

const empty = (): Record<Kind, Map<string, string>> => ({ amount: new Map(), figure: new Map(), percent: new Map(), date: new Map(), label: new Map() });

const canonicalDate = (date: string): string =>
  date
    .split(" ")
    .map((word) => (/^\d/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");

function trimEdges(piece: string): string {
  let text = piece.replace(/^[\s·—–:,;/-]+|[\s·—–:,;/-]+$/g, "");
  if (text.startsWith(")")) text = text.slice(1).trimStart();
  if (text.endsWith("(")) text = text.slice(0, -1).trimEnd();
  return text;
}

function scanCell(cell: string, found: Record<Kind, Map<string, string>>): void {
  const add = (kind: Kind, token: string): void => {
    const key = searchable(token);
    if (!found[kind].has(key)) found[kind].set(key, token);
  };
  let rest = cell.replace(AMOUNT, (match, offset: number, whole: string) => {
    // "A$1,656,270 excess", "A$4,816,860 shortfall": the word carries the sign, so the amount may be written with either.
    const loose = /^\s*(?:excess|shortfall)\b/i.test(whole.slice(offset + match.length));
    add("amount", loose ? `~${match.replace(/^[-\u2212]/, "")}` : match);
    return MASK;
  });
  rest = rest.replace(DATE, (match) => (add("date", canonicalDate(match)), MASK));
  rest = rest.replace(PERCENT, (match) => (add("percent", match), MASK));
  rest = rest.replace(GROUPED, (match) => (add("figure", match), MASK));
  rest = rest.replace(DECIMAL, (match) => (add("figure", match), MASK));

  const pieces = rest.split(MASK);
  for (const piece of pieces) {
    const label = trimEdges(piece);
    const words = label.split(" ").length;
    if ((label.match(/[A-Za-z]/g) ?? []).length < 3 || label.length > 100) continue;
    // Spans glued together by the capture ("IndustrialPartners", "Morenoworking"): not text anyone reads.
    if (/[a-z][A-Z]/.test(label)) continue;
    // A word left beside a number ("excess", "Paid", "c/unit") says nothing on its own.
    if (pieces.length > 1 && words < 2) continue;
    add("label", label);
  }
}

/** The amounts, figures, percentages, dates and headings in the capture's text of one page, each once, in the order they appear. */
export function tokensOf(captured: string): PageTokens {
  const found = empty();
  for (const line of captured.split("\n")) {
    for (const cell of line.split("\t")) {
      const text = cell.replace(/\s+/g, " ").trim();
      if (text !== "") scanCell(text, found);
    }
  }
  return Object.fromEntries(KINDS.map((kind) => [kind, Array.from(found[kind].values())])) as PageTokens;
}

// ---------------------------------------------------------------------------------------------------------------- looking tokens up
/** The text with spacing, minus signs, quotes and "A$ 1" smoothed over, ready for `has` and for comparing headings. */
export function normalise(text: string): string {
  return text
    .replace(/[\u00a0\u2007\u2009\u200a\u202f]/g, " ")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\u2212/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\b([AS]\$)\s+(?=\d)/g, "$1")
    .replace(/\s*·\s*/g, " · ")
    .replace(/\s+/g, " ")
    .trim();
}

export const searchable = (text: string): string => normalise(text).toLowerCase();

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = new Map<string, RegExp>();

function patternFor(kind: Kind, token: string): RegExp {
  const wanted = searchable(token);
  switch (kind) {
    case "amount": {
      const loose = wanted.startsWith("~");
      const unsigned = wanted.replace(/^[~-]+/, "");
      const negative = !loose && wanted.startsWith("-");
      const sign = loose ? "-?" : negative ? "-" : "(?<!-)";
      return new RegExp(`${sign}${escapeRegExp(unsigned)}(?![\\d]|,\\d|\\.\\d)`);
    }
    case "percent": {
      const negative = wanted.startsWith("-");
      return new RegExp(`${negative ? "(?<![\\d.])" : "(?<![\\d.-])"}${escapeRegExp(wanted)}`);
    }
    case "figure":
      return new RegExp(`(?<![\\d.,$])${escapeRegExp(wanted)}(?![\\d]|,\\d|\\.\\d)`);
    case "date":
      return new RegExp(`(?<!\\d)${escapeRegExp(wanted)}(?!\\d)`);
    case "label":
      return new RegExp(escapeRegExp(wanted));
  }
}

/** Whether the text (already `searchable`) says the token: amounts, figures and percentages must be the whole number, with the same sign. */
export function has(haystack: string, kind: Kind, token: string): boolean {
  const key = `${kind}|${token}`;
  let pattern = patterns.get(key);
  if (!pattern) {
    pattern = patternFor(kind, token);
    patterns.set(key, pattern);
  }
  return pattern.test(haystack);
}

// ---------------------------------------------------------------------------------------------------------------- fixtures
type CaptureJson = Record<string, Record<string, unknown>>;

/** The fixture for one market from its capture file; the capture is keyed by fund name, plus "portfolio" for the three portfolio pages. */
export function fixtureFrom(captured: CaptureJson, source: string): CaptureFixture {
  const pages: CaptureFixture["pages"] = {};
  for (const [name, content] of Object.entries(captured)) {
    const key = name === "portfolio" ? name : FUNDS.find((fund) => fund.name === name)?.id;
    if (!key) throw new Error(`The capture has a fund this repository does not know: "${name}".`);
    const wanted: readonly string[] = key === "portfolio" ? PORTFOLIO_PAGES : FUND_PAGES;
    pages[key] = {};
    for (const page of wanted) {
      const text = content[page];
      if (typeof text !== "string") throw new Error(`The capture has no "${page}" text for ${name}.`);
      pages[key][page] = tokensOf(text);
    }
  }
  return { source, pages };
}

/** The fixtures as the files hold them: one line per list, so a changed list is one changed line. */
export function stringifyFixture(fixture: CaptureFixture): string {
  const lines: string[] = ["{", `  "source": ${JSON.stringify(fixture.source)},`, '  "pages": {'];
  const keys = Object.keys(fixture.pages);
  keys.forEach((key, keyIndex) => {
    lines.push(`    ${JSON.stringify(key)}: {`);
    const pages = Object.keys(fixture.pages[key]!);
    pages.forEach((page, pageIndex) => {
      lines.push(`      ${JSON.stringify(page)}: {`);
      KINDS.forEach((kind, kindIndex) => {
        lines.push(`        ${JSON.stringify(kind)}: ${JSON.stringify(fixture.pages[key]![page]![kind])}${kindIndex < KINDS.length - 1 ? "," : ""}`);
      });
      lines.push(`      }${pageIndex < pages.length - 1 ? "," : ""}`);
    });
    lines.push(`    }${keyIndex < keys.length - 1 ? "," : ""}`);
  });
  lines.push("  }", "}", "");
  return lines.join("\n");
}

export const CAPTURE_FILES = { AU: "pfc-ref-text-au.decoded.json", SG: "pfc-ref-text-sg.decoded.json" } as const;
export const FIXTURE_FILES = { AU: "capture-au.json", SG: "capture-sg.json" } as const;

/** Both fixtures, built from the reference folder (which holds the two capture files). */
export function fixturesFromFolder(folder: string): Record<"AU" | "SG", CaptureFixture> {
  const read = (market: "AU" | "SG"): CaptureFixture =>
    fixtureFrom(JSON.parse(readFileSync(join(folder, CAPTURE_FILES[market]), "utf8")) as CaptureJson, `${CAPTURE_FILES[market]}: expected amounts, figures, percentages, dates and headings`);
  return { AU: read("AU"), SG: read("SG") };
}
