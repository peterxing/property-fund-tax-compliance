// The models behind the Distributions review tabs (Withholding, Statements, Checks, Queries, Audit trail, Rules). No React or CSS in this file, so
// Node tests can import it; the components only lay these models out. Money is shown to the cent so every total can be checked against its rows.
import type {
  AuditEntry,
  Cents,
  Check,
  CheckSeverity,
  Currency,
  Fund,
  FundCalc,
  HolderLine,
  Market,
  Query,
  WithholdingRecon,
} from "../../../../domain/types.ts";
import { dateTimeLabel, integer, money, ratePct } from "../../../../domain/format.ts";

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;
const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

// ---------------------------------------------------------------------------------------------------- tabs
export type ReviewTabId = "withholding" | "statements" | "checks" | "queries" | "audit" | "rules";

export const REVIEW_TABS: readonly { id: ReviewTabId; label: string }[] = [
  { id: "withholding", label: "Withholding" },
  { id: "statements", label: "Statements" },
  { id: "checks", label: "Checks" },
  { id: "queries", label: "Queries" },
  { id: "audit", label: "Audit trail" },
  { id: "rules", label: "Rules" },
];
export const DEFAULT_REVIEW_TAB: ReviewTabId = "withholding";

/** Hash parameters: `?tab=` picks the tab and `?holder=` the unitholder shown on the Statements tab. */
export const TAB_PARAM = "tab";
export const HOLDER_PARAM = "holder";

const TAB_BY_PARAM = new Map<string, ReviewTabId>([
  ["withholding", "withholding"],
  ["statements", "statements"],
  ["statement", "statements"],
  ["checks", "checks"],
  ["queries", "queries"],
  ["audit", "audit"],
  ["audit-trail", "audit"],
  ["rules", "rules"],
]);

/** The tab a `tab` parameter names. Missing or unknown values open the default tab (Withholding). */
export function reviewTabFromParam(value: string | null | undefined): ReviewTabId {
  return TAB_BY_PARAM.get((value ?? "").trim().toLowerCase()) ?? DEFAULT_REVIEW_TAB;
}

/** The parameters that open the Statements tab on one holder. */
export function statementParams(holderId: string): { tab: ReviewTabId; holder: string } {
  return { tab: "statements", holder: holderId };
}

// ---------------------------------------------------------------------------------------------------- tab badges
export interface TabBadge {
  text: string;
  /** "danger" is red (exceptions); "neutral" is the shell's accent pill. */
  tone: "danger" | "neutral";
}

export function checkCounts(checks: readonly Check[]): { exceptions: number; notes: number } {
  const exceptions = checks.filter((c) => c.severity === "exception").length;
  return { exceptions, notes: checks.length - exceptions };
}

/** The exceptions when there are any, otherwise the notes; nothing when no check was raised. */
export function checksBadge(checks: readonly Check[]): TabBadge | null {
  const { exceptions, notes } = checkCounts(checks);
  if (exceptions > 0) return { text: count(exceptions, "exception"), tone: "danger" };
  if (notes > 0) return { text: count(notes, "note"), tone: "neutral" };
  return null;
}

export function openQueryCount(queries: readonly Query[]): number {
  return queries.filter((q) => q.status === "open").length;
}

export function queriesBadge(queries: readonly Query[]): TabBadge | null {
  const open = openQueryCount(queries);
  return open > 0 ? { text: `${open} open`, tone: "neutral" } : null;
}

// ---------------------------------------------------------------------------------------------------- checks
/** Exceptions first, then notes; each group keeps the order the market module raised them in. */
export function orderChecks(checks: readonly Check[]): Check[] {
  return [...checks.filter((c) => c.severity === "exception"), ...checks.filter((c) => c.severity !== "exception")];
}

export const CHECK_TAGS: Record<CheckSeverity, { label: string; tone: "bad" | "warn" }> = {
  exception: { label: "Exception", tone: "bad" },
  note: { label: "Note", tone: "warn" },
};

export const NO_CHECKS = "No checks raised";

/** "2 exceptions · 1 note", "No exceptions · 2 notes" or "No checks raised". */
export function checksSummary(checks: readonly Check[]): string {
  const { exceptions, notes } = checkCounts(checks);
  if (exceptions + notes === 0) return NO_CHECKS;
  const parts = [exceptions > 0 ? count(exceptions, "exception") : "No exceptions"];
  if (notes > 0) parts.push(count(notes, "note"));
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------------------------------- withholding table
/** What an amount of nothing is drawn as. The components show it with a spoken "nil" beside it. */
export const NIL = "–";

function amount(cents: Cents, currency: Currency): string {
  return cents === 0 ? NIL : money(cents, currency, 2);
}

export interface ComponentRow {
  key: string;
  label: string;
  amount: string;
  rate: string;
  withheld: string;
}

export interface HolderRow {
  id: string;
  name: string;
  country: string;
  /** "Foreign resident — EOI country" */
  status: string;
  /** "15% fund payment · 10% interest" or "No withholding" */
  rates: string;
  units: number;
  unitsText: string;
  cash: string;
  withheld: string;
  net: string;
  /** The holder's share of each component that has an amount, with the rate applied and the tax withheld on it. */
  components: ComponentRow[];
}

export function holderRow(line: HolderLine, currency: Currency): HolderRow {
  return {
    id: line.holder.id,
    name: line.holder.holder,
    country: line.holder.country,
    status: line.statusLabel,
    rates: line.rateSummary,
    units: line.holder.units,
    unitsText: integer(line.holder.units),
    cash: amount(line.cash, currency),
    withheld: amount(line.withheld, currency),
    net: amount(line.net, currency),
    components: line.lines
      .filter((l) => l.amount !== 0)
      .map((l) => ({
        key: l.key,
        label: l.label,
        amount: money(l.amount, currency, 2),
        rate: ratePct(l.rate),
        withheld: amount(l.withheld, currency),
      })),
  };
}

export const REGISTER_BALANCED = "Register matches the units on issue.";

export interface RegisterStatus {
  balanced: boolean;
  /** The sentence the market modules use for a register that does not match the units on issue, or REGISTER_BALANCED. */
  text: string;
}

export function registerStatus(unitsOnIssue: number, registerUnits: number): RegisterStatus {
  const diff = unitsOnIssue - registerUnits;
  if (diff === 0) return { balanced: true, text: REGISTER_BALANCED };
  const out = Math.abs(diff);
  const gap = `${integer(out)} ${out === 1 ? "unit" : "units"} ${diff > 0 ? "not allocated to a holder" : "over-allocated"}`;
  return { balanced: false, text: `Register holds ${integer(registerUnits)} units against ${integer(unitsOnIssue)} on issue (${gap}).` };
}

export const registerStatusFor = (fund: Fund, calc: FundCalc): RegisterStatus => registerStatus(fund.unitsOnIssue, calc.registerUnits);

export interface WithholdingTable {
  currency: Currency;
  /** In the order the market module returns them. */
  rows: HolderRow[];
  /** Sums of the rows above, so they always agree with them. */
  totals: { units: string; cash: string; withheld: string; net: string };
  unitsOnIssue: number;
  unitsOnIssueText: string;
  register: RegisterStatus;
}

export function withholdingTable(fund: Fund, calc: FundCalc): WithholdingTable {
  const rows = calc.holders.map((line) => holderRow(line, fund.currency));
  const lines = calc.holders;
  return {
    currency: fund.currency,
    rows,
    totals: {
      units: integer(sum(lines.map((l) => l.holder.units))),
      cash: amount(sum(lines.map((l) => l.cash)), fund.currency),
      withheld: amount(sum(lines.map((l) => l.withheld)), fund.currency),
      net: amount(sum(lines.map((l) => l.net)), fund.currency),
    },
    unitsOnIssue: fund.unitsOnIssue,
    unitsOnIssueText: integer(fund.unitsOnIssue),
    register: registerStatusFor(fund, calc),
  };
}

// ---------------------------------------------------------------------------------------------------- reconciliation
export type ReconTone = "good" | "bad" | "neutral";

export const AUTHORITY: Record<Market, string> = { AU: "the ATO", SG: "IRAS" };

/** "Reconciled", "Variance A$1,482,000.00 under-remitted", "Variance S$1,200.00 over-remitted" or "Not yet remitted". */
export function reconSentence(recon: WithholdingRecon, currency: Currency): string {
  switch (recon.status) {
    case "reconciled":
      return "Reconciled";
    case "under-remitted":
      return `Variance ${money(Math.abs(recon.variance ?? 0), currency, 2)} under-remitted`;
    case "over-remitted":
      return `Variance ${money(Math.abs(recon.variance ?? 0), currency, 2)} over-remitted`;
    default:
      return "Not yet remitted";
  }
}

export interface ReconModel {
  status: WithholdingRecon["status"];
  computed: string;
  computedLabel: string;
  /** The remitted amount, or null while nothing has been remitted. */
  remitted: string | null;
  remittedLabel: string;
  headline: string;
  tone: ReconTone;
}

export function reconModel(fund: Fund, calc: FundCalc): ReconModel {
  const { recon } = calc;
  return {
    status: recon.status,
    computed: money(recon.computed, fund.currency, 2),
    computedLabel: "Computed withholding",
    remitted: recon.remitted === null ? null : money(recon.remitted, fund.currency, 2),
    remittedLabel: `Remitted to ${AUTHORITY[fund.market]}`,
    headline: reconSentence(recon, fund.currency),
    tone: recon.status === "reconciled" ? "good" : recon.status === "not-remitted" ? "neutral" : "bad",
  };
}

// ---------------------------------------------------------------------------------------------------- statements
export interface HolderOption {
  value: string;
  label: string;
}

/** One option per holder, in register order: "Sakuragawa Life Assurance · Japan". */
export function holderOptions(holders: readonly HolderLine[]): HolderOption[] {
  return holders.map((line) => ({ value: line.holder.id, label: `${line.holder.holder} · ${line.holder.country}` }));
}

/** The requested holder when it is on this fund's register, otherwise the first holder with tax withheld (the first foreign unitholder), otherwise the first. */
export function resolveStatementHolder(holders: readonly HolderLine[], requested?: string | null): string | null {
  if (requested && holders.some((line) => line.holder.id === requested)) return requested;
  return (holders.find((line) => line.withheld > 0) ?? holders[0])?.holder.id ?? null;
}

// ---------------------------------------------------------------------------------------------------- queries
export interface QueryDraft {
  subject: string;
  message: string;
}
export type QueryField = keyof QueryDraft;

export const QUERY_ERRORS: Record<QueryField, string> = { subject: "Enter a subject", message: "Enter a message" };
export const REPLY_ERROR = "Enter a reply";

export type QueryValidation =
  | { ok: true; value: QueryDraft }
  | { ok: false; errors: Partial<Record<QueryField, string>>; first: QueryField };

/** Both boxes are required; the text is trimmed (line breaks inside it are kept). */
export function validateQuery(draft: QueryDraft): QueryValidation {
  const value = { subject: draft.subject.trim(), message: draft.message.trim() };
  const errors: Partial<Record<QueryField, string>> = {};
  if (!value.subject) errors.subject = QUERY_ERRORS.subject;
  if (!value.message) errors.message = QUERY_ERRORS.message;
  if (errors.subject || errors.message) return { ok: false, errors, first: errors.subject ? "subject" : "message" };
  return { ok: true, value };
}

export type ReplyValidation = { ok: true; message: string } | { ok: false; error: string };

export function validateReply(text: string): ReplyValidation {
  const message = text.trim();
  return message ? { ok: true, message } : { ok: false, error: REPLY_ERROR };
}

export interface MessageRow {
  key: string;
  by: string;
  at: string;
  atText: string;
  text: string;
}

export interface ThreadModel {
  id: string;
  subject: string;
  open: boolean;
  /** "Open" | "Resolved" */
  statusLabel: string;
  /** "Raised by D. Harrow · 7 Oct 2026, 11:30" */
  raised: string;
  messages: MessageRow[];
}

export function threadModel(query: Query): ThreadModel {
  const open = query.status === "open";
  return {
    id: query.id,
    subject: query.subject,
    open,
    statusLabel: open ? "Open" : "Resolved",
    raised: `Raised by ${query.raisedBy} · ${dateTimeLabel(query.raisedAt)}`,
    messages: query.messages.map((m, index) => ({ key: `${query.id}-${index}`, by: m.by, at: m.at, atText: dateTimeLabel(m.at), text: m.text })),
  };
}

export const QUERY_DENIED_REASON = "You can read queries, but you don't have permission to raise or answer them.";

export const queryRaisedMessage = (subject: string): string => `Query raised: ${subject}.`;
export const replySentMessage = (subject: string): string => `Reply sent on ${subject}.`;
export const queryResolvedMessage = (subject: string): string => `Query resolved: ${subject}.`;

// ---------------------------------------------------------------------------------------------------- audit trail
export interface AuditRow {
  id: string;
  /** The entry's wall-clock time as stored, for the <time> element. */
  at: string;
  /** "7 Oct 2026, 11:30" */
  atText: string;
  action: string;
  actor: string;
  /** Empty when the entry has no detail. */
  detail: string;
}

/** The entries as rows, in the order given (the selector returns them newest first). */
export function auditRows(entries: readonly AuditEntry[]): AuditRow[] {
  return entries.map((entry) => ({
    id: entry.id,
    at: entry.at,
    atText: dateTimeLabel(entry.at),
    action: entry.action,
    actor: entry.actor,
    detail: entry.detail ?? "",
  }));
}

// ---------------------------------------------------------------------------------------------------- announcements
export const unitsSavedMessage = (holder: string, register: RegisterStatus): string => `Saved: Units held by ${holder}. ${register.text}`;
export const unitsOnIssueSavedMessage = (register: RegisterStatus): string => `Saved: Units on issue. ${register.text}`;
export const remittedSavedMessage = (headline: string): string => `Saved: Withholding remitted. ${headline}.`;
