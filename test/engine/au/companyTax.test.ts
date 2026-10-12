import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAuCompanyTax } from "../../../src/engine/au/companyTax.ts";
import type { AuMappedTbLine } from "../../../src/engine/au/taxonomy.ts";

const dollars = (amount: number): number => amount * 100;

function line(accountName: string, category: AuMappedTbLine["category"], amount: number, kind: "income" | "expense"): AuMappedTbLine {
  return { accountCode: "X", accountName, debit: kind === "expense" ? amount : 0, credit: kind === "income" ? amount : 0, category };
}

test("Happy Feet published ATO example qualifies for 25% base rate entity rate", () => {
  const result = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    aggregatedTurnover: dollars(104_000),
    lines: [
      line("Trading income", "REV_OTHER_AU", dollars(100_000), "income"),
      line("Interest income", "REV_INTEREST", dollars(4_000), "income"),
    ],
  });
  assert.equal(result.summary.baseRateEntity, true);
  assert.equal(result.summary.passiveIncomeBps, 385);
  assert.equal(result.summary.rateBps, 2500);
  assert.equal(result.summary.taxPayable, dollars(26_000));
});

test("Coffee and Cake published ATO example still qualifies for base rate entity rate because rental income is only 28.6%", () => {
  const result = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    aggregatedTurnover: dollars(700_000),
    lines: [
      line("Trading income", "REV_OTHER_AU", dollars(500_000), "income"),
      line("Gross rental income attributable to trust distribution", "REV_RENT_BASE", dollars(200_000), "income"),
    ],
  });
  assert.equal(result.summary.baseRateEntity, true);
  assert.equal(result.summary.passiveIncomeBps, 2857);
  assert.equal(result.summary.rateBps, 2500);
});

test("Best Equity published ATO example does not qualify because passive income is 100%", () => {
  const result = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    aggregatedTurnover: dollars(5_000_000),
    lines: [
      line("Interest income", "REV_INTEREST", dollars(1_000_000), "income"),
      line("Dividend income", "REV_UNFRANKED_DIVIDEND", dollars(4_000_000), "income"),
    ],
  });
  assert.equal(result.summary.baseRateEntity, false);
  assert.equal(result.summary.passiveIncomeBps, 10000);
  assert.equal(result.summary.rateBps, 3000);
  assert.equal(result.summary.taxPayable, dollars(1_500_000));
});

test("SoftDev published ATO example does not qualify because a net capital gain is more than 80% of assessable income", () => {
  const result = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    aggregatedTurnover: dollars(1_000_000),
    lines: [line("Trading income", "REV_OTHER_AU", dollars(150_000), "income")],
    netCapitalGainBeforeDiscount: { discountable: dollars(850_000), other: 0 },
  });
  assert.equal(result.summary.baseRateEntity, false);
  assert.equal(result.summary.passiveIncomeBps, 8500);
  assert.equal(result.summary.taxableIncome, dollars(1_000_000));
  assert.equal(result.summary.taxPayable, dollars(300_000));
});

test("historical company rate changes apply at each income-year boundary", () => {
  const active = [line("Project sales", "REV_OTHER_AU", dollars(100_000), "income")];
  assert.equal(computeAuCompanyTax({ incomeYear: 2018, regime: "COMPANY", aggregatedTurnover: dollars(24_999_999), lines: active }).summary.rateBps, 2750);
  assert.equal(computeAuCompanyTax({ incomeYear: 2018, regime: "COMPANY", aggregatedTurnover: dollars(25_000_000), lines: active }).summary.rateBps, 3000);
  assert.equal(computeAuCompanyTax({ incomeYear: 2019, regime: "COMPANY", aggregatedTurnover: dollars(49_999_999), lines: active }).summary.rateBps, 2750);
  assert.equal(computeAuCompanyTax({ incomeYear: 2019, regime: "COMPANY", aggregatedTurnover: dollars(50_000_000), lines: active }).summary.rateBps, 3000);
  assert.equal(computeAuCompanyTax({ incomeYear: 2021, regime: "COMPANY", aggregatedTurnover: dollars(49_999_999), lines: active }).summary.rateBps, 2600);
  assert.equal(computeAuCompanyTax({ incomeYear: 2022, regime: "COMPANY", aggregatedTurnover: dollars(49_999_999), lines: active }).summary.rateBps, 2500);
});

test("aggregated turnover must be less than $50 million, not equal to it", () => {
  const result = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    aggregatedTurnover: dollars(50_000_000),
    lines: [line("Trading income", "REV_OTHER_AU", dollars(1_000_000), "income")],
  });
  assert.equal(result.summary.baseRateEntity, false);
  assert.ok(result.findings.some((finding) => finding.id === "AUCO.BRE_THRESHOLD"));
});

test("passive income exactly 80% still qualifies for the lower rate", () => {
  const result = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    aggregatedTurnover: dollars(10_000_000),
    lines: [
      line("Rent", "REV_RENT_BASE", dollars(800_000), "income"),
      line("Management income", "REV_MANAGEMENT_FEE", dollars(200_000), "income"),
    ],
  });
  assert.equal(result.summary.baseRateEntity, true);
  assert.equal(result.summary.passiveIncomeBps, 8000);
  assert.equal(result.summary.rateBps, 2500);
});

test("capital works and depreciation schedules replace book depreciation and prior-year losses need a recoupment test", () => {
  const result = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    aggregatedTurnover: dollars(1_000_000),
    lines: [
      line("Rent", "REV_RENT_BASE", dollars(500_000), "income"),
      line("Depreciation", "EXP_DEPRECIATION", dollars(50_000), "expense"),
    ],
    capitalWorksDeduction: dollars(10_000),
    depreciatingAssetsDeduction: dollars(20_000),
    priorYearTaxLossesBroughtForward: dollars(100_000),
    continuityOfOwnershipTestPassed: false,
    businessContinuityTestPassed: false,
  });
  assert.equal(result.summary.taxableIncomeBeforeLosses, dollars(470_000));
  assert.equal(result.summary.taxLossesApplied, 0);
  assert.ok(result.findings.some((finding) => finding.id === "AUCO.LOSSES_RESTRICTED"));
});
