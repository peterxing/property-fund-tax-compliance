// Pure helpers behind the Analytics workspace's leakage, mix and deadline panels (no React, so Node tests can import them).
import { compareDates, dateLabelWithWeekday, money, pct } from "../../../domain/format.ts";
import type { DeadlineRow, DeadlineStatus, FundId, JurisdictionFilter, LeakageRow, MixRow } from "../../../domain/types.ts";
import type { StackedRow } from "../../charts/stackedBars.ts";

export interface SeriesDef<K extends string> {
  key: K;
  label: string;
  /** A design-token colour, so dark mode follows. */
  color: string;
}

export type LeakageKey = "finalWithholding" | "recoverable" | "trusteeTax";
export type MixKey = "taxable" | "capitalGains" | "taxExempt" | "taxDeferredAndCapital";

/** Leakage bars: final withholding amber, what holders can recover teal, what the trustee pays red. */
export const LEAKAGE_SERIES: readonly SeriesDef<LeakageKey>[] = [
  { key: "finalWithholding", label: "Final withholding", color: "var(--viz-withheld)" },
  { key: "recoverable", label: "Withholding holders can recover", color: "var(--viz-net)" },
  { key: "trusteeTax", label: "Tax paid by the trustee", color: "var(--viz-unallocated)" },
];

export const MIX_SERIES: readonly SeriesDef<MixKey>[] = [
  { key: "taxable", label: "Taxable income", color: "var(--viz-gross)" },
  { key: "capitalGains", label: "Capital gains", color: "var(--viz-net)" },
  { key: "taxExempt", label: "Tax-exempt", color: "var(--viz-3)" },
  { key: "taxDeferredAndCapital", label: "Tax-deferred and capital", color: "var(--viz-withheld)" },
];

export function colorsOf(series: readonly SeriesDef<string>[]): Record<string, string> {
  return Object.fromEntries(series.map((s) => [s.key, s.color]));
}

export function legendOf(series: readonly SeriesDef<string>[]): Array<{ key: string; label: string }> {
  return series.map(({ key, label }) => ({ key, label }));
}

const share = (part: number, whole: number): number => (whole > 0 && Number.isFinite(part) && Number.isFinite(whole) ? (part / whole) * 100 : 0);

/** One bar per fund; each segment is that component as a percentage of the fund's distribution (so the bar is the total leakage). */
export function leakageChartRows(rows: readonly LeakageRow[]): StackedRow[] {
  return rows.map((row) => ({
    key: row.fundId,
    label: row.fundName,
    segments: LEAKAGE_SERIES.map(({ key, label }) => ({ key, label, value: share(row[key], row.distribution) })),
  }));
}

/** One bar per fund; segments are the shares (0..100) of each tax character. */
export function mixChartRows(rows: readonly MixRow[]): StackedRow[] {
  return rows.map((row) => ({
    key: row.fundId,
    label: row.fundName,
    segments: MIX_SERIES.map(({ key, label }) => ({ key, label, value: row[key] })),
  }));
}

/** "2.7%" for a bar segment; axis ticks drop float noise ("0.5%", "3%"). */
export const formatShare = (value: number): string => pct(value, 1);
export const formatPercentTick = (value: number): string => `${Number(value.toFixed(2))}%`;

/** The chart's accessible name: the plot is an image to assistive tech, so it carries every fund's number. */
export function leakageSummary(rows: readonly LeakageRow[]): string {
  if (rows.length === 0) return "Tax leakage chart: there are no funds to compare.";
  return `Tax leakage as a percentage of each distribution. ${rows.map((row) => `${row.fundName} ${pct(row.totalPct, 1)}`).join(", ")}.`;
}

export function mixSummary(rows: readonly MixRow[]): string {
  if (rows.length === 0) return "Distribution mix chart: there are no funds to compare.";
  const fundLine = (row: MixRow): string => {
    const parts = MIX_SERIES.filter(({ key }) => row[key] > 0).map(({ key, label }) => `${label} ${pct(row[key], 1)}`);
    return `${row.fundName}: ${parts.length > 0 ? parts.join(", ") : "no distribution"}`;
  };
  return `Distribution mix by tax character, as a percentage of each distribution. ${rows.map(fundLine).join("; ")}.`;
}

// ------------------------------------------------------------------------------------------------ tables
export interface TableColumn<K extends string> {
  key: K;
  label: string;
  /** Right-aligned figures; the first column is the row header. */
  numeric: boolean;
}

export type LeakageTableRow = { fundId: FundId; fundName: string; distribution: string; finalWithholding: string; recoverable: string; trusteeTax: string; total: string };
export const LEAKAGE_COLUMNS: readonly TableColumn<Exclude<keyof LeakageTableRow, "fundId">>[] = [
  { key: "fundName", label: "Fund", numeric: false },
  { key: "distribution", label: "Distribution", numeric: true },
  { key: "finalWithholding", label: "Final withholding", numeric: true },
  { key: "recoverable", label: "Recoverable", numeric: true },
  { key: "trusteeTax", label: "Trustee tax", numeric: true },
  { key: "total", label: "Total", numeric: true },
];

/** Whole currency units in the fund's own currency ("A$2,504,486"); the total is a share of the distribution ("2.7%"). */
export function leakageTableRows(rows: readonly LeakageRow[]): LeakageTableRow[] {
  return rows.map((row) => ({
    fundId: row.fundId,
    fundName: row.fundName,
    distribution: money(row.distribution, row.currency, 0),
    finalWithholding: money(row.finalWithholding, row.currency, 0),
    recoverable: money(row.recoverable, row.currency, 0),
    trusteeTax: money(row.trusteeTax, row.currency, 0),
    total: pct(row.totalPct, 1),
  }));
}

export type MixTableRow = { fundId: FundId; fundName: string; taxable: string; capitalGains: string; taxExempt: string; taxDeferredAndCapital: string };
export const MIX_COLUMNS: readonly TableColumn<Exclude<keyof MixTableRow, "fundId">>[] = [
  { key: "fundName", label: "Fund", numeric: false },
  ...MIX_SERIES.map(({ key, label }) => ({ key, label, numeric: true })),
];

export function mixTableRows(rows: readonly MixRow[]): MixTableRow[] {
  return rows.map((row) => ({
    fundId: row.fundId,
    fundName: row.fundName,
    taxable: pct(row.taxable, 1),
    capitalGains: pct(row.capitalGains, 1),
    taxExempt: pct(row.taxExempt, 1),
    taxDeferredAndCapital: pct(row.taxDeferredAndCapital, 1),
  }));
}

// ------------------------------------------------------------------------------------------------ deadlines
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Earliest first; the same day is ordered by fund name, then obligation, so the list reads the same for every persona. */
export function sortDeadlines(rows: readonly DeadlineRow[]): DeadlineRow[] {
  return [...rows].sort((a, b) => compareDates(a.date, b.date) || compareText(a.fundName, b.fundName) || compareText(a.obligation, b.obligation));
}

/** Done rows are hidden unless asked for. */
export function visibleDeadlines(rows: readonly DeadlineRow[], showCompleted: boolean): DeadlineRow[] {
  return sortDeadlines(showCompleted ? rows : rows.filter((row) => row.status !== "done"));
}

export const completedCount = (rows: readonly DeadlineRow[]): number => rows.filter((row) => row.status === "done").length;

/** "Deadlines · 2 overdue": the count comes from the domain, which judges every deadline against the same "now". */
export function deadlinesTitle(overdueCount: number): string {
  return `Deadlines · ${overdueCount} overdue`;
}

export const DEADLINE_COLUMNS = ["Date", "Fund", "Obligation", "Status"] as const;

export const DEADLINE_STATUS_LABEL: Record<DeadlineStatus, string> = { overdue: "Overdue", open: "Open", done: "Done" };
export const DEADLINE_STATUS_TONE: Record<DeadlineStatus, "bad" | "neutral" | "good"> = { overdue: "bad", open: "neutral", done: "good" };

export const deadlineDate = (iso: string): string => dateLabelWithWeekday(iso);

/** The reference sets obligation names with a spaced em dash ("Fund payment notice — Quarter ended 30 Sep 2026"); the domain names use a hyphen. */
export const obligationLabel = (obligation: string): string => obligation.replace(/ - /g, " \u2014 ");

/** Spoken after the "Show completed" box changes, since the list changes under the user. */
export function deadlinesAnnouncement(count: number, showCompleted: boolean): string {
  const noun = count === 1 ? "deadline" : "deadlines";
  return showCompleted ? `Showing ${count} ${noun}, including completed ones.` : `Showing ${count} ${noun}, completed ones hidden.`;
}

export function deadlinesEmptyMessage(showCompleted: boolean, all: readonly DeadlineRow[]): string {
  if (all.length === 0) return "There are no deadlines for the funds you can see.";
  return showCompleted ? "There are no deadlines to show." : "Nothing is open. Tick Show completed to see the finished deadlines.";
}

// ------------------------------------------------------------------------------------------------ no funds
export interface EmptyMessage {
  title: string;
  body: string;
}

/**
 * Shown instead of the panels when the persona sees no fund. `assigned` is how many funds the persona has across both markets, so the
 * message can tell "nothing assigned" from "hidden by the jurisdiction toggle".
 */
export function analyticsEmptyMessage(userName: string, jurisdiction: JurisdictionFilter, assigned: number): EmptyMessage {
  if (assigned > 0 && jurisdiction !== "all") {
    const market = jurisdiction === "AU" ? "Australian" : "Singapore";
    return {
      title: `No ${market} funds to analyse`,
      body: `${userName} has no ${market} funds. Switch the jurisdiction to All to see the others.`,
    };
  }
  return {
    title: "No funds to analyse",
    body: `${userName} isn't assigned to any funds. A Head of Tax can change that under Access.`,
  };
}
