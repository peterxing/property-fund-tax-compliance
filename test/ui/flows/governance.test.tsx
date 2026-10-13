// Flow 2: governance with a tax agent. Southbank (the agent reviews and lodges) and Harbourline (the agent signs off, the Head of Tax lodges):
// who can approve, who can record lodgment, and a governance change on the Access page showing up in the fund header.
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test test/ui/flows/governance.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mountApp, type MountedApp } from "../harness.tsx";
import { allByLabel } from "../dom.ts";
import { expectNone } from "../same.ts";
import { announced } from "../shell.ts";
import {
  NOW_LOCAL,
  asUser,
  auditRows,
  dataOf,
  expectHeader,
  fundOf,
  hasControl,
  header,
  offered,
  openTab,
  pressHeader,
  recordedSince,
  remitComputed,
} from "./support.ts";

const REFERENCE = "Receipt 418806117352";
const lodgmentsOf = (app: MountedApp, fundId: string) => dataOf(app).lodgments.filter((record) => record.fundId === fundId);
const approvalsOf = (app: MountedApp, fundId: string) => dataOf(app).approvals.filter((approval) => approval.fundId === fundId).map((approval) => `${approval.level}:${approval.by}`);

/** Records the tax return lodgment through the form on the Tax returns workspace. */
async function lodgeReturn(app: MountedApp, reference: string): Promise<void> {
  await app.type(app.byLabel(/^ATO receipt reference$/), reference);
  await app.click(app.byRole("button", "Record lodgment"));
}

describe("Southbank: the tax agent reviews and lodges", () => {
  it("goes reviewer -> tax agent -> sign-off, and then only D. Harrow can record lodgment", async () => {
    const NAME = "Southbank Industrial Partners Fund";
    const app = await mountApp({ user: "a-moreno", hash: "#/?fund=southbank" });
    assert.equal(header(app).governance, "Tax agent reviews and lodges");
    assert.equal(header(app).status, "In review");
    assert.deepEqual(header(app).steps, ["Reviewer pending", "Tax agent pending", "Sign-off pending · Head of Tax"]);
    assert.deepEqual(offered(app), ["Return to preparer", "Approve as reviewer", "Sign off (unavailable: Sign-off waits for: Reviewer and Tax agent approval.)"]);
    expectHeader(app, "southbank", "seed, A. Moreno");

    // The fund goes back to the preparer, who clears the withholding variance and sends it on again.
    assert.equal(await pressHeader(app, "Return to preparer"), `${NAME} returned to the preparer.`);
    assert.equal(fundOf(app, "southbank").status, "Preparing");
    await asUser(app, "r-okafor");
    assert.deepEqual(offered(app), ["Submit for review"]);
    await openTab(app, /^Checks/);
    assert.match(app.byRole("tab", /^Checks/).textContent ?? "", /2 exceptions/);
    await remitComputed(app);
    assert.match(app.byRole("tab", /^Checks/).textContent ?? "", /1 exception\b/, "only the overdue AMMA statements are left");
    assert.equal(await pressHeader(app, "Submit for review"), `${NAME} submitted for review.`);

    // The reviewer approves; the tax agent is next, and nobody else can sign off before that.
    await asUser(app, "l-brennan");
    assert.equal(await pressHeader(app, "Approve as reviewer"), `${NAME} approved as reviewer.`);
    assert.deepEqual(header(app).steps, ["Reviewer done, L. Brennan, 12 Oct 2026", "Tax agent pending", "Sign-off pending · Head of Tax"]);
    expectHeader(app, "southbank", "after the reviewer, L. Brennan");
    await asUser(app, "a-moreno");
    assert.deepEqual(offered(app), ["Return to preparer", "Sign off (unavailable: Sign-off waits for: Tax agent approval.)"]);

    await asUser(app, "d-harrow");
    assert.deepEqual(offered(app), ["Approve as tax agent"]);
    expectHeader(app, "southbank", "before the tax agent, D. Harrow");
    assert.equal(await pressHeader(app, "Approve as tax agent"), `${NAME} approved as tax agent.`);
    assert.deepEqual(approvalsOf(app, "southbank"), ["review:L. Brennan", "agent:D. Harrow"]);
    assert.deepEqual(header(app).steps, ["Reviewer done, L. Brennan, 12 Oct 2026", "Tax agent done, D. Harrow, 12 Oct 2026", "Sign-off pending · Head of Tax"]);
    assert.deepEqual(offered(app), [], "a tax agent cannot sign off");
    assert.deepEqual(app.store.dispatch({ type: "sign-off", fundId: "southbank" }), { ok: false, reason: "You don't have permission to sign off" });

    // Only the Head of Tax signs off.
    await asUser(app, "a-moreno");
    assert.equal(await pressHeader(app, "Sign off"), `${NAME} signed off.`);
    assert.equal(fundOf(app, "southbank").status, "Signed off");
    assert.deepEqual(offered(app), ["Reopen"]);
    expectHeader(app, "southbank", "signed off");

    // The return is lodged by the tax agent: everyone else sees who does it, and the store refuses them.
    await app.navigate("#/tax-returns?fund=southbank");
    for (const persona of ["a-moreno", "l-brennan", "r-okafor"]) {
      await asUser(app, persona);
      assert.match(app.text(), /Recorded by the tax agent under this fund's governance \(tax agent reviews and lodges\)\./, persona);
      assert.equal(hasControl(app, /^ATO receipt reference$/), false, `${persona} has no lodgment form`);
      assert.deepEqual(app.store.dispatch({ type: "record-lodgment", fundId: "southbank", kind: "return", reference: REFERENCE, date: "2026-10-12" }), {
        ok: false,
        reason: "Only the tax agent records lodgment for this fund",
      });
    }
    assert.deepEqual(lodgmentsOf(app, "southbank"), []);

    await asUser(app, "d-harrow");
    assert.equal(hasControl(app, /^ATO receipt reference$/), true);
    const before = dataOf(app);
    await lodgeReturn(app, REFERENCE);
    assert.deepEqual(lodgmentsOf(app, "southbank"), [{ fundId: "southbank", kind: "return", reference: REFERENCE, date: "2026-10-12", actor: "D. Harrow" }]);
    assert.deepEqual(recordedSince(before, dataOf(app)), [
      { fundId: "southbank", at: NOW_LOCAL, actor: "D. Harrow", action: "Tax return lodged with the ATO", detail: `Reference ${REFERENCE}, 2026-10-12` },
    ]);
    assert.match(app.text(), /12 Oct 2026 · Receipt 418806117352/);
    assert.match(app.text(), /Recorded by D\. Harrow/);

    // The Head of Tax sees the record but cannot replace it.
    await asUser(app, "a-moreno");
    assert.match(app.text(), /Recorded by D\. Harrow/);
    expectNone(app.queryByRole("button", "Replace record"), "the record cannot be replaced");
    await app.navigate("#/?fund=southbank");
    await openTab(app, /^Audit trail/);
    assert.deepEqual(
      auditRows(app)
        .slice(0, 6)
        .map((row) => `${row.action} · ${row.actor}`),
      [
        "Tax return lodged with the ATO · D. Harrow",
        "Signed off · A. Moreno",
        "Approved — tax agent · D. Harrow",
        "Approved — reviewer · L. Brennan",
        "Submitted for review · R. Okafor",
        "Withholding remitted updated · R. Okafor",
      ],
    );

    // The AIIR follows the same rule on Investor reporting.
    const AIIR = "AIIR-2026-0007";
    await app.navigate("#/investor-reporting?fund=southbank");
    assert.match(app.text(), /Recorded by the tax agent under this fund's governance \(tax agent reviews and lodges\)\./);
    assert.equal(hasControl(app, /^ATO receipt reference$/), false);
    assert.deepEqual(app.store.dispatch({ type: "record-lodgment", fundId: "southbank", kind: "aiir", reference: AIIR, date: "2026-10-12" }), {
      ok: false,
      reason: "Only the tax agent records lodgment for this fund",
    });
    await asUser(app, "d-harrow");
    const beforeAiir = dataOf(app);
    await lodgeReturn(app, AIIR);
    assert.deepEqual(
      lodgmentsOf(app, "southbank").map((record) => [record.kind, record.reference, record.actor]),
      [
        ["return", REFERENCE, "D. Harrow"],
        ["aiir", AIIR, "D. Harrow"],
      ],
    );
    assert.deepEqual(
      recordedSince(beforeAiir, dataOf(app)).map((entry) => [entry.actor, entry.action, entry.detail]),
      [["D. Harrow", "AIIR lodged with the ATO", `Reference ${AIIR}, 2026-10-12`]],
    );
    assert.match(app.text(), /Status: Lodged/);
    assert.match(app.text(), /12 Oct 2026 · AIIR-2026-0007/);
  });
});

describe("Harbourline: the tax agent signs off, the Head of Tax lodges", () => {
  it("lets A. Moreno record lodgment and refuses D. Harrow, who is the tax agent", async () => {
    const app = await mountApp({ user: "d-harrow", hash: "#/tax-returns?fund=harbourline" });
    assert.equal(header(app).governance, "Tax agent signs off; you lodge");
    assert.equal(header(app).status, "Signed off");
    expectHeader(app, "harbourline", "seed, D. Harrow");
    const seededLodgments = lodgmentsOf(app, "harbourline");
    assert.match(app.text(), /Recorded by the head of tax under this fund's governance \(tax agent signs off; head of tax lodges\)\./);
    assert.equal(hasControl(app, /^ATO receipt reference$/), false);
    assert.deepEqual(app.store.dispatch({ type: "record-lodgment", fundId: "harbourline", kind: "return", reference: REFERENCE, date: "2026-10-12" }), {
      ok: false,
      reason: "Only the head of tax records lodgment for this fund",
    });
    assert.deepEqual(lodgmentsOf(app, "harbourline"), seededLodgments);

    await asUser(app, "a-moreno");
    assert.equal(hasControl(app, /^ATO receipt reference$/), true);
    await lodgeReturn(app, REFERENCE);
    assert.deepEqual(
      lodgmentsOf(app, "harbourline").filter((record) => record.kind === "return"),
      [{ fundId: "harbourline", kind: "return", reference: REFERENCE, date: "2026-10-12", actor: "A. Moreno" }],
    );
    assert.match(app.text(), /Recorded by A\. Moreno/);

    // The agent's approval stays on the page and the agent still cannot replace the record.
    await asUser(app, "d-harrow");
    assert.match(app.text(), /Recorded by A\. Moreno/);
    expectNone(app.queryByRole("button", "Replace record"), "the record cannot be replaced");
    assert.deepEqual(app.store.dispatch({ type: "record-lodgment", fundId: "harbourline", kind: "return", reference: "Receipt 000000000001", date: "2026-10-12" }), {
      ok: false,
      reason: "Only the head of tax records lodgment for this fund",
    });
  });
});

describe("the Access page changes how a fund is governed, and the fund header follows", () => {
  it("clears the approval the new governance no longer asks for, and puts it back as pending when it comes back", async () => {
    const app = await mountApp({ user: "l-brennan", hash: "#/?fund=southbank" });
    assert.equal(await pressHeader(app, "Approve as reviewer"), "Southbank Industrial Partners Fund approved as reviewer.");
    await asUser(app, "d-harrow");
    assert.equal(await pressHeader(app, "Approve as tax agent"), "Southbank Industrial Partners Fund approved as tax agent.");
    assert.deepEqual(approvalsOf(app, "southbank"), ["review:L. Brennan", "agent:D. Harrow"]);

    await asUser(app, "a-moreno");
    await app.navigate("#/access");
    const select = (): HTMLElement => app.byLabel("Governance for Southbank Industrial Partners Fund");
    assert.equal((select() as HTMLSelectElement).value, "agent-lodges");
    const before = dataOf(app);
    await app.select(select(), "No tax agent");
    assert.equal(announced(app), "Governance for Southbank Industrial Partners Fund changed to No tax agent.");
    assert.equal(fundOf(app, "southbank").governance, "no-agent");
    assert.deepEqual(approvalsOf(app, "southbank"), ["review:L. Brennan"], "the tax agent's approval no longer counts");
    assert.deepEqual(recordedSince(before, dataOf(app)), [
      { fundId: "southbank", at: NOW_LOCAL, actor: "A. Moreno", action: "Governance changed", detail: "Tax agent reviews and lodges → No tax agent" },
    ]);

    // The fund header now shows the shorter chain and the buttons that go with it.
    await app.navigate("#/?fund=southbank");
    assert.equal(header(app).governance, "No tax agent");
    assert.deepEqual(header(app).steps, ["Reviewer done, L. Brennan, 12 Oct 2026", "Sign-off pending · Head of Tax"]);
    assert.deepEqual(offered(app), ["Return to preparer", "Sign off"]);
    expectHeader(app, "southbank", "no tax agent, A. Moreno");
    await asUser(app, "d-harrow");
    assert.deepEqual(offered(app), ["Approve as tax agent (unavailable: This fund has no tax agent approval step)"]);
    expectHeader(app, "southbank", "no tax agent, D. Harrow");
    assert.deepEqual(app.store.dispatch({ type: "approve", fundId: "southbank", level: "agent" }), { ok: false, reason: "This fund has no tax agent approval step" });

    // And back: the agent has to approve again, and the Access page lists who lodges.
    await asUser(app, "a-moreno");
    await app.navigate("#/access");
    await app.select(select(), "Tax agent signs off; you lodge");
    assert.equal(announced(app), "Governance for Southbank Industrial Partners Fund changed to Tax agent signs off; you lodge.");
    const row = select().closest("tr")!;
    assert.match(row.textContent ?? "", /Reviewer, Tax agent\s*Head of Tax$/);
    await app.navigate("#/?fund=southbank");
    assert.deepEqual(header(app).steps, ["Reviewer done, L. Brennan, 12 Oct 2026", "Tax agent pending", "Sign-off pending · Head of Tax"]);
    await asUser(app, "d-harrow");
    assert.deepEqual(offered(app), ["Approve as tax agent"]);
    expectHeader(app, "southbank", "agent signs off, D. Harrow");
  });

  it("locks the governance of a signed-off fund until it is reopened, and only the Head of Tax can change it", async () => {
    const app = await mountApp({ user: "a-moreno", hash: "#/access" });
    const select = (): HTMLSelectElement => app.byLabel("Governance for Harbourline Office Trust") as HTMLSelectElement;
    assert.equal(hasControl(app, "Governance for Harbourline Office Trust"), false, "a signed-off fund has no governance select");
    assert.match(app.text(), /Locked while signed off\. Reopen the fund to change its governance\./);
    assert.deepEqual(app.store.dispatch({ type: "set-governance", fundId: "harbourline", mode: "no-agent" }), {
      ok: false,
      reason: "This fund is signed off. Reopen it before changing its governance.",
    });
    assert.equal(fundOf(app, "harbourline").governance, "agent-signs-off");

    await app.navigate("#/?fund=harbourline");
    assert.equal(await pressHeader(app, "Reopen"), "Harbourline Office Trust reopened for editing.");
    assert.deepEqual(approvalsOf(app, "harbourline"), []);
    await app.navigate("#/access");
    assert.equal(select().value, "agent-signs-off");
    await app.select(select(), "No tax agent");
    await app.navigate("#/?fund=harbourline");
    assert.equal(header(app).governance, "No tax agent");
    assert.deepEqual(header(app).steps, ["Reviewer pending", "Sign-off pending · Head of Tax"]);
    expectHeader(app, "harbourline", "reopened with no tax agent");

    // A reviewer can see the page but not change it.
    await asUser(app, "l-brennan");
    await app.navigate("#/access");
    const selects = allByLabel(app.container, /^Governance for /) as HTMLSelectElement[];
    assert.equal(selects.length, 7, "the seven funds that are not signed off (Harbourline was reopened) still list their governance");
    assert.ok(
      selects.every((box) => box.disabled),
      "every governance select is switched off",
    );
    assert.match(app.text(), /This page is read-only for you\./);
    assert.deepEqual(app.store.dispatch({ type: "set-governance", fundId: "harbourline", mode: "agent-lodges" }), {
      ok: false,
      reason: "You don't have permission to change governance",
    });
    assert.equal(fundOf(app, "harbourline").governance, "no-agent");
  });
});
