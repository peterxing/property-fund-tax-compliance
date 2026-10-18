import { money } from "../format.ts";
import type { CompareLine, CompareOptions, CompareStatus, ComparedLine, ComparisonResult, QueryDraftFromComparison, TheirLine } from "./types.ts";

const STATUS_LABEL: Record<CompareStatus, string> = {
  match: "Match",
  "within-tolerance": "Within tolerance",
  differs: "Differs",
  "only-in-theirs": "Only in theirs",
  "only-in-ours": "Only in ours",
};

const COMMON = new Set(["the", "and", "for", "from", "with", "total", "amount", "figure", "line", "tax", "distribution", "component", "current", "year"]);
const SIMILARITY_THRESHOLD = 0.58;

export function normaliseReference(value: string): string {
  let ref = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  ref = ref.replace(/^(?:AUBAS|BAS|AUIAS|SGS45G|S45G)/, "");
  return ref;
}

export function normaliseLabel(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1 && !COMMON.has(token));
}

/** Similarity is the Jaccard overlap of normalised meaningful-word tokens, with a small character-overlap fallback for short labels. */
export function labelSimilarity(a: string, b: string): number {
  const left = new Set(normaliseLabel(a));
  const right = new Set(normaliseLabel(b));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  const union = new Set([...left, ...right]).size;
  const tokenScore = intersection / union;
  const charsA = new Set([...a.toLowerCase().replace(/[^a-z0-9]/g, "")]);
  const charsB = new Set([...b.toLowerCase().replace(/[^a-z0-9]/g, "")]);
  let charIntersection = 0;
  for (const ch of charsA) if (charsB.has(ch)) charIntersection++;
  const charScore = charsA.size && charsB.size ? (2 * charIntersection) / (charsA.size + charsB.size) : 0;
  return Math.max(tokenScore, Math.min(charScore, tokenScore + 0.15));
}

function theirKey(line: TheirLine): string {
  return line.reference ?? line.label;
}

function statusFor(difference: number, tolerance: number): CompareStatus {
  if (difference === 0) return "match";
  return Math.abs(difference) <= tolerance ? "within-tolerance" : "differs";
}

function hintFor(theirs: number, ours: number, difference: number): string {
  if (theirs !== 0 && theirs === -ours) return "Sign convention?";
  if (Math.abs(difference) > 0 && Math.abs(difference) < 100 && (theirs % 100 === 0 || ours % 100 === 0)) return "Rounding to whole dollars?";
  return "";
}

function rowId(theirs?: TheirLine, ours?: CompareLine): string {
  return `${theirs ? `t${theirs.index}` : "t-"}|${ours?.ref ?? "o-"}`;
}

function compareRow(theirs: TheirLine, ours: CompareLine, tolerance: number, score?: number): ComparedLine {
  const difference = ours.amount - theirs.amount;
  return { id: rowId(theirs, ours), status: statusFor(difference, tolerance), theirs, ours, difference, hint: hintFor(theirs.amount, ours.amount, difference), score };
}

function formatDifference(row: ComparedLine, currency: "AUD" | "SGD"): string {
  return row.difference === null ? "" : money(row.difference, currency, 2);
}

export function comparisonCsv(fileName: string, rows: ComparedLine[], currency: "AUD" | "SGD") {
  return {
    fileName,
    columns: ["status", "their_reference", "their_label", "their_amount", "our_reference", "our_label", "our_amount", "difference", "hint", "our_basis_note"],
    rows: rows.map((row) => [
      STATUS_LABEL[row.status],
      row.theirs?.reference ?? "",
      row.theirs?.label ?? "",
      row.theirs ? (row.theirs.amount / 100).toFixed(2) : "",
      row.ours?.ref ?? "",
      row.ours?.label ?? "",
      row.ours ? (row.ours.amount / 100).toFixed(2) : "",
      row.difference === null ? "" : (row.difference / 100).toFixed(2),
      row.hint,
      row.ours?.note ?? "",
    ]),
  };
}

export function sourceCsv(fileName: string, rows: CompareLine[]) {
  return {
    fileName,
    columns: ["reference", "label", "amount"],
    rows: rows.map((line) => [line.ref, line.label, (line.amount / 100).toFixed(2)]),
  };
}

export function compareLines(ours: readonly CompareLine[], theirs: readonly TheirLine[], options: CompareOptions = {}, currency: "AUD" | "SGD" = "AUD"): ComparisonResult {
  const tolerance = options.tolerance ?? 0;
  const unusedOurs = new Set(ours);
  const unusedTheirs = new Set(theirs);
  const rows: ComparedLine[] = [];
  const byRef = new Map<string, CompareLine[]>();
  for (const line of ours) {
    const key = normaliseReference(line.ref);
    byRef.set(key, [...(byRef.get(key) ?? []), line]);
  }
  const byRawRef = new Map(ours.map((line) => [line.ref, line]));

  for (const their of theirs) {
    const mapped = options.remaps?.[theirKey(their)];
    const our = mapped ? byRawRef.get(mapped) : undefined;
    if (our && unusedOurs.has(our)) {
      rows.push(compareRow(their, our, tolerance, 1));
      unusedTheirs.delete(their);
      unusedOurs.delete(our);
    }
  }

  for (const their of [...unusedTheirs]) {
    if (!their.reference) continue;
    const oursByRef = byRef.get(normaliseReference(their.reference))?.find((line) => unusedOurs.has(line));
    if (!oursByRef) continue;
    rows.push(compareRow(their, oursByRef, tolerance, 1));
    unusedTheirs.delete(their);
    unusedOurs.delete(oursByRef);
  }

  for (const their of [...unusedTheirs]) {
    let best: { line: CompareLine; score: number } | null = null;
    for (const our of unusedOurs) {
      const score = labelSimilarity(their.label, our.label);
      if (!best || score > best.score) best = { line: our, score };
    }
    if (!best || best.score < SIMILARITY_THRESHOLD) continue;
    rows.push(compareRow(their, best.line, tolerance, best.score));
    unusedTheirs.delete(their);
    unusedOurs.delete(best.line);
  }

  for (const their of unusedTheirs) rows.push({ id: rowId(their), status: "only-in-theirs", theirs: their, difference: null, hint: "Not in our source" });
  for (const our of unusedOurs) rows.push({ id: rowId(undefined, our), status: "only-in-ours", ours: our, difference: null, hint: "Not in their file" });

  const counts: ComparisonResult["counts"] = { match: 0, "within-tolerance": 0, differs: 0, "only-in-theirs": 0, "only-in-ours": 0 };
  for (const row of rows) counts[row.status]++;
  const comparable = counts.match + counts["within-tolerance"] + counts.differs;
  const matched = counts.match + counts["within-tolerance"];
  const largestDifference = rows
    .filter((row) => row.difference !== null && row.status === "differs")
    .sort((a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0))[0] ?? null;
  const headline = largestDifference
    ? `${matched} of ${comparable} comparable lines match; largest difference ${formatDifference(largestDifference, currency)} on ${largestDifference.ours?.label ?? largestDifference.theirs?.label ?? "a line"}.`
    : `${matched} of ${comparable} comparable lines match; no differences outside tolerance.`;
  return { rows, counts, comparable, matched, largestDifference, headline, csv: comparisonCsv("comparison.csv", rows, currency) };
}

export function queryFromComparison(fundName: string, sourceLabel: string, comparison: ComparisonResult, currency: "AUD" | "SGD"): QueryDraftFromComparison {
  const diffs = comparison.rows.filter((row) => row.status === "differs").slice(0, 5);
  const detail = diffs.length
    ? diffs.map((row) => `- ${row.ours?.label ?? row.theirs?.label}: ${formatDifference(row, currency)}${row.hint ? ` (${row.hint})` : ""}`).join("\n")
    : "- No lines differ outside tolerance.";
  return {
    subject: `Compare query — ${sourceLabel}`,
    message: `${comparison.headline}\n\nFund: ${fundName}\nSource: ${sourceLabel}\n\nDifferences to review:\n${detail}`,
  };
}
