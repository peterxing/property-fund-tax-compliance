import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveLabel, fundSettingsView, ruleParam } from "../../../src/app/workspaces/rules/model.ts";
import type { RuleRegisterRow } from "../../../src/domain/portfolio/index.ts";
import { visibleFunds } from "../../../src/domain/index.ts";
import { seedData } from "../../../src/domain/seed/index.ts";

const row: RuleRegisterRow = {
  registryKey: "AU:rule-1",
  market: "AU",
  id: "rule-1",
  domain: "AU_MIT",
  domainLabel: "AU MIT / AMIT",
  title: "Rule",
  summary: "Summary",
  effectiveFrom: "2026-07-01",
  effectiveTo: "",
  sources: [{ title: "Source", publisher: "ATO", url: "https://example.test", retrieved: "2026-10-01" }],
  confidence: "VERIFIED",
  notes: "",
};

test("rules model labels effective dates and deep-link params", () => {
  assert.equal(effectiveLabel(row), "2026-07-01 to current");
  assert.equal(ruleParam(row), "AU:rule-1");
  assert.equal(effectiveLabel({ ...row, effectiveFrom: "", effectiveTo: "2026-12-31" }), "start not stated to 2026-12-31");
});

test("fund settings model lists visible funds with settings and a CSV", () => {
  const data = seedData();
  const user = data.users.find((candidate) => candidate.id === "a-moreno")!;
  const ctx = { user, now: new Date(2026, 9, 12, 9, 0, 0) };
  const view = fundSettingsView(data, visibleFunds(data, user, "all"), ctx);
  assert.equal(view.rows.length, 9);
  const coastline = view.rows.find((fund) => fund.fundId === "coastline");
  assert.ok(coastline);
  assert.equal(coastline.expenseAllocation, "Pro-rata by gross rent");
  assert.equal(coastline.unmappedAccounts, 1);
  assert.equal(coastline.links.trialBalance, "#/trial-balance?fund=coastline");
  assert.deepEqual(view.csv.columns.slice(0, 4), ["Fund", "Market", "Workflow status", "Governance"]);
  assert.equal(view.csv.rows.length, view.rows.length);
});
