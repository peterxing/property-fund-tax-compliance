// What the fund rail's disclosure does when it is used, which static markup cannot show: opening and folding, choosing a fund, Escape, focus, and
// links opened in another tab. React DOM's client renderer mounts the real component into jsdom (test/app/interaction-entry.tsx, bundled by esbuild
// because Node's type stripping does not handle JSX), and each test drives it with DOM events.
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import type * as Entry from "./interaction-entry.tsx";

const root = fileURLToPath(new URL("../../", import.meta.url));
const outDir = join(root, ".tmp", "render-test");
const outFile = join(outDir, `interaction-${process.pid}.mjs`);

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;

// React DOM looks for a browser when it is imported and while it runs, so the DOM goes in before the bundle is loaded. Each test file has its own process.
const installed: Record<string, unknown> = {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  HTMLIFrameElement: window.HTMLIFrameElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLAnchorElement: window.HTMLAnchorElement,
  Element: window.Element,
  Node: window.Node,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
};
for (const [name, value] of Object.entries(installed)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

mkdirSync(outDir, { recursive: true });
await build({
  entryPoints: [join(root, "test", "app", "interaction-entry.tsx")],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  packages: "external",
  jsx: "automatic",
  loader: { ".css": "empty" },
  define: { __DEV__: "false", __BUILD_INFO__: JSON.stringify({ version: "0.0.0", sha: "test", builtAt: "" }) },
  logLevel: "error",
});
const entry = (await import(pathToFileURL(outFile).href)) as typeof Entry;

let container: HTMLElement;
let mounted: Entry.MountedRail | null = null;
const chosen: string[] = [];

const mount = (selectedId: string | null = "southbank"): Entry.MountedRail => {
  mounted = entry.mountRail(container, selectedId, (fundId) => chosen.push(fundId));
  return mounted;
};
const click = (target: Element, init: MouseEventInit = {}): void =>
  entry.interact(() => {
    target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
  });
const press = (target: Element, key: string): void =>
  entry.interact(() => {
    target.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
const expanded = (rail: Entry.MountedRail): string | null => rail.toggle.getAttribute("aria-expanded");

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  chosen.length = 0;
});
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  container.remove();
});
after(() => {
  window.close();
  rmSync(outFile, { force: true });
});

describe("fund rail disclosure, in use", () => {
  it("starts folded, and its button opens and folds the list", () => {
    const rail = mount();
    assert.equal(expanded(rail), "false");
    assert.equal(rail.nav.classList.contains("fund-rail--open"), false);
    click(rail.toggle);
    assert.equal(expanded(rail), "true");
    assert.equal(rail.nav.classList.contains("fund-rail--open"), true);
    click(rail.toggle);
    assert.equal(expanded(rail), "false");
    assert.equal(rail.nav.classList.contains("fund-rail--open"), false);
  });

  it("folds when a fund is chosen, reports the choice, and returns focus to the button", () => {
    const rail = mount();
    click(rail.toggle);
    const link = rail.links[2]!;
    link.focus();
    click(link);
    assert.deepEqual(chosen, ["wattle"]);
    assert.equal(expanded(rail), "false");
    assert.equal(window.document.activeElement, rail.toggle);
  });

  it("leaves focus alone when a fund is chosen from the list that is never folded (900px and up)", () => {
    const rail = mount();
    const link = rail.links[1]!;
    link.focus();
    click(link);
    assert.deepEqual(chosen, ["southbank"]);
    assert.equal(expanded(rail), "false");
    assert.equal(window.document.activeElement, link);
  });

  it("folds on Escape from anywhere in the open list and returns focus to the button", () => {
    const rail = mount();
    click(rail.toggle);
    const link = rail.links[3]!;
    link.focus();
    press(link, "Escape");
    assert.equal(expanded(rail), "false");
    assert.equal(window.document.activeElement, rail.toggle);
  });

  it("ignores Escape while folded and other keys while open", () => {
    const rail = mount();
    const link = rail.links[0]!;
    link.focus();
    press(link, "Escape");
    assert.equal(expanded(rail), "false");
    assert.equal(window.document.activeElement, link);

    click(rail.toggle);
    press(link, "ArrowDown");
    press(link, "Tab");
    press(link, "a");
    assert.equal(expanded(rail), "true");
  });

  it("neither folds nor reports a choice for a click that opens the link somewhere else", () => {
    const rail = mount();
    click(rail.toggle);
    const link = rail.links[1]!;
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) click(link, init);
    assert.deepEqual(chosen, []);
    assert.equal(expanded(rail), "true");

    click(link);
    assert.deepEqual(chosen, ["southbank"]);
    assert.equal(expanded(rail), "false");
  });

  it("can be opened again after a choice", () => {
    const rail = mount();
    click(rail.toggle);
    click(rail.links[0]!);
    assert.equal(expanded(rail), "false");
    click(rail.toggle);
    assert.equal(expanded(rail), "true");
  });
});
