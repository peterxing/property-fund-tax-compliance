// The headless browser the UI tests run in: a jsdom window installed on globalThis, plus the browser features jsdom lacks (matchMedia,
// observers, <dialog>, object URLs, scrolling), a fixed clock, an in-memory localStorage, a console recorder and a download recorder.
// IMPORT THIS BEFORE react-dom (harness.tsx does): React reads `window` once while it loads.
//
// What is real and what is faked (the harness builds on these; tests normally reach them through harness.tsx):
//   * Time:      Date is replaced by FakeDate: `new Date()` and `Date.now()` return the fixed clock (default 2026-10-12T09:00:00).
//                The time zone is pinned to UTC so that instant is the same on every machine.
//   * Storage:   `localStorage` is a stable object whose contents are swapped per test (`storage.use(new MemoryStorage(...))`).
//   * Console:   console.error / console.warn are recorded in `consoleLog` instead of printed; jsdom's "not implemented" errors land there too.
//   * Downloads: clicking an `<a download>` records `{ fileName, blob }` in `downloads` instead of navigating.
import { format } from "node:util";
import { JSDOM, VirtualConsole } from "jsdom";

process.env.TZ = "UTC";

// ---------------------------------------------------------------------------------------------------------------- clock
const RealDate = Date;

export const DEFAULT_NOW = "2026-10-12T09:00:00";

let fixedTime = new RealDate(DEFAULT_NOW).getTime();

const FakeDate = class extends RealDate {
  constructor(...args: unknown[]) {
    super(...((args.length === 0 ? [fixedTime] : args) as [number]));
  }

  static override now(): number {
    return fixedTime;
  }
};
// Dates made before the swap (by Node, by JSON revivers) are still dates.
Object.defineProperty(FakeDate, Symbol.hasInstance, { value: (value: unknown) => value instanceof RealDate });
Object.defineProperty(globalThis, "Date", { value: FakeDate, configurable: true, writable: true });

export const clock = {
  /** Fixes "now" for `new Date()` / `Date.now()`: a Date, a timestamp, or a zone-less wall-clock string such as "2026-10-12T09:00:00". */
  set(value: string | number | Date = DEFAULT_NOW): void {
    fixedTime = new RealDate(value).getTime();
  },
  get now(): Date {
    return new RealDate(fixedTime);
  },
};

// ---------------------------------------------------------------------------------------------------------------- console
export interface ConsoleEntry {
  level: "error" | "warn";
  text: string;
}

/** Everything the app, React or jsdom wrote to console.error / console.warn since the last `clear()`. */
export const consoleLog = {
  entries: [] as ConsoleEntry[],
  clear(): void {
    this.entries.length = 0;
  },
};

for (const level of ["error", "warn"] as const) {
  console[level] = (...args: unknown[]) => {
    consoleLog.entries.push({ level, text: format(...args) });
  };
}

// ---------------------------------------------------------------------------------------------------------------- storage
/** An in-memory Storage (also satisfies the domain's StorageLike). */
export class MemoryStorage {
  private readonly items = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.items.set(key, value);
  }

  get length(): number {
    return this.items.size;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.items.get(String(key)) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.items.delete(String(key));
  }

  clear(): void {
    this.items.clear();
  }

  /** A copy of the contents, for assertions. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.items);
  }
}

let currentStorage = new MemoryStorage();
const sessionStorageFront = new MemoryStorage();

/** The object behind `window.localStorage`: always the same identity (the app keeps a reference), but its contents are swappable. */
const storageFront = {
  get length() {
    return currentStorage.length;
  },
  key: (index: number) => currentStorage.key(index),
  getItem: (key: string) => currentStorage.getItem(key),
  setItem: (key: string, value: string) => currentStorage.setItem(key, value),
  removeItem: (key: string) => currentStorage.removeItem(key),
  clear: () => currentStorage.clear(),
};

export const storage = {
  /** Makes `next` (default: an empty one) what localStorage reads and writes from now on. */
  use(next: MemoryStorage = new MemoryStorage()): MemoryStorage {
    currentStorage = next;
    return next;
  },
  get current(): MemoryStorage {
    return currentStorage;
  },
};

// ---------------------------------------------------------------------------------------------------------------- window
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (error: Error) => {
  consoleLog.entries.push({ level: "error", text: `jsdom: ${error.message}` });
});

const dom = new JSDOM('<!doctype html><html lang="en"><head><title></title></head><body></body></html>', {
  url: "http://localhost/",
  pretendToBeVisual: true,
  virtualConsole,
});

export const domWindow = dom.window;

type Loose = Record<string, unknown>;
const win = domWindow as unknown as Loose;
const root = globalThis as unknown as Loose;

function define(target: object, name: string, value: unknown): void {
  Object.defineProperty(target, name, { value, configurable: true, writable: true, enumerable: false });
}

// DOM interfaces (Node, Element, HTMLElement, MouseEvent, ...): copy every one Node does not already have, and replace the three event
// classes jsdom's dispatchEvent insists on. Node's own URL, Blob, TextEncoder, AbortController, ... stay as they are.
const REPLACE_NODE_GLOBALS = new Set(["Event", "EventTarget", "CustomEvent"]);
for (const name of Object.getOwnPropertyNames(domWindow)) {
  if (!/^[A-Z]/.test(name) || typeof win[name] !== "function") continue;
  if (name in root && !REPLACE_NODE_GLOBALS.has(name)) continue;
  define(root, name, win[name]);
}

// window-level objects and functions are forwarded live, so later changes (the localStorage swap, a stubbed scrollTo) are seen.
const FORWARDED = [
  "window",
  "self",
  "document",
  "location",
  "history",
  "navigator",
  "screen",
  "localStorage",
  "sessionStorage",
  "getComputedStyle",
  "getSelection",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "matchMedia",
  "scrollTo",
  "scrollBy",
  "scroll",
  "open",
  "print",
  "alert",
  "confirm",
  "prompt",
  "innerWidth",
  "innerHeight",
  "outerWidth",
  "outerHeight",
  "devicePixelRatio",
  "scrollX",
  "scrollY",
  "pageXOffset",
  "pageYOffset",
];
for (const name of FORWARDED) {
  Object.defineProperty(root, name, {
    configurable: true,
    enumerable: false,
    get() {
      const value = win[name];
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(domWindow) : value;
    },
    set(value: unknown) {
      win[name] = value;
    },
  });
}
root.IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(domWindow, "localStorage", { configurable: true, get: () => storageFront });
Object.defineProperty(domWindow, "sessionStorage", { configurable: true, get: () => sessionStorageFront });

// ---------------------------------------------------------------------------------------------------------------- polyfills
/** What `window.matchMedia(query).matches` answers; a test may assign another function (e.g. for prefers-reduced-motion). */
export const media = { matches: (_query: string): boolean => false };

function matchMedia(query: string) {
  return {
    media: query,
    onchange: null,
    get matches() {
      return media.matches(query);
    },
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  };
}

class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return [];
  }
}

/** Scroll, print, alert and similar calls the app made (jsdom does not implement them). */
export const calls: Array<{ target: string; args: unknown[] }> = [];
const record =
  (target: string) =>
  (...args: unknown[]): void => {
    calls.push({ target, args });
  };

define(domWindow, "matchMedia", matchMedia);
define(domWindow, "ResizeObserver", NoopObserver);
define(root, "ResizeObserver", NoopObserver);
define(domWindow, "IntersectionObserver", NoopObserver);
define(root, "IntersectionObserver", NoopObserver);
for (const name of ["scrollTo", "scrollBy", "scroll", "print", "alert"]) define(domWindow, name, record(`window.${name}`));
define(domWindow, "confirm", () => true);
define(domWindow, "prompt", () => null);
define(domWindow, "open", () => null);
for (const name of ["scrollIntoView", "scrollTo", "scrollBy", "scroll"]) define(domWindow.Element.prototype, name, record(`element.${name}`));

// <dialog>: jsdom has the element but not show() / showModal() / close().
const dialogProto = domWindow.HTMLDialogElement.prototype;
function openDialog(dialog: HTMLDialogElement, modal: boolean): void {
  if (dialog.hasAttribute("open")) throw new domWindow.DOMException("The dialog is already open.", "InvalidStateError");
  dialog.setAttribute("open", "");
  (dialog as unknown as Loose).modal = modal;
}
define(dialogProto, "show", function (this: HTMLDialogElement) {
  openDialog(this, false);
});
define(dialogProto, "showModal", function (this: HTMLDialogElement) {
  openDialog(this, true);
});
define(dialogProto, "close", function (this: HTMLDialogElement, returnValue?: string) {
  if (!this.hasAttribute("open")) return;
  this.removeAttribute("open");
  (this as unknown as Loose).modal = false;
  if (returnValue !== undefined) this.returnValue = returnValue;
  queueMicrotask(() => this.dispatchEvent(new domWindow.Event("close")));
});

// Object URLs and downloads. saveBlob() in src/app/exports/download.ts creates an object URL, clicks a hidden <a download> and revokes the URL.
export interface Download {
  fileName: string;
  blob: Blob;
}

/** Files the app offered to the user since the last reset (an `<a download>` was clicked). */
export const downloads: Download[] = [];

const objectUrls = new Map<string, Blob>();
let objectUrlCount = 0;
define(URL, "createObjectURL", (blob: Blob): string => {
  const url = `blob:http://localhost/${++objectUrlCount}`;
  objectUrls.set(url, blob);
  return url;
});
define(URL, "revokeObjectURL", (url: string): void => {
  objectUrls.delete(url);
});

domWindow.document.addEventListener(
  "click",
  (event) => {
    const link = (event.target as Element | null)?.closest?.("a[download]") as HTMLAnchorElement | null | undefined;
    if (!link) return;
    event.preventDefault();
    downloads.push({ fileName: link.download, blob: objectUrls.get(link.href) ?? objectUrls.get(link.getAttribute("href") ?? "") ?? new Blob([]) });
  },
  true,
);

/** Text written with navigator.clipboard.writeText since the last reset. */
export const clipboard: string[] = [];
define(domWindow.navigator, "clipboard", {
  writeText: async (text: string) => {
    clipboard.push(text);
  },
  readText: async () => clipboard.at(-1) ?? "",
});

// ---------------------------------------------------------------------------------------------------------------- reset
/** Puts the window back to a blank page between tests: empty body and localStorage, no hash, no title, nothing recorded, default clock. */
export function resetDom(): void {
  domWindow.document.body.replaceChildren();
  domWindow.document.title = "";
  domWindow.history.replaceState(null, "", "/");
  storage.use();
  sessionStorageFront.clear();
  consoleLog.clear();
  downloads.length = 0;
  clipboard.length = 0;
  calls.length = 0;
  media.matches = () => false;
  clock.set();
}

/** Stops jsdom's timers so the process can exit. */
export function closeDom(): void {
  domWindow.close();
}
