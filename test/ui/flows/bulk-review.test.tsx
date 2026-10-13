// Flow 4: Bulk review. A. Moreno ticks every fund and submits; the reviewers and the tax agent approve in bulk; A. Moreno signs off in bulk.
// Every run tells which funds took the step and which were skipped, and why.
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test test/ui/flows/bulk-review.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mountApp, type MountedApp } from "../harness.tsx";
import {
  NOW_LOCAL,
  asUser,
  bulkButtons,
  bulkReport,
  bulkSummary,
  bulkTable,
  dataOf,
  fundOf,
  raiseQuery,
  recordedSince,
  remitComputed,
  runBulk,
  selectAllFunds,
  tickFund,
  type BulkTableRow,
} from "./support.ts";

const HARBOURLINE = "Harbourline Office Trust";
const SOUTHBANK = "Southbank Industrial Partners Fund";
const WATTLE = "Wattle Retail Property Trust";
const KURRAJONG = "Kurrajong Stapled Property Trust";
const COASTLINE = "Coastline Healthcare Property Fund";
const TELOK_AYER = "Telok Ayer Commercial REIT";
const LOYANG = "Loyang Logistics REIT";
const MERANTI = "Meranti Digital Infrastructure REIT";
const KALLANG = "Kallang Riverside Retail REIT";

const NONE_SELECTED = "No funds selected. Tick funds in the table to submit, approve or sign them off.";
const FOOTNOTE =
  "Bulk approval and sign-off skip funds with open exceptions; bulk sign-off also skips funds with open queries or missing approvals. Sign those off from the fund itself.";

const SUBMIT = "Submit selected";
const APPROVE = "Approve selected as reviewer";
const APPROVE_AS_AGENT = "Approve selected as tax agent";
const SIGN_OFF = "Sign off selected";

const openBulk = async (app: MountedApp): Promise<MountedApp> => {
  await app.navigate("#/bulk-review");
  return app;
};
const states = (app: MountedApp): Array<[string, boolean]> => bulkButtons(app).map((button) => [button.label, button.disabled]);
const rowOf = (app: MountedApp, name: string): BulkTableRow => {
  const row = bulkTable(app).find((candidate) => candidate.name === name);
  assert.ok(row, `the table has a row for ${name}`);
  return row;
};
const tickedNames = (app: MountedApp): string[] => bulkTable(app).filter((row) => row.ticked).map((row) => row.name);
const entries = (before: ReturnType<typeof dataOf>, after: ReturnType<typeof dataOf>): string[] =>
  recordedSince(before, after)
    .map((entry) => `${entry.fundId}: ${entry.action} · ${entry.actor}`)
    .sort();
/** The audit trail of a fund, newest first (the store keeps it oldest first). */
const actionsOf = (app: MountedApp, fundId: string): string[] =>
  dataOf(app)
    .audit.filter((entry) => entry.fundId === fundId)
    .map((entry) => `${entry.action} · ${entry.actor}`)
    .reverse();

describe("Bulk review for A. Moreno (Head of Tax): the table, the ticks and the three buttons", () => {
  it("lists the nine funds and enables a button only when a ticked fund can take that step", async () => {
    const app = await mountApp({ user: "a-moreno", hash: "#/bulk-review" });
    const seed = dataOf(app);
    assert.deepEqual(
      bulkTable(app).map((row) => [row.name, row.governance, row.status, row.approvals, row.exceptions, row.queries, row.next, row.ticked]),
      [
        [HARBOURLINE, "Tax agent signs off; you lodge", "Signed off", "Reviewer done · Tax agent done", "No exceptions", "0", "already signed off", false],
        [SOUTHBANK, "Tax agent reviews and lodges", "In review", "Reviewer pending · Tax agent pending", "2 exceptions", "1", "2 open exceptions", false],
        [WATTLE, "No tax agent", "Signed off", "Reviewer done", "No exceptions", "0", "already signed off", false],
        [KURRAJONG, "Tax agent reviews and lodges", "In review", "Reviewer pending · Tax agent pending", "3 exceptions", "2", "3 open exceptions", false],
        [COASTLINE, "No tax agent", "Preparing", "Reviewer pending", "1 exception", "0", "Submit", false],
        [TELOK_AYER, "Tax agent signs off; you lodge", "Preparing", "Reviewer pending · Tax agent pending", "No exceptions", "0", "Submit", false],
        [LOYANG, "No tax agent", "Signed off", "Reviewer done", "No exceptions", "0", "already signed off", false],
        [MERANTI, "Tax agent reviews and lodges", "In review", "Reviewer done · Tax agent pending", "No exceptions", "0", "waiting for tax agent approval", false],
        [KALLANG, "No tax agent", "Preparing", "Reviewer pending", "1 exception", "0", "Submit", false],
      ],
    );
    assert.equal(bulkSummary(app), NONE_SELECTED);
    assert.deepEqual(states(app), [[SUBMIT, true], [APPROVE, true], [SIGN_OFF, true]]);
    assert.equal(bulkReport(app), null);
    assert.ok(app.text().includes(FOOTNOTE), "the footnote about what bulk steps skip is on the page");

    // One preparing fund can be submitted; the select-all box shows that some, not all, are ticked.
    await tickFund(app, COASTLINE);
    assert.equal(bulkSummary(app), "1 selected, 1 can be submitted");
    assert.deepEqual(states(app), [[SUBMIT, false], [APPROVE, true], [SIGN_OFF, true]]);
    const all = app.byLabel("Select all funds") as HTMLInputElement;
    assert.equal(all.checked, false);
    assert.equal(all.indeterminate, true);

    // A fund in review with open exceptions takes no bulk step, and one that Reviewer already approved cannot be approved again.
    await tickFund(app, SOUTHBANK);
    await tickFund(app, MERANTI);
    assert.equal(bulkSummary(app), "3 selected, 1 can be submitted");
    assert.deepEqual(states(app), [[SUBMIT, false], [APPROVE, true], [SIGN_OFF, true]]);

    await selectAllFunds(app);
    assert.equal(bulkSummary(app), "9 selected, 3 can be submitted");
    assert.equal((app.byLabel("Select all funds") as HTMLInputElement).checked, true);
    assert.equal(tickedNames(app).length, 9);

    await selectAllFunds(app);
    assert.equal(bulkSummary(app), NONE_SELECTED);
    assert.deepEqual(tickedNames(app), []);
    assert.deepEqual(states(app), [[SUBMIT, true], [APPROVE, true], [SIGN_OFF, true]]);
    assert.ok(dataOf(app) === seed, "ticking changes nothing in the store");
  });

  it("tells a view-only persona why no step is on offer, and a tax agent gets the tax agent wording", async () => {
    const app = await mountApp({ user: "m-castillo", hash: "#/bulk-review" });
    assert.equal(bulkSummary(app), "Your role (View only) can't submit, approve or sign off funds.");
    assert.deepEqual(states(app), [[SUBMIT, true], [APPROVE, true], [SIGN_OFF, true]]);
    await selectAllFunds(app);
    assert.equal(bulkSummary(app), "Your role (View only) can't submit, approve or sign off funds.");
    assert.deepEqual(states(app), [[SUBMIT, true], [APPROVE, true], [SIGN_OFF, true]]);
    const summaryId = app.$(".bulk__summary").id;
    assert.ok(summaryId, "the summary has an id");
    for (const button of Array.from(app.$(".bulk-actions").querySelectorAll("button"))) {
      assert.equal(button.getAttribute("aria-describedby"), summaryId, `${button.textContent} is described by the summary`);
    }
    assert.deepEqual(
      bulkTable(app).map((row) => row.next),
      ["already signed off", "view only", "already signed off", "view only", "view only", "view only", "already signed off", "view only", "view only"],
    );

    await asUser(app, "s-lim");
    assert.deepEqual(
      bulkTable(app).map((row) => [row.name, row.next]),
      [
        [TELOK_AYER, "waiting for the preparer to submit"],
        [MERANTI, "Approve as tax agent"],
      ],
    );
    assert.deepEqual(states(app), [[SUBMIT, true], [APPROVE_AS_AGENT, true], [SIGN_OFF, true]]);
    await selectAllFunds(app);
    assert.equal(bulkSummary(app), "2 selected, 1 can be approved");
    assert.deepEqual(states(app), [[SUBMIT, true], [APPROVE_AS_AGENT, false], [SIGN_OFF, true]]);
  });
});

describe("Bulk review: submit, approve and sign off across the team", () => {
  it("runs the chain and reports, for every run, the funds that were done and the funds that were skipped with the reason", async () => {
    // ---------------------------------------------------------------------------------- R. Okafor clears Coastline's exception: map account 4510, update the distribution, remit what is computed
    const app = await mountApp({ user: "r-okafor", hash: "#/trial-balance?fund=coastline" });
    assert.equal(rowOf(await openBulk(app), COASTLINE).exceptions, "1 exception");
    await app.navigate("#/trial-balance?fund=coastline");
    await app.select(app.byLabel(/^Tax category for 4510 /), "Rental and property income");
    await app.click(app.byRole("button", "Update distribution"));
    await app.navigate("#/?fund=coastline");
    const computed = await remitComputed(app);
    assert.equal(fundOf(app, "coastline").whtRemitted, Math.round(Number(computed.replace(/,/g, "")) * 100));
    const seed = dataOf(app);

    // ---------------------------------------------------------------------------------- A. Moreno: tick everything and submit
    await asUser(app, "a-moreno");
    await app.navigate("#/bulk-review");
    assert.equal(rowOf(app, COASTLINE).exceptions, "No exceptions");
    await selectAllFunds(app);
    assert.equal(bulkSummary(app), "9 selected, 3 can be submitted");
    await runBulk(app, SUBMIT);
    assert.deepEqual(bulkReport(app), {
      tone: "warn",
      title: "Submitted 3 funds for review",
      lines: [
        `Done: ${COASTLINE}, ${TELOK_AYER}, ${KALLANG}`,
        `Skipped: ${HARBOURLINE}: Not preparing`,
        `Skipped: ${SOUTHBANK}: Not preparing`,
        `Skipped: ${WATTLE}: Not preparing`,
        `Skipped: ${KURRAJONG}: Not preparing`,
        `Skipped: ${LOYANG}: Not preparing`,
        `Skipped: ${MERANTI}: Not preparing`,
      ],
    });
    // The funds that were submitted are no longer ticked; the skipped ones stay ticked so the reasons can be read against them.
    assert.deepEqual(tickedNames(app), [HARBOURLINE, SOUTHBANK, WATTLE, KURRAJONG, LOYANG, MERANTI]);
    assert.equal(bulkSummary(app), "6 selected, none can be submitted, approved or signed off");
    assert.deepEqual(states(app), [[SUBMIT, true], [APPROVE, true], [SIGN_OFF, true]]);
    assert.ok(app.text().includes(FOOTNOTE));
    assert.deepEqual(entries(seed, dataOf(app)), [
      "coastline: Submitted for review · A. Moreno",
      "kallang: Submitted for review · A. Moreno",
      "telok-ayer: Submitted for review · A. Moreno",
    ]);
    assert.deepEqual(
      [fundOf(app, "coastline").status, fundOf(app, "telok-ayer").status, fundOf(app, "kallang").status],
      ["In review", "In review", "In review"],
      "submit is never blocked by exceptions: Kallang went in with its payout exception",
    );
    assert.deepEqual(
      [COASTLINE, TELOK_AYER, KALLANG].map((name) => {
        const row = rowOf(app, name);
        return [row.status, row.approvals, row.exceptions, row.next];
      }),
      [
        ["In review", "Reviewer pending", "No exceptions", "waiting for reviewer approval"],
        ["In review", "Reviewer pending · Tax agent pending", "No exceptions", "waiting for reviewer and tax agent approval"],
        ["In review", "Reviewer pending", "1 exception", "1 open exception"],
      ],
    );

    // A. Moreno submitted those three, so there is nothing left that A. Moreno can take.
    await selectAllFunds(app);
    assert.equal(bulkSummary(app), "9 selected, none can be submitted, approved or signed off");
    assert.deepEqual(states(app), [[SUBMIT, true], [APPROVE, true], [SIGN_OFF, true]]);

    // The result goes away with Dismiss, and focus goes back to the first bulk button.
    await app.click(app.byRole("button", "Dismiss"));
    assert.equal(bulkReport(app), null);
    assert.equal(app.container.ownerDocument.activeElement?.textContent, SUBMIT);

    // ---------------------------------------------------------------------------------- L. Brennan approves the Australian fund that has no exception
    await asUser(app, "l-brennan");
    assert.equal(bulkReport(app), null, "a new persona starts with a clean page");
    assert.deepEqual(tickedNames(app), []);
    assert.deepEqual(
      bulkTable(app).map((row) => row.name),
      [HARBOURLINE, SOUTHBANK, WATTLE, KURRAJONG, COASTLINE],
    );
    await selectAllFunds(app);
    assert.equal(bulkSummary(app), "5 selected, 1 can be approved");
    assert.deepEqual(states(app), [[SUBMIT, true], [APPROVE, false], [SIGN_OFF, true]]);
    const beforeBrennan = dataOf(app);
    await runBulk(app, APPROVE);
    assert.deepEqual(bulkReport(app), {
      tone: "warn",
      title: "Approved 1 fund as reviewer",
      lines: [
        `Done: ${COASTLINE}`,
        `Skipped: ${HARBOURLINE}: Not in review`,
        `Skipped: ${SOUTHBANK}: Open exceptions`,
        `Skipped: ${WATTLE}: Not in review`,
        `Skipped: ${KURRAJONG}: Open exceptions`,
      ],
    });
    assert.deepEqual(entries(beforeBrennan, dataOf(app)), ["coastline: Approved — reviewer · L. Brennan"]);
    assert.deepEqual(tickedNames(app), [HARBOURLINE, SOUTHBANK, WATTLE, KURRAJONG]);
    assert.equal(rowOf(app, COASTLINE).approvals, "Reviewer done");
    assert.equal(rowOf(app, COASTLINE).next, "waiting for sign-off");

    // ---------------------------------------------------------------------------------- N. Pillai approves the Singapore fund that has no exception
    await asUser(app, "n-pillai");
    assert.equal(bulkReport(app), null);
    await selectAllFunds(app);
    assert.equal(bulkSummary(app), "4 selected, 1 can be approved");
    await runBulk(app, APPROVE);
    assert.deepEqual(bulkReport(app), {
      tone: "warn",
      title: "Approved 1 fund as reviewer",
      lines: [
        `Done: ${TELOK_AYER}`,
        `Skipped: ${LOYANG}: Not in review`,
        `Skipped: ${MERANTI}: Already approved`,
        `Skipped: ${KALLANG}: Open exceptions`,
      ],
    });
    assert.equal(rowOf(app, TELOK_AYER).approvals, "Reviewer done · Tax agent pending");

    // ---------------------------------------------------------------------------------- S. Lim, the tax agent, approves Meranti only: a clean run
    await asUser(app, "s-lim");
    assert.equal(rowOf(app, TELOK_AYER).next, "Approve as tax agent");
    await tickFund(app, MERANTI);
    assert.equal(bulkSummary(app), "1 selected, 1 can be approved");
    assert.deepEqual(states(app), [[SUBMIT, true], [APPROVE_AS_AGENT, false], [SIGN_OFF, true]]);
    await runBulk(app, APPROVE_AS_AGENT);
    assert.deepEqual(bulkReport(app), { tone: "success", title: "Approved 1 fund as tax agent", lines: [`Done: ${MERANTI}`] });
    assert.deepEqual(tickedNames(app), []);
    assert.equal(bulkSummary(app), NONE_SELECTED);
    assert.equal(rowOf(app, MERANTI).approvals, "Reviewer done · Tax agent done");
    assert.deepEqual(
      dataOf(app).approvals.filter((approval) => approval.fundId === "meranti").map((approval) => [approval.level, approval.by, approval.at]),
      [
        ["review", "N. Pillai", dataOf(app).approvals.find((approval) => approval.fundId === "meranti" && approval.level === "review")!.at],
        ["agent", "S. Lim", NOW_LOCAL],
      ],
    );

    // ---------------------------------------------------------------------------------- A. Moreno raises a query on Meranti, then signs off in bulk
    await asUser(app, "a-moreno");
    await app.navigate("#/?fund=meranti");
    await raiseQuery(app, "Confirm the data centre capital allowances", "Please confirm the 2026 claim before we sign off.");
    assert.equal(dataOf(app).queries.filter((query) => query.fundId === "meranti" && query.status === "open").length, 1);
    await app.navigate("#/bulk-review");
    assert.equal(rowOf(app, MERANTI).queries, "1");
    assert.equal(rowOf(app, MERANTI).next, "1 open query");
    assert.equal(rowOf(app, COASTLINE).next, "Sign off");
    await selectAllFunds(app);
    assert.equal(bulkSummary(app), "9 selected, 1 can be signed off");
    assert.deepEqual(states(app), [[SUBMIT, true], [APPROVE, true], [SIGN_OFF, false]]);
    const beforeSignOff = dataOf(app);
    await runBulk(app, SIGN_OFF);
    assert.deepEqual(bulkReport(app), {
      tone: "warn",
      title: "Signed off 1 fund",
      lines: [
        `Done: ${COASTLINE}`,
        `Skipped: ${HARBOURLINE}: Not in review`,
        `Skipped: ${SOUTHBANK}: Open exceptions`,
        `Skipped: ${WATTLE}: Not in review`,
        `Skipped: ${KURRAJONG}: Open exceptions`,
        `Skipped: ${TELOK_AYER}: Waiting for Tax agent approval`,
        `Skipped: ${LOYANG}: Not in review`,
        `Skipped: ${MERANTI}: Open queries`,
        `Skipped: ${KALLANG}: Open exceptions`,
      ],
    });
    assert.deepEqual(entries(beforeSignOff, dataOf(app)), ["coastline: Signed off · A. Moreno"]);
    assert.equal(fundOf(app, "coastline").status, "Signed off");
    assert.equal(rowOf(app, COASTLINE).next, "already signed off");
    assert.deepEqual(tickedNames(app), [HARBOURLINE, SOUTHBANK, WATTLE, KURRAJONG, TELOK_AYER, LOYANG, MERANTI, KALLANG]);
    assert.equal(bulkSummary(app), "8 selected, none can be submitted, approved or signed off");
    assert.ok(app.text().includes(FOOTNOTE));

    // ---------------------------------------------------------------------------------- the query is answered, the tax agent approves Telok Ayer, and the second run signs off both
    await app.navigate("#/?fund=meranti");
    await app.click(app.byRole("tab", /^Queries/));
    const query = dataOf(app).queries.find((candidate) => candidate.fundId === "meranti" && candidate.status === "open")!;
    await app.click(app.byRole("button", `Resolve ${query.subject}`));
    assert.equal(dataOf(app).queries.find((candidate) => candidate.id === query.id)?.status, "resolved");
    await asUser(app, "s-lim");
    await app.navigate("#/bulk-review");
    await tickFund(app, TELOK_AYER);
    await runBulk(app, APPROVE_AS_AGENT);
    assert.deepEqual(bulkReport(app), { tone: "success", title: "Approved 1 fund as tax agent", lines: [`Done: ${TELOK_AYER}`] });

    await asUser(app, "a-moreno");
    assert.deepEqual(
      [TELOK_AYER, MERANTI].map((name) => [rowOf(app, name).approvals, rowOf(app, name).queries, rowOf(app, name).next]),
      [
        ["Reviewer done · Tax agent done", "0", "Sign off"],
        ["Reviewer done · Tax agent done", "0", "Sign off"],
      ],
    );
    await selectAllFunds(app);
    assert.equal(bulkSummary(app), "9 selected, 2 can be signed off");
    await runBulk(app, SIGN_OFF);
    assert.deepEqual(bulkReport(app), {
      tone: "warn",
      title: "Signed off 2 funds",
      lines: [
        `Done: ${TELOK_AYER}, ${MERANTI}`,
        `Skipped: ${HARBOURLINE}: Not in review`,
        `Skipped: ${SOUTHBANK}: Open exceptions`,
        `Skipped: ${WATTLE}: Not in review`,
        `Skipped: ${KURRAJONG}: Open exceptions`,
        `Skipped: ${COASTLINE}: Not in review`,
        `Skipped: ${LOYANG}: Not in review`,
        `Skipped: ${KALLANG}: Open exceptions`,
      ],
    });

    // ---------------------------------------------------------------------------------- what is left, and what the audit trail says
    assert.deepEqual(
      bulkTable(app).map((row) => [row.name, row.status]),
      [
        [HARBOURLINE, "Signed off"],
        [SOUTHBANK, "In review"],
        [WATTLE, "Signed off"],
        [KURRAJONG, "In review"],
        [COASTLINE, "Signed off"],
        [TELOK_AYER, "Signed off"],
        [LOYANG, "Signed off"],
        [MERANTI, "Signed off"],
        [KALLANG, "In review"],
      ],
    );
    assert.deepEqual(actionsOf(app, "coastline").slice(0, 3), ["Signed off · A. Moreno", "Approved — reviewer · L. Brennan", "Submitted for review · A. Moreno"]);
    assert.deepEqual(actionsOf(app, "telok-ayer").slice(0, 4), [
      "Signed off · A. Moreno",
      "Approved — tax agent · S. Lim",
      "Approved — reviewer · N. Pillai",
      "Submitted for review · A. Moreno",
    ]);
  });
});
