// Flow 6: persona isolation. Every persona sees only the funds they were given, on every route; a deep link to a fund they cannot see falls
// back to the first fund they can see; the store refuses what the pages would not offer; and the view-only persona is offered nothing that
// changes data (found by scanning every button, box, list and field on every route).
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test test/ui/flows/persona-isolation.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Action, Fund } from "../../../src/domain/index.ts";
import { accessibleName, flatText, isNotRendered, roleOf } from "../dom.ts";
import { expectFundPage } from "../expect.ts";
import { mountApp, type MountedApp } from "../harness.tsx";
import { hashFor, oracle, type Oracle } from "../oracle.ts";
import { FUNDS, PERSONAS } from "../personas.ts";
import { ROUTES } from "../routes.ts";
import { navLinks, railNames, toasts } from "../shell.ts";
import { bulkTable, dataOf, tableRows } from "./support.ts";

const FUND_ROUTES = ROUTES.filter((route) => route.scope === "fund");
const NO_ACCESS = "You don't have access to this fund";
const READ_ONLY_NOTE = "This page is read-only for you. Only a Head of Tax can change who sees which funds or how a fund is governed.";

const USERS_CAPTION = "Users, their roles and the funds they can see";
const GOVERNANCE_CAPTION = "How each fund is governed: who approves it before sign-off and who records lodgment";

const hiddenFrom = (view: Oracle): Array<(typeof FUNDS)[number]> => FUNDS.filter((fund) => !view.funds.some((visible) => visible.id === fund.id));

function tableByCaption(app: MountedApp, caption: string): HTMLElement {
  const table = app.$$("table").find((candidate) => flatText(candidate.querySelector("caption") ?? candidate) === caption);
  assert.ok(table, `a table captioned "${caption}"`);
  return table;
}

const column = (table: Element, index: number): string[] => tableRows(table).map((cells) => cells[index]!);

const isOff = (el: Element): boolean => el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true" || (el as HTMLInputElement).readOnly === true;

/** The ids in every `fund=` of a link on the page. */
const linkedFundIds = (app: MountedApp): string[] =>
  app.$$("a[href]").flatMap((link) => {
    const match = /[?&]fund=([^&]+)/.exec(link.getAttribute("href") ?? "");
    return match ? [match[1]!] : [];
  });

describe("persona isolation", () => {
  it("every persona sees exactly their own funds on every route, and none of the others", async () => {
    for (const persona of PERSONAS) {
      const view = oracle(persona.id);
      const seen = view.funds.map((fund) => fund.name);
      const seenIds = view.funds.map((fund) => fund.id);
      const hidden = hiddenFrom(view);
      assert.equal(seen.length + hidden.length, FUNDS.length, `${persona.name}: the nine funds split into seen and hidden`);

      const app = await mountApp({ user: persona.id, hash: "#/" });
      for (const route of ROUTES) {
        const where = `${persona.name} · ${route.label}`;
        await app.navigate(route.hash);

        if (route.scope === "fund") {
          const open = app.ui().selectedFundId;
          assert.ok(seenIds.includes(open ?? ""), `${where}: the open fund (${open}) is one the persona can see`);
          expectFundPage(app, route.path, route.label, view, open, "all", where);
          assert.deepEqual(railNames(app), seen, `${where}: the rail lists the visible funds and nothing else`);
        } else if (route.path === "/bulk-review") {
          assert.deepEqual(
            bulkTable(app).map((row) => row.name),
            seen,
            `${where}: the table lists the visible funds`,
          );
        } else if (route.path === "/analytics") {
          assert.deepEqual(column(tableByCaption(app, "Tax leakage by fund"), 0), seen, `${where}: leakage by fund`);
          assert.deepEqual(column(tableByCaption(app, "Distribution mix by fund, as a percentage of the distribution"), 0), seen, `${where}: mix by fund`);
          const deadlineFunds = new Set(column(tableByCaption(app, "Filing and notice deadlines by fund"), 1));
          assert.ok([...deadlineFunds].every((name) => seen.includes(name)), `${where}: deadlines belong to visible funds (${[...deadlineFunds].join("; ")})`);
          const scenario = app.byLabel("Fund") as HTMLSelectElement;
          assert.deepEqual(
            Array.from(scenario.options).map((option) => option.textContent),
            seen,
            `${where}: the scenario can be run for the visible funds only`,
          );
        } else if (route.path === "/access") {
          // Access is the directory of every user and every fund: it is not scoped to the persona (accessView lists data.funds).
          const governance = tableRows(tableByCaption(app, GOVERNANCE_CAPTION)).map((cells) => cells[0]!.replace(/^(Australia|Singapore) /, ""));
          assert.deepEqual(
            governance,
            FUNDS.map((fund) => fund.name),
            `${where}: every fund is listed`,
          );
          const users = tableRows(tableByCaption(app, USERS_CAPTION));
          assert.equal(users.length, PERSONAS.length, `${where}: every user is listed`);
          const current = users.filter((cells) => /working as/.test(cells[0]!));
          assert.equal(current.length, 1, `${where}: one row says who you are working as`);
          assert.ok(current[0]![0]!.startsWith(persona.name), `${where}: it is the persona's own row`);
          const manager = persona.role === "head-of-tax";
          const changeFunds = app.$$("button").filter((button) => /^Change funds/.test(accessibleName(button)) && !isOff(button));
          const governanceSelects = app.$$("select").filter((select) => /^Governance for /.test(accessibleName(select)) && !isOff(select));
          assert.equal(changeFunds.length, manager ? PERSONAS.length : 0, `${where}: who may change which funds a user sees`);
          assert.equal(governanceSelects.length, manager ? 6 : 0, `${where}: who may change how a fund is governed (not the three signed-off funds)`);
          assert.equal(app.flat().includes(READ_ONLY_NOTE), !manager, `${where}: the read-only note is for everyone but the Head of Tax`);
          continue;
        }

        // Nothing about a fund the persona cannot see: no name, no link to it, no way to pick it.
        const text = app.flat();
        for (const fund of hidden) assert.ok(!text.includes(fund.name), `${where}: "${fund.name}" must not appear`);
        for (const id of linkedFundIds(app)) assert.ok(seenIds.includes(id), `${where}: a link to ${id}, which the persona cannot see`);
        for (const option of app.$$("option")) {
          assert.ok(!hidden.some((fund) => fund.id === (option as HTMLOptionElement).value), `${where}: a list offers ${(option as HTMLOptionElement).value}`);
        }
      }
      await app.unmount();
    }
  });

  it("a deep link to a fund the persona cannot see opens the first fund they can see instead, on every fund workspace", async () => {
    for (const persona of PERSONAS) {
      const view = oracle(persona.id);
      const first = view.funds[0]!;
      const second = view.funds[1]!;
      const hidden = hiddenFrom(view);
      const app = await mountApp({ user: persona.id, hash: `#/?fund=${second.id}` });
      assert.equal(app.ui().selectedFundId, second.id, `${persona.name}: starts on their second fund`);

      const attempts = [...hidden.map((fund) => fund.id), "no-such-fund"];
      for (const [index, fundId] of attempts.entries()) {
        const route = FUND_ROUTES[index % FUND_ROUTES.length]!;
        const where = `${persona.name}: ${route.hash}?fund=${fundId}`;
        await app.navigate(`${route.hash}?fund=${fundId}`);
        assert.equal(app.hash(), hashFor(route.path, { fund: first.id }), `${where}: the hash is rewritten`);
        assert.equal(app.ui().selectedFundId, first.id, `${where}: the first visible fund is open, not the one they were on`);
        expectFundPage(app, route.path, route.label, view, first.id, "all", where);
        assert.deepEqual(toasts(app), [], `${where}: the fall-back is silent`);
        const text = app.flat();
        for (const fund of hidden) assert.ok(!text.includes(fund.name), `${where}: "${fund.name}" must not appear`);
        await app.navigate(`#/?fund=${second.id}`);
        assert.equal(app.ui().selectedFundId, second.id, `${where}: they can still pick a fund they can see`);
      }

      // The tab asked for survives the fall-back.
      const stranger = hidden[0]?.id ?? "no-such-fund";
      await app.navigate(`#/?fund=${stranger}&tab=queries`);
      assert.equal(app.hash(), `#/?fund=${first.id}&tab=queries`, `${persona.name}: the hash keeps the tab`);
      assert.equal(app.byRole("tab", /^Queries/).getAttribute("aria-selected"), "true", `${persona.name}: the Queries tab is open for the fallback fund`);

      // On a portfolio page the open fund does not move, and the links to fund workspaces carry it.
      await app.navigate(`#/?fund=${second.id}`);
      for (const route of ROUTES.filter((candidate) => candidate.scope === "portfolio")) {
        await app.navigate(`${route.hash}?fund=${stranger}`);
        const where = `${persona.name}: ${route.label} with ?fund=${stranger}`;
        assert.equal(app.ui().selectedFundId, second.id, `${where}: the open fund is untouched`);
        const links = navLinks(app).map((link) => link.getAttribute("href"));
        assert.ok(
          links.filter((href) => /fund=/.test(href ?? "")).every((href) => href!.includes(`fund=${second.id}`)),
          `${where}: nav links follow the open fund (${links.join(", ")})`,
        );
        const text = app.flat();
        if (route.path !== "/access") for (const fund of hidden) assert.ok(!text.includes(fund.name), `${where}: "${fund.name}" must not appear`);
      }
      await app.unmount();
    }
  });

  it("the store refuses every action on a fund the persona cannot see, and bulk runs skip it", async () => {
    const attemptsOn = (fund: Fund, holderId: string): Action[] => {
      const fundId = fund.id;
      return [
        { type: "submit", fundId },
        { type: "return", fundId },
        { type: "approve", fundId, level: "review" },
        { type: "approve", fundId, level: "agent" },
        { type: "sign-off", fundId },
        { type: "reopen", fundId, reason: "Correcting signed-off inputs" },
        { type: "update-inputs", fundId, inputs: fund.inputs },
        { type: "update-holder-units", fundId, holderId, units: 1 },
        { type: "update-units-on-issue", fundId, units: 1000 },
        { type: "update-remitted", fundId, remitted: 100 },
        { type: "update-tb-category", fundId, rowId: "x", category: "excluded" },
        { type: "update-tax-adjustment", fundId, key: "x", amount: 1 },
        { type: "import-tb", fundId, rows: [] },
        { type: "sync-distribution-from-tb", fundId },
        { type: "publish-notice", fundId, noticeId: "x" },
        { type: "record-lodgment", fundId, kind: fund.market === "AU" ? "return" : "form-ut", reference: "R-1", date: "2026-10-12" },
        { type: "raise-query", fundId, subject: "Subject", message: "Message" },
        { type: "reply-query", fundId, queryId: "q-1", message: "Message" },
        { type: "resolve-query", fundId, queryId: "q-1" },
      ];
    };

    for (const persona of PERSONAS.filter((candidate) => candidate.funds !== "all")) {
      const view = oracle(persona.id);
      const hidden = hiddenFrom(view);
      const app = await mountApp({ user: persona.id, hash: "#/" });
      const before = dataOf(app);

      const surprises: string[] = [];
      await app.act(() => {
        for (const { id } of hidden) {
          for (const action of attemptsOn(before.funds.find((fund) => fund.id === id)!, before.holders.find((holder) => holder.fundId === id)!.id)) {
            const result = app.store.dispatch(action);
            if (result.ok || result.reason !== NO_ACCESS) surprises.push(`${id} ${action.type}: ${JSON.stringify(result.ok ? "accepted" : result.reason)}`);
          }
        }
      });
      assert.deepEqual(surprises, [], `${persona.name}: every action on a hidden fund is refused with "${NO_ACCESS}"`);
      assert.ok(dataOf(app) === before, `${persona.name}: the data did not change`);

      // Governance and access are not fund-scoped: they need the Head of Tax whichever fund is meant.
      for (const { id } of hidden.slice(0, 2)) {
        let result: ReturnType<typeof app.store.dispatch> | undefined;
        await app.act(() => {
          result = app.store.dispatch({ type: "set-governance", fundId: id, mode: "no-agent" });
        });
        assert.deepEqual(result, { ok: false, reason: "You don't have permission to change governance" }, `${persona.name}: set-governance on ${id}`);
      }
      let widened: ReturnType<typeof app.store.dispatch> | undefined;
      await app.act(() => {
        widened = app.store.dispatch({ type: "set-user-funds", userId: persona.id, funds: "all" });
      });
      assert.deepEqual(widened, { ok: false, reason: "You don't have permission to manage access" }, `${persona.name}: nobody widens their own access`);
      assert.ok(dataOf(app) === before, `${persona.name}: still unchanged`);

      // Opening a fund through the store is refused too.
      const opened = app.ui().selectedFundId;
      await app.act(() => app.store.selectFund(hidden[0]!.id));
      assert.equal(app.ui().selectedFundId, opened, `${persona.name}: selecting a hidden fund is ignored`);

      // A bulk run over all nine funds does what the persona may and skips the rest as "Not allowed for your role".
      let outcome: ReturnType<typeof app.store.dispatchBulk> | undefined;
      await app.act(() => {
        outcome = app.store.dispatchBulk(
          persona.role === "tax-agent" || persona.role === "reviewer" ? "approve-review" : "submit",
          FUNDS.map((fund) => fund.id),
        );
      });
      assert.ok(outcome);
      for (const fund of hidden) {
        assert.ok(!outcome.done.includes(fund.id), `${persona.name}: bulk did not act on ${fund.id}`);
        assert.deepEqual(
          outcome.skipped.find((entry) => entry.fundId === fund.id),
          { fundId: fund.id, reason: "Not allowed for your role" },
          `${persona.name}: bulk skipped ${fund.id}`,
        );
        assert.ok(dataOf(app).funds.find((candidate) => candidate.id === fund.id) === before.funds.find((candidate) => candidate.id === fund.id), `${persona.name}: ${fund.id} is the same fund as before`);
      }
      await app.unmount();
    }
  });

  describe("the view-only persona (M. Castillo)", () => {
    interface Control {
      el: HTMLElement;
      tag: string;
      type: string;
      role: string;
      name: string;
      where: string;
    }

    /** What a view-only persona may still use: reading, moving around, choosing what to look at. None of it writes to the data. */
    const READ_ONLY: Array<{ why: string; matches: (control: Control) => boolean }> = [
      { why: "tabs switch the panel", matches: (c) => c.role === "tab" },
      { why: "the shell's persona and jurisdiction pickers", matches: (c) => c.name === "Working as" || (c.type === "radio" && ["All", "Australia", "Singapore"].includes(c.name)) },
      { why: "the rail's disclosure", matches: (c) => /^Fund:/.test(c.name) },
      { why: "downloads read the data", matches: (c) => /^Download /.test(c.name) },
      { why: "opens a read-only breakdown or statement", matches: (c) => /^(Components|Statement) for /.test(c.name) },
      { why: "moves to a row the persona cannot change", matches: (c) => c.name === "Go to the account that needs a tax category" },
      { why: "Bulk review's tick boxes only choose funds; the Run buttons stay unavailable", matches: (c) => c.type === "checkbox" && /^Select /.test(c.name) },
      { why: "Analytics: the deadline filter", matches: (c) => c.name === "Show completed" },
      { why: "Analytics: the what-if scenario is not saved", matches: (c) => ["Fund", "Cash distribution for the year", "Taxable payout (% of taxable specified income)"].includes(c.name) },
      { why: "Investor reporting: which period to look at", matches: (c) => c.type === "radio" && /^(Quarter|Half-year) ended /.test(c.name) },
      { why: "views of the same table", matches: (c) => ["Holder", "Sort", "Highlight changes over (%)", "Deferred tax for"].includes(c.name) },
      { why: "Reset demo data is housekeeping that Access offers every persona (design spec 2.8); it asks first", matches: (c) => c.name === "Reset demo data" },
      { why: "the navigation's menu button shows the list of workspaces on a narrow screen", matches: (c) => c.tag === "button" && c.name === "Workspaces" },
      { why: "GST & BAS: which period and which ledger lines to look at", matches: (c) => ["GST period", "Ledger period scope", "Filter GST ledger"].includes(c.name) || /^(Show \d+ ledger lines?|Hide ledger lines)$/.test(c.name) },
      { why: "Versions: comparing a saved version with the inputs changes nothing", matches: (c) => ["Compare with current", "Compare from", "Compare to"].includes(c.name) },
      { why: "Compare has no action that changes the data: it reads the other system's figures in the browser (remembered mappings are kept apart from the data)", matches: (c) => / Compare$/.test(c.where) },
      { why: "Compliance calendar: how to show and filter the deadlines", matches: (c) => c.where === "Compliance calendar" && (["Month", "Agenda", "Status", "Kind"].includes(c.name) || /^Show (later|earlier) \(\d+\)$/.test(c.name)) },
      { why: "Risk register: filters", matches: (c) => c.where === "Risk register" && ["Severity", "Area", "Search"].includes(c.name) },
      { why: "Calculators work on what is typed into them and have no action that changes the data", matches: (c) => c.where === "Calculators" },
      { why: "Rules & sources: filters over the rules registry", matches: (c) => c.where === "Rules & sources" && (["Search", "Market", "Domain", "Confidence", "Effective on"].includes(c.name) || /^Show (more|fewer)/.test(c.name)) },
    ];

    function enabledControls(app: MountedApp, where: string): Control[] {
      const found: Control[] = [];
      for (const el of app.$$("button, input, select, textarea, [role='button'], [role='switch'], [role='checkbox'], [role='menuitem'], [contenteditable='true']")) {
        if (isNotRendered(el) || isOff(el) || (el as HTMLInputElement).type === "hidden") continue;
        found.push({ el, tag: el.localName, type: (el as HTMLInputElement).type ?? "", role: roleOf(el) ?? "", name: accessibleName(el), where });
      }
      return found;
    }

    const describeControl = (control: Control): string => `${control.where}: ${control.tag}${control.type ? `[${control.type}]` : ""} "${control.name}"`;
    const unlisted = (controls: Control[]): Control[] => controls.filter((control) => !READ_ONLY.some((entry) => entry.matches(control)));

    /** Every fund workspace for every fund (with every tab of it) and every portfolio workspace. */
    async function sweep(app: MountedApp, onPage: (controls: Control[], where: string) => Promise<void>, funds: readonly { id: string }[] = FUNDS): Promise<number> {
      let pages = 0;
      const visit = async (where: string): Promise<void> => {
        pages += 1;
        await onPage(enabledControls(app, where), where);
      };
      for (const fund of funds) {
        for (const route of FUND_ROUTES) {
          await app.navigate(`${route.hash}?fund=${fund.id}`);
          await visit(`${fund.id} ${route.label}`);
          for (const tabName of app.allByRole("tab").map((tab) => accessibleName(tab))) {
            const tab = app.allByRole("tab").find((candidate) => accessibleName(candidate) === tabName);
            if (!tab) continue;
            await app.click(tab);
            await visit(`${fund.id} ${route.label} > ${tabName}`);
          }
        }
      }
      for (const route of ROUTES.filter((candidate) => candidate.scope === "portfolio")) {
        await app.navigate(route.hash);
        await visit(route.label);
      }
      return pages;
    }

    it("is offered nothing that changes data on any fund workspace, tab or portfolio page", async () => {
      const app = await mountApp({ user: "m-castillo", hash: "#/" });
      const seed = dataOf(app);
      const offending: string[] = [];
      const kinds = new Set<string>();
      const pages = await sweep(app, async (controls) => {
        for (const control of controls) kinds.add(`${control.tag}|${control.type}|${control.role}|${control.name}`);
        offending.push(...unlisted(controls).map(describeControl));
      });
      assert.ok(pages >= FUNDS.length * FUND_ROUTES.length + ROUTES.filter((route) => route.scope === "portfolio").length, `the sweep visited ${pages} pages`);
      assert.deepEqual([...new Set(offending)], [], "controls a view-only persona can use that are not known to be read-only");
      assert.ok(kinds.size >= 30, `the sweep saw ${kinds.size} kinds of enabled control, so it is looking at real pages`);
      assert.ok(dataOf(app) === seed, "scanning changed nothing");
      assert.equal(app.ui().currentUserId, "m-castillo");
      await app.unmount();
    });

    it("can use every control it is offered without changing the data", async () => {
      const app = await mountApp({ user: "m-castillo", hash: "#/" });
      const seed = dataOf(app);
      const poked = new Set<string>();
      const changed: string[] = [];
      await sweep(app, async (controls) => {
        for (const control of controls) {
          const key = `${control.tag}|${control.type}|${control.name}`;
          const shell = control.name === "Working as" || (control.type === "radio" && ["All", "Australia", "Singapore"].includes(control.name));
          if (shell || poked.has(key) || !control.el.isConnected) continue;
          if (control.tag === "input" && control.type === "checkbox") await app.click(control.el);
          else if (control.tag === "input" && control.type === "radio") await app.click(control.el);
          else if (control.tag === "input" && control.type === "text") {
            await app.focus(control.el);
            await app.type(control.el, "7");
            await app.blur(control.el);
          } else if (control.tag === "select") {
            const select = control.el as HTMLSelectElement;
            const other = Array.from(select.options).find((option) => option.value !== select.value);
            if (!other) continue;
            await app.select(select, other.value);
          } else continue;
          poked.add(key);
          if (dataOf(app) !== seed) {
            changed.push(describeControl(control));
            return;
          }
        }
      });
      assert.deepEqual(changed, [], "controls that wrote to the data");
      assert.ok(poked.size >= 15, `${poked.size} different checkboxes, radios, lists and boxes were used`);
      assert.ok(dataOf(app) === seed, "the data is the very same object after all of it");
      assert.deepEqual(toasts(app), []);
      await app.unmount();
    });

    it("the scan would notice: an editor on the same pages is offered plenty that is not read-only", async () => {
      const app = await mountApp({ user: "a-moreno", hash: "#/?fund=coastline" });
      const names = new Set<string>();
      await sweep(
        app,
        async (controls) => {
          for (const control of unlisted(controls)) names.add(control.name);
        },
        FUNDS.filter((fund) => fund.id === "coastline"),
      );
      for (const expected of ["Submit for review", "Raise query", "Publish notice", "Import trial balance", "Change funds for A. Moreno", "Withholding remitted", "Units on issue", "Tax category for 4510 Make-good income received", "Governance for Coastline Healthcare Property Fund", "Save version"]) {
        assert.ok([...names].some((name) => name.replace(/\s+/g, " ") === expected || name.replace(/Change funds\s*for/, "Change funds for") === expected), `an editor is offered "${expected}" (the scan found ${[...names].slice(0, 12).join("; ")} ...)`);
      }
      assert.ok(names.size >= 30, `${names.size} controls are not read-only for the Head of Tax`);
      await app.unmount();
    });
  });
});
