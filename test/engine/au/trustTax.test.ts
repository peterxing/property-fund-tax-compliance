import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAuTrustTax } from "../../../src/engine/au/trustTax.ts";
import type { AuMappedTbLine } from "../../../src/engine/au/taxonomy.ts";

const dollars = (amount: number): number => amount * 100;

function line(accountName: string, category: AuMappedTbLine["category"], amount: number, kind: "income" | "expense"): AuMappedTbLine {
  return { accountCode: "X", accountName, debit: kind === "expense" ? amount : 0, credit: kind === "income" ? amount : 0, category };
}

test("trust STI applies book-to-tax adjustments and trust CGT discount", () => {
  const result = computeAuTrustTax({
    incomeYear: 2026,
    regime: "UNIT_TRUST",
    lines: [
      line("Base rent", "REV_RENT_BASE", dollars(1_000_000), "income"),
      line("Fair value gain", "REV_FAIR_VALUE_GAIN_PROPERTY", dollars(200_000), "income"),
      line("Interest expense", "EXP_INTEREST", dollars(100_000), "expense"),
      line("Depreciation", "EXP_DEPRECIATION", dollars(50_000), "expense"),
    ],
    capitalWorksDeduction: dollars(20_000),
    depreciatingAssetsDeduction: dollars(30_000),
    netCapitalGainBeforeDiscount: { discountable: dollars(80_000), other: dollars(10_000) },
  });
  assert.equal(result.summary.accountingProfit, dollars(1_050_000));
  assert.equal(result.summary.discountApplied, dollars(40_000));
  assert.equal(result.summary.netIncomeOfTrustEstate, dollars(900_000));
  assert.ok(result.lines.some((item) => item.code === "AUTR.CGT_DISCOUNT"));
});

test("undistributed trust income can be taxed on a section 99A basis", () => {
  const result = computeAuTrustTax({
    incomeYear: 2026,
    regime: "DISCRETIONARY_TRUST",
    lines: [line("Rent", "REV_RENT_BASE", dollars(100_000), "income")],
    distribution: { presentlyEntitledNetIncomeAmount: 0, notPresentlyEntitledNetIncomeAmount: dollars(100_000), undistributedTaxMode: "SECTION_99A" },
  });
  assert.equal(result.summary.trusteeLevelTax[0]?.basis, "SECTION_99A");
  assert.equal(result.summary.trusteeLevelTax[0]?.tax, dollars(47_000));
  assert.ok(result.lines.some((item) => item.code === "AUTR.SECTION_99A.MEDICARE_LEVY" && item.amount === dollars(2_000)));
});

test("foreign resident beneficiaries can be modelled using published foreign resident individual rates", () => {
  const result = computeAuTrustTax({
    incomeYear: 2026,
    regime: "MIT",
    lines: [line("Rent", "REV_RENT_BASE", dollars(150_000), "income")],
    distribution: {
      presentlyEntitledNetIncomeAmount: dollars(150_000),
      foreignResidentBeneficiaries: [{ label: "Offshore individual", netIncomeAmount: dollars(150_000), taxpayerClass: "INDIVIDUAL" }],
    },
  });
  assert.equal(result.summary.trusteeLevelTax[0]?.basis, "SECTION_98_FOREIGN_RESIDENT");
  assert.equal(result.summary.trusteeLevelTax[0]?.tax, dollars(46_050));
});

test("public trading trusts are rejected from the trust STI path", () => {
  assert.throws(() => computeAuTrustTax({ incomeYear: 2026, regime: "PUBLIC_TRADING_TRUST", lines: [] as AuMappedTbLine[] }), /taxed like companies/);
});

test("AMIT and discretionary trust outputs include review findings for downstream trust specialists", () => {
  const result = computeAuTrustTax({
    incomeYear: 2026,
    regime: "AMIT",
    lines: [line("Trust distribution income", "REV_TRUST_DISTRIBUTION_UNFRANKED", dollars(10_000), "income")],
    s100AReviewRequired: true,
    division6CReviewRequired: true,
    thinCapitalisationReviewRequired: true,
  });
  assert.ok(result.notes.some((note) => /AMIT attribution/i.test(note)));
  assert.ok(result.findings.some((finding) => finding.id === "AUTR.S100A"));
  assert.ok(result.findings.some((finding) => finding.id === "AUTR.DIV6C"));
  assert.ok(result.findings.some((finding) => finding.id === "AUTR.THIN_CAP"));
});
