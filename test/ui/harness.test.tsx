// Self-tests for the UI harness (env.ts, dom.ts, harness.tsx): the guarantees every other UI test relies on.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { useState } from "react";
import { STORAGE_KEY, createStore } from "../../src/domain/index.ts";
import { appStore } from "../../src/app/state.tsx";
import {
  DEFAULT_NOW,
  MemoryStorage,
  calls,
  clipboard,
  clock,
  consoleOutput,
  downloads,
  expectConsole,
  importFresh,
  media,
  mountApp,
  peekStore,
  render,
  storage,
} from "./harness.tsx";
import { ROUTES } from "./routes.ts";
import { expectNone, expectNotSame, expectSame } from "./same.ts";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

describe("environment", () => {
  it("runs in UTC, so dates read the same on every machine", () => {
    assert.equal(new Date().getTimezoneOffset(), 0);
    assert.equal(new Date(2026, 0, 1).toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(new Date("2026-03-04T05:06:07").toISOString(), "2026-03-04T05:06:07.000Z");
  });

  it("freezes the clock at 2026-10-12 09:00 and keeps Date otherwise normal", () => {
    assert.equal(DEFAULT_NOW, "2026-10-12T09:00:00");
    assert.equal(new Date().toISOString(), "2026-10-12T09:00:00.000Z");
    assert.equal(Date.now(), Date.parse("2026-10-12T09:00:00Z"));
    assert.equal(new Date(0).getTime(), 0);
    assert.equal(new Date(2020, 1, 29).getDate(), 29);
    assert.ok(Number.isNaN(new Date(undefined as unknown as number).getTime()));
    assert.equal(Date.UTC(2026, 0, 1), Date.parse("2026-01-01T00:00:00Z"));
    assert.ok(new Date() instanceof Date);
    assert.equal(typeof new Date().toLocaleDateString("en-AU"), "string");
  });

  it("clock.set takes a wall-clock string, a timestamp or a Date", () => {
    clock.set("2027-01-02T03:04:05");
    assert.equal(new Date().toISOString(), "2027-01-02T03:04:05.000Z");
    clock.set(Date.parse("2028-02-03T00:00:00Z"));
    assert.equal(new Date().toISOString(), "2028-02-03T00:00:00.000Z");
    clock.set(new Date("2029-03-04T00:00:00Z"));
    assert.equal(clock.now.toISOString(), "2029-03-04T00:00:00.000Z");
    clock.set();
    assert.equal(new Date().toISOString(), "2026-10-12T09:00:00.000Z");
  });

  it("gives each test a blank page (1/2: dirty everything)", () => {
    clock.set("2031-01-01T00:00:00");
    localStorage.setItem("leak", "1");
    sessionStorage.setItem("leak", "1");
    document.title = "leaky";
    document.body.append(document.createElement("hr"));
    window.history.replaceState(null, "", "/#/leak");
    downloads.push({ fileName: "x.csv", blob: new Blob([]) });
    clipboard.push("leak");
    calls.push({ target: "window.scrollTo", args: [] });
    media.matches = () => true;
  });

  it("gives each test a blank page (2/2: nothing leaked)", () => {
    assert.equal(new Date().toISOString(), "2026-10-12T09:00:00.000Z");
    assert.equal(localStorage.length, 0);
    assert.equal(sessionStorage.length, 0);
    assert.equal(document.title, "");
    assert.equal(document.body.children.length, 0);
    assert.equal(window.location.hash, "");
    assert.deepEqual([downloads.length, clipboard.length, calls.length], [0, 0, 0]);
    assert.equal(window.matchMedia("(prefers-reduced-motion: reduce)").matches, false);
  });

  it("localStorage keeps its identity while its contents are swapped", () => {
    const front = window.localStorage;
    localStorage.setItem("a", "1");
    assert.equal(localStorage.getItem("a"), "1");
    assert.equal(localStorage.getItem("missing"), null);
    assert.deepEqual(storage.current.snapshot(), { a: "1" });
    const swapped = storage.use(new MemoryStorage({ b: "2" }));
    assert.equal(window.localStorage, front);
    assert.equal(localStorage.getItem("a"), null);
    assert.equal(localStorage.getItem("b"), "2");
    assert.equal(localStorage.key(0), "b");
    localStorage.removeItem("b");
    assert.equal(swapped.length, 0);
    localStorage.setItem("c", "3");
    localStorage.clear();
    assert.equal(localStorage.length, 0);
  });

  it("stubs what jsdom lacks: media queries, observers, scrolling, dialogs, object URLs, clipboard", async () => {
    assert.equal(window.matchMedia("(prefers-reduced-motion: reduce)").matches, false);
    media.matches = (query) => query.includes("reduce");
    assert.equal(window.matchMedia("(prefers-reduced-motion: reduce)").matches, true);
    assert.equal(window.matchMedia("(min-width: 10px)").matches, false);

    const observer = new ResizeObserver(() => {});
    observer.observe(document.body);
    observer.disconnect();

    window.scrollTo(0, 0);
    document.body.scrollIntoView();
    assert.deepEqual(
      calls.map((c) => c.target),
      ["window.scrollTo", "element.scrollIntoView"],
    );

    const dialog = document.createElement("dialog");
    document.body.append(dialog);
    dialog.showModal();
    assert.ok(dialog.open);
    assert.throws(() => dialog.showModal(), /already open/);
    dialog.close("done");
    assert.ok(!dialog.open);
    assert.equal(dialog.returnValue, "done");

    const url = URL.createObjectURL(new Blob(["a,b"], { type: "text/csv" }));
    assert.match(url, /^blob:/);
    URL.revokeObjectURL(url);

    await navigator.clipboard.writeText("copied");
    assert.deepEqual(clipboard, ["copied"]);
  });

  it("records a click on <a download> instead of navigating", async () => {
    const blob = new Blob(["a,b\n1,2\n"], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "export.csv";
    document.body.append(link);
    link.click();
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0]?.fileName, "export.csv");
    assert.equal(await downloads[0]?.blob.text(), "a,b\n1,2\n");
    assert.equal(window.location.hash, "");
  });

  it("turns jsdom's own complaints into console output, so audit (h) sees them", () => {
    expectConsole(/^jsdom: Not implemented: navigation/);
    window.location.reload();
    assert.match(consoleOutput().join("\n"), /Not implemented: navigation/);
  });
});

describe("harness console policy and mount rules (a child process runs the fixture)", () => {
  it("fails tests that print unexpected errors, leave act() warnings or miss an expected message, and cleans up after the rest", () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(
      process.execPath,
      ["--disable-warning=ExperimentalWarning", "--import", "./scripts/register-esbuild.mjs", "--test", "--test-reporter=tap", "test/ui/harness-policy.fixture.tsx"],
      { cwd: REPO, encoding: "utf8", env, timeout: 120_000 },
    );
    const outcome = new Map<string, boolean>();
    for (const line of run.stdout.matchAll(/^(not ok|ok) \d+ - (.+)$/gm)) outcome.set(line[2]!, line[1] === "ok");
    assert.equal(outcome.size, 9, `expected 9 fixture tests, got ${outcome.size}\n${run.stdout}\n${run.stderr}`);
    for (const [name, passed] of outcome) assert.equal(passed, name.startsWith("PASSES"), `${name} should ${name.startsWith("PASSES") ? "pass" : "fail"}\n${run.stdout}`);
    assert.match(run.stdout, /Unexpected console output \(audit h\)/);
    assert.match(run.stdout, /not wrapped in act/);
    assert.match(run.stdout, /expected console output matching \/never printed\//);
    assert.match(run.stdout, /an app is still mounted/);
  });
});

describe("mountApp", () => {
  it("mounts the real shell for the Head of Tax", async () => {
    const app = await mountApp();
    assert.equal(app.byRole("heading", { level: 1 }).textContent, "Property Fund Tax Compliance");
    assert.equal(app.byRole("banner").localName, "header");
    assert.equal(app.byRole("main").id, "main");
    assert.equal((app.byLabel("Working as") as HTMLSelectElement).value, "a-moreno");
    assert.equal(app.hash(), "#/?fund=harbourline");
  });

  it("starts exactly where a brand-new store starts", async () => {
    const app = await mountApp();
    assert.deepEqual(app.ui(), createStore({ storage: null }).getState().ui);
    assert.deepEqual(app.store.getState().data, createStore({ storage: null }).getState().data);
  });

  it("takes a persona, a jurisdiction, a fund and a hash", async () => {
    const app = await mountApp({ user: "n-pillai", jurisdiction: "SG", fund: "loyang", hash: "#/trial-balance" });
    assert.deepEqual(app.ui(), { currentUserId: "n-pillai", jurisdiction: "SG", selectedFundId: "loyang" });
    assert.equal((app.byLabel("Working as") as HTMLSelectElement).value, "n-pillai");
    assert.equal(app.byRole("radio", "Singapore").hasAttribute("checked") || (app.byRole("radio", "Singapore") as HTMLInputElement).checked, true);
    assert.equal(app.hash(), "#/trial-balance?fund=loyang");
    assert.equal(app.byRole("link", "Trial balance").getAttribute("aria-current"), "page");
  });

  it("starts from the demo seed every time, whatever the last test did", async () => {
    const first = await mountApp({ user: "r-okafor", jurisdiction: "AU" });
    await first.act(() => first.store.setUser("m-castillo"));
    await first.unmount();
    const second = await mountApp();
    assert.deepEqual(second.ui(), { currentUserId: "a-moreno", jurisdiction: "all", selectedFundId: "harbourline" });
  });

  it("refuses an unknown persona or a fund the persona cannot see", async () => {
    await assert.rejects(mountApp({ user: "nobody" }), /unknown persona "nobody"/);
    await assert.rejects(mountApp({ user: "r-okafor", fund: "loyang" }), /r-okafor cannot see fund "loyang"/);
    await assert.rejects(mountApp({ user: "a-moreno", jurisdiction: "AU", fund: "loyang" }), /cannot see fund "loyang"/);
  });

  it("accepts the hash as '#/path', '/path', 'path' or nothing", async () => {
    for (const [hash, expected] of [
      ["#/analytics", "#/analytics"],
      ["/analytics", "#/analytics"],
      ["analytics", "#/analytics"],
      ["#/cost-base?fund=wattle", "#/cost-base?fund=wattle"],
      ["", "#/?fund=harbourline"],
    ] as const) {
      const app = await mountApp({ hash });
      assert.equal(app.hash(), expected, `hash option ${JSON.stringify(hash)}`);
      await app.unmount();
    }
  });

  it("sets the clock for the test", async () => {
    await mountApp({ now: "2027-02-03T04:05:06" });
    assert.equal(new Date().toISOString(), "2027-02-03T04:05:06.000Z");
  });

  it("refuses a second app while one is mounted, and allows one after unmount", async () => {
    const first = await mountApp();
    await assert.rejects(mountApp(), /an app is still mounted/);
    await first.unmount();
    assert.equal(document.body.children.length, 0);
    const second = await mountApp({ user: "n-pillai" });
    assert.equal((second.byLabel("Working as") as HTMLSelectElement).value, "n-pillai");
  });

  it("boots from storage like a page reload, with its own copy of the modules and store", async () => {
    const first = await mountApp();
    await first.select(first.byLabel("Working as"), "w-l-teo");
    await first.click(first.byRole("radio", "Singapore"));
    assert.ok(first.storage.getItem(STORAGE_KEY), "the app saves its state");
    const saved = first.storage;
    await first.unmount();

    const reloaded = await mountApp({ storage: saved });
    assert.notEqual(reloaded.store, appStore(), "a reload has a new store");
    assert.equal(peekStore(), appStore(), "the shared singleton is untouched");
    assert.equal((reloaded.byLabel("Working as") as HTMLSelectElement).value, "w-l-teo");
    assert.equal((reloaded.byRole("radio", "Singapore") as HTMLInputElement).checked, true);
    assert.equal(reloaded.ui().currentUserId, "w-l-teo");
  });

  it("boots from a plain storage record, and from nothing (fresh)", async () => {
    const corrupt = await mountApp({ storage: { [STORAGE_KEY]: "{not json" } });
    assert.equal(corrupt.ui().currentUserId, "a-moreno");
    await corrupt.unmount();
    const fresh = await mountApp({ fresh: true });
    assert.equal(fresh.ui().currentUserId, "a-moreno");
    assert.equal(fresh.storage.length, 0, "nothing is saved until something changes");
  });

  it("will not mix a persisted state with the user / jurisdiction / fund options", async () => {
    await assert.rejects(mountApp({ storage: {}, user: "n-pillai" }), /do not pass user/);
  });
});

describe("queries", () => {
  it("find by role and accessible name, by label and by selector", async () => {
    const app = await mountApp();
    const nav = app.byRole("navigation", "Workspaces");
    assert.equal(app.allByRole("link").filter((a) => nav.contains(a)).length, ROUTES.length);
    assert.equal(app.byRole("link", /^Cost base/).textContent?.trim(), "Cost base & CGT");
    assert.equal(app.byRole("heading", { name: "Harbourline Office Trust", level: 2 }).className, "fund-header__name");
    assert.equal(app.byLabel("Working as").localName, "select");
    assert.equal(app.$("main").id, "main");
    expectNone(app.maybe("dialog[open]"), "no open dialog on the page (the fund header keeps its closed Reopen dialog mounted)");
    expectNone(app.queryByRole("dialog"), "no dialog in the accessibility tree");
    assert.ok(app.$$("a.app-nav__link").length === ROUTES.length);
    assert.throws(() => app.$("section.nope"), /No element matches "section.nope"/);
  });

  it("explain a miss and an ambiguity", async () => {
    const app = await mountApp();
    assert.throws(() => app.byRole("link", "Nowhere"), /Expected one link named Nowhere but found none\. Closest candidates: .*Distributions/);
    assert.throws(() => app.byRole("link"), /Expected one link but found \d+: /);
    assert.throws(() => app.queryByRole("link"), /found \d+/);
    assert.throws(() => app.byLabel("No such label"), /Expected one control labelled No such label but found none/);
  });

  it("read text the way a person (or screen reader) would", async () => {
    const app = await mountApp();
    const text = app.text();
    assert.match(text, /^Skip to fund workspace\nProperty Fund Tax Compliance\n/);
    assert.ok(text.includes("Australia · AMIT · AUD"));
    assert.ok(!text.includes("AU\n"), "the aria-hidden AU badge is not read");
    assert.ok(!app.flat().includes("\n"));
    assert.match(app.flat(), /Working as A\. Moreno — Head of Tax/);
  });
});

function Playground() {
  const [text, setText] = useState("");
  const [pick, setPick] = useState("b");
  const [on, setOn] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const note = (what: string) => setLog((previous) => [...previous, what]);
  return (
    <div>
      <label>
        Name
        <input value={text} onChange={(event) => setText(event.target.value)} onFocus={() => note("focus")} onBlur={() => note("blur")} />
      </label>
      <label>
        Pick
        <select value={pick} onChange={(event) => setPick(event.target.value)}>
          <option value="a">Alpha</option>
          <option value="b">Beta</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={on} onChange={(event) => setOn(event.target.checked)} />
        Agree
      </label>
      <button type="button" onClick={() => note("go")}>
        Go
      </button>
      <button type="button" disabled onClick={() => note("never")}>
        Stuck
      </button>
      <a href="#/analytics" onClick={() => note("link")}>
        Elsewhere
      </a>
      <output>{`${text}|${pick}|${on}|${log.join(",")}`}</output>
    </div>
  );
}

describe("interactions", () => {
  it("click presses buttons, ignores disabled ones and follows links", async () => {
    const view = await render(<Playground />);
    await view.click(view.byRole("button", "Go"));
    await view.click(view.byRole("button", "Stuck"));
    await view.click(view.byRole("link", "Elsewhere"));
    assert.equal(view.$("output").textContent, "|b|false|go,link");
    assert.equal(window.location.hash, "#/analytics");
  });

  it("type replaces (or appends to) the value and fires React's onChange", async () => {
    const view = await render(<Playground />);
    const input = view.byLabel("Name") as HTMLInputElement;
    await view.type(input, "Moreno");
    await view.type(input, "!", { append: true });
    assert.equal(input.value, "Moreno!");
    assert.equal(view.$("output").textContent, "Moreno!|b|false|focus");
    await assert.rejects(view.type(view.byRole("button", "Go"), "x"), /Cannot type into <button>/);
  });

  it("select chooses by value or by label", async () => {
    const view = await render(<Playground />);
    const select = view.byLabel("Pick") as HTMLSelectElement;
    await view.select(select, "a");
    assert.equal(select.value, "a");
    await view.select(select, "Beta");
    assert.equal(view.$("output").textContent, "|b|false|");
    await assert.rejects(view.select(select, "Gamma"), /No option "Gamma" in "Alpha", "Beta"/);
  });

  it("press: Enter activates buttons and links, Space toggles checkboxes, Tab walks the tab order", async () => {
    const view = await render(<Playground />);
    const go = view.byRole("button", "Go");
    await view.press(go, "Enter");
    await view.press(go, " ");
    await view.press(view.byRole("button", "Stuck"), "Enter");
    const box = view.byRole("checkbox", "Agree") as HTMLInputElement;
    await view.press(box, " ");
    assert.equal(box.checked, true);
    assert.equal(view.$("output").textContent, "|b|true|go,go");

    const name = view.byLabel("Name");
    await view.press(name, "Tab");
    expectSame(document.activeElement, view.byLabel("Pick"), "Tab moves to the next field");
    await view.press(document.activeElement!, "Tab", { shiftKey: true });
    expectSame(document.activeElement, name, "Shift+Tab moves back");
    await view.press(view.byRole("link", "Elsewhere"), "Tab");
    expectSame(document.activeElement, name, "Tab wraps round");
  });

  it("press Escape cancels the open modal dialog", async () => {
    const view = await render(
      <div>
        <dialog aria-label="Confirm">
          <p>Sure?</p>
        </dialog>
      </div>,
    );
    const dialog = view.$("dialog") as HTMLDialogElement;
    expectNone(view.queryByRole("dialog"), "a closed dialog is not in the accessibility tree");
    await view.act(() => dialog.showModal());
    expectSame(view.byRole("dialog", "Confirm"), dialog, "the open dialog is found by its name");
    await view.press(dialog, "Escape");
    assert.ok(!dialog.open);
  });

  it("focus and blur move focus and run the handlers", async () => {
    const view = await render(<Playground />);
    const input = view.byLabel("Name");
    await view.focus(input);
    expectSame(document.activeElement, input, "focus() moves focus to the input");
    await view.blur(input);
    expectNotSame(document.activeElement, input, "blur() takes focus away");
    assert.equal(view.$("output").textContent, "|b|false|focus,blur");
  });

  it("rerender and unmount", async () => {
    const view = await render(<p>one</p>);
    assert.equal(view.text(), "one");
    await view.rerender(<p>two</p>);
    assert.equal(view.text(), "two");
    await view.unmount();
    assert.ok(!view.container.isConnected);
    await view.unmount();
  });

  it("navigate and back drive the router", async () => {
    const app = await mountApp();
    await app.click(app.byRole("link", "Trial balance"));
    assert.equal(app.hash(), "#/trial-balance?fund=harbourline");
    assert.equal(app.byRole("link", "Trial balance").getAttribute("aria-current"), "page");
    await app.navigate("/analytics");
    assert.equal(app.hash(), "#/analytics");
    assert.equal(app.byRole("link", "Analytics").getAttribute("aria-current"), "page");
    await app.back();
    assert.equal(app.hash(), "#/trial-balance?fund=harbourline");
    assert.equal(app.byRole("link", "Trial balance").getAttribute("aria-current"), "page");
  });

  it("act wraps store changes so React renders them before the next line", async () => {
    const app = await mountApp();
    await app.act(() => app.store.setUser("n-pillai"));
    assert.equal((app.byLabel("Working as") as HTMLSelectElement).value, "n-pillai");
    assert.match(app.flat(), /Telok Ayer Commercial REIT/);
  });

  it("the keyboard path through the page starts at the skip link, which moves focus to the main area", async () => {
    const app = await mountApp();
    const skip = app.byRole("link", "Skip to fund workspace");
    await app.press(skip, "Tab");
    const menu = app.byRole("button", "Workspaces");
    expectSame(document.activeElement, menu, "Tab from the skip link goes to the navigation's menu button (the style sheet hides it from 1100px up)");
    await app.press(menu, "Tab");
    expectSame(document.activeElement, app.byRole("link", "Distributions"), "and then to the first navigation link");
    await app.press(skip, "Enter");
    expectSame(document.activeElement, app.$("main#main"), "the skip link moves focus to the main area");
    assert.equal(app.hash(), "#/?fund=harbourline", "the skip link does not replace the route");
  });
});

describe("module generations", () => {
  it("importFresh gives modules their own state", async () => {
    const [first] = await importFresh("../../src/app/state.tsx");
    const [second] = await importFresh("../../src/app/state.tsx");
    const a = (first as { appStore: typeof appStore }).appStore();
    const b = (second as { appStore: typeof appStore }).appStore();
    assert.notEqual(a, b);
    assert.notEqual(a, appStore());
  });
});
