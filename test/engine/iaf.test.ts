import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIaf, validateIafInput } from "../../src/engine/iaf.ts";

test("IAF builder emits assumed pipe-delimited sections and validates codes", () => {
  const input = {
    company: {
      companyName: "Example S-REIT",
      companyUen: "201912345A",
      gstRegistrationNumber: "M21234567X",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
    },
    purchaseLedger: [
      { date: "2026-02-01", documentNo: "P001", counterpartyName: "Vendor", taxCode: "TX", currency: "SGD", netAmount: 100_000, gstAmount: 9_000 },
    ],
    supplyLedger: [
      { date: "2026-02-01", documentNo: "S001", counterpartyName: "Tenant", taxCode: "SR", currency: "SGD", netAmount: 200_000, gstAmount: 18_000 },
    ],
    generalLedger: [
      { date: "2026-02-01", journalNo: "J001", accountCode: "4000", accountName: "Rental Income", debit: 0, credit: 218_000, taxCode: "SR" },
    ],
  };
  assert.equal(validateIafInput(input).length, 0);
  const result = buildIaf(input);
  assert.match(result.text, /\[CompanyInfo\]/);
  assert.match(result.text, /\[PurchaseLedger\]/);
  assert.match(result.text, /\[SupplyLedger\]/);
  assert.match(result.text, /\[GeneralLedger\]/);
  assert.ok(result.findings.some((finding) => finding.id === "IAF.SPEC.ASSUMED"));
});
