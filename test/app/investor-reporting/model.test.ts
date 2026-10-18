import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, fundCalc, investorView, workflowView } from "../../../src/domain/index.ts";
import { GOVERNANCE_MODES, ROLE_LABEL, can, lodgmentRole } from "../../../src/domain/permissions.ts";
import type { Action, AppData, AuInvestorView, Lodgment, SgInvestorView, SgNotice, WorkflowStatus } from "../../../src/domain/types.ts";
import { draftNoticeAmounts } from "../../../src/app/workspaces/investor-reporting/drafts.ts";
import {
  ANNOUNCE_DENIED_REASON,
  LODGMENT_GOVERNANCE,
  NOT_READY_REASON,
  NOT_SIGNED_OFF_REASON,
  NOTICE_TOLERANCE_CENTS,
  OVER_REPORTED_LABEL,
  PUBLISH_DENIED_REASON,
  PUBLISH_LOCKED_REASON,
  REOPENED_CHIP,
  REOPENED_NOTE,
  REOPENED_TITLE,
  REPLACE_LABEL,
  SAVE_RECORD_LABEL,
  SUBSTITUTED_PERIOD_DUE,
  UNREPORTED_LABEL,
  VARIANCE_LABEL,
  aiirCard,
  aiirChip,
  aiirTable,
  auNoticeStatus,
  costBaseNetCell,
  costBaseNetText,
  latestSgNotice,
  lodgmentSection,
  noticeListItems,
  paidToIras,
  publishControl,
  recordedMessage,
  reopenedAfterLodgment,
  s45gModel,
  sgNoticeStatus,
  varianceOf,
  vsYearModel,
} from "../../../src/app/workspaces/investor-reporting/model.ts";
import { AU_IDS, NOW, SG_IDS, auFund, ctxFor, freshData, sgFund } from "./fixtures.ts";

function au(fundId: string, userId = "a-moreno", noticeId?: string, data = freshData()): { data: ReturnType<typeof freshData>; view: AuInvestorView; status: WorkflowStatus } {
  const view = investorView(data, fundId, ctxFor(data, userId), noticeId);
  assert.equal(view.market, "AU");
  return { data, view: view as AuInvestorView, status: auFund(data, fundId).status };
}

function sg(fundId: string, userId = "a-moreno", now = NOW, data = freshData()): { data: ReturnType<typeof freshData>; view: SgInvestorView } {
  const view = investorView(data, fundId, ctxFor(data, userId, now));
  assert.equal(view.market, "SG");
  return { data, view: view as SgInvestorView };
}

/** What the lodgment section shows `userId` for the AIIR of `fundId`, built the way AiirPanel builds it. */
function sectionFor(fundId: string, userId: string, data: AppData = freshData()) {
  const { view } = au(fundId, userId, undefined, data);
  const fund = auFund(data, fundId);
  const ctx = ctxFor(data, userId);
  return lodgmentSection({
    lodgment: view.aiir.lodgment,
    status: fund.status,
    mayLodge: can(ctx.user, "lodge", fund, fund.governance),
    canLodge: workflowView(data, fundId, ctx).can.lodge,
    ready: view.aiir.ready,
    lodgerRole: ROLE_LABEL[lodgmentRole(fund.governance)],
    governance: LODGMENT_GOVERNANCE[fund.governance],
  });
}

/** The data after each person takes their step, in order; a refused step fails the test. */
function run(data: AppData, steps: ReadonlyArray<readonly [userId: string, action: Action]>): AppData {
  let current = data;
  for (const [userId, action] of steps) {
    const result = applyAction(current, action, ctxFor(current, userId));
    assert.ok(result.ok, result.ok ? "" : `${userId} could not ${action.type}: ${result.reason}`);
    if (result.ok) current = result.data;
  }
  return current;
}

describe("notice list", () => {
  it("labels published notices with the payment and publication dates", () => {
    const { view } = au("harbourline");
    const items = noticeListItems(view.notices);
    assert.equal(items.length, 4);
    assert.deepEqual(items[0], {
      id: "harbourline-2025-09-30",
      label: "Quarter ended 30 Sep 2025",
      paid: "Paid 14 Nov 2025 · A$22,604,000",
      published: true,
      status: "Published 7 Nov 2025",
    });
    assert.ok(items.every((i) => i.published));
  });

  it("labels an unpublished notice as a draft due on its payment date", () => {
    const { view } = au("coastline");
    const draft = noticeListItems(view.notices).at(-1)!;
    assert.deepEqual(draft, {
      id: "coastline-2026-09-30",
      label: "Quarter ended 30 Sep 2026",
      paid: "Paid 13 Nov 2026 · A$5,364,000",
      published: false,
      status: "Draft · due by 13 Nov 2026",
    });
  });

  it("describes the selected notice under the list", () => {
    assert.equal(auNoticeStatus(null), null);
    assert.deepEqual(auNoticeStatus({ publishedOn: "2026-08-21" }), { locked: true, text: "Published 21 Aug 2026 — locked." });
    assert.deepEqual(auNoticeStatus({ publishedOn: null }), { locked: false, text: "Estimate: the balance of the year's components not yet notified." });
  });
});

describe("notice selection and publishing", () => {
  it("selects the draft when there is one, the latest notice otherwise", () => {
    assert.equal(au("coastline").view.selectedNoticeId, "coastline-2026-09-30");
    for (const id of ["harbourline", "southbank", "wattle", "kurrajong"]) assert.equal(au(id).view.selectedNoticeId, `${id}-2026-06-30`, id);
  });

  it("honours ?notice for a real notice and ignores an unknown one", () => {
    assert.equal(au("harbourline", "a-moreno", "harbourline-2025-09-30").view.selectedNoticeId, "harbourline-2025-09-30");
    assert.equal(au("harbourline", "a-moreno", "no-such-notice").view.selectedNoticeId, "harbourline-2026-06-30");
    // A notice id from another fund (a stale ?notice after a fund switch) falls back to the fund's own default.
    assert.equal(au("coastline", "a-moreno", "harbourline-2025-09-30").view.selectedNoticeId, "coastline-2026-09-30");
  });

  it("lets only the Head of Tax and a preparer publish the Coastline draft", () => {
    for (const [user, allowed] of [["a-moreno", true], ["r-okafor", true], ["l-brennan", false], ["m-castillo", false]] as const) {
      const { view } = au("coastline", user);
      const selected = view.notices.find((n) => n.id === view.selectedNoticeId);
      const control = publishControl({ hasNotice: selected !== undefined, locked: selected?.locked ?? false, canPublish: view.canPublishSelected });
      assert.equal(control.visible, true, user);
      assert.equal(control.enabled, allowed, user);
      assert.equal(control.reason, allowed ? null : PUBLISH_DENIED_REASON, user);
    }
  });

  it("draws no button for a locked notice, whoever is looking", () => {
    for (const user of ["a-moreno", "r-okafor", "l-brennan"]) {
      const { view } = au("harbourline", user);
      const selected = view.notices.find((n) => n.id === view.selectedNoticeId)!;
      assert.equal(selected.locked, true);
      assert.deepEqual(publishControl({ hasNotice: true, locked: selected.locked, canPublish: view.canPublishSelected }), {
        visible: false,
        enabled: false,
        reason: PUBLISH_LOCKED_REASON,
      });
    }
  });

  it("has nothing to publish when the fund has no notice", () => {
    assert.deepEqual(publishControl({ hasNotice: false, locked: false, canPublish: false }), { visible: false, enabled: false, reason: null });
  });
});

describe("published notices against the year", () => {
  it("applies the 50 cent rounding tolerance of the domain checks", () => {
    assert.equal(NOTICE_TOLERANCE_CENTS, 50);
    assert.equal(varianceOf(0), "none");
    assert.equal(varianceOf(49), "none");
    assert.equal(varianceOf(-49), "none");
    assert.equal(varianceOf(50), "understated");
    assert.equal(varianceOf(-50), "overstated");
  });

  it("puts a word next to every difference that matters", () => {
    assert.deepEqual(VARIANCE_LABEL, { understated: "Notices understate", overstated: "Notices overstate" });
  });

  it("agrees to the cent for Harbourline", () => {
    const model = vsYearModel(au("harbourline").view.vsYear, null);
    assert.equal(model.hasDrafts, false);
    assert.equal(model.rows.length, 5);
    assert.ok(model.rows.every((r) => r.drafts === null && r.variance === "none" && r.difference === "A$0"));
    assert.equal(model.total?.label, "Total fund payment");
    assert.equal(model.total?.published, "A$62,347,700");
    assert.equal(model.total?.year, "A$62,347,700");
  });

  it("flags Kurrajong's NCMI as understated and the transitional exclusion as overstated, netting to nil", () => {
    const model = vsYearModel(au("kurrajong").view.vsYear, null);
    const ncmi = model.rows.find((r) => r.label === "Fund payment — NCMI")!;
    const excluded = model.rows.find((r) => r.label === "Fund payment — excluded from NCMI (transitional)")!;
    assert.deepEqual([ncmi.published, ncmi.year, ncmi.difference, ncmi.variance], ["A$0", "A$9,615,800", "A$9,615,800", "understated"]);
    assert.deepEqual([excluded.published, excluded.year, excluded.difference, excluded.variance], ["A$9,615,800", "A$0", "−A$9,615,800", "overstated"]);
    assert.equal(model.total?.difference, "A$0");
    assert.equal(model.total?.variance, "none");
  });

  it("shows Southbank's two half-year notices falling A$19,760,000 short of the year", () => {
    const model = vsYearModel(au("southbank").view.vsYear, null);
    assert.equal(model.total?.published, "A$31,866,250");
    assert.equal(model.total?.year, "A$51,626,250");
    assert.equal(model.total?.difference, "A$19,760,000");
    assert.equal(model.total?.variance, "understated");
    assert.deepEqual(model.rows.filter((r) => r.variance !== "none").map((r) => r.label), ["Fund payment — other"]);
  });

  it("adds a draft column and nets the draft off the difference when a draft notice exists", () => {
    const { data, view } = au("coastline");
    const drafts = draftNoticeAmounts(data, auFund(data, "coastline"));
    const model = vsYearModel(view.vsYear, drafts);
    assert.equal(model.hasDrafts, true);
    const other = model.rows.find((r) => r.label === "Fund payment — other")!;
    assert.deepEqual([other.published, other.drafts, other.year, other.difference, other.variance], ["A$12,645,598", "A$4,324,852", "A$16,970,450", "A$0", "none"]);
    const interest = model.rows.find((r) => r.label === "Interest")!;
    assert.deepEqual([interest.published, interest.drafts, interest.year, interest.difference], ["A$158,196", "A$54,104", "A$212,300", "A$0"]);
    assert.equal(model.total?.drafts, "A$4,324,852");
    assert.equal(model.total?.difference, "A$0");
    assert.ok(model.rows.every((r) => r.variance === "none"));

    // Without the draft column the same year would read as understated by the draft's amount.
    const without = vsYearModel(view.vsYear, null);
    assert.equal(without.total?.difference, "A$4,324,852");
    assert.equal(without.total?.variance, "understated");
  });

  it("estimates drafts only for funds that have an unpublished notice", () => {
    for (const id of AU_IDS) {
      const data = freshData();
      const drafts = draftNoticeAmounts(data, auFund(data, id));
      const total = drafts.get("Total fund payment");
      assert.equal(drafts.size, 6, id);
      assert.equal(total !== 0, id === "coastline", `${id} draft total`);
    }
  });
});

describe("annual investment income report card", () => {
  it("is Ready for a signed-off fund with a clean register, with the standard due dates", () => {
    const { view, status } = au("harbourline");
    const card = aiirCard(view.aiir, status);
    assert.deepEqual(card.chip, { text: "Ready", tone: "good" });
    assert.deepEqual(card.items.map((i) => i.state), ["Done", "Done", "Done"]);
    assert.equal(card.items[1]?.detail, "1,412,680,000 units reported");
    assert.equal(card.aiirDue, "31 Oct 2026");
    assert.equal(card.withholdingReportDue, "14 Jan 2027");
    assert.match(card.note, /^Amounts withheld from fund payments/);
  });

  it("is Lodged once a lodgment is recorded", () => {
    const { view, status } = au("wattle");
    assert.equal(status, "Signed off");
    assert.deepEqual(aiirChip(view.aiir, status), { text: "Lodged", tone: "good" });
    assert.equal(aiirCard(view.aiir, status).chip.text, "Lodged");
  });

  it("lists what is outstanding for Kurrajong", () => {
    const { view, status } = au("kurrajong");
    const card = aiirCard(view.aiir, status);
    assert.deepEqual(card.chip, { text: "Not ready", tone: "warn" });
    assert.deepEqual(card.items.map((i) => [i.id, i.state]), [["signed-off", "Outstanding"], ["register", "Outstanding"], ["totals", "Outstanding"]]);
    assert.equal(card.items[0]?.detail, "Status: In review");
    assert.equal(card.items[1]?.detail, "Register holds 950,150,000 of 951,400,000 units");
    assert.equal(card.items[2]?.detail, "A$53,051 of attributed amounts isn't reported against an investor");
  });

  it("gives Coastline's substituted accounting period once, in the due row", () => {
    const { view, status } = au("coastline");
    assert.equal(view.aiir.aiirDue, "");
    assert.match(view.aiir.note, /^AIIR due date: confirm with the ATO — substituted accounting period\./);
    const card = aiirCard(view.aiir, status);
    assert.equal(card.aiirDue, SUBSTITUTED_PERIOD_DUE);
    assert.equal(card.withholdingReportDue, "14 Apr 2027");
    assert.equal(card.note, "Amounts withheld from fund payments that aren't in the AIIR by its due date go in a second AIIR by this date.");
  });

  it("keeps the whole note if the domain wording changes", () => {
    const { view, status } = au("coastline");
    const base = view.aiir;
    assert.equal(aiirCard({ ...base, note: "Confirm the due date with the ATO." }, status).note, "Confirm the due date with the ATO.");
    assert.equal(aiirCard({ ...base, note: "AIIR due date: confirm with the ATO — substituted accounting period. " }, status).note, "AIIR due date: confirm with the ATO — substituted accounting period. ");
  });
});

describe("AIIR investor lines", () => {
  it("formats Harbourline's totals", () => {
    const { view } = au("harbourline");
    const table = aiirTable(view.aiir, null);
    assert.equal(table.rows.length, view.aiir.lines.length);
    assert.deepEqual(table.total, {
      units: "1,412,680,000",
      attributed: "A$59,620,600",
      cash: "A$92,446,000",
      costBaseNet: { amount: "A$28,913,400", kind: "excess" },
      withheld: "A$2,504,486",
    });
    const first = view.aiir.lines[0]!;
    assert.deepEqual([table.rows[0]?.id, table.rows[0]?.holder, table.rows[0]?.country, table.rows[0]?.status], [first.holderId, first.holder, first.country, first.statusLabel]);
  });

  it("reads a net shortfall for Southbank, line by line and in total", () => {
    const table = aiirTable(au("southbank").view.aiir, null);
    assert.deepEqual(table.total.costBaseNet, { amount: "A$4,816,860", kind: "shortfall" });
    assert.ok(table.rows.length > 0);
    assert.ok(table.rows.every((r) => r.costBaseNet.kind === "shortfall"));
    assert.deepEqual(table.rows[0]?.costBaseNet, { amount: "A$1,445,058", kind: "shortfall" });
    assert.ok(aiirTable(au("harbourline").view.aiir, null).rows.every((r) => r.costBaseNet.kind === "excess"));
  });

  it("writes excess and shortfall in words as well as amounts", () => {
    assert.deepEqual(costBaseNetCell(1_846_438_700, "AUD"), { amount: "A$18,464,387", kind: "excess" });
    assert.equal(costBaseNetText(1_846_438_700, "AUD"), "A$18,464,387 excess");
    assert.equal(costBaseNetText(-144_505_800, "AUD"), "A$1,445,058 shortfall");
    assert.equal(costBaseNetText(0, "AUD"), "A$0");
    assert.equal(costBaseNetText(40, "AUD"), "A$0");
    assert.equal(costBaseNetText(-40, "AUD"), "A$0");
    assert.equal(costBaseNetText(-50, "AUD"), "A$1 shortfall");
  });

  it("shows the trust components no investor carries (Kurrajong) and nothing when the lines agree", () => {
    const kurrajong = au("kurrajong");
    const calc = fundCalc(kurrajong.data, "kurrajong", NOW);
    assert.deepEqual(aiirTable(kurrajong.view.aiir, calc.au!.attributed).unreported, { label: UNREPORTED_LABEL, amount: "A$53,051" });
    for (const id of ["harbourline", "southbank", "wattle", "coastline"]) {
      const { data, view } = au(id);
      assert.equal(aiirTable(view.aiir, fundCalc(data, id, NOW).au!.attributed).unreported, null, id);
    }
  });

  it("says so when the investor lines report more than the trust", () => {
    const { data, view } = au("harbourline");
    const trust = fundCalc(data, "harbourline", NOW).au!.attributed;
    assert.deepEqual(aiirTable(view.aiir, trust - 250_000).unreported, { label: OVER_REPORTED_LABEL, amount: "A$2,500" });
  });
});

describe("record lodgment panel", () => {
  const forUser = (fundId: string, userId: string) => sectionFor(fundId, userId);

  it("shows the recorded lodgment, whoever is looking, and lets only whoever records lodgment replace it", () => {
    const shown = {
      kind: "lodged",
      title: "Lodged with the ATO",
      summary: "2 Oct 2026 · Receipt 418806117352",
      recordedBy: "Recorded by A. Moreno",
      record: { reference: "Receipt 418806117352", date: "2026-10-02" },
    };
    assert.deepEqual(forUser("wattle", "a-moreno"), { ...shown, canReplace: true });
    for (const user of ["m-castillo", "l-brennan", "r-okafor"]) assert.deepEqual(forUser("wattle", user), { ...shown, canReplace: false }, user);
  });

  it("names who records it when the persona may not (the Head of Tax where the tax agent lodges)", () => {
    assert.deepEqual(forUser("southbank", "a-moreno"), {
      kind: "delegated",
      text: "Recorded by the tax agent under this fund's governance (tax agent reviews and lodges).",
    });
    assert.deepEqual(forUser("harbourline", "d-harrow"), {
      kind: "delegated",
      text: "Recorded by the head of tax under this fund's governance (tax agent signs off; head of tax lodges).",
    });
    assert.deepEqual(forUser("harbourline", "m-castillo"), {
      kind: "delegated",
      text: "Recorded by the head of tax under this fund's governance (tax agent signs off; head of tax lodges).",
    });
  });

  it("describes every governance mode without speaking to the Head of Tax as \"you\"", () => {
    assert.deepEqual(Object.keys(LODGMENT_GOVERNANCE).sort(), GOVERNANCE_MODES.slice().sort());
    for (const text of Object.values(LODGMENT_GOVERNANCE)) assert.doesNotMatch(text, /\byou\b/i);
  });

  it("offers the form to the Head of Tax where the agent signs off, enabled once the AIIR is ready", () => {
    assert.deepEqual(forUser("harbourline", "a-moreno"), { kind: "form", enabled: true, reason: null });
  });

  it("keeps the form disabled with the reason while outstanding items remain", () => {
    assert.deepEqual(forUser("coastline", "a-moreno"), { kind: "form", enabled: false, reason: NOT_READY_REASON });
  });

  it("does not let a signed-off fund with an unready AIIR be lodged", () => {
    const section = lodgmentSection({ lodgment: null, status: "Signed off", mayLodge: true, canLodge: true, ready: false, lodgerRole: "Head of Tax", governance: "No tax agent" });
    assert.deepEqual(section, { kind: "form", enabled: false, reason: NOT_READY_REASON });
  });

  it("explains a ready AIIR whose fund is not yet signed off", () => {
    const section = lodgmentSection({ lodgment: null, status: "In review", mayLodge: true, canLodge: false, ready: true, lodgerRole: "Head of Tax", governance: "No tax agent" });
    assert.deepEqual(section, { kind: "form", enabled: false, reason: NOT_SIGNED_OFF_REASON });
  });
});

describe("AIIR chip", () => {
  it("prefers Lodged over Ready", () => {
    const lodgment = { fundId: "wattle", kind: "aiir", reference: "R1", date: "2026-10-02", actor: "A. Moreno" } as const;
    assert.equal(aiirChip({ ready: true, lodgment }, "Signed off").text, "Lodged");
    assert.equal(aiirChip({ ready: false, lodgment }, "Signed off").text, "Lodged");
    assert.equal(aiirChip({ ready: true, lodgment: null }, "Signed off").text, "Ready");
    assert.equal(aiirChip({ ready: false, lodgment: null }, "Preparing").text, "Not ready");
  });
});

describe("an AIIR lodged before the fund was reopened", () => {
  const lodgment: Lodgment = { fundId: "wattle", kind: "aiir", reference: "Receipt 418806117352", date: "2026-10-02", actor: "A. Moreno" };
  const NOT_SIGNED_OFF: readonly WorkflowStatus[] = ["Preparing", "In review"];
  const history = { title: "Previously lodged with the ATO", summary: "2 Oct 2026 · Receipt 418806117352", recordedBy: "Recorded by A. Moreno" };
  const WARNING = "This fund was reopened after the AIIR was lodged. Sign it off again and lodge an updated AIIR if any figure changes.";
  const section = (overrides: Partial<Parameters<typeof lodgmentSection>[0]> = {}) =>
    lodgmentSection({ lodgment, status: "Preparing", mayLodge: true, canLodge: false, ready: false, lodgerRole: "Head of Tax", governance: "no tax agent", ...overrides });

  it("uses the wording the lead asked for", () => {
    assert.equal(REOPENED_CHIP, "Reopened after lodgment");
    assert.equal(REOPENED_TITLE, history.title);
    assert.equal(REOPENED_NOTE, WARNING);
  });

  it("is a reopening only when a record exists and the fund is not signed off", () => {
    for (const status of NOT_SIGNED_OFF) {
      assert.equal(reopenedAfterLodgment(lodgment, status), true, status);
      assert.equal(reopenedAfterLodgment(null, status), false, `${status}, no record`);
    }
    assert.equal(reopenedAfterLodgment(lodgment, "Signed off"), false);
    assert.equal(reopenedAfterLodgment(null, "Signed off"), false);
  });

  it("turns the chip to a warning whatever the register says, until the fund is signed off again", () => {
    for (const status of NOT_SIGNED_OFF) {
      for (const ready of [true, false]) assert.deepEqual(aiirChip({ ready, lodgment }, status), { text: "Reopened after lodgment", tone: "warn" }, `${status}, ready ${ready}`);
    }
    assert.deepEqual(aiirChip({ ready: true, lodgment }, "Signed off"), { text: "Lodged", tone: "good" });
  });

  it("carries the chip through the card the panel renders", () => {
    const { view } = au("wattle");
    assert.deepEqual(aiirCard(view.aiir, "Preparing").chip, { text: "Reopened after lodgment", tone: "warn" });
    assert.deepEqual(aiirCard(view.aiir, "Signed off").chip, { text: "Lodged", tone: "good" });
  });

  it("shows the record as history, with the AIIR's warning and the usual reason, to whoever records lodgment", () => {
    for (const status of NOT_SIGNED_OFF) {
      assert.deepEqual(section({ status }), { kind: "reopened", ...history, note: WARNING, replaceReason: "Sign the fund off before recording lodgment." }, status);
    }
    assert.equal(NOT_SIGNED_OFF_REASON, "Sign the fund off before recording lodgment.");
  });

  it("gives the usual reason even when the AIIR is not ready either (the sign-off comes first)", () => {
    assert.deepEqual(section({ ready: false }), { kind: "reopened", ...history, note: WARNING, replaceReason: NOT_SIGNED_OFF_REASON });
    assert.deepEqual(section({ ready: true }), { kind: "reopened", ...history, note: WARNING, replaceReason: NOT_SIGNED_OFF_REASON });
  });

  it("gives everyone else the history and the warning but no replace control to switch off", () => {
    for (const status of NOT_SIGNED_OFF) {
      assert.deepEqual(section({ status, mayLodge: false }), { kind: "reopened", ...history, note: WARNING, replaceReason: null }, status);
    }
  });

  it("leaves the signed-off summary as it was", () => {
    const lodged = { kind: "lodged", title: "Lodged with the ATO", summary: "2 Oct 2026 · Receipt 418806117352", recordedBy: "Recorded by A. Moreno", record: { reference: "Receipt 418806117352", date: "2026-10-02" } };
    for (const mayLodge of [true, false]) {
      for (const ready of [true, false]) assert.deepEqual(section({ status: "Signed off", mayLodge, canLodge: mayLodge, ready }), { ...lodged, canReplace: mayLodge }, `mayLodge ${mayLodge}, ready ${ready}`);
    }
  });

  it("does not call a fund that was never lodged reopened", () => {
    for (const status of NOT_SIGNED_OFF) {
      assert.deepEqual(section({ lodgment: null, status }), { kind: "form", enabled: false, reason: NOT_READY_REASON }, status);
      assert.deepEqual(section({ lodgment: null, status, ready: true }), { kind: "form", enabled: false, reason: NOT_SIGNED_OFF_REASON }, status);
      assert.equal(section({ lodgment: null, status, mayLodge: false }).kind, "delegated", status);
    }
  });

  it("follows Wattle: lodged, reopened by Reopen with the record kept, lodged again once it is signed off again", () => {
    const lodged = { kind: "lodged", title: "Lodged with the ATO", summary: history.summary, recordedBy: history.recordedBy, record: { reference: lodgment.reference, date: lodgment.date }, canReplace: true };
    const reopened = { kind: "reopened", ...history, note: WARNING, replaceReason: NOT_SIGNED_OFF_REASON };
    assert.deepEqual(sectionFor("wattle", "a-moreno"), lodged);

    let data = run(freshData(), [["a-moreno", { type: "reopen", fundId: "wattle", reason: "Correcting signed-off inputs" }]]);
    assert.equal(auFund(data, "wattle").status, "Preparing");
    assert.deepEqual(au("wattle", "a-moreno", undefined, data).view.aiir.lodgment, lodgment);
    assert.deepEqual(sectionFor("wattle", "a-moreno", data), reopened);
    assert.deepEqual(aiirChip(au("wattle", "a-moreno", undefined, data).view.aiir, "Preparing"), { text: "Reopened after lodgment", tone: "warn" });
    for (const user of ["l-brennan", "r-okafor", "m-castillo"]) {
      assert.deepEqual(sectionFor("wattle", user, data), { ...reopened, replaceReason: null }, user);
    }

    data = run(data, [["r-okafor", { type: "submit", fundId: "wattle" }]]);
    assert.equal(auFund(data, "wattle").status, "In review");
    assert.deepEqual(sectionFor("wattle", "a-moreno", data), reopened);

    data = run(data, [
      ["l-brennan", { type: "approve", fundId: "wattle", level: "review" }],
      ["a-moreno", { type: "sign-off", fundId: "wattle" }],
    ]);
    assert.equal(auFund(data, "wattle").status, "Signed off");
    assert.deepEqual(sectionFor("wattle", "a-moreno", data), lodged);
    assert.deepEqual(aiirChip(au("wattle", "a-moreno", undefined, data).view.aiir, "Signed off"), { text: "Lodged", tone: "good" });
  });

  it("follows a fund that is lodged here and then reopened (Harbourline: the Head of Tax lodges, the agent signs off)", () => {
    const recorded = run(freshData(), [["a-moreno", { type: "record-lodgment", fundId: "harbourline", kind: "aiir", reference: "Receipt 418806555001", date: "2026-10-12" }]]);
    assert.equal(sectionFor("harbourline", "a-moreno", recorded).kind, "lodged");
    const reopened = run(recorded, [["a-moreno", { type: "reopen", fundId: "harbourline", reason: "Correcting signed-off inputs" }]]);
    assert.deepEqual(sectionFor("harbourline", "a-moreno", reopened), {
      kind: "reopened",
      title: "Previously lodged with the ATO",
      summary: "12 Oct 2026 · Receipt 418806555001",
      recordedBy: "Recorded by A. Moreno",
      note: WARNING,
      replaceReason: NOT_SIGNED_OFF_REASON,
    });
    assert.equal(sectionFor("harbourline", "d-harrow", reopened).kind, "reopened");
  });

  it("only ever applies to a fund that has a record and is not signed off, across the whole seed", () => {
    const data = freshData();
    for (const id of AU_IDS) {
      const { view, status } = au(id, "a-moreno", undefined, data);
      const kind = sectionFor(id, "a-moreno", data).kind;
      const expected = view.aiir.lodgment !== null && status !== "Signed off";
      assert.equal(kind === "reopened", expected, `${id} (${status})`);
      assert.equal(aiirChip(view.aiir, status).text === REOPENED_CHIP, expected, `${id} chip`);
    }
  });
});

describe("replacing the AIIR lodgment record", () => {
  const FIRST = { reference: "Receipt 418806117352", date: "2026-10-02" };
  const NEXT = { reference: "Receipt 418806999999", date: "2026-10-10" };
  const HARBOURLINE_RECORD = { reference: "Receipt 418806555001", date: "2026-10-12" };
  const SOUTHBANK_RECORD = { reference: "Receipt 418806555777", date: "2026-10-11" };
  const DOMAIN_REASON = /Sign the fund off before recording lodgment/;
  const recordAiir = (fundId: string, record: { reference: string; date: string } = NEXT): Action => ({ type: "record-lodgment", fundId, kind: "aiir", ...record });
  const aiirRecords = (data: AppData, fundId: string): Lodgment[] => data.lodgments.filter((l) => l.fundId === fundId && l.kind === "aiir");
  const lodgedEntries = (data: AppData, fundId: string) => data.audit.filter((e) => e.fundId === fundId && e.action === "AIIR lodged with the ATO");
  /** Harbourline (the tax agent signs off, the Head of Tax lodges) is signed off in the seed with no AIIR record. */
  const harbourlineLodged = (): AppData => run(freshData(), [["a-moreno", recordAiir("harbourline", HARBOURLINE_RECORD)]]);
  /** Southbank (the tax agent lodges): both approvals, the Head of Tax's sign-off, then the tax agent records the AIIR. */
  const southbankLodged = (): AppData =>
    run(freshData(), [
      ["l-brennan", { type: "approve", fundId: "southbank", level: "review" }],
      ["d-harrow", { type: "approve", fundId: "southbank", level: "agent" }],
      ["a-moreno", { type: "sign-off", fundId: "southbank" }],
      ["d-harrow", recordAiir("southbank", SOUTHBANK_RECORD)],
    ]);
  const WITH_ACCESS = ["a-moreno", "l-brennan", "r-okafor", "m-castillo"];

  it("uses the wording the lead asked for", () => {
    assert.equal(REPLACE_LABEL, "Replace lodgment record");
    assert.equal(SAVE_RECORD_LABEL, "Save record");
  });

  it("is offered to the person who records lodgment, where the Head of Tax lodges", () => {
    for (const [fundId, data, record, summary] of [
      ["wattle", freshData(), FIRST, "2 Oct 2026 · Receipt 418806117352"],
      ["harbourline", harbourlineLodged(), HARBOURLINE_RECORD, "12 Oct 2026 · Receipt 418806555001"],
    ] as const) {
      const shown = { kind: "lodged", title: "Lodged with the ATO", summary, recordedBy: "Recorded by A. Moreno", record };
      assert.deepEqual(sectionFor(fundId, "a-moreno", data), { ...shown, canReplace: true }, fundId);
      for (const user of ["l-brennan", "r-okafor", "m-castillo"]) assert.deepEqual(sectionFor(fundId, user, data), { ...shown, canReplace: false }, `${fundId} ${user}`);
    }
    assert.deepEqual(sectionFor("harbourline", "d-harrow", harbourlineLodged()), {
      kind: "lodged",
      title: "Lodged with the ATO",
      summary: "12 Oct 2026 · Receipt 418806555001",
      recordedBy: "Recorded by A. Moreno",
      record: HARBOURLINE_RECORD,
      canReplace: false,
    });
  });

  it("is offered to the tax agent, and not the Head of Tax, where the tax agent lodges", () => {
    const data = southbankLodged();
    assert.equal(auFund(data, "southbank").status, "Signed off");
    const shown = { kind: "lodged", title: "Lodged with the ATO", summary: "11 Oct 2026 · Receipt 418806555777", recordedBy: "Recorded by D. Harrow", record: SOUTHBANK_RECORD };
    assert.deepEqual(sectionFor("southbank", "d-harrow", data), { ...shown, canReplace: true });
    for (const user of WITH_ACCESS) assert.deepEqual(sectionFor("southbank", user, data), { ...shown, canReplace: false }, user);
  });

  it("is offered exactly when the domain would take the replacement", () => {
    const cases: ReadonlyArray<readonly [fundId: string, data: AppData, users: readonly string[], lodger: string]> = [
      ["wattle", freshData(), WITH_ACCESS, "a-moreno"],
      ["harbourline", harbourlineLodged(), [...WITH_ACCESS, "d-harrow"], "a-moreno"],
      ["southbank", southbankLodged(), [...WITH_ACCESS, "d-harrow"], "d-harrow"],
    ];
    for (const [fundId, data, users, lodger] of cases) {
      const allowed: string[] = [];
      for (const user of users) {
        const ctx = ctxFor(data, user);
        const section = sectionFor(fundId, user, data);
        assert.equal(section.kind, "lodged", `${fundId} ${user}`);
        const canReplace = section.kind === "lodged" && section.canReplace;
        assert.equal(canReplace, workflowView(data, fundId, ctx).can.lodge, `${fundId} ${user}: matches can.lodge`);
        assert.equal(canReplace, applyAction(data, recordAiir(fundId), ctx).ok, `${fundId} ${user}: matches the domain`);
        if (canReplace) allowed.push(user);
      }
      assert.deepEqual(allowed, [lodger], fundId);
    }
  });

  it("replaces the record in place instead of adding another, and audits it", () => {
    const before = freshData();
    const after = run(before, [["a-moreno", recordAiir("wattle")]]);
    assert.deepEqual(aiirRecords(after, "wattle"), [{ fundId: "wattle", kind: "aiir", ...NEXT, actor: "A. Moreno" }]);
    assert.deepEqual(after.lodgments.map((l) => `${l.fundId}:${l.kind}`), before.lodgments.map((l) => `${l.fundId}:${l.kind}`));
    assert.deepEqual(
      after.lodgments.filter((l) => l.kind !== "aiir"),
      before.lodgments.filter((l) => l.kind !== "aiir"),
    );
    assert.equal(lodgedEntries(after, "wattle").length, lodgedEntries(before, "wattle").length + 1);
    assert.ok(lodgedEntries(after, "wattle").some((e) => e.actor === "A. Moreno" && e.detail === "Reference Receipt 418806999999, 2026-10-10"));
  });

  it("shows the replacement as the current record, still lodged and still replaceable", () => {
    const after = run(freshData(), [["a-moreno", recordAiir("wattle")]]);
    assert.deepEqual(sectionFor("wattle", "a-moreno", after), {
      kind: "lodged",
      title: "Lodged with the ATO",
      summary: "10 Oct 2026 · Receipt 418806999999",
      recordedBy: "Recorded by A. Moreno",
      record: NEXT,
      canReplace: true,
    });
    assert.deepEqual(aiirChip(au("wattle", "a-moreno", undefined, after).view.aiir, "Signed off"), { text: "Lodged", tone: "good" });
    const again = run(after, [["a-moreno", recordAiir("wattle", FIRST)]]);
    assert.deepEqual(aiirRecords(again, "wattle").map((l) => l.reference), [FIRST.reference]);
  });

  it("gives way to the switched-off control, and to the domain's refusal, once the fund is reopened", () => {
    const reopened = run(freshData(), [["a-moreno", { type: "reopen", fundId: "wattle", reason: "Correcting signed-off inputs" }]]);
    const section = sectionFor("wattle", "a-moreno", reopened);
    assert.equal(section.kind, "reopened");
    assert.equal(section.kind === "reopened" ? section.replaceReason : null, NOT_SIGNED_OFF_REASON);
    const result = applyAction(reopened, recordAiir("wattle"), ctxFor(reopened, "a-moreno"));
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.reason, DOMAIN_REASON);
    assert.deepEqual(aiirRecords(reopened, "wattle").map((l) => l.reference), [FIRST.reference]);
  });

  it("refuses the replacement from anyone who may not record lodgment", () => {
    const southbank = southbankLodged();
    for (const user of WITH_ACCESS) {
      const result = applyAction(southbank, recordAiir("southbank"), ctxFor(southbank, user));
      assert.equal(result.ok, false, user);
    }
    assert.deepEqual(aiirRecords(southbank, "southbank").map((l) => l.reference), [SOUTHBANK_RECORD.reference]);
  });

  it("says what was done in the live region: recorded the first time, replaced after that", () => {
    assert.equal(recordedMessage("Wattle Retail Property Trust", "Receipt 418806999999", false), "Wattle Retail Property Trust: AIIR lodgment recorded, Receipt 418806999999.");
    assert.equal(recordedMessage("Wattle Retail Property Trust", "Receipt 418806999999", true), "Wattle Retail Property Trust: AIIR lodgment record replaced, Receipt 418806999999.");
  });

  it("belongs only to a fund that has a record and is signed off, across the whole seed", () => {
    const data = freshData();
    for (const id of AU_IDS) {
      const { view, status } = au(id, "a-moreno", undefined, data);
      assert.equal(sectionFor(id, "a-moreno", data).kind === "lodged", view.aiir.lodgment !== null && status === "Signed off", `${id} (${status})`);
    }
  });
});

describe("Singapore distribution notice", () => {
  it("announces by the record date until the notice goes out", () => {
    const { view } = sg("telok-ayer");
    assert.deepEqual(sgNoticeStatus(view.notice), { locked: false, text: "Draft · announce by 6 Nov 2026" });
    assert.equal(view.notice.canPublish, true);
  });

  it("says when it was announced and that it is locked", () => {
    const { view } = sg("loyang");
    assert.deepEqual(sgNoticeStatus(view.notice), { locked: true, text: "Announced 30 Jul 2026 — locked." });
    assert.equal(view.notice.canPublish, false);
  });

  it("picks the fund's notice with the latest record date, the first of equals, ignoring other funds", () => {
    const notice = (id: string, fundId: string, recordDate: string): SgNotice => ({
      id,
      fundId,
      recordDate,
      declarationDeadline: recordDate,
      paymentDate: recordDate,
      publishedOn: null,
      notified: null,
    });
    const list = [notice("a", "f1", "2026-02-01"), notice("b", "f2", "2026-12-01"), notice("c", "f1", "2026-05-01"), notice("d", "f1", "2026-05-01"), notice("e", "f1", "2026-03-01")];
    assert.equal(latestSgNotice(list, "f1")?.id, "c");
    assert.equal(latestSgNotice(list, "f2")?.id, "b");
    assert.equal(latestSgNotice(list, "f3"), null);
    assert.equal(latestSgNotice([], "f1"), null);
  });

  it("finds the same notice the domain reports on, for every Singapore fund", () => {
    for (const id of SG_IDS) {
      const { data, view } = sg(id);
      const found = latestSgNotice(data.sgNotices, id);
      assert.ok(found, id);
      assert.equal(found.publishedOn, view.notice.publishedOn, id);
      assert.equal(found.recordDate, view.notice.recordDate, id);
      assert.equal(view.notice.canPublish, found.publishedOn === null, id);
    }
  });

  it("lets a view-only persona see the draft but not announce it", () => {
    const { view } = sg("telok-ayer", "m-castillo");
    assert.equal(view.notice.canPublish, false);
    assert.deepEqual(publishControl({ hasNotice: true, locked: view.notice.published, canPublish: view.notice.canPublish, verb: "announce" }), {
      visible: true,
      enabled: false,
      reason: ANNOUNCE_DENIED_REASON,
    });
  });
});

describe("Singapore s45G filing", () => {
  it("words what was paid to IRAS", () => {
    assert.equal(paidToIras({ paid: null, deducted: 186_920_320 }), "Not yet paid");
    assert.equal(paidToIras({ paid: 279_264_400, deducted: 279_264_400 }), "S$2,792,644.00 · reconciled");
    assert.equal(paidToIras({ paid: 270_000_000, deducted: 279_264_400 }), "S$2,700,000.00 · S$92,644.00 under-paid");
    assert.equal(paidToIras({ paid: 290_000_000, deducted: 279_264_400 }), "S$2,900,000.00 · S$107,356.00 over-paid");
    assert.equal(paidToIras({ paid: 0, deducted: 100 }), "S$0.00 · S$1.00 under-paid");
  });

  it("matches the domain's reconciliation status for every Singapore fund, unpaid, exact, short and long", () => {
    for (const id of SG_IDS) {
      const deducted = fundCalc(freshData(), id, NOW).withheld;
      for (const remitted of [null, "exact", "short", "long"] as const) {
        // Distribution calculations are cached per data object, so each case starts from its own copy of the seed.
        const data = freshData();
        sgFund(data, id).whtRemitted = remitted === null ? null : remitted === "exact" ? deducted : remitted === "short" ? Math.max(0, deducted - 700) : deducted + 700;
        const { s45g } = investorView(data, id, ctxFor(data), null) as SgInvestorView;
        assert.equal(s45g.deducted, deducted, `${id} ${remitted}`);
        const expected = { "not-remitted": /^Not yet paid$/, reconciled: /· reconciled$/, "under-remitted": /under-paid$/, "over-remitted": /over-paid$/ }[s45g.status];
        assert.match(paidToIras(s45g), expected, `${id} ${remitted} ${s45g.status}`);
        assert.equal(s45g.status, { null: "not-remitted", exact: "reconciled", short: "under-remitted", long: "over-remitted" }[String(remitted)], `${id} ${remitted} status`);
      }
    }
  });

  it("formats Telok Ayer's filing: due 15 Jan 2027, nothing paid yet", () => {
    const model = s45gModel(sg("telok-ayer").view.s45g);
    assert.equal(model.paymentDate, "27 Nov 2026");
    assert.equal(model.fileAndPayBy, "15 Jan 2027");
    assert.equal(model.overdue, false);
    assert.equal(model.deducted, "S$1,869,203.20");
    assert.equal(model.paid, "Not yet paid");
    assert.equal(model.rows.length, 2);
    assert.deepEqual(model.total, { taxable: "S$14,603,150.00", deducted: "S$1,869,203.20" });
    for (const row of model.rows) assert.match(row.rate, /^\d+(\.\d+)?% (final|not final)$/);
    assert.equal(model.emptyMessage, null);
  });

  it("formats Loyang's reconciled filing", () => {
    const model = s45gModel(sg("loyang").view.s45g);
    assert.equal(model.paid, "S$2,792,644.00 · reconciled");
    assert.equal(model.rows.length, 3);
    assert.equal(model.overdue, false);
  });

  it("flags an unpaid filing as overdue only after the due date", () => {
    const due = sg("telok-ayer").view.s45g.fileAndPayBy;
    assert.equal(due, "2027-01-15");
    assert.equal(s45gModel(sg("telok-ayer", "a-moreno", new Date(2027, 0, 15, 9)).view.s45g).overdue, false);
    assert.equal(s45gModel(sg("telok-ayer", "a-moreno", new Date(2027, 0, 16, 9)).view.s45g).overdue, true);
    // A paid filing is never overdue.
    assert.equal(s45gModel(sg("loyang", "a-moreno", new Date(2027, 5, 1, 9)).view.s45g).overdue, false);
  });

  it("carries the empty message through when nothing was deducted", () => {
    const base = sg("telok-ayer").view.s45g;
    const model = s45gModel({ ...base, rows: [], totals: { taxable: 0, deducted: 0 }, deducted: 0, emptyMessage: "No tax deducted from this distribution" });
    assert.equal(model.emptyMessage, "No tax deducted from this distribution");
    assert.equal(model.rows.length, 0);
    assert.equal(model.deducted, "S$0.00");
    assert.deepEqual(model.total, { taxable: "S$0.00", deducted: "S$0.00" });
  });
});
