import assert from "node:assert/strict";
import test from "node:test";
import { downloads, mountApp } from "../../ui/harness.tsx";

test("due diligence page renders sections, statuses and downloads", async () => {
  const app = await mountApp({ hash: "#/due-diligence?fund=harbourline", user: "a-moreno", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Tax due diligence report/);
  assert.match(app.text(), /Entity and regime/);
  assert.match(app.text(), /Distribution and withholding/);
  assert.match(app.text(), /Clear|Attention|Issue/);
  assert.deepEqual(app.allByRole("heading", { level: 2 }).map((heading) => heading.textContent?.trim()), ["Harbourline Office Trust"]);
  assert.ok(app.allByRole("heading", { level: 3 }).some((heading) => heading.textContent?.trim() === "Tax due diligence report"));
  app.byRole("button", { name: /Download findings CSV/ });
  app.byRole("button", { name: /Download PDF/ });
  app.byRole("button", { name: /^Reopen$/ });
});

test("view-only persona can read and download but sees no data-changing controls", async () => {
  const app = await mountApp({ hash: "#/due-diligence?fund=harbourline", user: "m-castillo", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Read-only due-diligence pack/);
  assert.equal(app.queryByRole("button", { name: /^Sign off$/ }), null);
  assert.equal(app.queryByRole("button", { name: /Record|Add|Import|Save|Delete|Reopen/ }), null);
  await app.click(app.byRole("button", { name: /Download findings CSV/ }));
  assert.ok(downloads.some((download) => download.fileName.endsWith("tax-due-diligence-findings.csv")));
});

test("route cannot expose a hidden fund to a persona without access", async () => {
  const app = await mountApp({ hash: "#/due-diligence?fund=telok-ayer", user: "l-brennan", now: "2026-10-12T09:00:00" });
  assert.doesNotMatch(app.text(), /Telok Ayer Commercial REIT/);
  assert.match(app.text(), /Harbourline Office Trust/);
});
