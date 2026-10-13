// Audit trail helpers. The trail is stored in insertion order (new entries are appended); views sort it newest first.
import type { AuditEntry, AppData, Ctx, FundId } from "../types.ts";
import { toLocalDateTime } from "../format.ts";
import { nextSequenceId } from "./ids.ts";

export const AUDIT_SUBMITTED = "Submitted for review";
export const AUDIT_SIGNED_OFF = "Signed off";

export interface AuditDraft {
  fundId: FundId;
  action: string;
  detail?: string;
}

/** The audit array with the drafts appended as ctx.user at ctx.now (ids a-<n>, one per draft). Never mutates `data`. */
export function appendAudit(data: AppData, ctx: Ctx, drafts: readonly AuditDraft[]): AuditEntry[] {
  const at = toLocalDateTime(ctx.now);
  const ids = data.audit.map((entry) => entry.id);
  const added: AuditEntry[] = [];
  for (const draft of drafts) {
    const id = nextSequenceId("a", ids);
    ids.push(id);
    const entry: AuditEntry = { id, fundId: draft.fundId, at, actor: ctx.user.name, action: draft.action };
    if (draft.detail !== undefined && draft.detail !== "") entry.detail = draft.detail;
    added.push(entry);
  }
  return [...data.audit, ...added];
}

/** The most recent entry of a fund with this action (by time; between equal times the later-recorded one wins). */
export function latestAudit(audit: readonly AuditEntry[], fundId: FundId, action: string): AuditEntry | undefined {
  let best: AuditEntry | undefined;
  for (const entry of audit) {
    if (entry.fundId !== fundId || entry.action !== action) continue;
    if (!best || entry.at >= best.at) best = entry;
  }
  return best;
}

/** Display name of whoever last submitted the fund for review, if the trail says. */
export function submittedBy(audit: readonly AuditEntry[], fundId: FundId): string | undefined {
  return latestAudit(audit, fundId, AUDIT_SUBMITTED)?.actor;
}

/** Newest first by time; entries with the same time keep the order they were recorded in, latest first. */
export function newestFirst<T>(items: readonly T[], timeOf: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ta = timeOf(a.item);
      const tb = timeOf(b.item);
      if (ta !== tb) return ta < tb ? 1 : -1;
      return b.index - a.index;
    })
    .map((x) => x.item);
}
