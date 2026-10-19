import assert from "node:assert/strict";
import { test } from "node:test";
import { mountApp } from "../../ui/harness.tsx";

test("property taxes workspace renders annual taxes and switches to duties", async () => {
  const app = await mountApp({ hash: "#/property-taxes?fund=harbourline", user: "a-moreno", now: "2026-10-12T09:00:00" });
  assert.match(app.flat(), /Total annual tax this year/);
  assert.match(app.flat(), /Harbourline Tower/);
  assert.match(app.flat(), /A\$9,674,048/);
  await app.click(app.byRole("tab", "Duties on acquisition"));
  assert.match(app.flat(), /Riverside Place/);
  assert.match(app.flat(), /Queensland transfer-duty rates/, "the basis is named in words");
  assert.ok(app.$$(".ptax-basis").some((cell) => /^Rules: qld\.transfer\./.test(cell.getAttribute("title") ?? "")), "the rule ids stay on hand in the cell's title");
  assert.doesNotMatch(app.flat(), /qld\.transfer\./, "and are not printed in the table");
});

test("profiles tab is read-only for finance and editable for a preparer with fund access", async () => {
  const finance = await mountApp({ hash: "#/property-taxes?fund=telok-ayer&tab=profiles", user: "m-castillo", now: "2026-10-12T09:00:00" });
  assert.match(finance.flat(), /View only for your role/);
  assert.equal(finance.queryByRole("button", "Edit profile"), null);
  await finance.unmount();

  const preparer = await mountApp({ hash: "#/property-taxes?fund=telok-ayer&tab=profiles", user: "w-l-teo", now: "2026-10-12T09:00:00" });
  await preparer.click(preparer.allByRole("button", "Edit profile")[0]!);
  assert.match(preparer.flat(), /Property tax profile — Telok Ayer Tower/);
  assert.equal(preparer.byLabel("Annual value").getAttribute("aria-disabled"), null);
});

test("property taxes actions differ by persona and payment dialog is reachable", async () => {
  const head = await mountApp({ hash: "#/property-taxes?fund=wattle&tab=annual", user: "a-moreno", now: "2026-10-12T09:00:00" });
  assert.match(head.flat(), /Record payment/);
  await head.click(head.byRole("button", "Record payment"));
  assert.match(head.flat(), /Record payment — Wattle Grove Shopping Centre/);
  assert.match(head.flat(), /Reference/);
  await head.unmount();

  const reviewer = await mountApp({ hash: "#/property-taxes?fund=wattle&tab=annual", user: "l-brennan", now: "2026-10-12T09:00:00" });
  assert.equal(reviewer.queryByRole("button", "Record payment"), null);
});
