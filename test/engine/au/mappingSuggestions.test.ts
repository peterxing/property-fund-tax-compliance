import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestAuCategory, type AuSuggestionHint } from "../../../src/engine/au/mappingSuggestions.ts";
import type { AuTaxCategoryId } from "../../../src/engine/au/taxonomy.ts";

interface MappingCase {
  code?: string;
  name: string;
  expected: AuTaxCategoryId;
  hint?: AuSuggestionHint;
}

function group(expected: AuTaxCategoryId, names: readonly string[], hint?: AuSuggestionHint, codePrefix?: string): MappingCase[] {
  return names.map((name, index) => ({
    code: codePrefix ? `${codePrefix}${String(index + 1).padStart(3, "0")}` : String(index + 1),
    name,
    expected,
    ...(hint ? { hint } : {}),
  }));
}

const cases: readonly MappingCase[] = [
  ...group("REV_RENT_BASE", ["Base rent", "Rental income - Tower A", "Gross rent retail mall", "Lease income office tower", "Rent received - industrial", "Gross rental revenue", "Minimum guaranteed rent", "Contract rent income", "Base rental - warehouse", "Shop rental income"], undefined, "4"),
  ...group("REV_RENT_RECOVERIES", ["Service charge recoveries", "CAM recoveries", "Tenant outgoings recovery", "Utility recovery income", "Recovery income - rates", "Recovery income - insurance", "Outgoings recovered from tenants", "Service charge income", "Tenant recoveries", "Recovery of cleaning charges"], undefined, "4"),
  ...group("REV_RENT_CARPARK", ["Car park income", "Parking fees", "Carpark revenue", "Parking revenue retail", "Car park fees monthly", "Parking licence income", "Parking receipts", "Casual parking income"], undefined, "4"),
  ...group("REV_RENT_TURNOVER", ["Turnover rent", "Percentage rent", "Turnover rent - food court", "Retail percentage rent"], undefined, "4"),
  ...group("REV_RENT_OTHER", ["Forfeited deposit income", "Lease surrender income", "Advertising income common area", "Lease break fee income", "Common area promotion income"], undefined, "4"),
  ...group("REV_STRAIGHT_LINE_RENT", ["Straight-line rent", "Straight line rental adjustment", "Rent smoothing adjustment", "Straight line rent income"], undefined, "4"),
  ...group("REV_INTEREST", ["Interest income", "Deposit interest", "Bank interest received", "Interest earned", "Interest received on term deposit", "Coupon interest income", "Fixed deposit interest", "Interest income - cash mgmt"], undefined, "4"),
  ...group("REV_FRANKED_DIVIDEND", ["Franked dividend income", "Franked distribution", "Dividend income franked", "Franked dividend from REIT"], undefined, "4"),
  ...group("REV_UNFRANKED_DIVIDEND", ["Unfranked dividend", "Dividend income", "Dividend received - offshore no franking", "Unfranked distribution received"], undefined, "4"),
  ...group("REV_TRUST_DISTRIBUTION_FRANKED", ["Trust distribution - franked", "Unit trust distribution franked", "Fund distribution franked"], undefined, "4"),
  ...group("REV_TRUST_DISTRIBUTION_UNFRANKED", ["Trust distribution income", "Unit trust distribution", "Managed fund distribution", "Distribution received from wholesale trust"], undefined, "4"),
  ...group("REV_FOREIGN_INCOME", ["Foreign income", "Overseas rental income", "Foreign dividend income", "Foreign sourced interest", "Overseas fee income"], undefined, "4"),
  ...group("REV_AGENCY_COMMISSION", ["Agency commission income", "Leasing commission income", "Brokerage income", "Agency fees earned", "Commission revenue"], undefined, "4"),
  ...group("REV_MANAGEMENT_FEE", ["Property management fee income", "Management services revenue", "Asset management fee income", "Fund management fee income", "Management fee revenue"], undefined, "4"),
  ...group("REV_FAIR_VALUE_GAIN_PROPERTY", ["Fair value gain on investment property", "Revaluation gain - investment properties"], undefined, "4"),
  ...group("REV_FAIR_VALUE_GAIN_DERIVATIVES", ["Fair value gain on derivatives", "Mark to market gain - swaps", "MTM gain on hedge"], undefined, "4"),
  ...group("REV_GAIN_DISPOSAL", ["Gain on disposal of investment property", "Profit on disposal of asset", "Gain on sale of investment", "Disposal gain PPE"], undefined, "4"),
  ...group("REV_EQUITY_ACCOUNTED_PROFIT", ["Share of profit of associate", "Equity accounted profit JV", "Share of profit - joint venture"], undefined, "4"),
  ...group("EXP_LAND_TAX", ["Land tax expense", "NSW land tax", "Victorian land tax", "Land tax - QLD"], undefined, "6"),
  ...group("EXP_COUNCIL_RATES", ["Council rates", "Municipal rates", "Shire rates", "Council rates expense"], undefined, "6"),
  ...group("EXP_WATER_RATES", ["Water rates", "Water and sewerage rates", "Sewerage rates expense", "Water rates - retail"], undefined, "6"),
  ...group("EXP_REPAIRS_REVENUE", ["R&M", "Repairs and maintenance", "Building maintenance expense", "Repairs expense", "Maintenance expense - HVAC", "Routine repairs", "Cleaning and repairs"], undefined, "6"),
  ...group("EXP_REPAIRS_CAPITAL", ["Capital repairs", "Major refurbishment expense", "Fitout capitalised through p&l", "Capital replacement works"], undefined, "6"),
  ...group("EXP_INSURANCE", ["Insurance", "Property insurance premium", "Public liability insurance", "Professional indemnity insurance", "Insurance expense building", "Industrial special risks insurance"], undefined, "6"),
  ...group("EXP_PROPERTY_MANAGEMENT", ["Property management fee", "Managing agent fee", "Facilities management fee", "Building management fee", "Property manager fee", "Property management fees"], undefined, "6"),
  ...group("EXP_LEASING_FEES", ["Leasing commission", "Leasing fees", "Letting fee", "Tenant incentive fee", "Leasing commission expense"], undefined, "6"),
  ...group("EXP_RESPONSIBLE_ENTITY_FEE", ["Responsible entity fee", "RE fee", "Responsible entity base fee"], undefined, "6"),
  ...group("EXP_TRUSTEE_FEE", ["Trustee fee", "Trustee fees"], undefined, "6"),
  ...group("EXP_CUSTODIAN_FEE", ["Custodian fee", "Custodian fees"], undefined, "6"),
  ...group("EXP_INVESTMENT_MGMT_FEE", ["Investment management fee", "Asset management fee expense", "Fund management fee", "Performance fee expense"], undefined, "6"),
  ...group("EXP_AUDIT_FEES", ["Audit fees", "Audit fee", "External audit fees"], undefined, "6"),
  ...group("EXP_LEGAL_FEES", ["Legal fees", "Legal expenses", "Solicitors fees", "Legal fee - leasing"], undefined, "6"),
  ...group("EXP_TAX_FEES", ["Tax fees", "Tax advisory fees", "Tax compliance fees", "Tax consulting"], undefined, "6"),
  ...group("EXP_VALUATION_FEES", ["Valuation fees", "Independent valuation fee", "Property valuation charges"], undefined, "6"),
  ...group("EXP_BORROWING_COSTS", ["Borrowing costs", "Loan establishment fee", "Arrangement fee", "Facility fee", "Debt raising costs"], undefined, "6"),
  ...group("EXP_BORROWING_COSTS_AMORT", ["Amortisation of borrowing costs", "Borrowing cost amortisation", "Facility fee amortisation", "Loan fee amortization"], undefined, "6"),
  ...group("EXP_INTEREST", ["Interest expense", "Interest paid", "Loan interest", "Bank interest expense", "Interest on mortgage", "Term loan interest", "Interest expense - hedged debt", "Related party loan interest"], undefined, "6"),
  ...group("EXP_LEASE_INCENTIVE_AMORT", ["Lease incentive amortisation", "Amortisation of lease incentive", "Lease incentive amortization"], undefined, "6"),
  ...group("EXP_DEPRECIATION", ["Depreciation", "Depreciation - lifts", "Depreciation office equipment", "Building depreciation"], undefined, "6"),
  ...group("EXP_AMORTISATION", ["Amortisation", "Amortisation - software", "Amortization - leasehold improvements", "Amortisation intangible asset"], undefined, "6"),
  ...group("EXP_FAIR_VALUE_LOSS_PROPERTY", ["Fair value loss on investment property", "Revaluation loss investment properties"], undefined, "6"),
  ...group("EXP_FAIR_VALUE_LOSS_DERIVATIVES", ["Fair value loss on derivatives", "Mark to market loss - swaps", "MTM loss hedge"], undefined, "6"),
  ...group("EXP_LOSS_DISPOSAL", ["Loss on disposal of investment", "Loss on sale of investment property", "Disposal loss PPE", "Loss on disposal"], undefined, "6"),
  ...group("EXP_IMPAIRMENT", ["Impairment loss", "Expected credit loss provision", "Provision for doubtful debts", "Impairment receivables"], undefined, "6"),
  ...group("EXP_STAMP_DUTY_ACQ", ["Stamp duty", "Transfer duty", "Acquisition stamp duty", "NSW stamp duty"], undefined, "6"),
  ...group("EXP_ACQUISITION_COSTS", ["Acquisition costs", "Due diligence costs", "Capital raising costs", "Acquisition expenses"], undefined, "6"),
  ...group("EXP_ENTERTAINMENT", ["Entertainment expense", "Client hospitality", "Corporate hospitality", "Client gifts and hospitality"], undefined, "6"),
  ...group("EXP_PENALTIES", ["Penalty expense", "Fines and penalties", "Late payment charge ATO", "Environmental fine"], undefined, "6"),
  ...group("EXP_INCOME_TAX", ["Income tax expense", "Current tax", "Deferred tax expense", "Tax expense"], undefined, "7"),
  ...group("EXP_GST_NON_RECOVERABLE", ["Non-recoverable GST", "Irrecoverable GST expense", "GST not claimable"], undefined, "6"),
  ...group("EXP_DEV_COST_OF_SALES", ["Cost of sales", "Development cost sold", "Construction cost sold", "Land cost sold", "Project cost of sales"], undefined, "5"),
  ...group("EXP_DEV_HOLDING_COSTS", ["Development holding costs", "Project holding costs", "Development overheads", "Project overhead recoverable"], undefined, "5"),
  ...group("EXP_AGENCY_COMMISSION", ["Agency commission expense", "Brokerage expense", "Agency fee expense", "Commission expense"], undefined, "6"),
  ...group("EXP_WAGES", ["Wages", "Salary expense", "Salaries and wages", "Directors remuneration", "Wages and salaries", "Payroll wages"], undefined, "7"),
  ...group("EXP_SUPER", ["Superannuation expense", "Employer superannuation", "Super guarantee", "SG expense"], undefined, "7"),
  ...group("EXP_PAYROLL_TAX", ["Payroll tax", "Payroll tax expense", "State payroll tax"], undefined, "7"),
  ...group("BS_INVESTMENT_PROPERTY", ["Investment property", "Investment properties", "Investment property at fair value", "Investment property retail mall"], undefined, "1"),
  ...group("BS_DEPRECIATING_ASSETS", ["Property, plant and equipment", "PPE", "Plant and equipment", "Accumulated depreciation", "Office equipment at cost"], undefined, "1"),
  ...group("BS_DEVELOPMENT_INVENTORY", ["Development inventory", "Work in progress", "Property inventory", "Unsold units", "Project WIP"], undefined, "1"),
  ...group("BS_INVESTMENTS", ["Investments", "Units in trust", "Investment in managed fund", "Investment in associate"], undefined, "1"),
  ...group("BS_DERIVATIVE_ASSET", ["Derivative asset", "Swap asset"], undefined, "1"),
  ...group("BS_DERIVATIVE_LIABILITY", ["Derivative liability", "Swap liability"], undefined, "2"),
  ...group("BS_CASH", ["Cash at bank", "Bank account", "Fixed deposit", "Term deposit", "Cash management account", "Petty cash"], undefined, "1"),
  ...group("BS_RECEIVABLES", ["Trade receivables", "Tenant debtor", "Amount due from related party", "Income receivable", "Interest receivable", "Commission receivable"], undefined, "1"),
  ...group("BS_PREPAYMENTS", ["Prepaid insurance", "Prepayments", "Prepaid expenses", "Prepayment - rent"], undefined, "1"),
  ...group("BS_PAYABLES", ["Trade payables", "Other creditors", "Accruals", "Amount due to related party", "Interest payable", "Tenant deposits received"], undefined, "2"),
  ...group("BS_PROVISIONS", ["Provision for income tax", "Current tax liability", "Employee provisions", "Provision annual leave"], undefined, "2"),
  ...group("BS_BORROWINGS", ["Borrowings", "Term loan", "Bank loan", "Mortgage loan", "Loan from shareholder", "Notes payable"], undefined, "2"),
  ...group("BS_DEFERRED_TAX", ["Deferred tax asset", "Deferred tax liability", "Deferred tax balance"], undefined, "1"),
  ...group("BS_EQUITY", ["Share capital", "Retained earnings", "Unitholders funds", "Total equity", "Capital reserve"], undefined, "3"),
  ...group("EQ_DISTRIBUTIONS_TO_UNITHOLDERS", ["Distribution to unitholders", "Unit holder distribution"], undefined, "3"),
  ...group("EQ_DIVIDENDS_PAID", ["Dividend declared", "Dividends paid", "Interim dividend"], undefined, "3"),
];

test("AU mapping suggestions cover at least 150 tricky captions with expected categories", () => {
  assert.ok(cases.length >= 150);
  for (const item of cases) {
    const result = suggestAuCategory(item.code ?? "", item.name, item.hint);
    assert.equal(result[0]?.category, item.expected, `${item.code ?? ""} ${item.name}`);
    assert.ok((result[0]?.confidence ?? 0) >= 0.55, `${item.code ?? ""} ${item.name}`);
  }
});

test("receivable, payable, prepaid and accrued captions stay on the balance sheet", () => {
  assert.equal(suggestAuCategory("4001", "Rent receivable")[0]?.category, "BS_RECEIVABLES");
  assert.equal(suggestAuCategory("6101", "Interest payable")[0]?.category, "BS_PAYABLES");
  assert.equal(suggestAuCategory("6999", "Prepaid insurance")[0]?.category, "BS_PREPAYMENTS");
  assert.equal(suggestAuCategory("6102", "Accrued leasing commission")[0]?.category, "BS_PAYABLES");
});

test("income reimbursements and GST-on-underlying captions respect underlying nature", () => {
  assert.equal(suggestAuCategory("4290", "Trustee Fee Reimbursement Income")[0]?.category, "REV_OTHER_AU");
  assert.equal(suggestAuCategory("4160", "Non-recoverable GST on Entertainment")[0]?.category, "EXP_ENTERTAINMENT");
  assert.equal(suggestAuCategory("4480", "Term Deposit")[0]?.category, "BS_CASH");
  assert.equal(suggestAuCategory("4550", "Unitholders Funds")[0]?.category, "BS_EQUITY");
  assert.equal(suggestAuCategory("4560", "Tenant Deposits Received")[0]?.category, "BS_PAYABLES");
  assert.equal(suggestAuCategory("4580", "Other Receivables")[0]?.category, "BS_RECEIVABLES");
});

test("unknown or odd names stay low confidence", () => {
  const odd = suggestAuCategory("9999", "Blue bucket");
  assert.equal((odd[0]?.confidence ?? 1) <= 0.3, true);
  const weakIncome = suggestAuCategory("4000", "Sundry bucket");
  assert.equal((weakIncome[0]?.confidence ?? 1) <= 0.3, true);
});
