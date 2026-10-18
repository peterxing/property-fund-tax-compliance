import assert from "node:assert/strict";
import { test } from "node:test";
import { mountApp } from "../../ui/harness.tsx";

test("Compare workspace loads a practice file, shows results and raises a query", async () => {
  const app = await mountApp({ hash: "#/compare?fund=harbourline", user: "a-moreno", now: "2026-10-12T09:00:00" });
  assert.equal((app.byLabel("Statement to compare") as HTMLSelectElement).value, "distribution-components");
  await app.click(app.byRole("button", { name: /Load the practice file/ }));
  assert.match(app.text(), /Loaded 6 lines; skipped 1 heading or non-amount row/);
  assert.match(app.text(), /component\.ausOtherIncome\s+Australian income — other\s+48,318,400\.00/);
  assert.match(app.text(), /3 of 5 comparable lines match/);
  assert.match(app.text(), /Sign convention/);
  await app.select(app.byLabel("Status filter"), "Differs");
  assert.match(app.text(), /Australian interest/);
  await app.click(app.byRole("button", { name: /Raise a query with this comparison/ }));
  assert.match(app.text(), /Query raised for Distribution components/);
});
