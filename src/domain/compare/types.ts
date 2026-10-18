import type { Cents, CsvModel, FundId } from "../types.ts";
import type { CompareLine, CompareSource } from "../providers.ts";

export type TheirColumn = "reference" | "label" | "amount";

export interface TheirLine {
  index: number;
  reference?: string;
  label: string;
  amount: Cents;
  raw: string[];
}

export interface SkippedRow {
  index: number;
  reason: string;
  raw: string[];
}

export interface ParsedTheirFile {
  delimiter: "," | "\t";
  columns: string[];
  detected: { reference: number | null; label: number; amount: number };
  lines: TheirLine[];
  skipped: SkippedRow[];
  rowCount: number;
}

export interface ParseOptions {
  referenceColumn?: number | null;
  labelColumn?: number;
  amountColumn?: number;
}

export type CompareStatus = "match" | "within-tolerance" | "differs" | "only-in-theirs" | "only-in-ours";

export interface CompareOptions {
  tolerance?: Cents;
  /** Keyed by `their.reference` when present, otherwise by `their.label`; value is one of our CompareLine refs. */
  remaps?: Record<string, string>;
}

export interface ComparedLine {
  id: string;
  status: CompareStatus;
  theirs?: TheirLine;
  ours?: CompareLine;
  difference: Cents | null;
  hint: string;
  score?: number;
}

export interface ComparisonResult {
  rows: ComparedLine[];
  counts: Record<CompareStatus, number>;
  comparable: number;
  matched: number;
  largestDifference: ComparedLine | null;
  headline: string;
  csv: CsvModel;
}

export interface QueryDraftFromComparison {
  subject: string;
  message: string;
}

export type { CompareLine, CompareSource, FundId };
