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

test("asset import dialog includes a CSV or Excel file picker and the paste box", async () => {
  const app = await mountApp({ hash: "#/assets?fund=coastline", user: "a-moreno", now: "2026-10-12T09:00:00" });
  await app.click(app.byRole("button", "Import CSV"));
  const picker = app.byLabel("CSV or Excel file") as HTMLInputElement;
  assert.equal(picker.getAttribute("type"), "file");
  assert.match(picker.getAttribute("accept") ?? "", /\.xlsx/);
  assert.equal(app.byLabel("CSV rows").tagName, "TEXTAREA");
});

test("asset disposal dialog defaults to the register's year end and records a balancing adjustment", async () => {
  const app = await mountApp({ hash: "#/assets?fund=coastline", user: "a-moreno", now: "2026-10-12T09:00:00" });
  await app.click(app.allByRole("button", "Dispose")[0]!);
  // Coastline's period ends 30 Sep 2026, but the Division 40 register shows the income year ending 30 June 2026.
  assert.equal((app.byLabel("Disposal date") as HTMLInputElement).value, "2026-06-30");
  assert.match(app.text(), /This register shows the income year ending 30 Jun 2026; a later date falls in a later year\./);
  await app.type(app.byLabel("Termination value / proceeds"), "1000");
  await app.click(app.byRole("button", "Record disposal"));
  const disposed = app.store.getState().data.assets.filter((asset) => asset.fundId === "coastline" && asset.disposalDate !== undefined);
  assert.deepEqual(disposed.map((asset) => [asset.disposalDate, asset.disposalProceeds]), [["2026-06-30", 1000_00]]);
  const rowText = app.allByRole("row").map((row) => row.textContent ?? "").find((text) => text.includes(disposed[0]!.description)) ?? "";
  assert.match(rowText, /A\$1,000/, "the termination value above the nil adjustable value shows as balancing income");
});

test("locked assets workspace hides editing controls", async () => {
  const app = await mountApp({ hash: "#/assets?fund=harbourline", user: "a-moreno", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Signed off — reopen to edit/);
  assert.equal(app.queryByRole("button", "Add asset"), null);
  assert.equal(app.queryByRole("button", "Import CSV"), null);
  assert.equal(app.queryByRole("button", "Delete"), null);
});
