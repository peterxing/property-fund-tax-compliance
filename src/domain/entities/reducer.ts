// OWNER: Funds & data agent (F7). Pure reducers for fund, holder and property management.
import type { Action, ActionResult, AppData, AuFund, AuHolder, Ctx, Fund, FundId, Holder, Property, SgFund, SgHolder, User } from "../types.ts";
import type { EntityAction, EntityFundDraft, EntityHolderDraft, EntityPropertyDraft } from "./types.ts";
import type { PropertyTaxProfile } from "../ptax/types.ts";
import { defaultPropertyTaxProfile } from "../ptax/seed.ts";
import { appendAudit, type AuditDraft } from "../core/audit.ts";
import { nextSequenceId } from "../core/ids.ts";
import { MAX_ARRAY, MAX_FUND_ID, MAX_NAME, isAmount, isISODate, isSafeInt } from "../core/validate.ts";
import { can, userHasFund } from "../permissions.ts";
import { integer, money } from "../format.ts";

const fail = (reason: string): ActionResult => ({ ok: false, reason });
const succeed = (data: AppData): ActionResult => ({ ok: true, data });
const FUND_NOT_FOUND = "Fund not found";
const NO_ACCESS = "You don't have access to this fund";
const PERIOD_LOCKED = "This fund has lodged or published records for its current period; its dates can't be changed. Create a new fund for a new period.";

export function isEntityAction(action: Action): action is EntityAction {
  return action.type.startsWith("entity-");
}

function findFund(data: AppData, fundId: FundId): Fund | undefined {
  return data.funds.find((f) => f.id === fundId);
}

function withAudit(data: AppData, ctx: Ctx, drafts: readonly AuditDraft[], changes: Partial<AppData>): ActionResult {
  return succeed({ ...data, ...changes, audit: appendAudit(data, ctx, drafts) });
}

function editableFund(data: AppData, fundId: FundId, user: User): Fund | string {
  const fund = findFund(data, fundId);
  if (!fund) return FUND_NOT_FOUND;
  if (!userHasFund(user, fund.id)) return NO_ACCESS;
  if (!can(user, "edit", fund, fund.governance)) return "You don't have permission to edit this fund";
  if (fund.status === "Signed off") return "This fund is signed off. Reopen it to edit.";
  if (fund.status === "In review") return "This fund is in review. Return it to the preparer to edit.";
  return fund;
}

const clean = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const clipped = (value: string, max = MAX_NAME): string | null => (value.length > max ? `Text can have up to ${max} characters` : null);

function slugFor(name: string, existing: readonly string[]): string {
  const base = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_FUND_ID - 4)
    .replace(/-+$/g, "") || "fund";
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 10_000; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_FUND_ID - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return nextSequenceId("fund", existing).slice(0, MAX_FUND_ID);
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(2000, month - 1, day));
  return `${date.toLocaleString("en-AU", { day: "numeric", timeZone: "UTC" })} ${date.toLocaleString("en-AU", { month: "short", timeZone: "UTC" })}`;
}

function periodLabel(market: Fund["market"], start: string, end: string): string {
  const year = end.slice(0, 4);
  return market === "AU" ? `Income year ended ${shortDate(end)} ${year}` : `Distribution period ${shortDate(start)} – ${shortDate(end)} ${year}`;
}

function validateCommonFund(draft: EntityFundDraft): string | null {
  const name = clean(draft.name);
  const sector = clean(draft.sector);
  if (draft.market !== "AU" && draft.market !== "SG") return "Market must be Australia or Singapore";
  if (!name) return "Fund name is required";
  if (!sector) return "Sector is required";
  const nameProblem = clipped(name);
  if (nameProblem) return nameProblem;
  const sectorProblem = clipped(sector);
  if (sectorProblem) return sectorProblem;
  if (!isISODate(draft.periodStart) || !isISODate(draft.periodEnd)) return "Period start and end must be real dates";
  if (draft.periodStart > draft.periodEnd) return "Period end must be on or after the period start";
  if (!isSafeInt(draft.unitsOnIssue) || draft.unitsOnIssue < 1) return "Units on issue must be a whole number of at least 1";
  if (draft.governance !== "agent-lodges" && draft.governance !== "agent-signs-off" && draft.governance !== "no-agent") return "Unknown governance mode";
  if (draft.market === "SG" && (!isSafeInt(draft.assessmentYear) || draft.assessmentYear < 2000 || draft.assessmentYear > 2200)) return "Assessment year must be a whole year";
  return null;
}

function periodChangeBlocked(data: AppData, fund: Fund): boolean {
  return (
    data.gstFilings.some((r) => r.fundId === fund.id) ||
    data.lodgments.some((r) => r.fundId === fund.id) ||
    data.auNotices.some((r) => r.fundId === fund.id && r.publishedOn !== null) ||
    data.sgNotices.some((r) => r.fundId === fund.id && r.publishedOn !== null) ||
    data.versions.some((r) => r.fundId === fund.id)
  );
}

function zeroAdjustments(data: AppData, market: Fund["market"]) {
  return Object.fromEntries(data.adjustmentDefs[market].map((def) => [def.key, 0]));
}

function createFund(data: AppData, action: Extract<EntityAction, { type: "entity-create-fund" }>, ctx: Ctx): ActionResult {
  if (!can(ctx.user, "manage-access", undefined, "no-agent")) return fail("You don't have permission to create funds");
  const problem = validateCommonFund(action.fund);
  if (problem) return fail(problem);
  if (data.funds.length >= 200) return fail("The portfolio already has the maximum number of funds");
  const id = slugFor(clean(action.fund.name), data.funds.map((f) => f.id));
  const base = {
    id,
    name: clean(action.fund.name),
    sector: clean(action.fund.sector),
    listed: action.fund.listed === true,
    periodLabel: periodLabel(action.fund.market, action.fund.periodStart, action.fund.periodEnd),
    periodStart: action.fund.periodStart,
    periodEnd: action.fund.periodEnd,
    unitsOnIssue: action.fund.unitsOnIssue,
    status: "Preparing" as const,
    whtRemitted: null,
    governance: action.fund.governance,
  };
  const fund: Fund =
    action.fund.market === "AU"
      ? ({
          ...base,
          market: "AU",
          regime: "AMIT",
          currency: "AUD",
          inputs: { cashDistribution: 0, ausOtherIncome: 0, ncmi: 0, excludedNcmi: 0, cleanBuilding: 0, interest: 0, discountGainTarp: 0, otherGainTarp: 0, foreignIncome: 0 },
        } satisfies AuFund)
      : ({
          ...base,
          market: "SG",
          regime: "S-REIT",
          currency: "SGD",
          assessmentYear: action.fund.assessmentYear!,
          inputs: { taxableSpecifiedIncome: 0, taxableDistributed: 0, taxExemptDistribution: 0, capitalDistribution: 0 },
        } satisfies SgFund);
  const changes: Partial<AppData> = {
    funds: [...data.funds, fund],
    unitCostBase: { ...data.unitCostBase, [id]: { unitPrice: 1, priceBasis: "NAV per unit", opening: {} } },
    taxAdjustments: { ...data.taxAdjustments, [id]: zeroAdjustments(data, fund.market) },
  };
  if (fund.market === "SG") changes.sgLedger = { ...data.sgLedger, [id]: { exempt: 0, capital: 0, afterTax: 0 } };
  return withAudit(data, ctx, [{ fundId: id, action: "Fund created", detail: `${fund.name} · ${fund.periodLabel}` }], changes);
}

function updateFund(data: AppData, action: Extract<EntityAction, { type: "entity-update-fund" }>, ctx: Ctx): ActionResult {
  const fund = findFund(data, action.fundId);
  if (!fund) return fail(FUND_NOT_FOUND);
  if (!userHasFund(ctx.user, fund.id)) return fail(NO_ACCESS);
  if (!can(ctx.user, "edit", fund, fund.governance)) return fail("You don't have permission to edit this fund");
  const patch = action.patch ?? {};
  if (patch.governance !== undefined) return fail("Change governance on the Access page");
  const next: Fund = { ...fund } as Fund;
  const detail: string[] = [];
  const updateText = (key: "name" | "sector", label: string): string | null => {
    const value = clean(patch[key]);
    if (value === "") return null;
    const problem = clipped(value);
    if (problem) return problem;
    if (value !== fund[key]) {
      (next as unknown as Record<string, string>)[key] = value;
      detail.push(`${label}: ${fund[key]} → ${value}`);
    }
    return null;
  };
  for (const problem of [updateText("name", "Name"), updateText("sector", "Sector")]) if (problem) return fail(problem);
  if (typeof patch.listed === "boolean" && patch.listed !== fund.listed) {
    next.listed = patch.listed;
    detail.push(`Listed: ${fund.listed ? "Yes" : "No"} → ${patch.listed ? "Yes" : "No"}`);
  }
  const preparingFields = ["periodStart", "periodEnd", "unitsOnIssue", "assessmentYear"] as const;
  if (fund.status !== "Preparing" && preparingFields.some((key) => patch[key] !== undefined)) return fail("Period, units and assessment year can only be changed while the fund is Preparing");
  const periodStart = patch.periodStart ?? fund.periodStart;
  const periodEnd = patch.periodEnd ?? fund.periodEnd;
  if (patch.periodStart !== undefined || patch.periodEnd !== undefined) {
    if (!isISODate(periodStart) || !isISODate(periodEnd)) return fail("Period start and end must be real dates");
    if (periodStart > periodEnd) return fail("Period end must be on or after the period start");
    if ((periodStart !== fund.periodStart || periodEnd !== fund.periodEnd) && periodChangeBlocked(data, fund)) return fail(PERIOD_LOCKED);
    if (periodStart !== fund.periodStart || periodEnd !== fund.periodEnd) {
      next.periodStart = periodStart;
      next.periodEnd = periodEnd;
      next.periodLabel = periodLabel(fund.market, periodStart, periodEnd);
      detail.push(`Period ${fund.periodStart}–${fund.periodEnd} → ${periodStart}–${periodEnd}`);
    }
  }
  if (patch.unitsOnIssue !== undefined) {
    if (!isSafeInt(patch.unitsOnIssue) || patch.unitsOnIssue < 1) return fail("Units on issue must be a whole number of at least 1");
    if (patch.unitsOnIssue !== fund.unitsOnIssue) {
      next.unitsOnIssue = patch.unitsOnIssue;
      detail.push(`Units on issue: ${integer(fund.unitsOnIssue)} → ${integer(patch.unitsOnIssue)}`);
    }
  }
  if (fund.market === "SG" && patch.assessmentYear !== undefined) {
    if (!isSafeInt(patch.assessmentYear) || patch.assessmentYear < 2000 || patch.assessmentYear > 2200) return fail("Assessment year must be a whole year");
    if (patch.assessmentYear !== fund.assessmentYear) {
      (next as SgFund).assessmentYear = patch.assessmentYear;
      detail.push(`Assessment year: ${fund.assessmentYear} → ${patch.assessmentYear}`);
    }
  }
  if (detail.length === 0) return succeed(data);
  return withAudit(data, ctx, [{ fundId: fund.id, action: "Fund details updated", detail: detail.join("; ") }], { funds: data.funds.map((f) => (f.id === fund.id ? next : f)) });
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function deleteFund(data: AppData, action: Extract<EntityAction, { type: "entity-delete-fund" }>, ctx: Ctx): ActionResult {
  const fund = findFund(data, action.fundId);
  if (!fund) return fail(FUND_NOT_FOUND);
  if (!can(ctx.user, "manage-access", fund, fund.governance)) return fail("You don't have permission to delete funds");
  if (fund.status === "Signed off") return fail("This fund is signed off. Reopen it before deleting it.");
  if (clean(action.confirmName) !== fund.name) return fail("Type the fund name exactly to confirm deletion");
  const remainingFunds = data.funds.filter((f) => f.id !== fund.id);
  if (remainingFunds.length === 0) return fail("You can't delete the last fund in the portfolio");
  const blockedUsers = data.users.filter((u) => u.funds !== "all" && u.funds.length === 1 && u.funds[0] === fund.id);
  if (blockedUsers.length > 0) {
    const names = blockedUsers.map((u) => u.name).join(", ");
    return fail(
      blockedUsers.length === 1
        ? `${names} has access to this fund only. Change their access on the Access page first.`
        : `${names} have access to this fund only. Change their access on the Access page first.`,
    );
  }
  const fallback = remainingFunds[0]!.id;
  const users = data.users.map((u) => {
    if (u.funds === "all") return u;
    return { ...u, funds: u.funds.filter((id) => id !== fund.id) };
  });
  const auditBase = { ...data, audit: data.audit.filter((a) => a.fundId !== fund.id) };
  return succeed({
    ...data,
    funds: remainingFunds,
    holders: data.holders.filter((h) => h.fundId !== fund.id),
    tbRows: data.tbRows.filter((r) => r.fundId !== fund.id),
    properties: data.properties.filter((p) => p.fundId !== fund.id),
    auNotices: data.auNotices.filter((n) => n.fundId !== fund.id),
    sgNotices: data.sgNotices.filter((n) => n.fundId !== fund.id),
    queries: data.queries.filter((q) => q.fundId !== fund.id),
    approvals: data.approvals.filter((a) => a.fundId !== fund.id),
    lodgments: data.lodgments.filter((l) => l.fundId !== fund.id),
    users,
    gstLedger: data.gstLedger.filter((r) => r.fundId !== fund.id),
    gstFilings: data.gstFilings.filter((r) => r.fundId !== fund.id),
    propertyProfiles: data.propertyProfiles.filter((r) => r.fundId !== fund.id),
    assets: data.assets.filter((r) => r.fundId !== fund.id),
    versions: data.versions.filter((r) => r.fundId !== fund.id),
    manualAdjustments: data.manualAdjustments.filter((r) => r.fundId !== fund.id),
    unitCostBase: omitKey(data.unitCostBase, fund.id),
    taxAdjustments: omitKey(data.taxAdjustments, fund.id),
    sgLedger: omitKey(data.sgLedger, fund.id),
    audit: appendAudit(auditBase, ctx, [
      {
        fundId: fallback,
        action: "Fund deleted",
        detail: `${fund.name} (${fund.id}) and all its records were deleted by ${ctx.user.name}; recorded here because the deleted fund's own trail was removed`,
      },
    ]),
  });
}

function validateHolder(fund: Fund, row: EntityHolderDraft, line = "Unitholder"): Holder | string {
  const holder = clean(row.holder);
  const country = clean(row.country);
  if (!holder) return `${line}: holder name is required`;
  if (!country) return `${line}: country is required`;
  const nameProblem = clipped(holder);
  if (nameProblem) return `${line}: ${nameProblem}`;
  const countryProblem = clipped(country);
  if (countryProblem) return `${line}: ${countryProblem}`;
  if (!isSafeInt(row.units) || row.units < 0) return `${line}: units must be a whole number of zero or more`;
  if (fund.market === "AU") {
    if (row.auStatus !== "resident" && row.auStatus !== "foreign-eoi" && row.auStatus !== "foreign-non-eoi") return `${line}: AU tax status is required`;
    return { id: "", fundId: fund.id, holder, country, units: row.units, auStatus: row.auStatus } satisfies AuHolder;
  }
  if (row.sgClass !== "individual" && row.sgClass !== "qualifying" && row.sgClass !== "nrni" && row.sgClass !== "nr-fund" && row.sgClass !== "other") return `${line}: SG holder class is required`;
  return { id: "", fundId: fund.id, holder, country, units: row.units, sgClass: row.sgClass } satisfies SgHolder;
}

function holderId(fundId: string, holder: string, existing: readonly string[]): string {
  return slugFor(`${fundId}-${holder}`, existing).slice(0, MAX_NAME);
}

function addHolder(data: AppData, action: Extract<EntityAction, { type: "entity-add-holder" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const parsed = validateHolder(fund, action.holder);
  if (typeof parsed === "string") return fail(parsed);
  if (data.holders.length >= MAX_ARRAY) return fail("There are too many unitholders across the portfolio");
  const holder = { ...parsed, id: holderId(fund.id, parsed.holder, data.holders.map((h) => h.id)) } as Holder;
  return withAudit(data, ctx, [{ fundId: fund.id, action: "Unitholder added", detail: `${holder.holder}: ${integer(holder.units)} units` }], {
    holders: [...data.holders, holder],
    unitCostBase: { ...data.unitCostBase, [fund.id]: { ...data.unitCostBase[fund.id]!, opening: { ...data.unitCostBase[fund.id]!.opening, [holder.id]: 0 } } },
  });
}

function updateHolder(data: AppData, action: Extract<EntityAction, { type: "entity-update-holder" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const holder = data.holders.find((h) => h.id === action.holderId && h.fundId === fund.id);
  if (!holder) return fail("Unitholder not found");
  const draft = { ...holder, ...action.patch, holder: action.patch.holder ?? holder.holder, country: action.patch.country ?? holder.country, units: action.patch.units ?? holder.units } as EntityHolderDraft;
  const parsed = validateHolder(fund, draft);
  if (typeof parsed === "string") return fail(parsed);
  const next = { ...parsed, id: holder.id } as Holder;
  if (JSON.stringify(holder) === JSON.stringify(next)) return succeed(data);
  return withAudit(data, ctx, [{ fundId: fund.id, action: "Unitholder updated", detail: `${holder.holder}: ${integer(holder.units)} → ${integer(next.units)} units` }], {
    holders: data.holders.map((h) => (h === holder ? next : h)),
  });
}

function removeHolder(data: AppData, action: Extract<EntityAction, { type: "entity-remove-holder" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const holder = data.holders.find((h) => h.id === action.holderId && h.fundId === fund.id);
  if (!holder) return fail("Unitholder not found");
  const opening = { ...data.unitCostBase[fund.id]!.opening };
  delete opening[holder.id];
  return withAudit(data, ctx, [{ fundId: fund.id, action: "Unitholder removed", detail: holder.holder }], {
    holders: data.holders.filter((h) => h !== holder),
    unitCostBase: { ...data.unitCostBase, [fund.id]: { ...data.unitCostBase[fund.id]!, opening } },
  });
}

function importHolders(data: AppData, action: Extract<EntityAction, { type: "entity-import-holders" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  if (!Array.isArray(action.rows) || action.rows.length === 0) return fail("The import has no unitholders");
  if (action.rows.length > 2000) return fail("A unitholder import can have up to 2,000 rows");
  let ids = data.holders.map((h) => h.id);
  const imported: Holder[] = [];
  for (let i = 0; i < action.rows.length; i++) {
    const parsed = validateHolder(fund, action.rows[i]!, `Line ${i + 2}`);
    if (typeof parsed === "string") return fail(parsed);
    const id = holderId(fund.id, parsed.holder, ids);
    ids = [...ids, id];
    imported.push({ ...parsed, id } as Holder);
  }
  const kept = action.mode === "replace" ? data.holders.filter((h) => h.fundId !== fund.id) : data.holders;
  if (kept.length + imported.length > MAX_ARRAY) return fail("There are too many unitholders across the portfolio");
  const opening =
    action.mode === "replace"
      ? Object.fromEntries(imported.map((h) => [h.id, 0]))
      : { ...data.unitCostBase[fund.id]!.opening, ...Object.fromEntries(imported.map((h) => [h.id, 0])) };
  return withAudit(data, ctx, [{ fundId: fund.id, action: "Unitholders imported", detail: `${integer(imported.length)} rows ${action.mode === "replace" ? "replaced the register" : "appended"}` }], {
    holders: [...kept, ...imported],
    unitCostBase: { ...data.unitCostBase, [fund.id]: { ...data.unitCostBase[fund.id]!, opening } },
  });
}

function validateProperty(fund: Fund, row: EntityPropertyDraft, line = "Property"): Property | string {
  const name = clean(row.name);
  const location = clean(row.location);
  if (!name) return `${line}: property name is required`;
  if (!location) return `${line}: location is required`;
  const nameProblem = clipped(name);
  if (nameProblem) return `${line}: ${nameProblem}`;
  const locProblem = clipped(location);
  if (locProblem) return `${line}: ${locProblem}`;
  if (!isISODate(row.acquired)) return `${line}: acquired date must be a real date`;
  for (const [key, label] of [
    ["cost", "cost"],
    ["improvements", "improvements"],
    ["valuation", "valuation"],
  ] as const) {
    if (!isAmount(row[key])) return `${line}: ${label} must be an amount of zero or more`;
  }
  const capitalWorksClaimed = fund.market === "AU" ? (row.capitalWorksClaimed ?? 0) : 0;
  if (!isAmount(capitalWorksClaimed)) return `${line}: capital works claimed must be an amount of zero or more`;
  return { id: "", fundId: fund.id, name, location, acquired: row.acquired, cost: row.cost, improvements: row.improvements, capitalWorksClaimed, valuation: row.valuation };
}

function defaultPropertyProfile(fund: Fund, property: Property): PropertyTaxProfile {
  return defaultPropertyTaxProfile(property, fund);
}

function propertyId(fundId: string, name: string, existing: readonly string[]): string {
  return slugFor(`p-${fundId}-${name}`, existing).slice(0, MAX_NAME);
}

function addProperty(data: AppData, action: Extract<EntityAction, { type: "entity-add-property" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const parsed = validateProperty(fund, action.property);
  if (typeof parsed === "string") return fail(parsed);
  if (data.properties.length >= MAX_ARRAY) return fail("There are too many properties across the portfolio");
  const property = { ...parsed, id: propertyId(fund.id, parsed.name, data.properties.map((p) => p.id)) };
  return withAudit(data, ctx, [{ fundId: fund.id, action: "Property added", detail: `${property.name}: ${money(property.valuation, fund.currency)} valuation` }], {
    properties: [...data.properties, property],
    propertyProfiles: [...data.propertyProfiles, defaultPropertyProfile(fund, property)],
  });
}

function updateProperty(data: AppData, action: Extract<EntityAction, { type: "entity-update-property" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const property = data.properties.find((p) => p.id === action.propertyId && p.fundId === fund.id);
  if (!property) return fail("Property not found");
  const parsed = validateProperty(fund, { ...property, ...action.patch });
  if (typeof parsed === "string") return fail(parsed);
  const next = { ...parsed, id: property.id };
  if (JSON.stringify(property) === JSON.stringify(next)) return succeed(data);
  return withAudit(data, ctx, [{ fundId: fund.id, action: "Property updated", detail: property.name }], {
    properties: data.properties.map((p) => (p === property ? next : p)),
  });
}

function removeProperty(data: AppData, action: Extract<EntityAction, { type: "entity-remove-property" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  const property = data.properties.find((p) => p.id === action.propertyId && p.fundId === fund.id);
  if (!property) return fail("Property not found");
  return withAudit(data, ctx, [{ fundId: fund.id, action: "Property removed", detail: property.name }], {
    properties: data.properties.filter((p) => p !== property),
    propertyProfiles: data.propertyProfiles.filter((p) => p.propertyId !== property.id),
    assets: data.assets.map((asset) => (asset.propertyId === property.id ? { ...asset, propertyId: null } : asset)),
  });
}

function importProperties(data: AppData, action: Extract<EntityAction, { type: "entity-import-properties" }>, ctx: Ctx): ActionResult {
  const fund = editableFund(data, action.fundId, ctx.user);
  if (typeof fund === "string") return fail(fund);
  if (!Array.isArray(action.rows) || action.rows.length === 0) return fail("The import has no properties");
  if (action.rows.length > 2000) return fail("A property import can have up to 2,000 rows");
  let ids = data.properties.map((p) => p.id);
  const imported: Property[] = [];
  for (let i = 0; i < action.rows.length; i++) {
    const parsed = validateProperty(fund, action.rows[i]!, `Line ${i + 2}`);
    if (typeof parsed === "string") return fail(parsed);
    const id = propertyId(fund.id, parsed.name, ids);
    ids = [...ids, id];
    imported.push({ ...parsed, id });
  }
  const oldIds = new Set(data.properties.filter((p) => p.fundId === fund.id).map((p) => p.id));
  const kept = action.mode === "replace" ? data.properties.filter((p) => p.fundId !== fund.id) : data.properties;
  if (kept.length + imported.length > MAX_ARRAY) return fail("There are too many properties across the portfolio");
  const changes: Partial<AppData> = { properties: [...kept, ...imported] };
  if (action.mode === "replace") {
    changes.propertyProfiles = [...data.propertyProfiles.filter((p) => !oldIds.has(p.propertyId)), ...imported.map((p) => defaultPropertyProfile(fund, p))];
    changes.assets = data.assets.map((asset) => (asset.propertyId && oldIds.has(asset.propertyId) ? { ...asset, propertyId: null } : asset));
  } else {
    changes.propertyProfiles = [...data.propertyProfiles, ...imported.map((p) => defaultPropertyProfile(fund, p))];
  }
  return withAudit(data, ctx, [{ fundId: fund.id, action: "Properties imported", detail: `${integer(imported.length)} rows ${action.mode === "replace" ? "replaced the register" : "appended"}` }], changes);
}

export function applyEntityAction(data: AppData, action: EntityAction, ctx: Ctx): ActionResult {
  switch (action.type) {
    case "entity-create-fund":
      return createFund(data, action, ctx);
    case "entity-update-fund":
      return updateFund(data, action, ctx);
    case "entity-delete-fund":
      return deleteFund(data, action, ctx);
    case "entity-add-holder":
      return addHolder(data, action, ctx);
    case "entity-update-holder":
      return updateHolder(data, action, ctx);
    case "entity-remove-holder":
      return removeHolder(data, action, ctx);
    case "entity-import-holders":
      return importHolders(data, action, ctx);
    case "entity-add-property":
      return addProperty(data, action, ctx);
    case "entity-update-property":
      return updateProperty(data, action, ctx);
    case "entity-remove-property":
      return removeProperty(data, action, ctx);
    case "entity-import-properties":
      return importProperties(data, action, ctx);
  }
}
