import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { LABEL_TYPE } from "../../src/app/charts/sankeyLabels.ts";

// Several layout behaviours live only in CSS, where no unit test can render them: a wide table must scroll inside the document instead of widening the
// page, the fund rail must fold into a button below 900px but always show in full from 900px up, screen-reader-only text must never widen the page, and
// the Sankey's label type must follow the size its label planner measured for. The browser checks are done by hand, so these tests read the rules and
// pin the declarations that behaviour depends on; a change that drops one of them fails here.

interface Rule {
  /** The at-rule the rule sits in, such as "@media (max-width: 899.98px)", or null at the top level. */
  context: string | null;
  selector: string;
  declarations: Map<string, string>;
}

const squash = (value: string): string => value.replace(/\s+/g, " ").trim();

/** A small reader for flat stylesheets: comments are dropped, and a rule inside an at-rule block carries that block's prelude as its context. */
function parseRules(source: string): Rule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  let pos = 0;

  const readBlock = (context: string | null): void => {
    while (pos < css.length) {
      const open = css.indexOf("{", pos);
      const close = css.indexOf("}", pos);
      if (close !== -1 && (open === -1 || close < open)) {
        pos = close + 1;
        return;
      }
      if (open === -1) return;
      const prelude = squash(css.slice(pos, open));
      pos = open + 1;
      if (prelude.startsWith("@")) {
        readBlock(prelude);
        continue;
      }
      const end = css.indexOf("}", pos);
      const declarations = new Map<string, string>();
      for (const part of css.slice(pos, end).split(";")) {
        const colon = part.indexOf(":");
        if (colon > 0) declarations.set(part.slice(0, colon).trim().toLowerCase(), squash(part.slice(colon + 1)));
      }
      pos = end + 1;
      for (const selector of prelude.split(",")) rules.push({ context, selector: squash(selector), declarations });
    }
  };

  readBlock(null);
  return rules;
}

const read = (path: string): Rule[] => parseRules(readFileSync(new URL(path, import.meta.url), "utf8"));

/** The value the cascade ends with for a selector in one context (the last declaration wins), or undefined when it is never set there. */
function declared(rules: Rule[], selector: string, property: string, context: string | null = null): string | undefined {
  return rules
    .filter((rule) => rule.selector === selector && rule.context === context)
    .map((rule) => rule.declarations.get(property))
    .filter((value): value is string => value !== undefined)
    .pop();
}

describe("the CSS reader", () => {
  const rules = parseRules(`
    /* ignored { display: none } */
    .a, .b { color: red; margin: 0  auto; }
    @media (max-width: 10px) { .a { color: blue; } .c { width: calc(1px + 2px); } }
    @keyframes spin { from { opacity: 0; } to { opacity: 1; } }
    .d { padding: 1px }
  `);

  it("keeps the selectors of a list apart and normalises spacing", () => {
    assert.equal(declared(rules, ".a", "color"), "red");
    assert.equal(declared(rules, ".b", "margin"), "0 auto");
  });

  it("reports the at-rule a rule sits in, and reads on after nested blocks", () => {
    assert.equal(declared(rules, ".a", "color", "@media (max-width: 10px)"), "blue");
    assert.equal(declared(rules, ".c", "width", "@media (max-width: 10px)"), "calc(1px + 2px)");
    assert.equal(declared(rules, "from", "opacity", "@keyframes spin"), "0");
    assert.equal(declared(rules, ".d", "padding"), "1px");
    assert.equal(declared(rules, ".c", "width"), undefined);
  });
});

describe("document layout (doc.css)", () => {
  const rules = read("../../src/app/doc/doc.css");

  it("gives the body one track that may shrink below its widest block", () => {
    assert.equal(declared(rules, ".doc__body", "display"), "grid");
    assert.equal(declared(rules, ".doc__body", "grid-template-columns"), "minmax(0, 1fr)");
  });

  it("lets the document and every block in it shrink, so a long table scrolls in its own box rather than widening the page", () => {
    assert.equal(declared(rules, ".doc", "min-width"), "0");
    assert.equal(declared(rules, ".doc__body > *", "min-width"), "0");
    assert.equal(declared(rules, ".doc__meta > *", "min-width"), "0");
  });

  it("wraps long unbroken text in the prose, key and value lists and the heading, but never inside table cells", () => {
    const wrapping = rules.filter((rule) => rule.declarations.get("overflow-wrap") === "anywhere").map((rule) => rule.selector);
    for (const selector of [".doc__title", ".doc__meta dd", ".doc__p", ".doc__kv-row dd", ".doc__footnotes li"]) {
      assert.ok(wrapping.includes(selector), selector);
    }
    assert.deepEqual(
      wrapping.filter((selector) => /table|\bth\b|\btd\b/.test(selector)),
      [],
    );
  });
});

describe("fund rail layout (shell.css)", () => {
  const rules = read("../../src/app/shell/shell.css");
  const wide = rules.find((rule) => rule.selector === ".fund-layout" && rule.context?.startsWith("@media (min-width:"));
  const breakpoint = Number(/min-width:\s*([\d.]+)px/.exec(wide?.context ?? "")?.[1]);
  const narrow = `@media (max-width: ${(breakpoint - 0.02).toFixed(2)}px)`;

  it("puts the rail in its own column from 900px up", () => {
    assert.equal(breakpoint, 900);
    assert.equal(declared(rules, ".fund-layout", "grid-template-columns", `@media (min-width: ${breakpoint}px)`), "var(--rail-width) minmax(0, 1fr)");
  });

  it("keeps the workspace column shrinkable, so wide content scrolls instead of widening the page", () => {
    assert.equal(declared(rules, ".fund-layout", "grid-template-columns"), "minmax(0, 1fr)");
    assert.equal(declared(rules, ".fund-main", "min-width"), "0");
  });

  it("hides the toggle button by default and shows it only below the breakpoint", () => {
    assert.equal(declared(rules, ".fund-rail__toggle", "display"), "none");
    assert.equal(declared(rules, ".fund-rail__toggle", "display", narrow), "flex");
    const shown = rules.filter((rule) => rule.selector === ".fund-rail__toggle" && (rule.declarations.get("display") ?? "none") !== "none");
    assert.deepEqual(
      shown.map((rule) => rule.context),
      [narrow],
    );
  });

  it("folds the list away only below the breakpoint, and only until the rail is opened", () => {
    const hiding = rules.filter((rule) => rule.selector.includes("fund-rail__panel") && rule.declarations.get("display") === "none");
    assert.deepEqual(
      hiding.map((rule) => [rule.context, rule.selector]),
      [[narrow, ".fund-rail:not(.fund-rail--open) .fund-rail__panel"]],
    );
  });

  it("never hides or restyles the list itself in a way that could fold it from 900px up", () => {
    const panelRules = rules.filter((rule) => rule.selector.includes("fund-rail__panel"));
    for (const rule of panelRules) {
      assert.equal(rule.context, narrow, rule.selector);
      for (const property of ["visibility", "height", "max-height", "overflow", "opacity", "position"]) {
        assert.equal(rule.declarations.has(property), false, `${rule.selector} sets ${property}`);
      }
    }
  });
});

describe("boxes that scroll sideways, and screen-reader-only text (components.css, base.css)", () => {
  const components = read("../../src/app/styles/components.css");
  const base = read("../../src/app/styles/base.css");

  it("positions every box that scrolls sideways, so hidden text inside it is clipped by that box and cannot widen the page", () => {
    for (const selector of [".table-scroll", ".tabs__list"]) {
      assert.equal(declared(components, selector, "overflow-x"), "auto", selector);
      assert.equal(declared(components, selector, "position"), "relative", selector);
    }
  });

  it("takes the visually hidden helper out of the flow and clips it to nothing, under both of its class names", () => {
    for (const selector of [".sr-only", ".visually-hidden"]) {
      assert.equal(declared(base, selector, "position"), "absolute", selector);
      assert.equal(declared(base, selector, "width"), "1px", selector);
      assert.equal(declared(base, selector, "height"), "1px", selector);
      assert.equal(declared(base, selector, "overflow"), "hidden", selector);
      assert.equal(declared(base, selector, "clip-path"), "inset(50%)", selector);
      assert.equal(declared(base, selector, "white-space"), "nowrap", selector);
    }
    const helper = base.filter((rule) => rule.selector === ".sr-only" || rule.selector === ".visually-hidden");
    assert.equal(helper.length, 2);
    assert.equal(helper[0]!.declarations, helper[1]!.declarations, "the two names must share one rule");
  });
});

describe("Sankey label type (charts.css)", () => {
  const rules = read("../../src/app/charts/charts.css");

  it("takes the label size from the variable the chart sets when it steps the type down, and otherwise the size the planner starts from", () => {
    assert.equal(declared(rules, ".sankey__label", "font-size"), `var(--sankey-label-size, ${LABEL_TYPE.size}px)`);
  });

  it("leaves the name and the amount to follow the label's size, and keeps the name at the weight the width estimate is for", () => {
    assert.equal(declared(rules, ".sankey__label-name", "font-size"), undefined);
    assert.equal(declared(rules, ".sankey__label-value", "font-size"), undefined);
    assert.equal(declared(rules, ".sankey__label-name", "font-weight"), "600");
  });
});
