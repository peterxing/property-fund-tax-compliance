import { slug } from "../../../domain/format.ts";
import { compareLines, parseTheirFile, queryFromComparison, sourceCsv, type ComparisonResult, type ParseOptions, type ParsedTheirFile } from "../../../domain/compare/index.ts";
import type { CompareSource } from "../../../domain/providers.ts";
import type { Fund } from "../../../domain/types.ts";

export const MAPPINGS_KEY = "pfc.compare.mappings.v1";

export function sourceFileName(fund: Fund, source: CompareSource): string {
  return `${slug(fund.name)}-${slug(source.label)}-ours.csv`;
}

export function ourCsv(fund: Fund, source: CompareSource) {
  return sourceCsv(sourceFileName(fund, source), source.lines);
}

export function comparisonFor(fund: Fund, source: CompareSource, parsed: ParsedTheirFile | null, remaps: Record<string, string>): ComparisonResult | null {
  if (!parsed) return null;
  const result = compareLines(source.lines, parsed.lines, { tolerance: source.tolerance ?? 100, remaps }, fund.currency);
  return { ...result, csv: { ...result.csv, fileName: `${slug(fund.name)}-${slug(source.label)}-comparison.csv` } };
}

let lastParse: { text: string; options: string; value: ParsedTheirFile | null } | null = null;

export function parseText(text: string, options: ParseOptions): ParsedTheirFile | null {
  const key = JSON.stringify(options);
  if (lastParse?.text === text && lastParse.options === key) return lastParse.value;
  const value = text.trim() ? parseTheirFile(text, options) : null;
  lastParse = { text, options: key, value };
  return value;
}

export function mappingBucket(fund: Fund, source: CompareSource): string {
  return `${fund.id}|${source.id}`;
}

export function loadAllMappings(): Record<string, Record<string, string>> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MAPPINGS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Record<string, string>>) : {};
  } catch {
    return {};
  }
}

export function saveMappings(fund: Fund, source: CompareSource, mappings: Record<string, string>): void {
  const all = loadAllMappings();
  all[mappingBucket(fund, source)] = mappings;
  window.localStorage.setItem(MAPPINGS_KEY, JSON.stringify(all));
}

export function loadMappings(fund: Fund, source: CompareSource): Record<string, string> {
  return loadAllMappings()[mappingBucket(fund, source)] ?? {};
}

export function queryDraft(fund: Fund, source: CompareSource, comparison: ComparisonResult) {
  return queryFromComparison(fund.name, source.label, comparison, fund.currency);
}
