import assert from "node:assert/strict";
import { test } from "node:test";
import { domWindow, mountApp } from "../../ui/harness.tsx";

test("Head of Tax creates a fund on Data and opens it in Distributions", async () => {
  const app = await mountApp({ hash: "#/data", user: "a-moreno", now: "2026-10-12T09:00:00" });
  await app.click(app.byRole("button", "New fund"));
  await app.type(app.byLabel("Fund name"), "Alpha Office Trust");
  await app.type(app.byLabel("Sector"), "Office");
  await app.click(app.byRole("button", "Save fund"));
  assert.match(app.text(), /Alpha Office Trust/);
  await app.click(app.byRole("link", "Alpha Office Trust"));
  assert.match(app.text(), /Alpha Office Trust/);
  assert.equal(app.store.getState().ui.selectedFundId, "alpha-office-trust");
});

test("Data tables use shared table and non-danger row-action styling", async () => {
  const app = await mountApp({ hash: "#/data", user: "a-moreno", now: "2026-10-12T09:00:00" });
  assert.equal(app.$("table").classList.contains("dt"), true);
  assert.equal(app.$$("th.num").length >= 2, true);
  for (const rowDelete of app.allByRole("button", "Delete")) assert.equal(rowDelete.classList.contains("btn--danger"), false);
  assert.equal(app.text().includes("Signed off"), true, "status chip text is present in the table");
  await app.click(app.byRole("tab", "Holders"));
  assert.equal(app.$("table").classList.contains("dt"), true);
  assert.equal(app.$$("th.num").length >= 1, true);
  await app.click(app.byRole("tab", "Properties"));
  assert.equal(app.$("table").classList.contains("dt"), true);
  assert.equal(app.$$("th.num").length >= 1, true);
});

test("Data page only lists funds visible to the active persona", async () => {
  const app = await mountApp({ hash: "#/data", user: "d-harrow", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Harbourline Office Trust/);
  assert.doesNotMatch(app.text(), /Telok Ayer Commercial REIT/);
  assert.doesNotMatch(app.text(), /Loyang Logistics REIT/);
});

test("Holders and properties tabs fall back from a hidden fund hash", async () => {
  const app = await mountApp({ hash: "#/data?tab=holders&fund=telok-ayer", user: "d-harrow", now: "2026-10-12T09:00:00" });
  assert.doesNotMatch(app.text(), /Telok Ayer Commercial REIT/);
  assert.match(domWindow.location.hash, /fund=harbourline/);
  assert.equal([...app.byLabel("Fund").querySelectorAll("option")].some((o) => o.textContent?.includes("Telok Ayer")), false);
  await app.click(app.byRole("tab", "Properties"));
  assert.equal([...app.byLabel("Fund").querySelectorAll("option")].some((o) => o.textContent?.includes("Telok Ayer")), false);
  assert.doesNotMatch(app.text(), /S\$|Telok Ayer/);
});

test("the view-only persona is offered no edit, add or import controls on Data", async () => {
  const app = await mountApp({ hash: "#/data", user: "m-castillo", now: "2026-10-12T09:00:00" });
  assert.equal(app.queryByRole("button", "Edit"), null, "no Edit on the funds table");
  assert.equal(app.queryByRole("columnheader", "Actions"), null, "and no empty Actions column");
  await app.navigate("#/data?tab=holders&fund=coastline");
  assert.match(app.text(), /View only for your role\./);
  assert.equal(app.queryByRole("button", "Add holder"), null);
  assert.equal(app.queryByRole("button", "Import holders"), null);
  assert.equal(app.queryByRole("textbox", "Holder"), null);
  await app.click(app.byRole("tab", "Properties"));
  assert.equal(app.queryByRole("button", "Add property"), null);
  assert.equal(app.queryByRole("button", "Import properties"), null);
});

test("a preparer adds a property through labelled fields and sees the acquisition date as a date", async () => {
  const app = await mountApp({ hash: "#/data?tab=properties&fund=coastline", user: "a-moreno", now: "2026-10-12T09:00:00" });
  await app.type(app.byLabel("Name"), "Bayside Day Hospital");
  await app.type(app.byLabel("Location"), "Frankston VIC");
  await app.type(app.byLabel("Acquired"), "2024-03-15");
  await app.type(app.byLabel("Capital works claimed"), "125000");
  await app.type(app.byLabel("Valuation"), "48000000");
  await app.click(app.byRole("button", "Add property"));
  const added = app.store.getState().data.properties.find((property) => property.name === "Bayside Day Hospital");
  assert.ok(added, "the property was added");
  assert.equal(added.capitalWorksClaimed, 12_500_000);
  assert.match(app.text(), /Bayside Day Hospital\s+Frankston VIC\s+15 Mar 2024/);
});
