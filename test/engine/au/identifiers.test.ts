import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAcnFromCompanyAbn, formatAbn, formatAcn, maskTfn, validateAbn, validateAcn, validateTfn } from "../../../src/engine/au/identifiers.ts";

test("ABN validation and formatting accept published-style specimen numbers", () => {
  assert.equal(validateAbn("51 824 753 556").ok, true);
  assert.equal(validateAbn("53 004 085 616").ok, true);
  assert.equal(validateAbn("51 824 753 557").ok, false);
  assert.equal(formatAbn("51824753556"), "51 824 753 556");
});

test("ACN validation, formatting and derivation from a company ABN", () => {
  assert.equal(validateAcn("004 085 616").ok, true);
  assert.equal(validateAcn("004085617").ok, false);
  assert.equal(formatAcn("004085616"), "004 085 616");
  assert.equal(deriveAcnFromCompanyAbn("53 004 085 616"), "004085616");
  assert.equal(deriveAcnFromCompanyAbn("51 824 753 556"), null);
});

test("TFN validation supports 8 and 9 digits without echoing the full TFN", () => {
  assert.equal(validateTfn("123 456 782").ok, true);
  assert.equal(validateTfn("87654321").ok, true);
  assert.equal(validateTfn("111111111").ok, false);
  assert.equal(validateTfn("123456789").ok, false);
  assert.equal(maskTfn("123456782"), "******782");
});

