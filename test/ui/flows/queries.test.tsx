// Flow 5: Queries on Kurrajong. A reviewer raises a query, the tax agent answers it, the reviewer resolves it; the header, the tab badge and Bulk review follow every step.
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test test/ui/flows/queries.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { flatText } from "../dom.ts";
import { mountApp, type MountedApp } from "../harness.tsx";
import { expectSame } from "../same.ts";
import { announced } from "../shell.ts";
import { NOW_LOCAL, asUser, auditRows, bulkRow, dataOf, expectHeader, header, openTab, recordedSince } from "./support.ts";

const KURRAJONG = "kurrajong";
const NAME = "Kurrajong Stapled Property Trust";
const SEEDED = ["Register short by 1,250,000 units", "Cross-staple rent: NCMI or transitional?"];
const SUBJECT = "Foreign investor split for the stapled units";
const MESSAGE = "Please confirm how the foreign units divide between the trust and the company before we sign off.";
const REPLY = "The trust holds 70% of the foreign units and the company 30%; the register note is attached.";

interface Thread {
  subject: string;
  status: string;
  raised: string;
  messages: Array<{ by: string; text: string }>;
  buttons: string[];
}

/** The threads of the Queries tab as they are on screen, top to bottom. */
const threads = (app: MountedApp): Thread[] =>
  app.$$("article.rv-thread").map((article) => ({
    subject: flatText(article.querySelector(".rv-thread__title")!),
    status: flatText(article.querySelector(".rv-thread__head .tag")!),
    raised: flatText(article.querySelector(".rv-thread__meta")!),
    messages: Array.from(article.querySelectorAll("ol.rv-messages > li")).map((message) => ({
      by: flatText(message.querySelector(".rv-message__by")!),
      text: flatText(message.querySelector(".rv-message__text")!),
    })),
    buttons: Array.from(article.querySelectorAll(".rv-thread__actions button")).map((button) => button.getAttribute("aria-label") ?? flatText(button)),
  }));
const tabText = (app: MountedApp, name: RegExp): string => (app.byRole("tab", name).textContent ?? "").replace(/\s+/g, " ").trim();
const queriesOf = (app: MountedApp) => dataOf(app).queries.filter((query) => query.fundId === KURRAJONG);
const openCount = (app: MountedApp): number => queriesOf(app).filter((query) => query.status === "open").length;
const activeElement = (app: MountedApp): Element | null => app.container.ownerDocument.activeElement;

/** What the three places that count open queries say right now. */
async function counts(app: MountedApp): Promise<{ header: string | null; tab: string; bulk: string }> {
  const fromHeader = header(app).queries;
  const tab = tabText(app, /^Queries/);
  const hash = app.hash();
  await app.navigate("#/bulk-review");
  const bulk = bulkRow(app, NAME).queries;
  await app.navigate(hash);
  await openTab(app, /^Queries/);
  return { header: fromHeader?.text ?? null, tab, bulk };
}

describe("Queries on Kurrajong (two are open at the start)", () => {
  it("raises a query, answers it and resolves it, and the header, the tab badge and Bulk review count along", async () => {
    const app = await mountApp({ user: "l-brennan", hash: `#/?fund=${KURRAJONG}` });
    const seed = dataOf(app);
    assert.deepEqual(header(app).queries, { text: "2 open queries", href: "#/?fund=kurrajong&tab=queries" });
    assert.equal(tabText(app, /^Queries/), "Queries 2 open");
    expectHeader(app, KURRAJONG, "seed, L. Brennan");
    await openTab(app, /^Queries/);
    assert.deepEqual(
      threads(app).map((thread) => [thread.subject, thread.status, thread.buttons]),
      SEEDED.map((subject) => [subject, "Open", [`Reply to ${subject}`, `Resolve ${subject}`]]),
    );
    assert.deepEqual(await counts(app), { header: "2 open queries", tab: "Queries 2 open", bulk: "2" });

    // ------------------------------------------------------------------------------------------------ the form asks for both fields
    const untouched = dataOf(app);
    await app.click(app.byRole("button", "Raise query"));
    assert.match(app.text(), /Enter a subject/);
    expectSame(activeElement(app), app.byLabel("Subject"), "an empty subject takes the focus");
    await app.type(app.byLabel("Subject"), SUBJECT);
    assert.doesNotMatch(app.text(), /Enter a subject/, "the message goes as soon as the field is edited");
    await app.click(app.byRole("button", "Raise query"));
    assert.match(app.text(), /Enter a message/);
    expectSame(activeElement(app), app.byLabel("Message"), "an empty message takes the focus");
    assert.ok(dataOf(app) === untouched, "nothing was raised yet");

    // ------------------------------------------------------------------------------------------------ raise
    await app.type(app.byLabel("Message"), MESSAGE);
    await app.click(app.byRole("button", "Raise query"));
    assert.equal(announced(app), `Query raised: ${SUBJECT}.`);
    assert.deepEqual(recordedSince(seed, dataOf(app)), [{ fundId: KURRAJONG, at: NOW_LOCAL, actor: "L. Brennan", action: "Query raised", detail: SUBJECT }]);
    const raised = queriesOf(app).find((query) => query.subject === SUBJECT);
    assert.ok(raised, "the query is in the store");
    assert.deepEqual(
      { status: raised.status, raisedBy: raised.raisedBy, raisedAt: raised.raisedAt, messages: raised.messages },
      { status: "open", raisedBy: "L. Brennan", raisedAt: NOW_LOCAL, messages: [{ by: "L. Brennan", at: NOW_LOCAL, text: MESSAGE }] },
    );
    assert.equal((app.byLabel("Subject") as HTMLInputElement).value, "", "the form is empty again");
    assert.equal((app.byLabel("Message") as HTMLTextAreaElement).value, "");
    assert.deepEqual(
      threads(app).map((thread) => [thread.subject, thread.status]),
      [[SUBJECT, "Open"], ...SEEDED.map((subject) => [subject, "Open"])],
      "the newest thread is first",
    );
    assert.deepEqual(threads(app)[0]!.messages, [{ by: "L. Brennan", text: MESSAGE }]);
    assert.equal(threads(app)[0]!.raised, "Raised by L. Brennan · 12 Oct 2026, 09:00");
    expectHeader(app, KURRAJONG, "raised, L. Brennan");
    assert.deepEqual(await counts(app), { header: "3 open queries", tab: "Queries 3 open", bulk: "3" });

    // ------------------------------------------------------------------------------------------------ reply: the tax agent follows the header link
    await asUser(app, "d-harrow");
    await app.click(app.byRole("link", "3 open queries"));
    assert.equal(app.byRole("tab", /^Queries/).getAttribute("aria-selected"), "true", "the header link lands on the Queries tab");
    const beforeReply = dataOf(app);
    await app.click(app.byRole("button", `Reply to ${SUBJECT}`));
    await app.click(app.byRole("button", "Send reply"));
    assert.match(app.text(), /Enter a reply/);
    assert.ok(dataOf(app) === beforeReply, "an empty reply is not sent");
    await app.type(app.byLabel(new RegExp(`^Reply to ${SUBJECT}`)), REPLY);
    await app.click(app.byRole("button", "Send reply"));
    assert.equal(announced(app), `Reply sent on ${SUBJECT}.`);
    assert.deepEqual(recordedSince(beforeReply, dataOf(app)), [{ fundId: KURRAJONG, at: NOW_LOCAL, actor: "D. Harrow", action: "Query answered", detail: SUBJECT }]);
    assert.deepEqual(threads(app)[0]!.messages, [
      { by: "L. Brennan", text: MESSAGE },
      { by: "D. Harrow", text: REPLY },
    ]);
    assert.equal(threads(app)[0]!.status, "Open", "an answered query stays open until someone resolves it");
    assert.equal(openCount(app), 3);
    assert.deepEqual(await counts(app), { header: "3 open queries", tab: "Queries 3 open", bulk: "3" });

    // ------------------------------------------------------------------------------------------------ resolve
    await asUser(app, "l-brennan");
    const beforeResolve = dataOf(app);
    await app.click(app.byRole("button", `Resolve ${SUBJECT}`));
    assert.equal(announced(app), `Query resolved: ${SUBJECT}.`);
    assert.deepEqual(recordedSince(beforeResolve, dataOf(app)), [{ fundId: KURRAJONG, at: NOW_LOCAL, actor: "L. Brennan", action: "Query resolved", detail: SUBJECT }]);
    assert.deepEqual(
      threads(app).map((thread) => [thread.subject, thread.status, thread.buttons]),
      [[SUBJECT, "Resolved", []], ...SEEDED.map((subject) => [subject, "Open", [`Reply to ${subject}`, `Resolve ${subject}`]])],
    );
    assert.deepEqual(await counts(app), { header: "2 open queries", tab: "Queries 2 open", bulk: "2" });

    // A resolved query takes no more replies or resolutions.
    const thread = queriesOf(app).find((query) => query.subject === SUBJECT)!;
    assert.deepEqual(app.store.dispatch({ type: "reply-query", fundId: KURRAJONG, queryId: thread.id, message: "One more thing" }), { ok: false, reason: "This query is resolved" });
    assert.deepEqual(app.store.dispatch({ type: "resolve-query", fundId: KURRAJONG, queryId: thread.id }), { ok: false, reason: "This query is already resolved" });

    // ------------------------------------------------------------------------------------------------ the two that were open at the start
    for (const subject of SEEDED) await app.click(app.byRole("button", `Resolve ${subject}`));
    assert.equal(openCount(app), 0);
    assert.deepEqual(
      threads(app).map((candidate) => candidate.status),
      ["Resolved", "Resolved", "Resolved"],
    );
    assert.equal(header(app).queries, null, "no queries line in the header when none is open");
    assert.equal(tabText(app, /^Queries/), "Queries", "no badge on the tab when none is open");
    await app.navigate("#/bulk-review");
    assert.equal(bulkRow(app, NAME).queries, "0");
    assert.equal(bulkRow(app, NAME).next, "3 open exceptions", "exceptions are what is left to clear");

    // The audit trail has the whole conversation, newest first.
    await app.navigate(`#/?fund=${KURRAJONG}`);
    await openTab(app, /^Audit trail/);
    assert.deepEqual(
      auditRows(app)
        .slice(0, 5)
        .map((row) => `${row.action} · ${row.detail}`),
      [`Query resolved · ${SEEDED[1]}`, `Query resolved · ${SEEDED[0]}`, `Query resolved · ${SUBJECT}`, `Query answered · ${SUBJECT}`, `Query raised · ${SUBJECT}`],
    );
  });

  it("lets a persona who cannot raise queries read them, and refuses the persona who cannot see the fund", async () => {
    const app = await mountApp({ user: "m-castillo", hash: `#/?fund=${KURRAJONG}` });
    await openTab(app, /^Queries/);
    assert.match(app.text(), /You can read queries, but you don't have permission to raise or answer them\./);
    assert.deepEqual(
      threads(app).map((thread) => [thread.subject, thread.status, thread.buttons]),
      SEEDED.map((subject) => [subject, "Open", []]),
      "the threads are readable, with no Reply or Resolve",
    );
    assert.equal((app.byLabel("Subject") as HTMLInputElement).disabled, true);
    assert.equal((app.byLabel("Message") as HTMLTextAreaElement).disabled, true);
    assert.equal(app.byRole("button", "Raise query").getAttribute("aria-disabled") === "true" || (app.byRole("button", "Raise query") as HTMLButtonElement).disabled, true);
    const before = dataOf(app);
    assert.deepEqual(app.store.dispatch({ type: "raise-query", fundId: KURRAJONG, subject: SUBJECT, message: MESSAGE }), { ok: false, reason: "You don't have permission to raise or answer queries" });
    assert.ok(dataOf(app) === before);

    await asUser(app, "s-lim");
    assert.deepEqual(app.store.dispatch({ type: "raise-query", fundId: KURRAJONG, subject: SUBJECT, message: MESSAGE }), { ok: false, reason: "You don't have access to this fund" });
    assert.ok(dataOf(app) === before);
    assert.equal(openCount(app), 2);
  });
});
