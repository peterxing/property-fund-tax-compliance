import { test } from "node:test";
import assert from "node:assert/strict";
import { AU_STATES, AU_TAX_REGIMES } from "../../../src/engine/au/types.ts";

test("every Australian State and Territory is listed once, and every tax regime has a label", () => {
  assert.deepEqual(AU_STATES.map((s) => s.id).sort(), ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]);
  assert.equal(new Set(AU_TAX_REGIMES.map((r) => r.id)).size, AU_TAX_REGIMES.length);
  assert.ok(AU_TAX_REGIMES.every((r) => r.label.length > 3 && r.description.length > 10));
  assert.deepEqual(AU_TAX_REGIMES.filter((r) => !r.isTrust).map((r) => r.id), ["COMPANY"]);
});

