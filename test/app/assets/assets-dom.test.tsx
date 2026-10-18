import assert from "node:assert/strict";
import { test } from "node:test";
import { mountApp } from "../../ui/harness.tsx";

test("assets workspace renders register status and action controls", async () => {
  const app = await mountApp({ hash: "#/assets?fund=coastline", user: "a-moreno", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Division 40 plant/);
  assert.match(app.text(), /Register agrees with the trial balance/);
  assert.equal(app.byRole("button", "Add asset").getAttribute("aria-disabled"), null);
  assert.equal(app.byRole("button", "Use register totals in the trial balance").getAttribute("aria-disabled"), "true");
});

test("assets tabs read and write the route tab parameter", async () => {
  const app = await mountApp({ hash: "#/assets?fund=coastline&tab=schedule", user: "a-moreno", now: "2026-10-12T09:00:00" });
  assert.equal(app.byRole("tab", "Schedule").getAttribute("aria-selected"), "true");
  await app.click(app.byRole("tab", "Register"));
  assert.match(app.hash(), /tab=register/);
});

test("asset import dialog includes file picker and paste box", async () => {
  const app = await mountApp({ hash: "#/assets?fund=coastline", user: "a-moreno", now: "2026-10-12T09:00:00" });
  await app.click(app.byRole("button", "Import CSV"));
  assert.equal(app.byLabel("CSV file").getAttribute("type"), "file");
  assert.equal(app.byLabel("CSV rows").tagName, "TEXTAREA");
});

test("locked assets workspace hides editing controls", async () => {
  const app = await mountApp({ hash: "#/assets?fund=harbourline", user: "a-moreno", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Signed off — reopen to edit/);
  assert.equal(app.queryByRole("button", "Add asset"), null);
  assert.equal(app.queryByRole("button", "Import CSV"), null);
  assert.equal(app.queryByRole("button", "Delete"), null);
});
