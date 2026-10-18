import { test } from "node:test";
import assert from "node:assert/strict";
import { mountApp } from "../../ui/harness.tsx";

test("calendar page renders KPI strip, filters and agenda obligations", async () => {
  const app = await mountApp({ hash: "#/calendar", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Compliance calendar/);
  assert.match(app.text(), /Overdue\s+6/);
  assert.match(app.text(), /AMMA statements/);
  assert.match(app.text(), /Southbank Industrial Partners Fund/);
  assert.match(app.text(), /Show later/);
});

test("calendar month view shows one month and writes month navigation to the hash", async () => {
  const app = await mountApp({ hash: "#/calendar?month=2026-10", now: "2026-10-12T09:00:00" });
  await app.click(app.byLabel("Month"));
  assert.match(app.text(), /October 2026/);
  assert.doesNotMatch(app.text(), /September 2026/);
  await app.click(app.byRole("button", "Previous"));
  assert.match(app.hash(), /month=2026-09/);
  await app.click(app.byRole("button", "Today"));
  assert.match(app.hash(), /month=2026-10/);
});
