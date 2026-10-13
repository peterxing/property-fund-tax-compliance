// Self-tests for the audits (audit.ts): every rule fires on a small broken page and stays quiet on a correct one, so a clean sweep means something.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReactNode } from "react";
import { Tabs } from "../../src/app/ui/Tabs.tsx";
import { applyAllowances, auditFragment, auditPage, expectClean, formatFindings, type Allowance, type Finding } from "./audit.ts";
import { render } from "./harness.tsx";

interface Case {
  name: string;
  element: ReactNode;
  /** The rule ids the audit must report, exactly (each id once, whatever the count). */
  rules: readonly string[];
}

async function rulesFor(element: ReactNode, scope: "fragment" | "page"): Promise<{ rules: string[]; findings: Finding[] }> {
  const view = await render(<div>{element}</div>);
  try {
    const findings = scope === "page" ? auditPage(view.container) : auditFragment(view.container);
    return { rules: [...new Set(findings.map((f) => f.rule))].sort(), findings };
  } finally {
    await view.unmount();
  }
}

async function check(cases: readonly Case[], scope: "fragment" | "page" = "fragment"): Promise<void> {
  for (const { name, element, rules } of cases) {
    const found = await rulesFor(element, scope);
    assert.deepEqual(found.rules, [...rules].sort(), `${name}\n${formatFindings(found.findings)}`);
  }
}

describe("(a) text that should never reach a user", () => {
  it("flags NaN, undefined, null, Infinity, [object Object], 'not implemented' and placeholder wording in text", async () => {
    await check([
      { name: "NaN", element: <p>Total NaN</p>, rules: ["a.nan"] },
      { name: "undefined", element: <p>Rent is undefined</p>, rules: ["a.undefined"] },
      { name: "null", element: <p>Value: null</p>, rules: ["a.null"] },
      { name: "Infinity", element: <p>Yield Infinity%</p>, rules: ["a.infinity"] },
      { name: "[object Object]", element: <p>[object Object]</p>, rules: ["a.object-object"] },
      { name: "not implemented", element: <p>Not implemented</p>, rules: ["a.not-implemented"] },
      { name: "not built yet", element: <p>Trial balance is not built yet</p>, rules: ["a.placeholder"] },
      { name: "coming soon", element: <p>Coming soon</p>, rules: ["a.placeholder"] },
      { name: "TODO", element: <p>TODO write this</p>, rules: ["a.placeholder"] },
      { name: "TBD", element: <p>Due date TBD</p>, rules: ["a.placeholder"] },
      { name: "lorem ipsum", element: <p>Lorem ipsum dolor sit amet</p>, rules: ["a.placeholder"] },
      {
        name: "a heading that says Placeholder",
        element: <h3>Placeholder</h3>,
        rules: ["a.placeholder"],
      },
    ]);
  });

  it("looks in attributes and input values too, and in text a screen reader reads or that is aria-hidden", async () => {
    await check([
      { name: "aria-label", element: <button aria-label="NaN">x</button>, rules: ["a.nan"] },
      { name: "alt", element: <img alt="undefined" src="x.png" />, rules: ["a.undefined"] },
      { name: "title", element: <span title="null">x</span>, rules: ["a.null"] },
      { name: "placeholder", element: <input aria-label="Amount" placeholder="Infinity" />, rules: ["a.infinity"] },
      { name: "input value", element: <input aria-label="Amount" defaultValue="NaN" />, rules: ["a.nan"] },
      { name: "textarea value", element: <textarea aria-label="Notes" defaultValue="undefined" />, rules: ["a.undefined"] },
      { name: "sr-only text", element: <span className="sr-only">undefined</span>, rules: ["a.undefined"] },
      { name: "aria-hidden text", element: <p aria-hidden="true">NaN</p>, rules: ["a.nan"] },
      { name: "several at once", element: <p>NaN and undefined</p>, rules: ["a.nan", "a.undefined"] },
    ]);
  });

  it("leaves ordinary words, hidden content and password fields alone", async () => {
    await check([
      { name: "look-alike words", element: <p>Nancy buys bananas; annulled, nullify, Undefinedly</p>, rules: [] },
      { name: "hidden", element: <p hidden>NaN</p>, rules: [] },
      { name: "display none", element: <p style={{ display: "none" }}>undefined</p>, rules: [] },
      { name: "closed dialog", element: <dialog>null</dialog>, rules: [] },
      { name: "password", element: <input type="password" aria-label="Secret" defaultValue="null" />, rules: [] },
    ]);
  });
});

describe("(b) names and keyboard", () => {
  it("flags controls and images nobody can name, positive tabindex, focusable content in aria-hidden and nested interactive elements", async () => {
    await check([
      { name: "input", element: <input />, rules: ["b.control-name"] },
      {
        name: "select",
        element: (
          <select>
            <option>a</option>
          </select>
        ),
        rules: ["b.control-name"],
      },
      { name: "textarea", element: <textarea />, rules: ["b.control-name"] },
      { name: "button", element: <button type="button" />, rules: ["b.button-name"] },
      { name: "role=button", element: <div role="button" tabIndex={0} />, rules: ["b.button-name"] },
      { name: "link", element: <a href="#/x" />, rules: ["b.link-name"] },
      { name: "image", element: <img src="x.png" />, rules: ["b.img-alt"] },
      { name: "checkbox role", element: <div role="checkbox" aria-checked="false" tabIndex={0} />, rules: ["b.name"] },
      { name: "positive tabindex", element: <div tabIndex={3}>x</div>, rules: ["b.tabindex"] },
      {
        name: "focusable inside aria-hidden",
        element: (
          <div aria-hidden="true">
            <button type="button">Go</button>
          </div>
        ),
        rules: ["b.hidden-focusable"],
      },
      {
        name: "link inside a button",
        element: (
          <button type="button">
            Open <a href="#/x">link</a>
          </button>
        ),
        rules: ["b.nested-interactive"],
      },
      {
        name: "button inside a link",
        element: (
          <a href="#/x">
            <button type="button">Go</button>
          </a>
        ),
        rules: ["b.nested-interactive"],
      },
    ]);
  });

  it("accepts labels, aria-label, aria-labelledby, visible text, alt (even empty) and hidden controls", async () => {
    await check([
      {
        name: "named controls",
        element: (
          <>
            <label>
              Name <input />
            </label>
            <label htmlFor="amount">Amount</label>
            <input id="amount" />
            <input aria-label="Search" />
            <span id="who">Who</span>
            <input aria-labelledby="who" />
            <select aria-label="Pick">
              <option>a</option>
            </select>
            <textarea aria-label="Notes" />
            <button type="button">Save</button>
            <button type="button" aria-label="Close" />
            <button type="button">
              <svg aria-hidden="true" />
              <span>Icon button</span>
            </button>
            <a href="#/x">Home</a>
            <a href="#/y" aria-label="Back" />
            <img alt="Logo" src="x.png" />
            <img alt="" src="x.png" />
            <input type="hidden" />
          </>
        ),
        rules: [],
      },
      {
        name: "hidden controls",
        element: (
          <div hidden>
            <input />
            <button type="button" />
          </div>
        ),
        rules: [],
      },
    ]);
  });
});

describe("(c) ids and references", () => {
  it("flags duplicate ids, dangling references, empty descriptions, bad label targets and invalid ARIA states", async () => {
    await check([
      {
        name: "duplicate id",
        element: (
          <>
            <p id="dup">x</p>
            <p id="dup">y</p>
          </>
        ),
        rules: ["c.duplicate-id"],
      },
      { name: "aria-controls to nowhere", element: <button type="button" aria-controls="nope">x</button>, rules: ["c.missing-target"] },
      { name: "aria-labelledby to nowhere", element: <div role="group" aria-labelledby="nope">x</div>, rules: ["c.missing-target"] },
      { name: "empty aria-describedby", element: <button type="button" aria-describedby="">x</button>, rules: ["c.missing-target"] },
      {
        name: "described by empty content",
        element: (
          <>
            <button type="button" aria-describedby="why">
              x
            </button>
            <p id="why" />
          </>
        ),
        rules: ["c.empty-description"],
      },
      { name: "label for nothing", element: <label htmlFor="nope">x</label>, rules: ["c.label-for"] },
      {
        name: "label for a div",
        element: (
          <>
            <label htmlFor="box">x</label>
            <div id="box" />
          </>
        ),
        rules: ["c.label-for"],
      },
      { name: "aria-expanded=yes", element: <button type="button" aria-expanded={"yes" as unknown as boolean}>x</button>, rules: ["c.aria-value"] },
      { name: "aria-current=soon", element: <a href="#/x" aria-current={"soon" as "page"}>x</a>, rules: ["c.aria-value"] },
    ]);
  });

  it("accepts references that resolve, described content and the full set of valid ARIA values", async () => {
    await check([
      {
        name: "valid references",
        element: (
          <>
            <button type="button" aria-describedby="why" aria-controls="panel" aria-pressed="mixed" aria-expanded="false">
              Approve
            </button>
            <p id="why">You submitted this fund</p>
            <div id="panel" />
            <label htmlFor="i">Name</label>
            <input id="i" />
            <a href="#/x" aria-current="page">
              Here
            </a>
            <div role="status" aria-live="polite" aria-atomic="true" />
          </>
        ),
        rules: [],
      },
    ]);
  });
});

describe("(d) tables", () => {
  it("flags a table without headers, a th without scope and rows of the wrong width", async () => {
    await check([
      {
        name: "no header",
        element: (
          <table>
            <tbody>
              <tr>
                <td>1</td>
              </tr>
            </tbody>
          </table>
        ),
        rules: ["d.no-header"],
      },
      {
        name: "th without scope",
        element: (
          <table>
            <thead>
              <tr>
                <th>Head</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
              </tr>
            </tbody>
          </table>
        ),
        rules: ["d.th-scope"],
      },
      {
        name: "row too narrow",
        element: (
          <table>
            <thead>
              <tr>
                <th scope="col">A</th>
                <th scope="col">B</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
              </tr>
            </tbody>
          </table>
        ),
        rules: ["d.column-count"],
      },
    ]);
  });

  it("accepts row headers, colspans, layout tables and hidden tables", async () => {
    await check([
      {
        name: "proper table",
        element: (
          <table>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Rent</th>
                <td>1,000</td>
              </tr>
              <tr>
                <td colSpan={2}>Merged</td>
              </tr>
            </tbody>
          </table>
        ),
        rules: [],
      },
      {
        name: "layout table",
        element: (
          <table role="presentation">
            <tbody>
              <tr>
                <td>1</td>
              </tr>
            </tbody>
          </table>
        ),
        rules: [],
      },
      {
        name: "hidden table",
        element: (
          <table hidden>
            <tbody>
              <tr>
                <td>1</td>
              </tr>
            </tbody>
          </table>
        ),
        rules: [],
      },
    ]);
  });
});

describe("(e) tabs", () => {
  it("accepts the app's own Tabs, whichever tab is selected", async () => {
    const tabs = [
      { id: "one", label: "One" },
      { id: "two", label: "Two", badge: 3 },
    ];
    for (const value of ["one", "two"]) {
      const view = await render(
        <Tabs tabs={tabs} value={value} onValueChange={() => {}} label="Sections">
          <Tabs.Panel id="one">First</Tabs.Panel>
          <Tabs.Panel id="two">Second</Tabs.Panel>
        </Tabs>,
      );
      expectClean(auditFragment(view.container), `Tabs with "${value}" selected`);
      await view.unmount();
    }
  });

  const tab = (props: Record<string, unknown> = {}) => (
    <button type="button" role="tab" id="t1" aria-selected="true" aria-controls="p1" tabIndex={0} {...props}>
      One
    </button>
  );
  const panel = (props: Record<string, unknown> = {}) => (
    <div role="tabpanel" id="p1" aria-labelledby="t1" tabIndex={0} {...props}>
      Body
    </div>
  );
  const list = (children: ReactNode, props: Record<string, unknown> = {}) => (
    <div role="tablist" aria-label="Sections" {...props}>
      {children}
    </div>
  );

  it("flags a broken tablist", async () => {
    await check([
      { name: "well formed (control)", element: <>{list(tab())}{panel()}</>, rules: [] },
      { name: "tab outside a tablist", element: tab({ "aria-controls": undefined }), rules: ["e.tab-parent"] },
      { name: "unnamed tablist", element: <>{list(tab(), { "aria-label": undefined })}{panel()}</>, rules: ["e.tablist-name"] },
      { name: "empty tablist", element: list(null), rules: ["e.tablist-empty"] },
      {
        name: "nothing selected",
        element: <>{list(tab({ "aria-selected": "false", tabIndex: -1 }))}{panel()}</>,
        rules: ["e.selected-count"],
      },
      {
        name: "two selected",
        element: (
          <>
            {list(
              <>
                {tab()}
                {tab({ id: "t2", "aria-controls": "p2" })}
              </>,
            )}
            {panel()}
            {panel({ id: "p2", "aria-labelledby": "t2" })}
          </>
        ),
        rules: ["e.selected-count"],
      },
      { name: "no aria-selected", element: <>{list(<>{tab()}{tab({ id: "t2", "aria-selected": undefined, tabIndex: -1, "aria-controls": undefined })}</>)}{panel()}</>, rules: ["e.aria-selected"] },
      { name: "selected tab can be tabbed away from", element: <>{list(tab({ tabIndex: -1 }))}{panel()}</>, rules: ["e.roving-tabindex"] },
      {
        name: "unselected tab in the tab order",
        element: <>{list(<>{tab()}{tab({ id: "t2", "aria-selected": "false", "aria-controls": undefined })}</>)}{panel()}</>,
        rules: ["e.roving-tabindex"],
      },
      {
        name: "selected tab without an id",
        element: <>{list(tab({ id: undefined }))}{panel({ "aria-labelledby": undefined, "aria-label": "Body" })}</>,
        rules: ["e.tab-id"],
      },
      { name: "selected tab controls nothing", element: list(tab({ "aria-controls": undefined })), rules: ["e.panel-missing"] },
      { name: "controlled element is not a tabpanel", element: <>{list(tab())}{panel({ role: undefined })}</>, rules: ["e.panel-role"] },
      { name: "panel not labelled by its tab", element: <>{list(tab())}{panel({ "aria-labelledby": "other", "aria-label": "Body" })}<p id="other">x</p></>, rules: ["e.panel-label"] },
      { name: "panel nobody controls", element: <>{list(tab())}{panel()}{panel({ id: "p9", "aria-label": "Orphan" })}</>, rules: ["e.panel-orphan"] },
      { name: "unnamed panel", element: <>{list(tab())}{panel()}{panel({ id: "p8", "aria-labelledby": undefined })}</>, rules: ["e.panel-name", "e.panel-orphan"] },
    ]);
  });
});

describe("(f) headings", () => {
  it("flags empty headings and skipped levels, and accepts a tidy outline", async () => {
    await check([
      { name: "empty heading", element: <h2 />, rules: ["f.empty-heading"] },
      {
        name: "skipped level",
        element: (
          <>
            <h2>A</h2>
            <h4>B</h4>
          </>
        ),
        rules: ["f.level-skip"],
      },
      {
        name: "tidy outline that goes back up",
        element: (
          <>
            <h2>A</h2>
            <h3>B</h3>
            <h4>C</h4>
            <h2>D</h2>
            <h3>E</h3>
          </>
        ),
        rules: [],
      },
      {
        name: "aria-level counts",
        element: (
          <>
            <h2>A</h2>
            <div role="heading" aria-level={5}>
              B
            </div>
          </>
        ),
        rules: ["f.level-skip"],
      },
    ]);
  });
});

const TITLE = "Audit self-test";
const skeleton = (main: ReactNode = <h2>Fund</h2>) => (
  <>
    <a className="skip-link" href="#main">
      Skip to content
    </a>
    <header>
      <h1>Property Fund Tax Compliance</h1>
      <nav aria-label="Workspaces">
        <a href="#/">Home</a>
      </nav>
    </header>
    <main id="main" tabIndex={-1}>
      {main}
    </main>
    <footer>
      <p>Demonstration only.</p>
    </footer>
  </>
);

describe("(f, g) the whole page", () => {
  it("accepts the skeleton the shell follows", async () => {
    document.title = TITLE;
    await check([{ name: "skeleton", element: skeleton(), rules: [] }], "page");
  });

  it("flags a missing or doubled main, banner, contentinfo, h1, skip link, skip target and title", async () => {
    document.title = TITLE;
    await check(
      [
        {
          name: "no main",
          element: (
            <>
              <a href="#main">Skip</a>
              <header>
                <h1>T</h1>
              </header>
              <div id="main" tabIndex={-1} />
              <footer>f</footer>
            </>
          ),
          rules: ["g.main-count"],
        },
        { name: "two mains", element: skeleton(<><h2>A</h2><main id="second"><h3>B</h3></main></>), rules: ["g.main-count"] },
        {
          name: "no banner",
          element: (
            <>
              <a href="#main">Skip</a>
              <main id="main" tabIndex={-1}>
                <h1>T</h1>
              </main>
              <footer>f</footer>
            </>
          ),
          rules: ["g.banner-count"],
        },
        {
          name: "no footer",
          element: (
            <>
              <a href="#main">Skip</a>
              <header>
                <h1>T</h1>
              </header>
              <main id="main" tabIndex={-1}>
                <h2>A</h2>
              </main>
            </>
          ),
          rules: ["g.contentinfo-count"],
        },
        {
          name: "no h1",
          element: (
            <>
              <a href="#main">Skip</a>
              <header />
              <main id="main" tabIndex={-1}>
                <h2>A</h2>
              </main>
              <footer>f</footer>
            </>
          ),
          rules: ["f.h1-count", "f.first-heading"],
        },
        { name: "two h1", element: skeleton(<h1>Second</h1>), rules: ["f.h1-count"] },
        {
          name: "no skip link",
          element: (
            <>
              <header>
                <h1>T</h1>
              </header>
              <main id="main" tabIndex={-1}>
                <h2>A</h2>
              </main>
              <footer>f</footer>
            </>
          ),
          rules: ["g.skip-link"],
        },
        {
          name: "something comes before the skip link",
          element: (
            <>
              <button type="button">Menu</button>
              <a href="#main">Skip</a>
              <header>
                <h1>T</h1>
              </header>
              <main id="main" tabIndex={-1}>
                <h2>A</h2>
              </main>
              <footer>f</footer>
            </>
          ),
          rules: ["g.skip-link"],
        },
        {
          name: "main cannot take focus",
          element: (
            <>
              <a href="#main">Skip</a>
              <header>
                <h1>T</h1>
              </header>
              <main id="main">
                <h2>A</h2>
              </main>
              <footer>f</footer>
            </>
          ),
          rules: ["g.skip-target"],
        },
        {
          name: "a second unnamed navigation",
          element: skeleton(
            <>
              <h2>A</h2>
              <nav>
                <a href="#/b">B</a>
              </nav>
            </>,
          ),
          rules: ["g.nav-name"],
        },
        {
          name: "two navigations with one name",
          element: skeleton(
            <>
              <h2>A</h2>
              <nav aria-label="Workspaces">
                <a href="#/b">B</a>
              </nav>
            </>,
          ),
          rules: ["g.nav-unique"],
        },
        { name: "unnamed region", element: skeleton(<><h2>A</h2><div role="region">x</div></>), rules: ["g.region-name"] },
      ],
      "page",
    );
  });

  it("flags a page with no title", async () => {
    document.title = "";
    await check([{ name: "title", element: skeleton(), rules: ["g.title"] }], "page");
  });

  it("does not apply the page rules to a fragment", async () => {
    await check([{ name: "bare fragment", element: <h3>Only a panel</h3>, rules: [] }], "fragment");
  });
});

describe("running the audits", () => {
  it("can be limited to some audits", async () => {
    const view = await render(
      <div>
        <p>NaN</p>
        <input />
      </div>,
    );
    assert.deepEqual([...new Set(auditPage(view.container, { only: ["a"], scope: "fragment" }).map((f) => f.rule))], ["a.nan"]);
    assert.deepEqual([...new Set(auditPage(view.container, { only: ["b"], scope: "fragment" }).map((f) => f.rule))], ["b.control-name"]);
    assert.deepEqual(auditPage(view.container, { only: ["c", "d", "e", "f"], scope: "fragment" }), []);
  });

  it("reports where a finding is, in words", async () => {
    const view = await render(
      <main id="main">
        <section className="panel">
          <p className="note">Total NaN</p>
        </section>
      </main>,
    );
    const [finding] = auditFragment(view.container);
    assert.equal(finding?.audit, "a");
    assert.match(finding?.message ?? "", /text "Total NaN"/);
    assert.match(finding?.where ?? "", /p\.note "Total NaN" \[.*main#main > section\.panel > p\.note\]/);
  });

  it("expectClean throws a readable list and passes an empty one", async () => {
    const view = await render(
      <div>
        <p>NaN</p>
        <p>undefined</p>
      </div>,
    );
    const findings = auditFragment(view.container);
    assert.throws(() => expectClean(findings, "the sample page"), /2 audit findings on the sample page:\n {2}\[a\.nan\] text "NaN"[\s\S]*\[a\.undefined\]/);
    expectClean([]);
  });
});

describe("allow-lists", () => {
  const finding = (rule: string, message: string, where = "p"): Finding => ({ audit: rule[0] as Finding["audit"], rule, message, where });
  const findings = [finding("a.placeholder", 'text "Placeholder"'), finding("a.placeholder", 'text "Trial balance is not built yet"'), finding("b.button-name", "button has no accessible name", "button.btn")];

  it("tolerates findings by rule id, by pattern and by message or location, and reports which entries were used", () => {
    const placeholder: Allowance = { rule: "a.placeholder", reason: "workspace not built yet" };
    const onlyTrialBalance: Allowance = { rule: "a.placeholder", match: /Trial balance/, reason: "x" };
    const anyB: Allowance = { rule: /^b\./, match: /button\.btn/, reason: "matched through the location" };
    const stale: Allowance = { rule: "d.no-header", reason: "never happens" };

    const all = applyAllowances(findings, [placeholder, anyB, stale]);
    assert.equal(all.unexpected.length, 0);
    assert.equal(all.tolerated.length, 3);
    assert.deepEqual([...all.used], [placeholder, anyB]);

    const narrow = applyAllowances(findings, [onlyTrialBalance]);
    assert.deepEqual(narrow.tolerated.map((f) => f.message), ['text "Trial balance is not built yet"']);
    assert.deepEqual(narrow.unexpected.map((f) => f.rule), ["a.placeholder", "b.button-name"]);
  });

  it("gives each finding to the first entry that matches", () => {
    const first: Allowance = { rule: "a.placeholder", reason: "1" };
    const second: Allowance = { rule: /^a\./, reason: "2" };
    assert.deepEqual([...applyAllowances(findings, [first, second]).used], [first]);
    assert.deepEqual([...applyAllowances(findings, [second, first]).used], [second]);
  });
});
