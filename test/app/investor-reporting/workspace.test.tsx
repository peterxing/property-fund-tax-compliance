// The Investor reporting workspace for an Australian fund inside the whole app: the annual investment income report (AIIR) chip, checklist and
// lodgment section as each persona meets them, the record form saving through the store with its errors, its focus and the live region, the
// replace form that takes the place of a recorded lodgment, and what the panel says once the fund was reopened after the AIIR was lodged. Run
// with the esbuild loader like the other UI tests:
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test test/app/investor-reporting/workspace.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateLabel } from "../../../src/domain/format.ts";
import { investorView, toISODate, workflowView } from "../../../src/domain/index.ts";
import { ROLE_LABEL, can, lodgmentRole } from "../../../src/domain/permissions.ts";
import type { AuInvestorView } from "../../../src/domain/types.ts";
import { LODGMENT_GOVERNANCE, aiirCard, lodgmentSection, type LodgmentSection } from "../../../src/app/workspaces/investor-reporting/model.ts";
import { auditPage, expectClean } from "../../ui/audit.ts";
import { allByRole, flatText } from "../../ui/dom.ts";
import { clock, mountApp, type MountedApp } from "../../ui/harness.tsx";
import { PERSONAS, type Persona } from "../../ui/personas.ts";
import { expectNone, expectNotSame, expectSame } from "../../ui/same.ts";
import { announced, personaSelect } from "../../ui/shell.ts";
import { AU_IDS, ctxFor } from "./fixtures.ts";

// ---------------------------------------------------------------------------------------------------------------- helpers
const route = (fundId: string): string => `#/investor-reporting?fund=${fundId}`;

const dataOf = (app: MountedApp) => app.store.getState().data;
const now = () => new Date(clock.now.getTime());
const today = () => toISODate(now());
const fundIn = (app: MountedApp, id: string) => dataOf(app).funds.find((fund) => fund.id === id)!;
const aiirRecord = (app: MountedApp, fundId: string) => dataOf(app).lodgments.find((l) => l.fundId === fundId && l.kind === "aiir");
const aiirRecords = (app: MountedApp, fundId: string) => dataOf(app).lodgments.filter((l) => l.fundId === fundId && l.kind === "aiir");
const lodgedEntries = (app: MountedApp, fundId: string) => dataOf(app).audit.filter((e) => e.fundId === fundId && e.action === "AIIR lodged with the ATO");
const hasFund = (persona: Persona, fundId: string): boolean => persona.funds === "all" || persona.funds.includes(fundId);

/** What the selectors say for this persona and fund as the store stands now, put together the way the AIIR panel puts it together. */
function modelFor(app: MountedApp, fundId: string, userId: string) {
  const data = dataOf(app);
  const ctx = ctxFor(data, userId, now());
  const fund = fundIn(app, fundId);
  const view = investorView(data, fundId, ctx);
  assert.equal(view.market, "AU");
  const { aiir } = view as AuInvestorView;
  const section = lodgmentSection({
    lodgment: aiir.lodgment,
    status: fund.status,
    mayLodge: can(ctx.user, "lodge", fund, fund.governance),
    canLodge: workflowView(data, fundId, ctx).can.lodge,
    ready: aiir.ready,
    lodgerRole: ROLE_LABEL[lodgmentRole(fund.governance)],
    governance: LODGMENT_GOVERNANCE[fund.governance],
  });
  return { fund, card: aiirCard(aiir, fund.status), section };
}

const panel = (app: MountedApp): HTMLElement => app.byRole("region", "Annual investment income report");
const chip = (app: MountedApp): HTMLElement => panel(app).querySelector<HTMLElement>(".panel__actions .tag")!;
const chipText = (app: MountedApp): string => flatText(chip(app));
const chipTone = (app: MountedApp): string => (chip(app).classList.contains("tag--good") ? "good" : chip(app).classList.contains("tag--warn") ? "warn" : "other");
const headings = (app: MountedApp): string[] => allByRole(panel(app), "heading", { level: 4 }).map((h) => flatText(h));
const summaryLine = (app: MountedApp): string => flatText(panel(app).querySelector(".ir-lodged__summary")!);
const recordedBy = (app: MountedApp): string => flatText(panel(app).querySelector(".ir-lodged__by")!);
/** Each line of the AIIR checklist as what is checked and the state in words. */
const checklist = (app: MountedApp): string[][] =>
  Array.from(app.byRole("list", "What has to be done before the report is lodged").querySelectorAll("li")).map((li) => [
    flatText(li.querySelector("strong")!),
    flatText(li.querySelector(".tag")!),
  ]);
const form = (app: MountedApp): HTMLFormElement => app.byRole("form", "Record lodgment") as HTMLFormElement;
const isBlocked = (el: HTMLElement): boolean => el.getAttribute("aria-disabled") === "true";

const REPLACE = "Replace lodgment record";
const SAVE = "Save record";

const errorUnder = (app: MountedApp, label: string | RegExp): string | null => {
  const alert = app.byLabel(label).closest(".field")!.querySelector('[role="alert"]');
  return alert ? flatText(alert) : null;
};

/** The record form as a person meets it: are its two boxes and its button switched off, and what does it say about why. */
function formState(app: MountedApp) {
  const record = form(app);
  const button = allByRole(record, "button", { name: "Record lodgment" })[0]!;
  const reason = record.querySelector<HTMLElement>(".ir-reason");
  return {
    blocked: isBlocked(button),
    boxesDisabled: Array.from(record.querySelectorAll("input")).map((box) => box.disabled),
    reason: reason ? flatText(reason) : null,
    described: reason !== null && button.getAttribute("aria-describedby") === reason.id,
  };
}

/** Replace lodgment record as a person meets it: is it switched off, and what does it say about why. */
function replaceState(app: MountedApp) {
  const button = app.byRole("button", REPLACE);
  const reason = panel(app).querySelector<HTMLElement>(".ir-reason");
  return {
    blocked: isBlocked(button),
    reason: reason ? flatText(reason) : null,
    described: reason !== null && button.getAttribute("aria-describedby") === reason.id,
  };
}

/** The lodgment part of the panel read back from the page, against the section the model describes. */
function expectShows(app: MountedApp, section: LodgmentSection, where: string): void {
  const region = panel(app);
  if (section.kind !== "lodged" && section.kind !== "reopened") {
    expectNone(app.queryByRole("button", REPLACE), `${where}: nothing to replace yet`);
    expectNone(region.querySelector(".ir-lodged"), where);
  }
  if (section.kind === "delegated") {
    assert.deepEqual(headings(app), ["Lodgment"], where);
    assert.equal(flatText(region.querySelector(".ir-lodgment .ir-note")!), section.text, where);
    expectNone(region.querySelector("form"), where);
    return;
  }
  if (section.kind === "form") {
    assert.deepEqual(headings(app), ["Record lodgment"], where);
    const off = !section.enabled;
    assert.deepEqual(formState(app), { blocked: off, boxesDisabled: [off, off], reason: section.reason, described: section.reason !== null }, where);
    assert.deepEqual(allByRole(form(app), "button").map((button) => flatText(button)), ["Record lodgment"], `${where}: no way to cancel a first record`);
    return;
  }
  assert.equal(summaryLine(app), section.summary, where);
  assert.equal(recordedBy(app), section.recordedBy, where);
  expectNone(app.queryByRole("button", "Record lodgment"), `${where}: a first record is not asked for again`);
  expectNone(region.querySelector("form"), `${where}: the replace form waits for the button`);
  assert.deepEqual(headings(app), [section.title], where);
  if (section.kind === "lodged") {
    expectNone(region.querySelector(".ir-lodged--reopened"), where);
    expectNone(region.querySelector(".ir-reopened"), where);
    if (section.canReplace) assert.deepEqual(replaceState(app), { blocked: false, reason: null, described: false }, where);
    else expectNone(app.queryByRole("button", REPLACE), `${where}: not for this person`);
    return;
  }
  assert.equal(region.querySelectorAll(".ir-lodged--reopened").length, 1, where);
  assert.equal(flatText(region.querySelector(".banner--warn.ir-reopened")!), section.note, where);
  if (section.replaceReason === null) {
    expectNone(app.queryByRole("button", REPLACE), `${where}: not for this person`);
    expectNone(region.querySelector(".ir-reason"), where);
    return;
  }
  assert.deepEqual(replaceState(app), { blocked: true, reason: section.replaceReason, described: true }, where);
}

/** Presses a button of the fund header, the way a person does. */
/** Presses a button; "Reopen" also gives the reason its dialog asks for and confirms. */
async function press(app: MountedApp, label: string): Promise<void> {
  await app.click(app.byRole("button", label));
  if (label === "Reopen") {
    await app.type(app.byLabel("Reason") as HTMLTextAreaElement, "Correcting signed-off inputs");
    await app.click(app.$(".dialog__footer .btn--primary"));
  }
}

const REFERENCE = /^ATO receipt reference$/;

/** Fills the two boxes of the open form. */
async function fill(app: MountedApp, reference: string, date?: string): Promise<void> {
  await app.type(app.byLabel(REFERENCE), reference);
  if (date !== undefined) await app.type(app.byLabel("Date"), date);
}

// What the seed data must give these people on these funds, so that the sweeps below cannot pass by comparing a page with nothing.
const SEED_SECTIONS: Record<string, LodgmentSection["kind"]> = {
  "a-moreno/wattle": "lodged",
  "l-brennan/wattle": "lodged",
  "a-moreno/harbourline": "form",
  "d-harrow/harbourline": "delegated",
  "a-moreno/southbank": "delegated",
  "d-harrow/southbank": "form",
  "a-moreno/coastline": "form",
  "r-okafor/coastline": "delegated",
};

// ---------------------------------------------------------------------------------------------------------------- what is shown, for everyone
describe("the AIIR panel for every persona and Australian fund", () => {
  for (const persona of PERSONAS) {
    const funds = AU_IDS.filter((id) => hasFund(persona, id));
    if (funds.length === 0) continue;
    it(`shows ${persona.name} the chip, the checklist and the lodgment section the model gives`, async () => {
      for (const id of funds) {
        const app = await mountApp({ hash: route(id), user: persona.id });
        const { fund, card, section } = modelFor(app, id, persona.id);
        const where = `${persona.name} on ${id}`;

        assert.equal(app.$("h2").textContent?.trim(), fund.name, where);
        assert.deepEqual([chipText(app), chipTone(app)], [card.chip.text, card.chip.tone], where);
        assert.deepEqual(
          checklist(app),
          card.items.map((item) => [item.label, item.state]),
          where,
        );
        const expected = SEED_SECTIONS[`${persona.id}/${id}`];
        if (expected !== undefined) assert.equal(section.kind, expected, where);
        expectShows(app, section, where);
        await app.unmount();
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------- recording a lodgment
describe("recording an AIIR lodgment", () => {
  it("asks for what is missing after the first attempt, then follows the person's corrections", async () => {
    const app = await mountApp({ hash: route("harbourline"), user: "a-moreno" });
    assert.equal(aiirRecord(app, "harbourline"), undefined);
    const record = form(app);
    assert.equal((app.byLabel("Date") as HTMLInputElement).value, today());
    assert.equal((app.byLabel(REFERENCE) as HTMLInputElement).placeholder, "Receipt 418806117352");
    assert.equal(errorUnder(app, REFERENCE), null, "no error before the first attempt");

    await app.click(app.byRole("button", "Record lodgment"));
    assert.equal(errorUnder(app, REFERENCE), "Enter the ATO receipt reference.");
    expectSame(document.activeElement, app.byLabel(REFERENCE), "focus goes to the first box with a problem");
    assert.equal(aiirRecord(app, "harbourline"), undefined);
    assert.equal(record.isConnected, true);

    await fill(app, "R!");
    assert.equal(errorUnder(app, REFERENCE), "The reference is too short. Use at least 3 characters.");
    await fill(app, "Receipt <1>");
    assert.equal(errorUnder(app, REFERENCE), "Use letters, numbers, spaces and - _ / . : # only.");
    await fill(app, "Receipt 418806117352", "2099-01-01");
    assert.equal(errorUnder(app, REFERENCE), null);
    assert.equal(errorUnder(app, "Date"), "The date can't be in the future.");

    await app.click(app.byRole("button", "Record lodgment"));
    expectSame(document.activeElement, app.byLabel("Date"), "focus goes to the box with the problem");
    assert.equal(aiirRecord(app, "harbourline"), undefined);
    await app.type(app.byLabel("Date"), "");
    assert.equal(errorUnder(app, "Date"), "Enter the date lodged.");
    expectClean(auditPage(app.container), "Investor reporting with the form showing its errors");
  });

  it("saves the record, shows what was lodged, announces it and puts focus on the new heading", async () => {
    const app = await mountApp({ hash: route("harbourline"), user: "a-moreno" });
    await fill(app, "  Receipt 418806555001  ");
    await app.click(app.byRole("button", "Record lodgment"));

    const saved = aiirRecord(app, "harbourline");
    assert.deepEqual({ reference: saved?.reference, date: saved?.date, kind: saved?.kind, actor: saved?.actor }, { reference: "Receipt 418806555001", date: today(), kind: "aiir", actor: "A. Moreno" });
    assert.equal(dataOf(app).lodgments.filter((l) => l.fundId === "harbourline" && l.kind === "aiir").length, 1);
    expectNone(app.queryByRole("form"), "it should not be on the page");
    assert.deepEqual([chipText(app), chipTone(app)], ["Lodged", "good"]);
    assert.deepEqual(headings(app), ["Lodged with the ATO"]);
    expectSame(document.activeElement, app.byRole("heading", { name: "Lodged with the ATO", level: 4 }), "focus follows the form into the summary");
    assert.equal(summaryLine(app), `${dateLabel(today())} · Receipt 418806555001`);
    assert.equal(recordedBy(app), "Recorded by A. Moreno");
    assert.equal(announced(app), "Harbourline Office Trust: AIIR lodgment recorded, Receipt 418806555001.");
    assert.deepEqual(replaceState(app), { blocked: false, reason: null, described: false }, "the record can be replaced from here on");
    expectClean(auditPage(app.container), "Investor reporting once the AIIR is lodged");
  });

  it("keeps the record after the person visits another workspace and comes back", async () => {
    const app = await mountApp({ hash: route("harbourline"), user: "a-moreno" });
    await fill(app, "Receipt 418806555001");
    await app.click(app.byRole("button", "Record lodgment"));
    await app.navigate("#/trial-balance?fund=harbourline");
    await app.navigate(route("harbourline"));
    assert.equal(summaryLine(app), `${dateLabel(today())} · Receipt 418806555001`);
    assert.equal(chipText(app), "Lodged");
  });

  it("keeps the form switched off while the AIIR is not ready, and records nothing", async () => {
    const app = await mountApp({ hash: route("coastline"), user: "a-moreno" });
    assert.deepEqual(formState(app), { blocked: true, boxesDisabled: [true, true], reason: "Clear the outstanding items first.", described: true });
    await app.click(app.byRole("button", "Record lodgment"));
    await app.act(() => form(app).requestSubmit());
    assert.equal(aiirRecord(app, "coastline"), undefined);
    assert.equal(errorUnder(app, REFERENCE), null, "a switched-off form checks nothing");
  });

  it("gives the person who does not record lodgment under this governance a sentence instead of a form", async () => {
    const app = await mountApp({ hash: route("southbank"), user: "a-moreno" });
    assert.deepEqual(headings(app), ["Lodgment"]);
    assert.equal(flatText(panel(app).querySelector(".ir-lodgment .ir-note")!), "Recorded by the tax agent under this fund's governance (tax agent reviews and lodges).");
    expectNone(app.queryByRole("form"), "it should not be on the page");
    await app.select(personaSelect(app), "d-harrow");
    assert.deepEqual(headings(app), ["Record lodgment"]);
    expectNone(panel(app).querySelector(".ir-lodgment .ir-note"), "no sentence beside the form");
  });
});

// ---------------------------------------------------------------------------------------------------------------- reopened after it was lodged
const REOPENED_NOTE = "This fund was reopened after the AIIR was lodged. Sign it off again and lodge an updated AIIR if any figure changes.";
const SIGN_OFF_FIRST = "Sign the fund off before recording lodgment.";
const WATTLE_LINE = "2 Oct 2026 · Receipt 418806117352";

describe("an AIIR lodged before the fund was reopened", () => {
  it("keeps the signed-off presentation as it was", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    assert.deepEqual([chipText(app), chipTone(app)], ["Lodged", "good"]);
    assert.deepEqual(headings(app), ["Lodged with the ATO"]);
    assert.equal(summaryLine(app), WATTLE_LINE);
    assert.equal(recordedBy(app), "Recorded by A. Moreno");
    expectNone(app.maybe(".ir-reopened"), "no warning while the fund is signed off");
    expectNone(app.queryByRole("form"), "it should not be on the page");
    assert.deepEqual(replaceState(app), { blocked: false, reason: null, described: false }, "the person who records lodgment may replace the record");
    assert.deepEqual(
      checklist(app).filter(([label]) => label === "Distribution signed off"),
      [["Distribution signed off", "Done"]],
    );
    expectClean(auditPage(app.container), "Investor reporting of a signed-off fund with its AIIR lodged");
  });

  it("keeps the record as history, warns that the fund was reopened, and switches Replace lodgment record off", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    const record = aiirRecord(app, "wattle")!;

    await press(app, "Reopen");
    assert.equal(fundIn(app, "wattle").status, "Preparing");
    assert.deepEqual(aiirRecord(app, "wattle"), record, "the record is a historical fact and stays");

    assert.deepEqual([chipText(app), chipTone(app)], ["Reopened after lodgment", "warn"]);
    assert.deepEqual(headings(app), ["Previously lodged with the ATO"]);
    expectNone(app.queryByRole("heading", { name: "Lodged with the ATO", level: 4 }), "the plain heading is gone");
    assert.equal(flatText(panel(app).querySelector(".ir-lodged--reopened .ir-lodged__summary")!), WATTLE_LINE);
    assert.equal(recordedBy(app), "Recorded by A. Moreno");
    assert.equal(flatText(app.$(".banner--warn.ir-reopened")), REOPENED_NOTE);
    assert.deepEqual(
      checklist(app).filter(([label]) => label === "Distribution signed off"),
      [["Distribution signed off", "Outstanding"]],
    );

    assert.deepEqual(replaceState(app), { blocked: true, reason: SIGN_OFF_FIRST, described: true });
    expectNone(app.queryByRole("form"), "no form to fill in until the fund is signed off again");
    expectNone(app.queryByRole("button", "Record lodgment"), "and no first record to make");
    await app.click(app.byRole("button", REPLACE));
    expectNone(app.queryByRole("form"), "pressing the switched-off button opens nothing");
    assert.deepEqual(aiirRecord(app, "wattle"), record, "a switched-off control replaces nothing");
    expectClean(auditPage(app.container), "Investor reporting of a fund reopened after its AIIR was lodged");
  });

  it("tells everyone who can open the fund the same, and gives Replace lodgment record only to the person who records lodgment", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    await press(app, "Reopen");
    const withReplace: string[] = [];
    for (const persona of PERSONAS.filter((p) => hasFund(p, "wattle"))) {
      await app.select(personaSelect(app), persona.id);
      assert.equal(app.ui().currentUserId, persona.id);
      const { card, section } = modelFor(app, "wattle", persona.id);
      assert.equal(section.kind, "reopened", persona.name);
      assert.deepEqual([chipText(app), chipTone(app)], [card.chip.text, card.chip.tone], persona.name);
      assert.equal(chipText(app), "Reopened after lodgment", persona.name);
      assert.equal(summaryLine(app), WATTLE_LINE, persona.name);
      assert.equal(flatText(app.$(".ir-reopened")), REOPENED_NOTE, persona.name);
      expectShows(app, section, persona.name);
      if (app.queryByRole("button", REPLACE) !== null) withReplace.push(persona.id);
    }
    assert.deepEqual(withReplace, ["a-moreno"]);

    await app.select(personaSelect(app), "l-brennan");
    assert.deepEqual(headings(app), ["Previously lodged with the ATO"]);
    expectNone(app.queryByRole("button", REPLACE), "a button nobody here could use");
    expectNone(app.maybe(".ir-reason"), "and no reason for it");
    expectClean(auditPage(app.container), "Investor reporting of a reopened fund, as someone who does not record lodgment");
  });

  it("goes back to the plain presentation when the fund is signed off again", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    const record = aiirRecord(app, "wattle")!;

    await press(app, "Reopen");
    assert.equal(chipText(app), "Reopened after lodgment");

    await app.select(personaSelect(app), "r-okafor");
    await press(app, "Submit for review");
    assert.equal(fundIn(app, "wattle").status, "In review");
    assert.equal(chipText(app), "Reopened after lodgment", "still reopened while the fund waits for review");
    assert.equal(flatText(app.$(".ir-reopened")), REOPENED_NOTE);

    await app.select(personaSelect(app), "l-brennan");
    await press(app, "Approve as reviewer");
    assert.equal(chipText(app), "Reopened after lodgment", "approved, and still not signed off");

    await app.select(personaSelect(app), "a-moreno");
    await press(app, "Sign off");
    assert.equal(fundIn(app, "wattle").status, "Signed off");
    assert.deepEqual([chipText(app), chipTone(app)], ["Lodged", "good"]);
    assert.deepEqual(headings(app), ["Lodged with the ATO"]);
    assert.equal(summaryLine(app), WATTLE_LINE);
    expectNone(app.maybe(".ir-reopened"), "the warning goes with the reopening");
    expectNone(app.maybe(".ir-lodged--reopened"), "and so does the history styling");
    assert.deepEqual(aiirRecord(app, "wattle"), record, "signing off again does not touch the record");
    assert.deepEqual(
      checklist(app).filter(([label]) => label === "Distribution signed off"),
      [["Distribution signed off", "Done"]],
    );
  });

  it("treats a record made on this page the same way, also after a reload", async () => {
    const app = await mountApp({ hash: route("harbourline"), user: "a-moreno" });
    await fill(app, "Receipt 418806555001");
    await app.click(app.byRole("button", "Record lodgment"));
    assert.equal(chipText(app), "Lodged");
    const record = aiirRecord(app, "harbourline");

    await press(app, "Reopen");
    assert.deepEqual(aiirRecord(app, "harbourline"), record);
    assert.deepEqual([chipText(app), chipTone(app)], ["Reopened after lodgment", "warn"]);
    assert.equal(summaryLine(app), `${dateLabel(today())} · Receipt 418806555001`);
    assert.equal(flatText(app.$(".ir-reopened")), REOPENED_NOTE);

    const { storage } = app;
    await app.unmount();
    const reloaded = await mountApp({ storage, hash: route("harbourline") });
    assert.deepEqual([chipText(reloaded), chipTone(reloaded)], ["Reopened after lodgment", "warn"]);
    assert.equal(summaryLine(reloaded), `${dateLabel(today())} · Receipt 418806555001`);
    assert.deepEqual(replaceState(reloaded), { blocked: true, reason: SIGN_OFF_FIRST, described: true });
  });

  it("does not pull focus into the summary that comes back when the fund is signed off again", async () => {
    const app = await mountApp({ hash: route("harbourline"), user: "a-moreno" });
    await fill(app, "Receipt 418806555001");
    await app.click(app.byRole("button", "Record lodgment"));
    expectSame(document.activeElement, app.byRole("heading", { name: "Lodged with the ATO", level: 4 }), "focus follows the form into the summary the first time");

    await press(app, "Reopen");
    assert.deepEqual(headings(app), ["Previously lodged with the ATO"]);
    await app.select(personaSelect(app), "r-okafor");
    await press(app, "Submit for review");
    await app.select(personaSelect(app), "l-brennan");
    await press(app, "Approve as reviewer");
    await app.select(personaSelect(app), "d-harrow");
    await press(app, "Approve as tax agent");
    await app.select(personaSelect(app), "a-moreno");
    await press(app, "Sign off");

    assert.equal(fundIn(app, "harbourline").status, "Signed off");
    assert.deepEqual([chipText(app), chipTone(app)], ["Lodged", "good"]);
    expectNotSame(document.activeElement, app.byRole("heading", { name: "Lodged with the ATO", level: 4 }), "the summary came back by itself, so focus stays where it was");
  });

  it("leaves the published notice alone: it records what was sent, whatever happened to the fund since", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    const bar = () => flatText(app.$(".ir-bar"));
    assert.match(bar(), /Published 21 Aug 2026 — locked/);
    await press(app, "Reopen");
    assert.match(bar(), /Published 21 Aug 2026 — locked/);
    assert.equal(app.allByRole("button", "Download PDF").length, 1, "the notice can still be downloaded");
  });
});

// ---------------------------------------------------------------------------------------------------------------- replacing a recorded lodgment
const NEXT_REFERENCE = "Receipt 418806999999";

describe("replacing an AIIR lodgment record", () => {
  it("opens a form that starts from the record, with focus in it, and Cancel puts everything back", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    const record = aiirRecord(app, "wattle")!;
    const entries = lodgedEntries(app, "wattle").length;
    assert.deepEqual(replaceState(app), { blocked: false, reason: null, described: false });
    expectNone(app.queryByRole("form"), "the form waits for the button");

    await app.click(app.byRole("button", REPLACE));
    const replace = app.byRole("form", REPLACE);
    expectNone(app.queryByRole("button", REPLACE), "the button gives way to the form");
    expectNone(app.queryByRole("form", "Record lodgment"), "it is not the first-record form");
    assert.equal((app.byLabel(REFERENCE) as HTMLInputElement).value, "Receipt 418806117352");
    assert.equal((app.byLabel("Date") as HTMLInputElement).value, "2026-10-02");
    expectSame(document.activeElement, app.byLabel(REFERENCE), "focus goes to the first box");
    assert.deepEqual(
      allByRole(replace, "button").map((button) => flatText(button)),
      [SAVE, "Cancel"],
    );
    assert.deepEqual(headings(app), ["Lodged with the ATO"]);
    assert.equal(summaryLine(app), WATTLE_LINE, "the record stays on show while it is replaced");
    expectClean(auditPage(app.container), "Investor reporting with the replace form open");

    await app.type(app.byLabel(REFERENCE), NEXT_REFERENCE);
    await app.click(app.byRole("button", "Cancel"));
    expectNone(app.queryByRole("form"), "Cancel closes the form");
    expectSame(document.activeElement, app.byRole("button", REPLACE), "and puts focus back on the button that opened it");
    assert.deepEqual(aiirRecord(app, "wattle"), record, "nothing was replaced");
    assert.equal(lodgedEntries(app, "wattle").length, entries, "and nothing was audited");

    await app.click(app.byRole("button", REPLACE));
    assert.equal((app.byLabel(REFERENCE) as HTMLInputElement).value, "Receipt 418806117352", "what was typed before Cancel is not kept");
  });

  it("checks the replacement the way it checks a first record", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    const record = aiirRecord(app, "wattle")!;
    const entries = lodgedEntries(app, "wattle").length;
    await app.click(app.byRole("button", REPLACE));
    assert.equal(errorUnder(app, REFERENCE), null, "no error before the first attempt");

    await app.type(app.byLabel(REFERENCE), "");
    await app.click(app.byRole("button", SAVE));
    assert.equal(errorUnder(app, REFERENCE), "Enter the ATO receipt reference.");
    expectSame(document.activeElement, app.byLabel(REFERENCE), "focus goes to the first box with a problem");

    await fill(app, "R!");
    assert.equal(errorUnder(app, REFERENCE), "The reference is too short. Use at least 3 characters.");
    await fill(app, NEXT_REFERENCE, "2099-01-01");
    assert.equal(errorUnder(app, REFERENCE), null);
    assert.equal(errorUnder(app, "Date"), "The date can't be in the future.");
    await app.click(app.byRole("button", SAVE));
    expectSame(document.activeElement, app.byLabel("Date"), "focus goes to the box with the problem");
    await app.type(app.byLabel("Date"), "");
    assert.equal(errorUnder(app, "Date"), "Enter the date lodged.");

    assert.deepEqual(aiirRecord(app, "wattle"), record, "nothing was replaced");
    assert.equal(lodgedEntries(app, "wattle").length, entries, "and nothing was audited");
    expectNone(app.queryByRole("button", REPLACE), "the form is still open");
    assert.equal(app.byRole("form", REPLACE).isConnected, true);
    expectClean(auditPage(app.container), "Investor reporting with the replace form showing its errors");
  });

  it("saves the replacement in place of the record, audits and announces it, and puts focus on the heading", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    const returnRecord = dataOf(app).lodgments.find((l) => l.fundId === "wattle" && l.kind === "return");
    assert.ok(returnRecord, "Wattle has its own tax return record, which is not this one");
    const entries = lodgedEntries(app, "wattle").length;

    await app.click(app.byRole("button", REPLACE));
    await fill(app, `  ${NEXT_REFERENCE}  `, "2026-10-10");
    await app.click(app.byRole("button", SAVE));

    assert.deepEqual(aiirRecords(app, "wattle"), [{ fundId: "wattle", kind: "aiir", reference: NEXT_REFERENCE, date: "2026-10-10", actor: "A. Moreno" }]);
    assert.deepEqual(
      dataOf(app).lodgments.find((l) => l.fundId === "wattle" && l.kind === "return"),
      returnRecord,
      "the tax return's record is left alone",
    );
    const audited = lodgedEntries(app, "wattle");
    assert.equal(audited.length, entries + 1);
    assert.ok(audited.some((entry) => entry.actor === "A. Moreno" && entry.detail === `Reference ${NEXT_REFERENCE}, 2026-10-10`));
    expectNone(app.queryByRole("form"), "the form is gone");
    assert.deepEqual([chipText(app), chipTone(app)], ["Lodged", "good"]);
    assert.deepEqual(headings(app), ["Lodged with the ATO"]);
    assert.equal(summaryLine(app), `10 Oct 2026 · ${NEXT_REFERENCE}`);
    assert.equal(recordedBy(app), "Recorded by A. Moreno");
    expectSame(document.activeElement, app.byRole("heading", { name: "Lodged with the ATO", level: 4 }), "focus follows the form into the summary");
    assert.equal(announced(app), `Wattle Retail Property Trust: AIIR lodgment record replaced, ${NEXT_REFERENCE}.`);
    assert.deepEqual(replaceState(app), { blocked: false, reason: null, described: false }, "and it can be replaced again");
    expectClean(auditPage(app.container), "Investor reporting once the AIIR lodgment record is replaced");

    await app.navigate("#/trial-balance?fund=wattle");
    await app.navigate(route("wattle"));
    assert.equal(summaryLine(app), `10 Oct 2026 · ${NEXT_REFERENCE}`, "the replacement is still there after another workspace");

    const { storage } = app;
    await app.unmount();
    const reloaded = await mountApp({ storage, hash: route("wattle") });
    assert.equal(summaryLine(reloaded), `10 Oct 2026 · ${NEXT_REFERENCE}`, "and after a reload");
  });

  it("replaces a record made on this page, saying which it did each time", async () => {
    const app = await mountApp({ hash: route("harbourline"), user: "a-moreno" });
    await fill(app, "Receipt 418806555001");
    await app.click(app.byRole("button", "Record lodgment"));
    assert.equal(announced(app), "Harbourline Office Trust: AIIR lodgment recorded, Receipt 418806555001.");

    await app.click(app.byRole("button", REPLACE));
    assert.equal((app.byLabel(REFERENCE) as HTMLInputElement).value, "Receipt 418806555001");
    assert.equal((app.byLabel("Date") as HTMLInputElement).value, today());
    await fill(app, "Receipt 418806555002");
    await app.click(app.byRole("button", SAVE));

    assert.deepEqual(
      aiirRecords(app, "harbourline").map((l) => [l.reference, l.date, l.actor]),
      [["Receipt 418806555002", today(), "A. Moreno"]],
    );
    assert.equal(lodgedEntries(app, "harbourline").length, 2, "each save is audited");
    assert.equal(summaryLine(app), `${dateLabel(today())} · Receipt 418806555002`);
    assert.equal(announced(app), "Harbourline Office Trust: AIIR lodgment record replaced, Receipt 418806555002.");
    expectSame(document.activeElement, app.byRole("heading", { name: "Lodged with the ATO", level: 4 }), "focus follows the form into the summary");
  });

  it("belongs to the tax agent, not the Head of Tax, where the tax agent lodges", async () => {
    const app = await mountApp({ hash: route("southbank"), user: "l-brennan" });
    await press(app, "Approve as reviewer");
    await app.select(personaSelect(app), "d-harrow");
    await press(app, "Approve as tax agent");
    await app.select(personaSelect(app), "a-moreno");
    await press(app, "Sign off");
    assert.equal(fundIn(app, "southbank").status, "Signed off");

    await app.select(personaSelect(app), "d-harrow");
    await fill(app, "Receipt 418806555777", "2026-10-11");
    await app.click(app.byRole("button", "Record lodgment"));
    assert.deepEqual(replaceState(app), { blocked: false, reason: null, described: false });

    await app.click(app.byRole("button", REPLACE));
    await fill(app, "Receipt 418806555888");
    await app.click(app.byRole("button", SAVE));
    assert.deepEqual(
      aiirRecords(app, "southbank").map((l) => [l.reference, l.date, l.actor]),
      [["Receipt 418806555888", "2026-10-11", "D. Harrow"]],
    );
    assert.equal(announced(app), `${fundIn(app, "southbank").name}: AIIR lodgment record replaced, Receipt 418806555888.`);

    const seen: string[] = [];
    for (const persona of PERSONAS.filter((p) => hasFund(p, "southbank"))) {
      await app.select(personaSelect(app), persona.id);
      const { section } = modelFor(app, "southbank", persona.id);
      assert.equal(section.kind, "lodged", persona.name);
      expectShows(app, section, persona.name);
      if (app.queryByRole("button", REPLACE) !== null) seen.push(persona.id);
    }
    assert.deepEqual(seen, ["d-harrow"]);
  });

  it("closes the form when the fund is reopened, and leaves it closed when the fund is signed off again", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    const record = aiirRecord(app, "wattle")!;
    await app.click(app.byRole("button", REPLACE));
    await app.type(app.byLabel(REFERENCE), NEXT_REFERENCE);

    await press(app, "Reopen");
    expectNone(app.queryByRole("form"), "the form goes with the sign-off");
    assert.deepEqual(replaceState(app), { blocked: true, reason: SIGN_OFF_FIRST, described: true });
    assert.deepEqual(aiirRecord(app, "wattle"), record, "nothing was replaced");

    await app.select(personaSelect(app), "r-okafor");
    await press(app, "Submit for review");
    await app.select(personaSelect(app), "l-brennan");
    await press(app, "Approve as reviewer");
    await app.select(personaSelect(app), "a-moreno");
    await press(app, "Sign off");

    assert.equal(fundIn(app, "wattle").status, "Signed off");
    expectNone(app.queryByRole("form"), "the form does not come back by itself");
    assert.deepEqual(replaceState(app), { blocked: false, reason: null, described: false });
    assert.deepEqual(aiirRecord(app, "wattle"), record);
    expectNotSame(document.activeElement, app.byRole("heading", { name: "Lodged with the ATO", level: 4 }), "focus stays where it was");
    expectNotSame(document.activeElement, app.byRole("button", REPLACE), "and does not jump to the button either");
  });

  it("closes the form when someone who may not replace the record is picked, and does not bring it back with the first person", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    await app.click(app.byRole("button", REPLACE));
    assert.equal(app.byRole("form", REPLACE).isConnected, true);

    await app.select(personaSelect(app), "l-brennan");
    expectNone(app.queryByRole("form"), "no form for someone who may not replace the record");
    expectNone(app.queryByRole("button", REPLACE), "and no button");

    await app.select(personaSelect(app), "a-moreno");
    expectNone(app.queryByRole("form"), "the form has not been waiting");
    assert.deepEqual(replaceState(app), { blocked: false, reason: null, described: false });
  });
});
