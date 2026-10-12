import { test } from "node:test";
import assert from "node:assert/strict";
import { lookupGstCode } from "../../src/engine/gstCodes.ts";

test("lookupGstCode returns official current codes and legacy aliases", () => {
  const current = lookupGstCode("TX-ESS", "2026-10-09");
  assert.ok(current);
  assert.equal(current?.code, "TX-ESS");
  const legacy = lookupGstCode("TX-E33", "2026-10-09");
  assert.ok(legacy);
  assert.equal(legacy?.code, "TX-ESS");
  const ov = lookupGstCode("SROVR", "2022-10-09");
  assert.ok(ov);
  assert.equal(ov?.code, "SROVR");
  const ovNew = lookupGstCode("SROVR", "2024-10-09");
  assert.ok(ovNew);
  assert.equal(ovNew?.code, "SROVR-RS");
});
