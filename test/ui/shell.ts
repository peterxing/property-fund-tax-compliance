// What the shell exposes, read back from the DOM into plain values: the fund rail, the fund header with its workflow buttons, the live regions
// and the notifications. Tests compare these with the domain oracle (oracle.ts) instead of re-deriving the markup each time.
import { accessibleName, allByRole, flatText } from "./dom.ts";
import type { Queries } from "./harness.tsx";
import { withElement } from "./same.ts";

export const APP_NAME = "Property Fund Tax Compliance";

/** The document title the shell sets: "Trial balance · Southbank Industrial Partners Fund · Property Fund Tax Compliance". */
export function titleFor(workspace: string, fundName?: string | null): string {
  return [workspace, fundName, APP_NAME].filter(Boolean).join(" · ");
}

/** The links of the "Workspaces" navigation, in order. */
export function navLinks(app: Queries): HTMLElement[] {
  return allByRole(app.byRole("navigation", "Workspaces"), "link");
}

export interface RailItem {
  name: string;
  detail: string;
  status: string;
  exceptions: string;
  href: string;
  current: boolean;
}

export interface RailGroup {
  label: string;
  items: RailItem[];
}

export interface RailState {
  groups: RailGroup[];
  /** The text shown when there are no funds, else null. */
  empty: string | null;
}

const text = (el: Element | null | undefined): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** The fund rail ("Funds" navigation); an empty state when the page has none (portfolio workspaces). */
export function railState(app: Queries): RailState | null {
  const nav = app.queryByRole("navigation", "Funds");
  if (!nav) return null;
  return {
    empty: nav.querySelector(".fund-rail__empty") ? text(nav.querySelector(".fund-rail__empty")) : null,
    groups: Array.from(nav.querySelectorAll(".fund-rail__group")).map((group) => ({
      // The label holds a market badge (read by screen readers, drawn as "AU") and then the label itself.
      label: text(group.querySelector(".fund-rail__group-label")?.lastElementChild),
      items: Array.from(group.querySelectorAll<HTMLAnchorElement>("a.fund-rail__item")).map((item) => ({
        name: text(item.querySelector(".fund-rail__name")),
        detail: text(item.querySelector(".fund-rail__detail")),
        status: text(item.querySelector(".chip--status")),
        exceptions: text(item.querySelector(".fund-rail__chips")?.lastElementChild),
        href: item.getAttribute("href") ?? "",
        current: item.getAttribute("aria-current") === "page",
      })),
    })),
  };
}

/** The rail's funds by name, in the order shown. */
export function railNames(app: Queries): string[] {
  return railState(app)?.groups.flatMap((group) => group.items.map((item) => item.name)) ?? [];
}

export interface RailToggle {
  /** The open fund's name ("None selected" when the open fund is not in the list). */
  name: string;
  /** The status chip of the open fund, or null. */
  status: string | null;
  /** The red "2 exceptions" chip, or null: the button says nothing when there are none. */
  exceptions: string | null;
  /** aria-expanded: whether the list is open (below 900px it starts folded away). */
  expanded: boolean;
  /** aria-controls points at the element inside the rail that holds the grouped list. */
  controlsList: boolean;
}

/** The rail's disclosure button, which names the open fund; null when the rail has no funds (or the page has no rail). */
export function railToggle(app: Queries): RailToggle | null {
  const nav = app.queryByRole("navigation", "Funds");
  const button = nav?.querySelector<HTMLButtonElement>(":scope > button.fund-rail__toggle");
  if (!nav || !button) return null;
  const controls = button.getAttribute("aria-controls");
  const panel = controls ? document.getElementById(controls) : null;
  const status = button.querySelector(".chip--status");
  const exceptions = button.querySelector(".chip--danger");
  return {
    name: text(button.querySelector(".fund-rail__toggle-name")),
    status: status ? text(status) : null,
    exceptions: exceptions ? text(exceptions) : null,
    expanded: button.getAttribute("aria-expanded") === "true",
    controlsList: panel !== null && nav.contains(panel) && panel.querySelector(".fund-rail__group") !== null,
  };
}

export interface HeaderAction {
  label: string;
  /** aria-disabled="true": still focusable, does nothing when clicked. */
  disabled: boolean;
  /** The visible reason a disabled button is unavailable, found through aria-describedby; null when the button has none. */
  reason: string | null;
  describedBy: string | null;
  /** The button. Not enumerable: deepEqual and inspect leave it out, so a failed comparison does not print the element's React fibres. */
  readonly element: HTMLElement;
}

export interface FundHeaderState {
  name: string;
  /** "Preparing" | "In review" | "Signed off". */
  status: string;
  market: string;
  actions: HeaderAction[];
  /** "Regime" -> "AMIT · Office · Listed", "Period" -> ..., "Units on issue" -> ..., "AMMA due" / "Form UT". */
  facts: Record<string, string>;
  /** "Tax agent reviews and lodges". */
  governance: string;
  /** "Reviewer done, L. Brennan, 1 Sep 2026" / "Sign-off pending · Head of Tax", one entry per step of the approvals list. */
  steps: string[];
  /** The "N open queries" link, or null. */
  queries: { text: string; href: string } | null;
}

/** The block that heads a fund workspace, or null when the page has none. */
export function fundHeaderState(app: Queries): FundHeaderState | null {
  const header = app.maybe("header.fund-header");
  if (!header) return null;
  const chip = header.querySelector(".chip--status");
  const facts: Record<string, string> = {};
  for (const fact of Array.from(header.querySelectorAll(".fund-fact"))) facts[text(fact.querySelector("dt"))] = text(fact.querySelector("dd"));
  const queries = header.querySelector<HTMLAnchorElement>(".fund-chain__queries a");
  return {
    name: text(header.querySelector("h2")),
    status: text(chip).replace(/^Workflow status:\s*/, ""),
    market: text(header.querySelector(".chip--market .sr-only")),
    actions: Array.from(header.querySelectorAll<HTMLElement>(".fund-action")).map((wrapper) => {
      const element = wrapper.querySelector<HTMLElement>("button")!;
      const describedBy = element.getAttribute("aria-describedby");
      return withElement(
        {
          label: text(element.querySelector(".btn__label") ?? element),
          disabled: element.getAttribute("aria-disabled") === "true",
          reason: describedBy ? text(document.getElementById(describedBy)) : null,
          describedBy,
        },
        element,
      );
    }),
    facts,
    governance: text(header.querySelector(".fund-chain__label")),
    steps: Array.from(header.querySelectorAll(".fund-chain__step")).map((step) => flatText(step)),
    queries: queries ? { text: text(queries), href: queries.getAttribute("href") ?? "" } : null,
  };
}

/** What the polite (default) or assertive hidden live region says right now. */
export function announced(app: Queries, politeness: "polite" | "assertive" = "polite"): string {
  return flatText(app.$(`:scope > .sr-only[aria-live="${politeness}"]`));
}

export interface Toast {
  tone: string;
  role: string | null;
  text: string;
  /** Not enumerable, like HeaderAction.element. */
  readonly element: HTMLElement;
}

/** The notifications on screen. */
export function toasts(app: Queries): Toast[] {
  return app.$$(".toasts .toast").map((element) =>
    withElement(
      {
        tone: /toast--(\w+)/.exec(element.className)?.[1] ?? "",
        role: element.getAttribute("role"),
        text: flatText(element),
      },
      element,
    ),
  );
}

/** The "Working as" select. */
export function personaSelect(app: Queries): HTMLSelectElement {
  return app.byLabel("Working as") as HTMLSelectElement;
}

/** The names of the personas the select lists, as it shows them: "A. Moreno — Head of Tax". */
export function personaOptions(app: Queries): string[] {
  return Array.from(personaSelect(app).options).map((option) => (option.textContent ?? "").trim());
}

/** The accessible names of the radios of the Jurisdiction group with the one that is checked. */
export function jurisdictionState(app: Queries): { names: string[]; checked: string | null } {
  const radios = allByRole(app.byRole("group", "Jurisdiction"), "radio") as HTMLInputElement[];
  const checked = radios.find((radio) => radio.checked);
  return { names: radios.map((radio) => accessibleName(radio)), checked: checked ? accessibleName(checked) : null };
}

/** The radio of the Jurisdiction group with this label: "All", "Australia" or "Singapore". */
export function jurisdictionRadio(app: Queries, label: string): HTMLInputElement {
  const radio = (allByRole(app.byRole("group", "Jurisdiction"), "radio") as HTMLInputElement[]).find((candidate) => accessibleName(candidate) === label);
  if (!radio) throw new Error(`No jurisdiction radio "${label}".`);
  return radio;
}

