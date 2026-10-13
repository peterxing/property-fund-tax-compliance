// Pure view-model helpers for the Investor reporting workspace. They turn the domain's InvestorView into the text and flags the sections
// render, so the wording and the rules (who can publish, when lodgment is blocked, what a receipt reference may contain) are unit-tested
// without a DOM. No React, no CSS, no browser APIs.
import type { AuInvestorView, Cents, Currency, GovernanceMode, ISODate, Lodgment, SgInvestorView, SgNotice, WorkflowStatus } from "../../../domain/types.ts";
import { dateLabel, integer, money } from "../../../domain/format.ts";

type AuNoticeRef = AuInvestorView["notices"][number];
type VsYearRef = AuInvestorView["vsYear"][number];
type AiirRef = AuInvestorView["aiir"];
type AiirLineRef = AiirRef["lines"][number];
type S45gRef = SgInvestorView["s45g"];

// ------------------------------------------------------------------------------------------------------------ publishing
export const PUBLISH_LOCKED_REASON = "Published notices are locked";
export const PUBLISH_DENIED_REASON = "Only the preparer or Head of Tax can publish";
export const ANNOUNCE_DENIED_REASON = "Only the preparer or Head of Tax can announce";

export interface PublishControl {
  /** A locked notice has nothing left to publish, so no button is drawn for it. */
  visible: boolean;
  enabled: boolean;
  /** Why the action is unavailable (null when it is available). */
  reason: string | null;
}

/** `verb` follows the button: Australian notices are published, Singaporean ones announced. */
export function publishControl(input: { hasNotice: boolean; locked: boolean; canPublish: boolean; verb?: "publish" | "announce" }): PublishControl {
  if (!input.hasNotice) return { visible: false, enabled: false, reason: null };
  if (input.locked) return { visible: false, enabled: false, reason: PUBLISH_LOCKED_REASON };
  if (!input.canPublish) return { visible: true, enabled: false, reason: input.verb === "announce" ? ANNOUNCE_DENIED_REASON : PUBLISH_DENIED_REASON };
  return { visible: true, enabled: true, reason: null };
}

// ------------------------------------------------------------------------------------------------------------ AU notices
export interface NoticeListItem {
  id: string;
  label: string;
  /** "Paid 14 Nov 2025 · A$22,604,000" */
  paid: string;
  published: boolean;
  /** "Published 7 Nov 2025" or "Draft · due by 13 Nov 2026". */
  status: string;
}

export function noticeListItems(notices: readonly AuNoticeRef[], currency: Currency = "AUD"): NoticeListItem[] {
  return notices.map((n) => ({
    id: n.id,
    label: n.label,
    paid: `Paid ${dateLabel(n.paymentDate)} · ${money(n.cash, currency)}`,
    published: n.publishedOn !== null,
    status: n.publishedOn !== null ? `Published ${dateLabel(n.publishedOn)}` : `Draft · due by ${dateLabel(n.paymentDate)}`,
  }));
}

export interface NoticeStatus {
  locked: boolean;
  text: string;
}

/** The line under the notice list for the selected notice. */
export function auNoticeStatus(notice: Pick<AuNoticeRef, "publishedOn"> | null | undefined): NoticeStatus | null {
  if (!notice) return null;
  if (notice.publishedOn !== null) return { locked: true, text: `Published ${dateLabel(notice.publishedOn)} — locked.` };
  return { locked: false, text: "Estimate: the balance of the year's components not yet notified." };
}

// ------------------------------------------------------------------------------------------------------------ notices against the year
/** Differences smaller than this are rounding, the same tolerance the domain's checks use. */
export const NOTICE_TOLERANCE_CENTS = 50;
export const TOTAL_FUND_PAYMENT = "Total fund payment";

export type Variance = "none" | "understated" | "overstated";

export interface VsYearRowModel {
  label: string;
  published: string;
  /** null when the table has no draft column. */
  drafts: string | null;
  year: string;
  difference: string;
  /** Whether the notices fall short of (understated) or exceed (overstated) the year's component, after allowing for drafts. */
  variance: Variance;
  total: boolean;
}

export interface VsYearModel {
  hasDrafts: boolean;
  rows: VsYearRowModel[];
  total: VsYearRowModel | null;
}

export function varianceOf(differenceCents: Cents): Variance {
  if (differenceCents >= NOTICE_TOLERANCE_CENTS) return "understated";
  if (differenceCents <= -NOTICE_TOLERANCE_CENTS) return "overstated";
  return "none";
}

/** The words that sit next to a difference so that it never relies on colour or a sign alone. */
export const VARIANCE_LABEL: Record<Exclude<Variance, "none">, string> = {
  understated: "Notices understate",
  overstated: "Notices overstate",
};

/**
 * The published notices against the year's components. `drafts` holds the amount the unpublished notices estimate for each row (keyed by the
 * row label); pass null when the fund has no draft notice and the column is dropped. As in the reference app a draft is netted off the
 * difference, so a draft that covers the rest of the year leaves a difference of nil.
 */
export function vsYearModel(rows: readonly VsYearRef[], drafts: ReadonlyMap<string, Cents> | null, currency: Currency = "AUD"): VsYearModel {
  const built = rows.map((r): VsYearRowModel => {
    const draft = drafts ? (drafts.get(r.label) ?? 0) : 0;
    const difference = r.difference - draft;
    return {
      label: r.label,
      published: money(r.published, currency),
      drafts: drafts ? money(draft, currency) : null,
      year: money(r.year, currency),
      difference: money(difference, currency),
      variance: varianceOf(difference),
      total: r.label === TOTAL_FUND_PAYMENT,
    };
  });
  return { hasDrafts: drafts !== null, rows: built.filter((r) => !r.total), total: built.find((r) => r.total) ?? null };
}

// ------------------------------------------------------------------------------------------------------------ AIIR card
export const SUBSTITUTED_PERIOD_DUE = "Confirm with the ATO — substituted accounting period";
const SUBSTITUTED_NOTE_SENTENCE = /^AIIR due date: confirm with the ATO — substituted accounting period\.\s*/;

export const REOPENED_CHIP = "Reopened after lodgment";

export interface AiirChip {
  text: "Ready" | "Not ready" | "Lodged" | typeof REOPENED_CHIP;
  tone: "good" | "warn";
}

/** A lodgment record on a fund that is not signed off: the only way out of Signed off is Reopen, so the fund was reopened after it was lodged. */
export const reopenedAfterLodgment = (lodgment: Lodgment | null, status: WorkflowStatus): boolean => lodgment !== null && status !== "Signed off";

/** `status` is the fund's: a record on a fund that is no longer signed off is shown as reopened, not as a plain "Lodged". */
export function aiirChip(aiir: Pick<AiirRef, "ready" | "lodgment">, status: WorkflowStatus): AiirChip {
  if (reopenedAfterLodgment(aiir.lodgment, status)) return { text: REOPENED_CHIP, tone: "warn" };
  if (aiir.lodgment) return { text: "Lodged", tone: "good" };
  return aiir.ready ? { text: "Ready", tone: "good" } : { text: "Not ready", tone: "warn" };
}

export interface ReadinessItemModel {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  state: "Done" | "Outstanding";
}

export interface AiirCardModel {
  chip: AiirChip;
  items: ReadinessItemModel[];
  /** A date, or the substituted-period advice when the fund's accounting period was changed. */
  aiirDue: string;
  withholdingReportDue: string;
  note: string;
}

export function aiirCard(aiir: Pick<AiirRef, "ready" | "lodgment" | "items" | "aiirDue" | "withholdingReportDue" | "note">, status: WorkflowStatus): AiirCardModel {
  // The "AIIR due" row already carries the substituted-period advice, so the note drops its own copy of that sentence.
  const trimmed = aiir.aiirDue === "" ? aiir.note.replace(SUBSTITUTED_NOTE_SENTENCE, "") : aiir.note;
  return {
    chip: aiirChip(aiir, status),
    items: aiir.items.map((i) => ({ id: i.id, label: i.label, detail: i.detail, done: i.done, state: i.done ? "Done" : "Outstanding" })),
    aiirDue: aiir.aiirDue === "" ? SUBSTITUTED_PERIOD_DUE : dateLabel(aiir.aiirDue),
    withholdingReportDue: dateLabel(aiir.withholdingReportDue),
    note: trimmed === "" ? aiir.note : trimmed,
  };
}

// ------------------------------------------------------------------------------------------------------------ AIIR investor lines
export interface CostBaseNetCell {
  amount: string;
  kind: "excess" | "shortfall" | "nil";
}

/** AMIT cost base net amount: an excess decreases the unit cost base, a shortfall increases it. */
export function costBaseNetCell(cents: Cents, currency: Currency = "AUD"): CostBaseNetCell {
  const rounded = Math.round(Math.abs(cents) / 100);
  if (rounded === 0) return { amount: money(0, currency), kind: "nil" };
  return { amount: money(Math.abs(cents), currency), kind: cents > 0 ? "excess" : "shortfall" };
}

export function costBaseNetText(cents: Cents, currency: Currency = "AUD"): string {
  const cell = costBaseNetCell(cents, currency);
  return cell.kind === "nil" ? cell.amount : `${cell.amount} ${cell.kind}`;
}

export interface AiirAmountsModel {
  units: string;
  attributed: string;
  cash: string;
  costBaseNet: CostBaseNetCell;
  withheld: string;
}

export interface AiirRowModel extends AiirAmountsModel {
  id: string;
  holder: string;
  country: string;
  status: string;
}

export interface AiirTableModel {
  rows: AiirRowModel[];
  total: AiirAmountsModel;
  /** Trust components that no investor line carries; shown under the totals so the table can be tied back to the trust. */
  unreported: { label: string; amount: string } | null;
}

function amountsOf(a: { units: number; attributed: Cents; cash: Cents; costBaseNet: Cents; withheld: Cents }, currency: Currency): AiirAmountsModel {
  return {
    units: integer(a.units),
    attributed: money(a.attributed, currency),
    cash: money(a.cash, currency),
    costBaseNet: costBaseNetCell(a.costBaseNet, currency),
    withheld: money(a.withheld, currency),
  };
}

export const UNREPORTED_LABEL = "Trust components not reported against an investor";
export const OVER_REPORTED_LABEL = "Investor lines exceed the trust components";

/** `trustAttributed` is the fund's attributed amount from its distribution calculation; null skips the reconciliation row. */
export function aiirTable(aiir: Pick<AiirRef, "lines" | "totals">, trustAttributed: Cents | null, currency: Currency = "AUD"): AiirTableModel {
  const gap = trustAttributed === null ? 0 : trustAttributed - aiir.totals.attributed;
  return {
    rows: aiir.lines.map((l: AiirLineRef) => ({ id: l.holderId, holder: l.holder, country: l.country, status: l.statusLabel, ...amountsOf(l, currency) })),
    total: amountsOf(aiir.totals, currency),
    unreported: gap === 0 ? null : { label: gap > 0 ? UNREPORTED_LABEL : OVER_REPORTED_LABEL, amount: money(Math.abs(gap), currency) },
  };
}

// ------------------------------------------------------------------------------------------------------------ lodgment
export type LodgmentSection =
  | {
      kind: "lodged";
      title: string;
      summary: string;
      recordedBy: string;
      /** The recorded reference and date as they were saved: what the replace form starts from. */
      record: LodgmentDraft;
      /** The viewer records lodgment for this fund and it is signed off (workflowView.can.lodge), so they may replace the record. */
      canReplace: boolean;
    }
  | {
      kind: "reopened";
      title: string;
      summary: string;
      recordedBy: string;
      /** What happened since, and what to do about it. */
      note: string;
      /** Set when the viewer records lodgment for this fund: why Replace lodgment record stays switched off. Null: the viewer has no such control. */
      replaceReason: string | null;
    }
  | { kind: "delegated"; text: string }
  | { kind: "form"; enabled: boolean; reason: string | null };

export const LODGED_TITLE = "Lodged with the ATO";
export const REOPENED_TITLE = "Previously lodged with the ATO";
/** The record stays a fact, but it no longer describes the fund: any change needs the fund signed off again and an updated AIIR. */
export const REOPENED_NOTE = "This fund was reopened after the AIIR was lodged. Sign it off again and lodge an updated AIIR if any figure changes.";
export const NOT_READY_REASON = "Clear the outstanding items first.";
export const NOT_SIGNED_OFF_REASON = "Sign the fund off before recording lodgment.";
export const REPLACE_LABEL = "Replace lodgment record";
export const SAVE_RECORD_LABEL = "Save record";

/** What the live region says once a record is saved; `replaced` is true when it took the place of an earlier one. */
export const recordedMessage = (fundName: string, reference: string, replaced: boolean): string =>
  `${fundName}: AIIR lodgment ${replaced ? "record replaced" : "recorded"}, ${reference}.`;

/** Each governance mode as it reads in a sentence about someone else's role (the domain's labels speak to the Head of Tax as "you"). */
export const LODGMENT_GOVERNANCE: Record<GovernanceMode, string> = {
  "agent-lodges": "tax agent reviews and lodges",
  "agent-signs-off": "tax agent signs off; head of tax lodges",
  "no-agent": "no tax agent",
};

export function lodgmentSection(input: {
  lodgment: Lodgment | null;
  /** The fund's workflow status: a record on a fund that is not signed off is history (the fund was reopened), not the current position. */
  status: WorkflowStatus;
  /** The persona's role and the fund's governance allow recording lodgment (ignores the fund's status). */
  mayLodge: boolean;
  /** mayLodge and the fund is signed off (workflowView.can.lodge). */
  canLodge: boolean;
  /** Every AIIR readiness item is done. */
  ready: boolean;
  /** Role that records lodgment under this fund's governance, "Tax agent" or "Head of Tax". */
  lodgerRole: string;
  /** How the fund's governance reads in the sentence, "tax agent reviews and lodges" (LODGMENT_GOVERNANCE). */
  governance: string;
}): LodgmentSection {
  const { lodgment } = input;
  if (lodgment) {
    const summary = `${dateLabel(lodgment.date)} · ${lodgment.reference}`;
    const recordedBy = `Recorded by ${lodgment.actor}`;
    if (reopenedAfterLodgment(lodgment, input.status)) {
      return { kind: "reopened", title: REOPENED_TITLE, summary, recordedBy, note: REOPENED_NOTE, replaceReason: input.mayLodge ? NOT_SIGNED_OFF_REASON : null };
    }
    return { kind: "lodged", title: LODGED_TITLE, summary, recordedBy, record: { reference: lodgment.reference, date: lodgment.date }, canReplace: input.canLodge };
  }
  if (!input.mayLodge) {
    return { kind: "delegated", text: `Recorded by the ${input.lodgerRole.toLowerCase()} under this fund's governance (${input.governance.toLowerCase()}).` };
  }
  // A signed-off fund can still have an AIIR that is not ready (a unit missing from the register), and that must not be lodged.
  const enabled = input.canLodge && input.ready;
  return { kind: "form", enabled, reason: enabled ? null : input.ready ? NOT_SIGNED_OFF_REASON : NOT_READY_REASON };
}

export const REFERENCE_MIN_LENGTH = 3;
export const REFERENCE_MAX_LENGTH = 60;
const REFERENCE_CHARACTERS = /^[A-Za-z0-9 \-_/.:#]+$/;

export interface LodgmentDraft {
  reference: string;
  date: string;
}
export interface LodgmentErrors {
  reference?: string;
  date?: string;
}
export type LodgmentCheck = { ok: true; reference: string; date: ISODate } | { ok: false; errors: LodgmentErrors };

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30 and 2026-13-01). */
export function isRealISODate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

/** Stricter than the domain action (which only needs a non-empty reference and a real date): bounds the reference and refuses future dates. */
export function checkLodgment(draft: LodgmentDraft, today: ISODate): LodgmentCheck {
  const errors: LodgmentErrors = {};
  const reference = draft.reference.trim();
  if (reference === "") errors.reference = "Enter the ATO receipt reference.";
  else if (reference.length < REFERENCE_MIN_LENGTH) errors.reference = `The reference is too short. Use at least ${REFERENCE_MIN_LENGTH} characters.`;
  else if (reference.length > REFERENCE_MAX_LENGTH) errors.reference = `The reference is too long. Use ${REFERENCE_MAX_LENGTH} characters or fewer.`;
  else if (!REFERENCE_CHARACTERS.test(reference)) errors.reference = "Use letters, numbers, spaces and - _ / . : # only.";

  const date = draft.date.trim();
  if (date === "") errors.date = "Enter the date lodged.";
  else if (!isRealISODate(date)) errors.date = "Enter a valid date.";
  else if (date > today) errors.date = "The date can't be in the future.";

  if (errors.reference !== undefined || errors.date !== undefined) return { ok: false, errors };
  return { ok: true, reference, date };
}

// ------------------------------------------------------------------------------------------------------------ Singapore
export interface SgNoticeStatus {
  locked: boolean;
  text: string;
}

/** "Draft · announce by 6 Nov 2026" until the notice goes out, then "Announced 30 Jul 2026 — locked." */
export function sgNoticeStatus(notice: Pick<SgInvestorView["notice"], "published" | "publishedOn" | "recordDate">): SgNoticeStatus {
  if (notice.published && notice.publishedOn !== null) return { locked: true, text: `Announced ${dateLabel(notice.publishedOn)} — locked.` };
  return { locked: false, text: `Draft · announce by ${dateLabel(notice.recordDate)}` };
}

/** The notice the domain reports on: the fund's one with the latest record date (the first of equals). Null when the fund has none. */
export function latestSgNotice(notices: readonly SgNotice[], fundId: string): SgNotice | null {
  let found: SgNotice | null = null;
  for (const n of notices) {
    if (n.fundId === fundId && (found === null || n.recordDate > found.recordDate)) found = n;
  }
  return found;
}

export interface S45gRowModel {
  holder: string;
  country: string;
  classLabel: string;
  rate: string;
  taxable: string;
  deducted: string;
}

export interface S45gModel {
  paymentDate: string;
  fileAndPayBy: string;
  overdue: boolean;
  deducted: string;
  paid: string;
  rows: S45gRowModel[];
  total: { taxable: string; deducted: string };
  emptyMessage: string | null;
}

/** "Not yet paid", "S$2,792,644.00 · reconciled" or "S$2,000,000.00 · S$792,644.00 under-paid" (the variance is deducted less paid). */
export function paidToIras(s45g: Pick<S45gRef, "paid" | "deducted">): string {
  if (s45g.paid === null) return "Not yet paid";
  const paid = money(s45g.paid, "SGD", 2);
  const variance = s45g.deducted - s45g.paid;
  if (variance === 0) return `${paid} · reconciled`;
  return `${paid} · ${money(Math.abs(variance), "SGD", 2)} ${variance > 0 ? "under-paid" : "over-paid"}`;
}

export function s45gModel(s45g: S45gRef): S45gModel {
  return {
    paymentDate: dateLabel(s45g.paymentDate),
    fileAndPayBy: dateLabel(s45g.fileAndPayBy),
    overdue: s45g.overdue,
    deducted: money(s45g.deducted, "SGD", 2),
    paid: paidToIras(s45g),
    rows: s45g.rows.map((r) => ({
      holder: r.holder,
      country: r.country,
      classLabel: r.classLabel,
      rate: r.rateLabel,
      taxable: money(r.taxable, "SGD", 2),
      deducted: money(r.deducted, "SGD", 2),
    })),
    total: { taxable: money(s45g.totals.taxable, "SGD", 2), deducted: money(s45g.totals.deducted, "SGD", 2) },
    emptyMessage: s45g.emptyMessage,
  };
}
