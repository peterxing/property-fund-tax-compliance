// Entry point for railInteraction.test.ts: bundled by esbuild and imported only after jsdom has been installed as the global DOM.
// It mounts the fund rail with React DOM's client renderer from the dev fixtures, so clicks, focus and keys run the real event handlers.
import { act } from "react";
import { createRoot } from "react-dom/client";
import * as fx from "../../src/app/dev/fixtures.ts";
import { FundRailView } from "../../src/app/shell/FundRail.tsx";

export interface MountedRail {
  nav: HTMLElement;
  toggle: HTMLButtonElement;
  links: HTMLAnchorElement[];
  unmount(): void;
}

export function mountRail(container: HTMLElement, selectedId: string | null, onSelect: (fundId: string) => void): MountedRail {
  const root = createRoot(container);
  act(() => {
    root.render(<FundRailView groups={fx.FIXTURE_FUND_GROUPS} selectedId={selectedId} hrefFor={(id) => `#/?fund=${id}`} onSelect={onSelect} />);
  });
  const nav = container.querySelector("nav");
  const toggle = container.querySelector("button.fund-rail__toggle");
  if (!(nav instanceof HTMLElement) || !(toggle instanceof HTMLButtonElement)) throw new Error("the fund rail did not render");
  return {
    nav,
    toggle,
    links: [...container.querySelectorAll<HTMLAnchorElement>("a.fund-rail__item")],
    unmount: () =>
      act(() => {
        root.unmount();
      }),
  };
}

/** Runs a DOM interaction the way React expects it, so state updates and effects are applied before the next line reads the DOM. */
export function interact(action: () => void): void {
  act(action);
}
