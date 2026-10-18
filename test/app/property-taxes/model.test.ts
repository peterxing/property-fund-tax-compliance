import assert from "node:assert/strict";
import { test } from "node:test";
import { basisText, bpsPct, ptaxTabFromParam, statusText, valueText } from "../../../src/app/workspaces/property-taxes/model.ts";

test("property taxes model helpers format tabs, statuses and values", () => {
  assert.equal(ptaxTabFromParam("annual"), "annual");
  assert.equal(ptaxTabFromParam("duties"), "duties");
  assert.equal(ptaxTabFromParam("x"), "annual");
  assert.equal(statusText("modelled"), "Modelled");
  assert.equal(statusText("not-modelled"), "Not modelled");
  assert.equal(valueText(null, "AUD"), "Not set");
  assert.equal(valueText(123456700, "AUD"), "A$1,234,567");
  assert.equal(bpsPct(6250), "62.50%");
  assert.equal(basisText({ basis: "nsw.rule", ruleIds: ["a", "b"] }), "nsw.rule (a, b)");
});
