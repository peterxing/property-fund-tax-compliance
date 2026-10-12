// Independent verification of the AU income-tax core against ATO / legislation sources retrieved 2026-10-10.
// Expectations below come from primary sources or hand calculations from them, not from this implementation.
import { test } from "node:test";
import assert from "node:assert/strict";

import { auIncomeYearEnd, auIncomeYearLabel, auIncomeYearStart, auSapCompanyLodgmentDueDate, auSapCompanyPaymentDueDate, auSapTrustLodgmentDueDate } from "../../../src/engine/au/dates.ts";
import { computeAuCompanyTax } from "../../../src/engine/au/companyTax.ts";
import { suggestAuCategory } from "../../../src/engine/au/mappingSuggestions.ts";
import { determineAuReturn } from "../../../src/engine/au/returns.ts";
import { computeAuTrustTax } from "../../../src/engine/au/trustTax.ts";

const D = (dollars: number): number => Math.round(dollars * 100);

function topCategory(code: string, name: string): string {
  return suggestAuCategory(code, name)[0]?.category ?? "<none>";
}

// ATO "Company tax rate changes" (retrieved 2026-10-10):
// 2017-18 $25m -> 27.5%; 2018-19 to 2019-20 $50m -> 27.5%; 2020-21 $50m -> 26%;
// 2021-22 and future years $50m -> 25%; all other companies 30%.
test("company rate history: under-threshold active companies have the published rate from 2017-18 to 2026-27", () => {
  const activeLine = { accountCode: "4000", accountName: "Project sales", debit: 0, credit: D(100_000), category: "REV_OTHER_AU" as const };
  const cases = [
    { incomeYear: 2018, turnover: D(24_999_999.99), expectedRateBps: 2750 },
    { incomeYear: 2019, turnover: D(49_999_999.99), expectedRateBps: 2750 },
    { incomeYear: 2020, turnover: D(49_999_999.99), expectedRateBps: 2750 },
    { incomeYear: 2021, turnover: D(49_999_999.99), expectedRateBps: 2600 },
    { incomeYear: 2022, turnover: D(49_999_999.99), expectedRateBps: 2500 },
    { incomeYear: 2023, turnover: D(49_999_999.99), expectedRateBps: 2500 },
    { incomeYear: 2024, turnover: D(49_999_999.99), expectedRateBps: 2500 },
    { incomeYear: 2025, turnover: D(49_999_999.99), expectedRateBps: 2500 },
    { incomeYear: 2026, turnover: D(49_999_999.99), expectedRateBps: 2500 },
    { incomeYear: 2027, turnover: D(49_999_999.99), expectedRateBps: 2500 },
  ];

  const actual = cases.map(({ incomeYear, turnover }) => {
    try {
      const result = computeAuCompanyTax({ incomeYear, regime: "COMPANY", lines: [activeLine], aggregatedTurnover: turnover });
      return { incomeYear, rateBps: result.summary.rateBps };
    } catch (error) {
      return { incomeYear, error: error instanceof Error ? error.name : String(error) };
    }
  });

  assert.deepEqual(
    actual,
    cases.map(({ incomeYear, expectedRateBps }) => ({ incomeYear, rateBps: expectedRateBps })),
  );
});

// ATO "Company tax rate changes" and LCR 2019/5: turnover must be less than the threshold and BREPI must be 80% or less.
// Rent, interest and a net capital gain are BREPI; trading income is not.
test("company BRE boundaries: exact threshold, exact 80%, rent/interest/net capital gain passive, trading income active", () => {
  const active = { accountCode: "4000", accountName: "Project sales", debit: 0, credit: D(20_000), category: "REV_OTHER_AU" as const };
  const passiveRent = { accountCode: "4010", accountName: "Rent", debit: 0, credit: D(80_000), category: "REV_RENT_BASE" as const };

  const belowThreshold = computeAuCompanyTax({ incomeYear: 2026, regime: "COMPANY", lines: [active], aggregatedTurnover: D(49_999_999.99) });
  assert.equal(belowThreshold.summary.rateBps, 2500);

  const atThreshold = computeAuCompanyTax({ incomeYear: 2026, regime: "COMPANY", lines: [active], aggregatedTurnover: D(50_000_000) });
  assert.equal(atThreshold.summary.rateBps, 3000);

  const atEighty = computeAuCompanyTax({ incomeYear: 2026, regime: "COMPANY", lines: [passiveRent, active], aggregatedTurnover: D(49_999_999.99) });
  assert.equal(atEighty.summary.passiveIncomeBps, 8000);
  assert.equal(atEighty.summary.rateBps, 2500);

  const aboveEighty = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    lines: [
      { accountCode: "4010", accountName: "Rent", debit: 0, credit: D(80_010), category: "REV_RENT_BASE" },
      { accountCode: "4000", accountName: "Project sales", debit: 0, credit: D(19_990), category: "REV_OTHER_AU" },
    ],
    aggregatedTurnover: D(49_999_999.99),
  });
  assert.equal(aboveEighty.summary.passiveIncomeBps, 8001);
  assert.equal(aboveEighty.summary.rateBps, 3000);

  const interestCase = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    lines: [
      { accountCode: "4000", accountName: "Trading income", debit: 0, credit: D(100_000), category: "REV_OTHER_AU" },
      { accountCode: "4010", accountName: "Interest income", debit: 0, credit: D(4_000), category: "REV_INTEREST" },
    ],
    aggregatedTurnover: D(49_999_999.99),
  });
  assert.equal(interestCase.summary.passiveIncomeBps, 385);
  assert.equal(interestCase.summary.rateBps, 2500);

  const investmentPropertyCompany = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    lines: [{ accountCode: "4010", accountName: "Rent", debit: 0, credit: D(700_000), category: "REV_RENT_BASE" }],
    aggregatedTurnover: D(49_999_999.99),
  });
  assert.equal(investmentPropertyCompany.summary.passiveIncomeBps, 10000);
  assert.equal(investmentPropertyCompany.summary.rateBps, 3000);

  const developerTradingCompany = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    lines: [{ accountCode: "4000", accountName: "Project sales", debit: 0, credit: D(700_000), category: "REV_OTHER_AU" }],
    aggregatedTurnover: D(49_999_999.99),
  });
  assert.equal(developerTradingCompany.summary.passiveIncomeBps, 0);
  assert.equal(developerTradingCompany.summary.rateBps, 2500);

  const capitalGainHeavy = computeAuCompanyTax({
    incomeYear: 2026,
    regime: "COMPANY",
    lines: [{ accountCode: "4000", accountName: "Trading income", debit: 0, credit: D(15_000), category: "REV_OTHER_AU" }],
    netCapitalGainBeforeDiscount: { discountable: 0, other: D(85_000) },
    aggregatedTurnover: D(49_999_999.99),
  });
  assert.equal(capitalGainHeavy.summary.passiveIncomeBps, 8500);
  assert.equal(capitalGainHeavy.summary.rateBps, 3000);
});

// ITAA 1936 s 95 (legislation.gov.au compilation 2026-07-01) defines trust net income as if the trustee were a resident;
// ATO CGT discount page (retrieved 2026-10-10) says Australian trusts can discount an eligible capital gain by 50% after capital losses.
test("trust STI: realistic property trust hand calculation matches line items and components", () => {
  const result = computeAuTrustTax({
    incomeYear: 2026,
    regime: "UNIT_TRUST",
    residentTrustEstate: true,
    tofaReviewRequired: false,
    lines: [
      { accountCode: "4000", accountName: "Base rent", debit: 0, credit: D(1_000_000), category: "REV_RENT_BASE" },
      { accountCode: "4010", accountName: "Outgoings recoveries", debit: 0, credit: D(100_000), category: "REV_RENT_RECOVERIES" },
      { accountCode: "4020", accountName: "Car park income", debit: 0, credit: D(50_000), category: "REV_RENT_CARPARK" },
      { accountCode: "4030", accountName: "Interest income", debit: 0, credit: D(10_000), category: "REV_INTEREST" },
      { accountCode: "4040", accountName: "Straight-line rent", debit: 0, credit: D(20_000), category: "REV_STRAIGHT_LINE_RENT" },
      { accountCode: "4050", accountName: "Fair value gain", debit: 0, credit: D(30_000), category: "REV_FAIR_VALUE_GAIN_PROPERTY" },
      { accountCode: "5000", accountName: "Depreciation", debit: D(40_000), credit: 0, category: "EXP_DEPRECIATION" },
      { accountCode: "5010", accountName: "Fair value loss", debit: D(5_000), credit: 0, category: "EXP_FAIR_VALUE_LOSS_PROPERTY" },
      { accountCode: "5020", accountName: "Borrowing cost amortisation", debit: D(6_000), credit: 0, category: "EXP_BORROWING_COSTS_AMORT" },
      { accountCode: "5030", accountName: "Lease incentive amortisation", debit: D(7_000), credit: 0, category: "EXP_LEASE_INCENTIVE_AMORT" },
      { accountCode: "5040", accountName: "Trustee fee", debit: D(8_000), credit: 0, category: "EXP_TRUSTEE_FEE" },
      { accountCode: "5050", accountName: "Land tax", debit: D(9_000), credit: 0, category: "EXP_LAND_TAX" },
      { accountCode: "5060", accountName: "Council rates", debit: D(11_000), credit: 0, category: "EXP_COUNCIL_RATES" },
      { accountCode: "5070", accountName: "Interest expense", debit: D(12_000), credit: 0, category: "EXP_INTEREST" },
      { accountCode: "5080", accountName: "Borrowing costs expensed", debit: D(4_000), credit: 0, category: "EXP_BORROWING_COSTS" },
      { accountCode: "5090", accountName: "Legal fees", debit: D(3_000), credit: 0, category: "EXP_LEGAL_FEES" },
      { accountCode: "5100", accountName: "Leasing fees", debit: D(2_500), credit: 0, category: "EXP_LEASING_FEES" },
      { accountCode: "5110", accountName: "Tax fees", debit: D(1_500), credit: 0, category: "EXP_TAX_FEES" },
    ],
    capitalWorksDeduction: D(15_000),
    depreciatingAssetsDeduction: D(25_000),
    borrowingExpensesDeduction: D(10_000),
    blackHoleExpenditureDeduction: D(2_000),
    straightLineRentAdjustment: D(20_000),
    netCapitalGainBeforeDiscount: { discountable: D(100_000), other: D(20_000) },
    priorYearTaxLossesBroughtForward: D(30_000),
  });

  assert.deepEqual(result.summary, {
    accountingProfit: D(1_101_000),
    netIncomeOfTrustEstate: D(1_081_000),
    taxableIncomeForTrustee: D(1_081_000),
    discountableCapitalGainGross: D(100_000),
    discountApplied: D(50_000),
    components: [
      { character: "RENT", amount: D(1_110_000) },
      { character: "INTEREST", amount: D(10_000) },
      { character: "CAPITAL_GAIN_DISCOUNTABLE", amount: D(100_000) },
      { character: "CAPITAL_GAIN_OTHER", amount: D(20_000) },
    ],
    presentlyEntitledNetIncomeAmount: D(1_081_000),
    notPresentlyEntitledNetIncomeAmount: 0,
    trusteeLevelTax: [],
  });

  const lineAmounts = Object.fromEntries(result.lines.map((line) => [line.code, line.amount]));
  assert.deepEqual(lineAmounts, {
    "AUTR.PBT": D(1_101_000),
    "AUTR.DEDUCT.REV_STRAIGHT_LINE_RENT": -D(20_000),
    "AUTR.DEDUCT.REV_FAIR_VALUE_GAIN_PROPERTY": -D(30_000),
    "AUTR.ADD.EXP_DEPRECIATION": D(40_000),
    "AUTR.ADD.EXP_FAIR_VALUE_LOSS_PROPERTY": D(5_000),
    "AUTR.ADD.EXP_BORROWING_COSTS_AMORT": D(6_000),
    "AUTR.ADD.EXP_LEASE_INCENTIVE_AMORT": D(7_000),
    "AUTR.ADD.EXP_BORROWING_COSTS": D(4_000),
    "AUTR.STRAIGHT_LINE_RENT": -D(20_000),
    "AUTR.SCHEDULE_DEDUCTIONS": -D(52_000),
    "AUTR.CGT_DISCOUNTABLE_GROSS": D(100_000),
    "AUTR.CGT_DISCOUNT": -D(50_000),
    "AUTR.CGT_OTHER": D(20_000),
    "AUTR.TAX_LOSSES": -D(30_000),
    "AUTR.NET_INCOME": D(1_081_000),
  });
});

// ITAA 1936 s 99A taxes undistributed trust income at the special rate, and ITAA 1936 s 251S(1)(c)
// says Medicare levy is also payable on amounts assessed under s 99 or s 99A; ATO resident rates page says the levy is 2%.
test("trustee s99A liability includes Medicare levy as well as the 45% special rate", () => {
  const result = computeAuTrustTax({
    incomeYear: 2026,
    regime: "UNIT_TRUST",
    residentTrustEstate: true,
    tofaReviewRequired: false,
    lines: [{ accountCode: "4000", accountName: "Base rent", debit: 0, credit: D(100_000), category: "REV_RENT_BASE" }],
    distribution: {
      presentlyEntitledNetIncomeAmount: 0,
      notPresentlyEntitledNetIncomeAmount: D(100_000),
      undistributedTaxMode: "SECTION_99A",
    },
  });

  assert.deepEqual(result.summary.trusteeLevelTax, [
    {
      basis: "SECTION_99A",
      taxableAmount: D(100_000),
      tax: D(47_000),
      label: "Trustee tax on income to which no beneficiary is presently entitled (s 99A special-rate basis)",
    },
  ]);
});

// ATO due-date pages retrieved 2026-10-10:
// - self-lodger June balancers: 31 October (income-tax due dates / AMIT 2026 instructions)
// - agent trusts: 31 Jan / 28 Feb / 31 Mar / 15 May / 5 June
// - agent companies: 31 Jan / 28 Feb / 31 Mar / 15 May / 5 June
// - SAP trusts: last day of 4th month; SAP companies: payment 1st day of 6th month, lodgment 15th day of 7th month.
test("AU date helpers and return dates agree with ATO June-balancer and SAP formulas", () => {
  assert.equal(auIncomeYearStart(2026), "2025-07-01");
  assert.equal(auIncomeYearEnd(2026), "2026-06-30");
  assert.equal(auIncomeYearLabel(2026), "2025-26");

  const decYearEnd = { month: 12, day: 31 } as const;
  assert.equal(auIncomeYearStart(2025, decYearEnd), "2025-01-01");
  assert.equal(auIncomeYearEnd(2025, decYearEnd), "2025-12-31");
  assert.equal(auSapTrustLodgmentDueDate(2025, decYearEnd), "2026-04-30");
  assert.equal(auSapCompanyPaymentDueDate(2025, decYearEnd), "2026-06-01");
  assert.equal(auSapCompanyLodgmentDueDate(2025, decYearEnd), "2026-07-15");

  assert.deepEqual(determineAuReturn({ incomeYear: 2026, regime: "UNIT_TRUST", lodgedBy: "SELF" }), {
    returnType: "TRUST_TAX_RETURN",
    dueDate: "2026-10-31",
    findings: [],
    notes: [
      "Calculations are decision-support outputs based on published ATO, legislation and State/Territory revenue office guidance on the stated retrieval dates. They are not tax advice. Rates, thresholds and filing rules change (many on 1 July or 1 January); a registered Australian tax agent or tax adviser must review every computation, assumption and lodgement before submission to the ATO or a State/Territory revenue office.",
    ],
  });

  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "UNIT_TRUST", lodgedBy: "REGISTERED_AGENT", annualTotalIncome: D(10_000_000.01), latestYearTaxable: true }).dueDate, "2027-01-31");
  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "UNIT_TRUST", lodgedBy: "REGISTERED_AGENT", annualTotalIncome: D(10_000_000.01), latestYearTaxable: false }).dueDate, "2027-02-28");
  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "UNIT_TRUST", lodgedBy: "REGISTERED_AGENT", latestYearTaxLiability: D(20_000) }).dueDate, "2027-03-31");
  const trustConcession = determineAuReturn({ incomeYear: 2026, regime: "UNIT_TRUST", lodgedBy: "REGISTERED_AGENT", applyFiveJuneConcession: true, expectsCurrentYearNonTaxableOrRefund: true, expectsPriorYearNonTaxableOrRefund: true });
  assert.equal(trustConcession.dueDate, "2027-05-15");
  assert.equal(trustConcession.concessionDueDate, "2027-06-05");

  const companySelf = determineAuReturn({ incomeYear: 2026, regime: "COMPANY", lodgedBy: "SELF" });
  assert.equal(companySelf.dueDate, "2026-10-31");
  assert.equal(companySelf.paymentDueDate, "2026-12-01");
  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "COMPANY", lodgedBy: "REGISTERED_AGENT", annualTotalIncome: D(10_000_000.01), latestYearTaxable: true }).dueDate, "2027-01-31");
  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "COMPANY", lodgedBy: "REGISTERED_AGENT", annualTotalIncome: D(10_000_000.01), latestYearTaxable: false }).dueDate, "2027-02-28");
  const companyMarch = determineAuReturn({ incomeYear: 2026, regime: "COMPANY", lodgedBy: "REGISTERED_AGENT", totalIncomePreviousYear: D(2_000_000.01) });
  assert.equal(companyMarch.dueDate, "2027-03-31");
  assert.equal(companyMarch.paymentDueDate, "2027-03-31");
});

// 60 trial-balance captions prepared independently from accounting/tax knowledge, then mapped onto the closest AU taxonomy id.
// The high-confidence traps here are: income reimbursements must not map to expenses, term deposits / unitholders funds /
// tenant deposits / receivables are balance-sheet captions, and non-recoverable GST on entertainment follows the non-deductible underlying outgoing.
test("AU mapper: 60 independent property-ledger captions land on the expected category", () => {
  const cases = [
    ["4000", "Base Rent - Retail Shop 12", "REV_RENT_BASE"],
    ["4010", "Outgoings Recoveries - HVAC", "REV_RENT_RECOVERIES"],
    ["4020", "Straight-line Rent Adjustment", "REV_STRAIGHT_LINE_RENT"],
    ["4030", "Lease Incentive Amortisation", "EXP_LEASE_INCENTIVE_AMORT"],
    ["4040", "Borrowing Costs Amortisation", "EXP_BORROWING_COSTS_AMORT"],
    ["4050", "Borrowing Costs Expensed", "EXP_BORROWING_COSTS"],
    ["4060", "Fair Value Gain on Investment Property", "REV_FAIR_VALUE_GAIN_PROPERTY"],
    ["4070", "Fair Value Loss on Investment Property", "EXP_FAIR_VALUE_LOSS_PROPERTY"],
    ["4080", "Distribution to Unitholders", "EQ_DISTRIBUTIONS_TO_UNITHOLDERS"],
    ["2080", "Distribution to Unitholders Payable", "EQ_DISTRIBUTIONS_TO_UNITHOLDERS"],
    ["4090", "Dividend Income", "REV_UNFRANKED_DIVIDEND"],
    ["4100", "Trust Distribution Income", "REV_TRUST_DISTRIBUTION_UNFRANKED"],
    ["1110", "Rental Income Receivable", "BS_RECEIVABLES"],
    ["2120", "Interest Payable", "BS_PAYABLES"],
    ["1130", "Prepaid Council Rates", "BS_PREPAYMENTS"],
    ["2140", "Accrued Trustee Fees", "BS_PAYABLES"],
    ["4150", "GST Clearing", "BS_OTHER"],
    ["4160", "Non-recoverable GST on Entertainment", "EXP_ENTERTAINMENT"],
    ["1170", "Land Tax Receivable from Tenant", "BS_RECEIVABLES"],
    ["4180", "Property Management Fee Income", "REV_MANAGEMENT_FEE"],
    ["5190", "Property Management Fees", "EXP_PROPERTY_MANAGEMENT"],
    ["5200", "Tenant Incentive Fee", "EXP_LEASING_FEES"],
    ["5210", "Acquisition Costs - Legal DD", "EXP_ACQUISITION_COSTS"],
    ["5220", "Stamp Duty on Acquisition", "EXP_STAMP_DUTY_ACQ"],
    ["5230", "Current Tax Expense", "EXP_INCOME_TAX"],
    ["5240", "Deferred Tax Expense", "EXP_INCOME_TAX"],
    ["2250", "Deferred Tax Liability", "BS_DEFERRED_TAX"],
    ["1260", "Investment in Managed Fund", "BS_INVESTMENTS"],
    ["2270", "Swap Liability", "BS_DERIVATIVE_LIABILITY"],
    ["5280", "Expected Credit Loss Provision", "EXP_IMPAIRMENT"],
    ["4290", "Trustee Fee Reimbursement Income", "REV_OTHER_AU"],
    ["4300", "Car Park Fees", "REV_RENT_CARPARK"],
    ["4310", "Parking Receipts", "REV_RENT_CARPARK"],
    ["4320", "Sundry Income", "REV_OTHER_AU"],
    ["1330", "Other Income Receivable", "BS_RECEIVABLES"],
    ["2360", "Employee Bonus Provision", "BS_PROVISIONS"],
    ["5360", "Agency Commission Expense", "EXP_AGENCY_COMMISSION"],
    ["4370", "Agency Commission Income", "REV_AGENCY_COMMISSION"],
    ["4380", "Managed Fund Distribution Franked", "REV_TRUST_DISTRIBUTION_FRANKED"],
    ["4390", "Managed Fund Distribution", "REV_TRUST_DISTRIBUTION_UNFRANKED"],
    ["5400", "Loan Establishment Fee", "EXP_BORROWING_COSTS"],
    ["5410", "Loan Fee Amortisation", "EXP_BORROWING_COSTS_AMORT"],
    ["1420", "Office Equipment at Cost", "BS_DEPRECIATING_ASSETS"],
    ["1430", "Accumulated Depreciation - Office Equipment", "BS_DEPRECIATING_ASSETS"],
    ["5440", "Capital Repairs - Roof Replacement", "EXP_REPAIRS_CAPITAL"],
    ["5450", "R&M - Plumbing", "EXP_REPAIRS_REVENUE"],
    ["5460", "Private Use Motor Vehicle", "EXP_OTHER_NON_DEDUCTIBLE"],
    ["4470", "Interest Income", "REV_INTEREST"],
    ["4480", "Term Deposit", "BS_CASH"],
    ["1490", "Income Tax Refund Receivable", "BS_RECEIVABLES"],
    ["4500", "Leasing Commission Income Receivable", "BS_RECEIVABLES"],
    ["4510", "Leasing Commission Income", "REV_AGENCY_COMMISSION"],
    ["5520", "Leasing Commission Expense", "EXP_LEASING_FEES"],
    ["5530", "Project Holding Costs", "EXP_DEV_HOLDING_COSTS"],
    ["5540", "Development Cost of Sales", "EXP_DEV_COST_OF_SALES"],
    ["4550", "Unitholders Funds", "BS_EQUITY"],
    ["4560", "Tenant Deposits Received", "BS_PAYABLES"],
    ["1570", "Other Payables", "BS_PAYABLES"],
    ["4580", "Other Receivables", "BS_RECEIVABLES"],
    ["5600", "Responsible Entity Fee", "EXP_RESPONSIBLE_ENTITY_FEE"],
  ] as const;

  const mismatches = cases
    .map(([code, name, expected]) => ({ code, name, expected, actual: topCategory(code, name) }))
    .filter((item) => item.actual !== item.expected);

  assert.deepEqual(mismatches, []);
});
