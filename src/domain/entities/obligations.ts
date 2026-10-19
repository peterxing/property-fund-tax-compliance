// OWNER: Data & calendar agent (v3 G7). Custom compliance obligations on the calendar ("entity-*-obligation").
import type { ActionResult, AppData, Ctx, CustomObligation, DeadlineRow, Fund, ISODate, ObligationCategory, ObligationRecurrence } from "../types.ts";
import type { FeatureProviders, RiskItem } from "../providers.ts";
import type { EntityAction, EntityObligationDraft } from "./types.ts";
import { appendAudit } from "../core/audit.ts";
import { nextSequenceId } from "../core/ids.ts";
import { MAX_NAME, MAX_OBLIGATIONS, MAX_STRING, isISODate } from "../core/validate.ts";
import { dateLabel, toISODate } from "../format.ts";
import { can, userHasFund } from "../permissions.ts";

type ObligationAction = Extract<EntityAction, { type: "entity-add-obligation" | "entity-update-obligation" | "entity-delete-obligation" | "entity-set-obligation-done" }>;

const CATEGORIES: readonly ObligationCategory[] = ["council-rates", "insurance", "payroll", "fbt", "other"];
const RECURRENCES: readonly ObligationRecurrence[] = ["none", "monthly", "quarterly", "annually"];
const MAX_EXPANDED = 500;

const fail = (reason: string): ActionResult => ({ ok: false, reason });
const clean = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

export const OBLIGATION_CATEGORY_LABEL: Record<ObligationCategory, string> = {
  "council-rates": "Council rates",
  insurance: "Insurance",
  payroll: "Payroll",
  fbt: "FBT",
  other: "Other",
};

export const OBLIGATION_RECURRENCE_LABEL: Record<ObligationRecurrence, string> = {
  none: "Once",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

function findFund(data: AppData, fundId: string): Fund | undefined {
  return data.funds.find((fund) => fund.id === fundId);
}

function editableObligationFund(data: AppData, fundId: string, ctx: Ctx): Fund | string {
  const fund = findFund(data, fundId);
  if (!fund) return "Fund not found";
  if (!userHasFund(ctx.user, fund.id)) return "You don't have access to this fund";
  if (!can(ctx.user, "edit", fund, fund.governance)) return "You don't have permission to edit obligations for this fund";
  return fund;
}

function validateDraft(data: AppData, draft: EntityObligationDraft): { fund: Fund; title: string; notes: string } | string {
  const fund = findFund(data, draft.fundId);
  if (!fund) return "Fund not found";
  const title = clean(draft.title);
  const notes = clean(draft.notes);
  if (!title) return "Obligation title is required";
  if (title.length > MAX_NAME) return `Title can have up to ${MAX_NAME} characters`;
  if (!CATEGORIES.includes(draft.category)) return "Choose a valid obligation category";
  if (!isISODate(draft.firstDue)) return "First due date must be a real date";
  if (!RECURRENCES.includes(draft.recurrence)) return "Choose a valid recurrence";
  if (notes.length > MAX_STRING) return `Notes can have up to ${MAX_STRING} characters`;
  return { fund, title, notes };
}

function addObligation(data: AppData, action: Extract<EntityAction, { type: "entity-add-obligation" }>, ctx: Ctx): ActionResult {
  const allowed = editableObligationFund(data, action.obligation.fundId, ctx);
  if (typeof allowed === "string") return fail(allowed);
  const parsed = validateDraft(data, action.obligation);
  if (typeof parsed === "string") return fail(parsed);
  if (data.obligations.length >= MAX_OBLIGATIONS) return fail("The portfolio already has the maximum number of custom obligations");
  const obligation: CustomObligation = {
    id: nextSequenceId("ob", data.obligations.map((item) => item.id)),
    fundId: parsed.fund.id,
    title: parsed.title,
    category: action.obligation.category,
    firstDue: action.obligation.firstDue,
    recurrence: action.obligation.recurrence,
    notes: parsed.notes,
    done: [],
    createdBy: ctx.user.name,
    createdAt: `${ctx.now.getFullYear()}-${String(ctx.now.getMonth() + 1).padStart(2, "0")}-${String(ctx.now.getDate()).padStart(2, "0")}T${String(ctx.now.getHours()).padStart(2, "0")}:${String(ctx.now.getMinutes()).padStart(2, "0")}:${String(ctx.now.getSeconds()).padStart(2, "0")}`,
  };
  return {
    ok: true,
    data: {
      ...data,
      obligations: [...data.obligations, obligation],
      audit: appendAudit(data, ctx, [{ fundId: obligation.fundId, action: "Custom obligation added", detail: `${obligation.title} · ${dateLabel(obligation.firstDue)}` }]),
    },
  };
}

function updateObligation(data: AppData, action: Extract<EntityAction, { type: "entity-update-obligation" }>, ctx: Ctx): ActionResult {
  const existing = data.obligations.find((item) => item.id === action.id);
  if (!existing) return fail("Obligation not found");
  const allowed = editableObligationFund(data, existing.fundId, ctx);
  if (typeof allowed === "string") return fail(allowed);
  const draft: EntityObligationDraft = { ...existing, ...action.patch, fundId: existing.fundId };
  const parsed = validateDraft(data, draft);
  if (typeof parsed === "string") return fail(parsed);
  const next: CustomObligation = {
    ...existing,
    title: parsed.title,
    category: draft.category,
    firstDue: draft.firstDue,
    recurrence: draft.recurrence,
    notes: parsed.notes,
    done: existing.done.filter((date) => date >= draft.firstDue),
  };
  if (JSON.stringify(next) === JSON.stringify(existing)) return { ok: true, data };
  return {
    ok: true,
    data: {
      ...data,
      obligations: data.obligations.map((item) => (item.id === existing.id ? next : item)),
      audit: appendAudit(data, ctx, [{ fundId: next.fundId, action: "Custom obligation updated", detail: next.title }]),
    },
  };
}

function deleteObligation(data: AppData, action: Extract<EntityAction, { type: "entity-delete-obligation" }>, ctx: Ctx): ActionResult {
  const existing = data.obligations.find((item) => item.id === action.id);
  if (!existing) return fail("Obligation not found");
  const allowed = editableObligationFund(data, existing.fundId, ctx);
  if (typeof allowed === "string") return fail(allowed);
  return {
    ok: true,
    data: {
      ...data,
      obligations: data.obligations.filter((item) => item.id !== existing.id),
      audit: appendAudit(data, ctx, [{ fundId: existing.fundId, action: "Custom obligation deleted", detail: existing.title }]),
    },
  };
}

function setDone(data: AppData, action: Extract<EntityAction, { type: "entity-set-obligation-done" }>, ctx: Ctx): ActionResult {
  const existing = data.obligations.find((item) => item.id === action.id);
  if (!existing) return fail("Obligation not found");
  const allowed = editableObligationFund(data, existing.fundId, ctx);
  if (typeof allowed === "string") return fail(allowed);
  if (!isISODate(action.dueDate)) return fail("Done date must be a real date");
  if (action.dueDate < existing.firstDue) return fail("Done date cannot be before the first due date");
  const done = action.done ? [...new Set([...existing.done, action.dueDate])].sort() : existing.done.filter((date) => date !== action.dueDate);
  if (done.length > 500) return fail("This obligation has too many completed occurrences");
  if (done.join("|") === existing.done.join("|")) return { ok: true, data };
  return {
    ok: true,
    data: {
      ...data,
      obligations: data.obligations.map((item) => (item.id === existing.id ? { ...item, done } : item)),
      audit: appendAudit(data, ctx, [{ fundId: existing.fundId, action: action.done ? "Custom obligation marked done" : "Custom obligation reopened", detail: `${existing.title} · ${dateLabel(action.dueDate)}` }]),
    },
  };
}

export function applyObligationAction(data: AppData, action: ObligationAction, ctx: Ctx): ActionResult {
  switch (action.type) {
    case "entity-add-obligation":
      return addObligation(data, action, ctx);
    case "entity-update-obligation":
      return updateObligation(data, action, ctx);
    case "entity-delete-obligation":
      return deleteObligation(data, action, ctx);
    case "entity-set-obligation-done":
      return setDone(data, action, ctx);
  }
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addMonthsClamped(date: ISODate, months: number, anchorDay = Number(date.slice(8, 10))): ISODate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1;
  const target = new Date(Date.UTC(year, month + months, 1));
  const y = target.getUTCFullYear();
  const m = target.getUTCMonth();
  const d = Math.min(anchorDay, daysInMonth(y, m));
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addRecurrence(date: ISODate, recurrence: ObligationRecurrence, step: number): ISODate {
  if (recurrence === "monthly") return addMonthsClamped(date, step);
  if (recurrence === "quarterly") return addMonthsClamped(date, step * 3);
  if (recurrence === "annually") return addMonthsClamped(date, step * 12);
  return date;
}

function horizon(now: Date): ISODate {
  return addMonthsClamped(toISODate(now), 18);
}

export interface ObligationOccurrence {
  obligation: CustomObligation;
  dueDate: ISODate;
  status: "done" | "open" | "overdue";
}

export function obligationOccurrences(obligation: CustomObligation, now: Date, end = horizon(now)): ObligationOccurrence[] {
  const today = toISODate(now);
  const rows: ObligationOccurrence[] = [];
  for (let i = 0; i < MAX_EXPANDED; i++) {
    const dueDate = addRecurrence(obligation.firstDue, obligation.recurrence, i);
    if (dueDate > end) break;
    const done = obligation.done.includes(dueDate);
    rows.push({ obligation, dueDate, status: done ? "done" : dueDate < today ? "overdue" : "open" });
    if (obligation.recurrence === "none") break;
  }
  return rows;
}

export function obligationProviderRows(data: AppData, fund: Fund, now: Date): DeadlineRow[] {
  return data.obligations
    .filter((obligation) => obligation.fundId === fund.id)
    .flatMap((obligation) =>
      obligationOccurrences(obligation, now).map((occurrence) => ({
        date: occurrence.dueDate,
        fundId: fund.id,
        fundName: fund.name,
        obligation: occurrence.obligation.title,
        status: occurrence.status,
        workspace: "/calendar",
      })),
    );
}

export function obligationRiskRows(data: AppData, fund: Fund, now: Date): RiskItem[] {
  return data.obligations
    .filter((obligation) => obligation.fundId === fund.id)
    .flatMap((obligation) => obligationOccurrences(obligation, now).filter((occurrence) => occurrence.status === "overdue"))
    .map((occurrence) => ({
      id: `obligation-${occurrence.obligation.id}-${occurrence.dueDate}`,
      fundId: fund.id,
      severity: "note" as const,
      area: "Custom obligations",
      title: `${occurrence.obligation.title} is overdue`,
      detail: `${OBLIGATION_CATEGORY_LABEL[occurrence.obligation.category]} was due ${dateLabel(occurrence.dueDate)}.${occurrence.obligation.notes ? ` ${occurrence.obligation.notes}` : ""}`,
      workspace: "/calendar",
    }));
}

export const obligationsProviders: FeatureProviders = {
  id: "obligations",
  deadlines: obligationProviderRows,
  risks: obligationRiskRows,
};
