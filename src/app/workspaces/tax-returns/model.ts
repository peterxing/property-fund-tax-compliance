// Pure helpers for the Tax returns workspace: the readiness card, the lodgment section's states and the form's validation.
// No React or DOM, so the Node tests import this file directly.
import type { Fund, GovernanceMode, ISODate, Lodgment, ReadinessItem, ReturnView, User, WorkflowStatus, WorkflowView } from "../../../domain/types.ts";
import { dateLabel } from "../../../domain/format.ts";
import { ROLE_LABEL, can, lodgmentRole } from "../../../domain/permissions.ts";

export const NOT_READY_REASON = "Clear the outstanding items first.";
export const NOT_SIGNED_OFF_REASON = "Sign the fund off before recording lodgment.";

// ------------------------------------------------------------------------------------------------------------------- wording
export interface LodgmentWords {
  /** Heading of the form's panel and the label of its button. */
  action: string;
  /** The thing recorded, for a sentence: "lodgment" or "filing". */
  noun: "lodgment" | "filing";
  /** Heading once a record exists. */
  lodgedTitle: string;
  /** The chip on the readiness card once a record exists. */
  lodgedChip: string;
}

/** The ATO return is "lodged", an IRAS Form UT is "filed" (the reference app says so in the heading and the button). */
export function lodgmentWords(kind: Lodgment["kind"]): LodgmentWords {
  if (kind === "form-ut") return { action: "Record filing", noun: "filing", lodgedTitle: "Filed with IRAS", lodgedChip: "Filed" };
  return { action: "Record lodgment", noun: "lodgment", lodgedTitle: "Lodged with the ATO", lodgedChip: "Lodged" };
}

export interface ReopenedWords {
  /** Heading over the record, which is now history rather than the fund's position. */
  title: string;
  /** The chip on the readiness card. */
  chip: string;
  /** What happened and what to do about it. */
  note: string;
  /** Why the record cannot be replaced while the fund is not signed off. */
  reason: string;
}

/**
 * What the page says when a fund was reopened after it was lodged (or filed). The record stays, because it is a fact, but it no longer
 * describes the fund: any change needs the fund signed off again and an amended return.
 */
export function reopenedWords(kind: Lodgment["kind"]): ReopenedWords {
  if (kind === "form-ut") {
    return {
      title: "Previously filed with IRAS",
      chip: "Reopened after filing",
      note: "This fund was reopened after it was filed. Sign it off again and file an amended Form UT if any figure changes.",
      reason: "Sign the fund off before recording the filing.",
    };
  }
  return {
    title: "Previously lodged with the ATO",
    chip: "Reopened after lodgment",
    note: "This fund was reopened after it was lodged. Sign it off again and lodge an amended return if any figure changes.",
    reason: NOT_SIGNED_OFF_REASON,
  };
}

/** What is announced once a record is saved: "Wattle Retail Property Trust: lodgment recorded, Receipt 418806221407." */
export const recordedMessage = (fundName: string, kind: Lodgment["kind"], reference: string): string => `${fundName}: ${lodgmentWords(kind).noun} recorded, ${reference}.`;

/** Each governance mode as it reads in a sentence about someone else's role (the domain's labels speak to the Head of Tax as "you"). */
export const GOVERNANCE_PHRASE: Record<GovernanceMode, string> = {
  "agent-lodges": "tax agent reviews and lodges",
  "agent-signs-off": "tax agent signs off; head of tax lodges",
  "no-agent": "no tax agent",
};

// ------------------------------------------------------------------------------------------------------------------- readiness card
export interface ReadinessChip {
  text: string;
  tone: "good" | "warn";
}
export interface ReadinessItemModel {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  /** Text that carries the state, so it never rests on the icon or colour alone. */
  state: "Done" | "Outstanding";
}

/** A record of lodgment on a fund that is not signed off: the only way out of Signed off is Reopen, so the fund was reopened after it was lodged. */
export const reopenedAfterLodgment = (lodgment: Lodgment | null, status: WorkflowStatus): boolean => lodgment !== null && status !== "Signed off";

/** `status` is the fund's: a record on a fund that is no longer signed off is shown as reopened, not as a plain "Lodged". */
export function readinessChip(view: Pick<ReturnView, "ready" | "lodgment" | "lodgmentKind">, status: WorkflowStatus): ReadinessChip {
  if (reopenedAfterLodgment(view.lodgment, status)) return { text: reopenedWords(view.lodgmentKind).chip, tone: "warn" };
  if (view.lodgment) return { text: lodgmentWords(view.lodgmentKind).lodgedChip, tone: "good" };
  return view.ready ? { text: "Ready", tone: "good" } : { text: "Not ready", tone: "warn" };
}

export function readinessItems(items: readonly ReadinessItem[]): ReadinessItemModel[] {
  return items.map((item) => ({ id: item.id, label: item.label, detail: item.detail, done: item.done, state: item.done ? "Done" : "Outstanding" }));
}

// ------------------------------------------------------------------------------------------------------------------- lodgment section
export type LodgmentSection =
  | { kind: "lodged"; title: string; summary: string; recordedBy: string; canReplace: boolean }
  | {
      kind: "reopened";
      title: string;
      summary: string;
      recordedBy: string;
      /** What happened since, and what to do about it. */
      note: string;
      /** Set when the viewer records lodgment for this fund: why the record cannot be replaced yet, shown beside the switched-off button. Null: no button. */
      replaceReason: string | null;
    }
  | { kind: "delegated"; text: string }
  | { kind: "form"; enabled: boolean; reason: string | null };

export const lodgedSummary = (lodgment: Pick<Lodgment, "date" | "reference">): string => `${dateLabel(lodgment.date)} · ${lodgment.reference}`;

/** Who records lodgment under the fund's governance, as the sentence that replaces the form for everyone else. */
export function delegatedText(lodgerRole: string, governance: GovernanceMode): string {
  return `Recorded by the ${lodgerRole.toLowerCase()} under this fund's governance (${GOVERNANCE_PHRASE[governance]}).`;
}

/**
 * Which of the four things the section shows: the record that exists; the same record on a fund that was reopened after it was lodged (kept
 * as history, with a warning and no way to replace it yet); a sentence about who records it (the viewer's role may not); or the form
 * (switched off, with a visible reason, until the fund is signed off and every item is done).
 */
export function lodgmentSection(input: {
  lodgment: Lodgment | null;
  kind: Lodgment["kind"];
  /** The fund's workflow status. */
  status: WorkflowStatus;
  /** The viewer's role and the fund's governance allow recording lodgment (ignores the fund's status). */
  mayLodge: boolean;
  /** mayLodge and the fund is signed off (workflowView.can.lodge). */
  canLodge: boolean;
  /** Every readiness item is done. */
  ready: boolean;
  /** Role that records lodgment under this fund's governance, "Tax agent" or "Head of Tax". */
  lodgerRole: string;
  governance: GovernanceMode;
}): LodgmentSection {
  const { lodgment } = input;
  if (lodgment) {
    const summary = lodgedSummary(lodgment);
    const recordedBy = `Recorded by ${lodgment.actor}`;
    if (reopenedAfterLodgment(lodgment, input.status)) {
      const words = reopenedWords(lodgment.kind);
      return { kind: "reopened", title: words.title, summary, recordedBy, note: words.note, replaceReason: input.mayLodge ? words.reason : null };
    }
    return { kind: "lodged", title: lodgmentWords(lodgment.kind).lodgedTitle, summary, recordedBy, canReplace: input.canLodge };
  }
  if (!input.mayLodge) return { kind: "delegated", text: delegatedText(input.lodgerRole, input.governance) };
  const enabled = input.canLodge && input.ready;
  return { kind: "form", enabled, reason: enabled ? null : input.ready ? NOT_SIGNED_OFF_REASON : NOT_READY_REASON };
}

/** `lodgmentSection` for a viewer, fund, return and workflow as the selectors give them. */
export function lodgmentSectionFor(input: { user: User; fund: Fund; view: ReturnView; workflow: Pick<WorkflowView, "can"> }): LodgmentSection {
  const { user, fund, view, workflow } = input;
  return lodgmentSection({
    lodgment: view.lodgment,
    kind: view.lodgmentKind,
    status: fund.status,
    mayLodge: can(user, "lodge", fund, fund.governance),
    canLodge: workflow.can.lodge,
    ready: view.ready,
    lodgerRole: ROLE_LABEL[lodgmentRole(fund.governance)],
    governance: fund.governance,
  });
}

// ------------------------------------------------------------------------------------------------------------------- form
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

/** True for a real calendar date written as YYYY-MM-DD (refuses 2026-02-30 and 2026-13-01). */
export function isRealISODate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

/**
 * Stricter than the domain action (a non-empty reference and a real date): the reference is bounded and limited to letters, digits, spaces and
 * - _ / . : #, and a date in the future is refused. `referenceLabel` is the field's name ("ATO receipt reference").
 */
export function checkLodgment(draft: LodgmentDraft, today: ISODate, referenceLabel: string): LodgmentCheck {
  const errors: LodgmentErrors = {};
  const reference = draft.reference.trim();
  if (reference === "") errors.reference = `Enter the ${referenceLabel}.`;
  else if (reference.length < REFERENCE_MIN_LENGTH) errors.reference = `The reference is too short. Use at least ${REFERENCE_MIN_LENGTH} characters.`;
  else if (reference.length > REFERENCE_MAX_LENGTH) errors.reference = `The reference is too long. Use ${REFERENCE_MAX_LENGTH} characters or fewer.`;
  else if (!REFERENCE_CHARACTERS.test(reference)) errors.reference = "Use letters, numbers, spaces and - _ / . : # only.";

  const date = draft.date.trim();
  if (date === "") errors.date = "Enter the date.";
  else if (!isRealISODate(date)) errors.date = "Enter a valid date.";
  else if (date > today) errors.date = "The date can't be in the future.";

  if (errors.reference !== undefined || errors.date !== undefined) return { ok: false, errors };
  return { ok: true, reference, date };
}

/** What the form starts with: an empty reference and today for a first record, the existing record's values when correcting it. */
export function initialDraft(lodgment: Pick<Lodgment, "reference" | "date"> | null, today: ISODate): LodgmentDraft {
  return lodgment ? { reference: lodgment.reference, date: lodgment.date } : { reference: "", date: today };
}
