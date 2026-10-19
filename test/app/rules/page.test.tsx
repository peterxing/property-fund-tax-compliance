import { test } from "node:test";
import assert from "node:assert/strict";
import { downloads, mountApp } from "../../ui/harness.tsx";

test("rules page renders rule list, caveat and detail deep links", async () => {
  const app = await mountApp({ hash: "#/rules", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Rules & sources/);
  assert.match(app.text(), /No tax adviser has reviewed these rules/);
  const links = app.allByRole("link", { name: /.+/ });
  assert.ok(links.some((link) => (link.getAttribute("href") ?? "").startsWith("#/rules?id=")));
  assert.match(app.text(), /Sources/);
  assert.match(app.text(), /Show more/);
  const docs = app.byRole("link", "tax rules documentation");
  assert.equal(docs.getAttribute("href"), "https://github.com/peterxing/property-fund-tax-compliance/blob/main/docs/rules/README.md", "reviewers are pointed at the documented calculations");
  assert.equal(docs.getAttribute("rel"), "noopener noreferrer");
});

test("rules page has a Fund settings tab with visible fund settings and CSV download", async () => {
  const app = await mountApp({ hash: "#/rules?tab=funds", now: "2026-10-12T09:00:00" });
  assert.match(app.text(), /Fund settings/);
  assert.match(app.text(), /Harbourline Office Trust/);
  assert.match(app.text(), /Pro-rata by gross rent/);
  assert.match(app.text(), /Land tax trust treatment/);
  assert.ok(app.allByRole("link", { name: "Trial balance" }).some((link) => link.getAttribute("href") === "#/trial-balance?fund=harbourline"));

  await app.click(app.byRole("button", "Download CSV"));
  assert.equal(downloads.length, 1);
  assert.match(downloads[0]!.fileName, /^fund-settings-/);
  assert.match(await downloads[0]!.blob.text(), /Fund,Market,Workflow status,Governance/);
});
