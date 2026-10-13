// The Tax returns workspace inside the whole app: the readiness checklist and the lodgment section as each persona meets them on each fund, and
// the record form saving through the store with its errors, its focus and the live region. Run with the esbuild loader like the other UI tests:
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test test/app/tax-returns/workspace.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateLabel } from "../../../src/domain/format.ts";
import { returnView, toISODate, workflowView } from "../../../src/domain/index.ts";
import type { Lodgment } from "../../../src/domain/types.ts";
import { lodgmentSectionFor, lodgmentWords, readinessChip, readinessItems, recordedMessage } from "../../../src/app/workspaces/tax-returns/model.ts";
import { auditPage, expectClean } from "../../ui/audit.ts";
import { flatText } from "../../ui/dom.ts";
import { clock, mountApp, type MountedApp } from "../../ui/harness.tsx";
import { FUNDS, PERSONAS } from "../../ui/personas.ts";
import { expectNone, expectSame } from "../../ui/same.ts";
import { announced, personaSelect } from "../../ui/shell.ts";

// ---------------------------------------------------------------------------------------------------------------- helpers
const route = (fundId: string): string => `#/tax-returns?fund=${fundId}`;

const dataOf = (app: MountedApp) => app.store.getState().data;
const now = () => new Date(clock.now.getTime());
const today = () => toISODate(now());
const fundIn = (app: MountedApp, id: string) => dataOf(app).funds.find((fund) => fund.id === id)!;
/** The record of one kind for a fund (a fund can hold an AIIR record besides the one for its return). */
const lodgmentOf = (app: MountedApp, fundId: string, kind: Lodgment["kind"] = "return") => dataOf(app).lodgments.find((l) => l.fundId === fundId && l.kind === kind);

/** What the selectors say for this persona and fund as the store stands now. */
function modelFor(app: MountedApp, fundId: string, userId: string) {
  const data = dataOf(app);
  const ctx = { user: data.users.find((u) => u.id === userId)!, now: now() };
  const fund = fundIn(app, fundId);
  const view = returnView(data, fundId, ctx);
  const workflow = workflowView(data, fundId, ctx);
  return { fund, view, section: lodgmentSectionFor({ user: ctx.user, fund, view, workflow }) };
}

const chipText = (app: MountedApp): string => flatText(app.$(".ret-chip"));
/** Each readiness line as its three parts: what is checked, the detail under it, and the state in words. */
const checklist = (app: MountedApp): string[][] =>
  Array.from(app.byRole("list", "Readiness checks").querySelectorAll("li")).map((li) => [
    flatText(li.querySelector(".ret-item__label")!),
    flatText(li.querySelector(".ret-item__detail")!),
    flatText(li.querySelector(".tag")!),
  ]);
const form = (app: MountedApp, name: string | RegExp): HTMLFormElement => app.byRole("form", name) as HTMLFormElement;
const isBlocked = (el: HTMLElement): boolean => el.getAttribute("aria-disabled") === "true";

const errorUnder = (app: MountedApp, label: string | RegExp): string | null => {
  const alert = app.byLabel(label).closest(".field")!.querySelector('[role="alert"]');
  return alert ? flatText(alert) : null;
};

const REFERENCE = /^ATO receipt reference$/;

/** Fills the two boxes of the open form. */
async function fill(app: MountedApp, label: string | RegExp, reference: string, date?: string): Promise<void> {
  await app.type(app.byLabel(label), reference);
  if (date !== undefined) await app.type(app.byLabel("Date"), date);
}

// ---------------------------------------------------------------------------------------------------------------- what is shown, for everyone
describe("the Tax returns workspace for every persona and fund", () => {
  for (const persona of PERSONAS) {
    it(`shows ${persona.name} the checklist and the lodgment section the workflow gives`, async () => {
      const funds = FUNDS.filter((fund) => persona.funds === "all" || persona.funds.includes(fund.id));
      for (const { id } of funds) {
        const app = await mountApp({ hash: route(id), user: persona.id });
        const { view, section } = modelFor(app, id, persona.id);
        const where = `${persona.name} on ${id}`;

        assert.equal(app.$("h2").textContent?.trim(), fundIn(app, id).name, where);
        assert.deepEqual(
          app.allByRole("heading", { level: 3 }).map((h) => flatText(h)),
          [view.title, "Working papers"],
          where,
        );
        assert.equal(chipText(app), readinessChip(view, fundIn(app, id).status).text, where);
        assert.equal(flatText(app.$(".ret-due")), view.dueLabel, where);
        assert.deepEqual(
          checklist(app),
          readinessItems(view.items).map((item) => [item.label, item.detail, item.state]),
          where,
        );

        const words = lodgmentWords(view.lodgmentKind);
        if (section.kind === "lodged") {
          assert.equal(flatText(app.byRole("heading", { name: section.title, level: 4 })), section.title, where);
          assert.match(app.text(), new RegExp(section.summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), where);
          assert.match(app.text(), new RegExp(section.recordedBy), where);
          assert.equal(app.queryByRole("button", "Replace record") !== null, section.canReplace, where);
          expectNone(app.queryByRole("form"), where);
        } else if (section.kind === "reopened") {
          assert.equal(flatText(app.byRole("heading", { name: section.title, level: 4 })), section.title, where);
          assert.equal(flatText(app.$(".ret-lodged--reopened .ret-lodged__summary")), section.summary, where);
          assert.equal(flatText(app.$(".ret-reopened")), section.note, where);
          assert.equal(app.queryByRole("button", "Replace record") !== null, section.replaceReason !== null, where);
          expectNone(app.queryByRole("form"), where);
        } else if (section.kind === "delegated") {
          assert.match(flatText(app.$(".ret-lodgment")), new RegExp(section.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), where);
          expectNone(app.queryByRole("form"), where);
          expectNone(app.queryByRole("button", words.action), where);
        } else {
          const record = form(app, words.action);
          assert.equal(isBlocked(app.byRole("button", words.action)), !section.enabled, where);
          assert.equal(record.querySelector("input:not([type=date])")!.hasAttribute("disabled"), !section.enabled, where);
          if (section.reason === null) expectNone(app.maybe(".ret-reason"), where);
          else assert.equal(flatText(app.$(".ret-reason")), section.reason, where);
        }
        await app.unmount();
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------- recording a lodgment
describe("recording a lodgment", () => {
  it("asks for what is missing after the first attempt, then follows the person's corrections", async () => {
    const app = await mountApp({ hash: route("harbourline"), user: "a-moreno" });
    assert.equal(lodgmentOf(app, "harbourline"), undefined);
    const record = form(app, "Record lodgment");
    assert.equal((app.byLabel("Date") as HTMLInputElement).value, today());
    assert.equal((app.byLabel(REFERENCE) as HTMLInputElement).placeholder, "e.g. Receipt 418806117352");
    assert.equal(errorUnder(app, REFERENCE), null, "no error before the first attempt");

    await app.click(app.byRole("button", "Record lodgment"));
    assert.equal(errorUnder(app, REFERENCE), "Enter the ATO receipt reference.");
    expectSame(document.activeElement, app.byLabel(REFERENCE), "focus goes to the first box with a problem");
    assert.equal(lodgmentOf(app, "harbourline"), undefined);
    assert.equal(record.isConnected, true);

    await fill(app, REFERENCE, "R!");
    assert.equal(errorUnder(app, REFERENCE), "The reference is too short. Use at least 3 characters.");
    await fill(app, REFERENCE, "Receipt <1>");
    assert.equal(errorUnder(app, REFERENCE), "Use letters, numbers, spaces and - _ / . : # only.");
    await fill(app, REFERENCE, "Receipt 418806117352", "2099-01-01");
    assert.equal(errorUnder(app, REFERENCE), null);
    assert.equal(errorUnder(app, "Date"), "The date can't be in the future.");

    await app.click(app.byRole("button", "Record lodgment"));
    expectSame(document.activeElement, app.byLabel("Date"), "focus");
    assert.equal(lodgmentOf(app, "harbourline"), undefined);
    await app.type(app.byLabel("Date"), "");
    assert.equal(errorUnder(app, "Date"), "Enter the date.");
    expectClean(auditPage(app.container), "Tax returns with the form showing its errors");
  });

  it("saves the record, shows what was lodged, announces it and puts focus on the new heading", async () => {
    const app = await mountApp({ hash: route("harbourline"), user: "a-moreno" });
    await fill(app, REFERENCE, "  Receipt 418806117352  ");
    await app.click(app.byRole("button", "Record lodgment"));

    assert.deepEqual(
      { reference: lodgmentOf(app, "harbourline")?.reference, date: lodgmentOf(app, "harbourline")?.date, kind: lodgmentOf(app, "harbourline")?.kind },
      { reference: "Receipt 418806117352", date: today(), kind: "return" },
    );
    expectNone(app.queryByRole("form"), "it should not be on the page");
    assert.equal(chipText(app), "Lodged");
    const heading = app.byRole("heading", { name: "Lodged with the ATO", level: 4 });
    expectSame(document.activeElement, heading, "focus follows the form into the summary");
    assert.match(app.text(), new RegExp(`${dateLabel(today())} · Receipt 418806117352`));
    assert.match(app.text(), /Recorded by A\. Moreno/);
    assert.equal(announced(app), recordedMessage(fundIn(app, "harbourline").name, "return", "Receipt 418806117352"));
    expectClean(auditPage(app.container), "Tax returns once lodged");
  });

  it("lets the person who recorded it replace the record, and cancelling puts focus back on the button", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    const first = lodgmentOf(app, "wattle")!;
    assert.match(app.text(), /9 Oct 2026 · Receipt 418806221407/);
    assert.match(app.text(), /Recorded by A\. Moreno/);

    await app.click(app.byRole("button", "Replace record"));
    expectNone(app.queryByRole("button", "Replace record"), "it should not be on the page");
    const replacing = form(app, "Replace the lodgment record");
    assert.equal((app.byLabel(REFERENCE) as HTMLInputElement).value, first.reference);
    assert.equal((app.byLabel("Date") as HTMLInputElement).value, first.date);
    expectSame(document.activeElement, app.byLabel(REFERENCE), "focus");
    expectClean(auditPage(app.container), "Tax returns while replacing the record");

    await app.click(app.byRole("button", "Cancel"));
    assert.equal(replacing.isConnected, false);
    expectSame(document.activeElement, app.byRole("button", "Replace record"), "focus");
    assert.deepEqual(lodgmentOf(app, "wattle"), first);

    await app.click(app.byRole("button", "Replace record"));
    await fill(app, REFERENCE, "Receipt 418806999999", "2026-10-10");
    await app.click(app.byRole("button", "Save record"));
    assert.equal(lodgmentOf(app, "wattle")?.reference, "Receipt 418806999999");
    assert.equal(lodgmentOf(app, "wattle")?.date, "2026-10-10");
    assert.equal(dataOf(app).lodgments.filter((l) => l.fundId === "wattle" && l.kind === "return").length, 1, "one return record per fund");
    assert.match(app.text(), /10 Oct 2026 · Receipt 418806999999/);
    expectSame(document.activeElement, app.byRole("heading", { name: "Lodged with the ATO", level: 4 }), "focus");
    assert.equal(announced(app), recordedMessage(fundIn(app, "wattle").name, "return", "Receipt 418806999999"));
  });

  it("shows a reviewer the record but no way to replace it", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "l-brennan" });
    assert.match(app.text(), /9 Oct 2026 · Receipt 418806221407/);
    expectNone(app.queryByRole("button", "Replace record"), "it should not be on the page");
    expectNone(app.queryByRole("form"), "it should not be on the page");
  });

  it("keeps the record after the person visits another workspace and comes back", async () => {
    const app = await mountApp({ hash: route("harbourline"), user: "a-moreno" });
    await fill(app, REFERENCE, "Receipt 418806117352");
    await app.click(app.byRole("button", "Record lodgment"));
    await app.navigate("#/trial-balance?fund=harbourline");
    await app.navigate(route("harbourline"));
    assert.match(app.text(), /Receipt 418806117352/);
    assert.equal(chipText(app), "Lodged");
  });
});

// ---------------------------------------------------------------------------------------------------------------- reopened after it was lodged
const REOPENED_NOTE = "This fund was reopened after it was lodged. Sign it off again and lodge an amended return if any figure changes.";

/** Presses a button of the fund header, the way a person does. */
const press = (app: MountedApp, label: string): Promise<void> => app.click(app.byRole("button", label));
const chipTone = (app: MountedApp): string => (app.$(".ret-chip").classList.contains("tag--good") ? "good" : app.$(".ret-chip").classList.contains("tag--warn") ? "warn" : "other");
const lodgedLine = (app: MountedApp): string => flatText(app.$(".ret-lodged--reopened .ret-lodged__summary"));

describe("a fund reopened after it was lodged", () => {
  it("keeps the record as history, warns that the fund was reopened, and switches Replace record off", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    const record = lodgmentOf(app, "wattle")!;

    assert.deepEqual([chipText(app), chipTone(app)], ["Lodged", "good"]);
    assert.equal(isBlocked(app.byRole("button", "Replace record")), false);
    expectNone(app.maybe(".ret-reopened"), "no warning while the fund is signed off");

    await press(app, "Reopen");
    assert.equal(fundIn(app, "wattle").status, "Preparing");
    assert.deepEqual(lodgmentOf(app, "wattle"), record, "the record is a historical fact and stays");

    assert.deepEqual([chipText(app), chipTone(app)], ["Reopened after lodgment", "warn"]);
    assert.equal(flatText(app.byRole("heading", { name: "Previously lodged with the ATO", level: 4 })), "Previously lodged with the ATO");
    expectNone(app.queryByRole("heading", { name: "Lodged with the ATO", level: 4 }), "the plain heading is gone");
    assert.equal(lodgedLine(app), "9 Oct 2026 · Receipt 418806221407");
    assert.equal(flatText(app.$(".ret-lodged--reopened .ret-lodged__by")), "Recorded by A. Moreno");
    assert.equal(flatText(app.$(".banner--warn.ret-reopened")), REOPENED_NOTE);
    assert.deepEqual(
      checklist(app).filter(([label]) => label === "Distribution signed off").map(([, , state]) => state),
      ["Outstanding"],
    );

    const replace = app.byRole("button", "Replace record");
    assert.equal(isBlocked(replace), true);
    assert.equal(replace.getAttribute("aria-describedby"), app.$(".ret-reason").id);
    assert.equal(flatText(app.$(".ret-reason")), "Sign the fund off before recording lodgment.");
    expectNone(app.queryByRole("form"), "there is no form to record or replace a lodgment");

    await app.click(replace);
    expectNone(app.queryByRole("form"), "a switched-off button opens nothing");
    assert.deepEqual(lodgmentOf(app, "wattle"), record);
    expectClean(auditPage(app.container), "Tax returns of a fund reopened after it was lodged");
  });

  it("tells everyone else the same, and shows nobody a button they could never use", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    await press(app, "Reopen");
    for (const userId of ["l-brennan", "r-okafor", "m-castillo"]) {
      await app.select(personaSelect(app), userId);
      assert.equal(app.ui().currentUserId, userId);
      assert.equal(chipText(app), "Reopened after lodgment", userId);
      assert.equal(lodgedLine(app), "9 Oct 2026 · Receipt 418806221407", userId);
      assert.equal(flatText(app.$(".ret-reopened")), REOPENED_NOTE, userId);
      expectNone(app.queryByRole("button", "Replace record"), userId);
      expectNone(app.maybe(".ret-reason"), userId);
      expectNone(app.queryByRole("form"), userId);
    }
  });

  it("goes back to the plain presentation when the fund is signed off again, and then the record can be amended", async () => {
    const app = await mountApp({ hash: route("wattle"), user: "a-moreno" });
    const record = lodgmentOf(app, "wattle")!;

    await app.click(app.byRole("button", "Replace record"));
    form(app, "Replace the lodgment record");
    await press(app, "Reopen");
    expectNone(app.queryByRole("form"), "an open replace form goes when the fund is reopened");
    assert.equal(chipText(app), "Reopened after lodgment");

    await app.select(personaSelect(app), "r-okafor");
    await press(app, "Submit for review");
    assert.equal(fundIn(app, "wattle").status, "In review");
    assert.equal(chipText(app), "Reopened after lodgment", "still reopened while the fund waits for review");
    assert.equal(flatText(app.$(".ret-reopened")), REOPENED_NOTE);

    await app.select(personaSelect(app), "l-brennan");
    await press(app, "Approve as reviewer");
    assert.equal(chipText(app), "Reopened after lodgment", "approved, and still not signed off");

    await app.select(personaSelect(app), "a-moreno");
    await press(app, "Sign off");
    assert.equal(fundIn(app, "wattle").status, "Signed off");
    assert.deepEqual([chipText(app), chipTone(app)], ["Lodged", "good"]);
    assert.equal(flatText(app.byRole("heading", { name: "Lodged with the ATO", level: 4 })), "Lodged with the ATO");
    expectNone(app.maybe(".ret-reopened"), "the warning goes with the reopening");
    expectNone(app.queryByRole("form"), "and the replace form that was open does not come back by itself");
    assert.equal(isBlocked(app.byRole("button", "Replace record")), false);
    assert.deepEqual(lodgmentOf(app, "wattle"), record, "signing off again does not touch the record");

    await app.click(app.byRole("button", "Replace record"));
    await fill(app, REFERENCE, "Receipt 418806229999", "2026-10-12");
    await app.click(app.byRole("button", "Save record"));
    assert.deepEqual(
      dataOf(app).lodgments.filter((l) => l.fundId === "wattle" && l.kind === "return").map((l) => [l.reference, l.date, l.actor]),
      [["Receipt 418806229999", "2026-10-12", "A. Moreno"]],
    );
    assert.match(app.text(), /12 Oct 2026 · Receipt 418806229999/);
  });

  it("treats a record made on this page the same way, also after a reload", async () => {
    const app = await mountApp({ hash: route("harbourline"), user: "a-moreno" });
    await fill(app, REFERENCE, "Receipt 418806117352");
    await app.click(app.byRole("button", "Record lodgment"));
    assert.equal(chipText(app), "Lodged");
    const record = lodgmentOf(app, "harbourline");

    await press(app, "Reopen");
    assert.deepEqual(lodgmentOf(app, "harbourline"), record);
    assert.deepEqual([chipText(app), chipTone(app)], ["Reopened after lodgment", "warn"]);
    assert.equal(lodgedLine(app), `${dateLabel(today())} · Receipt 418806117352`);
    assert.equal(flatText(app.$(".ret-reopened")), REOPENED_NOTE);

    const { storage } = app;
    await app.unmount();
    const reloaded = await mountApp({ storage, hash: route("harbourline") });
    assert.equal(chipText(reloaded), "Reopened after lodgment");
    assert.equal(lodgedLine(reloaded), `${dateLabel(today())} · Receipt 418806117352`);
    assert.equal(isBlocked(reloaded.byRole("button", "Replace record")), true);
    expectNone(reloaded.queryByRole("form"), "no form on the reloaded page either");
    await reloaded.unmount();
  });

  it("words a Singapore filing the same way, with an amended Form UT", async () => {
    const app = await mountApp({ hash: route("loyang"), user: "a-moreno" });
    await app.type(app.byLabel("IRAS acknowledgement reference"), "Acknowledgement 2027-418806");
    await app.click(app.byRole("button", "Record filing"));
    assert.equal(chipText(app), "Filed");

    await press(app, "Reopen");
    assert.deepEqual([chipText(app), chipTone(app)], ["Reopened after filing", "warn"]);
    assert.equal(flatText(app.byRole("heading", { name: "Previously filed with IRAS", level: 4 })), "Previously filed with IRAS");
    expectNone(app.queryByRole("heading", { name: "Filed with IRAS", level: 4 }), "the plain heading is gone");
    assert.equal(lodgedLine(app), `${dateLabel(today())} · Acknowledgement 2027-418806`);
    assert.equal(
      flatText(app.$(".ret-reopened")),
      "This fund was reopened after it was filed. Sign it off again and file an amended Form UT if any figure changes.",
    );
    assert.equal(isBlocked(app.byRole("button", "Replace record")), true);
    assert.equal(flatText(app.$(".ret-reason")), "Sign the fund off before recording the filing.");
    expectNone(app.queryByRole("form"), "no form while the fund is not signed off");
  });
});

// ---------------------------------------------------------------------------------------------------------------- the form that cannot be used yet
describe("a lodgment that cannot be recorded yet", () => {
  it("keeps the form switched off, and says why beside it", async () => {
    const app = await mountApp({ hash: route("southbank"), user: "d-harrow" });
    assert.equal(chipText(app), "Not ready");
    assert.equal(checklist(app).some(([, , state]) => state === "Outstanding"), true);

    const button = app.byRole("button", "Record lodgment");
    assert.equal(isBlocked(button), true);
    assert.equal(button.getAttribute("aria-describedby"), app.$(".ret-reason").id);
    assert.equal(flatText(app.$(".ret-reason")), "Clear the outstanding items first.");
    assert.equal((app.byLabel(REFERENCE) as HTMLInputElement).disabled, true);
    assert.equal((app.byLabel("Date") as HTMLInputElement).disabled, true);

    await app.click(button);
    assert.equal(lodgmentOf(app, "southbank"), undefined);
    expectNone(form(app, "Record lodgment").querySelector('[role="alert"]'), "no error shows for a form that is switched off");
  });

  it("tells the person whose role does not record it who does", async () => {
    const app = await mountApp({ hash: route("southbank"), user: "a-moreno" });
    expectNone(app.queryByRole("form"), "it should not be on the page");
    assert.match(app.text(), /Recorded by the tax agent under this fund's governance \(tax agent reviews and lodges\)\./);
    assert.equal(app.queryByRole("heading", { name: "Record lodgment", level: 4 }) !== null, true);
  });
});

// ---------------------------------------------------------------------------------------------------------------- Singapore
describe("the Singapore filing", () => {
  it("is called a filing, and records the IRAS acknowledgement", async () => {
    const app = await mountApp({ hash: route("loyang"), user: "a-moreno" });
    const { view } = modelFor(app, "loyang", "a-moreno");
    assert.equal(view.lodgmentKind, "form-ut");
    assert.equal(chipText(app), "Ready");

    form(app, "Record filing");
    assert.equal((app.byLabel("IRAS acknowledgement reference") as HTMLInputElement).placeholder, "e.g. Acknowledgement 2027-418806");
    await app.click(app.byRole("button", "Record filing"));
    assert.equal(errorUnder(app, "IRAS acknowledgement reference"), "Enter the IRAS acknowledgement reference.");

    await app.type(app.byLabel("IRAS acknowledgement reference"), "Acknowledgement 2027-418806");
    await app.click(app.byRole("button", "Record filing"));
    assert.equal(lodgmentOf(app, "loyang", "form-ut")?.kind, "form-ut");
    assert.equal(chipText(app), "Filed");
    expectSame(document.activeElement, app.byRole("heading", { name: "Filed with IRAS", level: 4 }), "focus");
    assert.match(app.text(), new RegExp(`${dateLabel(today())} · Acknowledgement 2027-418806`));
    assert.equal(announced(app), recordedMessage(fundIn(app, "loyang").name, "form-ut", "Acknowledgement 2027-418806"));
  });
});

// ---------------------------------------------------------------------------------------------------------------- working papers
describe("the working papers", () => {
  it("shows the document behind the return, with the download beside it", async () => {
    const app = await mountApp({ hash: route("harbourline"), user: "a-moreno" });
    const { view } = modelFor(app, "harbourline", "a-moreno");
    const papers = app.byRole("region", "Working papers");
    assert.equal(papers.querySelector("button")?.textContent?.trim(), "Download PDF");
    assert.match(flatText(papers), new RegExp(view.papers.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(
      app.allByRole("heading", { level: 4 }).length > 1,
      true,
      "the document's own headings sit under the panel's",
    );
  });
});
