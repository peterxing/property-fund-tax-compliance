// OWNER: GST & BAS agent (F1). Pure reducers for this feature's actions.
import type { Action, ActionResult, AppData, Ctx, Fund, FundId } from "../types.ts";
import { can, userHasFund } from "../permissions.ts";
import { appendAudit } from "../core/audit.ts";
import { nextSequenceId } from "../core/ids.ts";
import { Invalid } from "../core/schemaKit.ts";
import { isISODate, isSafeInt, MAX_IMPORT_ROWS, MAX_NAME } from "../core/validate.ts";
import { money } from "../format.ts";
import { gstRateByDate as auGstRateByDate } from "../../engine/au/gst.ts";
import { lookupAuGstCode } from "../../engine/au/gstCodes.ts";
import { gstRateByDate as sgGstRateByDate } from "../../engine/gst.ts";
import { lookupGstCode } from "../../engine/gstCodes.ts";
import { gstPeriods, gstReturnView } from "./index.ts";
import { gstEntry } from "./schema.ts";
import type { GstAction, GstEntry, GstEntryDraft, GstFiling } from "./types.ts";

const fail = (reason: string): ActionResult => ({ ok: false, reason });
const succeed = (data: AppData): ActionResult => ({ ok: true, data });

export function isGstAction(action: Action): action is GstAction {
  return action.type.startsWith("gst-");
}

function findFund(data: AppData, fundId: FundId): Fund | undefined {
  return data.funds.find((fund) => fund.id === fundId);
}

function cleanText(value: unknown, name: string): string | null {
  if (typeof value !== "string") return `${name} must be text`;
  const trimmed = value.trim();
  if (!trimmed) return `${name} is required`;
  if (trimmed.length > MAX_NAME) return `${name} can have up to ${MAX_NAME} characters`;
  return null;
}

function expectedTax(f: Fund, draft: GstEntryDraft): number | null {
  if (f.market === "AU") {
    const code = lookupAuGstCode(draft.code, draft.date);
    if (!code || code.rateModel === "MANUAL") return null;
    if (code.rateModel === "ZERO") return 0;
    if (code.rateModel === "MARGIN_1_11") return Math.round(draft.net / 11);
    return Math.round((draft.net * auGstRateByDate(draft.date)) / 10_000);
  }
  const code = lookupGstCode(draft.code, draft.date);
  if (!code) return null;
  return code.rateBehavior === "PREVAILING_STANDARD_RATE" || code.rateBehavior === "IMPORT_GST_DEFERRED" ? Math.round((draft.net * sgGstRateByDate(draft.date)) / 10_000) : 0;
}

function checkEntryDraft(data: AppData, draft: GstEntryDraft): string | null {
  const f = findFund(data, draft.fundId);
  if (!f) return "Fund not found";
  for (const [value, name] of [[draft.description, "Description"], [draft.counterparty, "Counterparty"], [draft.code, "GST code"]] as const) {
    const problem = cleanText(value, name);
    if (problem) return problem;
  }
  if (!isISODate(draft.date)) return "Entry date must be a date (YYYY-MM-DD)";
  if (!Number.isSafeInteger(draft.net) || !Number.isSafeInteger(draft.tax)) return "Amounts must be whole cents";
  const code = f.market === "AU" ? lookupAuGstCode(draft.code, draft.date) : lookupGstCode(draft.code, draft.date);
  if (!code) return `${draft.code} is not a ${f.market} GST code for ${draft.date}`;
  const expected = expectedTax(f, draft);
  if (expected !== null && Math.abs(expected - draft.tax) > 1) return `GST amount for ${draft.code} should be ${money(expected, f.currency, 2)} for the net amount`;
  return null;
}

function schemaProblem(entry: GstEntry): string | null {
  try {
    gstEntry(entry, "GST entry");
    return null;
  } catch (error) {
    if (error instanceof Invalid) return error.message.replace(/^GST entry\.?/, "GST entry");
    return "GST entry could not be validated";
  }
}

function entryFromDraft(id: string, draft: GstEntryDraft): GstEntry {
  const entry: GstEntry = {
    id,
    fundId: draft.fundId,
    date: draft.date,
    description: draft.description.trim(),
    counterparty: draft.counterparty.trim(),
    code: draft.code.trim().toUpperCase(),
    net: draft.net,
    tax: draft.tax,
  };
  if (draft.propertyId?.trim()) entry.propertyId = draft.propertyId.trim();
  if (draft.invoiceRef?.trim()) entry.invoiceRef = draft.invoiceRef.trim();
  return entry;
}

function checkedEntryFromDraft(data: AppData, id: string, draft: GstEntryDraft): GstEntry | string {
  const problem = checkEntryDraft(data, draft);
  if (problem) return problem;
  const entry = entryFromDraft(id, draft);
  return schemaProblem(entry) ?? entry;
}

function editBlock(data: AppData, fundId: FundId, ctx: Ctx, periodEnd?: string): string | Fund {
  const f = findFund(data, fundId);
  if (!f) return "Fund not found";
  if (!userHasFund(ctx.user, fundId)) return "You don't have access to this fund";
  if (!can(ctx.user, "edit", f, f.governance)) return "You don't have permission to edit this fund";
  if (periodEnd && gstPeriods(data, f, ctx.now).some((period) => period.end === periodEnd && period.status === "lodged")) {
    return "This GST period is lodged. Unlock it before editing.";
  }
  return f;
}

function periodEndFor(data: AppData, entry: Pick<GstEntry, "fundId" | "date">, ctx: Ctx): string | null {
  const f = findFund(data, entry.fundId);
  if (!f) return null;
  return gstPeriods(data, f, ctx.now).find((period) => entry.date >= period.start && entry.date <= period.end)?.end ?? null;
}

function periodForDate(data: AppData, fundId: FundId, date: string, ctx: Ctx): ReturnType<typeof gstPeriods>[number] | null {
  const f = findFund(data, fundId);
  if (!f) return null;
  return gstPeriods(data, f, ctx.now).find((period) => date >= period.start && date <= period.end) ?? null;
}

function lockedPeriodReason(data: AppData, fundId: FundId, date: string, ctx: Ctx): string | null {
  const filing = data.gstFilings.find((record) => record.fundId === fundId && date >= record.periodStart && date <= record.periodEnd);
  if (!filing) return null;
  const period = periodForDate(data, fundId, date, ctx);
  const label = period?.filing?.id === filing.id ? period.label : `${filing.kind} ${filing.periodStart} to ${filing.periodEnd}`;
  return `${label} is lodged. Unlock it before editing.`;
}

function withAudit(data: AppData, ctx: Ctx, next: Partial<AppData>, fundId: FundId, action: string, detail?: string): ActionResult {
  return succeed({ ...data, ...next, audit: appendAudit(data, ctx, [{ fundId, action, detail }]) });
}

function addEntry(data: AppData, action: Extract<GstAction, { type: "gst-add-entry" }>, ctx: Ctx): ActionResult {
  const periodEnd = periodEndFor(data, action.entry, ctx);
  const block = editBlock(data, action.entry.fundId, ctx, periodEnd ?? undefined);
  if (typeof block === "string") return fail(block);
  const lock = lockedPeriodReason(data, action.entry.fundId, action.entry.date, ctx);
  if (lock) return fail(lock);
  const entry = checkedEntryFromDraft(data, action.entry.id ?? nextSequenceId("gst", data.gstLedger.map((r) => r.id)), action.entry);
  if (typeof entry === "string") return fail(entry);
  return withAudit(data, ctx, { gstLedger: [...data.gstLedger, entry] }, entry.fundId, "GST entry added", `${entry.invoiceRef ?? entry.description}: ${entry.code} ${money(entry.tax, block.currency, 2)}`);
}

function updateEntry(data: AppData, action: Extract<GstAction, { type: "gst-update-entry" }>, ctx: Ctx): ActionResult {
  const current = data.gstLedger.find((entry) => entry.id === action.id);
  if (!current) return fail("GST entry not found");
  const block = editBlock(data, current.fundId, ctx);
  if (typeof block === "string") return fail(block);
  const oldLock = lockedPeriodReason(data, current.fundId, current.date, ctx);
  if (oldLock) return fail(oldLock);
  const changes = action.changes;
  const merged: GstEntryDraft = {
    ...current,
    date: changes.date ?? current.date,
    description: changes.description ?? current.description,
    counterparty: changes.counterparty ?? current.counterparty,
    code: changes.code ?? current.code,
    net: changes.net ?? current.net,
    tax: changes.tax ?? current.tax,
    propertyId: changes.propertyId ?? current.propertyId,
    invoiceRef: changes.invoiceRef ?? current.invoiceRef,
  };
  const newLock = lockedPeriodReason(data, current.fundId, merged.date, ctx);
  if (newLock) return fail(newLock);
  const next = checkedEntryFromDraft(data, current.id, { ...merged, fundId: current.fundId });
  if (typeof next === "string") return fail(next);
  if (JSON.stringify(next) === JSON.stringify(current)) return succeed(data);
  return withAudit(data, ctx, { gstLedger: data.gstLedger.map((entry) => (entry.id === current.id ? next : entry)) }, current.fundId, "GST entry updated", `${next.invoiceRef ?? next.description}: ${next.code}`);
}

function deleteEntry(data: AppData, action: Extract<GstAction, { type: "gst-delete-entry" }>, ctx: Ctx): ActionResult {
  const current = data.gstLedger.find((entry) => entry.id === action.id);
  if (!current) return fail("GST entry not found");
  const periodEnd = periodEndFor(data, current, ctx);
  const block = editBlock(data, current.fundId, ctx, periodEnd ?? undefined);
  if (typeof block === "string") return fail(block);
  const lock = lockedPeriodReason(data, current.fundId, current.date, ctx);
  if (lock) return fail(lock);
  return withAudit(data, ctx, { gstLedger: data.gstLedger.filter((entry) => entry.id !== current.id) }, current.fundId, "GST entry deleted", current.invoiceRef ?? current.description);
}

function importEntries(data: AppData, action: Extract<GstAction, { type: "gst-import-entries" }>, ctx: Ctx): ActionResult {
  if (!Array.isArray(action.entries) || action.entries.length === 0) return fail("The import has no GST entries");
  if (action.entries.length > MAX_IMPORT_ROWS) return fail(`A GST import can have up to ${MAX_IMPORT_ROWS} rows`);
  const block = editBlock(data, action.fundId, ctx);
  if (typeof block === "string") return fail(block);
  const ids = new Set(data.gstLedger.map((entry) => entry.id));
  const imported: GstEntry[] = [];
  let nextImportNo = 1;
  while (ids.has(`gst-${nextImportNo}`)) nextImportNo += 1;
  const nextImportId = (): string => {
    while (ids.has(`gst-${nextImportNo}`)) nextImportNo += 1;
    const id = `gst-${nextImportNo}`;
    ids.add(id);
    nextImportNo += 1;
    return id;
  };
  for (const [index, row] of action.entries.entries()) {
    const draft = { ...row, fundId: action.fundId };
    const lock = lockedPeriodReason(data, action.fundId, draft.date, ctx);
    if (lock) return fail(`Row ${index + 1} is dated in lodged period: ${lock}`);
    const entry = checkedEntryFromDraft(data, nextImportId(), draft);
    if (typeof entry === "string") return fail(`Row ${index + 1}: ${entry}`);
    imported.push(entry);
  }
  const gstLedger = [
    ...data.gstLedger.filter((entry) => {
      if (entry.fundId !== action.fundId) return true;
      return lockedPeriodReason(data, entry.fundId, entry.date, ctx) !== null;
    }),
    ...imported,
  ];
  return withAudit(data, ctx, { gstLedger }, action.fundId, "GST ledger imported", `${imported.length} entries`);
}

function recordLodgment(data: AppData, action: Extract<GstAction, { type: "gst-record-lodgment" }>, ctx: Ctx): ActionResult {
  const f = findFund(data, action.fundId);
  if (!f) return fail("Fund not found");
  if (!userHasFund(ctx.user, f.id)) return fail("You don't have access to this fund");
  if (!can(ctx.user, "lodge", f, f.governance)) return fail("You don't have permission to record lodgment for this fund");
  if (!action.reference.trim()) return fail("Reference is required");
  if (!isISODate(action.lodgedDate)) return fail("Lodged date must be a date (YYYY-MM-DD)");
  const period = gstPeriods(data, f, ctx.now).find((p) => p.end === action.periodEnd);
  if (!period) return fail("GST period not found");
  const view = gstReturnView(data, f.id, period.end, ctx);
  const filing: GstFiling = {
    id: period.filing?.id ?? nextSequenceId("gstf", data.gstFilings.map((record) => record.id)),
    fundId: f.id,
    periodStart: period.start,
    periodEnd: period.end,
    kind: period.kind,
    reference: action.reference.trim(),
    lodgedDate: action.lodgedDate,
    actor: ctx.user.name,
    figures: Object.fromEntries(view.boxes.map((box) => [box.ref, box.amount])),
  };
  const others = data.gstFilings.filter((record) => !(record.fundId === f.id && record.periodStart === period.start && record.periodEnd === period.end));
  return withAudit(data, ctx, { gstFilings: [...others, filing] }, f.id, `${period.kind} lodged`, filing.reference);
}

function unlockPeriod(data: AppData, action: Extract<GstAction, { type: "gst-unlock-period" }>, ctx: Ctx): ActionResult {
  const f = findFund(data, action.fundId);
  if (!f) return fail("Fund not found");
  if (!userHasFund(ctx.user, f.id)) return fail("You don't have access to this fund");
  if (!can(ctx.user, "reopen", f, f.governance)) return fail("You don't have permission to unlock a lodged GST period");
  const reason = action.reason.trim();
  if (!reason) return fail("Unlock reason is required");
  const filing = data.gstFilings.find((record) => record.fundId === f.id && record.periodEnd === action.periodEnd);
  if (!filing) return fail("This period is not lodged");
  return withAudit(data, ctx, { gstFilings: data.gstFilings.filter((record) => record !== filing) }, f.id, `${filing.kind} unlocked`, reason);
}

export function applyGstAction(data: AppData, action: GstAction, ctx: Ctx): ActionResult {
  switch (action.type) {
    case "gst-add-entry": return addEntry(data, action, ctx);
    case "gst-update-entry": return updateEntry(data, action, ctx);
    case "gst-delete-entry": return deleteEntry(data, action, ctx);
    case "gst-import-entries": return importEntries(data, action, ctx);
    case "gst-record-lodgment": return recordLodgment(data, action, ctx);
    case "gst-unlock-period": return unlockPeriod(data, action, ctx);
    default: return fail("Unknown GST action");
  }
}
