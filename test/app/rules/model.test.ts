import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveLabel, ruleParam } from "../../../src/app/workspaces/rules/model.ts";
import type { RuleRegisterRow } from "../../../src/domain/portfolio/index.ts";

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
