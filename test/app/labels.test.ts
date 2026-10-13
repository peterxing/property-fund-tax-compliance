import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Fund, WorkflowView } from "../../src/domain/types.ts";
import {
  APP_NAME,
  JURISDICTION_OPTIONS,
  WORKFLOW_ICON,
  WORKSPACE_ICON,
  approvalChain,
  approvalLabelFor,
  buildLabel,
  documentTitle,
  dueFact,
  exceptionLabel,
  fundsVisibleMessage,
  jurisdictionMessage,
  marketName,
  personaLabel,
  queryLabel,
  railDetail,
  regimeLine,
  shortPeriod,
  statusKey,
  workflowAction,
  workflowDoneMessage,
  workingAsMessage,
} from "../../src/app/labels.ts";
import { ROUTES } from "../../src/app/router.ts";

const au = { market: "AU", regime: "AMIT", sector: "Office", listed: true, periodLabel: "Income year ended 30 Jun 2026" } as unknown as Fund;
const sg = {
  market: "SG",
  regime: "S-REIT",
  sector: "Office & retail",
  listed: true,
  periodLabel: "Distribution period 1 Jul – 30 Sep 2026",
  assessmentYear: 2027,
} as unknown as Fund;

describe("fund labels", () => {
  it("names the markets", () => {
    assert.equal(marketName("AU"), "Australia");
    assert.equal(marketName("SG"), "Singapore");
  });

  it("shortens period labels for the rail", () => {
    assert.equal(shortPeriod(au.periodLabel), "Year ended 30 Jun 2026");
    assert.equal(shortPeriod(sg.periodLabel), "1 Jul – 30 Sep 2026");
    assert.equal(shortPeriod("Half year"), "Half year");
  });

  it("builds the rail's second line", () => {
    assert.equal(railDetail(au), "Office · Year ended 30 Jun 2026");
    assert.equal(railDetail(sg), "Office & retail · 1 Jul – 30 Sep 2026");
  });

  it("describes the regime", () => {
    assert.equal(regimeLine(au), "AMIT · Office · Listed");
    assert.equal(regimeLine({ ...sg, listed: false } as Fund), "S-REIT · Office & retail · Unlisted");
  });

  it("pluralises counts", () => {
    assert.equal(exceptionLabel(0), "0 exceptions");
    assert.equal(exceptionLabel(1), "1 exception");
    assert.equal(exceptionLabel(2), "2 exceptions");
    assert.equal(queryLabel(0), "0 open queries");
    assert.equal(queryLabel(1), "1 open query");
    assert.equal(queryLabel(5), "5 open queries");
  });

  it("maps statuses to style keys", () => {
    assert.equal(statusKey("Preparing"), "preparing");
    assert.equal(statusKey("In review"), "review");
    assert.equal(statusKey("Signed off"), "signed");
  });
});

describe("dueFact", () => {
  it("is the AMMA date for an AU fund and the Form UT date for an SG fund", () => {
    assert.deepEqual(dueFact(au, { au: { ammaDue: "2026-09-30" }, sg: null } as never), { label: "AMMA due", value: "30 Sep 2026" });
    assert.deepEqual(dueFact(sg, { au: null, sg: { formUtDue: "2027-04-15" } } as never), { label: "Form UT", value: "YA2027 · due 15 Apr 2027" });
  });

  it("is null while there is no calculation", () => {
    assert.equal(dueFact(au, null), null);
    assert.equal(dueFact(au, { au: null, sg: null } as never), null);
    assert.equal(dueFact(sg, undefined), null);
  });
});

describe("approvalChain", () => {
  const workflow = (overrides: Partial<WorkflowView>): Pick<WorkflowView, "approvals" | "signOff"> => ({
    approvals: [
      { level: "review", label: "Reviewer", done: true, by: "L. Brennan", at: "2026-09-01T10:15:00" },
      { level: "agent", label: "Tax agent", done: false },
    ],
    signOff: { done: false, waitingOn: "Head of Tax" },
    ...overrides,
  });

  it("lists the approvals then the sign-off", () => {
    const chain = approvalChain(workflow({}));
    assert.deepEqual(
      chain.map((s) => s.key),
      ["review", "agent", "sign-off"],
    );
    assert.deepEqual(chain[0], { key: "review", label: "Reviewer", done: true, state: "done,", detail: "L. Brennan, 1 Sep 2026" });
    assert.deepEqual(chain[1], { key: "agent", label: "Tax agent", done: false, state: "pending", detail: "" });
    assert.deepEqual(chain[2], { key: "sign-off", label: "Sign-off", done: false, state: "pending · Head of Tax", detail: "" });
  });

  it("records who signed off and when", () => {
    const chain = approvalChain(workflow({ signOff: { done: true, by: "A. Moreno", at: "2026-09-04T09:00:00", waitingOn: "" } }));
    assert.deepEqual(chain.at(-1), { key: "sign-off", label: "Sign-off", done: true, state: "done,", detail: "A. Moreno, 4 Sep 2026" });
  });

  it("copes with a missing name or time and with no approvals", () => {
    const chain = approvalChain({ approvals: [{ level: "review", label: "Reviewer", done: true }], signOff: { done: false, waitingOn: "" } });
    assert.equal(chain[0]!.detail, "");
    assert.equal(chain[1]!.state, "pending");
    assert.equal(approvalChain({ approvals: [], signOff: { done: false, waitingOn: "Head of Tax" } }).length, 1);
  });

  it("names the approval levels", () => {
    assert.equal(approvalLabelFor("review"), "Reviewer");
    assert.equal(approvalLabelFor("agent"), "Tax agent");
  });
});

describe("workflow actions", () => {
  it("maps each workflow button to a domain action", () => {
    assert.deepEqual(workflowAction("submit", "f1"), { type: "submit", fundId: "f1" });
    assert.deepEqual(workflowAction("return", "f1"), { type: "return", fundId: "f1" });
    assert.deepEqual(workflowAction("approve-review", "f1"), { type: "approve", fundId: "f1", level: "review" });
    assert.deepEqual(workflowAction("approve-agent", "f1"), { type: "approve", fundId: "f1", level: "agent" });
    assert.deepEqual(workflowAction("sign-off", "f1"), { type: "sign-off", fundId: "f1" });
    assert.deepEqual(workflowAction("reopen", "f1"), { type: "reopen", fundId: "f1" });
  });

  it("has no action for buttons that are not workflow steps", () => {
    for (const id of ["edit", "publish", "query", "lodge", "manage-access"] as const) assert.equal(workflowAction(id, "f1"), null, id);
  });

  it("confirms each step in words", () => {
    assert.equal(workflowDoneMessage("submit", "Wattle"), "Wattle submitted for review.");
    assert.equal(workflowDoneMessage("return", "Wattle"), "Wattle returned to the preparer.");
    assert.equal(workflowDoneMessage("approve-review", "Wattle"), "Wattle approved as reviewer.");
    assert.equal(workflowDoneMessage("approve-agent", "Wattle"), "Wattle approved as tax agent.");
    assert.equal(workflowDoneMessage("sign-off", "Wattle"), "Wattle signed off.");
    assert.equal(workflowDoneMessage("reopen", "Wattle"), "Wattle reopened for editing.");
    assert.equal(workflowDoneMessage("edit", "Wattle"), "Wattle updated.");
  });

  it("has an icon for every step", () => {
    for (const id of ["submit", "return", "approve-review", "approve-agent", "sign-off", "reopen"] as const) assert.ok(WORKFLOW_ICON[id], id);
  });
});

describe("navigation labels", () => {
  it("has an icon for every workspace", () => {
    for (const route of ROUTES) assert.ok(WORKSPACE_ICON[route.id], route.id);
  });

  it("builds the document title", () => {
    assert.equal(documentTitle([]), APP_NAME);
    assert.equal(documentTitle(["Analytics"]), `Analytics · ${APP_NAME}`);
    assert.equal(documentTitle(["Distributions", null, undefined, "", "Southbank"]), `Distributions · Southbank · ${APP_NAME}`);
  });

  it("labels a persona", () => {
    assert.equal(personaLabel({ name: "A. Moreno", title: "Head of Tax" }), "A. Moreno — Head of Tax");
  });

  it("offers all three jurisdictions with full names", () => {
    assert.deepEqual(
      JURISDICTION_OPTIONS.map((o) => [o.value, o.label]),
      [
        ["all", "All"],
        ["AU", "Australia"],
        ["SG", "Singapore"],
      ],
    );
  });
});

describe("announcements", () => {
  it("counts visible funds", () => {
    assert.equal(fundsVisibleMessage(0), "No funds visible.");
    assert.equal(fundsVisibleMessage(1), "1 fund visible.");
    assert.equal(fundsVisibleMessage(9), "9 funds visible.");
  });

  it("announces a persona change", () => {
    assert.equal(workingAsMessage({ name: "R. Okafor", title: "Preparer" }, 2), "Working as R. Okafor, Preparer. 2 funds visible.");
  });

  it("announces a jurisdiction change", () => {
    assert.equal(jurisdictionMessage("all", 9), "Showing all funds. 9 funds visible.");
    assert.equal(jurisdictionMessage("AU", 5), "Showing Australian funds. 5 funds visible.");
    assert.equal(jurisdictionMessage("SG", 0), "Showing Singapore funds. No funds visible.");
  });
});

describe("buildLabel", () => {
  it("formats version, commit and date", () => {
    assert.equal(buildLabel({ version: "0.1.0", sha: "1a2b3c4", builtAt: "2026-10-13T08:00:00.000Z" }), "v0.1.0 · 1a2b3c4 · built 13 Oct 2026");
  });

  it("leaves out an unreadable date and is empty without build info", () => {
    assert.equal(buildLabel({ version: "0.1.0", sha: "dev", builtAt: "unknown" }), "v0.1.0 · dev");
    assert.equal(buildLabel(null), "");
    assert.equal(buildLabel(undefined), "");
  });
});
