import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCalcVersion, inputHash, versionDiff } from "../../../src/domain/governance/versions.ts";
import { ctxOf, fundOf, ok, seed } from "../core-fixtures.ts";

test("AU expense allocation participates in version input hashes and input diffs", () => {
  const before = seed();
  const fund = fundOf(before, "coastline");
  const ctx = ctxOf(before, "r-okafor");
  const saved = buildCalcVersion(before, fund, ctx, "manual", "Before policy change", null);

  const after = ok(before, "r-okafor", {
    type: "entity-set-expense-allocation",
    fundId: "coastline",
    allocation: { method: "other-income" },
  });
  assert.notEqual(inputHash(after, "coastline"), saved.inputHash);
  const diff = versionDiff(after, saved, "current", ctx.now);
  assert.equal(diff.hashEqual, false);
  assert.ok(diff.inputs.some((row) => row.ref === "expenseAllocation" && row.label === "Expense allocation policy" && row.then === "pro-rata" && row.now === "other-income"));
});
