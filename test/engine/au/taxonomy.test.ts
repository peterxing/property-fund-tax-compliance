import { test } from "node:test";
import assert from "node:assert/strict";
import { AU_TAX_CATEGORIES, auNaturalAmount, auTotalsByCategory, getAuCategory, isAuTaxCategoryId, requireAuCategory } from "../../../src/engine/au/taxonomy.ts";

test("AU taxonomy exposes a broad property-industry category set", () => {
  assert.ok(AU_TAX_CATEGORIES.length >= 55 && AU_TAX_CATEGORIES.length <= 80);
  assert.equal(new Set(AU_TAX_CATEGORIES.map((category) => category.id)).size, AU_TAX_CATEGORIES.length);
  assert.ok(AU_TAX_CATEGORIES.every((category) => category.guidance.length > 20));
  assert.ok(AU_TAX_CATEGORIES.some((category) => category.id === "REV_RENT_BASE"));
  assert.ok(AU_TAX_CATEGORIES.some((category) => category.id === "EXP_DEV_COST_OF_SALES"));
  assert.ok(AU_TAX_CATEGORIES.some((category) => category.id === "EQ_DISTRIBUTIONS_TO_UNITHOLDERS"));
});

test("category lookups and guards work", () => {
  assert.equal(getAuCategory("REV_INTEREST")?.label, "Interest income");
  assert.equal(isAuTaxCategoryId("REV_INTEREST"), true);
  assert.equal(isAuTaxCategoryId("NOT_REAL"), false);
  assert.equal(requireAuCategory("EXP_INTEREST").treatment, "DEDUCTIBLE");
  assert.throws(() => requireAuCategory("NOT_REAL"), /Unknown Australian tax category/);
});

test("natural amounts use income credits and expense or balance debits", () => {
  assert.equal(auNaturalAmount({ category: "REV_RENT_BASE", debit: 0, credit: 123_400 }), 123_400);
  assert.equal(auNaturalAmount({ category: "EXP_INTEREST", debit: 45_600, credit: 0 }), 45_600);
  assert.equal(auNaturalAmount({ category: "BS_BORROWINGS", debit: 0, credit: 500_000 }), -500_000);
});

test("totals by category aggregate natural amounts", () => {
  const totals = auTotalsByCategory([
    { accountCode: "4000", accountName: "Base Rent", debit: 0, credit: 100_000, category: "REV_RENT_BASE" },
    { accountCode: "4001", accountName: "Base Rent 2", debit: 0, credit: 50_000, category: "REV_RENT_BASE" },
    { accountCode: "6100", accountName: "Interest", debit: 20_000, credit: 0, category: "EXP_INTEREST" },
  ]);
  assert.equal(totals.REV_RENT_BASE, 150_000);
  assert.equal(totals.EXP_INTEREST, 20_000);
});

