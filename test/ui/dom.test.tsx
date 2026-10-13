// Self-tests for the DOM helpers (dom.ts): the text, role and name rules the harness and the audits are built on.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accessibleDescription, accessibleName, allByRole, describe as describeElement, flatText, isHiddenFromAssistiveTech, isNotRendered, isTabStop, matches, pathOf, renderedElements, roleOf, tabOrder, visibleText } from "./dom.ts";
import { render } from "./harness.tsx";

describe("visibleText", () => {
  it("puts blocks on their own lines, separates table cells with tabs and joins inline text", async () => {
    const view = await render(
      <div>
        <h2>Title</h2>
        <p>
          One <strong>two</strong>
          <em>three</em> four
        </p>
        <ul>
          <li>a</li>
          <li>b</li>
        </ul>
        <table>
          <tbody>
            <tr>
              <th scope="row">Rent</th>
              <td>1,000</td>
              <td>2,000</td>
            </tr>
          </tbody>
        </table>
        <p>
          line<br />break
        </p>
      </div>,
    );
    assert.equal(view.text(), "Title\nOne twothree four\na\nb\nRent\t1,000\t2,000\nline\nbreak");
    assert.equal(view.flat(), "Title One twothree four a b Rent 1,000 2,000 line break");
  });

  it("collapses runs of spaces and no-break spaces, and drops blank lines", async () => {
    const view = await render(
      <div>
        <p>{"  a   b\u00a0\u00a0c  "}</p>
        <p> </p>
        <p>d</p>
      </div>,
    );
    assert.equal(view.text(), "a b c\nd");
  });

  it("skips what nobody can read: hidden, display:none, visibility:hidden, aria-hidden, scripts, styles, closed dialogs, closed details", async () => {
    const view = await render(
      <div>
        <p>shown</p>
        <p hidden>hidden attribute</p>
        <p style={{ display: "none" }}>display none</p>
        <p style={{ visibility: "hidden" }}>visibility hidden</p>
        <p aria-hidden="true">aria hidden</p>
        <dialog>closed dialog</dialog>
        <dialog open>open dialog</dialog>
        <details>
          <summary>Summary closed</summary>
          <p>details body closed</p>
        </details>
        <details open>
          <summary>Summary open</summary>
          <p>details body open</p>
        </details>
      </div>,
    );
    // React refuses <script> in its tree, so these go in by hand.
    for (const [tag, text] of [["script", "script text"], ["style", "p { color: red }"], ["noscript", "noscript text"]] as const) {
      const el = document.createElement(tag);
      el.textContent = text;
      view.container.append(el);
    }
    const template = document.createElement("template");
    template.innerHTML = "<p>template text</p>";
    view.container.append(template);
    assert.equal(view.text(), "shown\nopen dialog\nSummary closed\nSummary open\ndetails body open");
  });

  it("keeps visually hidden text for screen readers by default, and reads the aria-hidden badge on request", async () => {
    const view = await render(
      <p>
        <span className="sr-only">Australia </span>
        <span aria-hidden="true">AU</span> fund
      </p>,
    );
    assert.equal(view.text(), "Australia fund");
    assert.equal(visibleText(view.container, { screenReader: false }), "fund");
    assert.equal(visibleText(view.container, { ariaHidden: true }), "Australia AU fund");
    assert.equal(visibleText(view.container, { ariaHidden: true, screenReader: false }), "AU fund");
    assert.equal(flatText(view.container, { ariaHidden: true }), "Australia AU fund");
  });

  it("does not read form control values as text", async () => {
    const view = await render(
      <div>
        <input defaultValue="typed" aria-label="Typed" />
        <textarea defaultValue="notes" aria-label="Notes" />
        <select defaultValue="b" aria-label="Pick">
          <option value="a">Alpha</option>
          <option value="b">Beta</option>
        </select>
      </div>,
    );
    assert.equal(view.text(), "Alpha\nBeta");
  });
});

describe("roleOf", () => {
  it("knows the implicit roles of the elements the app uses", async () => {
    const view = await render(
      <div>
        <a href="#x">link</a>
        <a>no href</a>
        <button>b</button>
        <input aria-label="t" />
        <input type="checkbox" aria-label="c" />
        <input type="radio" aria-label="r" />
        <input type="range" aria-label="s" />
        <input type="hidden" />
        <select aria-label="one" />
        <select aria-label="many" multiple />
        <textarea aria-label="area" />
        <h3>h</h3>
        <ul>
          <li>i</li>
        </ul>
        <table>
          <thead>
            <tr>
              <th scope="col">h</th>
              <th scope="row">r</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>d</td>
            </tr>
          </tbody>
        </table>
        <img alt="" src="x.png" />
        <img alt="logo" src="x.png" />
        <fieldset>
          <legend>f</legend>
        </fieldset>
        <dialog open />
        <output>o</output>
        <hr />
      </div>,
    );
    const roles = (selector: string) => view.$$(selector).map((el) => roleOf(el));
    assert.deepEqual(roles("a"), ["link", null]);
    assert.equal(roleOf(view.$("button")), "button");
    assert.deepEqual(roles("input"), ["textbox", "checkbox", "radio", "slider", null]);
    assert.deepEqual(roles("select"), ["combobox", "listbox"]);
    assert.equal(roleOf(view.$("textarea")), "textbox");
    assert.equal(roleOf(view.$("h3")), "heading");
    assert.deepEqual([view.$("ul"), view.$("li")].map((el) => roleOf(el)), ["list", "listitem"]);
    assert.deepEqual(roles("th"), ["columnheader", "rowheader"]);
    assert.deepEqual([view.$("table"), view.$("thead"), view.$("tr"), view.$("td")].map((el) => roleOf(el)), ["table", "rowgroup", "row", "cell"]);
    assert.deepEqual(roles("img"), ["presentation", "img"]);
    assert.deepEqual([view.$("fieldset"), view.$("dialog"), view.$("output"), view.$("hr")].map((el) => roleOf(el)), ["group", "dialog", "status", "separator"]);
  });

  it("an explicit role wins, and header / footer are landmarks only outside sectioning content", async () => {
    const view = await render(
      <div>
        <header id="top">page header</header>
        <main>
          <header id="inner">section header</header>
          <footer id="innerFoot">section footer</footer>
        </main>
        <footer id="bottom">page footer</footer>
        <div role="alert">x</div>
        <a href="#x" role="button">y</a>
        <div role="none">z</div>
        <section id="unnamed">s</section>
        <section id="named" aria-label="Notes">s</section>
        <form id="plainForm" />
        <form id="namedForm" aria-label="Search" />
      </div>,
    );
    const role = (id: string) => roleOf(view.$(`#${id}`));
    assert.deepEqual(["top", "inner", "innerFoot", "bottom"].map(role), ["banner", null, null, "contentinfo"]);
    assert.equal(roleOf(view.$("[role=alert]")), "alert");
    assert.equal(roleOf(view.$("a[role=button]")), "button");
    assert.equal(roleOf(view.$("[role=none]")), "presentation");
    assert.deepEqual(["unnamed", "named", "plainForm", "namedForm"].map(role), [null, "region", null, "form"]);
  });
});

describe("accessible names", () => {
  it("come from labels, aria-label, aria-labelledby, content, alt and title, in the order the spec gives", async () => {
    const view = await render(
      <div>
        <label htmlFor="byFor">Linked label</label>
        <input id="byFor" />
        <label>
          Wrapping label
          <input id="wrapped" />
        </label>
        <input id="aria" aria-label="Aria label" />
        <span id="source">Named elsewhere</span>
        <input id="by" aria-labelledby="source" />
        <button id="content">
          <svg aria-hidden="true" />
          Save <b>all</b>
        </button>
        <button id="withTitle" title="Title only" />
        <img id="img" alt="Logo text" src="x.png" />
        <input id="empty" />
        <button id="both" aria-label="Override">Visible</button>
      </div>,
    );
    const name = (id: string) => accessibleName(view.$(`#${id}`));
    assert.equal(name("byFor"), "Linked label");
    assert.equal(name("wrapped"), "Wrapping label");
    assert.equal(name("aria"), "Aria label");
    assert.equal(name("by"), "Named elsewhere");
    assert.equal(name("content"), "Save all");
    assert.equal(name("withTitle"), "Title only");
    assert.equal(name("img"), "Logo text");
    assert.equal(name("empty"), "");
    assert.equal(name("both"), "Override");
  });

  it("count visually hidden text and descriptions via aria-describedby", async () => {
    const view = await render(
      <div>
        <button id="b" aria-describedby="why">
          <span className="sr-only">Approve</span> fund
        </button>
        <p id="why">You submitted this fund</p>
      </div>,
    );
    assert.equal(accessibleName(view.$("#b")), "Approve fund");
    assert.equal(accessibleDescription(view.$("#b")), "You submitted this fund");
  });

  it("matches strings after collapsing whitespace and regexes by search", () => {
    assert.ok(matches("  Save \n all ", "Save all"));
    assert.ok(!matches("Save all", "Save"));
    assert.ok(matches("Save all", /all$/));
    assert.ok(!matches("Save all", /^all/));
  });
});

describe("allByRole", () => {
  it("filters by role, name and heading level, and skips what is hidden from assistive technology", async () => {
    const view = await render(
      <div>
        <h1>Page</h1>
        <h2>First</h2>
        <h2 hidden>Hidden</h2>
        <h2 aria-hidden="true">Aria hidden</h2>
        <h3>Deep</h3>
        <button>Save all</button>
        <button style={{ display: "none" }}>Gone</button>
        <div role="heading" aria-level={4}>
          Custom
        </div>
      </div>,
    );
    const names = (els: HTMLElement[]) => els.map((el) => accessibleName(el));
    assert.deepEqual(names(allByRole(view.container, "heading")), ["Page", "First", "Deep", "Custom"]);
    assert.deepEqual(names(allByRole(view.container, "heading", { level: 2 })), ["First"]);
    assert.deepEqual(names(allByRole(view.container, "heading", { level: 4 })), ["Custom"]);
    assert.deepEqual(allByRole(view.container, "heading", { hidden: true, level: 2 }).map((el) => el.textContent), ["First", "Hidden", "Aria hidden"]);
    assert.deepEqual(names(allByRole(view.container, "button", { name: /save/i })), ["Save all"]);
    assert.deepEqual(names(allByRole(view.container, "button", { name: "Save" })), []);
    assert.deepEqual(allByRole(view.container, "button", { hidden: true }).map((el) => el.textContent), ["Save all", "Gone"]);
  });

  it("includes the root itself", async () => {
    const view = await render(<nav aria-label="Funds">x</nav>);
    assert.equal(allByRole(view.$("nav"), "navigation").length, 1);
  });
});

describe("tabOrder and hidden content", () => {
  it("lists what Tab visits: not disabled, inert, tabindex -1 or hidden; aria-hidden content is still reached", async () => {
    const view = await render(
      <div>
        <a href="#a">a</a>
        <button>b</button>
        <button disabled>disabled</button>
        <input aria-label="i" />
        <input type="hidden" />
        <div tabIndex={0}>focusable div</div>
        <div tabIndex={-1}>programmatic only</div>
        <span>plain</span>
        <details>
          <summary>summary</summary>
        </details>
        <div hidden>
          <button>hidden button</button>
        </div>
        <div aria-hidden="true">
          <button>aria-hidden button</button>
        </div>
        <fieldset disabled>
          <button>in a disabled fieldset</button>
        </fieldset>
        <div inert>
          <button>inert button</button>
        </div>
        <a>no href</a>
      </div>,
    );
    assert.deepEqual(
      tabOrder(view.container).map((el) => el.textContent || el.localName),
      ["a", "b", "input", "focusable div", "summary", "aria-hidden button"],
    );
    assert.equal(isTabStop(view.byRole("button", { name: "aria-hidden button", hidden: true })), true);
    assert.equal(isTabStop(view.container), false);
  });

  it("visits a group of radio buttons once: the checked one, else the first; ungrouped radios and other groups are separate stops", async () => {
    const view = await render(
      <form>
        <input type="radio" name="size" value="s" aria-label="small" />
        <input type="radio" name="size" value="m" aria-label="medium" defaultChecked />
        <input type="radio" name="size" value="l" aria-label="large" />
        <input type="radio" name="colour" value="r" aria-label="red" />
        <input type="radio" name="colour" value="g" aria-label="green" />
        <input type="radio" name="gone" value="x" aria-label="disabled first" disabled />
        <input type="radio" name="gone" value="y" aria-label="then this" />
        <input type="radio" value="z" aria-label="unnamed" />
      </form>,
    );
    assert.deepEqual(
      tabOrder(view.container).map((el) => el.getAttribute("aria-label")),
      ["medium", "red", "then this", "unnamed"],
    );
  });

  it("isNotRendered is true for hidden, display:none and closed dialogs, and false for aria-hidden", async () => {
    const view = await render(
      <div>
        <div hidden>
          <p id="hidden">x</p>
        </div>
        <div style={{ display: "none" }}>
          <p id="none">x</p>
        </div>
        <dialog>
          <p id="closed">x</p>
        </dialog>
        <dialog open>
          <p id="open">x</p>
        </dialog>
        <div aria-hidden="true">
          <p id="aria">x</p>
        </div>
      </div>,
    );
    assert.deepEqual(["hidden", "none", "closed", "open", "aria"].map((id) => isNotRendered(view.$(`#${id}`))), [true, true, true, false, false]);
  });

  it("isHiddenFromAssistiveTech looks at ancestors too", async () => {
    const view = await render(
      <div>
        <div aria-hidden="true">
          <p id="inside">x</p>
        </div>
        <div style={{ display: "none" }}>
          <p id="gone">x</p>
        </div>
        <dialog>
          <p id="closed">x</p>
        </dialog>
        <p id="plain">x</p>
      </div>,
    );
    assert.deepEqual(["inside", "gone", "closed", "plain"].map((id) => isHiddenFromAssistiveTech(view.$(`#${id}`))), [true, true, true, false]);
  });

  it("renderedElements skips what is not rendered but keeps aria-hidden and sr-only", async () => {
    const view = await render(
      <div>
        <p id="a">a</p>
        <p id="b" hidden>
          b
        </p>
        <p id="c" aria-hidden="true">
          c
        </p>
        <p id="d" className="sr-only">
          d
        </p>
        <dialog id="f" />
      </div>,
    );
    const script = document.createElement("script");
    script.id = "e";
    view.$("div").append(script);
    assert.deepEqual(
      renderedElements(view.$("div")).map((el) => el.id || el.localName),
      ["div", "a", "c", "d"],
    );
  });
});

describe("descriptions of elements", () => {
  it("name the tag, id, classes, role and text, and the way down from the page", async () => {
    const view = await render(
      <main id="main">
        <section className="panel wide extra">
          <button className="btn" role="tab" id="go">
            Submit for review
          </button>
        </section>
      </main>,
    );
    assert.equal(describeElement(view.$("#go")), 'button#go.btn[role=tab] "Submit for review"');
    assert.equal(pathOf(view.$("#go")), "div > main#main > section.panel > button#go.btn");
  });
});
