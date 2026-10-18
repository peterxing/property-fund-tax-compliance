import { test } from "node:test";
import assert from "node:assert/strict";
import { ageLabel, riskHref } from "../../../src/app/workspaces/risks/model.ts";

test("risk model formats age and workspace links", () => {
  assert.equal(ageLabel(null), "—");
  assert.equal(ageLabel(1), "1 day");
  assert.equal(ageLabel(22), "22 days");
  assert.equal(
    riskHref({
      id: "r",
      severity: "exception",
      area: "Distribution",
      fundId: "southbank",
      fund: "Southbank",
      market: "AU",
      title: "Risk",
      detail: "Detail",
      workspaceRoute: "/trial-balance",
      ageDays: null,
    }),
    "#/trial-balance?fund=southbank",
  );
});
