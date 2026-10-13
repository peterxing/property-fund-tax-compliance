// Flow 1: Coastline (Australia, "No tax agent") from the first edit to lodgment, and back again.
// R. Okafor prepares, L. Brennan reviews, A. Moreno signs off and lodges; every step is checked on the page (visible text) and in the store.
// Run with the esbuild loader like the other UI tests:
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test test/ui/flows/coastline-lifecycle.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { workflowView } from "../../../src/domain/index.ts";
import { expectedSteps } from "../oracle.ts";
import { clock, mountApp, type MountedApp } from "../harness.tsx";
import { announced, railState } from "../shell.ts";
import { expectNone } from "../same.ts";
import { expectAuditsClean } from "../expect.ts";
import {
  NOW_AUDIT_TIME,
  NOW_LOCAL,
  asUser,
  auFundOf,
  auditRows,
  bulkRow,
  checkRows,
  dataOf,
  distributionTable,
  enter,
  fundOf,
  hasControl,
  header,
  offered,
  openTab,
  pressHeader,
  recordedSince,
  rowStarting,
  tableRows,
} from "./support.ts";

const FUND = "coastline";
const NAME = "Coastline Healthcare Property Fund";
const now = () => new Date(clock.now.getTime());

/** The Coastline entry of the fund rail: its status chip and exception count. */
const railItem = (app: MountedApp): { status: string; exceptions: string } => {
  const items = (railState(app)?.groups ?? []).flatMap((group) => group.items).filter((item) => item.href.includes(`fund=${FUND}`));
  assert.equal(items.length, 1, "the rail lists the fund once");
  return { status: items[0]!.status, exceptions: items[0]!.exceptions };
};

async function goTo(app: MountedApp, workspace: "" | "trial-balance" | "tax-returns" | "investor-reporting" | "cost-base", params = ""): Promise<void> {
  await app.navigate(`#/${workspace}?fund=${FUND}${params}`);
}

describe("Coastline from the first edit to lodgment (no tax agent)", () => {
  it("takes the distribution through preparation, review, sign-off and lodgment, and back through reopening and a reload", async () => {
    const app = await mountApp({ user: "r-okafor", hash: `#/?fund=${FUND}` });
    const seed = dataOf(app);
    assert.equal(header(app).status, "Preparing");
    assert.equal(header(app).governance, "No tax agent");
    assert.deepEqual(offered(app), ["Submit for review"]);
    assert.deepEqual(header(app).steps, ["Reviewer pending", "Sign-off pending · Head of Tax"]);

    // ------------------------------------------------------------------------------------------------ 1. an edit shows up everywhere
    assert.equal(hasControl(app, "Australian interest"), true);
    assert.deepEqual(rowStarting(distributionTable(app), "Australian interest").slice(1, 3), ["A$212,300", "0.0666"]);
    await enter(app, "Australian interest", "250,000");
    assert.equal(announced(app), "Saved: Australian interest");
    assert.equal(auFundOf(app, FUND).inputs.interest, 25_000_000);
    assert.deepEqual(recordedSince(seed, dataOf(app)), [
      { fundId: FUND, at: NOW_LOCAL, actor: "R. Okafor", action: "Australian interest updated", detail: "A$212,300 → A$250,000" },
    ]);
    assert.equal(rowStarting(distributionTable(app), "Australian interest")[1], "A$250,000");
    // The balancing line takes up the difference: 21,048,000 less 16,970,450, 250,000 and 1,104,800.
    assert.equal(rowStarting(distributionTable(app), "Other non-attributable amounts")[1], "A$2,722,750");
    // Withholding: 3.75% of the 16,970,450 fund payment (636,392) plus 10% of 250,000 for the 20% of units held offshore (5,000).
    assert.match(app.text(), /Withholding computed\s*A\$641,392/);

    await openTab(app, /^Audit trail/);
    assert.deepEqual(auditRows(app)[0], { at: NOW_AUDIT_TIME, action: "Australian interest updated", actor: "R. Okafor", detail: "A$212,300 → A$250,000" });
    assert.equal(auditRows(app)[1]?.action, "Trust components loaded");

    await goTo(app, "trial-balance");
    assert.deepEqual(rowStarting(app.byRole("table", /^Components from the trial balance/), "Australian interest"), ["Australian interest", "A$212,300", "A$250,000", "Differs by A$37,700"]);
    assert.match(app.text(), /Differs from the distribution/);
    await app.navigate("#/analytics");
    assert.deepEqual(rowStarting(app.byRole("table", "Tax leakage by fund"), NAME), [NAME, "A$21,048,000", "A$641,392", "A$0", "A$0", "3.0%"]);
    await app.navigate("#/bulk-review");
    assert.deepEqual(
      { ...bulkRow(app, NAME), checkbox: undefined },
      { status: "Preparing", approvals: "Reviewer pending", exceptions: "1 exception", queries: "0", next: "Submit", checkbox: undefined },
    );

    // ------------------------------------------------------------------------------------------------ 2. a withholding variance is a new exception
    await goTo(app, "");
    assert.deepEqual(railItem(app), { status: "Preparing", exceptions: "1 exception" });
    await enter(app, "Withholding remitted", "600,000");
    assert.deepEqual(railItem(app), { status: "Preparing", exceptions: "2 exceptions" });
    assert.equal(fundOf(app, FUND).whtRemitted, 60_000_000);
    assert.match(app.text(), /Variance A\$41,391\.88 under-remitted/);
    assert.equal(app.byRole("tab", /^Checks/).textContent?.replace(/\s+/g, " ").trim(), "Checks 2 exceptions");
    await openTab(app, /^Checks/);
    assert.deepEqual(
      checkRows(app).filter((check) => check.tag === "Exception").map((check) => check.title),
      ["Withholding reconciliation variance", "1 trial balance account without a tax category"],
    );
    assert.equal(checkRows(app)[0]!.detail, "Computed A$641,392 against A$600,000 remitted — under-remitted by A$41,392.");
    await app.navigate("#/bulk-review");
    assert.equal(bulkRow(app, NAME).exceptions, "2 exceptions");

    // ------------------------------------------------------------------------------------------------ 3. map the account, update the distribution
    await goTo(app, "trial-balance");
    const before = dataOf(app);
    await app.select(app.byLabel(/^Tax category for 4510 /), "Rental and property income");
    assert.equal(dataOf(app).tbRows.find((row) => row.account === "4510" && row.fundId === FUND)?.category, "rent");
    assert.deepEqual(recordedSince(before, dataOf(app)), [
      {
        fundId: FUND,
        at: NOW_LOCAL,
        actor: "R. Okafor",
        action: "Account 4510 mapped",
        detail: "Make-good income received: Needs a tax category → Rental and property income",
      },
    ]);
    assert.match(announced(app), /4510 Make-good income received: tax category set to Rental and property income\./);
    const components = (): string[][] => tableRows(app.byRole("table", /^Components from the trial balance/));
    assert.deepEqual(components(), [
      ["Australian income — other", "A$17,156,880", "A$16,970,450", "Differs by A$186,430"],
      ["Australian interest", "A$212,300", "A$250,000", "Differs by A$37,700"],
      ["Assessable foreign income", "A$1,104,800", "A$1,104,800", "Agrees"],
    ]);
    await app.click(app.byRole("button", "Update distribution"));
    assert.deepEqual(components(), [
      ["Australian income — other", "A$17,156,880", "A$17,156,880", "Agrees"],
      ["Australian interest", "A$212,300", "A$212,300", "Agrees"],
      ["Assessable foreign income", "A$1,104,800", "A$1,104,800", "Agrees"],
    ]);
    assert.equal(announced(app), `${NAME}: distribution components updated from the trial balance.`);
    assert.equal(auFundOf(app, FUND).inputs.interest, 21_230_000);
    assert.equal(auFundOf(app, FUND).inputs.ausOtherIncome, 1_715_688_000);
    await goTo(app, "");
    assert.equal(rowStarting(distributionTable(app), "Australian income — other")[1], "A$17,156,880");
    assert.equal(rowStarting(distributionTable(app), "Other non-attributable amounts")[1], "A$2,574,020");
    // The computed withholding moved, so the remitted amount no longer reconciles; the unmapped account is no longer an exception.
    await openTab(app, /^Checks/);
    assert.deepEqual(
      checkRows(app).filter((check) => check.tag === "Exception").map((check) => check.title),
      ["Withholding reconciliation variance"],
    );
    await openTab(app, /^Withholding/);
    const computed = /Computed withholding\s*A\$([\d,]+\.\d\d)/.exec(app.text())?.[1];
    assert.ok(computed, "the computed withholding is shown");
    const computedCents = Math.round(Number(computed.replaceAll(",", "")) * 100);
    // 3.75% of the 17,156,880 fund payment plus 10% of 20% of the 212,300 interest.
    assert.ok(Math.abs(computedCents - 64_762_900) <= 100, `computed withholding ${computed}`);
    await enter(app, "Withholding remitted", computed);
    assert.equal(fundOf(app, FUND).whtRemitted, computedCents);
    assert.match(app.text(), /Result\s*Reconciled/);
    assert.equal(header(app).queries, null);
    assert.equal(app.byRole("tab", /^Checks/).textContent?.replace(/\s+/g, " ").trim(), "Checks 2 notes");
    await openTab(app, /^Checks/);
    assert.deepEqual(
      checkRows(app).map((check) => [check.tag, check.title]),
      [
        ["Note", "30% fund payment rate for 1 holder"],
        ["Note", "Fund payment notice due by 13 Nov 2026"],
      ],
    );
    assert.deepEqual(railItem(app), { status: "Preparing", exceptions: "No exceptions" });
    // ------------------------------------------------------------------------------------------------ 4. submit; the preparer cannot approve
    assert.equal(await pressHeader(app, "Submit for review"), `${NAME} submitted for review.`);
    assert.equal(fundOf(app, FUND).status, "In review");
    assert.equal(header(app).status, "In review");
    assert.deepEqual(offered(app), []);
    assert.match(app.text(), /In review — return to preparer to edit/);
    assert.equal(hasControl(app, "Australian interest"), false, "no input boxes while in review");
    const refused = app.store.dispatch({ type: "approve", fundId: FUND, level: "review" });
    assert.deepEqual(refused, { ok: false, reason: "You don't have permission to approve as reviewer" });
    assert.equal(dataOf(app).approvals.some((approval) => approval.fundId === FUND), false);

    // ------------------------------------------------------------------------------------------------ 5. the reviewer approves
    await asUser(app, "l-brennan");
    assert.deepEqual(offered(app), ["Return to preparer", "Approve as reviewer"]);
    assert.equal(await pressHeader(app, "Approve as reviewer"), `${NAME} approved as reviewer.`);
    assert.deepEqual(dataOf(app).approvals.filter((approval) => approval.fundId === FUND), [{ fundId: FUND, level: "review", by: "L. Brennan", at: NOW_LOCAL }]);
    assert.deepEqual(header(app).steps, ["Reviewer done, L. Brennan, 12 Oct 2026", "Sign-off pending · Head of Tax"]);
    assert.equal(offered(app).includes("Approve as reviewer"), false, "approving twice is not offered");

    // ------------------------------------------------------------------------------------------------ 6. the Head of Tax signs off
    await asUser(app, "a-moreno");
    assert.deepEqual(offered(app), ["Return to preparer", "Sign off"]);
    assert.equal(await pressHeader(app, "Sign off"), `${NAME} signed off.`);
    assert.equal(fundOf(app, FUND).status, "Signed off");
    assert.deepEqual(header(app).steps, ["Reviewer done, L. Brennan, 12 Oct 2026", "Sign-off done, A. Moreno, 12 Oct 2026"]);
    assert.deepEqual(offered(app), ["Reopen"]);
    assert.deepEqual(
      header(app).steps,
      expectedSteps(workflowView(dataOf(app), FUND, { user: dataOf(app).users.find((u) => u.id === "a-moreno")!, now: now() })),
    );

    // The lock shows on every workspace of the fund.
    await goTo(app, "");
    assert.match(app.text(), /Signed off — reopen to edit/);
    assert.equal(hasControl(app, "Australian interest"), false, "the distribution inputs are gone");
    await goTo(app, "trial-balance");
    assert.equal(app.$(".tb-lock").textContent?.trim(), "Signed off — reopen to edit");
    expectNone(app.maybe("table select"), "no category boxes");
    await goTo(app, "tax-returns");
    assert.match(app.text(), /Distribution signed off\s*Components and withholding are locked\s*Done/);
    await goTo(app, "investor-reporting");
    assert.equal(header(app).status, "Signed off");
    assert.match(app.text(), /The AIIR mirrors the locked AMMA statements/);
    await goTo(app, "cost-base");
    assert.equal(header(app).status, "Signed off");
    expectAuditsClean(app, "Cost base of a signed-off fund");
    await app.navigate("#/bulk-review");
    assert.deepEqual(
      { ...bulkRow(app, NAME), checkbox: undefined },
      { status: "Signed off", approvals: "Reviewer done", exceptions: "No exceptions", queries: "0", next: "already signed off", checkbox: undefined },
    );
    await app.navigate("#/analytics");
    assert.deepEqual(rowStarting(app.byRole("table", "Tax leakage by fund"), NAME).slice(0, 2), [NAME, "A$21,048,000"]);

    // ------------------------------------------------------------------------------------------------ 7. lodgment on Tax returns
    await goTo(app, "tax-returns");
    const preLodgment = dataOf(app);
    await app.type(app.byLabel(/^ATO receipt reference$/), "Receipt 418806117352");
    await app.click(app.byRole("button", "Record lodgment"));
    assert.deepEqual(dataOf(app).lodgments.filter((record) => record.fundId === FUND), [
      { fundId: FUND, kind: "return", reference: "Receipt 418806117352", date: "2026-10-12", actor: "A. Moreno" },
    ]);
    assert.deepEqual(recordedSince(preLodgment, dataOf(app)).map((entry) => [entry.actor, entry.action, entry.detail]), [
      ["A. Moreno", "Tax return lodged with the ATO", "Reference Receipt 418806117352, 2026-10-12"],
    ]);
    assert.match(app.text(), /12 Oct 2026 · Receipt 418806117352/);
    assert.match(app.text(), /Recorded by A\. Moreno/);

    // ------------------------------------------------------------------------------------------------ 8. a reload restores everything
    const storage = app.storage;
    const persisted = dataOf(app);
    await app.unmount();
    const reloaded = await mountApp({ storage, hash: `#/tax-returns?fund=${FUND}` });
    assert.deepEqual(dataOf(reloaded), persisted);
    assert.equal(reloaded.ui().currentUserId, "a-moreno");
    assert.equal(header(reloaded).status, "Signed off");
    assert.match(reloaded.text(), /12 Oct 2026 · Receipt 418806117352/);
    await goTo(reloaded, "");
    await openTab(reloaded, /^Audit trail/);
    assert.deepEqual(
      auditRows(reloaded).slice(0, 5).map((row) => `${row.action} · ${row.actor}`),
      ["Tax return lodged with the ATO · A. Moreno", "Signed off · A. Moreno", "Approved — reviewer · L. Brennan", "Submitted for review · R. Okafor", "Withholding remitted updated · R. Okafor"],
    );

    // ------------------------------------------------------------------------------------------------ 9. reopen: unlocked, approvals cleared
    assert.equal(await pressHeader(reloaded, "Reopen"), `${NAME} reopened for editing.`);
    assert.equal(fundOf(reloaded, FUND).status, "Preparing");
    assert.deepEqual(dataOf(reloaded).approvals.filter((approval) => approval.fundId === FUND), []);
    assert.deepEqual(header(reloaded).steps, ["Reviewer pending", "Sign-off pending · Head of Tax"]);
    assert.deepEqual(offered(reloaded), ["Submit for review"]);
    await openTab(reloaded, /^Withholding/);
    assert.equal((reloaded.byLabel("Australian interest") as HTMLInputElement).value, "212,300");
    await goTo(reloaded, "trial-balance");
    assert.equal(reloaded.queryByRole("button", "Update distribution")?.getAttribute("aria-disabled"), "true");
    await asUser(reloaded, "r-okafor");
    await goTo(reloaded, "trial-balance");
    expectNone(reloaded.maybe(".tb-lock"), "the preparer can edit again");
    assert.equal(reloaded.$$("table select").length > 0, true);

    // And once more after a reload.
    const reopened = dataOf(reloaded);
    await reloaded.unmount();
    const again = await mountApp({ storage: reloaded.storage, hash: `#/?fund=${FUND}` });
    assert.deepEqual(dataOf(again), reopened);
    assert.equal(again.ui().currentUserId, "r-okafor");
    assert.equal(header(again).status, "Preparing");
    assert.deepEqual(offered(again), ["Submit for review"]);
  });

  it("does not let the person who submitted a fund approve it (the Head of Tax submits, the reviewer approves, the Head of Tax signs off)", async () => {
    const app = await mountApp({ user: "a-moreno", hash: `#/?fund=${FUND}` });
    assert.deepEqual(offered(app), ["Submit for review"]);
    assert.equal(await pressHeader(app, "Submit for review"), `${NAME} submitted for review.`);
    assert.deepEqual(dataOf(app).audit.filter((entry) => entry.fundId === FUND).at(-1), {
      ...dataOf(app).audit.filter((entry) => entry.fundId === FUND).at(-1)!,
      actor: "A. Moreno",
      action: "Submitted for review",
    });

    // He holds the reviewer role, but he submitted this fund: the button says why and the store refuses.
    const approve = header(app).actions.find((action) => action.label === "Approve as reviewer");
    assert.ok(approve, "Approve as reviewer is listed");
    assert.equal(approve.disabled, true);
    assert.equal(approve.reason, "You submitted this fund");
    assert.deepEqual(app.store.dispatch({ type: "approve", fundId: FUND, level: "review" }), { ok: false, reason: "You can't approve a fund you submitted" });
    const signOff = header(app).actions.find((action) => action.label === "Sign off");
    assert.equal(signOff?.disabled, true);
    assert.equal(signOff?.reason, "Sign-off waits for: Reviewer approval.");
    assert.deepEqual(dataOf(app).approvals.filter((approval) => approval.fundId === FUND), []);

    // Someone else approves; then the Head of Tax can sign off.
    await asUser(app, "l-brennan");
    assert.equal(await pressHeader(app, "Approve as reviewer"), `${NAME} approved as reviewer.`);
    await asUser(app, "a-moreno");
    assert.equal(header(app).actions.find((action) => action.label === "Sign off")?.disabled, false);
    assert.equal(await pressHeader(app, "Sign off"), `${NAME} signed off.`);
    assert.equal(fundOf(app, FUND).status, "Signed off");
  });
});
