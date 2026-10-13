// Fictional demonstration data mirrored from the reference app for comparability (money in integer cents, units as whole units).
import type { Market, TbCategoryDef } from "../types.ts";

/** Mapping categories per market, in the order the category select lists them (the reserved `unmapped` id is not part of the list). */
export const TB_CATEGORIES: Record<Market, TbCategoryDef[]> = {
  AU: [
    { id: "rent", label: "Rental and property income", treatment: "Assessable — Australian income, other" },
    { id: "ncmi-rent", label: "Cross-staple rent (NCMI)", treatment: "Assessable — non-concessional MIT income" },
    { id: "ncmi-transitional", label: "Cross-staple rent (transitional)", treatment: "Assessable — excluded from NCMI" },
    { id: "clean-building", label: "Clean building rental income", treatment: "Assessable — clean building MIT income" },
    { id: "interest-income", label: "Interest income", treatment: "Assessable — interest" },
    { id: "foreign-income", label: "Foreign income", treatment: "Assessable — foreign income" },
    { id: "deductible-expense", label: "Deductible expense", treatment: "Deductible" },
    { id: "depreciation-book", label: "Accounting depreciation", treatment: "Added back — replaced by Div 40 and Div 43" },
    { id: "fair-value", label: "Fair value movement", treatment: "Not assessable or deductible" },
    { id: "straight-line", label: "Straight-line rent adjustment", treatment: "Accounting only — excluded" },
    { id: "book-gain-sale", label: "Accounting gain on disposal", treatment: "Replaced by the tax capital gain" },
    { id: "non-deductible", label: "Non-deductible expense", treatment: "Added back" },
    { id: "distributions", label: "Distributions to unitholders", treatment: "Cash distribution for the year" },
    { id: "balance-sheet", label: "Balance sheet", treatment: "Not part of taxable income" },
  ],
  SG: [
    { id: "rent", label: "Rental and property income", treatment: "Specified income — taxable" },
    { id: "interest-income", label: "Interest income", treatment: "Ancillary specified income — taxable" },
    { id: "exempt-income", label: "Tax-exempt income", treatment: "Not taxable — available for tax-exempt distributions" },
    { id: "deductible-expense", label: "Deductible expense", treatment: "Deductible" },
    { id: "depreciation-book", label: "Accounting depreciation", treatment: "Added back — replaced by capital allowances" },
    { id: "fair-value", label: "Fair value movement", treatment: "Not taxable or deductible" },
    { id: "straight-line", label: "Straight-line rent adjustment", treatment: "Accounting only — excluded" },
    { id: "book-gain-sale", label: "Accounting gain on disposal", treatment: "Capital — not taxable" },
    { id: "non-deductible", label: "Non-deductible expense", treatment: "Added back" },
    { id: "distributions", label: "Distributions to unitholders", treatment: "Distribution for the period" },
    { id: "balance-sheet", label: "Balance sheet", treatment: "Not part of taxable income" },
  ],
};
