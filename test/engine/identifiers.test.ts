import { test } from "node:test";
import assert from "node:assert/strict";
import { maskNricFin, validateGstRegistrationNumber, validateNricFin, validatePostalCode, validateUen } from "../../src/engine/identifiers.ts";

test("validateUen accepts published examples across all three formats", () => {
  assert.equal(validateUen("00192200M").ok, true);
  assert.equal(validateUen("197401143C").ok, true);
  assert.equal(validateUen("S16FC0121D").ok, true);
  assert.equal(validateUen("T01FC6132D").ok, true);
  assert.equal(validateUen("197401143A").ok, false);
});

test("validateNricFin and maskNricFin", () => {
  assert.equal(validateNricFin("S1234567D").ok, true);
  assert.equal(validateNricFin("T1234567J").ok, true);
  assert.equal(validateNricFin("F1234567N").ok, true);
  assert.equal(validateNricFin("G1234567X").ok, true);
  assert.equal(validateNricFin("S1234567A").ok, false);
  assert.equal(maskNricFin("s1234567d"), "****567D");
});

test("format-only GST and postal-code validators", () => {
  assert.equal(validateGstRegistrationNumber("M12345678").ok, true);
  assert.equal(validateGstRegistrationNumber("12345678").ok, false);
  assert.equal(validatePostalCode("018989").ok, true);
  assert.equal(validatePostalCode("18989").ok, false);
});
