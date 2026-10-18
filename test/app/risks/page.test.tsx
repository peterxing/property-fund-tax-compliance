import { test } from "node:test";
import assert from "node:assert/strict";
import { mountApp } from "../../ui/harness.tsx";

test("risk register page renders filters, summary and Southbank risks", async () => {
  const app = await mountApp({ hash: "#/risks", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Risk register/);
  assert.match(app.text(), /Exceptions/);
  assert.match(app.text(), /Southbank Industrial Partners Fund/);
  assert.match(app.text(), /under-remitted|AMMA statements is overdue/i);
  assert.doesNotMatch(app.text(), /Note\s+Distribution/);
  await app.select(app.byLabel("Severity"), "Note");
  assert.match(app.text(), /Note/);
});
