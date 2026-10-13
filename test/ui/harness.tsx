// The UI test harness: mount the real app (or any element) in a jsdom window, drive it like a user and read it like a user.
//
//   import { mountApp, render, allowConsole, expectConsole } from "./harness.tsx";
//   const app = await mountApp({ hash: "#/trial-balance", user: "l-brennan" });
//   await app.select(app.byLabel("Working as"), "n-pillai");
//   assert.match(app.text(), /Telok Ayer/);
//
// Environment (test/ui/env.ts, loaded first so React sees the DOM): jsdom on globalThis, TZ pinned to UTC, a fixed clock (default
//   2026-10-12T09:00:00; `now` option / clock.set()), an in-memory localStorage that is empty for every test, matchMedia / ResizeObserver /
//   IntersectionObserver / <dialog> / scrolling / object URLs / clipboard stubs, downloads recorded in `downloads`.
// Loader (scripts/register-esbuild.mjs): .ts/.tsx through esbuild with __DEV__ = false, .css empty, fonts and svg as URL strings.
//   Tests are `test/ui/**/*.test.tsx`, run by `npm run test:ui`. NODE_ENV is "test" so React's dev build (and its `act`) is used.
//
// Mounting
//   mountApp({ hash, user, jurisdiction, fund, now })   the real <App/> on the module-level store, reset to the demo seed for each mount:
//                                                       persona `user` (default a-moreno, head of tax), jurisdiction (default "all"),
//                                                       selected fund (default: the persona's first visible fund), hash (default "#/").
//   mountApp({ storage })                               boots like a page reload: a fresh module generation of App/state/domain whose
//                                                       store reads `storage` (a MemoryStorage, e.g. `previous.storage`, or a plain
//                                                       { "pfc.state.v1": "<json>" } record). Costs ~0.3 s, so use it for reload tests.
//   render(element)                                     any element, for component tests (no store, router or providers are added).
//   Everything mounted is unmounted after each test; the DOM, storage, clock and recorded output are reset.
//
// Queries on the returned object (all scoped to the mounted container)
//   $(selector), maybe(selector), $$(selector)          first match (throws if none) / first or null / all
//   byRole(role, name?), allByRole(role, query?), queryByRole(role, name?)   by ARIA role and accessible name; hidden elements
//                                                       (hidden, aria-hidden, display:none, closed dialog) are skipped unless
//                                                       { hidden: true }. byRole throws unless exactly one matches.
//   byLabel(text)                                       the form control whose accessible name is `text`
//   text(options?)                                      the visible text (rules at the top of dom.ts); flat() collapses line breaks
// Interactions (async: each runs inside React's act() and lets jsdom's hashchange/popstate settle)
//   click(el), type(el, text), select(el, valueOrLabel), press(el, key, init?), focus(el), blur(el), navigate(hash), back(),
//   act(fn) for anything else that changes state (e.g. `await app.act(() => app.store.setUser("n-pillai"))`), flush().
//   Clicks follow the browser: the clicked control takes focus first, disabled controls do nothing, links change the hash, Enter/Space
//   activate buttons and links, Tab moves along tabOrder() (a radio group is one stop).
//
// Also exported: importFresh(...specifiers) loads src modules in a new module generation (own store singleton / router listeners);
//   peekStore() the app's store if one exists; tabOrder(root); domWindow; media (assign media.matches to answer matchMedia queries); calls
//   (recorded scroll / print calls); downloads; clipboard; consoleLog; clock and storage from env.ts.
//
// Console policy: any console.error / console.warn during a test (React warnings, act() warnings, jsdom "not implemented", the app's own
//   logging) fails that test in afterEach (audit (h)). Declare the output a test provokes on purpose with `expectConsole(/pattern/)`
//   (must occur) or `allowConsole(/pattern/)` (may occur).
import { after, afterEach } from "node:test";
import { DEFAULT_NOW, MemoryStorage, calls, clipboard, clock, closeDom, consoleLog, domWindow, downloads, media, resetDom, storage } from "./env.ts";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FundId, JurisdictionFilter, Store, UiState, UserId } from "../../src/domain/types.ts";
import { App } from "../../src/app/App.tsx";
import { appStore, peekStore } from "../../src/app/state.tsx";
import { allByLabel, allByRole, flatText, isNotRendered, one, tabOrder, visibleText, type Matcher, type RoleQuery, type TextOptions } from "./dom.ts";

export { DEFAULT_NOW, MemoryStorage, calls, clipboard, clock, consoleLog, domWindow, downloads, media, storage };
export type { Download } from "./env.ts";
export { peekStore, tabOrder };

export const DEFAULT_USER = "a-moreno";

// ---------------------------------------------------------------------------------------------------------------- timing
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Waits a few macrotasks (jsdom delivers `hashchange` and `popstate` after one) inside act, so React has rendered everything it was asked to. */
async function settle(): Promise<void> {
  await tick();
  await tick();
  await tick();
}

/** Runs `fn` inside act(), then lets pending events and effects settle. */
export async function inAct(fn: () => void | Promise<void> = () => {}): Promise<void> {
  await act(async () => {
    await fn();
    await settle();
  });
}

// ---------------------------------------------------------------------------------------------------------------- events
function nativeSet(el: Element, property: "value" | "checked", value: string | boolean): void {
  // React tracks `value` with an own property on the element; the prototype's setter is the one that does not notify the tracker.
  for (let proto: object | null = Object.getPrototypeOf(el); proto; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, property);
    if (descriptor?.set) {
      descriptor.set.call(el, value);
      return;
    }
  }
  (el as unknown as Record<string, unknown>)[property] = value;
}

const POINTER_FOCUSABLE = "a[href], area[href], button, input:not([type=hidden]), select, textarea, summary, [contenteditable=true], [tabindex]";

/** What pressing the mouse does to focus (jsdom's click() does not): the nearest focusable element takes it, plain content drops it. */
function focusOnPress(el: Element): void {
  const target = el.closest<HTMLElement>(POINTER_FOCUSABLE);
  if (target && !target.matches(":disabled") && !isNotRendered(target)) target.focus();
  else if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
}

function activatesWith(el: Element, key: "Enter" | " "): boolean {
  const input = el instanceof HTMLInputElement ? el : null;
  const buttonLike = el.localName === "button" || (input !== null && ["button", "submit", "reset", "image"].includes(input.type));
  if (key === "Enter") return buttonLike || (el.localName === "a" && el.hasAttribute("href"));
  return buttonLike || (input !== null && (input.type === "checkbox" || input.type === "radio"));
}

function dispatchKey(el: Element, type: "keydown" | "keyup", key: string, init: KeyboardEventInit): boolean {
  return el.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...init }));
}

/** keydown, the browser's default action for the key (Enter / Space activate, Tab moves focus, Escape cancels a modal dialog), keyup. */
function pressSync(el: Element, key: string, init: KeyboardEventInit): void {
  if (document.activeElement !== el) (el as HTMLElement).focus?.();
  const keydown = dispatchKey(el, "keydown", key, init);
  if (keydown) {
    if (key === "Enter" && activatesWith(el, "Enter")) {
      (el as HTMLElement).click();
    } else if (key === "Escape") {
      const dialog = el.closest("dialog[open]") ?? document.querySelector("dialog[open]");
      if (dialog instanceof HTMLDialogElement && dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) dialog.close();
    } else if (key === "Tab") {
      const order = tabOrder(document);
      const at = order.indexOf(el as HTMLElement);
      const next = init.shiftKey ? (order[at - 1] ?? order.at(-1)) : order[(at + 1) % order.length];
      next?.focus();
    }
  }
  const keyup = dispatchKey(el, "keyup", key, init);
  if (keydown && keyup && key === " " && activatesWith(el, " ")) (el as HTMLElement).click();
}

// ---------------------------------------------------------------------------------------------------------------- rendered trees
export interface Queries {
  /** The first element matching the CSS selector; throws when there is none. */
  $(selector: string): HTMLElement;
  /** The first element matching the CSS selector, or null. */
  maybe(selector: string): HTMLElement | null;
  /** Every element matching the CSS selector. */
  $$(selector: string): HTMLElement[];
  /** The one element with this role (and accessible name); throws when there are none or several. */
  byRole(role: string, name?: Matcher | RoleQuery): HTMLElement;
  allByRole(role: string, name?: Matcher | RoleQuery): HTMLElement[];
  /** The one element with this role, or null when there is none (throws for several). */
  queryByRole(role: string, name?: Matcher | RoleQuery): HTMLElement | null;
  /** The one form control whose accessible name matches. */
  byLabel(label: Matcher): HTMLElement;
  /** Visible text: block elements on their own lines, table cells separated by tabs (see dom.ts). */
  text(options?: TextOptions): string;
  /** Visible text on one line. */
  flat(options?: TextOptions): string;
}

export interface Interactions {
  flush(): Promise<void>;
  act(fn?: () => void | Promise<void>): Promise<void>;
  click(el: Element): Promise<void>;
  /** Replaces the value of an input / textarea (append: true keeps the existing text) and fires `input`. */
  type(el: Element, text: string, options?: { append?: boolean }): Promise<void>;
  /** Chooses the option whose value or label is `valueOrLabel` and fires `change` (not when it was already chosen: a browser does not either). */
  select(el: Element, valueOrLabel: string): Promise<void>;
  press(el: Element, key: string, init?: KeyboardEventInit): Promise<void>;
  focus(el: Element): Promise<void>;
  blur(el: Element): Promise<void>;
  /** Sets location.hash ("#/trial-balance?fund=southbank", "/trial-balance") and lets the router react. */
  navigate(hash: string): Promise<void>;
  back(): Promise<void>;
}

export interface Rendered extends Queries, Interactions {
  container: HTMLElement;
  root: Root;
  unmount(): Promise<void>;
  rerender(element: ReactNode): Promise<void>;
}

export interface MountedApp extends Rendered {
  /** The store behind the app (module singleton). Change it inside `app.act(...)`. */
  store: Store;
  /** What localStorage holds; pass to mountApp({ storage }) to "reload". */
  storage: MemoryStorage;
  /** { currentUserId, jurisdiction, selectedFundId } right now. */
  ui(): UiState;
  /** location.hash right now. */
  hash(): string;
}

function roleQuery(name?: Matcher | RoleQuery): RoleQuery {
  return name === undefined ? {} : typeof name === "string" || name instanceof RegExp ? { name } : name;
}

function describeQuery(role: string, query: RoleQuery): string {
  return `${role}${query.name !== undefined ? ` named ${String(query.name)}` : ""}${query.level !== undefined ? ` level ${query.level}` : ""}`;
}

function queriesFor(container: HTMLElement): Queries {
  const select = (selector: string): HTMLElement[] => Array.from(container.querySelectorAll<HTMLElement>(selector));
  const read = (options?: TextOptions): string => visibleText(container, options);
  const all = (role: string, name?: Matcher | RoleQuery): HTMLElement[] => allByRole(container, role, roleQuery(name));
  return {
    $(selector) {
      const found = container.querySelector<HTMLElement>(selector);
      if (!found) throw new Error(`No element matches "${selector}".`);
      return found;
    },
    maybe: (selector) => container.querySelector<HTMLElement>(selector),
    $$: select,
    byRole(role, name) {
      const query = roleQuery(name);
      return one(all(role, query), describeQuery(role, query), allByRole(container, role));
    },
    allByRole: all,
    queryByRole(role, name) {
      const query = roleQuery(name);
      const found = all(role, query);
      if (found.length > 1) one(found, describeQuery(role, query));
      return found[0] ?? null;
    },
    byLabel(label) {
      return one(allByLabel(container, label), `control labelled ${String(label)}`, allByLabel(container, /.*/));
    },
    text: read,
    flat: (options) => flatText(container, options),
  };
}

const live = new Set<Rendered>();
const apps = new WeakSet<Rendered>();

/** Renders any element into a new container attached to the document. */
export async function render(element: ReactNode): Promise<Rendered> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let mounted = true;

  const interactions: Interactions = {
    flush: () => inAct(),
    act: (fn) => inAct(fn),
    click: (el) =>
      inAct(() => {
        focusOnPress(el);
        (el as HTMLElement).click();
      }),
    type: (el, text, options = {}) =>
      inAct(() => {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) throw new Error(`Cannot type into <${el.localName}>.`);
        el.focus();
        nativeSet(el, "value", options.append ? el.value + text : text);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }),
    select: (el, valueOrLabel) =>
      inAct(() => {
        if (!(el instanceof HTMLSelectElement)) throw new Error(`Cannot select in <${el.localName}>.`);
        const option = Array.from(el.options).find((o) => o.value === valueOrLabel) ?? Array.from(el.options).find((o) => (o.textContent ?? "").trim() === valueOrLabel);
        if (!option) throw new Error(`No option "${valueOrLabel}" in ${Array.from(el.options).map((o) => `"${(o.textContent ?? "").trim()}"`).join(", ")}.`);
        el.focus();
        // A browser fires `change` only when the choice changes.
        if (el.value === option.value) return;
        nativeSet(el, "value", option.value);
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }),
    press: (el, key, init = {}) => inAct(() => pressSync(el, key, init)),
    focus: (el) => inAct(() => (el as HTMLElement).focus()),
    blur: (el) => inAct(() => (el as HTMLElement).blur()),
    navigate: (hash) =>
      inAct(() => {
        window.location.hash = normalizeHash(hash);
      }),
    back: () =>
      inAct(async () => {
        window.history.back();
        await tick();
      }),
  };

  const rendered: Rendered = {
    container,
    root,
    ...queriesFor(container),
    ...interactions,
    async unmount() {
      if (!mounted) return;
      mounted = false;
      live.delete(rendered);
      await act(async () => root.unmount());
      container.remove();
    },
    rerender: (next) => inAct(() => root.render(next)),
  };
  live.add(rendered);
  await inAct(() => root.render(element));
  return rendered;
}

// ---------------------------------------------------------------------------------------------------------------- the app
function normalizeHash(hash: string): string {
  const body = hash.replace(/^#/, "");
  return body === "" ? "" : `#${body.startsWith("/") ? body : `/${body}`}`;
}

export interface MountOptions {
  /** Where the app starts: "#/trial-balance?fund=southbank", "/analytics", "" for no hash (default "#/"). */
  hash?: string;
  /** Persona id (default "a-moreno"). */
  user?: UserId;
  /** Jurisdiction toggle (default "all"). */
  jurisdiction?: JurisdictionFilter;
  /** Selected fund; it must be visible to the persona (default: the persona's first visible fund). */
  fund?: FundId;
  /** The clock for this test: a zone-less local string such as "2026-10-12T09:00:00" (UTC in the tests), a Date or a timestamp. */
  now?: string | number | Date;
  /** Boot like a page reload from this localStorage content. Excludes user / jurisdiction / fund. */
  storage?: MemoryStorage | Record<string, string>;
  /** Boot like a page load with empty storage in a fresh module generation (the store is created by the app, not reset). */
  fresh?: boolean;
}

interface AppModules {
  App: typeof App;
  appStore: typeof appStore;
}

let generation = 0;

/**
 * Loads modules from src/ again, together with everything they import from src/ (the loader keys modules by ?pfc=N), so their
 * module-level state (the store singleton, the router's listeners) starts empty. Specifiers are relative to this folder
 * ("../../src/app/App.tsx"); the modules of one call share a generation and see each other. Costs ~0.3 s.
 */
export async function importFresh(...specifiers: string[]): Promise<Array<Record<string, unknown>>> {
  generation += 1;
  return Promise.all(specifiers.map((specifier) => import(new URL(`${specifier}?pfc=${generation}`, import.meta.url).href) as Promise<Record<string, unknown>>));
}

/** A new copy of App.tsx, state.tsx and everything they import from src/: a new singleton store. */
async function freshModules(): Promise<AppModules> {
  const [app, state] = await importFresh("../../src/app/App.tsx", "../../src/app/state.tsx");
  return { App: (app as { App: typeof App }).App, appStore: (state as { appStore: typeof appStore }).appStore };
}

/** The demo seed with this persona, jurisdiction and fund: what a visitor sees after choosing them from a fresh load. */
function prepare(store: Store, user: UserId, jurisdiction: JurisdictionFilter, fund: FundId | undefined): void {
  store.reset();
  store.selectFund(null);
  store.setUser(user);
  if (store.getState().ui.currentUserId !== user) throw new Error(`mountApp: unknown persona "${user}".`);
  store.setJurisdiction(jurisdiction);
  if (fund !== undefined) {
    store.selectFund(fund);
    if (store.getState().ui.selectedFundId !== fund) throw new Error(`mountApp: ${user} cannot see fund "${fund}" with jurisdiction "${jurisdiction}".`);
  }
}

/** Mounts the real application. See the header of this file. */
export async function mountApp(options: MountOptions = {}): Promise<MountedApp> {
  const { hash = "#/", user = DEFAULT_USER, jurisdiction = "all", fund, now, storage: initial, fresh = false } = options;
  if (initial !== undefined && (options.user !== undefined || options.jurisdiction !== undefined || options.fund !== undefined)) {
    throw new Error("mountApp: `storage` already holds the persona, jurisdiction and fund; do not pass user / jurisdiction / fund with it.");
  }
  clock.set(now);
  if ([...live].some((rendered) => apps.has(rendered))) {
    throw new Error("mountApp: an app is still mounted in this test. `await app.unmount()` first: a reload replaces the old page.");
  }
  const booting = initial !== undefined || fresh;
  const backing = storage.use(initial instanceof MemoryStorage ? initial : new MemoryStorage(initial ?? {}));
  const modules: AppModules = booting ? await freshModules() : { App, appStore };
  const store = modules.appStore();
  if (!booting) await inAct(() => prepare(store, user, jurisdiction, fund));
  window.history.replaceState(null, "", `/${normalizeHash(hash)}`);
  const rendered = await render(<modules.App />);
  apps.add(rendered);
  return Object.assign(rendered, {
    store,
    storage: backing,
    ui: () => store.getState().ui,
    hash: () => window.location.hash,
  });
}

// ---------------------------------------------------------------------------------------------------------------- console policy
const allowed: RegExp[] = [];
const expected: { pattern: RegExp; min: number; hits: number }[] = [];

/** console.error / console.warn output matching `pattern` is fine in this test. */
export function allowConsole(pattern: RegExp): void {
  allowed.push(pattern);
}

/** This test must produce at least `min` console.error / console.warn entries matching `pattern` (they are then not failures). */
export function expectConsole(pattern: RegExp, min = 1): void {
  expected.push({ pattern, min, hits: 0 });
}

/** The console.error / console.warn output so far this test, as text. */
export function consoleOutput(): string[] {
  return consoleLog.entries.map((entry) => `console.${entry.level}: ${entry.text}`);
}

afterEach(async () => {
  for (const rendered of [...live]) await rendered.unmount();
  const problems: string[] = [];
  for (const entry of consoleLog.entries) {
    const hit = expected.find((e) => e.pattern.test(entry.text));
    if (hit) hit.hits += 1;
    else if (!allowed.some((pattern) => pattern.test(entry.text))) problems.push(`console.${entry.level}: ${entry.text.slice(0, 600)}`);
  }
  for (const e of expected) if (e.hits < e.min) problems.push(`expected console output matching ${e.pattern} (${e.hits} of ${e.min})`);
  allowed.length = 0;
  expected.length = 0;
  resetDom();
  if (problems.length > 0) throw new Error(`Unexpected console output (audit h):\n${problems.join("\n")}`);
});

// jsdom's timers would keep the process alive after the last test.
after(() => {
  closeDom();
});
