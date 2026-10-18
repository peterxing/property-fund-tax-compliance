import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, returnView, toISODate, workflowView } from "../../../src/domain/index.ts";
import type { Action, AppData } from "../../../src/domain/types.ts";
import {
  GOVERNANCE_PHRASE,
  NOT_READY_REASON,
  NOT_SIGNED_OFF_REASON,
  REFERENCE_MAX_LENGTH,
  REFERENCE_MIN_LENGTH,
  checkLodgment,
  delegatedText,
  initialDraft,
  isRealISODate,
  lodgedSummary,
  lodgmentSection,
  lodgmentSectionFor,
  lodgmentWords,
  readinessChip,
  readinessItems,
  recordedMessage,
  reopenedAfterLodgment,
  reopenedWords,
} from "../../../src/app/workspaces/tax-returns/model.ts";
import { ALL_IDS, AU_IDS, NOW, SG_IDS, ctxFor, fundOf, freshData } from "../trial-balance/fixtures.ts";

const TODAY = toISODate(NOW);
const AU_LABEL = "ATO receipt reference";
const SG_LABEL = "IRAS acknowledgement reference";

function sectionFor(data: AppData, id: string, userId: string) {
  const ctx = ctxFor(data, userId);
  return lodgmentSectionFor({ user: ctx.user, fund: fundOf(data, id), view: returnView(data, id, ctx), workflow: workflowView(data, id, ctx) });
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

describe("wording", () => {
  it("calls the ATO return lodged and the IRAS Form UT filed", () => {
    assert.deepEqual(lodgmentWords("return"), { action: "Record lodgment", noun: "lodgment", lodgedTitle: "Lodged with the ATO", lodgedChip: "Lodged" });
    assert.deepEqual(lodgmentWords("form-ut"), { action: "Record filing", noun: "filing", lodgedTitle: "Filed with IRAS", lodgedChip: "Filed" });
    assert.equal(lodgmentWords("aiir").action, "Record lodgment");
    assert.equal(recordedMessage("Wattle Retail Property Trust", "return", "Receipt 418806221407"), "Wattle Retail Property Trust: lodgment recorded, Receipt 418806221407.");
    assert.equal(recordedMessage("Loyang Logistics REIT", "form-ut", "ACK 1234"), "Loyang Logistics REIT: filing recorded, ACK 1234.");
  });

  it("follows each fund's return kind", () => {
    const data = freshData();
    for (const id of AU_IDS) assert.equal(lodgmentWords(returnView(data, id, ctxFor(data)).lodgmentKind).action, "Record lodgment", id);
    for (const id of SG_IDS) assert.equal(lodgmentWords(returnView(data, id, ctxFor(data)).lodgmentKind).action, "Record filing", id);
  });

  it("describes each governance mode in a sentence", () => {
    assert.deepEqual(GOVERNANCE_PHRASE, {
      "agent-lodges": "tax agent reviews and lodges",
      "agent-signs-off": "tax agent signs off; head of tax lodges",
      "no-agent": "no tax agent",
    });
    assert.equal(
      delegatedText("Tax agent", "agent-lodges"),
      "Recorded by the tax agent under this fund's governance (tax agent reviews and lodges).",
    );
    assert.equal(
      delegatedText("Head of Tax", "agent-signs-off"),
      "Recorded by the head of tax under this fund's governance (tax agent signs off; head of tax lodges).",
    );
  });
});

describe("readiness card", () => {
  it("reads Ready, Not ready, Lodged or Filed", () => {
    const base = { ready: true, lodgment: null, lodgmentKind: "return" } as const;
    assert.deepEqual(readinessChip(base, "Signed off"), { text: "Ready", tone: "good" });
    assert.deepEqual(readinessChip({ ...base, ready: false }, "In review"), { text: "Not ready", tone: "warn" });
    const lodgment = { fundId: "x", kind: "return", reference: "R", date: "2026-10-09", actor: "A" } as const;
    assert.deepEqual(readinessChip({ ready: false, lodgment, lodgmentKind: "return" }, "Signed off"), { text: "Lodged", tone: "good" });
    assert.deepEqual(readinessChip({ ready: true, lodgment: { ...lodgment, kind: "form-ut" }, lodgmentKind: "form-ut" }, "Signed off"), { text: "Filed", tone: "good" });
  });

  it("does not call a record lodged once the fund is no longer signed off", () => {
    const lodgment = { fundId: "x", kind: "return", reference: "R", date: "2026-10-09", actor: "A" } as const;
    for (const status of ["Preparing", "In review"] as const) {
      assert.deepEqual(readinessChip({ ready: false, lodgment, lodgmentKind: "return" }, status), { text: "Reopened after lodgment", tone: "warn" }, status);
      assert.deepEqual(readinessChip({ ready: false, lodgment: { ...lodgment, kind: "form-ut" }, lodgmentKind: "form-ut" }, status), { text: "Reopened after filing", tone: "warn" }, status);
    }
    // Without a record the status changes nothing about the chip.
    assert.deepEqual(readinessChip({ ready: false, lodgment: null, lodgmentKind: "return" }, "Preparing"), { text: "Not ready", tone: "warn" });
  });

  it("states each item in words", () => {
    const items = readinessItems([
      { id: "a", label: "First", detail: "Done detail", done: true },
      { id: "b", label: "Second", detail: "Open detail", done: false },
    ]);
    assert.deepEqual(items.map((i) => [i.id, i.state]), [["a", "Done"], ["b", "Outstanding"]]);
    assert.equal(items[1]?.detail, "Open detail");
  });

  it("matches the funds' readiness in the seed", () => {
    const data = freshData();
    const chips = Object.fromEntries(ALL_IDS.map((id) => [id, readinessChip(returnView(data, id, ctxFor(data)), fundOf(data, id).status).text]));
    assert.deepEqual(chips, {
      harbourline: "Ready",
      southbank: "Not ready",
      wattle: "Lodged",
      kurrajong: "Not ready",
      coastline: "Not ready",
      "telok-ayer": "Not ready",
      loyang: "Ready",
      meranti: "Not ready",
      kallang: "Not ready",
    });
  });
});

describe("lodgment section", () => {
  it("shows the record that exists, and lets only the person who may lodge replace it", () => {
    const data = freshData();
    assert.deepEqual(sectionFor(data, "wattle", "a-moreno"), {
      kind: "lodged",
      title: "Lodged with the ATO",
      summary: "9 Oct 2026 \u00b7 Receipt 418806221407",
      recordedBy: "Recorded by A. Moreno",
      canReplace: true,
    });
    const reviewer = sectionFor(data, "wattle", "l-brennan");
    assert.equal(reviewer.kind, "lodged");
    assert.equal(reviewer.kind === "lodged" && reviewer.canReplace, false);
  });

  it("offers the form to the head of tax on a signed-off fund that is ready", () => {
    const data = freshData();
    assert.deepEqual(sectionFor(data, "harbourline", "a-moreno"), { kind: "form", enabled: true, reason: null });
    assert.deepEqual(sectionFor(data, "loyang", "a-moreno"), { kind: "form", enabled: true, reason: null });
  });

  it("keeps the form switched off, with the reason, until the fund is ready", () => {
    const data = freshData();
    for (const [id, user] of [["coastline", "a-moreno"], ["kallang", "a-moreno"], ["telok-ayer", "a-moreno"], ["southbank", "d-harrow"]] as const) {
      assert.deepEqual(sectionFor(data, id, user), { kind: "form", enabled: false, reason: NOT_READY_REASON }, id);
    }
  });

  it("says who records lodgment when it is not the viewer", () => {
    const data = freshData();
    assert.deepEqual(sectionFor(data, "southbank", "a-moreno"), {
      kind: "delegated",
      text: "Recorded by the tax agent under this fund's governance (tax agent reviews and lodges).",
    });
    assert.deepEqual(sectionFor(data, "harbourline", "d-harrow"), {
      kind: "delegated",
      text: "Recorded by the head of tax under this fund's governance (tax agent signs off; head of tax lodges).",
    });
    assert.equal(sectionFor(data, "harbourline", "r-okafor").kind, "delegated");
    assert.equal(sectionFor(data, "coastline", "m-castillo").kind, "delegated");
  });

  it("asks for sign-off when the items are done but the fund is not signed off", () => {
    assert.deepEqual(
      lodgmentSection({ lodgment: null, kind: "return", status: "In review", mayLodge: true, canLodge: false, ready: true, lodgerRole: "Head of Tax", governance: "no-agent" }),
      { kind: "form", enabled: false, reason: NOT_SIGNED_OFF_REASON },
    );
    assert.equal(NOT_SIGNED_OFF_REASON, "Sign the fund off before recording lodgment.");
    assert.equal(NOT_READY_REASON, "Clear the outstanding items first.");
  });

  it("names the lodging role under every governance mode", () => {
    const data = freshData();
    const kinds = new Set(ALL_IDS.map((id) => sectionFor(data, id, "a-moreno").kind));
    assert.deepEqual([...kinds].sort(), ["delegated", "form", "lodged"]);
  });

  it("writes the lodged line as date and reference", () => {
    assert.equal(lodgedSummary({ date: "2026-10-09", reference: "Receipt 418806221407" }), "9 Oct 2026 \u00b7 Receipt 418806221407");
  });
});

describe("a fund reopened after it was lodged", () => {
  const LODGED = "9 Oct 2026 \u00b7 Receipt 418806221407";
  const AU_NOTE = "This fund was reopened after it was lodged. Sign it off again and lodge an amended return if any figure changes.";

  it("words what happened for an ATO return and for an IRAS Form UT", () => {
    assert.deepEqual(reopenedWords("return"), {
      title: "Previously lodged with the ATO",
      chip: "Reopened after lodgment",
      note: AU_NOTE,
      reason: "Sign the fund off before recording lodgment.",
    });
    assert.deepEqual(reopenedWords("form-ut"), {
      title: "Previously filed with IRAS",
      chip: "Reopened after filing",
      note: "This fund was reopened after it was filed. Sign it off again and file an amended Form UT if any figure changes.",
      reason: "Sign the fund off before recording the filing.",
    });
    assert.deepEqual(reopenedWords("aiir"), reopenedWords("return"));
  });

  it("is a record on a fund that is not signed off", () => {
    const record = { fundId: "x", kind: "return", reference: "R", date: "2026-10-09", actor: "A" } as const;
    assert.equal(reopenedAfterLodgment(record, "Signed off"), false);
    assert.equal(reopenedAfterLodgment(record, "Preparing"), true);
    assert.equal(reopenedAfterLodgment(record, "In review"), true);
    for (const status of ["Preparing", "In review", "Signed off"] as const) assert.equal(reopenedAfterLodgment(null, status), false, status);
  });

  it("keeps the record, shows it as history with the warning, and gives the person who may lodge a switched-off Replace record", () => {
    const data = run(freshData(), [["a-moreno", { type: "reopen", fundId: "wattle", reason: "Correcting signed-off inputs" }]]);
    assert.equal(fundOf(data, "wattle").status, "Preparing");
    assert.deepEqual(returnView(data, "wattle", ctxFor(data)).lodgment, { fundId: "wattle", kind: "return", reference: "Receipt 418806221407", date: "2026-10-09", actor: "A. Moreno" });
    assert.deepEqual(sectionFor(data, "wattle", "a-moreno"), {
      kind: "reopened",
      title: "Previously lodged with the ATO",
      summary: LODGED,
      recordedBy: "Recorded by A. Moreno",
      note: AU_NOTE,
      replaceReason: NOT_SIGNED_OFF_REASON,
    });
    assert.deepEqual(readinessChip(returnView(data, "wattle", ctxFor(data)), "Preparing"), { text: "Reopened after lodgment", tone: "warn" });
  });

  it("says the same to people who may not lodge, without a button they could never use", () => {
    const data = run(freshData(), [["a-moreno", { type: "reopen", fundId: "wattle", reason: "Correcting signed-off inputs" }]]);
    for (const user of ["l-brennan", "r-okafor", "m-castillo"]) {
      assert.deepEqual(
        sectionFor(data, "wattle", user),
        { kind: "reopened", title: "Previously lodged with the ATO", summary: LODGED, recordedBy: "Recorded by A. Moreno", note: AU_NOTE, replaceReason: null },
        user,
      );
    }
    // The same for the Head of Tax on a fund where the tax agent records lodgment.
    const record = { fundId: "southbank", kind: "return", reference: "Receipt 1", date: "2026-10-09", actor: "D. Harrow" } as const;
    const input = { lodgment: record, kind: "return", status: "Preparing", mayLodge: false, canLodge: false, ready: false, lodgerRole: "Tax agent", governance: "agent-lodges" } as const;
    const reopened = (replaceReason: string | null) => ({
      kind: "reopened",
      title: "Previously lodged with the ATO",
      summary: "9 Oct 2026 \u00b7 Receipt 1",
      recordedBy: "Recorded by D. Harrow",
      note: AU_NOTE,
      replaceReason,
    });
    assert.deepEqual(lodgmentSection(input), reopened(null));
    assert.deepEqual(lodgmentSection({ ...input, mayLodge: true }), reopened(NOT_SIGNED_OFF_REASON));
  });

  it("holds while the fund waits for review, and ends when it is signed off again", () => {
    let data = run(freshData(), [
      ["a-moreno", { type: "reopen", fundId: "wattle", reason: "Correcting signed-off inputs" }],
      ["r-okafor", { type: "submit", fundId: "wattle" }],
    ]);
    assert.equal(fundOf(data, "wattle").status, "In review");
    assert.equal(sectionFor(data, "wattle", "a-moreno").kind, "reopened");
    assert.deepEqual(readinessChip(returnView(data, "wattle", ctxFor(data)), "In review"), { text: "Reopened after lodgment", tone: "warn" });

    data = run(data, [
      ["l-brennan", { type: "approve", fundId: "wattle", level: "review" }],
      ["a-moreno", { type: "sign-off", fundId: "wattle" }],
    ]);
    assert.equal(fundOf(data, "wattle").status, "Signed off");
    assert.deepEqual(sectionFor(data, "wattle", "a-moreno"), {
      kind: "lodged",
      title: "Lodged with the ATO",
      summary: LODGED,
      recordedBy: "Recorded by A. Moreno",
      canReplace: true,
    });
    assert.deepEqual(readinessChip(returnView(data, "wattle", ctxFor(data)), "Signed off"), { text: "Lodged", tone: "good" });
  });

  it("words a Singapore filing as filed, with an amended Form UT", () => {
    const data = run(freshData(), [
      ["a-moreno", { type: "record-lodgment", fundId: "loyang", kind: "form-ut", reference: "Acknowledgement 2027-418806", date: "2026-10-12" }],
      ["a-moreno", { type: "reopen", fundId: "loyang", reason: "Correcting signed-off inputs" }],
    ]);
    assert.deepEqual(sectionFor(data, "loyang", "a-moreno"), {
      kind: "reopened",
      title: "Previously filed with IRAS",
      summary: "12 Oct 2026 \u00b7 Acknowledgement 2027-418806",
      recordedBy: "Recorded by A. Moreno",
      note: "This fund was reopened after it was filed. Sign it off again and file an amended Form UT if any figure changes.",
      replaceReason: "Sign the fund off before recording the filing.",
    });
  });

  it("is refused by the action, which is why nothing can replace the record meanwhile", () => {
    const data = run(freshData(), [["a-moreno", { type: "reopen", fundId: "wattle", reason: "Correcting signed-off inputs" }]]);
    const ctx = ctxFor(data, "a-moreno");
    assert.equal(workflowView(data, "wattle", ctx).can.lodge, false);
    const result = applyAction(data, { type: "record-lodgment", fundId: "wattle", kind: "return", reference: "Receipt 418806229999", date: "2026-10-12" }, ctx);
    assert.deepEqual(result, { ok: false, reason: "Sign the fund off before recording lodgment" });
  });

  it("leaves the signed-off presentation as it was", () => {
    const data = freshData();
    assert.deepEqual(sectionFor(data, "wattle", "a-moreno"), {
      kind: "lodged",
      title: "Lodged with the ATO",
      summary: LODGED,
      recordedBy: "Recorded by A. Moreno",
      canReplace: true,
    });
    for (const user of ["l-brennan", "r-okafor"]) {
      assert.deepEqual(
        sectionFor(data, "wattle", user),
        { kind: "lodged", title: "Lodged with the ATO", summary: LODGED, recordedBy: "Recorded by A. Moreno", canReplace: false },
        user,
      );
    }
  });
});

describe("recording lodgment", () => {
  it("records the reference and date, and the section and chip then show it", () => {
    const data = freshData();
    const ctx = ctxFor(data, "a-moreno");
    const view = returnView(data, "harbourline", ctx);
    const checked = checkLodgment({ reference: "  RCPT-418806221999  ", date: TODAY }, TODAY, view.referenceLabel);
    assert.ok(checked.ok);
    if (!checked.ok) return;
    const result = applyAction(data, { type: "record-lodgment", fundId: "harbourline", kind: view.lodgmentKind, reference: checked.reference, date: checked.date }, ctx);
    assert.ok(result.ok, result.ok ? "" : result.reason);
    if (!result.ok) return;
    const after = returnView(result.data, "harbourline", ctx);
    assert.equal(after.lodgment?.reference, "RCPT-418806221999");
    assert.equal(after.lodgment?.date, TODAY);
    assert.equal(readinessChip(after, "Signed off").text, "Lodged");
    const section = sectionFor(result.data, "harbourline", "a-moreno");
    assert.equal(section.kind === "lodged" && section.summary, "12 Oct 2026 \u00b7 RCPT-418806221999");
    assert.equal(section.kind === "lodged" && section.recordedBy, "Recorded by A. Moreno");
  });

  it("replaces the record when it is recorded again", () => {
    const data = freshData();
    const ctx = ctxFor(data, "a-moreno");
    const before = returnView(data, "wattle", ctx);
    assert.equal(before.lodgment?.reference, "Receipt 418806221407");
    const result = applyAction(data, { type: "record-lodgment", fundId: "wattle", kind: before.lodgmentKind, reference: "Receipt 418806229999", date: "2026-10-10" }, ctx);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(returnView(result.data, "wattle", ctx).lodgment?.reference, "Receipt 418806229999");
    assert.equal(result.data.lodgments.filter((l) => l.fundId === "wattle" && l.kind === before.lodgmentKind).length, 1);
    assert.equal(draftFromRecord(result.data, "wattle").reference, "Receipt 418806229999");
  });

  it("is refused by the action for a fund that is not signed off, which is why the form stays switched off", () => {
    const data = freshData();
    const ctx = ctxFor(data, "a-moreno");
    const view = returnView(data, "coastline", ctx);
    const result = applyAction(data, { type: "record-lodgment", fundId: "coastline", kind: view.lodgmentKind, reference: "ABC123", date: TODAY }, ctx);
    assert.equal(result.ok, false);
    assert.equal(workflowView(data, "coastline", ctx).can.lodge, false);
  });

  it("files an IRAS Form UT for a Singapore fund", () => {
    const data = freshData();
    const ctx = ctxFor(data, "a-moreno");
    const view = returnView(data, "loyang", ctx);
    assert.equal(view.lodgmentKind, "form-ut");
    const result = applyAction(data, { type: "record-lodgment", fundId: "loyang", kind: view.lodgmentKind, reference: "IRAS-2027-0001", date: TODAY }, ctx);
    assert.ok(result.ok, result.ok ? "" : result.reason);
    if (!result.ok) return;
    const section = sectionFor(result.data, "loyang", "a-moreno");
    assert.equal(section.kind === "lodged" && section.title, "Filed with IRAS");
    assert.equal(readinessChip(returnView(result.data, "loyang", ctx), "Signed off").text, "Filed");
  });
});

function draftFromRecord(data: AppData, id: string) {
  const view = returnView(data, id, ctxFor(data));
  return initialDraft(view.lodgment, TODAY);
}

describe("lodgment form", () => {
  it("starts empty with today's date, or with the existing record when correcting it", () => {
    assert.deepEqual(initialDraft(null, TODAY), { reference: "", date: TODAY });
    assert.deepEqual(initialDraft({ reference: "Receipt 1", date: "2026-10-09" }, TODAY), { reference: "Receipt 1", date: "2026-10-09" });
  });

  it("accepts a reference and a date and trims the reference", () => {
    assert.deepEqual(checkLodgment({ reference: "  Receipt 418806221407 ", date: "2026-10-09" }, TODAY, AU_LABEL), {
      ok: true,
      reference: "Receipt 418806221407",
      date: "2026-10-09",
    });
    assert.deepEqual(checkLodgment({ reference: "A-1_2/3.4:5 #6", date: TODAY }, TODAY, AU_LABEL), { ok: true, reference: "A-1_2/3.4:5 #6", date: TODAY });
  });

  it("asks for the reference by its market's name", () => {
    assert.deepEqual(checkLodgment({ reference: "", date: TODAY }, TODAY, AU_LABEL), { ok: false, errors: { reference: "Enter the ATO receipt reference." } });
    assert.deepEqual(checkLodgment({ reference: "   ", date: TODAY }, TODAY, SG_LABEL), { ok: false, errors: { reference: "Enter the IRAS acknowledgement reference." } });
    const data = freshData();
    assert.equal(returnView(data, "loyang", ctxFor(data)).referenceLabel, SG_LABEL);
    assert.equal(returnView(data, "harbourline", ctxFor(data)).referenceLabel, AU_LABEL);
  });

  it("bounds the length of the reference", () => {
    assert.equal(REFERENCE_MIN_LENGTH, 3);
    assert.equal(REFERENCE_MAX_LENGTH, 60);
    const length = (n: number) => checkLodgment({ reference: "A".repeat(n), date: TODAY }, TODAY, AU_LABEL);
    assert.deepEqual(length(2), { ok: false, errors: { reference: "The reference is too short. Use at least 3 characters." } });
    assert.equal(length(3).ok, true);
    assert.equal(length(60).ok, true);
    assert.deepEqual(length(61), { ok: false, errors: { reference: "The reference is too long. Use 60 characters or fewer." } });
    assert.equal(length(10_000).ok, false);
  });

  it("allows letters, numbers, spaces and - _ / . : # only", () => {
    for (const reference of ["ABC<script>", "ABC;DROP", "caf\u00e9 123", "ABC\u2014123", "A\nB\nC", "=SUM(A1)", "ABC\u0000"]) {
      assert.deepEqual(
        checkLodgment({ reference, date: TODAY }, TODAY, AU_LABEL),
        { ok: false, errors: { reference: "Use letters, numbers, spaces and - _ / . : # only." } },
        JSON.stringify(reference),
      );
    }
  });

  it("checks the date: present, real and not in the future", () => {
    const date = (value: string) => checkLodgment({ reference: "ABC123", date: value }, TODAY, AU_LABEL);
    assert.deepEqual(date(""), { ok: false, errors: { date: "Enter the date." } });
    for (const bad of ["2026-02-30", "2026-13-01", "2026-00-10", "0000-00-00", "12/10/2026", "2026-1-5", "2026-10-12T00:00", "tomorrow"]) {
      assert.deepEqual(date(bad), { ok: false, errors: { date: "Enter a valid date." } }, bad);
    }
    assert.deepEqual(date("2026-10-13"), { ok: false, errors: { date: "The date can't be in the future." } });
    assert.deepEqual(date("2099-01-01"), { ok: false, errors: { date: "The date can't be in the future." } });
    assert.equal(date(TODAY).ok, true);
    assert.equal(date("2026-10-11").ok, true);
    assert.equal(date("2020-02-29").ok, true);
  });

  it("reports both problems at once", () => {
    assert.deepEqual(checkLodgment({ reference: "", date: "" }, TODAY, AU_LABEL), {
      ok: false,
      errors: { reference: "Enter the ATO receipt reference.", date: "Enter the date." },
    });
  });

  it("recognises real calendar dates", () => {
    for (const ok of ["2026-02-28", "2028-02-29", "2026-12-31", "1999-01-01"]) assert.equal(isRealISODate(ok), true, ok);
    for (const bad of ["2026-02-29", "2026-04-31", "2026-06-31", "2026-02-30", "", "2026-10-12 ", "20261012", "2026-10-1"]) assert.equal(isRealISODate(bad), false, bad);
  });
});
