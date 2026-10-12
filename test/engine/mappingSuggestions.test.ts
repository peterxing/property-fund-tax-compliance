import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestCategory, type SuggestionHint } from "../../src/engine/mappingSuggestions.ts";
import type { TaxCategoryId } from "../../src/engine/taxonomy.ts";

interface MappingCase {
  code?: string;
  name: string;
  expected: TaxCategoryId;
  hint?: SuggestionHint;
}

function group(expected: TaxCategoryId, names: readonly string[], hint?: SuggestionHint, codePrefix?: string): MappingCase[] {
  return names.map((name, index) => ({ code: codePrefix ? `${codePrefix}${String(index + 1).padStart(3, "0")}` : String(index + 1), name, expected, hint }));
}

const baselineCases: readonly MappingCase[] = [
  ...group("REV_RENTAL", ["Base rent", "Gross rent - mall", "Lease rental Tower A"]),
  ...group("REV_SERVICE_CHARGE", ["Service charge income", "CAM recoveries", "Tenant utility recovery", "Service charge recoveries"]),
  ...group("REV_DEV_SALES", ["Development sales", "Property sales phase 1", "Unit sales residential"]),
  ...group("REV_FEES", ["Asset management fee income", "Property management fee income", "Agency commission income"]),
  ...group("INC_INTEREST", ["Interest income", "Deposit interest", "Bank interest"]),
  ...group("INC_FOREIGN", ["Foreign-sourced dividend", "Overseas branch profit", "Foreign service income"]),
  ...group("INC_FV_GAIN_PROPERTY", ["Fair value gain on investment property"]),
  ...group("EXP_PROPERTY_TAX", ["Property tax expense"]),
  ...group("EXP_REPAIRS_MAINT", ["R&M", "Repairs and maintenance"]),
  ...group("EXP_PROPERTY_MGMT", ["Property management fee", "Facilities management"]),
  ...group("EXP_INTEREST", ["Interest expense", "Bank loan interest", "Loan interest"]),
  ...group("EXP_FINANCE_OTHER", ["Commitment fee", "Arrangement fee"]),
  ...group("EXP_DEPRECIATION", ["Depreciation", "Amortisation"]),
  ...group("EXP_INCOME_TAX", ["Income tax expense", "Current tax", "Deferred tax expense"]),
  ...group("BS_INVESTMENT_PROPERTY", ["Investment property", "Investment properties"]),
  ...group("BS_RECEIVABLES", ["Trade receivable", "Tenant debtor"]),
  ...group("BS_PAYABLES", ["Trade payable", "Accrual"]),
  ...group("BS_BORROWINGS", ["Borrowings", "Bank loans", "Term loan"]),
  ...group("BS_DEFERRED_TAX", ["Deferred tax liability", "Deferred tax asset"]),
  ...group("BS_EQUITY", ["Equity", "Retained earnings"]),
];

const trickyCases: readonly MappingCase[] = [
  ...group("EXP_INTEREST", [
    "Interest expense - term loan",
    "Interest expense - bank loan",
    "Interest on term loan",
    "Interest on bank loan",
    "Interest paid - mortgage",
    "Interest paid on shareholder loan",
    "Mortgage interest expense",
    "Bank loan interest expense",
    "Term loan interest expense",
    "Interest on related party loan",
  ], undefined, "6"),
  ...group("INC_INTEREST", [
    "Fixed deposit interest received",
    "Interest received on current account",
    "Mortgage interest income",
    "Interest earned on deposits",
    "Coupon interest income",
    "Treasury interest received",
  ], undefined, "4"),
  ...group("BS_PAYABLES", [
    "Trade payables",
    "Trade creditors",
    "Other payables",
    "Other creditors",
    "Accruals",
    "Accrued interest payable",
    "Interest payable",
    "Amount due to related companies",
    "Amounts due to related company",
    "Amount due to related party",
    "Due to related companies",
    "Due to shareholder",
    "Provision for income tax",
    "Income tax provision",
    "Rental deposits received",
    "Rental deposit received",
    "Security deposits",
    "Security deposit",
    "Tenant deposits received",
    "Deferred revenue payable",
  ], undefined, "2"),
  ...group("BS_RECEIVABLES", [
    "Trade receivables",
    "Trade debtors",
    "Other receivables",
    "Tenant debtors",
    "Amounts due from related companies",
    "Amount due from related company",
    "Due from shareholder",
    "Rental income receivable",
    "Interest income receivable",
    "Interest receivable",
    "Prepaid insurance",
    "Prepaid expense",
    "Prepaid expenses",
    "Prepayments",
    "Utility deposits paid",
    "Commission receivable",
    "Other debtors",
    "Service charge receivable",
  ], undefined, "1"),
  ...group("BS_BORROWINGS", [
    "Loan from shareholder",
    "Loans from related parties",
    "Loan from related party",
    "Shareholder loan",
    "Shareholder loans",
    "Mortgage loan",
    "Mortgage loans",
    "Long-term borrowings",
    "Current borrowings",
    "Bank borrowings",
    "Bank loan principal",
    "Term loan principal",
    "Notes payable - bank",
  ], undefined, "2"),
  ...group("EXP_FINANCE_OTHER", [
    "Amortisation of borrowing costs",
    "Amortization of borrowing costs",
    "Loan arrangement fee amortisation",
    "Loan arrangement fee amortization",
    "Facility fee amortisation",
    "Facility fee amortization",
    "Guarantee fee expense",
    "Hedging costs",
    "Prepayment penalty on loan",
  ], undefined, "6"),
  ...group("EXP_MANAGER_FEE", [
    "Management fee expense",
    "Asset management fee expense",
    "Base management fee expense",
    "Performance fee expense",
    "Acquisition fee expense",
    "Divestment fee expense",
  ], { entityKind: "REIT" }, "6"),
  ...group("EXP_PROPERTY_MGMT", [
    "Property management fee expense",
    "Facilities management fee expense",
    "Building management fee expense",
    "Managing agent fee",
    "Property manager fee",
    "Property manager fees",
  ], undefined, "6"),
  ...group("EXP_INCOME_TAX", [
    "Provision charge for income tax",
    "Corporate income tax expense",
    "Deferred tax charge",
    "Tax expense - current year",
  ], undefined, "7"),
  ...group("BS_DEFERRED_TAX", [
    "Deferred tax liabilities",
    "Deferred tax assets",
    "Deferred tax balance",
    "Net deferred tax asset",
    "Net deferred tax liability",
  ], undefined, "1"),
  ...group("BS_CASH", [
    "Cash at bank",
    "Cash and bank balances",
    "Bank balances",
    "Fixed deposits",
    "Fixed deposit",
    "Petty cash on hand",
    "Cash equivalents",
    "Operating bank account",
  ], undefined, "1"),
  ...group("BS_PROPERTY_PLANT_EQUIPMENT", [
    "Land & buildings at cost",
    "Plant and machinery at cost",
    "Property, plant and equipment - office",
    "PPE - building services",
    "Accumulated depreciation - lifts",
    "Accumulated depreciation - HVAC",
    "Accumulated depreciation - furniture",
    "Office equipment at cost",
  ], undefined, "1"),
  ...group("BS_INVESTMENT_PROPERTY", [
    "Investment property at fair value",
    "Investment properties at fair value",
    "Investment property - retail mall",
    "Investment property - office tower",
    "Investment properties under development",
    "Investment properties - completed",
  ], undefined, "1"),
  ...group("BS_DEVELOPMENT_PROPERTIES", [
    "Development properties",
    "Development property inventory",
    "Property inventory - unsold units",
    "Inventory property - completed units",
    "Unsold development units",
    "Development land inventory",
  ], undefined, "1"),
  ...group("BS_EQUITY", [
    "Share capital",
    "Issued share capital",
    "Retained earnings",
    "Revenue reserves",
    "Capital reserves",
    "General reserves",
    "Unitholders' funds",
    "Total equity",
  ], undefined, "3"),
  ...group("REV_RENTAL", [
    "4010-000 Base Rent Income",
    "Base rental revenue",
    "Rental revenue - office",
    "Lease income - retail",
    "Gross rental revenue",
    "Rent received from tenants",
  ], undefined, "4"),
  ...group("REV_SERVICE_CHARGE", [
    "Service charge revenue",
    "Service charges",
    "Recoveries of service charges",
    "Recovery of property outgoings",
    "Outgoings recovered from tenants",
    "4010-000 Service Charge Recoveries",
    "Tenant recoveries income",
    "Utility recovery income",
    "Outgoings recoveries",
    "CAM recovery revenue",
  ], undefined, "4"),
  ...group("REV_CARPARK_OTHER", [
    "Car park revenue",
    "Turnover rent income",
    "Forfeited deposit income",
    "Lease termination income",
    "Advertising income - common area",
  ], undefined, "4"),
  ...group("REV_FEES", [
    "Agency commission revenue",
    "Property management income",
    "Asset management fee revenue",
    "Management fee income - external clients",
    "Project management fee income",
  ], undefined, "4"),
  ...group("EXP_INSURANCE", [
    "Insurance",
    "Insurance expense",
    "Insurance premiums",
    "Insurance expense - building",
    "Fire insurance premium",
    "Public liability insurance expense",
    "Professional indemnity insurance",
    "Property insurance premium",
  ], undefined, "6"),
  ...group("EXP_IMPAIRMENT", [
    "Provision for doubtful debts",
    "General provision for receivables",
    "Impairment loss on receivables",
    "Expected credit loss provision",
  ], undefined, "7"),
  ...group("EXP_DEPRECIATION", [
    "Depreciation - lifts",
    "Depreciation - escalators",
    "Depreciation - office equipment",
    "Amortisation of software",
    "Amortization of leasehold improvements",
  ], undefined, "7"),
  ...group("INC_GAIN_DISPOSAL", [
    "Gain on disposal of subsidiary",
    "Gain on disposal of investment property",
    "Gain on sale of quoted shares",
    "Disposal gain on fixed asset",
    "Profit on disposal of investment",
  ], undefined, "4"),
  ...group("EXP_LOSS_DISPOSAL", [
    "Loss on disposal of subsidiary",
    "Loss on sale of quoted shares",
    "Disposal loss on fixed asset",
    "Loss on disposal of investment property",
  ], undefined, "7"),
  ...group("EXP_DEV_COST_OF_SALES", [
    "Cost of sales - development units",
    "Construction cost sold",
    "Development cost sold - phase 2",
    "Land cost sold - residential project",
    "Project cost of sales",
  ], undefined, "5"),
  ...group("EXP_DEV_SELLING", [
    "Project marketing costs",
    "Sales commission - project",
    "Advertising expense - development launch",
    "Project promotion expense",
  ], undefined, "5"),
  ...group("EXP_DISTRIBUTIONS_OWNERS", [
    "Distribution to unitholders",
    "Distribution to shareholders",
    "Dividend declared for the year",
    "Interim distribution to unitholders",
  ], undefined, "7"),
  ...group("EXP_BAD_DEBTS", [
    "Bad debts written off - tenants",
    "Specific bad debt written off",
    "Trade bad debts written off",
    "Tenant balance written off",
  ], undefined, "7"),
  ...group("EXP_STAFF", [
    "Salary expense",
    "Directors' fees",
    "Directors' remuneration",
    "Salaries and CPF",
    "Staff bonus expense",
    "Bonus accrual",
    "CPF contribution expense",
    "Payroll costs",
    "SDL expense",
    "Foreign worker levy",
    "Wages expense",
  ], undefined, "7"),
  ...group("EXP_ADMIN", [
    "General and administrative expenses",
    "General & administrative",
    "Administrative expenses",
    "Admin expenses",
    "Office administration",
    "Office administration expense",
  ], undefined, "7"),
  ...group("EXP_PROFESSIONAL", [
    "Audit and secretarial fees",
    "Audit and tax fees",
    "Audit fees",
    "Legal and professional fees",
    "Legal fees",
    "Professional services fee",
    "Tax advisory fee",
    "Tax compliance fees",
    "Valuation fees",
  ], undefined, "7"),
  ...group("EXP_PENALTIES", [
    "Late payment penalty",
    "Regulatory fine",
    "Penalty charges",
    "Traffic fine expense",
  ], undefined, "7"),
  ...group("EXP_OTHER_DEDUCTIBLE", [
    "Marketing and advertising",
    "Advertising and promotion",
    "Marketing expenses",
    "Show flat expenses",
    "Office rental",
    "Rent expense",
    "Lease rental expense",
    "Software subscriptions",
    "Cloud software subscriptions",
    "Telephone and internet",
    "Travel and transport",
    "6200 Bank Charges",
    "Bank charges",
    "Printing and stationery",
    "Training and development",
    "Recruitment fees",
    "Subscriptions and licences",
    "Subscriptions and licenses",
    "Courier and postage",
    "Cleaning fees",
    "Security services",
    "Landscaping",
    "Pest control",
    "Quit rent",
    "Land rent",
    "MCST contributions",
    "Management corporation contributions",
  ], undefined, "6"),
  ...group("INC_FX_REALISED", [
    "Realised foreign exchange gain",
    "FX gain realised on settlement",
    "Exchange gain realised on loan",
  ], undefined, "4"),
  ...group("INC_FX_UNREALISED", [
    "Unrealised foreign exchange gain",
    "MTM FX gain on revaluation",
    "Unrealised FX gain on bank balance",
  ], undefined, "4"),
  ...group("EXP_FX_REALISED", [
    "Realised foreign exchange loss",
    "FX loss realised on settlement",
    "Exchange loss realised on loan",
  ], undefined, "7"),
  ...group("EXP_FX_UNREALISED", [
    "Unrealised foreign exchange loss",
    "MTM FX loss on revaluation",
    "Unrealised FX loss on bank balance",
  ], undefined, "7"),
  ...group("EXP_OTHER_DEDUCTIBLE", [
    "Sundry expenses",
    "Miscellaneous expenses",
    "Other expenses",
    "Other operating expenses",
  ], undefined, "7"),
  ...group("EXP_REPAIRS_MAINT", [
    "Lift maintenance",
  ], undefined, "7"),
  ...group("EXP_INTEREST", [
    "Bank interest paid",
  ], undefined, "7"),
  ...group("INC_GAIN_DISPOSAL", [
    "Gain on disposal of PPE",
  ], undefined, "4"),
  ...group("EXP_LOSS_DISPOSAL", [
    "Loss on disposal of PPE",
  ], undefined, "7"),
];

test("baseline mapping suggestions remain correct", () => {
  for (const item of baselineCases) {
    const suggestions = suggestCategory(item.code ?? "9999", item.name, item.hint);
    assert.equal(suggestions[0]?.category, item.expected, item.name);
  }
});

test("statement-first mapping handles tricky property-industry captions", () => {
  assert.ok(trickyCases.length >= 120);
  for (const item of trickyCases) {
    const suggestions = suggestCategory(item.code ?? "9999", item.name, item.hint);
    assert.equal(suggestions[0]?.category, item.expected, item.name);
  }
});

test("common captions get usable confidence while generic captions stay reviewable", () => {
  const highConfidenceCases = [
    ["4010-000 Service Charge Recoveries", "REV_SERVICE_CHARGE"],
    ["Insurance premiums", "EXP_INSURANCE"],
    ["Administrative expenses", "EXP_ADMIN"],
    ["Client gifts and corporate hospitality", "EXP_ENTERTAINMENT"],
    ["Audit and secretarial fees", "EXP_PROFESSIONAL"],
    ["Directors' remuneration", "EXP_STAFF"],
  ] as const;

  for (const [name, expected] of highConfidenceCases) {
    const suggestion = suggestCategory("6000", name)[0];
    assert.equal(suggestion?.category, expected, name);
    assert.ok((suggestion?.confidence ?? 0) >= 0.85, `${name} confidence`);
  }

  const explicitOtherDeductible = [
    "Marketing and advertising",
    "Show flat expenses",
    "Bank charges",
    "Software subscriptions",
    "Telephone and internet",
  ] as const;
  for (const name of explicitOtherDeductible) {
    const suggestion = suggestCategory("6000", name)[0];
    assert.equal(suggestion?.category, "EXP_OTHER_DEDUCTIBLE", name);
    assert.ok((suggestion?.confidence ?? 0) >= 0.8, `${name} min confidence`);
  }

  const genericOtherExpenses = [
    "Sundry expenses",
    "Miscellaneous expenses",
    "Other expenses",
    "Other operating expenses",
  ] as const;
  for (const name of genericOtherExpenses) {
    const suggestion = suggestCategory("7000", name)[0];
    assert.equal(suggestion?.category, "EXP_OTHER_DEDUCTIBLE", name);
    assert.ok((suggestion?.confidence ?? 1) <= 0.6, `${name} max confidence`);
  }
});

test("explicit wording beats weak hints and code-prefix tie-breakers", () => {
  assert.equal(
    suggestCategory("1000", "4010-000 Base Rent Income", { accountCodePrefix: "1", balanceSign: "DEBIT", statement: "BS" })[0]?.category,
    "REV_RENTAL",
  );
  assert.equal(
    suggestCategory("5000", "Rental income receivable", { statement: "PL", accountCodePrefix: "4" })[0]?.category,
    "BS_RECEIVABLES",
  );
  assert.equal(
    suggestCategory("2000", "Interest expense - term loan", { statement: "BS", accountCodePrefix: "2" })[0]?.category,
    "EXP_INTEREST",
  );
});

test("weak hints can steer otherwise unknown captions without creating high-confidence auto-maps", () => {
  const bsFallback = suggestCategory("2000", "Suspense control", { statement: "BS", accountCodePrefix: "2", balanceSign: "CREDIT" })[0];
  assert.equal(bsFallback?.category, "BS_OTHER");
  assert.ok((bsFallback?.confidence ?? 1) <= 0.3);

  const plIncomeFallback = suggestCategory("4000", "Other sundries", { accountCodePrefix: "4", nature: "INCOME" })[0];
  assert.equal(plIncomeFallback?.category, "INC_OTHER_TAXABLE");
  assert.ok((plIncomeFallback?.confidence ?? 1) <= 0.3);
});

test("unknown names fall back conservatively and never throw", () => {
  const unknown = suggestCategory("9999", "Completely unmatched label")[0];
  assert.equal(unknown?.category, "EXP_OTHER_DEDUCTIBLE");
  assert.ok((unknown?.confidence ?? 1) <= 0.3);
  const blankBs = suggestCategory("9999", "", { statement: "BS" })[0];
  assert.equal(blankBs?.category, "BS_OTHER");
  assert.ok((blankBs?.confidence ?? 1) <= 0.3);
});
