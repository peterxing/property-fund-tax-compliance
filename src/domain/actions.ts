// Domain reducers. OWNER: domain-core agent. Pure: (data, action, ctx) -> new data or a failure reason. Never mutates `data`
// (unchanged parts of the state are shared with the input, changed parts are copied).
// Every successful action appends AuditEntry rows (actor = ctx.user.name, at = toLocalDateTime(ctx.now), id = a-<n>) and enforces the
// permission and workflow rules below. Rule violations return { ok: false, reason } with a user-readable reason.
//
// Rules (mirror the reference app, verified live):
//  * Permissions: permissions.can(ctx.user, action, fund, fund.governance). A user must have access to the fund. Checks run in the order
//    fund access, role/governance permission, workflow status, then state rules (core/workflow.ts is the single source for these gates).
//  * edit-type actions (update-*, import-tb, sync-distribution-from-tb) need "edit" and status "Preparing".
//  * submit: Preparing -> In review; clears nothing. Records who submitted (audit "Submitted for review").
//  * return: In review -> Preparing; clears all approvals for the fund. Audit "Returned to preparer".
//  * approve: only In review; level "review" needs approve-review, "agent" needs approve-agent and an agent level in the governance.
//      Whoever submitted the fund cannot approve it as reviewer (the latest "Submitted for review" audit actor). Approval is recorded once
//      per level: approving again replaces the older approval of that level.
//  * sign-off: In review -> Signed off; needs "sign-off" and every approval level required by the governance recorded. Open exceptions and
//      open queries do NOT block a sign-off made from the fund itself (the person signing decides); the button is simply disabled while
//      approvals are missing ("Sign-off waits for: Reviewer and Tax agent approval."). Only BULK sign-off skips funds with open
//      exceptions, open queries or missing approvals. Audit "Signed off", detail "Components and withholding locked". Approvals are kept.
//  * submit is never blocked by exceptions (bulk submit included). Single-fund approve-as-reviewer is not blocked by exceptions either;
//      bulk approve skips funds with open exceptions.
//  * reopen: Signed off -> Preparing; clears approvals; audit "Reopened" detail "Sign-off removed; components unlocked".
//  * publish-notice: needs "publish"; a notice that already has publishedOn is locked. Sets publishedOn = today and snapshots what the
//      notice told holders (`notified`). Audit "Fund payment notice published" (AU) / "Distribution tax notice announced" (SG).
//  * record-lodgment: needs "lodge" under the governance; only when the fund is Signed off. Replaces any earlier record of the same kind.
//  * raise-query / reply-query / resolve-query: need "query" and fund access; allowed in any status; resolve sets status "resolved".
//  * set-governance / set-user-funds: need "manage-access"; changing governance of a Signed-off fund is refused; changing governance
//      clears approvals that are no longer required.
//
// Conventions:
//  * An edit that changes nothing (same value, or no key differs) succeeds as a no-op: the SAME `data` object comes back and no audit
//    entry is written, so stores do not notify and the trail stays free of noise.
//  * Edit payloads are validated: amounts are whole cents (safe integers) and may not be negative, units are whole numbers of zero or more
//    (units on issue at least 1), update-inputs only accepts keys of the fund's own market, update-remitted accepts null (not remitted).
//  * Audit wording follows the reference app and the seeded trail ("Approved — reviewer", "Account 4000 mapped", "Query answered", ...).
import { applyFeatureAction } from "./features.ts";
import type {
  Action,
  ActionResult,
  AppData,
  BulkKind,
  BulkResult,
  Ctx,
  Fund,
  FundId,
  Lodgment,
  Query,
  TbRow,
  User,
} from "./types.ts";
import { UNMAPPED_CATEGORY } from "./types.ts";
import { GOVERNANCE, GOVERNANCE_MODES, ROLE_LABEL, can, lodgmentRole, userHasFund } from "./permissions.ts";
import { integer, money, toISODate, toLocalDateTime } from "./format.ts";
import { moduleFor } from "./modules.ts";
import { AUDIT_SIGNED_OFF, AUDIT_SUBMITTED, appendAudit } from "./core/audit.ts";
import type { AuditDraft } from "./core/audit.ts";
import { exceptionsFor } from "./core/calc.ts";
import { nextSequenceId } from "./core/ids.ts";
import { categoryLabel, inputLabel } from "./core/labels.ts";
import { auFundPayment, auNoticeAmounts, sgNoticeAmounts } from "./core/notices.ts";
import { MAX_ACCOUNT, MAX_ARRAY, MAX_IMPORT_ROWS, MAX_NAME, MAX_STRING, isAmount, isISODate, isSafeInt } from "./core/validate.ts";
import { NO_ACCESS, STEP_TO, bulkBlock, levelOfStep, stepBlock } from "./core/workflow.ts";
import type { Step } from "./core/workflow.ts";
import { buildCalcVersion } from "./governance/versions.ts";

const fail = (reason: string): ActionResult => ({ ok: false, reason });
const succeed = (data: AppData): ActionResult => ({ ok: true, data });

const FUND_NOT_FOUND = "Fund not found";
const LODGMENT_KINDS: Record<Fund["market"], Array<Lodgment["kind"]>> = { AU: ["aiir", "return"], SG: ["form-ut"] };

const findFund = (data: AppData, fundId: FundId): Fund | undefined => data.funds.find((f) => f.id === fundId);

function replaceFund(data: AppData, next: Fund): Fund[] {
  return data.funds.map((f) => (f.id === next.id ? next : f));
}

function withAudit(data: AppData, ctx: Ctx, drafts: readonly AuditDraft[], changes: Partial<AppData>): ActionResult {
  return succeed({ ...data, ...changes, audit: appendAudit(data, ctx, drafts) });
}

/** The fund when ctx.user may edit it right now, otherwise the reason they may not. */
function editableFund(data: AppData, fundId: FundId, user: User): Fund | string {
  const fund = findFund(data, fundId);
  if (!fund) return FUND_NOT_FOUND;
  if (!userHasFund(user, fund.id)) return NO_ACCESS;
  if (!can(user, "edit", fund, fund.governance)) return "You don't have permission to edit this fund";
  if (fund.status === "Signed off") return "This fund is signed off. Reopen it to edit.";
  if (fund.status === "In review") return "This fund is in review. Return it to the preparer to edit.";
  return fund;
}

function reachableFund(data: AppData, fundId: FundId, user: User): Fund | string {
  const fund = findFund(data, fundId);
  if (!fund) return FUND_NOT_FOUND;
  if (!userHasFund(user, fund.id)) return NO_ACCESS;
  return fund;
}

// ---------------------------------------------------------------------------------------------------- workflow steps
const STEP_AUDIT: Record<"submit" | "return" | "sign-off" | "reopen", { action: string; detail?: string }> = {
  submit: { action: AUDIT_SUBMITTED },
  return: { action: "Returned to preparer" },
  "sign-off": { action: AUDIT_SIGNED_OFF, detail: "Components and withholding locked" },
  reopen: { action: "Reopened", detail: "Sign-off removed; components unlocked" },
};

function reopenReason(value: unknown): string | null {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length < 5 || reason.length > 500) return null;
  return reason;
}

function runStep(data: AppData, fundId: FundId, step: Step, ctx: Ctx, reason?: string): ActionResult {
  const fund = findFund(data, fundId);
  if (!fund) return fail(FUND_NOT_FOUND);
  const block = stepBlock(data, fund, step, ctx.user);
  if (block) return fail(block.reason);
  const cleanReason = step === "reopen" ? reopenReason(reason) : null;
  if (step === "reopen" && cleanReason === null) return fail("Enter a reopen reason between 5 and 500 characters");

  const level = levelOfStep(step);
  let approvals = data.approvals;
  let draft: AuditDraft;
  if (level) {
    const approval = { fundId: fund.id, level, by: ctx.user.name, at: toLocalDateTime(ctx.now) };
    approvals = [...data.approvals.filter((a) => !(a.fundId === fund.id && a.level === level)), approval];
    draft = { fundId: fund.id, action: level === "review" ? "Approved — reviewer" : "Approved — tax agent" };
  } else {
    const text = STEP_AUDIT[step as keyof typeof STEP_AUDIT];
    if (step === "return" || step === "reopen") approvals = data.approvals.filter((a) => a.fundId !== fund.id);
    draft = step === "reopen" ? { fundId: fund.id, action: text.action, detail: `${text.detail}. Reason: ${cleanReason}` } : { fundId: fund.id, ...text };
  }
  const status = STEP_TO[step];
  const funds = fund.status === status ? data.funds : replaceFund(data, { ...fund, status } as Fund);
  const changed = { ...data, funds, approvals };
  if (step === "submit" || step === "sign-off" || step === "reopen") {
    const afterFund = (fund.status === status ? fund : ({ ...fund, status } as Fund));
    const label = step === "submit" ? "Submitted for review" : step === "sign-off" ? "Signed off" : "Reopened";
    const version = buildCalcVersion(changed, afterFund, ctx, step, label, cleanReason);
    return withAudit(data, ctx, [draft], { funds, approvals, versions: [...data.versions, version] });
  }
  return withAudit(data, ctx, [draft], { funds, approvals });
}

// ---------------------------------------------------------------------------------------------------- edits
function updateInputs(data: AppData, action: Extract<Action, { type: "update-inputs" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const incoming = action.inputs as Record<string, unknown> | null | undefined;
  if (!incoming || typeof incoming !== "object") return fail("There is nothing to update");
  const current = fund.inputs as unknown as Record<string, number>;
  const changes: Array<{ key: string; from: number; to: number }> = [];
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (!Object.hasOwn(current, key)) return fail(`${key} is not an input of this fund`);
    if (!isAmount(value)) return fail(`${inputLabel(key)} must be an amount of zero or more`);
    if (value !== current[key]) changes.push({ key, from: current[key], to: value });
  }
  if (changes.length === 0) return succeed(data);
  const next = { ...fund, inputs: { ...fund.inputs, ...Object.fromEntries(changes.map((c) => [c.key, c.to])) } } as Fund;
  const text = (c: { from: number; to: number }) => `${money(c.from, fund.currency)} → ${money(c.to, fund.currency)}`;
  const draft: AuditDraft =
    changes.length === 1
      ? { fundId: fund.id, action: `${inputLabel(changes[0].key)} updated`, detail: text(changes[0]) }
      : { fundId: fund.id, action: "Components updated", detail: changes.map((c) => `${inputLabel(c.key)}: ${text(c)}`).join("; ") };
  return withAudit(data, ctx, [draft], { funds: replaceFund(data, next) });
}

function updateHolderUnits(data: AppData, action: Extract<Action, { type: "update-holder-units" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const holder = data.holders.find((h) => h.id === action.holderId && h.fundId === fund.id);
  if (!holder) return fail("Unitholder not found");
  if (!isSafeInt(action.units) || action.units < 0) return fail("Units must be a whole number of zero or more");
  if (action.units === holder.units) return succeed(data);
  const holders = data.holders.map((h) => (h === holder ? { ...h, units: action.units } : h));
  const draft: AuditDraft = {
    fundId: fund.id,
    action: "Unitholder register updated",
    detail: `${holder.holder}: ${integer(holder.units)} → ${integer(action.units)} units`,
  };
  return withAudit(data, ctx, [draft], { holders });
}

function updateUnitsOnIssue(data: AppData, action: Extract<Action, { type: "update-units-on-issue" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  if (!isSafeInt(action.units) || action.units < 1) return fail("Units on issue must be a whole number of at least 1");
  if (action.units === fund.unitsOnIssue) return succeed(data);
  const next = { ...fund, unitsOnIssue: action.units } as Fund;
  const draft: AuditDraft = {
    fundId: fund.id,
    action: "Unitholder register updated",
    detail: `Units on issue: ${integer(fund.unitsOnIssue)} → ${integer(action.units)}`,
  };
  return withAudit(data, ctx, [draft], { funds: replaceFund(data, next) });
}

function updateRemitted(data: AppData, action: Extract<Action, { type: "update-remitted" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const remitted = action.remitted;
  if (remitted !== null && !isAmount(remitted)) return fail("Withholding remitted must be an amount of zero or more");
  if (remitted === fund.whtRemitted) return succeed(data);
  const text = (value: number | null) => (value === null ? "Not remitted" : money(value, fund.currency));
  const next = { ...fund, whtRemitted: remitted } as Fund;
  const draft: AuditDraft = { fundId: fund.id, action: "Withholding remitted updated", detail: `${text(fund.whtRemitted)} → ${text(remitted)}` };
  return withAudit(data, ctx, [draft], { funds: replaceFund(data, next) });
}

function updateTbCategory(data: AppData, action: Extract<Action, { type: "update-tb-category" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const row = data.tbRows.find((r) => r.id === action.rowId && r.fundId === fund.id);
  if (!row) return fail("Trial balance account not found");
  const known = action.category === UNMAPPED_CATEGORY || data.tbCategories[fund.market].some((c) => c.id === action.category);
  if (!known) return fail("Unknown trial balance category");
  if (row.category === action.category) return succeed(data);
  const tbRows = data.tbRows.map((r) => (r === row ? { ...r, category: action.category } : r));
  const draft: AuditDraft = {
    fundId: fund.id,
    action: `Account ${row.account} mapped`,
    detail: `${row.name}: ${categoryLabel(data.tbCategories, fund.market, row.category)} → ${categoryLabel(data.tbCategories, fund.market, action.category)}`,
  };
  return withAudit(data, ctx, [draft], { tbRows });
}

function updateTaxAdjustment(data: AppData, action: Extract<Action, { type: "update-tax-adjustment" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const def = data.adjustmentDefs[fund.market].find((d) => d.key === action.key);
  if (!def) return fail("Unknown tax adjustment");
  if (!isAmount(action.amount)) return fail(`${def.label} must be an amount of zero or more`);
  const before = data.taxAdjustments[fund.id]?.[def.key] ?? 0;
  if (before === action.amount) return succeed(data);
  const taxAdjustments = { ...data.taxAdjustments, [fund.id]: { ...data.taxAdjustments[fund.id], [def.key]: action.amount } };
  const draft: AuditDraft = {
    fundId: fund.id,
    action: `${def.label} updated`,
    detail: `${money(before, fund.currency)} → ${money(action.amount, fund.currency)}`,
  };
  return withAudit(data, ctx, [draft], { taxAdjustments });
}

function importTb(data: AppData, action: Extract<Action, { type: "import-tb" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  if (!Array.isArray(action.rows) || action.rows.length === 0) return fail("The import has no accounts");
  if (action.rows.length > MAX_IMPORT_ROWS) return fail(`A trial balance import can have up to ${MAX_IMPORT_ROWS} accounts`);
  const seen = new Set<string>();
  const rows: TbRow[] = [];
  for (const row of action.rows) {
    const account = typeof row?.account === "string" ? row.account.trim() : "";
    if (!account) return fail("Every row needs an account code");
    if (account.length > MAX_ACCOUNT) return fail(`Account codes can have up to ${MAX_ACCOUNT} characters`);
    if (seen.has(account)) return fail(`Account ${account} appears more than once`);
    seen.add(account);
    if (!isSafeInt(row.current) || !isSafeInt(row.prior)) return fail(`Account ${account}: amounts must be whole cents`);
    const name = typeof row.name === "string" && row.name.trim() !== "" ? row.name.trim() : account;
    if (name.length > MAX_NAME) return fail(`Account ${account}: the name can have up to ${MAX_NAME} characters`);
    const mapped = typeof row.category === "string" && data.tbCategories[fund.market].some((c) => c.id === row.category);
    rows.push({
      id: `tb-${fund.id}-${account}`,
      fundId: fund.id,
      account,
      name,
      category: mapped ? (row.category as string) : UNMAPPED_CATEGORY,
      current: row.current,
      prior: row.prior,
    });
  }
  // The fund's block of rows stays where it was in the list; a first import goes at the end.
  const firstIndex = data.tbRows.findIndex((r) => r.fundId === fund.id);
  const others = data.tbRows.filter((r) => r.fundId !== fund.id);
  if (others.length + rows.length > MAX_ARRAY) return fail("There are too many trial balance accounts across the funds");
  const tbRows = firstIndex < 0 ? [...others, ...rows] : [...others.slice(0, firstIndex), ...rows, ...others.slice(firstIndex)];
  const draft: AuditDraft = { fundId: fund.id, action: "Trial balance imported", detail: `${rows.length} ${rows.length === 1 ? "account" : "accounts"}` };
  return withAudit(data, ctx, [draft], { tbRows });
}

function syncDistributionFromTb(data: AppData, action: Extract<Action, { type: "sync-distribution-from-tb" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const view = moduleFor(fund.market).tbView(data, fund, ctx.now);
  const current = fund.inputs as unknown as Record<string, number>;
  const derived = view.derivedInputs as unknown as Record<string, number>;
  const changes: Array<{ key: string; label: string; from: number; to: number }> = [];
  for (const component of view.components) {
    if (!Object.hasOwn(current, component.key)) continue;
    const value = derived[component.key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const to = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(value)));
    if (to !== current[component.key]) changes.push({ key: component.key, label: component.label, from: current[component.key], to });
  }
  if (changes.length === 0) return succeed(data);
  const next = { ...fund, inputs: { ...fund.inputs, ...Object.fromEntries(changes.map((c) => [c.key, c.to])) } } as Fund;
  const draft: AuditDraft = {
    fundId: fund.id,
    action: "Components updated from trial balance",
    detail: changes.map((c) => `${c.label}: ${money(c.from, fund.currency)} → ${money(c.to, fund.currency)}`).join("; "),
  };
  return withAudit(data, ctx, [draft], { funds: replaceFund(data, next) });
}

// ---------------------------------------------------------------------------------------------------- notices and lodgment
function publishNotice(data: AppData, action: Extract<Action, { type: "publish-notice" }>, ctx: Ctx): ActionResult {
  const fund = reachableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const publishedOn = toISODate(ctx.now);
  const allowed = can(ctx.user, "publish", fund, fund.governance);
  if (fund.market === "AU") {
    const notice = data.auNotices.find((n) => n.id === action.noticeId && n.fundId === fund.id);
    if (!notice) return fail("Notice not found");
    if (!allowed) return fail("You don't have permission to publish notices");
    if (notice.publishedOn) return fail("Published notices are locked");
    const amounts = auNoticeAmounts(fund, data.auNotices, notice);
    if (!Object.values(amounts).every(isAmount)) return fail("The notice amounts are too large to publish");
    const auNotices = data.auNotices.map((n) => (n === notice ? { ...n, publishedOn, notified: amounts } : n));
    const draft: AuditDraft = {
      fundId: fund.id,
      action: "Fund payment notice published",
      detail: `${notice.label}: fund payment ${money(auFundPayment(amounts), fund.currency)}, interest ${money(amounts.interest, fund.currency)}`,
    };
    return withAudit(data, ctx, [draft], { auNotices });
  }
  const notice = data.sgNotices.find((n) => n.id === action.noticeId && n.fundId === fund.id);
  if (!notice) return fail("Notice not found");
  if (!allowed) return fail("You don't have permission to publish notices");
  if (notice.publishedOn) return fail("Published notices are locked");
  const amounts = sgNoticeAmounts(fund);
  if (!Object.values(amounts).every(isAmount)) return fail("The notice amounts are too large to publish");
  const sgNotices = data.sgNotices.map((n) => (n === notice ? { ...n, publishedOn, notified: amounts } : n));
  const draft: AuditDraft = {
    fundId: fund.id,
    action: "Distribution tax notice announced",
    detail: `Taxable ${money(amounts.taxable, fund.currency)}, tax-exempt ${money(amounts.exempt, fund.currency)}, capital ${money(amounts.capital, fund.currency)}`,
  };
  return withAudit(data, ctx, [draft], { sgNotices });
}

const LODGMENT_AUDIT: Record<Lodgment["kind"], string> = {
  aiir: "AIIR lodged with the ATO",
  return: "Tax return lodged with the ATO",
  "form-ut": "Form UT filed with IRAS",
};

function recordLodgment(data: AppData, action: Extract<Action, { type: "record-lodgment" }>, ctx: Ctx): ActionResult {
  const fund = reachableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  if (!can(ctx.user, "lodge", fund, fund.governance)) {
    const who = ROLE_LABEL[lodgmentRole(fund.governance)].toLowerCase();
    return fail(`Only the ${who} records lodgment for this fund`);
  }
  if (fund.status !== "Signed off") return fail("Sign the fund off before recording lodgment");
  if (!LODGMENT_KINDS[fund.market].includes(action.kind)) return fail("That filing does not apply to this fund");
  const reference = typeof action.reference === "string" ? action.reference.trim() : "";
  if (!reference) return fail("Enter the reference");
  if (reference.length > MAX_NAME) return fail(`The reference can have up to ${MAX_NAME} characters`);
  if (!isISODate(action.date)) return fail("Enter a valid date");
  const record: Lodgment = { fundId: fund.id, kind: action.kind, reference, date: action.date, actor: ctx.user.name };
  const index = data.lodgments.findIndex((l) => l.fundId === fund.id && l.kind === action.kind);
  const lodgments = index < 0 ? [...data.lodgments, record] : data.lodgments.map((l, i) => (i === index ? record : l));
  const draft: AuditDraft = { fundId: fund.id, action: LODGMENT_AUDIT[action.kind], detail: `Reference ${reference}, ${action.date}` };
  return withAudit(data, ctx, [draft], { lodgments });
}

// ---------------------------------------------------------------------------------------------------- queries
function queryFund(data: AppData, fundId: FundId, user: User): Fund | string {
  const fund = reachableFund(data, fundId, user);
  if (typeof fund === "string") return fund;
  if (!can(user, "query", fund, fund.governance)) return "You don't have permission to raise or answer queries";
  return fund;
}

function raiseQuery(data: AppData, action: Extract<Action, { type: "raise-query" }>, ctx: Ctx): ActionResult {
  const fund = queryFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const subject = typeof action.subject === "string" ? action.subject.trim() : "";
  const message = typeof action.message === "string" ? action.message.trim() : "";
  if (!subject) return fail("Enter a subject");
  if (!message) return fail("Enter a message");
  if (subject.length > MAX_NAME) return fail(`The subject can have up to ${MAX_NAME} characters`);
  if (message.length > MAX_STRING) return fail(`A message can have up to ${MAX_STRING} characters`);
  const at = toLocalDateTime(ctx.now);
  const query: Query = {
    id: nextSequenceId("q", data.queries.map((q) => q.id)),
    fundId: fund.id,
    subject,
    status: "open",
    raisedBy: ctx.user.name,
    raisedAt: at,
    messages: [{ by: ctx.user.name, at, text: message }],
  };
  return withAudit(data, ctx, [{ fundId: fund.id, action: "Query raised", detail: subject }], { queries: [...data.queries, query] });
}

function replyQuery(data: AppData, action: Extract<Action, { type: "reply-query" }>, ctx: Ctx): ActionResult {
  const fund = queryFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const query = data.queries.find((q) => q.id === action.queryId && q.fundId === fund.id);
  if (!query) return fail("Query not found");
  if (query.status !== "open") return fail("This query is resolved");
  const message = typeof action.message === "string" ? action.message.trim() : "";
  if (!message) return fail("Enter a message");
  if (message.length > MAX_STRING) return fail(`A message can have up to ${MAX_STRING} characters`);
  const messages = [...query.messages, { by: ctx.user.name, at: toLocalDateTime(ctx.now), text: message }];
  const queries = data.queries.map((q) => (q === query ? { ...q, messages } : q));
  return withAudit(data, ctx, [{ fundId: fund.id, action: "Query answered", detail: query.subject }], { queries });
}

function resolveQuery(data: AppData, action: Extract<Action, { type: "resolve-query" }>, ctx: Ctx): ActionResult {
  const fund = queryFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const query = data.queries.find((q) => q.id === action.queryId && q.fundId === fund.id);
  if (!query) return fail("Query not found");
  if (query.status !== "open") return fail("This query is already resolved");
  const queries = data.queries.map((q) => (q === query ? { ...q, status: "resolved" as const } : q));
  return withAudit(data, ctx, [{ fundId: fund.id, action: "Query resolved", detail: query.subject }], { queries });
}

// ---------------------------------------------------------------------------------------------------- governance and access
function setGovernance(data: AppData, action: Extract<Action, { type: "set-governance" }>, ctx: Ctx): ActionResult {
  const fund = findFund(data, action.fundId);
  if (!fund) return fail(FUND_NOT_FOUND);
  if (!can(ctx.user, "manage-access", fund, fund.governance)) return fail("You don't have permission to change governance");
  if (!GOVERNANCE_MODES.includes(action.mode)) return fail("Unknown governance mode");
  if (fund.status === "Signed off") return fail("This fund is signed off. Reopen it before changing its governance.");
  if (fund.governance === action.mode) return succeed(data);
  const levels = GOVERNANCE[action.mode].levels;
  const approvals = data.approvals.filter((a) => a.fundId !== fund.id || levels.includes(a.level));
  const next = { ...fund, governance: action.mode } as Fund;
  const draft: AuditDraft = {
    fundId: fund.id,
    action: "Governance changed",
    detail: `${GOVERNANCE[fund.governance].label} → ${GOVERNANCE[action.mode].label}`,
  };
  return withAudit(data, ctx, [draft], { funds: replaceFund(data, next), approvals });
}

function setUserFunds(data: AppData, action: Extract<Action, { type: "set-user-funds" }>, ctx: Ctx): ActionResult {
  if (!can(ctx.user, "manage-access", undefined, "no-agent")) return fail("You don't have permission to manage access");
  const target = data.users.find((u) => u.id === action.userId);
  if (!target) return fail("User not found");
  let funds: "all" | FundId[];
  if (action.funds === "all") {
    funds = "all";
  } else {
    if (!Array.isArray(action.funds) || action.funds.length === 0) return fail("Pick at least one fund");
    const known = new Set(data.funds.map((f) => f.id));
    const unknown = action.funds.find((id) => !known.has(id));
    if (unknown !== undefined) return fail(`Unknown fund: ${String(unknown)}`);
    const wanted = new Set(action.funds);
    funds = data.funds.map((f) => f.id).filter((id) => wanted.has(id));
  }
  const same =
    funds === "all"
      ? target.funds === "all"
      : target.funds !== "all" && target.funds.length === funds.length && target.funds.every((id, i) => id === funds[i]);
  if (same) return succeed(data);
  const reaches = (value: "all" | FundId[], id: FundId) => value === "all" || value.includes(id);
  const drafts: AuditDraft[] = [];
  for (const fund of data.funds) {
    const before = reaches(target.funds, fund.id);
    const after = reaches(funds, fund.id);
    if (before !== after) drafts.push({ fundId: fund.id, action: "Access changed", detail: `${target.name}: access ${after ? "granted" : "removed"}` });
  }
  const users = data.users.map((u) => (u === target ? { ...u, funds } : u));
  if (drafts.length === 0) return succeed({ ...data, users });
  return withAudit(data, ctx, drafts, { users });
}

// ---------------------------------------------------------------------------------------------------- entry points
export function applyAction(data: AppData, action: Action, ctx: Ctx): ActionResult {
  switch (action.type) {
    case "submit":
    case "return":
    case "sign-off":
    case "reopen":
      return runStep(data, action.fundId, action.type, ctx, action.type === "reopen" ? action.reason : undefined);
    case "approve":
      if (action.level !== "review" && action.level !== "agent") return fail("Unknown approval level");
      return runStep(data, action.fundId, action.level === "review" ? "approve-review" : "approve-agent", ctx);
    case "update-inputs":
      return updateInputs(data, action, ctx);
    case "update-holder-units":
      return updateHolderUnits(data, action, ctx);
    case "update-units-on-issue":
      return updateUnitsOnIssue(data, action, ctx);
    case "update-remitted":
      return updateRemitted(data, action, ctx);
    case "update-tb-category":
      return updateTbCategory(data, action, ctx);
    case "update-tax-adjustment":
      return updateTaxAdjustment(data, action, ctx);
    case "import-tb":
      return importTb(data, action, ctx);
    case "sync-distribution-from-tb":
      return syncDistributionFromTb(data, action, ctx);
    case "publish-notice":
      return publishNotice(data, action, ctx);
    case "record-lodgment":
      return recordLodgment(data, action, ctx);
    case "raise-query":
      return raiseQuery(data, action, ctx);
    case "reply-query":
      return replyQuery(data, action, ctx);
    case "resolve-query":
      return resolveQuery(data, action, ctx);
    case "set-governance":
      return setGovernance(data, action, ctx);
    case "set-user-funds":
      return setUserFunds(data, action, ctx);
    default:
      return applyFeatureAction(data, action, ctx) ?? fail("Unknown action");
  }
}

const BULK_KINDS: readonly BulkKind[] = ["submit", "approve-review", "sign-off"];

/**
 * Applies one workflow step to many funds as ctx.user, skipping (with a reason) any fund that cannot take it.
 * Skips: no permission; wrong status; funds with open exceptions (approve/sign-off); for sign-off also funds with open queries or
 * missing approvals. Funds run in the order given, each seeing the result of the one before; a repeated id is processed once; one
 * skipped fund never stops the rest. Each success is audited exactly like the single action. "approve-review" approves at the user's
 * own level (tax agents at the agent level, everyone else as reviewer).
 * Footnote shown in the UI: "Bulk approval and sign-off skip funds with open exceptions; bulk sign-off also
 * skips funds with open queries or missing approvals. Sign those off from the fund itself."
 */
export function applyBulk(data: AppData, kind: BulkKind, fundIds: FundId[], ctx: Ctx): { data: AppData; result: BulkResult } {
  const result: BulkResult = { done: [], skipped: [] };
  let current = data;
  const seen = new Set<FundId>();
  for (const fundId of fundIds) {
    if (seen.has(fundId)) continue;
    seen.add(fundId);
    if (!BULK_KINDS.includes(kind)) {
      result.skipped.push({ fundId, reason: "Unknown action" });
      continue;
    }
    const fund = findFund(current, fundId);
    if (!fund) {
      result.skipped.push({ fundId, reason: "Unknown fund" });
      continue;
    }
    const snapshot = current;
    const reason = bulkBlock(snapshot, fund, kind, ctx.user, () => exceptionsFor(snapshot, fund, ctx.now));
    if (reason) {
      result.skipped.push({ fundId, reason });
      continue;
    }
    const single: Action =
      kind === "approve-review"
        ? { type: "approve", fundId, level: ctx.user.role === "tax-agent" ? "agent" : "review" }
        : kind === "sign-off"
          ? { type: kind, fundId }
          : { type: kind, fundId };
    const applied = applyAction(snapshot, single, ctx);
    if (applied.ok) {
      current = applied.data;
      result.done.push(fundId);
    } else {
      result.skipped.push({ fundId, reason: applied.reason });
    }
  }
  return { data: current, result };
}
