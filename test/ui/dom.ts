// DOM helpers shared by the harness and the audits: the text a person can read, roles, accessible names and queries by role / label.
//
// visibleText rule (the text of a rendered page, close to what a browser's innerText gives):
//   * Skipped: `hidden` attributes, `display: none` / `visibility: hidden` set inline, <script>/<style>/<template>/<noscript>, a closed
//     <dialog>, the body of a closed <details>, and subtrees with aria-hidden="true" (unless `ariaHidden: true`).
//   * Visually hidden text (.sr-only / .visually-hidden) is kept, because screen readers read it and a browser's innerText includes it;
//     pass `screenReader: false` to read the page as a sighted user does. For an aria-hidden "AU" next to an sr-only "Australia"
//     the default gives "Australia", { ariaHidden: true } gives both, { ariaHidden: true, screenReader: false } gives "AU".
//   * Layout: block elements start a new line, table cells are separated by a tab, <br> is a line break, runs of spaces (and no-break
//     spaces) collapse to one, blank lines are dropped. The text of a <textarea> and the value of an <input> are values, not text (read
//     `.value`); the labels of a <select>'s options are text, as they are in innerText.
//   * Stylesheets are not loaded in the tests, so only the UA defaults and inline styles can hide something.
import { computeAccessibleDescription, computeAccessibleName } from "dom-accessibility-api";

export interface TextOptions {
  /** Include subtrees marked aria-hidden="true" (default false). */
  ariaHidden?: boolean;
  /** Include visually hidden text, .sr-only / .visually-hidden (default true). */
  screenReader?: boolean;
}

const NEVER_TEXT = new Set(["script", "style", "template", "noscript", "head", "title", "meta", "link"]);
const BLOCK = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "legend",
  "li",
  "main",
  "nav",
  "ol",
  "option",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "tfoot",
  "thead",
  "tr",
  "ul",
]);
const SCREEN_READER_ONLY = /(?:^|\s)(?:sr-only|visually-hidden)(?:\s|$)/;

function styleHides(el: Element): boolean {
  if (!el.hasAttribute("style")) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return style?.display === "none" || style?.visibility === "hidden";
}

function skipped(el: Element, options: TextOptions): boolean {
  if (NEVER_TEXT.has(el.localName) || el.hasAttribute("hidden")) return true;
  if (el.getAttribute("aria-hidden") === "true" && !options.ariaHidden) return true;
  if (options.screenReader === false && SCREEN_READER_ONLY.test(el.getAttribute("class") ?? "")) return true;
  if (el.localName === "dialog" && !el.hasAttribute("open")) return true;
  return styleHides(el);
}

function collect(node: Node, out: string[], options: TextOptions): void {
  if (node.nodeType === 3) {
    out.push((node.nodeValue ?? "").replace(/[ \t\n\r\f]+/g, " "));
    return;
  }
  if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
  const el = node.nodeType === 1 ? (node as Element) : null;
  if (el && skipped(el, options)) return;
  const tag = el?.localName ?? "";
  if (tag === "br") {
    out.push("\n");
    return;
  }
  if (tag === "textarea") return;
  const block = BLOCK.has(tag);
  if (block) out.push("\n");
  if ((tag === "td" || tag === "th") && el?.previousElementSibling) out.push("\t");
  for (const child of Array.from(node.childNodes)) {
    // A closed <details> shows only its <summary>.
    if (tag === "details" && !el?.hasAttribute("open") && (child as Element).localName !== "summary") continue;
    collect(child, out, options);
  }
  if (block) out.push("\n");
}

/** The text of a rendered subtree: one line per block, tabs between table cells. See the rule at the top of this file. */
export function visibleText(root: Node, options: TextOptions = {}): string {
  const parts: string[] = [];
  collect(root, parts, options);
  return parts
    .join("")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/ +/g, " ").replace(/ ?\t ?/g, "\t").trim())
    .filter((line) => line !== "")
    .join("\n");
}

/** Text that collapses every line break and tab to a space: handy for `includes()` checks across element boundaries. */
export function flatText(root: Node, options: TextOptions = {}): string {
  return visibleText(root, options).replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------------------------------------------- hidden
function hiddenBy(el: Element, ariaHidden: boolean): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.hasAttribute("hidden") || styleHides(node)) return true;
    if (node.localName === "dialog" && !node.hasAttribute("open")) return true;
    if (ariaHidden && node.getAttribute("aria-hidden") === "true") return true;
  }
  return false;
}

/** True when nothing renders for the element or an ancestor: hidden, display:none / visibility:hidden set inline, a closed dialog. */
export function isNotRendered(el: Element): boolean {
  return hiddenBy(el, false);
}

/** True when the element, or an ancestor, is hidden from everyone or from assistive technology (not rendered, or aria-hidden). */
export function isHiddenFromAssistiveTech(el: Element): boolean {
  return hiddenBy(el, true);
}

// ---------------------------------------------------------------------------------------------------------------- roles
const INPUT_ROLE: Record<string, string | null> = {
  button: "button",
  image: "button",
  reset: "button",
  submit: "button",
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
  number: "spinbutton",
  search: "searchbox",
  email: "textbox",
  tel: "textbox",
  text: "textbox",
  url: "textbox",
  password: "textbox",
  hidden: null,
  file: null,
  color: null,
  date: null,
  "datetime-local": null,
  month: null,
  time: null,
  week: null,
};

const TAG_ROLE: Record<string, string> = {
  article: "article",
  aside: "complementary",
  button: "button",
  caption: "caption",
  dd: "definition",
  dialog: "dialog",
  dt: "term",
  fieldset: "group",
  figure: "figure",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  hr: "separator",
  li: "listitem",
  main: "main",
  nav: "navigation",
  ol: "list",
  option: "option",
  output: "status",
  p: "paragraph",
  progress: "progressbar",
  table: "table",
  tbody: "rowgroup",
  td: "cell",
  textarea: "textbox",
  tfoot: "rowgroup",
  thead: "rowgroup",
  tr: "row",
  ul: "list",
};

const SECTIONING = "article, aside, main, nav, section, [role=article], [role=complementary], [role=main], [role=navigation], [role=region]";

function hasName(el: Element): boolean {
  return (el.getAttribute("aria-label") ?? "").trim() !== "" || (el.getAttribute("aria-labelledby") ?? "").trim() !== "";
}

/** The element's ARIA role: the explicit `role`, else the implicit role of the tag (the common HTML-AAM mappings), else null. */
export function roleOf(el: Element): string | null {
  const explicit = (el.getAttribute("role") ?? "").trim().split(/\s+/)[0];
  if (explicit) return explicit === "none" ? "presentation" : explicit;
  const tag = el.localName;
  switch (tag) {
    case "a":
    case "area":
      return el.hasAttribute("href") ? "link" : null;
    case "input": {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      if (el.hasAttribute("list") && INPUT_ROLE[type] === "textbox") return "combobox";
      return type in INPUT_ROLE ? INPUT_ROLE[type]! : "textbox";
    }
    case "select":
      return el.hasAttribute("multiple") || Number(el.getAttribute("size") ?? 1) > 1 ? "listbox" : "combobox";
    case "img":
      return el.getAttribute("alt") === "" ? "presentation" : "img";
    case "section":
    case "form":
      return hasName(el) ? (tag === "form" ? "form" : "region") : null;
    case "header":
      return el.parentElement?.closest(SECTIONING) ? null : "banner";
    case "footer":
      return el.parentElement?.closest(SECTIONING) ? null : "contentinfo";
    case "th": {
      const scope = el.getAttribute("scope");
      if (scope === "row" || scope === "rowgroup") return "rowheader";
      return "columnheader";
    }
    default:
      return TAG_ROLE[tag] ?? null;
  }
}

// ---------------------------------------------------------------------------------------------------------------- names
/**
 * The accessible name (WAI-ARIA accname 1.2 via dom-accessibility-api), trimmed. Known gap: the library trims each inline element's own
 * text, so `<span>Approve </span>fund` gives "Approvefund" where a browser gives "Approve fund"; leave the space outside the element.
 */
export function accessibleName(el: Element): string {
  return computeAccessibleName(el).trim();
}

export function accessibleDescription(el: Element): string {
  return computeAccessibleDescription(el).trim();
}

export type Matcher = string | RegExp;

/** A string matches when equal after whitespace is collapsed; a RegExp matches when it finds something. */
export function matches(value: string, matcher: Matcher): boolean {
  const normal = value.replace(/\s+/g, " ").trim();
  return typeof matcher === "string" ? normal === matcher.replace(/\s+/g, " ").trim() : matcher.test(normal);
}

// ---------------------------------------------------------------------------------------------------------------- queries
export interface RoleQuery {
  /** Accessible name to match. */
  name?: Matcher;
  /** Heading level. */
  level?: number;
  /** Include elements hidden from assistive technology (default false). */
  hidden?: boolean;
}

function headingLevel(el: Element): number {
  const aria = Number(el.getAttribute("aria-level"));
  if (aria > 0) return aria;
  const tag = /^h([1-6])$/.exec(el.localName);
  return tag ? Number(tag[1]) : 0;
}

/** Every element with the role (and name / level) inside root, in document order; root itself is included. */
export function allByRole(root: ParentNode, role: string, query: RoleQuery = {}): HTMLElement[] {
  const candidates = [...(root.nodeType === 1 ? [root as Element] : []), ...Array.from(root.querySelectorAll("*"))];
  return candidates.filter((el): el is HTMLElement => {
    if (roleOf(el) !== role) return false;
    if (!query.hidden && isHiddenFromAssistiveTech(el)) return false;
    if (query.level !== undefined && headingLevel(el) !== query.level) return false;
    return query.name === undefined || matches(accessibleName(el), query.name);
  });
}

const LABELLABLE = "input:not([type=hidden]), select, textarea, [role=textbox], [role=combobox], [role=listbox], [role=slider], [role=spinbutton], [role=searchbox], [role=switch], [role=checkbox], [role=radio]";

/** Form controls whose accessible name (label, aria-label, aria-labelledby) matches. */
export function allByLabel(root: ParentNode, label: Matcher): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(LABELLABLE)).filter((el) => !isHiddenFromAssistiveTech(el) && matches(accessibleName(el), label));
}

function listCandidates(elements: Element[]): string {
  return elements.length === 0 ? "none" : elements.map(describe).join("; ");
}

/** Exactly one match, or a descriptive error. */
export function one<T extends Element>(found: T[], what: string, hint: Element[] = []): T {
  if (found.length === 1) return found[0]!;
  throw new Error(
    found.length === 0
      ? `Expected one ${what} but found none.${hint.length > 0 ? ` Closest candidates: ${listCandidates(hint.slice(0, 12))}` : ""}`
      : `Expected one ${what} but found ${found.length}: ${listCandidates(found.slice(0, 12))}`,
  );
}

const FOCUSABLE = "a[href], area[href], button, input:not([type=hidden]), select, textarea, summary, [contenteditable=true], [tabindex]";

/** True when the Tab key stops on the element: focusable, not disabled, not inert, rendered, tabindex not negative. aria-hidden does not stop it. */
export function isTabStop(el: Element): boolean {
  if (!el.matches(FOCUSABLE) || el.matches(":disabled") || isNotRendered(el) || el.closest("[inert]")) return false;
  const index = el.getAttribute("tabindex");
  return index === null || Number(index) >= 0;
}

/**
 * Elements the Tab key visits, in document order. As in a browser, a group of radio buttons (same name, same form) is one stop:
 * the checked button, or the first when none is checked; the arrow keys move within the group.
 */
export function tabOrder(root: ParentNode): HTMLElement[] {
  const stops = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isTabStop);
  const groups = new Map<HTMLFormElement | null, Map<string, HTMLInputElement[]>>();
  for (const el of stops) {
    if (!el.matches("input[type=radio][name]")) continue;
    const radio = el as HTMLInputElement;
    const byName = groups.get(radio.form) ?? new Map<string, HTMLInputElement[]>();
    groups.set(radio.form, byName);
    byName.set(radio.name, [...(byName.get(radio.name) ?? []), radio]);
  }
  const skipped = new Set<HTMLElement>();
  for (const byName of groups.values()) {
    for (const members of byName.values()) {
      const entry = members.find((radio) => radio.checked) ?? members[0];
      for (const radio of members) if (radio !== entry) skipped.add(radio);
    }
  }
  return stops.filter((el) => !skipped.has(el));
}

/** A short, readable description of an element for failure messages: `button.btn "Submit for review"`. */
export function describe(el: Element): string {
  const id = el.id ? `#${el.id}` : "";
  const classes = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join("");
  const role = el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : "";
  const text = flatText(el, { ariaHidden: true }).slice(0, 40);
  return `${el.localName}${id}${classes}${role}${text ? ` "${text}"` : ""}`;
}

/** Where an element sits: `main#main > section.panel > table.data`, from the nearest landmark-ish ancestors down. */
export function pathOf(el: Element): string {
  const parts: string[] = [];
  for (let node: Element | null = el; node && node.localName !== "body" && parts.length < 5; node = node.parentElement) {
    const id = node.id ? `#${node.id}` : "";
    const first = (node.getAttribute("class") ?? "").split(/\s+/).find(Boolean);
    parts.unshift(`${node.localName}${id}${first ? `.${first}` : ""}`);
  }
  return parts.join(" > ");
}

/**
 * Every element that renders under root (root included), in document order. Skipped: `hidden`, display:none / visibility:hidden
 * set inline, closed dialogs, script / style / template / noscript / head content. aria-hidden and visually hidden elements are included.
 */
export function renderedElements(root: Element): Element[] {
  const out: Element[] = [];
  const visit = (el: Element): void => {
    if (NEVER_TEXT.has(el.localName) || el.hasAttribute("hidden") || styleHides(el) || (el.localName === "dialog" && !el.hasAttribute("open"))) return;
    out.push(el);
    for (const child of Array.from(el.children)) visit(child);
  };
  visit(root);
  return out;
}
