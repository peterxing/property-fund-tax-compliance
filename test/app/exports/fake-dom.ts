// A tiny stand-in for the browser pieces saveBlob uses (document, URL.createObjectURL/revokeObjectURL, setTimeout), so the download path can
// be exercised under Node. Everything is restored when the test ends.
import type { TestContext } from "node:test";

export interface FakeLink {
  href: string;
  download: string;
  rel: string;
  style: { display: string };
  click: () => void;
  remove: () => void;
}

export interface FakeDom {
  /** What happened, in order: "create" (object URL made), "append", "click", "remove" and "revoke <url>". */
  events: string[];
  links: FakeLink[];
  /** The blobs handed to URL.createObjectURL. */
  blobs: Blob[];
  /** Moves the mocked clock forward. */
  tick: (ms: number) => void;
}

export interface FakeDomOptions {
  /** Leave `document` undefined, as under Node. */
  noDocument?: boolean;
  /** Make `click()` throw this. */
  clickError?: Error;
  /** Mock setTimeout so the release of the object URL can be stepped (default true). Turn it off while a library that schedules its own timers runs. */
  fakeTimers?: boolean;
}

export function installFakeDom(t: TestContext, options: FakeDomOptions = {}): FakeDom {
  const events: string[] = [];
  const links: FakeLink[] = [];
  const blobs: Blob[] = [];

  if (options.fakeTimers !== false) t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(URL, "createObjectURL", (blob: Blob | MediaSource): string => {
    events.push("create");
    blobs.push(blob as Blob);
    return `blob:fake/${blobs.length}`;
  });
  t.mock.method(URL, "revokeObjectURL", (url: string): void => {
    events.push(`revoke ${url}`);
  });

  if (!options.noDocument) {
    const stub = {
      body: {
        appendChild: (node: FakeLink) => {
          events.push("append");
          return node;
        },
      },
      createElement: (tag: string): FakeLink => {
        if (tag !== "a") throw new Error(`unexpected element <${tag}>`);
        const link: FakeLink = {
          href: "",
          download: "",
          rel: "",
          style: { display: "" },
          click: () => {
            events.push("click");
            if (options.clickError) throw options.clickError;
          },
          remove: () => {
            events.push("remove");
          },
        };
        links.push(link);
        return link;
      },
    };
    Object.defineProperty(globalThis, "document", { value: stub, configurable: true, writable: true });
    t.after(() => {
      Reflect.deleteProperty(globalThis, "document");
    });
  }

  return { events, links, blobs, tick: (ms) => (options.fakeTimers === false ? undefined : t.mock.timers.tick(ms)) };
}
