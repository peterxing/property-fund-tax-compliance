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

test("annual taxes can record an assessment notice from the workspace", async () => {
  const app = await mountApp({ hash: "#/property-taxes?fund=wattle&tab=annual", user: "a-moreno", now: "2026-10-12T09:00:00" });
  await app.click(app.allByRole("button", "Record notice")[0]!);
  assert.match(app.flat(), /Assessment notice — (Lakeside Marketplace|Coral Coast Central)/);
  await app.type(app.byLabel("Assessed amount"), "1234");
  await app.type(app.byLabel("Issue date"), "2026-09-20");
  await app.type(app.byLabel("Due date"), "2026-10-31");
  await app.type(app.byLabel("Reference"), "QRO DOM 2026");
  await app.click(app.allByRole("button", "Record notice").at(-1)!);
  assert.match(app.flat(), /Assessed A\$1,234/);
  assert.match(app.flat(), /31 Oct 2026/);
  assert.match(app.flat(), /Assessment checks/);
});

test("buttons follow the ptax reducers: role and fund access decide, workflow status does not", async () => {
  // Harbourline is signed off. Property-tax profiles sit outside the distribution sign-off, so its preparer can still edit them.
  const preparer = await mountApp({ hash: "#/property-taxes?fund=harbourline&tab=profiles", user: "r-okafor", now: "2026-10-12T09:00:00" });
  assert.doesNotMatch(preparer.flat(), /Signed off — reopen to edit/);
  assert.doesNotMatch(preparer.flat(), /View only for your role/);
  const before = preparer.store.getState().data;
  const target = before.propertyProfiles.find((profile) => profile.fundId === "harbourline")!;
  const name = before.properties.find((property) => property.id === target.propertyId)!.name;
  const rowButton = preparer.allByRole("button", "Edit profile")[before.propertyProfiles.filter((profile) => profile.fundId === "harbourline").indexOf(target)]!;
  await preparer.click(rowButton);
  assert.match(preparer.flat(), new RegExp(`Property tax profile — ${name}`));
  await preparer.select(preparer.byLabel("Residential land"), target.auResidential ? "No" : "Yes");
  const after = preparer.store.getState().data;
  assert.equal(after.propertyProfiles.find((profile) => profile.propertyId === target.propertyId)!.auResidential, !target.auResidential, "the reducer accepted the edit");
  assert.equal(after.audit.length, before.audit.length + 1, "and audited it");
  assert.equal(after.audit.at(-1)!.action, "Property tax profile updated");
  await preparer.unmount();

  // The reviewer has the fund but neither edit nor lodge, so every property-tax button stays hidden (the reducers would refuse too).
  const reviewer = await mountApp({ hash: "#/property-taxes?fund=harbourline&tab=profiles", user: "l-brennan", now: "2026-10-12T09:00:00" });
  assert.match(reviewer.flat(), /View only for your role/);
  assert.equal(reviewer.queryByRole("button", "Edit profile"), null);
  await reviewer.click(reviewer.byRole("tab", "Annual taxes"));
  assert.equal(reviewer.allByRole("button", /^(Record|Update) notice$/).length, 0);
  assert.equal(reviewer.allByRole("button", "Record payment").length, 0);
  await reviewer.unmount();

  // Southbank is in review and its tax agent lodges: the agent can record notices (as the reducer allows) but cannot edit profiles.
  const agent = await mountApp({ hash: "#/property-taxes?fund=southbank&tab=annual", user: "d-harrow", now: "2026-10-12T09:00:00" });
  assert.ok(agent.allByRole("button", /^(Record|Update) notice$/).length > 0, "a lodging tax agent can record assessment notices");
  await agent.click(agent.byRole("tab", "Profiles"));
  assert.equal(agent.queryByRole("button", "Edit profile"), null);
  assert.match(agent.flat(), /View only for your role/);
});
