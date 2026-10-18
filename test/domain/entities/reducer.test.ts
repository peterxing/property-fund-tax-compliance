import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction } from "../../../src/domain/actions.ts";
import { appDataProblem, persistedProblem } from "../../../src/domain/core/schema.ts";
import { accessView, analyticsView, costBaseView, fundCalc, investorView, returnView, rulesFor, scenarioView, tbView, workflowView, workbookModel } from "../../../src/domain/index.ts";
import { moduleFor } from "../../../src/domain/modules.ts";
import { FEATURE_PROVIDERS } from "../../../src/domain/providers.ts";
import { buildCalcVersion } from "../../../src/domain/governance/versions.ts";
import type { Action, AppData, Ctx, FundId } from "../../../src/domain/types.ts";
import { ctxOf, deepFreeze, denied, frozenSeed, ok, seed } from "../core-fixtures.ts";

const createdAu: Action = {
  type: "entity-create-fund",
  fund: { market: "AU", name: "New AU Fund", sector: "Office", listed: false, periodStart: "2025-07-01", periodEnd: "2026-06-30", unitsOnIssue: 1000, governance: "no-agent" },
};
const createdSg: Action = {
  type: "entity-create-fund",
  fund: { market: "SG", name: "New SG REIT", sector: "Retail", listed: true, periodStart: "2026-07-01", periodEnd: "2026-09-30", unitsOnIssue: 2000, governance: "agent-signs-off", assessmentYear: 2027 },
};

const holderDraft = { holder: "New Holder", country: "Singapore", units: 10, sgClass: "qualifying" as const };
const propertyDraft = { name: "New Tower", location: "Singapore", acquired: "2026-01-01", cost: 100, improvements: 0, valuation: 200 };

function noProblem(data: AppData): void {
  assert.equal(appDataProblem(data), null);
  assert.equal(persistedProblem({ data, ui: { currentUserId: "a-moreno", jurisdiction: "all", selectedFundId: data.funds[0]?.id ?? null } }), null);
}

function assertNoBadNumbers(value: unknown, path = "value"): void {
  if (value === undefined) assert.fail(`${path} is undefined`);
  if (typeof value === "number") assert.equal(Number.isNaN(value), false, `${path} is NaN`);
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) value.forEach((child, i) => assertNoBadNumbers(child, `${path}[${i}]`));
  else for (const [key, child] of Object.entries(value)) assertNoBadNumbers(child, `${path}.${key}`);
}

test("entity-create-fund creates empty AU and SG funds with schema-valid defaults", () => {
  let data = frozenSeed();
  data = ok(data, "a-moreno", createdAu);
  data = ok(data, "a-moreno", createdSg);
  const au = data.funds.find((f) => f.id === "new-au-fund");
  const sg = data.funds.find((f) => f.id === "new-sg-reit");
  assert.equal(au?.status, "Preparing");
  assert.deepEqual(au?.inputs, { cashDistribution: 0, ausOtherIncome: 0, ncmi: 0, excludedNcmi: 0, cleanBuilding: 0, interest: 0, discountGainTarp: 0, otherGainTarp: 0, foreignIncome: 0 });
  assert.equal(data.unitCostBase["new-au-fund"]?.unitPrice, 1);
  assert.equal(data.taxAdjustments["new-au-fund"]?.div40, 0);
  assert.equal(sg?.market, "SG");
  assert.deepEqual(data.sgLedger["new-sg-reit"], { exempt: 0, capital: 0, afterTax: 0 });
  noProblem(data);
});

test("entity-create-fund is Head-of-Tax only and validates key inputs", () => {
  const data = frozenSeed();
  assert.equal(denied(data, "w-l-teo", createdAu), "You don't have permission to create funds");
  assert.equal(denied(data, "a-moreno", { type: "entity-create-fund", fund: { ...createdAu.fund, name: "" } }), "Fund name is required");
  assert.equal(denied(data, "a-moreno", { type: "entity-create-fund", fund: { ...createdAu.fund, unitsOnIssue: 0 } }), "Units on issue must be a whole number of at least 1");
});

test("entity-update-fund cannot change governance or mass-assign protected fund fields", () => {
  const data = frozenSeed();
  assert.equal(
    denied(data, "w-l-teo", { type: "entity-update-fund", fundId: "telok-ayer", patch: { governance: "no-agent" } }),
    "Change governance on the Access page",
  );
  const malicious = applyAction(
    data,
    {
      type: "entity-update-fund",
      fundId: "telok-ayer",
      patch: { name: "Safe Rename", id: "owned", status: "Signed off", market: "AU", inputs: { taxableDistributed: 1 }, whtRemitted: 1 } as never,
    },
    ctxOf(data, "w-l-teo"),
  );
  assert.equal(malicious.ok, true, malicious.ok ? "" : malicious.reason);
  const next = malicious.ok ? malicious.data.funds.find((f) => f.id === "telok-ayer")! : null;
  assert.equal(next?.name, "Safe Rename");
  assert.equal(next?.id, "telok-ayer");
  assert.equal(next?.status, "Preparing");
  assert.equal(next?.market, "SG");
  assert.equal(next?.whtRemitted, null);
  assert.deepEqual(next?.inputs, data.funds.find((f) => f.id === "telok-ayer")?.inputs);
});

test("entity-update-fund refuses period changes when lodged or published records exist", () => {
  const reason = "This fund has lodged or published records for its current period; its dates can't be changed. Create a new fund for a new period.";
  const base = seed();
  const fund = base.funds.find((f) => f.id === "telok-ayer")!;
  const ctx = ctxOf(base, "w-l-teo");
  const version = buildCalcVersion(base, fund, ctx, "manual", "Saved", null);
  const cases: Array<[keyof AppData, Partial<AppData>]> = [
    ["gstFilings", { gstFilings: [{ id: "gf-x", fundId: "telok-ayer", periodStart: "2026-07-01", periodEnd: "2026-09-30", kind: "GST F5", reference: "GST-1", lodgedDate: "2026-10-01", actor: "W. L. Teo", figures: {} }] }],
    ["lodgments", { lodgments: [{ fundId: "telok-ayer", kind: "form-ut", reference: "UT-1", date: "2026-10-01", actor: "W. L. Teo" }] }],
    ["sgNotices", { sgNotices: [{ id: "sg-x", fundId: "telok-ayer", recordDate: "2026-09-15", declarationDeadline: "2026-09-20", paymentDate: "2026-09-30", publishedOn: "2026-09-10", notified: null }] }],
    ["versions", { versions: [version] }],
  ];
  for (const [label, patch] of cases) {
    const data = deepFreeze({ ...seed(), ...patch });
    assert.equal(denied(data, "w-l-teo", { type: "entity-update-fund", fundId: "telok-ayer", patch: { periodStart: "2026-07-02" } }), reason, label);
  }
  const auData = deepFreeze({ ...seed(), auNotices: [{ id: "au-x", fundId: "coastline", label: "Q1", recordDate: "2026-09-01", paymentDate: "2026-09-30", cash: 1, final: false, publishedOn: "2026-09-01", notified: null }] });
  assert.equal(denied(auData, "r-okafor", { type: "entity-update-fund", fundId: "coastline", patch: { periodStart: "2025-10-02" } }), reason);
});

test("entity-update-fund allows unlocked period changes and audits ISO dates", () => {
  let before = frozenSeed();
  before = ok(before, "a-moreno", { type: "entity-create-fund", fund: { market: "AU", name: "Unlocked Period Fund", sector: "Office", listed: false, periodStart: "2025-10-01", periodEnd: "2026-09-30", unitsOnIssue: 1000, governance: "no-agent" } });
  const after = ok(before, "a-moreno", { type: "entity-update-fund", fundId: "unlocked-period-fund", patch: { periodStart: "2025-10-02" } });
  const fund = after.funds.find((f) => f.id === "unlocked-period-fund")!;
  assert.equal(fund.periodStart, "2025-10-02");
  assert.equal(after.audit.at(-1)?.action, "Fund details updated");
  assert.match(after.audit.at(-1)?.detail ?? "", /Period 2025-10-01–2026-09-30 → 2025-10-02–2026-09-30/);
  noProblem(after);
});

test("set-governance remains the only governance path and clears approvals no longer required", () => {
  let data = ok(frozenSeed(), "a-moreno", { type: "set-governance", fundId: "telok-ayer", mode: "agent-lodges" });
  data = ok(data, "a-moreno", { type: "submit", fundId: "telok-ayer" });
  data = ok(data, "n-pillai", { type: "approve", fundId: "telok-ayer", level: "review" });
  data = ok(data, "s-lim", { type: "approve", fundId: "telok-ayer", level: "agent" });
  data = ok(data, "a-moreno", { type: "set-governance", fundId: "telok-ayer", mode: "no-agent" });
  assert.equal(data.approvals.some((a) => a.fundId === "telok-ayer" && a.level === "agent"), false);
  assert.equal(denied(data, "w-l-teo", { type: "set-governance", fundId: "telok-ayer", mode: "agent-signs-off" }), "You don't have permission to change governance");
});

test("entity actions refuse view-only, wrong-role and no-access users", () => {
  const data = frozenSeed();
  const holderId = data.holders.find((h) => h.fundId === "telok-ayer")!.id;
  const propertyId = data.properties.find((p) => p.fundId === "telok-ayer")!.id;
  const editActions: Action[] = [
    { type: "entity-update-fund", fundId: "telok-ayer", patch: { name: "Changed" } },
    { type: "entity-add-holder", fundId: "telok-ayer", holder: holderDraft },
    { type: "entity-update-holder", fundId: "telok-ayer", holderId, patch: { units: 11 } },
    { type: "entity-remove-holder", fundId: "telok-ayer", holderId },
    { type: "entity-import-holders", fundId: "telok-ayer", mode: "append", rows: [holderDraft] },
    { type: "entity-add-property", fundId: "telok-ayer", property: propertyDraft },
    { type: "entity-update-property", fundId: "telok-ayer", propertyId, patch: { valuation: 300 } },
    { type: "entity-remove-property", fundId: "telok-ayer", propertyId },
    { type: "entity-import-properties", fundId: "telok-ayer", mode: "append", rows: [propertyDraft] },
  ];
  for (const action of editActions) {
    assert.equal(denied(data, "m-castillo", action), "You don't have permission to edit this fund", action.type);
    assert.equal(denied(data, "n-pillai", action), "You don't have permission to edit this fund", action.type);
    assert.equal(denied(data, "r-okafor", action), "You don't have access to this fund", action.type);
  }
  assert.equal(denied(data, "m-castillo", createdAu), "You don't have permission to create funds");
  assert.equal(denied(data, "w-l-teo", { type: "entity-delete-fund", fundId: "telok-ayer", confirmName: "Telok Ayer Commercial REIT" }), "You don't have permission to delete funds");
});

test("holder and property entity actions are locked outside Preparing", () => {
  const data = frozenSeed();
  const holderId = data.holders.find((h) => h.fundId === "meranti")!.id;
  const propertyId = data.properties.find((p) => p.fundId === "meranti")!.id;
  const locked: Action[] = [
    { type: "entity-add-holder", fundId: "meranti", holder: holderDraft },
    { type: "entity-update-holder", fundId: "meranti", holderId, patch: { units: 1 } },
    { type: "entity-remove-holder", fundId: "meranti", holderId },
    { type: "entity-import-holders", fundId: "meranti", mode: "append", rows: [holderDraft] },
    { type: "entity-add-property", fundId: "meranti", property: propertyDraft },
    { type: "entity-update-property", fundId: "meranti", propertyId, patch: { valuation: 1 } },
    { type: "entity-remove-property", fundId: "meranti", propertyId },
    { type: "entity-import-properties", fundId: "meranti", mode: "append", rows: [propertyDraft] },
  ];
  for (const action of locked) assert.equal(denied(data, "a-moreno", action), "This fund is in review. Return it to the preparer to edit.", action.type);
});

test("entity actions return validation messages without changing frozen input", () => {
  const data = frozenSeed();
  assert.equal(denied(data, "a-moreno", { type: "entity-update-fund", fundId: "telok-ayer", patch: { unitsOnIssue: 0 } }), "Units on issue must be a whole number of at least 1");
  assert.equal(denied(data, "w-l-teo", { type: "entity-add-holder", fundId: "telok-ayer", holder: { ...holderDraft, holder: "" } }), "Unitholder: holder name is required");
  assert.equal(denied(data, "w-l-teo", { type: "entity-import-holders", fundId: "telok-ayer", mode: "append", rows: [] }), "The import has no unitholders");
  assert.equal(denied(data, "w-l-teo", { type: "entity-add-property", fundId: "telok-ayer", property: { ...propertyDraft, acquired: "bad-date" } }), "Property: acquired date must be a real date");
  assert.equal(denied(data, "w-l-teo", { type: "entity-import-properties", fundId: "telok-ayer", mode: "append", rows: [] }), "The import has no properties");
});

test("holders and properties require Preparing, keep cost-base openings in step, and audit changes", () => {
  let data = frozenSeed();
  data = ok(data, "w-l-teo", { type: "entity-add-holder", fundId: "telok-ayer", holder: { holder: "New Holder", country: "Singapore", units: 10, sgClass: "qualifying" } });
  const holder = data.holders.find((h) => h.holder === "New Holder")!;
  assert.equal(data.unitCostBase["telok-ayer"]?.opening[holder.id], 0);
  data = ok(data, "w-l-teo", { type: "entity-remove-holder", fundId: "telok-ayer", holderId: holder.id });
  assert.equal(data.unitCostBase["telok-ayer"]?.opening[holder.id], undefined);
  data = ok(data, "w-l-teo", { type: "entity-add-property", fundId: "telok-ayer", property: { name: "New Tower", location: "Singapore", acquired: "2026-01-01", cost: 100, improvements: 0, valuation: 200 } });
  const property = data.properties.find((p) => p.name === "New Tower")!;
  data = ok(data, "w-l-teo", { type: "entity-remove-property", fundId: "telok-ayer", propertyId: property.id });
  assert.equal(data.properties.some((p) => p.id === property.id), false);
  assert.match(data.audit.at(-1)?.action ?? "", /Property removed/);
  assert.equal(denied(frozenSeed(), "a-moreno", { type: "entity-add-holder", fundId: "meranti", holder: { holder: "x", country: "SG", units: 1, sgClass: "qualifying" } }), "This fund is in review. Return it to the preparer to edit.");
  noProblem(data);
});

test("entity action audit text is specific", () => {
  let data = frozenSeed();
  data = ok(data, "a-moreno", { type: "entity-update-fund", fundId: "telok-ayer", patch: { name: "Telok Ayer Commercial REIT 2" } });
  assert.equal(data.audit.at(-1)?.action, "Fund details updated");
  assert.match(data.audit.at(-1)?.detail ?? "", /Name: Telok Ayer Commercial REIT → Telok Ayer Commercial REIT 2/);
  data = ok(data, "w-l-teo", { type: "entity-add-holder", fundId: "telok-ayer", holder: holderDraft });
  assert.equal(data.audit.at(-1)?.action, "Unitholder added");
  assert.match(data.audit.at(-1)?.detail ?? "", /New Holder: 10 units/);
  data = ok(data, "w-l-teo", { type: "entity-add-property", fundId: "telok-ayer", property: propertyDraft });
  assert.equal(data.audit.at(-1)?.action, "Property added");
  assert.match(data.audit.at(-1)?.detail ?? "", /New Tower/);
});

test("holder and property imports can replace fund-owned records only", () => {
  let data = frozenSeed();
  const beforeOther = data.holders.filter((h) => h.fundId === "kallang").length;
  data = ok(data, "w-l-teo", { type: "entity-import-holders", fundId: "telok-ayer", mode: "replace", rows: [{ holder: "Only Holder", country: "Singapore", units: 99, sgClass: "qualifying" }] });
  assert.deepEqual(data.holders.filter((h) => h.fundId === "telok-ayer").map((h) => h.holder), ["Only Holder"]);
  assert.equal(data.holders.filter((h) => h.fundId === "kallang").length, beforeOther);
  data = ok(data, "w-l-teo", { type: "entity-import-properties", fundId: "telok-ayer", mode: "replace", rows: [{ name: "Only Property", location: "Singapore", acquired: "2024-01-01", cost: 1, improvements: 0, valuation: 2 }] });
  assert.deepEqual(data.properties.filter((p) => p.fundId === "telok-ayer").map((p) => p.name), ["Only Property"]);
  noProblem(data);
});

test("entity-delete-fund cascades every fund-owned record and remains persistable", () => {
  const before = frozenSeed();
  const deletedFundId = "telok-ayer";
  const deletedPropertyIds = new Set(before.properties.filter((p) => p.fundId === deletedFundId).map((p) => p.id));
  const data = ok(before, "a-moreno", { type: "entity-delete-fund", fundId: deletedFundId, confirmName: "Telok Ayer Commercial REIT" });
  assert.equal(data.funds.some((f) => f.id === deletedFundId), false);
  for (const key of ["holders", "tbRows", "properties", "auNotices", "sgNotices", "queries", "audit", "approvals", "lodgments", "gstLedger", "gstFilings", "propertyProfiles", "assets", "versions", "manualAdjustments"] as const) {
    assert.equal(data[key].some((r) => "fundId" in r && r.fundId === deletedFundId), false, key);
  }
  for (const user of data.users) if (user.funds !== "all") assert.equal(user.funds.includes(deletedFundId), false, user.id);
  for (const key of ["unitCostBase", "taxAdjustments", "sgLedger"] as const) assert.equal(Object.hasOwn(data[key], deletedFundId), false, key);
  assert.equal(data.propertyProfiles.some((profile) => deletedPropertyIds.has(profile.propertyId)), false);
  assert.equal(data.assets.some((asset) => asset.propertyId !== null && deletedPropertyIds.has(asset.propertyId)), false);
  const deleteAudit = data.audit.at(-1);
  assert.equal(deleteAudit?.fundId, "harbourline");
  assert.equal(deleteAudit?.action, "Fund deleted");
  assert.equal(deleteAudit?.detail, "Telok Ayer Commercial REIT (telok-ayer) and all its records were deleted by A. Moreno; recorded here because the deleted fund's own trail was removed");
  noProblem(data);
});

test("entity-delete-fund refuses signed-off funds, wrong confirmation text and users who would lose all explicit access", () => {
  const data = frozenSeed();
  assert.equal(denied(data, "a-moreno", { type: "entity-delete-fund", fundId: "loyang", confirmName: "Loyang Logistics REIT" }), "This fund is signed off. Reopen it before deleting it.");
  assert.equal(denied(data, "a-moreno", { type: "entity-delete-fund", fundId: "telok-ayer", confirmName: "Telok" }), "Type the fund name exactly to confirm deletion");
  const onlyAccess = seed();
  onlyAccess.users = onlyAccess.users.map((u) => (u.id === "s-lim" ? { ...u, funds: ["telok-ayer"] } : u));
  assert.equal(
    denied(deepFreeze(onlyAccess), "a-moreno", { type: "entity-delete-fund", fundId: "telok-ayer", confirmName: "Telok Ayer Commercial REIT" }),
    "S. Lim has access to this fund only. Change their access on the Access page first.",
  );
});

test("no entity action grants new explicit fund access to any user", () => {
  const base = seed();
  const propertyId = base.properties.find((p) => p.fundId === "telok-ayer")!.id;
  const holderId = base.holders.find((h) => h.fundId === "telok-ayer")!.id;
  const actions: Action[] = [
    createdAu,
    { type: "entity-update-fund", fundId: "telok-ayer", patch: { name: "Telok Ayer Commercial REIT Updated" } },
    { type: "entity-delete-fund", fundId: "telok-ayer", confirmName: "Telok Ayer Commercial REIT" },
    { type: "entity-add-holder", fundId: "telok-ayer", holder: { holder: "New Holder", country: "Singapore", units: 1, sgClass: "qualifying" } },
    { type: "entity-update-holder", fundId: "telok-ayer", holderId, patch: { units: 2 } },
    { type: "entity-remove-holder", fundId: "telok-ayer", holderId },
    { type: "entity-import-holders", fundId: "telok-ayer", mode: "append", rows: [{ holder: "Imported Holder", country: "Singapore", units: 1, sgClass: "qualifying" }] },
    { type: "entity-add-property", fundId: "telok-ayer", property: { name: "New Property", location: "Singapore", acquired: "2026-01-01", cost: 1, improvements: 0, valuation: 2 } },
    { type: "entity-update-property", fundId: "telok-ayer", propertyId, patch: { valuation: 3 } },
    { type: "entity-remove-property", fundId: "telok-ayer", propertyId },
    { type: "entity-import-properties", fundId: "telok-ayer", mode: "append", rows: [{ name: "Imported Property", location: "Singapore", acquired: "2026-01-01", cost: 1, improvements: 0, valuation: 2 }] },
  ];
  for (const action of actions) {
    const before = deepFreeze(seed());
    const beforeFunds = new Map(before.users.map((u) => [u.id, u.funds === "all" ? "all" : [...u.funds]]));
    const result = applyAction(before, action, ctxOf(before, "a-moreno"));
    assert.equal(result.ok, true, result.ok ? "" : `${action.type}: ${result.reason}`);
    for (const user of result.data.users) {
      const prior = beforeFunds.get(user.id);
      if (prior === "all") {
        assert.equal(user.funds, "all", `${action.type} changed all-funds access for ${user.id}`);
      } else {
        assert.notEqual(user.funds, "all", `${action.type} promoted ${user.id} to all funds`);
        const beforeSet = new Set(prior);
        for (const fundId of user.funds as string[]) assert.equal(beforeSet.has(fundId), true, `${action.type} granted ${user.id} access to ${fundId}`);
      }
    }
  }
});

test("newly-created AU and SG funds do not break selectors, market modules or feature providers for any persona with access", () => {
  let data = frozenSeed();
  data = ok(data, "a-moreno", createdAu);
  data = ok(data, "a-moreno", createdSg);
  const ids: FundId[] = ["new-au-fund", "new-sg-reit"];
  for (const user of data.users) {
    const ctx: Ctx = { user, now: new Date(2026, 9, 12, 9, 0, 0) };
    accessView(data, ctx);
    analyticsView(data, ctx, "all");
    workbookModel(data, ctx, "all");
    for (const id of ids) {
      if (user.funds !== "all" && !user.funds.includes(id)) continue;
      const fund = data.funds.find((f) => f.id === id)!;
      const module = moduleFor(fund.market);
      const calc = fundCalc(data, id, ctx.now);
      workflowView(data, id, ctx);
      tbView(data, id, ctx.now);
      returnView(data, id, ctx);
      investorView(data, id, ctx);
      costBaseView(data, id, ctx);
      scenarioView(data, id, ctx);
      rulesFor(fund);
      module.rules(fund);
      module.fundCalc(data, fund, ctx.now);
      for (const provider of FEATURE_PROVIDERS) {
        provider.deadlines?.(data, fund, ctx.now);
        provider.risks?.(data, fund, ctx.now);
        provider.compareSources?.(data, fund, ctx.now);
      }
      assertNoBadNumbers(calc);
    }
  }
});
