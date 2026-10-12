import type { Cents } from "../money.ts";
import type { CategoryGroup, Nature, TaxCategoryDef } from "../taxonomy.ts";
import type { AuIncomeCharacter } from "./types.ts";

export type AuTreatment =
  | "TAXABLE"
  | "NON_ASSESSABLE"
  | "DEDUCTIBLE"
  | "NON_DEDUCTIBLE"
  | "CAPITAL"
  | "TIMING_DIFFERENCE"
  | "NOT_APPLICABLE";

export interface AuTaxCategoryDef extends Omit<TaxCategoryDef, "treatment"> {
  treatment: AuTreatment;
  character?: AuIncomeCharacter;
}

export const AU_TAX_CATEGORIES = [
  { id: "REV_RENT_BASE", label: "Base rent", group: "PROPERTY_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: false, character: "RENT", ref: "s 6-5 ITAA 1997", guidance: "Cash or accrued lease rent from Australian property is ordinarily assessable." },
  { id: "REV_RENT_RECOVERIES", label: "Outgoings / service charge recoveries", group: "PROPERTY_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: false, character: "RENT", guidance: "Tenant recoveries and outgoings recovered under the lease are generally assessable with the rent stream." },
  { id: "REV_RENT_CARPARK", label: "Car park and parking income", group: "PROPERTY_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: false, character: "RENT", guidance: "Car park and parking income derived from the property business is ordinarily assessable." },
  { id: "REV_RENT_TURNOVER", label: "Turnover rent", group: "PROPERTY_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: false, character: "RENT", guidance: "Turnover rent is part of ordinary rental income." },
  { id: "REV_RENT_OTHER", label: "Other leasing income", group: "PROPERTY_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: true, character: "RENT", guidance: "Other lease-related receipts are generally assessable but should be checked for capital or premium features." },
  { id: "REV_STRAIGHT_LINE_RENT", label: "Straight-line rent adjustment", group: "GAINS_AND_FAIR_VALUE", nature: "INCOME", treatment: "TIMING_DIFFERENCE", sourcing: "ANY", needsReview: true, character: "RENT", guidance: "Straight-line rent is an accounting timing entry and normally needs a tax adjustment back to lease cash flows." },
  { id: "REV_INTEREST", label: "Interest income", group: "OTHER_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: false, character: "INTEREST", ref: "s 6-5 ITAA 1997", guidance: "Interest is assessable income unless a specific exemption applies." },
  { id: "REV_FRANKED_DIVIDEND", label: "Franked dividends", group: "OTHER_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: true, character: "FRANKED_DIVIDEND", guidance: "Franked dividends are assessable and usually come with franking credits and offsets that must be tracked separately." },
  { id: "REV_UNFRANKED_DIVIDEND", label: "Unfranked dividends", group: "OTHER_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: false, character: "UNFRANKED_DIVIDEND", guidance: "Unfranked dividends are assessable income." },
  { id: "REV_TRUST_DISTRIBUTION_FRANKED", label: "Franked trust distributions received", group: "OTHER_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: true, character: "FRANKED_DIVIDEND", guidance: "Trust distributions that carry franked dividend components must be traced to their tax character." },
  { id: "REV_TRUST_DISTRIBUTION_UNFRANKED", label: "Other trust distributions received", group: "OTHER_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: true, character: "OTHER_AU_INCOME", guidance: "Trust distributions are ordinarily assessable but need tracing to passive, foreign, capital-gain or franked components." },
  { id: "REV_FOREIGN_INCOME", label: "Foreign income", group: "OTHER_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "FOREIGN", needsReview: true, character: "FOREIGN_INCOME", guidance: "Foreign income is generally assessable, with foreign tax offsets and source issues reviewed separately." },
  { id: "REV_AGENCY_COMMISSION", label: "Agency and commission income", group: "PROPERTY_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: false, character: "OTHER_AU_INCOME", guidance: "Agency, leasing and commission income earned in the business is assessable." },
  { id: "REV_MANAGEMENT_FEE", label: "Property / asset management fee income", group: "PROPERTY_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: false, character: "OTHER_AU_INCOME", guidance: "Property and asset management fees are ordinary assessable income." },
  { id: "REV_OTHER_AU", label: "Other Australian assessable income", group: "OTHER_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: true, character: "OTHER_AU_INCOME", guidance: "Other income-nature receipts are generally assessable unless a specific exclusion is identified." },
  { id: "REV_FAIR_VALUE_GAIN_PROPERTY", label: "Fair value gains on investment property", group: "GAINS_AND_FAIR_VALUE", nature: "INCOME", treatment: "NON_ASSESSABLE", sourcing: "ANY", needsReview: true, guidance: "Unrealised fair value gains are generally not assessable until a taxing event occurs." },
  { id: "REV_FAIR_VALUE_GAIN_DERIVATIVES", label: "Fair value gains on derivatives", group: "GAINS_AND_FAIR_VALUE", nature: "INCOME", treatment: "NON_ASSESSABLE", sourcing: "ANY", needsReview: true, guidance: "Derivative fair value gains usually require TOFA and hedge review before any tax adjustment is finalised." },
  { id: "REV_GAIN_DISPOSAL", label: "Gain on disposal", group: "GAINS_AND_FAIR_VALUE", nature: "INCOME", treatment: "CAPITAL", sourcing: "ANY", needsReview: true, guidance: "Disposal gains should be replaced by the CGT or trading-stock outcome, not accepted directly from accounting profit." },
  { id: "REV_EQUITY_ACCOUNTED_PROFIT", label: "Share of equity-accounted profit", group: "OTHER_INCOME", nature: "INCOME", treatment: "NON_ASSESSABLE", sourcing: "ANY", needsReview: true, guidance: "Equity-accounting profits are not themselves the taxing point and should be replaced with the underlying tax outcome." },
  { id: "EXP_LAND_TAX", label: "Land tax", group: "PROPERTY_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Recurring land tax on income-producing property is ordinarily deductible." },
  { id: "EXP_COUNCIL_RATES", label: "Council rates", group: "PROPERTY_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Council rates on income-producing property are generally deductible." },
  { id: "EXP_WATER_RATES", label: "Water rates", group: "PROPERTY_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Water and sewerage rates on income-producing property are generally deductible." },
  { id: "EXP_REPAIRS_REVENUE", label: "Repairs and maintenance – revenue", group: "PROPERTY_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Revenue repairs are deductible but must be separated from capital improvements." },
  { id: "EXP_REPAIRS_CAPITAL", label: "Repairs and maintenance – capital", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "CAPITAL", sourcing: "ANY", needsReview: true, guidance: "Capital works, replacements and improvements are not immediately deductible and should be sent to Div 40 / Div 43 schedules." },
  { id: "EXP_INSURANCE", label: "Insurance", group: "PROPERTY_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Property and business insurance premiums are generally deductible." },
  { id: "EXP_PROPERTY_MANAGEMENT", label: "Property management fees", group: "PROPERTY_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Property management fees incurred in deriving rent are generally deductible." },
  { id: "EXP_LEASING_FEES", label: "Leasing fees and commissions", group: "PROPERTY_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Recurring leasing commissions are generally deductible, but acquisition or structural lease costs may be capital." },
  { id: "EXP_RESPONSIBLE_ENTITY_FEE", label: "Responsible entity fees", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Recurring responsible-entity fees are generally deductible if they relate to the earning of assessable income." },
  { id: "EXP_TRUSTEE_FEE", label: "Trustee fees", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Recurring trustee fees are generally deductible." },
  { id: "EXP_CUSTODIAN_FEE", label: "Custodian fees", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Custodian fees are generally deductible when incurred in managing the income-producing structure." },
  { id: "EXP_INVESTMENT_MGMT_FEE", label: "Investment management fees", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Recurring investment management fees are generally deductible; acquisition and disposal components need review." },
  { id: "EXP_AUDIT_FEES", label: "Audit fees", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Audit fees are generally deductible." },
  { id: "EXP_LEGAL_FEES", label: "Legal fees", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Revenue legal fees are generally deductible, but acquisition, disposal and capital-raising fees are capital." },
  { id: "EXP_TAX_FEES", label: "Tax and compliance fees", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Recurring tax compliance and revenue accounting fees are generally deductible." },
  { id: "EXP_VALUATION_FEES", label: "Valuation fees", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Recurring valuation fees may be deductible, but transaction-related valuations need capital review." },
  { id: "EXP_BORROWING_COSTS", label: "Borrowing costs", group: "FINANCE_COSTS", nature: "EXPENSE", treatment: "TIMING_DIFFERENCE", sourcing: "ANY", needsReview: true, guidance: "Borrowing costs are usually spread under the tax rules rather than taken exactly as booked." },
  { id: "EXP_BORROWING_COSTS_AMORT", label: "Borrowing cost amortisation", group: "FINANCE_COSTS", nature: "EXPENSE", treatment: "TIMING_DIFFERENCE", sourcing: "ANY", needsReview: true, guidance: "Accounting amortisation of borrowing costs should be replaced by the tax borrowing-expense schedule." },
  { id: "EXP_INTEREST", label: "Interest expense", group: "FINANCE_COSTS", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Interest is generally deductible if the borrowing is sufficiently connected to assessable income and not denied by thin capitalisation or other integrity rules." },
  { id: "EXP_LEASE_INCENTIVE_AMORT", label: "Lease incentive amortisation", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "TIMING_DIFFERENCE", sourcing: "ANY", needsReview: true, guidance: "Lease incentive amortisation is an accounting allocation that typically needs replacement with the actual tax treatment of the incentive." },
  { id: "EXP_DEPRECIATION", label: "Depreciation", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s 8-1 ITAA 1997; Div 40 ITAA 1997", guidance: "Accounting depreciation is added back and replaced by Div 40 deductions." },
  { id: "EXP_AMORTISATION", label: "Amortisation", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Accounting amortisation is added back unless a specific tax deduction is available." },
  { id: "EXP_FAIR_VALUE_LOSS_PROPERTY", label: "Fair value losses on investment property", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Unrealised fair value losses are generally not deductible." },
  { id: "EXP_FAIR_VALUE_LOSS_DERIVATIVES", label: "Fair value losses on derivatives", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Derivative fair value losses require TOFA and hedge review before deduction is accepted." },
  { id: "EXP_LOSS_DISPOSAL", label: "Loss on disposal", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "CAPITAL", sourcing: "ANY", needsReview: true, guidance: "Accounting disposal losses should be replaced by the CGT or trading-stock outcome." },
  { id: "EXP_IMPAIRMENT", label: "Impairment and general provisions", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Impairment and general provisions are ordinarily added back unless a specific deduction is established." },
  { id: "EXP_STAMP_DUTY_ACQ", label: "Stamp duty on acquisition", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "CAPITAL", sourcing: "ANY", needsReview: false, guidance: "Acquisition stamp duty is capital and forms part of cost base or trading stock cost, not an immediate deduction." },
  { id: "EXP_ACQUISITION_COSTS", label: "Acquisition and capital transaction costs", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "CAPITAL", sourcing: "ANY", needsReview: false, guidance: "Due diligence, capital-raising and acquisition costs are capital unless a specific deduction applies." },
  { id: "EXP_ENTERTAINMENT", label: "Entertainment", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Entertainment is often non-deductible and should be reviewed for fringe-benefits or employee amenity exceptions." },
  { id: "EXP_PENALTIES", label: "Penalties and fines", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Penalties and fines are not deductible." },
  { id: "EXP_INCOME_TAX", label: "Income tax expense", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Income tax expense is not deductible in working out taxable income." },
  { id: "EXP_GST_NON_RECOVERABLE", label: "GST non-recoverable", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Irrecoverable GST usually follows the deductibility of the underlying outgoing and should be checked." },
  { id: "EXP_DEV_COST_OF_SALES", label: "Development cost of sales", group: "DEVELOPMENT", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Developer trading-stock cost of sales is ordinarily deductible through the trading-stock rules." },
  { id: "EXP_DEV_HOLDING_COSTS", label: "Development holding costs", group: "DEVELOPMENT", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Developer holding and project costs are deductible or trading-stock costs depending on the facts and should be reviewed." },
  { id: "EXP_AGENCY_COMMISSION", label: "Agency commission expense", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Agency commissions paid in earning fee income are generally deductible." },
  { id: "EXP_WAGES", label: "Wages and salaries", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Wages and salaries incurred in the business are generally deductible." },
  { id: "EXP_SUPER", label: "Superannuation", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Employer superannuation is generally deductible subject to timing and payment rules." },
  { id: "EXP_PAYROLL_TAX", label: "Payroll tax", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "State payroll tax is generally deductible." },
  { id: "EXP_OTHER_DEDUCTIBLE", label: "Other deductible expenses", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Residual operating expenses are generally deductible if incurred in gaining assessable income." },
  { id: "EXP_OTHER_NON_DEDUCTIBLE", label: "Other non-deductible expenses", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Private, capital or specifically denied outgoings should be added back." },
  { id: "EQ_DISTRIBUTIONS_TO_UNITHOLDERS", label: "Distributions to unitholders", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Distributions are appropriations of profit or trust capital, not tax deductions." },
  { id: "EQ_DIVIDENDS_PAID", label: "Dividends paid", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Dividends are appropriations of profit, not deductible expenses." },
  { id: "BS_INVESTMENT_PROPERTY", label: "Investment property", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Balance-sheet investment property account for reasonableness and schedule reconciliation." },
  { id: "BS_DEPRECIATING_ASSETS", label: "Depreciating assets / PPE", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Balance-sheet asset account reconciled to Div 40 schedules." },
  { id: "BS_DEVELOPMENT_INVENTORY", label: "Development inventory", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Trading stock or work in progress for property developments." },
  { id: "BS_INVESTMENTS", label: "Investments and units in other trusts", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Investments held on capital account or as units in other trusts." },
  { id: "BS_DERIVATIVE_ASSET", label: "Derivative asset", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Balance-sheet derivative asset for TOFA and hedge review." },
  { id: "BS_DERIVATIVE_LIABILITY", label: "Derivative liability", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Balance-sheet derivative liability for TOFA and hedge review." },
  { id: "BS_CASH", label: "Cash and deposits", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Cash, bank and deposit balances." },
  { id: "BS_RECEIVABLES", label: "Receivables", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Trade and other receivables, including accrued income." },
  { id: "BS_PREPAYMENTS", label: "Prepayments", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Prepayments and other deferred charges." },
  { id: "BS_PAYABLES", label: "Payables and accruals", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Trade payables, accruals and operating liabilities." },
  { id: "BS_PROVISIONS", label: "Provisions", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Balance-sheet provisions, including current tax and employee provisions." },
  { id: "BS_BORROWINGS", label: "Borrowings", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Loans, notes and other external or related-party borrowings." },
  { id: "BS_DEFERRED_TAX", label: "Deferred tax", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Deferred tax assets and liabilities for accounting/tax timing reconciliation." },
  { id: "BS_EQUITY", label: "Equity / unitholder funds", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Issued capital, reserves and retained earnings / unitholder funds." },
  { id: "BS_OTHER", label: "Other balance-sheet items", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Fallback for remaining balance-sheet accounts." },
] as const satisfies readonly AuTaxCategoryDef[];

export type AuTaxCategoryId = (typeof AU_TAX_CATEGORIES)[number]["id"];
export type AuIncomeCategoryId = Extract<AuTaxCategoryId, `REV_${string}`>;

const BY_ID: ReadonlyMap<string, AuTaxCategoryDef> = new Map(AU_TAX_CATEGORIES.map((category) => [category.id, category]));

export function getAuCategory(id: string): AuTaxCategoryDef | undefined {
  return BY_ID.get(id);
}

export function requireAuCategory(id: string): AuTaxCategoryDef {
  const category = BY_ID.get(id);
  if (!category) throw new RangeError(`Unknown Australian tax category "${id}"`);
  return category;
}

export function isAuTaxCategoryId(id: string): id is AuTaxCategoryId {
  return BY_ID.has(id);
}

export interface AuMappedTbLine {
  accountCode: string;
  accountName: string;
  debit: Cents;
  credit: Cents;
  category: AuTaxCategoryId;
  propertyCode?: string;
  overridden?: boolean;
}

export function auNaturalAmount(line: Pick<AuMappedTbLine, "debit" | "credit" | "category">): Cents {
  const category = requireAuCategory(line.category);
  return category.nature === "INCOME" ? line.credit - line.debit : line.debit - line.credit;
}

export function auTotalsByCategory(lines: readonly AuMappedTbLine[]): Partial<Record<AuTaxCategoryId, Cents>> {
  const totals: Partial<Record<AuTaxCategoryId, Cents>> = {};
  for (const line of lines) {
    totals[line.category] = (totals[line.category] ?? 0) + auNaturalAmount(line);
  }
  return totals;
}
