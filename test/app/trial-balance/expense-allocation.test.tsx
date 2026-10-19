import assert from "node:assert/strict";
import { test } from "node:test";
import { tbView } from "../../../src/domain/index.ts";
import { flatText } from "../../ui/dom.ts";
import { clock, mountApp } from "../../ui/harness.tsx";
import { announced } from "../../ui/shell.ts";

const dataOf = (app: Awaited<ReturnType<typeof mountApp>>) => app.store.getState().data;

test("trial balance lets an editor change AU expense allocation and previews the result", async () => {
  const app = await mountApp({ hash: "#/trial-balance?fund=coastline", user: "r-okafor", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Expense allocation policy/);
  assert.match(app.text(), /Current policy: Pro-rata by gross rent/);

  await app.select(app.byLabel("Method"), "All deductions against Australian income — other");
  const fund = dataOf(app).funds.find((candidate) => candidate.id === "coastline");
  assert.deepEqual(fund?.market === "AU" ? fund.expenseAllocation : null, { method: "other-income" });
  assert.match(announced(app), /expense allocation set to All deductions against Australian income — other/);
  assert.match(flatText(app.byRole("region", "Expense allocation policy")), /Current policy: All deductions against Australian income — other/);

  const preview = flatText(app.byRole("table", "Live preview of trial-balance components after this policy"));
  const view = tbView(dataOf(app), "coastline", new Date(clock.now.getTime()));
  const other = view.components.find((component) => component.key === "ausOtherIncome");
  assert.ok(other);
  assert.match(preview, new RegExp(String(Math.round(other.trialBalance / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")));
});

test("trial balance shows expense allocation read-only when the fund is locked", async () => {
  const app = await mountApp({ hash: "#/trial-balance?fund=harbourline", user: "a-moreno", now: "2026-10-12T09:00:00" });
  assert.match(flatText(app.byRole("region", "Expense allocation policy")), /Signed off — reopen to edit/);
  assert.equal(app.queryByRole("combobox", "Method"), null);
});
