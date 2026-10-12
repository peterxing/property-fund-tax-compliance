/**
 * Tax-category taxonomy for Singapore property-industry trial balances.
 *
 * Every trial-balance account is mapped to exactly one TaxCategory. The category carries the DEFAULT income-tax
 * treatment which the tax-computation engine applies automatically; preparers may override per account
 * (overrides are flagged and audited). Categories marked `needsReview` make the engine prompt for a
 * confirmation / manual adjustment whenever the amount is non-zero.
 *
 * Amount convention ("natural" amounts):
 *   INCOME   categories: credit - debit   (income is positive)
 *   EXPENSE  categories: debit  - credit  (expense is positive)
 *   BALANCE  categories: debit  - credit  (assets positive, liabilities/equity negative)
 *
 * Statutory references use the Income Tax Act 1947 (Singapore). The income-tax engine owner must verify the `ref`
 * text against IRAS guidance and correct it here if needed - never change a category `id`.
 */

import type { Cents } from "./money.ts";

export type Treatment =
  | "TAXABLE" // income included in statutory income
  | "NON_TAXABLE" // income excluded (capital / unrealised / out of scope)
  | "EXEMPT" // income exempt under a specific provision (conditions apply)
  | "DEDUCTIBLE" // expense deductible
  | "NON_DEDUCTIBLE" // expense added back (capital, private, prohibited)
  | "NOT_APPLICABLE"; // balance-sheet lines: not part of the income tax computation

export type CategoryGroup =
  | "PROPERTY_INCOME"
  | "OTHER_INCOME"
  | "GAINS_AND_FAIR_VALUE"
  | "PROPERTY_EXPENSES"
  | "FUND_AND_ADMIN_EXPENSES"
  | "FINANCE_COSTS"
  | "CAPITAL_AND_NON_CASH"
  | "DEVELOPMENT"
  | "OTHER_EXPENSES"
  | "BALANCE_SHEET";

export type Nature = "INCOME" | "EXPENSE" | "BALANCE";

export interface TaxCategoryDef {
  id: string;
  label: string;
  group: CategoryGroup;
  nature: Nature;
  treatment: Treatment;
  /** Typical source of the income; "ANY" for expenses and neutral items */
  sourcing: "SG" | "FOREIGN" | "ANY";
  /** Engine prompts for confirmation when non-zero */
  needsReview: boolean;
  /** Short statutory/guidance reference shown next to the line */
  ref?: string;
  /** One-sentence guidance shown in the mapping UI */
  guidance: string;
}

export const TAX_CATEGORIES = [
  // ---- Property income
  { id: "REV_RENTAL", label: "Rental income", group: "PROPERTY_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "SG", needsReview: false, ref: "s10(1)(f) ITA", guidance: "Gross rent from letting of Singapore property is taxable (rents and other profits arising from property)." },
  { id: "REV_SERVICE_CHARGE", label: "Service charges & tenant recoveries", group: "PROPERTY_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "SG", needsReview: false, ref: "s10(1)(f) ITA", guidance: "Service charges, utilities and outgoings recovered from tenants are part of property income." },
  { id: "REV_CARPARK_OTHER", label: "Car park, turnover rent & other property income", group: "PROPERTY_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "SG", needsReview: false, ref: "s10(1)(f) ITA", guidance: "Car park, turnover rent, lease termination/forfeited deposits and similar property-related income." },
  { id: "REV_DEV_SALES", label: "Sale of development properties (trading)", group: "PROPERTY_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "SG", needsReview: false, ref: "s10(1)(a) ITA", guidance: "Proceeds from selling properties developed or held as trading stock are trade receipts." },
  { id: "REV_FEES", label: "Fee & commission income (agency, property/asset management)", group: "PROPERTY_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "SG", needsReview: false, ref: "s10(1)(a) ITA", guidance: "Agency commissions, property/asset/project management fees and similar business income." },
  // ---- Other income
  { id: "INC_INTEREST", label: "Interest income", group: "OTHER_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: false, ref: "s10(1)(d) ITA", guidance: "Interest is taxable unless a specific exemption applies (e.g. certain qualifying debt securities)." },
  { id: "INC_DIVIDEND_SG", label: "Dividends from Singapore-resident companies (one-tier)", group: "OTHER_INCOME", nature: "INCOME", treatment: "EXEMPT", sourcing: "SG", needsReview: false, ref: "s13(1)(za) ITA", guidance: "Singapore one-tier dividends are exempt in the hands of the recipient." },
  { id: "INC_FOREIGN", label: "Foreign-sourced income (dividends, branch profits, service income)", group: "OTHER_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "FOREIGN", needsReview: true, ref: "s10(1)(g), s10(25) ITA; foreign-sourced income exemption", guidance: "Taxable when received in Singapore unless the foreign-sourced income exemption conditions are met - confirm each stream." },
  { id: "INC_OTHER_TAXABLE", label: "Other taxable income", group: "OTHER_INCOME", nature: "INCOME", treatment: "TAXABLE", sourcing: "SG", needsReview: false, guidance: "Sundry income of an income nature." },
  { id: "INC_OTHER_NON_TAXABLE", label: "Other non-taxable income", group: "OTHER_INCOME", nature: "INCOME", treatment: "NON_TAXABLE", sourcing: "ANY", needsReview: false, guidance: "Sundry income that is capital in nature or otherwise outside the scope of tax." },
  // ---- Gains and fair-value movements
  { id: "INC_FV_GAIN_PROPERTY", label: "Fair value gains on investment properties", group: "GAINS_AND_FAIR_VALUE", nature: "INCOME", treatment: "NON_TAXABLE", sourcing: "ANY", needsReview: false, guidance: "Unrealised revaluation gains are not taxable (Singapore has no capital gains tax)." },
  { id: "INC_FV_GAIN_OTHER", label: "Fair value gains on derivatives & financial instruments", group: "GAINS_AND_FAIR_VALUE", nature: "INCOME", treatment: "NON_TAXABLE", sourcing: "ANY", needsReview: true, guidance: "Unrealised gains are generally not taxable until realised; hedge-accounting and FRS 109/SFRS(I) 9 transition rules may apply." },
  { id: "INC_GAIN_DISPOSAL", label: "Gains on disposal of investment properties & investments", group: "GAINS_AND_FAIR_VALUE", nature: "INCOME", treatment: "NON_TAXABLE", sourcing: "ANY", needsReview: true, ref: "s10(1)(a)/(g) ITA", guidance: "Capital gains are not taxable, but gains from a trade or an adventure in the nature of trade are. Run the badges-of-trade assessment." },
  { id: "INC_FX_REALISED", label: "Realised foreign exchange gains", group: "GAINS_AND_FAIR_VALUE", nature: "INCOME", treatment: "TAXABLE", sourcing: "ANY", needsReview: true, guidance: "Taxable if on revenue-account items; not taxable if on capital-account items." },
  { id: "INC_FX_UNREALISED", label: "Unrealised foreign exchange gains", group: "GAINS_AND_FAIR_VALUE", nature: "INCOME", treatment: "NON_TAXABLE", sourcing: "ANY", needsReview: true, guidance: "Treatment follows the underlying item (revenue vs capital) and the entity's FX tax policy." },
  // ---- Property expenses
  { id: "EXP_PROPERTY_TAX", label: "Property tax", group: "PROPERTY_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s14(1) ITA", guidance: "Property tax on income-producing property is deductible." },
  { id: "EXP_REPAIRS_MAINT", label: "Repairs & maintenance", group: "PROPERTY_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, ref: "s14(1)(c)/s15 ITA", guidance: "Revenue repairs are deductible; improvements/upgrades are capital and not deductible." },
  { id: "EXP_UTILITIES", label: "Utilities & outgoings", group: "PROPERTY_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s14(1) ITA", guidance: "Utilities and operating outgoings on let property." },
  { id: "EXP_INSURANCE", label: "Property insurance", group: "PROPERTY_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s14(1) ITA", guidance: "Fire and other property insurance premiums." },
  { id: "EXP_LEASING_COMMISSION", label: "Leasing commissions", group: "PROPERTY_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s14(1) ITA", guidance: "Agent commissions for letting (not acquisition/disposal commissions)." },
  { id: "EXP_PROPERTY_MGMT", label: "Property management fees", group: "PROPERTY_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s14(1) ITA", guidance: "Property manager and facilities management fees." },
  { id: "EXP_RENOVATION", label: "Renovation & refurbishment (s14N / legacy s14Q)", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: true, ref: "s14N ITA", guidance: "Qualifying renovation/refurbishment costs are claimed via the section 14N schedule, not as an accounting expense. Legacy materials may still refer to section 14Q." },
  // ---- Fund & administration expenses
  { id: "EXP_MANAGER_FEE", label: "Manager fees (base, performance, acquisition/divestment)", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, ref: "s14(1) ITA", guidance: "Recurring management fees are deductible when incurred in producing income; acquisition/divestment fees are capital." },
  { id: "EXP_TRUSTEE_FEE", label: "Trustee fees", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s14(1) ITA", guidance: "Trustee and custodian fees." },
  { id: "EXP_PROFESSIONAL", label: "Professional fees (audit, tax, legal - revenue)", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, ref: "s14(1) ITA", guidance: "Revenue-nature fees are deductible; fees on acquisitions, disposals and capital raising are capital." },
  { id: "EXP_STAFF", label: "Staff costs", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s14(1) ITA", guidance: "Salaries, CPF and related staff costs." },
  { id: "EXP_ADMIN", label: "General & administrative expenses", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s14(1) ITA", guidance: "Other expenses incurred wholly and exclusively in producing income." },
  { id: "EXP_ENTERTAINMENT", label: "Entertainment & gifts", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, ref: "s14(1), s15 ITA", guidance: "Deductible only when wholly and exclusively for income production; private or non-business entertainment is not." },
  { id: "EXP_DONATIONS", label: "Donations", group: "FUND_AND_ADMIN_EXPENSES", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: true, ref: "s37 ITA", guidance: "Added back; qualifying donations to approved IPCs get a separate further deduction (enter in manual adjustments)." },
  // ---- Finance costs
  { id: "EXP_INTEREST", label: "Interest on borrowings", group: "FINANCE_COSTS", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s14(1)(a) ITA", guidance: "Deductible when borrowings fund income-producing assets; interest on borrowings funding non-income-producing assets is restricted." },
  { id: "EXP_FINANCE_OTHER", label: "Loan arrangement fees & other finance costs", group: "FINANCE_COSTS", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, ref: "s14(1)(a)/s14I ITA", guidance: "Loan-related costs are deductible subject to timing and the debt's purpose." },
  // ---- Capital and non-cash
  { id: "EXP_DEPRECIATION", label: "Depreciation & amortisation", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s15(1)(c) ITA", guidance: "Added back; replaced by capital allowances (s19/s19A/s19B, industrial building allowance)." },
  { id: "EXP_ACQUISITION_COSTS", label: "Acquisition & disposal costs (capital)", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s15(1)(c) ITA", guidance: "Legal, valuation, due diligence and agency costs of buying or selling capital assets." },
  { id: "EXP_STAMP_DUTY", label: "Stamp duties (BSD / ABSD / SSD)", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s15(1)(c) ITA", guidance: "Stamp duty on acquisitions is capital. Trading-stock stamp duty is a cost of sales - map to development cost of sales instead." },
  { id: "EXP_FV_LOSS_PROPERTY", label: "Fair value losses on investment properties", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s15 ITA", guidance: "Unrealised revaluation losses are not deductible." },
  { id: "EXP_FV_LOSS_OTHER", label: "Fair value losses on derivatives & financial instruments", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Unrealised losses are generally not deductible until realised; hedge-accounting rules may apply." },
  { id: "EXP_LOSS_DISPOSAL", label: "Losses on disposal of investment properties & investments", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: true, ref: "s10(1)(a)/s15 ITA", guidance: "Capital losses are not deductible; losses on trading stock are." },
  { id: "EXP_IMPAIRMENT", label: "Impairment & general provisions", group: "CAPITAL_AND_NON_CASH", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s15(1) ITA", guidance: "General provisions and impairment are not deductible; specific bad debts written off are (see Bad debts)." },
  { id: "EXP_BAD_DEBTS", label: "Bad debts written off (specific)", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s14(1)(b) ITA", guidance: "Specific bad debts that are established and written off are deductible." },
  { id: "EXP_FX_REALISED", label: "Realised foreign exchange losses", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Deductible if on revenue-account items; not deductible if on capital-account items." },
  { id: "EXP_FX_UNREALISED", label: "Unrealised foreign exchange losses", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: true, guidance: "Treatment follows the underlying item (revenue vs capital) and the entity's FX tax policy." },
  // ---- Development (trading stock)
  { id: "EXP_DEV_COST_OF_SALES", label: "Cost of development properties sold", group: "DEVELOPMENT", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s10(1)(a)/s14 ITA", guidance: "Land, construction, financing and holding costs of units recognised as sold." },
  { id: "EXP_DEV_SELLING", label: "Marketing & selling costs (development)", group: "DEVELOPMENT", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s14(1) ITA", guidance: "Show-flat, marketing and agency costs of selling development units." },
  // ---- Other expenses
  { id: "EXP_PENALTIES", label: "Fines, penalties & late-payment charges", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s15 ITA", guidance: "Penalties for breaking the law are not deductible." },
  { id: "EXP_INCOME_TAX", label: "Income tax expense (current & deferred)", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s15(1)(d) ITA", guidance: "Income tax is not deductible; remove from the accounting profit." },
  { id: "EXP_DISTRIBUTIONS_OWNERS", label: "Distributions / dividends to owners", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: false, guidance: "Distributions to unitholders or shareholders are appropriations of profit and not deductible business expenses." },
  { id: "EXP_OTHER_DEDUCTIBLE", label: "Other deductible expenses", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s14(1) ITA", guidance: "Sundry expenses incurred wholly and exclusively in producing income." },
  { id: "EXP_OTHER_NON_DEDUCTIBLE", label: "Other non-deductible expenses", group: "OTHER_EXPENSES", nature: "EXPENSE", treatment: "NON_DEDUCTIBLE", sourcing: "ANY", needsReview: false, ref: "s15 ITA", guidance: "Private, capital or otherwise prohibited expenses." },
  // ---- Balance sheet
  { id: "BS_INVESTMENT_PROPERTY", label: "Investment properties", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Balance-sheet line used for reasonableness checks and capital-allowance/IBA context." },
  { id: "BS_PROPERTY_PLANT_EQUIPMENT", label: "Property, plant & equipment", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Fixed assets - reconcile to the capital-allowance register." },
  { id: "BS_DEVELOPMENT_PROPERTIES", label: "Development properties (inventory)", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Properties held for sale." },
  { id: "BS_CASH", label: "Cash & cash equivalents", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Bank and cash balances." },
  { id: "BS_RECEIVABLES", label: "Trade & other receivables", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Rental and other receivables." },
  { id: "BS_PAYABLES", label: "Trade & other payables", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Payables and accruals." },
  { id: "BS_BORROWINGS", label: "Borrowings", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Bank loans and notes payable." },
  { id: "BS_DEFERRED_TAX", label: "Deferred tax", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Deferred tax assets/liabilities." },
  { id: "BS_EQUITY", label: "Unitholders' funds / equity", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Units/share capital, reserves and retained earnings." },
  { id: "BS_OTHER", label: "Other balance-sheet items", group: "BALANCE_SHEET", nature: "BALANCE", treatment: "NOT_APPLICABLE", sourcing: "ANY", needsReview: false, guidance: "Everything else on the balance sheet." },
] as const satisfies readonly TaxCategoryDef[];

export type TaxCategoryId = (typeof TAX_CATEGORIES)[number]["id"];

const BY_ID: ReadonlyMap<string, TaxCategoryDef> = new Map(TAX_CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): TaxCategoryDef | undefined {
  return BY_ID.get(id);
}

export function requireCategory(id: string): TaxCategoryDef {
  const c = BY_ID.get(id);
  if (!c) throw new RangeError(`Unknown tax category "${id}"`);
  return c;
}

export function isTaxCategoryId(id: string): id is TaxCategoryId {
  return BY_ID.has(id);
}

export const INCOME_CATEGORY_IDS: readonly TaxCategoryId[] = TAX_CATEGORIES.filter((c) => c.nature === "INCOME").map((c) => c.id);
export const EXPENSE_CATEGORY_IDS: readonly TaxCategoryId[] = TAX_CATEGORIES.filter((c) => c.nature === "EXPENSE").map((c) => c.id);
export const BALANCE_CATEGORY_IDS: readonly TaxCategoryId[] = TAX_CATEGORIES.filter((c) => c.nature === "BALANCE").map((c) => c.id);

/** A trial-balance line after mapping. */
export interface MappedTbLine {
  accountCode: string;
  accountName: string;
  debit: Cents;
  credit: Cents;
  category: TaxCategoryId;
  /** Property / cost-centre dimension from the ledger (optional) */
  propertyCode?: string;
  /** mapping was manually overridden away from the central rule (flagged in the UI) */
  overridden?: boolean;
}

/** Natural amount of a TB line for its category (see module header). */
export function naturalAmount(line: Pick<MappedTbLine, "debit" | "credit" | "category">): Cents {
  const cat = requireCategory(line.category);
  return cat.nature === "INCOME" ? line.credit - line.debit : line.debit - line.credit;
}

/** Sum natural amounts by category. */
export function totalsByCategory(lines: readonly MappedTbLine[]): Partial<Record<TaxCategoryId, Cents>> {
  const out: Partial<Record<TaxCategoryId, Cents>> = {};
  for (const l of lines) {
    out[l.category] = (out[l.category] ?? 0) + naturalAmount(l);
  }
  return out;
}
