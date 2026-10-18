// Reusable accessibility / content audits for a rendered page. `auditPage(container)` returns findings (empty = clean); tests assert on them
// with `expectClean`, optionally through an allow-list of tolerated findings (each with a reason, so it can be deleted later).
//
//   (a) a.*  no NaN / undefined / null / Infinity / [object Object] / "not implemented" in anything that renders (text, aria-label, title,
//            placeholder, alt, input values), and no placeholder wording ("not built yet", "coming soon", TODO, a heading "Placeholder")
//   (b) b.*  accessible names for inputs, selects, textareas, buttons, links, interactive roles, dialogs and images; no positive tabindex;
//            no focusable content inside aria-hidden; no interactive element nested in a button or link
//   (c) c.*  no duplicate ids; aria-controls / -labelledby / -describedby / -owns / -activedescendant / -details / -errormessage and
//            label[for] point at elements that exist; a described-by target is not empty; aria state attributes carry valid values
//   (d) d.*  tables: a header exists when there are data cells, every th has a scope, every row is as wide as the header
//   (e) e.*  tabs: named tablist, tabs inside it, exactly one selected, roving tabindex, the selected tab controls a tabpanel that is
//            labelled by it, no orphan tabpanels
//   (f) f.*  headings: none empty, no skipped levels, and (page scope) exactly one h1 which comes first
//   (g) g.*  landmarks (page scope): one main, one banner, one contentinfo, named navs when there are several, named regions, a first-in-
//            tab-order skip link to #main and a focusable #main, a document title
//   (h) console errors and warnings are checked by the harness after every test (harness.tsx), not here.
//
// The shell's documented structure these audits encode: header.app-header > h1.app-title (the only h1); nav "Workspaces" (a menu button,
// then one link per workspace in a Fund and a Portfolio group); the
// fund rail nav "Funds"; main#main[tabindex=-1] holding h2.fund-header__name (fund workspaces) or h2.portfolio__title (portfolio
// workspaces) and h3 panels; footer.app-footer; fund header and panel headers are <header> elements inside main, which are not banners.
import { accessibleName, accessibleDescription, allByRole, describe, isHiddenFromAssistiveTech, isTabStop, pathOf, renderedElements, roleOf, tabOrder } from "./dom.ts";

export type AuditId = "a" | "b" | "c" | "d" | "e" | "f" | "g";

export interface Finding {
  audit: AuditId;
  /** Stable id such as "b.button-name"; allow-lists match on it. */
  rule: string;
  message: string;
  /** Where: the element and its ancestors. */
  where: string;
}

export interface AuditOptions {
  /** "page" (default): the whole application, so landmark and single-h1 rules apply. "fragment": a part rendered on its own. */
  scope?: "page" | "fragment";
  /** Run only these audits. */
  only?: readonly AuditId[];
}

type Report = (audit: AuditId, rule: string, message: string, el: Element) => void;

// ---------------------------------------------------------------------------------------------------------------- (a) text
const FORBIDDEN_TEXT: ReadonlyArray<{ rule: string; pattern: RegExp }> = [
  { rule: "a.nan", pattern: /\bNaN\b/ },
  { rule: "a.undefined", pattern: /\bundefined\b/i },
  { rule: "a.null", pattern: /\bnull\b/i },
  { rule: "a.infinity", pattern: /\bInfinity\b/i },
  { rule: "a.object-object", pattern: /\[object [A-Za-z]+\]/ },
  { rule: "a.not-implemented", pattern: /not implemented/i },
  { rule: "a.placeholder", pattern: /\bnot built yet\b|\bcoming soon\b|\blorem ipsum\b|\bTODO\b|\bTBD\b|^placeholder$/i },
];

const TEXT_ATTRIBUTES = ["aria-label", "title", "placeholder", "alt", "aria-valuetext", "aria-description", "aria-roledescription"];

function auditText(root: Element, report: Report): void {
  const check = (el: Element, text: string, source: string): void => {
    for (const { rule, pattern } of FORBIDDEN_TEXT) {
      if (pattern.test(text)) report("a", rule, `${source} "${text.length > 90 ? `${text.slice(0, 90)}…` : text}"`, el);
    }
  };
  for (const el of renderedElements(root)) {
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType !== 3) continue;
      const text = (node.nodeValue ?? "").replace(/\s+/g, " ").trim();
      if (text) check(el, text, "text");
    }
    for (const name of TEXT_ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value?.trim()) check(el, value.trim(), `${name}=`);
    }
    if ((el instanceof HTMLInputElement && el.type !== "hidden" && el.type !== "password") || el instanceof HTMLTextAreaElement) {
      if (el.value) check(el, el.value, "value");
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------- (b) names
const NAMED_ROLES = new Set([
  "checkbox",
  "radio",
  "switch",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "slider",
  "spinbutton",
  "combobox",
  "textbox",
  "searchbox",
  "listbox",
  "treeitem",
  "dialog",
  "alertdialog",
  "img",
]);

const INTERACTIVE = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"]';

function auditNames(root: Element, report: Report): void {
  for (const el of renderedElements(root)) {
    const tabindex = el.getAttribute("tabindex");
    if (tabindex !== null && Number(tabindex) > 0) report("b", "b.tabindex", `tabindex="${tabindex}" changes the tab order`, el);

    if (el.getAttribute("aria-hidden") === "true" && !el.parentElement?.closest('[aria-hidden="true"]')) {
      const stops = [el, ...Array.from(el.querySelectorAll("*"))].filter(isTabStop);
      if (stops.length > 0) report("b", "b.hidden-focusable", `aria-hidden content holds focusable ${stops.map(describe).slice(0, 3).join(", ")}`, el);
    }
    if (isHiddenFromAssistiveTech(el)) continue;

    const tag = el.localName;
    const role = roleOf(el);
    if (tag === "img" && !el.hasAttribute("alt") && role !== "presentation") report("b", "b.img-alt", "image without an alt attribute", el);

    const named = accessibleName(el) !== "";
    if (tag === "input" || tag === "select" || tag === "textarea") {
      if (!(tag === "input" && (el.getAttribute("type") ?? "").toLowerCase() === "hidden") && !named) report("b", "b.control-name", `${tag} has no accessible name (label, aria-label or aria-labelledby)`, el);
    } else if (tag === "button" || role === "button") {
      if (!named) report("b", "b.button-name", "button has no accessible name", el);
    } else if ((tag === "a" && el.hasAttribute("href")) || role === "link") {
      if (!named) report("b", "b.link-name", "link has no accessible name", el);
    } else if (tag !== "img" && role !== null && NAMED_ROLES.has(role) && !named) {
      report("b", "b.name", `${role} has no accessible name`, el);
    }

    if ((tag === "button" || tag === "a" || role === "button" || role === "link") && el.querySelector(INTERACTIVE)) {
      report("b", "b.nested-interactive", `${tag} contains another interactive element: ${describe(el.querySelector(INTERACTIVE)!)}`, el);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------- (c) ids and references
const REFERENCE_ATTRIBUTES = ["aria-controls", "aria-labelledby", "aria-describedby", "aria-owns", "aria-activedescendant", "aria-details", "aria-errormessage", "aria-flowto"];
const LABELABLE = new Set(["input", "select", "textarea", "button", "meter", "output", "progress"]);

const TRUE_FALSE = ["true", "false"];
const ARIA_VALUES: Record<string, readonly string[]> = {
  "aria-expanded": TRUE_FALSE,
  "aria-selected": TRUE_FALSE,
  "aria-disabled": TRUE_FALSE,
  "aria-hidden": TRUE_FALSE,
  "aria-required": TRUE_FALSE,
  "aria-busy": TRUE_FALSE,
  "aria-modal": TRUE_FALSE,
  "aria-readonly": TRUE_FALSE,
  "aria-multiselectable": TRUE_FALSE,
  "aria-atomic": TRUE_FALSE,
  "aria-pressed": ["true", "false", "mixed"],
  "aria-checked": ["true", "false", "mixed"],
  "aria-invalid": ["true", "false", "grammar", "spelling"],
  "aria-current": ["page", "step", "location", "date", "time", "true", "false"],
  "aria-live": ["off", "polite", "assertive"],
  "aria-sort": ["ascending", "descending", "none", "other"],
  "aria-haspopup": ["false", "true", "menu", "listbox", "tree", "grid", "dialog"],
};

function auditReferences(root: Element, report: Report): void {
  const doc = root.ownerDocument;
  const seen = new Map<string, Element>();
  for (const el of Array.from(doc.querySelectorAll("[id]"))) {
    if (el.id === "") continue;
    const first = seen.get(el.id);
    if (first) {
      if (root.contains(el) || root.contains(first)) report("c", "c.duplicate-id", `id "${el.id}" is used more than once (also ${describe(first)})`, el);
    } else seen.set(el.id, el);
  }

  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attribute of REFERENCE_ATTRIBUTES) {
      const value = el.getAttribute(attribute);
      if (value === null) continue;
      const ids = value.split(/\s+/).filter(Boolean);
      if (ids.length === 0) report("c", "c.missing-target", `${attribute} is empty`, el);
      const targets = ids.map((id) => doc.getElementById(id));
      ids.forEach((id, index) => {
        if (!targets[index]) report("c", "c.missing-target", `${attribute}="${id}" points at an id that does not exist`, el);
      });
      if (attribute === "aria-describedby") {
        const found = targets.filter((t): t is HTMLElement => t !== null);
        if (found.length > 0 && found.every((t) => accessibleDescription(el) === "" && (t.textContent ?? "").trim() === "")) {
          report("c", "c.empty-description", `aria-describedby="${value}" points at empty content`, el);
        }
      }
    }
    if (el.localName === "label" && el.hasAttribute("for")) {
      const target = doc.getElementById(el.getAttribute("for") ?? "");
      if (!target) report("c", "c.label-for", `label for="${el.getAttribute("for")}" has no target`, el);
      else if (!LABELABLE.has(target.localName)) report("c", "c.label-for", `label for="${el.getAttribute("for")}" points at a <${target.localName}>, which cannot be labelled`, el);
    }
    for (const [attribute, allowed] of Object.entries(ARIA_VALUES)) {
      const value = el.getAttribute(attribute);
      if (value !== null && !allowed.includes(value)) report("c", "c.aria-value", `${attribute}="${value}" (expected ${allowed.join(" | ")})`, el);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------- (d) tables
function span(cell: Element): number {
  const n = Number(cell.getAttribute("colspan") ?? 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function auditTables(root: Element, report: Report): void {
  const tables = renderedElements(root).filter((el): el is HTMLTableElement => el instanceof HTMLTableElement && !isHiddenFromAssistiveTech(el));
  for (const table of tables) {
    if (["presentation", "none"].includes(table.getAttribute("role") ?? "")) continue;
    const rows = Array.from(table.rows);
    const headers = Array.from(table.querySelectorAll("th"));
    const dataCells = Array.from(table.querySelectorAll("td"));
    if (dataCells.length > 0 && headers.length === 0) report("d", "d.no-header", "table has data cells but no th header cells", table);
    for (const th of headers) {
      if (!["col", "row", "colgroup", "rowgroup"].includes(th.getAttribute("scope") ?? "")) report("d", "d.th-scope", `th "${(th.textContent ?? "").trim().slice(0, 40)}" has no scope`, th);
    }
    if (Array.from(table.querySelectorAll("[rowspan]")).some((cell) => Number(cell.getAttribute("rowspan")) > 1)) continue;
    const headRows = rows.filter((row) => row.cells.length > 0 && Array.from(row.cells).every((cell) => cell.localName === "th") && row.parentElement?.localName !== "tbody");
    const headerWidth = Math.max(0, ...headRows.map((row) => Array.from(row.cells).reduce((sum, cell) => sum + span(cell), 0)));
    if (headerWidth === 0) continue;
    for (const row of rows) {
      if (headRows.includes(row)) continue;
      const width = Array.from(row.cells).reduce((sum, cell) => sum + span(cell), 0);
      if (width !== headerWidth) report("d", "d.column-count", `row has ${width} cells but the header has ${headerWidth} columns`, row);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------- (e) tabs
function auditTabs(root: Element, report: Report): void {
  const doc = root.ownerDocument;
  const all = allByRole(root, "tab", { hidden: true });
  const tablists = allByRole(root, "tablist", { hidden: true });
  for (const tab of all) {
    if (!tab.closest('[role="tablist"]')) report("e", "e.tab-parent", "tab is not inside a tablist", tab);
  }
  const controlled = new Set<string>();
  for (const list of tablists) {
    if (accessibleName(list) === "") report("e", "e.tablist-name", "tablist has no accessible name", list);
    const tabs = allByRole(list, "tab", { hidden: true });
    if (tabs.length === 0) report("e", "e.tablist-empty", "tablist has no tabs", list);
    const selected = tabs.filter((tab) => tab.getAttribute("aria-selected") === "true");
    if (tabs.length > 0 && selected.length !== 1) report("e", "e.selected-count", `${selected.length} tabs are selected (expected exactly 1)`, list);
    for (const tab of tabs) {
      const isSelected = tab.getAttribute("aria-selected") === "true";
      if (tab.getAttribute("aria-selected") === null) report("e", "e.aria-selected", "tab has no aria-selected", tab);
      const expected = isSelected ? "0" : "-1";
      if ((tab.getAttribute("tabindex") ?? (tab.localName === "button" ? "0" : "")) !== expected) {
        report("e", "e.roving-tabindex", `${isSelected ? "selected" : "unselected"} tab has tabindex=${tab.getAttribute("tabindex") ?? "(none)"}, expected ${expected}`, tab);
      }
      const controls = tab.getAttribute("aria-controls");
      if (controls) controlled.add(controls);
      if (!isSelected) continue;
      if (!tab.id) report("e", "e.tab-id", "selected tab has no id for its panel to reference", tab);
      const panel = controls ? doc.getElementById(controls) : null;
      if (!panel) report("e", "e.panel-missing", "selected tab does not control an existing element", tab);
      else {
        if (panel.getAttribute("role") !== "tabpanel") report("e", "e.panel-role", `the controlled element is ${describe(panel)}, not a tabpanel`, panel);
        if (!(panel.getAttribute("aria-labelledby") ?? "").split(/\s+/).includes(tab.id)) report("e", "e.panel-label", "tabpanel is not labelled by its tab", panel);
      }
    }
  }
  for (const panel of allByRole(root, "tabpanel", { hidden: true })) {
    if (!controlled.has(panel.id)) report("e", "e.panel-orphan", "tabpanel is not controlled by any tab", panel);
    if (accessibleName(panel) === "") report("e", "e.panel-name", "tabpanel has no accessible name", panel);
  }
}

// ---------------------------------------------------------------------------------------------------------------- (f) headings
function levelOf(heading: Element): number {
  const aria = Number(heading.getAttribute("aria-level"));
  return aria > 0 ? aria : Number(/^h([1-6])$/.exec(heading.localName)?.[1] ?? 0);
}

function auditHeadings(root: Element, report: Report, scope: "page" | "fragment"): void {
  const headings = allByRole(root, "heading");
  for (const heading of headings) {
    if (accessibleName(heading) === "") report("f", "f.empty-heading", `<${heading.localName}> is empty`, heading);
  }
  let previous = 0;
  for (const heading of headings) {
    const level = levelOf(heading);
    if (previous > 0 && level - previous > 1) report("f", "f.level-skip", `h${previous} is followed by h${level} "${accessibleName(heading).slice(0, 40)}"`, heading);
    previous = level;
  }
  if (scope !== "page") return;
  const h1s = headings.filter((h) => levelOf(h) === 1);
  if (h1s.length !== 1) report("f", "f.h1-count", `${h1s.length} h1 headings (expected 1): ${h1s.map(describe).join("; ") || "none"}`, root);
  const first = headings[0];
  if (first && levelOf(first) !== 1) report("f", "f.first-heading", `the first heading is ${describe(first)}, not the h1`, first);
}

// ---------------------------------------------------------------------------------------------------------------- (g) landmarks
function auditLandmarks(root: Element, report: Report): void {
  const doc = root.ownerDocument;
  const count = (role: string, expected: number, label: string): void => {
    const found = allByRole(root, role);
    if (found.length !== expected) report("g", `g.${label}-count`, `${found.length} ${role} landmarks (expected ${expected}): ${found.map(describe).join("; ") || "none"}`, root);
  };
  count("main", 1, "main");
  count("banner", 1, "banner");
  count("contentinfo", 1, "contentinfo");

  const navs = allByRole(root, "navigation");
  if (navs.length > 1) {
    const names = new Map<string, Element>();
    for (const nav of navs) {
      const name = accessibleName(nav);
      if (name === "") report("g", "g.nav-name", "navigation has no accessible name although the page has several", nav);
      else if (names.has(name)) report("g", "g.nav-unique", `two navigations are both named "${name}"`, nav);
      else names.set(name, nav);
    }
  }
  for (const region of allByRole(root, "region", { hidden: true })) {
    if (accessibleName(region) === "") report("g", "g.region-name", "region has no accessible name", region);
  }

  const skip = root.querySelector<HTMLAnchorElement>('a[href="#main"]');
  if (!skip) report("g", "g.skip-link", 'no skip link (a[href="#main"])', root);
  else {
    const firstStop = tabOrder(root)[0];
    if (firstStop !== skip) report("g", "g.skip-link", `the skip link is not the first stop in the tab order (first is ${firstStop ? describe(firstStop) : "none"})`, skip);
  }
  const main = doc.getElementById("main");
  if (!main) report("g", "g.skip-target", "no element with id=main for the skip link", root);
  else if (main.getAttribute("tabindex") !== "-1") report("g", "g.skip-target", `#main has tabindex=${main.getAttribute("tabindex") ?? "(none)"}; it needs -1 to take focus`, main);
  if (doc.title.trim() === "") report("g", "g.title", "the document has no title", root);
}

// ---------------------------------------------------------------------------------------------------------------- run
/** Runs the audits over a rendered tree. */
export function auditPage(root: Element, options: AuditOptions = {}): Finding[] {
  const scope = options.scope ?? "page";
  const only = options.only ? new Set<AuditId>(options.only) : null;
  const findings: Finding[] = [];
  const report: Report = (audit, rule, message, el) => {
    findings.push({ audit, rule, message, where: `${describe(el)} [${pathOf(el)}]` });
  };
  const run = (id: AuditId, fn: () => void): void => {
    if (!only || only.has(id)) fn();
  };
  run("a", () => auditText(root, report));
  run("b", () => auditNames(root, report));
  run("c", () => auditReferences(root, report));
  run("d", () => auditTables(root, report));
  run("e", () => auditTabs(root, report));
  run("f", () => auditHeadings(root, report, scope));
  if (scope === "page") run("g", () => auditLandmarks(root, report));
  return findings;
}

/** The audits for a part of the UI rendered on its own (no landmark or single-h1 rules). */
export function auditFragment(root: Element, options: Omit<AuditOptions, "scope"> = {}): Finding[] {
  return auditPage(root, { ...options, scope: "fragment" });
}

export function formatFindings(findings: readonly Finding[]): string {
  return findings.map((f) => `  [${f.rule}] ${f.message}\n      at ${f.where}`).join("\n");
}

// ---------------------------------------------------------------------------------------------------------------- allow-lists
export interface Allowance {
  /** A rule id such as "a.placeholder", or a pattern over rule ids. */
  rule: string | RegExp;
  /** Only findings whose message or location matches. */
  match?: RegExp;
  /** Why the finding is tolerated and when the entry can go. */
  reason: string;
}

function allows(allowance: Allowance, finding: Finding): boolean {
  const ruleOk = typeof allowance.rule === "string" ? allowance.rule === finding.rule : allowance.rule.test(finding.rule);
  return ruleOk && (!allowance.match || allowance.match.test(finding.message) || allowance.match.test(finding.where));
}

/** Splits findings into the ones an allowance covers and the rest; reports which allowances were used. */
export function applyAllowances(findings: readonly Finding[], allowances: readonly Allowance[]): { unexpected: Finding[]; tolerated: Finding[]; used: Set<Allowance> } {
  const unexpected: Finding[] = [];
  const tolerated: Finding[] = [];
  const used = new Set<Allowance>();
  for (const finding of findings) {
    const allowance = allowances.find((a) => allows(a, finding));
    if (allowance) {
      tolerated.push(finding);
      used.add(allowance);
    } else unexpected.push(finding);
  }
  return { unexpected, tolerated, used };
}

/** Throws with a readable list when there are findings. */
export function expectClean(findings: readonly Finding[], context = "page"): void {
  if (findings.length === 0) return;
  throw new Error(`${findings.length} audit finding${findings.length === 1 ? "" : "s"} on ${context}:\n${formatFindings(findings)}`);
}
