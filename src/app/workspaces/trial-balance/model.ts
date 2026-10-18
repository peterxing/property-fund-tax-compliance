// Pure helpers for the Trial balance workspace: status chips, the CSV export, change highlighting, sort modes, the book-to-tax lines,
// the "Update distribution" state and the import plan. No React or DOM, so the Node tests import this file directly.
import { UNMAPPED_CATEGORY } from "../../../domain/types.ts";
import type { BookToTaxRow, Cents, CsvModel, Currency, Market, TbCategoryDef, TbRowView, TbView } from "../../../domain/types.ts";
import { groupDigits, integer, money, slug } from "../../../domain/format.ts";
import type { ImportRow } from "./csv.ts";

export const UNMAPPED_LABEL = "Needs a tax category";
export const DEFAULT_THRESHOLD = 20;
/** Mirrors the domain: an AU ledger must balance to the cent, an SG one to within half a dollar. */
export const BALANCE_TOLERANCE: Record<Market, number> = { AU: 0, SG: 50 };

export const isBalanced = (total: Cents, market: Market): boolean => (market === "AU" ? total === 0 : Math.abs(total) < BALANCE_TOLERANCE.SG);

/** "A$19,413,660" for whole dollars (as the reference shows them), to the cent otherwise so nothing is rounded away. */
export function moneyExact(cents: Cents, currency: Currency): string {
  return money(cents, currency, cents % 100 === 0 ? 0 : 2);
}

/** A reason that reads as a sentence: "Signed off — reopen to edit" -> "Signed off — reopen to edit." */
export function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) || trimmed === "" ? trimmed : `${trimmed}.`;
}

// ------------------------------------------------------------------------------------------------------------------- status chips
export type ChipTone = "good" | "warn" | "bad";
export interface StatusChip {
  key: "balanced" | "mapped" | "distribution";
  ok: boolean;
  tone: ChipTone;
  text: string;
}

/** Accounts whose category is the unmapped marker or is not one of the market's categories. */
export function unmappedCount(view: Pick<TbView, "rows" | "categories">): number {
  const known = new Set(view.categories.filter((c) => c.id !== UNMAPPED_CATEGORY).map((c) => c.id));
  return view.rows.filter((row) => !known.has(row.category)).length;
}

/** Every account has one of the market's categories. The AU domain flag alone would let an id the market does not list count as mapped. */
export function allAccountsMapped(view: Pick<TbView, "rows" | "categories" | "allMapped">): boolean {
  return view.allMapped && unmappedCount(view) === 0;
}

export function statusChips(view: TbView, currency: Currency): StatusChip[] {
  const unmapped = unmappedCount(view);
  const mapped = allAccountsMapped(view);
  const need = Math.max(unmapped, 1);
  return [
    {
      key: "balanced",
      ok: view.balanced,
      tone: view.balanced ? "good" : "bad",
      text: view.balanced ? "Balanced" : `Out of balance by ${money(Math.abs(view.totalDebitsLessCredits), currency, 2)}`,
    },
    {
      key: "mapped",
      ok: mapped,
      tone: mapped ? "good" : "warn",
      text: mapped ? "All accounts mapped" : need === 1 ? "1 account needs a tax category" : `${integer(need)} accounts need a tax category`,
    },
    {
      key: "distribution",
      ok: view.matchesDistribution,
      tone: view.matchesDistribution ? "good" : "warn",
      text: view.matchesDistribution ? "Matches the distribution" : "Differs from the distribution",
    },
  ];
}

// ------------------------------------------------------------------------------------------------------------------- export
/** The whole trial balance as a CSV: plain numbers in major units, debits positive and credits negative. It can be imported again. */
export function tbExportCsv(fundName: string, view: Pick<TbView, "rows">): CsvModel {
  const major = (cents: Cents): number => (cents === 0 ? 0 : cents / 100);
  return {
    fileName: `${slug(fundName)}-trial-balance.csv`,
    columns: ["Account", "Name", "Tax category", "Treatment", "Current", "Prior", "Change"],
    rows: view.rows.map((r) => [r.account, r.name, r.categoryLabel, r.treatment, major(r.current), major(r.prior), major(r.change)]),
  };
}

// ------------------------------------------------------------------------------------------------------------------- mapping table
export interface CategoryOption {
  value: string;
  label: string;
}

/** The market's categories in their own order, then "Needs a tax category" last (the SG list leaves that entry out). */
export function categoryOptions(categories: readonly TbCategoryDef[]): CategoryOption[] {
  const options = categories.filter((c) => c.id !== UNMAPPED_CATEGORY).map((c) => ({ value: c.id, label: c.label }));
  const unmapped = categories.find((c) => c.id === UNMAPPED_CATEGORY);
  options.push({ value: UNMAPPED_CATEGORY, label: unmapped?.label ?? UNMAPPED_LABEL });
  return options;
}

/** The option a row's select shows: its category, or "Needs a tax category" when the id is not one of the options. */
export function selectedCategory(category: string, options: readonly CategoryOption[]): string {
  return options.some((o) => o.value === category) ? category : UNMAPPED_CATEGORY;
}

export type ChangeFlag = "over" | "new" | null;

/** A row is flagged when its change is over the threshold (a percentage), or when a balance appears where the prior year had none. */
export function changeFlag(row: Pick<TbRowView, "change" | "changePct">, threshold: number): ChangeFlag {
  if (row.change === 0) return null;
  if (row.changePct === null || !Number.isFinite(row.changePct)) return "new";
  return Math.abs(row.changePct) > threshold ? "over" : null;
}

const thresholdText = (threshold: number): string => String(Math.round(threshold * 100) / 100);

/** The words that go with the marker, so the flag never depends on colour alone. */
export function flagLabel(flag: ChangeFlag, threshold: number): string | null {
  if (flag === "over") return `Over ${thresholdText(threshold)}%`;
  if (flag === "new") return "New balance";
  return null;
}

/** "-10.7%", "258.7%", "0.0%"; an en dash when there is no prior balance to compare with. */
export function changePctText(changePct: number | null): string {
  if (changePct === null || !Number.isFinite(changePct)) return "–";
  const rounded = Math.round(changePct * 10) / 10;
  if (rounded === 0) return "0.0%";
  const [whole = "0", fraction = "0"] = Math.abs(rounded).toFixed(1).split(".");
  return `${rounded < 0 ? "-" : ""}${groupDigits(whole)}.${fraction}%`;
}

export type SortMode = "account" | "change";
export const SORT_OPTIONS: readonly { value: SortMode; label: string }[] = [
  { value: "account", label: "Account" },
  { value: "change", label: "Largest change" },
];

/** "account" keeps the order the domain gives; "change" puts the biggest movement (up or down, in money) first and keeps that order among equals. */
export function sortRows<T extends Pick<TbRowView, "change">>(rows: readonly T[], mode: SortMode): T[] {
  const copy = [...rows];
  if (mode === "change") {
    return copy
      .map((row, position) => ({ row, position }))
      .sort((a, b) => Math.abs(b.row.change) - Math.abs(a.row.change) || a.position - b.position)
      .map((entry) => entry.row);
  }
  return copy;
}

export function tbTotals(rows: readonly Pick<TbRowView, "current" | "prior">[]): { current: Cents; prior: Cents } {
  let current = 0;
  let prior = 0;
  for (const row of rows) {
    current += row.current;
    prior += row.prior;
  }
  return { current, prior };
}

// ------------------------------------------------------------------------------------------------------------------- book to tax
export interface BookToTaxLine {
  label: string;
  amount: Cents;
  kind: BookToTaxRow["kind"];
  prior?: Cents;
  change?: Cents;
  changePct?: number | null;
}

/** The reconciliation lines. AU already includes its result line; SG gives the result separately, so it is added when none is present. */
export function bookToTaxLines(bookToTax: TbView["bookToTax"]): BookToTaxLine[] {
  const lines: BookToTaxLine[] = bookToTax.rows.map((r) => ({ label: r.label, amount: r.amount, kind: r.kind, prior: r.prior, change: r.change, changePct: r.changePct }));
  if (!lines.some((l) => l.kind === "result")) {
    lines.push({
      label: bookToTax.resultLabel,
      amount: bookToTax.result,
      kind: "result",
      prior: bookToTax.resultPrior,
      change: bookToTax.resultChange,
      changePct: bookToTax.resultChangePct,
    });
  }
  return lines;
}

// ------------------------------------------------------------------------------------------------------------------- distribution components
export interface ComponentLine {
  key: string;
  label: string;
  trialBalance: Cents;
  distribution: Cents;
  agrees: boolean;
  /** Distribution less trial balance. */
  difference: Cents;
}

export function componentLines(components: TbView["components"]): ComponentLine[] {
  return components.map((c) => ({ ...c, difference: c.distribution - c.trialBalance }));
}

export interface SyncState {
  enabled: boolean;
  /** A visible reason or note for the button, or null when it is simply available. */
  hint: string | null;
}

export const MAP_EVERY_ACCOUNT = "Map every account first.";
export const ALREADY_MATCHES = "The distribution already matches.";

/** Whether "Update distribution" can be used, and what to say when it cannot. The order is the reference's: locked, then unmapped, then nothing to do. */
export function distributionSync(input: {
  canEdit: boolean;
  lockedReason: string;
  allMapped: boolean;
  components: readonly Pick<ComponentLine, "agrees">[];
}): SyncState {
  if (!input.canEdit) return { enabled: false, hint: sentence(input.lockedReason) || "View only for your role." };
  if (!input.allMapped) return { enabled: false, hint: MAP_EVERY_ACCOUNT };
  if (input.components.every((c) => c.agrees)) return { enabled: false, hint: ALREADY_MATCHES };
  return { enabled: true, hint: null };
}

// ------------------------------------------------------------------------------------------------------------------- import
export interface ExistingAccount {
  account: string;
  category: string;
}

export interface ImportPlan {
  /** What goes into the `import-tb` action. */
  rows: ImportRow[];
  count: number;
  totalCurrent: Cents;
  totalPrior: Cents;
  balanced: boolean;
  /** Accounts that still need a tax category once the carried-over ones are applied. */
  unmapped: number;
  /** Accounts the file gives no category for that keep the one they have now. */
  kept: number;
  /** Accounts in the trial balance today (an import replaces all of them). */
  replaces: number;
  /** Accounts in the trial balance today that the file does not have. */
  dropped: number;
  /** Accounts in the file that are not in the trial balance today. */
  added: number;
}

/**
 * What an import would do. The file is the new trial balance, but an account the file gives no category for keeps the category it has now
 * (mapping is judgement that should not be lost when only the balances change).
 */
export function planImport(
  rows: readonly ImportRow[],
  existing: readonly ExistingAccount[],
  categories: readonly TbCategoryDef[],
  market: Market,
): ImportPlan {
  const valid = new Set(categories.filter((c) => c.id !== UNMAPPED_CATEGORY).map((c) => c.id));
  const current = new Map(existing.map((e) => [e.account, valid.has(e.category) ? e.category : undefined]));
  let kept = 0;
  let unmapped = 0;
  let totalCurrent = 0;
  let totalPrior = 0;
  let added = 0;
  const planned = rows.map((row): ImportRow => {
    totalCurrent += row.current;
    totalPrior += row.prior;
    if (!current.has(row.account)) added++;
    // A category the file names wins (naming "unmapped" resets the account); silence keeps what the account has now.
    let category: string | undefined;
    if (row.category !== undefined) {
      category = valid.has(row.category) ? row.category : undefined;
    } else {
      category = current.get(row.account);
      if (category !== undefined) kept++;
    }
    if (category === undefined) unmapped++;
    const next: ImportRow = { account: row.account, name: row.name, current: row.current, prior: row.prior };
    if (category !== undefined) next.category = category;
    return next;
  });
  const incoming = new Set(rows.map((r) => r.account));
  return {
    rows: planned,
    count: planned.length,
    totalCurrent,
    totalPrior,
    balanced: isBalanced(totalCurrent, market),
    unmapped,
    kept,
    replaces: existing.length,
    dropped: existing.filter((e) => !incoming.has(e.account)).length,
    added,
  };
}
