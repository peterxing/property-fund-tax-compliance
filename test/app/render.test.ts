// Markup contract of the app shell, the UI primitives, DocView and the charts: roles, names, relationships and states that assistive
// technology depends on. The components are rendered to static markup (react-dom/server) from the dev fixtures, then queried with jsdom.
// Node's type stripping cannot load JSX, so test/app/render-entry.tsx is bundled with esbuild first.
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import type { SceneName } from "./render-entry.tsx";

const root = fileURLToPath(new URL("../../", import.meta.url));
const outDir = join(root, ".tmp", "render-test");
const outFile = join(outDir, `entry-${process.pid}.mjs`);

mkdirSync(outDir, { recursive: true });
await build({
  entryPoints: [join(root, "test", "app", "render-entry.tsx")],
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
const entry = (await import(pathToFileURL(outFile).href)) as typeof import("./render-entry.tsx");

after(() => {
  rmSync(outFile, { force: true });
});
const scene = (name: SceneName): DocumentFragment => JSDOM.fragment(entry.scenes[name]());

function one(root: ParentNode, selector: string): Element {
  const found = root.querySelector(selector);
  assert.ok(found, `expected an element matching ${selector}`);
  return found;
}
const all = (root: ParentNode, selector: string): Element[] => [...root.querySelectorAll(selector)];
const text = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const byId = (root: ParentNode, id: string): Element => one(root, `[id="${id}"]`);

/** The text of an element as assistive technology reads it: subtrees marked aria-hidden are left out. */
function readable(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return text(copy);
}

/** What the elements an attribute such as aria-describedby or aria-labelledby points at read as. */
function referenced(root: ParentNode, el: Element, attribute: string): string[] {
  return (el.getAttribute(attribute) ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => readable(byId(root, id)));
}

const field = (frag: DocumentFragment, label: string): Element => {
  const match = all(frag, ".field, .checkbox").find((el) => text(el.querySelector("label, .checkbox__label")).startsWith(label));
  assert.ok(match, `no field labelled ${label}`);
  return match;
};

describe("header", () => {
  const frag = scene("header");

  it("has the app title as the page's h1", () => {
    assert.equal(text(one(frag, "h1")), "Property Fund Tax Compliance");
  });

  it("lists the workspaces in two labelled groups and marks only the current one", () => {
    const nav = one(frag, 'nav[aria-label="Workspaces"]');
    assert.deepEqual(all(nav, ".app-nav__group-label").map(text), ["Fund", "Portfolio"]);
    const links = all(nav, "a");
    assert.deepEqual(
      links.map((a) => text(a)),
      [
        "Distributions",
        "Trial balance",
        "Tax returns",
        "Investor reporting",
        "Cost base & CGT",
        "GST & BAS",
        "Property taxes",
        "Assets & allowances",
        "Compare",
        "Bulk review",
        "Analytics",
        "Compliance calendar",
        "Risk register",
        "Calculators",
        "Rules & sources",
        "Data",
        "Access",
      ],
    );
    const current = all(nav, '[aria-current="page"]');
    assert.equal(current.length, 1);
    assert.equal(text(current[0]), "Analytics");
  });

  it("carries the selected fund on fund workspaces only", () => {
    const hrefs = Object.fromEntries(all(frag, "nav a").map((a) => [text(a), a.getAttribute("href")]));
    assert.equal(hrefs["Distributions"], "#/?fund=harbourline");
    assert.equal(hrefs["Trial balance"], "#/trial-balance?fund=harbourline");
    assert.equal(hrefs["Cost base & CGT"], "#/cost-base?fund=harbourline");
    assert.equal(hrefs["GST & BAS"], "#/gst?fund=harbourline");
    assert.equal(hrefs["Compare"], "#/compare?fund=harbourline");
    assert.equal(hrefs["Bulk review"], "#/bulk-review");
    assert.equal(hrefs["Analytics"], "#/analytics");
    assert.equal(hrefs["Data"], "#/data");
    assert.equal(hrefs["Access"], "#/access");
  });

  it("hides the nav icons from assistive technology", () => {
    const icons = all(frag, "nav svg");
    assert.equal(icons.length, 18);
    for (const icon of icons) assert.equal(icon.getAttribute("aria-hidden"), "true");
  });

  it("has a compact menu button that controls the grouped links", () => {
    const nav = one(frag, 'nav[aria-label="Workspaces"]');
    const button = one(nav, "button.app-nav__toggle");
    assert.equal(button.getAttribute("type"), "button");
    assert.equal(readable(button), "Workspaces");
    const panel = byId(frag, button.getAttribute("aria-controls") ?? "");
    assert.equal(button.getAttribute("aria-expanded"), "false");
    assert.ok(panel.classList.contains("app-nav__panel"));
    assert.equal(all(panel, "a").length, 17);
  });

  it("labels the persona switcher and selects the current persona", () => {
    const label = one(frag, "label.app-control__label");
    assert.equal(text(label), "Working as");
    const select = byId(frag, label.getAttribute("for") ?? "");
    assert.equal(select.tagName, "SELECT");
    const selected = all(select, "option").filter((o) => o.hasAttribute("selected"));
    assert.deepEqual(selected.map(text), ["L. Brennan — Reviewer"]);
    assert.equal(all(select, "option").length, 4);
  });

  it("offers the jurisdiction filter as one radio group", () => {
    const group = one(frag, "fieldset");
    assert.equal(text(one(group, "legend")), "Jurisdiction");
    const radios = all(group, 'input[type="radio"]');
    assert.deepEqual(radios.map((r) => r.getAttribute("value")), ["all", "AU", "SG"]);
    assert.equal(new Set(radios.map((r) => r.getAttribute("name"))).size, 1);
    assert.deepEqual(radios.filter((r) => r.hasAttribute("checked")).map((r) => r.getAttribute("value")), ["SG"]);
    assert.deepEqual(all(group, ".seg__label").map(text), ["All", "Australia", "Singapore"]);
  });
});

describe("fund rail", () => {
  const frag = scene("rail");

  it("groups the funds by market under labelled lists", () => {
    const nav = one(frag, 'nav[aria-label="Funds"]');
    const lists = all(nav, "ul");
    assert.equal(lists.length, 2);
    assert.deepEqual(
      lists.map((ul) => referenced(frag, ul, "aria-labelledby")[0]),
      ["Australia · AMIT · AUD", "Singapore · S-REIT · SGD"],
    );
    assert.deepEqual(
      lists.map((ul) => all(ul, "li").length),
      [4, 2],
    );
  });

  it("marks only the selected fund as current", () => {
    const current = all(frag, 'a[aria-current="page"]');
    assert.equal(current.length, 1);
    assert.equal(text(one(current[0], ".fund-rail__name")), "Southbank Industrial Partners Fund");
    assert.ok(current[0].classList.contains("fund-rail__item--selected"));
    assert.equal(all(frag, ".fund-rail__item--selected").length, 1);
  });

  it("links every fund to the address its owner computed", () => {
    assert.deepEqual(
      all(frag, "a.fund-rail__item").map((a) => a.getAttribute("href")),
      ["#/?fund=harbourline", "#/?fund=southbank", "#/?fund=wattle", "#/?fund=kurrajong", "#/?fund=telok-ayer", "#/?fund=loyang"],
    );
  });

  it("states status and exceptions in words, never by colour alone", () => {
    const southbank = one(frag, 'a[href="#/?fund=southbank"]');
    assert.equal(text(one(southbank, ".chip--status")), "In review");
    assert.equal(text(one(southbank, ".chip--danger")), "2 exceptions");
    assert.equal(text(one(frag, 'a[href="#/?fund=harbourline"] .chip-none')), "No exceptions");
    assert.equal(text(one(frag, 'a[href="#/?fund=kurrajong"] .chip--danger')), "1 exception");
  });

  it("names the market behind the decorative badge", () => {
    for (const label of all(frag, ".fund-rail__group-label")) {
      assert.equal(one(label, ":scope > span").getAttribute("aria-hidden"), "true");
    }
  });

  it("explains an empty rail, with a custom message when given", () => {
    assert.equal(text(one(scene("railEmpty"), ".fund-rail__empty")), "No funds assigned to this persona.");
    assert.equal(text(one(scene("railEmptyCustom"), ".fund-rail__empty")), "Nothing here.");
    assert.equal(all(scene("railEmpty"), "a").length, 0);
  });

  it("adds a Manage funds link for personas allowed to create or edit funds", () => {
    const link = one(scene("railManage"), ".fund-rail__manage-link");
    assert.equal(text(link), "Manage funds");
    assert.equal(link.getAttribute("href"), "#/data?tab=funds");
    assert.equal(one(scene("railEmptyManage"), ".fund-rail__manage-link").getAttribute("href"), "#/data?tab=funds");
    assert.equal(all(scene("rail"), ".fund-rail__manage-link").length, 0);
  });
});

describe("fund rail disclosure", () => {
  const frag = scene("rail");
  const toggle = (root: ParentNode): Element => one(root, "nav.fund-rail > button.fund-rail__toggle");

  it("folds the list behind one button that names the selected fund and its state", () => {
    const button = toggle(frag);
    assert.equal(button.getAttribute("type"), "button");
    assert.equal(readable(button), "Fund: Southbank Industrial Partners Fund In review 2 exceptions");
    assert.equal(all(frag, "button").length, 1);
  });

  it("starts folded and controls the one panel that holds both market lists", () => {
    const button = toggle(frag);
    assert.equal(button.getAttribute("aria-expanded"), "false");
    const panel = byId(frag, button.getAttribute("aria-controls") ?? "");
    assert.ok(panel.classList.contains("fund-rail__panel"));
    assert.equal(all(panel, "ul").length, 2);
    assert.equal(all(panel, "a.fund-rail__item").length, 6);
    assert.equal(all(frag, "a").length, 6);
    assert.equal(frag.querySelector(".fund-rail--open"), null);
  });

  it("puts the button before every fund, so the keyboard reaches it first", () => {
    const focusable = all(one(frag, "nav.fund-rail"), "button, a[href]");
    assert.deepEqual(
      focusable.map((el) => el.tagName),
      ["BUTTON", "A", "A", "A", "A", "A", "A"],
    );
  });

  it("hides the chevron from assistive technology", () => {
    assert.equal(one(toggle(frag), "svg").getAttribute("aria-hidden"), "true");
  });

  it("marks an open list with aria-expanded and the class the stylesheet keys on", () => {
    const open = scene("railOpen");
    assert.equal(toggle(open).getAttribute("aria-expanded"), "true");
    assert.ok(one(open, "nav.fund-rail").classList.contains("fund-rail--open"));
    assert.equal(readable(toggle(open)), "Fund: Kurrajong Stapled Property Trust Preparing 1 exception");
  });

  it("leaves out the exceptions chip when the selected fund has none", () => {
    const button = toggle(scene("railQuiet"));
    assert.equal(readable(button), "Fund: Wattle Retail Property Trust Signed off");
    assert.equal(all(button, ".chip--danger, .chip-none").length, 0);
  });

  it("says so when no fund is selected, and shows no status", () => {
    const none = scene("railNoSelection");
    const button = toggle(none);
    assert.equal(readable(button), "Fund: None selected");
    assert.equal(all(button, ".chip, .chip-none").length, 0);
    assert.equal(all(none, 'a[aria-current="page"]').length, 0);
  });

  it("has no button or panel when there is nothing to list", () => {
    for (const name of ["railEmpty", "railEmptyCustom"] as const) {
      assert.equal(all(scene(name), "button, .fund-rail__panel").length, 0, name);
    }
  });

  it("is one landmark named Funds, folded or open", () => {
    for (const name of ["rail", "railOpen", "railNoSelection", "railQuiet"] as const) {
      assert.equal(all(scene(name), 'nav[aria-label="Funds"]').length, 1, name);
    }
  });
});

describe("fund header", () => {
  const frag = scene("fundHeaderReview");

  it("heads the workspace with a focusable h2", () => {
    const heading = one(frag, "h2");
    assert.equal(text(heading), "Harbourline Office Trust");
    assert.equal(heading.getAttribute("tabindex"), "-1");
  });

  it("names the market and the status for screen readers", () => {
    assert.equal(text(one(frag, ".chip--market .sr-only")), "Australia");
    assert.equal(text(one(frag, ".chip--status")), "Workflow status: In review");
  });

  it("groups the workflow actions", () => {
    const group = one(frag, '[role="group"][aria-label="Workflow actions"]');
    assert.deepEqual(all(group, "button").map(text), ["Approve as reviewer", "Return to preparer", "Sign off"]);
  });

  it("keeps an unavailable action focusable and explains why", () => {
    const [approve, , signOff] = all(frag, ".fund-actions button");
    assert.equal(approve.hasAttribute("aria-disabled"), false);
    assert.equal(approve.hasAttribute("disabled"), false);
    assert.equal(approve.hasAttribute("aria-describedby"), false);
    assert.equal(signOff.getAttribute("aria-disabled"), "true");
    assert.equal(signOff.hasAttribute("disabled"), false);
    assert.deepEqual(referenced(frag, signOff, "aria-describedby"), ["Waiting for the reviewer and the tax agent to approve."]);
  });

  it("lists the facts as term and description pairs", () => {
    const facts = all(frag, "dl.fund-facts .fund-fact").map((row) => [text(one(row, "dt")), text(one(row, "dd"))]);
    assert.deepEqual(facts, [
      ["Regime", "AMIT · Office · Listed"],
      ["Period", "Income year ended 30 Jun 2026"],
      ["Units on issue", "412,000,000"],
      ["AMMA due", "30 Sep 2026"],
    ]);
  });

  it("shows the approval chain and links to the open queries", () => {
    const chain = one(frag, 'ul[aria-label="Approvals"]');
    assert.deepEqual(
      all(chain, ".fund-chain__step").map(text),
      ["Reviewer pending", "Tax agent pending", "Sign-off pending · Head of Tax"],
    );
    assert.equal(text(one(frag, ".fund-chain__label")), "Tax agent reviews and lodges");
    const link = one(chain, ".fund-chain__queries a");
    assert.equal(text(link), "2 open queries");
    assert.equal(link.getAttribute("href"), "#/?fund=harbourline&tab=queries");
  });

  it("drops what does not apply to a signed-off fund", () => {
    const signed = scene("fundHeaderSigned");
    assert.deepEqual(all(signed, "dl.fund-facts dt").map(text), ["Regime", "Period", "Units on issue"]);
    assert.deepEqual(all(signed, ".fund-actions button").map(text), ["Reopen"]);
    assert.equal(all(signed, ".fund-chain__queries").length, 0);
    assert.equal(all(signed, ".fund-chain__step--done").length, 3);
    assert.deepEqual(all(signed, "button[aria-disabled]"), []);
  });
});

describe("form fields", () => {
  const frag = scene("fields");

  it("ties each label to its control and the hint to the description", () => {
    const holder = field(frag, "Holder name");
    const input = one(holder, "input");
    assert.equal(one(holder, "label").getAttribute("for"), input.getAttribute("id"));
    assert.deepEqual(referenced(frag, input, "aria-describedby"), ["As on the register"]);
    assert.equal(input.hasAttribute("aria-invalid"), false);
  });

  it("flags an error and a required field", () => {
    const registry = field(frag, "Registry name");
    const input = one(registry, "input");
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.equal(input.getAttribute("aria-required"), "true");
    const error = one(registry, ".field__error");
    assert.equal(error.getAttribute("role"), "alert");
    assert.equal(error.getAttribute("id"), input.getAttribute("aria-describedby"));
    assert.equal(one(registry, ".field__required").getAttribute("aria-hidden"), "true");
  });

  it("shows money the way people type it, with the currency spoken", () => {
    const money = field(frag, "Cash distribution");
    const input = one(money, "input");
    assert.equal(input.getAttribute("value"), "1,250,000.50");
    assert.equal(input.getAttribute("inputmode"), "decimal");
    assert.equal(input.getAttribute("autocomplete"), "off");
    assert.equal(text(one(money, ".input-affix__prefix")), "A$");
    assert.equal(one(money, ".input-affix__prefix").getAttribute("aria-hidden"), "true");
    assert.deepEqual(referenced(frag, input, "aria-describedby"), ["Type 1,250,000", "Amount in Australian dollars"]);
    assert.deepEqual(referenced(frag, one(field(frag, "Required amount"), "input"), "aria-describedby"), ["Amount in Singapore dollars"]);
    assert.equal(one(field(frag, "Required amount"), "input").getAttribute("value"), "");
  });

  it("shows counts and rates with their own keyboard and suffix", () => {
    const units = one(field(frag, "Units on issue"), "input");
    assert.equal(units.getAttribute("value"), "412,000,000");
    assert.equal(units.getAttribute("inputmode"), "numeric");
    const rate = field(frag, "Withholding rate");
    assert.equal(one(rate, "input").getAttribute("inputmode"), "decimal");
    assert.equal(text(one(rate, ".input-affix__suffix")), "%");
  });

  it("renders native select, textarea, checkbox and segmented controls", () => {
    const select = one(field(frag, "Working as"), "select");
    assert.deepEqual(all(select, "option").map(text), ["Alpha", "Beta"]);
    assert.deepEqual(all(select, "option[selected]").map(text), ["Beta"]);
    assert.equal(text(one(field(frag, "Query"), "textarea")), "Please confirm.");
    const checkbox = field(frag, "Send a copy");
    assert.equal(one(checkbox, "input").getAttribute("type"), "checkbox");
    assert.ok(one(checkbox, "input").hasAttribute("checked"));
    assert.equal(one(checkbox, ".checkbox__box").getAttribute("aria-hidden"), "true");
    const segmented = one(frag, "fieldset.seg");
    assert.equal(text(one(segmented, "legend")), "Size");
    assert.deepEqual(all(segmented, "input:checked").map((i) => i.getAttribute("value")), ["b"]);
  });
});

describe("buttons and chips", () => {
  it("keeps an unavailable or busy button in the tab order and says so", () => {
    const [plain, unavailable, busy, download] = all(scene("buttons"), "button");
    assert.equal(plain.getAttribute("type"), "button");
    assert.equal(plain.hasAttribute("aria-disabled"), false);
    assert.equal(unavailable.getAttribute("aria-disabled"), "true");
    assert.equal(unavailable.hasAttribute("disabled"), false);
    assert.equal(unavailable.getAttribute("aria-describedby"), "why");
    assert.equal(busy.getAttribute("aria-busy"), "true");
    assert.equal(busy.getAttribute("aria-disabled"), "true");
    assert.equal(one(busy, ".spinner").getAttribute("aria-hidden"), "true");
    assert.equal(text(download), "Download CSV");
    assert.equal(one(download, "svg").getAttribute("aria-hidden"), "true");
  });

  it("spells out the market, the status and the exception count", () => {
    const frag = scene("badges");
    assert.deepEqual(all(frag, ".chip--market .sr-only").map(text), ["Australia", "Singapore"]);
    assert.deepEqual(all(frag, ".chip--market [aria-hidden]").map(text), ["AU", "SG"]);
    assert.deepEqual(all(frag, ".chip--status").map(text), ["Workflow status: Preparing", "In review"]);
    assert.deepEqual(all(frag, ".chip--danger, .chip-none").map(text), ["3 exceptions", "No exceptions"]);
  });
});

describe("surfaces", () => {
  const frag = scene("surfaces");

  it("announces an error banner but leaves an information banner silent", () => {
    const [error, info] = all(frag, ".banner");
    assert.equal(error.getAttribute("role"), "alert");
    assert.equal(text(one(error, ".banner__title")), "Could not save");
    assert.equal(info.hasAttribute("role"), false);
    assert.equal(all(frag, ".banner svg").every((icon) => icon.getAttribute("aria-hidden") === "true"), true);
  });

  it("renders KPIs as a labelled description list", () => {
    const kpis = one(frag, "dl.kpis");
    assert.equal(kpis.getAttribute("aria-label"), "Summary");
    assert.deepEqual(
      all(kpis, ".kpi").map((k) => [text(one(k, "dt")), text(one(k, ".kpi__value")), text(k.querySelector(".kpi__sub"))]),
      [
        ["Cash", "A$1", "per unit"],
        ["Exceptions", "2", ""],
      ],
    );
    assert.ok(one(kpis, ".kpi--bad"));
  });

  it("gives an empty state a heading at the requested level", () => {
    const empty = one(frag, ".empty");
    assert.equal(text(one(empty, "h3")), "Nothing yet");
    assert.equal(text(one(empty, ".empty__text")), "Add the first item.");
  });

  it("labels a panel by its heading", () => {
    const panel = one(frag, "section.panel");
    const heading = one(panel, "h3");
    assert.equal(panel.getAttribute("aria-labelledby"), heading.getAttribute("id"));
    assert.equal(text(heading), "Panel title");
    assert.equal(text(one(panel, ".panel__actions")), "Actions");
  });

  it("wraps a table without adding a tab stop until it overflows", () => {
    const wrapper = one(frag, ".table-scroll");
    assert.equal(wrapper.hasAttribute("tabindex"), false);
    assert.equal(wrapper.hasAttribute("role"), false);
    assert.equal(text(one(wrapper, "caption")), "Holders");
  });
});

describe("dialog", () => {
  it("mounts nothing and points at nothing while closed", () => {
    const dialog = one(scene("dialogClosed"), "dialog");
    assert.equal(dialog.hasAttribute("open"), false);
    assert.equal(dialog.hasAttribute("aria-labelledby"), false);
    assert.equal(dialog.hasAttribute("aria-describedby"), false);
    assert.equal(dialog.children.length, 0);
  });

  it("is named by its title and described by its description", () => {
    const frag = scene("dialogOpen");
    const dialog = one(frag, "dialog");
    assert.equal(dialog.hasAttribute("role"), false);
    assert.deepEqual(referenced(frag, dialog, "aria-labelledby"), ["Approve distribution"]);
    assert.deepEqual(referenced(frag, dialog, "aria-describedby"), ["This signs off the fund."]);
    assert.equal(one(dialog, ".dialog__title").tagName, "H2");
  });

  it("offers a labelled close button, the footer actions and one control for first focus", () => {
    const frag = scene("dialogOpen");
    assert.equal(one(frag, ".dialog__close").getAttribute("aria-label"), "Close dialog");
    assert.deepEqual(all(frag, ".dialog__footer button").map(text), ["Cancel", "Approve"]);
    assert.deepEqual(all(frag, "[data-autofocus]").map(text), ["Cancel"]);
  });

  it("carries its own live regions, because the page behind a modal is inert", () => {
    const dialog = one(scene("dialogOpen"), "dialog");
    assert.equal(all(dialog, '[role="status"][aria-live="polite"]').length, 1);
    assert.equal(all(dialog, '[role="alert"][aria-live="assertive"]').length, 1);
  });

  it("becomes an alertdialog that only the footer can close when it is not dismissible", () => {
    const frag = scene("dialogAlert");
    const dialog = one(frag, "dialog");
    assert.equal(dialog.getAttribute("role"), "alertdialog");
    assert.equal(all(frag, ".dialog__close").length, 0);
    assert.equal(dialog.hasAttribute("aria-describedby"), false);
  });
});
describe("tabs", () => {
  const frag = scene("tabs");

  it("is a labelled tablist with the selected tab in the tab order", () => {
    const list = one(frag, '[role="tablist"]');
    assert.equal(list.getAttribute("aria-label"), "Review");
    const tabs = all(list, '[role="tab"]');
    assert.deepEqual(tabs.map((t) => t.getAttribute("aria-selected")), ["false", "true"]);
    assert.deepEqual(tabs.map((t) => t.getAttribute("tabindex")), ["-1", "0"]);
    assert.equal(text(one(tabs[1], ".tabs__badge")), "3");
  });

  it("renders only the selected panel and links it both ways", () => {
    const panels = all(frag, '[role="tabpanel"]');
    assert.equal(panels.length, 1);
    assert.equal(text(panels[0]), "Statements content");
    const selected = one(frag, '[role="tab"][aria-selected="true"]');
    assert.equal(selected.getAttribute("aria-controls"), panels[0].getAttribute("id"));
    assert.equal(panels[0].getAttribute("aria-labelledby"), selected.getAttribute("id"));
  });
});

describe("document view", () => {
  const frag = scene("doc");

  it("is an article named by its title, with headings below the requested level", () => {
    const article = one(frag, "article.doc");
    const title = one(article, "h3");
    assert.equal(article.getAttribute("aria-labelledby"), title.getAttribute("id"));
    assert.equal(text(title), "AMIT member annual statement");
    assert.deepEqual(
      all(article, "h4, h5").map((h) => h.tagName),
      ["H4", "H5", "H5", "H5"],
    );
    assert.equal(all(article, "h1, h2, h6").length, 0);
  });

  it("lists the document details as term and description pairs", () => {
    const meta = all(frag, "dl.doc__meta > div").map((row) => [text(one(row, "dt")), text(one(row, "dd"))]);
    assert.deepEqual(meta[0], ["Income year", "Year ended 30 Jun 2026"]);
    assert.ok(meta.length >= 3);
  });

  it("gives every table column and row headers and a name", () => {
    const table = one(frag, "table.doc__table");
    const heading = referenced(frag, table, "aria-labelledby");
    assert.deepEqual(heading, ["Components"]);
    const columns = all(table, "thead th");
    assert.ok(columns.length >= 2);
    for (const th of columns) assert.equal(th.getAttribute("scope"), "col");
    for (const th of all(table, "tbody th, tfoot th")) assert.equal(th.getAttribute("scope"), "row");
    assert.equal(all(table, "tbody td").every((td) => td.classList.contains("num") || td.textContent === ""), true);
    assert.equal(text(one(table, "tfoot th")), "Total");
  });

  it("wraps every table in a scroll container, so a wide one scrolls inside the document", () => {
    for (const name of ["doc", "docWide"] as const) {
      const tables = all(scene(name), "table.doc__table");
      assert.ok(tables.length > 0, name);
      for (const table of tables) {
        const wrapper = table.closest(".table-scroll");
        assert.ok(wrapper, `${name}: table sits in a scroll container`);
        assert.ok(wrapper.closest(".doc__body"), `${name}: the scroll container is inside the document body`);
      }
    }
    assert.equal(all(one(scene("docWide"), "table.doc__table"), "thead th").length, 10);
  });
  it("names the key and value lists and the footnotes", () => {
    const kv = one(frag, "dl.doc__kv");
    assert.deepEqual(referenced(frag, kv, "aria-labelledby"), ["Withholding summary"]);
    assert.ok(one(kv, ".doc__kv-row--emphasis"));
    assert.equal(text(one(frag, ".doc__footnotes-title")), "Notes");
    assert.equal(all(frag, ".doc__footnotes ol li").length, 2);
  });
});

describe("charts", () => {
  it("describes a Sankey diagram as one image with a text summary", () => {
    const svg = one(scene("sankey"), "svg.sankey__svg");
    assert.equal(svg.getAttribute("role"), "img");
    const summary = svg.getAttribute("aria-label") ?? "";
    assert.match(summary, /^Distribution flow chart\. From: /);
    assert.match(summary, / To: Australian residents A\$26\.01m \(50\.0%\)/);
    assert.equal(text(one(svg, "title")), summary);
    assert.equal(svg.hasAttribute("tabindex"), false);
  });

  it("draws one link per source and destination and a visible label for each node", () => {
    const frag = scene("sankey");
    assert.equal(all(frag, "path.sankey__link").length, 24);
    for (const kind of ["gross", "net", "withheld", "unallocated"]) assert.equal(all(frag, `path.sankey__link--${kind}`).length, 6);
    assert.ok(all(frag, "svg text").length >= 10);
  });

  it("says so, in words, when there is nothing to chart", () => {
    const frag = scene("sankeyEmpty");
    assert.equal(all(frag, "svg").length, 0);
    assert.equal(text(one(frag, ".sankey__empty")), "Nothing to chart: there is no distribution to show.");
  });

  it("describes stacked bars as one image with the author's summary and a title on every segment", () => {
    const frag = scene("bars");
    const plot = one(frag, ".sbars__plot");
    assert.equal(plot.getAttribute("role"), "img");
    assert.equal(plot.getAttribute("aria-label"), "Southbank loses the most.");
    assert.equal(one(frag, ".sbars__grid").getAttribute("aria-hidden"), "true");
    const segments = all(frag, ".sbars__seg");
    assert.ok(segments.length >= 8);
    for (const segment of segments) assert.match(segment.getAttribute("title") ?? "", /: .+ \d+\.\d%$/);
    assert.equal(all(frag, ".sbars__label").length, all(frag, ".sbars__track").length);
  });

  it("shows the caller's message instead of an empty chart", () => {
    const frag = scene("barsEmpty");
    assert.equal(text(one(frag, ".sbars__empty")), "No funds to compare.");
    assert.equal(all(frag, ".sbars__plot").length, 0);
  });
});
