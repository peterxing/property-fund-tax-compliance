import assert from "node:assert/strict";
import { test } from "node:test";

import { computeAuCompanyTax } from "../../src/engine/au/companyTax.ts";
import { computeAuTrustTax } from "../../src/engine/au/trustTax.ts";
import { determineAuReturn } from "../../src/engine/au/returns.ts";
import { money } from "../../src/domain/format.ts";
import type { AuMappedTbLine } from "../../src/engine/au/taxonomy.ts";
import { assertExampleQuotes, assertSectionQuotes, exampleIds, readRuleDoc, tableRow } from "./docText.ts";

const DOC = "au-income-tax";
const AUD = "AUD" as const;
const dollars = (amount: number): number => amount * 100;

function line(accountName: string, category: AuMappedTbLine["category"], amount: number, kind: "income" | "expense"): AuMappedTbLine {
  return { accountCode: "X", accountName, debit: kind === "expense" ? amount : 0, credit: kind === "income" ? amount : 0, category };
}

test("AU income tax documentation examples are all covered", () => {
  assert.deepEqual(exampleIds(readRuleDoc(DOC)), ["CT-1", "CT-2", "CT-3", "DUE-1"]);
});

test("CT-1 quotes Happy Feet ATO company tax example", () => {
  const result = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    aggregatedTurnover: dollars(104_000),
    lines: [line("Trading income", "REV_OTHER_AU", dollars(100_000), "income"), line("Interest income", "REV_INTEREST", dollars(4_000), "income")],
  });
  assert.equal(result.summary.taxPayable, dollars(26_000));
  assertExampleQuotes(DOC, "CT-1", [
    tableRow(["Assessable income", money(result.summary.assessableIncome, AUD, 2)]),
    tableRow(["Passive income", money(result.summary.passiveIncomeAmount, AUD, 2)]),
    tableRow(["Passive percentage", "3.85%"]),
    tableRow(["Base rate entity", "Yes"]),
    tableRow(["Company tax rate", "25%"]),
    tableRow(["Tax payable", money(result.summary.taxPayable, AUD, 2)]),
  ]);
});

test("CT-2 quotes SoftDev ATO company tax example", () => {
  const result = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    aggregatedTurnover: dollars(1_000_000),
    lines: [line("Trading income", "REV_OTHER_AU", dollars(150_000), "income")],
    netCapitalGainBeforeDiscount: { discountable: dollars(850_000), other: 0 },
  });
  assert.equal(result.summary.baseRateEntity, false);
  assertExampleQuotes(DOC, "CT-2", [
    tableRow(["Taxable income", money(result.summary.taxableIncome, AUD, 2)]),
    tableRow(["Passive income", money(result.summary.passiveIncomeAmount, AUD, 2)]),
    tableRow(["Passive percentage", "85%"]),
    tableRow(["Base rate entity", "No"]),
    tableRow(["Company tax rate", "30%"]),
    tableRow(["Tax payable", money(result.summary.taxPayable, AUD, 2)]),
  ]);
});

test("CT-3 quotes trust net income and section 99A assessment", () => {
  const result = computeAuTrustTax({
    incomeYear: 2026,
    regime: "DISCRETIONARY_TRUST",
    lines: [line("Rent", "REV_RENT_BASE", dollars(100_000), "income")],
    distribution: { presentlyEntitledNetIncomeAmount: 0, notPresentlyEntitledNetIncomeAmount: dollars(100_000), undistributedTaxMode: "SECTION_99A" },
  });
  const trustee = result.summary.trusteeLevelTax[0]!;
  assert.equal(trustee.tax, dollars(47_000));
  assertExampleQuotes(DOC, "CT-3", [
    tableRow(["s 95 net income of trust estate", money(result.summary.netIncomeOfTrustEstate, AUD, 2)]),
    tableRow(["Section 99A tax before Medicare levy", money(dollars(45_000), AUD, 2)]),
    tableRow(["Medicare levy at 2%", money(dollars(2_000), AUD, 2)]),
    tableRow(["Trustee-level tax", money(trustee.tax, AUD, 2)]),
  ]);
});

test("DUE-1 quotes income-tax return due dates", () => {
  const selfCompany = determineAuReturn({ incomeYear: 2026, regime: "COMPANY" });
  const concessionCompany = determineAuReturn({ incomeYear: 2026, regime: "COMPANY", lodgedBy: "REGISTERED_AGENT", applyFiveJuneConcession: true, expectsCurrentYearNonTaxableOrRefund: true, expectsPriorYearNonTaxableOrRefund: true });
  const sapTrust = determineAuReturn({ incomeYear: 2026, regime: "UNIT_TRUST", yearEnd: { month: 12, day: 31 } });
  const sapCompany = determineAuReturn({ incomeYear: 2026, regime: "COMPANY", yearEnd: { month: 12, day: 31 } });
  assertExampleQuotes(DOC, "DUE-1", [
    tableRow(["2026 company self-lodger, 30 June balancer", "Company tax return", selfCompany.dueDate, selfCompany.paymentDueDate!]),
    tableRow(["2026 company registered-agent remaining client with 5 June concession flags", "Company tax return", concessionCompany.dueDate, concessionCompany.concessionDueDate!]),
    tableRow(["2026 unit trust with 31 December SAP", "Trust tax return", sapTrust.dueDate, "none"]),
    tableRow(["2026 company with 31 December SAP", "Company tax return", sapCompany.dueDate, sapCompany.paymentDueDate!]),
  ]);
});

test("company tax, trustee assessment and due-date tables quote coded rows", () => {
  assertSectionQuotes(DOC, "Company tax rate table", [
    tableRow(["2018", money(dollars(25_000_000), AUD, 2), "27.5%", "30%", "`au-company-tax.rate-and-bre.2017-07-01`"]),
    tableRow(["2019-2020", money(dollars(50_000_000), AUD, 2), "27.5%", "30%", "`au-company-tax.rate-and-bre.2017-07-01`"]),
    tableRow(["2021", money(dollars(50_000_000), AUD, 2), "26%", "30%", "`au-company-tax.rate-and-bre.2017-07-01`"]),
    tableRow(["2022 onward", money(dollars(50_000_000), AUD, 2), "25%", "30%", "`au-company-tax.rate-and-bre.2017-07-01`"]),
    tableRow(["Passive-income limb", "at most 80% of assessable income", "qualifies", "more than 80% fails", "`au-company-tax.rate-and-bre.2017-07-01`"]),
  ]);
  assertSectionQuotes(DOC, "Trustee assessment rate table", [
    tableRow(["Section 99A special rate before Medicare levy", "45%", "2023-2026", "`au-trust-tax.trustee-assessment.2022-07-01`"]),
    tableRow(["Medicare levy on s 99 / s 99A trustee assessment", "2%", "2022 onward", "`au-trust-tax.trustee-assessment.2022-07-01`"]),
    tableRow(["Foreign resident individual first band in 2026", "30% to A$135,000.00", "2026", "`au-trust-tax.trustee-assessment.2022-07-01`"]),
  ]);
  assertSectionQuotes(DOC, "Income-tax lodgment due-date table", [
    tableRow(["Self-lodger June-balancer AMIT, trust or company", "31 October in the income year", "company 1 December; trusts none", "`au-returns.due-dates.2026-07-01`"]),
    tableRow(["SAP trust or AMIT", "last day of fourth month after year end", "none", "`au-dates.income-year-and-sap-dates.2025-07-01`"]),
    tableRow(["SAP company", "15th day of seventh month after year end", "first day of sixth month after year end", "`au-dates.income-year-and-sap-dates.2025-07-01`"]),
  ]);
});
