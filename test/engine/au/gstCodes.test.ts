import { test } from "node:test";
import assert from "node:assert/strict";
import { AU_BAS_LABELS, AU_GST_CODES, lookupAuGstCode } from "../../../src/engine/au/gstCodes.ts";

test("every AU GST code is unique and lookup works for current codes", () => {
  assert.equal(new Set(AU_GST_CODES.map((c) => c.id)).size, AU_GST_CODES.length);
  assert.equal(new Set(AU_BAS_LABELS.map((l) => l.id)).size, AU_BAS_LABELS.length);
  assert.equal(lookupAuGstCode("SALE_MARGIN_SCHEME", "2026-10-10")?.rateModel, "MARGIN_1_11");
  assert.equal(lookupAuGstCode("PURCHASE_NON_CAPITAL_TAXABLE", "2026-10-10")?.basLabels.includes("1B"), true);
  assert.equal(lookupAuGstCode("SALE_INPUT_TAXED_RESIDENTIAL_RENT", "2026-10-10")?.basLabels.includes("G4"), true);
});

test("G4 is flagged as a platform-only subtotal while current BAS labels remain official", () => {
  const g4 = AU_BAS_LABELS.find((label) => label.id === "G4");
  const g1 = AU_BAS_LABELS.find((label) => label.id === "G1");
  assert.equal(g4?.official, false);
  assert.equal(g1?.official, true);
});

