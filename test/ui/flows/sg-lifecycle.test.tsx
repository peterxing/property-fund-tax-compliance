// Flow 3: Singapore. Kallang (no tax agent) from the payout check to the filing, and Telok Ayer (the tax agent signs off, the Head of Tax files).
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test test/ui/flows/sg-lifecycle.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mountApp, type MountedApp } from "../harness.tsx";
import { expectNone } from "../same.ts";
import { announced, railState } from "../shell.ts";
import {
  NOW_LOCAL,
  asUser,
  auditRows,
  bulkRow,
  checkRows,
  dataOf,
  enter,
  expectHeader,
  footRows,
  fundOf,
  hasControl,
  header,
  offered,
  openTab,
  pressHeader,
  recordedSince,
  remitComputed,
  sgFundOf,
  tableRows,
} from "./support.ts";

const KALLANG = "kallang";
const NAME = "Kallang Riverside Retail REIT";
const TELOK_AYER = "telok-ayer";
const REFERENCE = "IRAS-ACK-2027-0042";

const railItem = (app: MountedApp, fundId: string): { status: string; exceptions: string } => {
  const items = (railState(app)?.groups ?? []).flatMap((group) => group.items).filter((item) => item.href.includes(`fund=${fundId}`));
  assert.equal(items.length, 1, `the rail lists ${fundId} once`);
  return { status: items[0]!.status, exceptions: items[0]!.exceptions };
};
const exceptionTitles = (app: MountedApp): string[] => checkRows(app).filter((check) => check.tag === "Exception").map((check) => check.title);
const tabText = (app: MountedApp, name: RegExp): string => (app.byRole("tab", name).textContent ?? "").replace(/\s+/g, " ").trim();
const lodgmentsOf = (app: MountedApp, fundId: string) => dataOf(app).lodgments.filter((record) => record.fundId === fundId);
// The worst case if the Comptroller denies tax transparency: 17% of all taxable specified income (S$41,906,500), and the withholding computed on the payout falls away.
const worstCase = (withholding: string): string =>
  "If the Comptroller denies tax transparency for the year, the trustee would instead be taxed on all of the taxable specified income at 17%: S$7,124,105 (the engine's worst case), " +
  `and no s45G withholding would apply to distributions out of income already taxed at the trustee (IRAS e-Tax Guide para 8.4), so the ${withholding} of withholding computed here would fall away; this needs a tax adviser's view.`;

describe("Kallang (Singapore, no tax agent) from the payout check to the filing", () => {
  it("raises and clears the 90% exception, runs the approvals, and announces the notice with its s45G table", async () => {
    const app = await mountApp({ user: "w-l-teo", hash: `#/?fund=${KALLANG}` });
    const seed = dataOf(app);
    assert.equal(header(app).status, "Preparing");
    assert.equal(header(app).governance, "No tax agent");
    assert.deepEqual(offered(app), ["Submit for review"]);
    expectHeader(app, KALLANG, "seed, W. L. Teo");

    // ------------------------------------------------------------------------------------------------ the payout check, with its worst case
    await openTab(app, /^Checks/);
    assert.equal(tabText(app, /^Checks/), "Checks 1 exception");
    assert.deepEqual(
      checkRows(app).map((check) => [check.tag, check.title]),
      [
        ["Exception", "Taxable payout below 90%"],
        ["Note", "17% deducted for 1 holder without a qualifying declaration"],
        ["Note", "Announce the tax notice before the record date, 9 Nov 2026"],
      ],
    );
    assert.equal(
      checkRows(app)[0]!.detail,
      "85.0% of taxable specified income is distributed. Tax transparency needs at least 90% for the year; S$6,286,000 retained is taxed at the trustee at 17% (S$1,068,620). " +
        worstCase("S$837,082"),
    );
    assert.deepEqual(railItem(app, KALLANG), { status: "Preparing", exceptions: "1 exception" });
    assert.match(app.text(), /Taxable payout\s*85\.0%/);

    // Paying out S$38,000,000 of the S$41,906,500 is 90.7%: the exception goes.
    await enter(app, "Taxable income distribution", "38,000,000");
    assert.equal(announced(app), "Saved: Taxable income distribution");
    assert.equal(sgFundOf(app, KALLANG).inputs.taxableDistributed, 3_800_000_000);
    assert.deepEqual(recordedSince(seed, dataOf(app)), [
      { fundId: KALLANG, at: NOW_LOCAL, actor: "W. L. Teo", action: "Taxable income distribution updated", detail: "S$35,620,500 → S$38,000,000" },
    ]);
    assert.match(app.text(), /Taxable payout\s*90\.7%/);
    assert.deepEqual(exceptionTitles(app), []);
    assert.equal(tabText(app, /^Checks/), "Checks 2 notes");
    assert.deepEqual(railItem(app, KALLANG), { status: "Preparing", exceptions: "No exceptions" });
    await app.navigate("#/bulk-review");
    assert.equal(bulkRow(app, NAME).exceptions, "No exceptions");

    // Paying out less brings it back, with the new retained income and the same worst case.
    await app.navigate(`#/?fund=${KALLANG}`);
    await enter(app, "Taxable income distribution", "35,000,000");
    await openTab(app, /^Checks/);
    assert.deepEqual(exceptionTitles(app), ["Taxable payout below 90%"]);
    assert.equal(tabText(app, /^Checks/), "Checks 1 exception");
    assert.equal(
      checkRows(app)[0]!.detail,
      "83.5% of taxable specified income is distributed. Tax transparency needs at least 90% for the year; S$6,906,500 retained is taxed at the trustee at 17% (S$1,174,105). " +
        worstCase("S$822,500"),
    );
    assert.deepEqual(railItem(app, KALLANG), { status: "Preparing", exceptions: "1 exception" });

    // ------------------------------------------------------------------------------------------------ back to 38,000,000, remit what is computed, submit
    await enter(app, "Taxable income distribution", "38,000,000");
    assert.deepEqual(exceptionTitles(app), []);
    // 15% of the units are held by a qualifying non-resident (10% final) and 5% by nominees without a declaration (17%).
    assert.equal(await remitComputed(app, "S$"), "893,000.00");
    assert.equal(fundOf(app, KALLANG).whtRemitted, 89_300_000);
    assert.equal(await pressHeader(app, "Submit for review"), `${NAME} submitted for review.`);
    assert.equal(fundOf(app, KALLANG).status, "In review");
    assert.deepEqual(offered(app), []);

    // ------------------------------------------------------------------------------------------------ review, and the tax adviser who has no access to this fund
    await asUser(app, "n-pillai");
    assert.deepEqual(offered(app), ["Return to preparer", "Approve as reviewer"]);
    assert.equal(await pressHeader(app, "Approve as reviewer"), `${NAME} approved as reviewer.`);
    assert.deepEqual(header(app).steps, ["Reviewer done, N. Pillai, 12 Oct 2026", "Sign-off pending · Head of Tax"]);
    expectHeader(app, KALLANG, "reviewed, N. Pillai");

    await asUser(app, "s-lim");
    assert.equal(header(app).name, "Telok Ayer Commercial REIT", "S. Lim does not see Kallang, so the page falls back to the first fund S. Lim can see");
    assert.equal(
      (railState(app)?.groups ?? []).flatMap((group) => group.items).some((item) => item.href.includes(`fund=${KALLANG}`)),
      false,
    );
    assert.deepEqual(app.store.dispatch({ type: "approve", fundId: KALLANG, level: "agent" }), { ok: false, reason: "You don't have access to this fund" });

    await asUser(app, "a-moreno");
    await app.navigate(`#/?fund=${KALLANG}`);
    assert.deepEqual(offered(app), ["Return to preparer", "Sign off"]);
    assert.equal(await pressHeader(app, "Sign off"), `${NAME} signed off.`);
    assert.deepEqual(header(app).steps, ["Reviewer done, N. Pillai, 12 Oct 2026", "Sign-off done, A. Moreno, 12 Oct 2026"]);
    assert.deepEqual(offered(app), ["Reopen"]);
    expectHeader(app, KALLANG, "signed off, A. Moreno");
    assert.match(app.text(), /Signed off — reopen to edit/);
    assert.equal(hasControl(app, "Taxable income distribution"), false);

    // ------------------------------------------------------------------------------------------------ the notice and the s45G table
    await app.navigate(`#/investor-reporting?fund=${KALLANG}`);
    assert.match(app.text(), /Draft · announce by 9 Nov 2026/);
    const table = (): HTMLElement => app.byRole("table", /^Tax deducted from each unitholder/);
    assert.deepEqual(tableRows(table()), [
      ["Nordfjell Sovereign HoldingsNorway", "Qualifying non-resident non-individual", "10% final", "S$5,700,000.00", "S$570,000.00"],
      ["Nominee accounts without a declarationVarious", "Other unitholder", "17% not final", "S$1,900,000.00", "S$323,000.00"],
    ]);
    assert.deepEqual(footRows(table()), [["Total", "", "", "S$7,600,000.00", "S$893,000.00"]]);
    assert.match(app.text(), /Tax deducted\s*S\$893,000\.00/);
    assert.match(app.text(), /Paid to IRAS\s*S\$893,000\.00 · reconciled/);
    const beforeNotice = dataOf(app);
    await app.click(app.byRole("button", "Announce notice"));
    assert.equal(announced(app), `${NAME}: the distribution tax notice is announced and locked.`);
    assert.equal(dataOf(app).sgNotices.find((notice) => notice.fundId === KALLANG)?.publishedOn, "2026-10-12");
    assert.deepEqual(recordedSince(beforeNotice, dataOf(app)), [
      {
        fundId: KALLANG,
        at: NOW_LOCAL,
        actor: "A. Moreno",
        action: "Distribution tax notice announced",
        detail: "Taxable S$38,000,000, tax-exempt S$0, capital S$0",
      },
    ]);
    assert.match(app.text(), /Announced 12 Oct 2026 — locked\./);
    expectNone(app.queryByRole("button", "Announce notice"), "an announced notice cannot be announced again");
    assert.deepEqual(app.store.dispatch({ type: "publish-notice", fundId: KALLANG, noticeId: dataOf(app).sgNotices.find((notice) => notice.fundId === KALLANG)!.id }), {
      ok: false,
      reason: "Published notices are locked",
    });

    // ------------------------------------------------------------------------------------------------ Form UT filing
    await app.navigate(`#/tax-returns?fund=${KALLANG}`);
    assert.match(app.text(), /Form UT filing\s*Ready/);
    const beforeFiling = dataOf(app);
    await app.type(app.byLabel(/^IRAS acknowledgement reference$/), REFERENCE);
    await app.click(app.byRole("button", "Record filing"));
    assert.deepEqual(lodgmentsOf(app, KALLANG), [{ fundId: KALLANG, kind: "form-ut", reference: REFERENCE, date: "2026-10-12", actor: "A. Moreno" }]);
    assert.deepEqual(
      recordedSince(beforeFiling, dataOf(app)).map((entry) => [entry.actor, entry.action, entry.detail]),
      [["A. Moreno", "Form UT filed with IRAS", `Reference ${REFERENCE}, 2026-10-12`]],
    );
    assert.match(app.text(), /12 Oct 2026 · IRAS-ACK-2027-0042/);
    assert.match(app.text(), /Recorded by A\. Moreno/);

    // The audit trail of the fund tells the story, newest first.
    await app.navigate(`#/?fund=${KALLANG}`);
    await openTab(app, /^Audit trail/);
    assert.deepEqual(
      auditRows(app)
        .slice(0, 8)
        .map((row) => `${row.action} · ${row.actor}`),
      [
        "Form UT filed with IRAS · A. Moreno",
        "Distribution tax notice announced · A. Moreno",
        "Signed off · A. Moreno",
        "Approved — reviewer · N. Pillai",
        "Submitted for review · W. L. Teo",
        "Withholding remitted updated · W. L. Teo",
        "Taxable income distribution updated · W. L. Teo",
        "Taxable income distribution updated · W. L. Teo",
      ],
    );
  });
});

describe("Telok Ayer (Singapore): the tax agent signs off, the Head of Tax files", () => {
  it("runs Teo -> Pillai -> Lim -> Moreno and lets only the Head of Tax record the filing", async () => {
    const TELOK = "Telok Ayer Commercial REIT";
    const app = await mountApp({ user: "w-l-teo", hash: `#/?fund=${TELOK_AYER}` });
    assert.equal(header(app).governance, "Tax agent signs off; you lodge");
    assert.deepEqual(header(app).steps, ["Reviewer pending", "Tax agent pending", "Sign-off pending · Head of Tax"]);
    await remitComputed(app, "S$");
    assert.equal(await pressHeader(app, "Submit for review"), `${TELOK} submitted for review.`);

    await asUser(app, "n-pillai");
    assert.equal(await pressHeader(app, "Approve as reviewer"), `${TELOK} approved as reviewer.`);
    await asUser(app, "s-lim");
    assert.deepEqual(offered(app), ["Approve as tax agent"]);
    assert.equal(await pressHeader(app, "Approve as tax agent"), `${TELOK} approved as tax agent.`);
    assert.deepEqual(header(app).steps, ["Reviewer done, N. Pillai, 12 Oct 2026", "Tax agent done, S. Lim, 12 Oct 2026", "Sign-off pending · Head of Tax"]);
    assert.deepEqual(offered(app), []);
    expectHeader(app, TELOK_AYER, "approved by the tax agent, S. Lim");

    await asUser(app, "a-moreno");
    assert.equal(await pressHeader(app, "Sign off"), `${TELOK} signed off.`);
    assert.equal(fundOf(app, TELOK_AYER).status, "Signed off");

    // The Head of Tax files; the tax agent is told who does.
    await app.navigate(`#/tax-returns?fund=${TELOK_AYER}`);
    assert.equal(hasControl(app, /^IRAS acknowledgement reference$/), true);
    await asUser(app, "s-lim");
    assert.match(app.text(), /Recorded by the head of tax under this fund's governance \(tax agent signs off; head of tax lodges\)\./);
    assert.equal(hasControl(app, /^IRAS acknowledgement reference$/), false);
    assert.deepEqual(app.store.dispatch({ type: "record-lodgment", fundId: TELOK_AYER, kind: "form-ut", reference: REFERENCE, date: "2026-10-12" }), {
      ok: false,
      reason: "Only the head of tax records lodgment for this fund",
    });
    await asUser(app, "a-moreno");
    await app.type(app.byLabel(/^IRAS acknowledgement reference$/), REFERENCE);
    await app.click(app.byRole("button", "Record filing"));
    assert.deepEqual(lodgmentsOf(app, TELOK_AYER), [{ fundId: TELOK_AYER, kind: "form-ut", reference: REFERENCE, date: "2026-10-12", actor: "A. Moreno" }]);
  });
});
