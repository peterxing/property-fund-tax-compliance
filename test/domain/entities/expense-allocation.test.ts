import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction } from "../../../src/domain/actions.ts";
import { appDataProblem } from "../../../src/domain/core/schema.ts";
import type { Action, AppData } from "../../../src/domain/types.ts";
import { ctxOf, denied, frozenSeed, ok } from "../core-fixtures.ts";

const setCustom: Action = {
  type: "entity-set-expense-allocation",
  fundId: "coastline",
  allocation: { method: "custom", sharesBps: { other: 6_000, ncmi: 2_000, transitional: 0, clean: 2_000 } },
};

function noProblem(data: AppData): void {
  assert.equal(appDataProblem(data), null);
}

test("entity-set-expense-allocation updates an AU Preparing fund immutably and audits old to new policy", () => {
  const before = frozenSeed();
  const after = ok(before, "r-okafor", setCustom);
  assert.notEqual(after, before);
  const beforeFund = before.funds.find((fund) => fund.id === "coastline");
  assert.equal(beforeFund?.market === "AU" ? beforeFund.expenseAllocation : null, undefined);
  const fund = after.funds.find((candidate) => candidate.id === "coastline");
  assert.deepEqual(fund?.market === "AU" ? fund.expenseAllocation : null, { method: "custom", sharesBps: { other: 6_000, ncmi: 2_000, transitional: 0, clean: 2_000 } });
  assert.equal(after.audit.at(-1)?.action, "Expense allocation policy updated");
  assert.match(after.audit.at(-1)?.detail ?? "", /Pro-rata by gross rent → Custom shares/);
  noProblem(after);
});

test("entity-set-expense-allocation refuses view-only, no-access, locked and SG funds", () => {
  const data = frozenSeed();
  assert.equal(denied(data, "m-castillo", setCustom), "You don't have permission to edit this fund");
  assert.equal(denied(data, "s-lim", setCustom), "You don't have access to this fund");
  assert.equal(denied(data, "a-moreno", { ...setCustom, fundId: "harbourline" }), "This fund is signed off. Reopen it to edit.");
  assert.equal(denied(data, "a-moreno", { ...setCustom, fundId: "southbank" }), "This fund is in review. Return it to the preparer to edit.");
  assert.equal(denied(data, "a-moreno", { ...setCustom, fundId: "telok-ayer" }), "Expense allocation only applies to Australian funds");
});

test("entity-set-expense-allocation validates custom basis points and is a no-op when unchanged", () => {
  const data = frozenSeed();
  const invalid = applyAction(
    data,
    {
      type: "entity-set-expense-allocation",
      fundId: "coastline",
      allocation: { method: "custom", sharesBps: { other: 6_000, ncmi: 2_000, transitional: 0, clean: 1_999 } },
    },
    ctxOf(data, "r-okafor"),
  );
  assert.equal(invalid.ok, false);
  assert.equal(invalid.ok ? "" : invalid.reason, "Custom expense allocation must total 100%");

  const after = ok(data, "r-okafor", { type: "entity-set-expense-allocation", fundId: "coastline", allocation: { method: "pro-rata" } });
  assert.equal(after, data);
});
