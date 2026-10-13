// Reference-app labels for the editable distribution inputs (used in audit text and validation messages).
import type { Market, TbCategoryDef, TbCategoryId } from "../types.ts";
import { UNMAPPED_CATEGORY } from "../types.ts";

const INPUT_LABEL: Record<string, string> = {
  cashDistribution: "Cash distribution",
  ausOtherIncome: "Australian income — other",
  ncmi: "Non-concessional MIT income",
  excludedNcmi: "Excluded from NCMI — transitional",
  cleanBuilding: "Clean building MIT income",
  interest: "Australian interest",
  discountGainTarp: "Discounted capital gains — TARP",
  otherGainTarp: "Other capital gains — TARP",
  foreignIncome: "Assessable foreign income",
  taxableSpecifiedIncome: "Taxable specified income",
  taxableDistributed: "Taxable income distribution",
  taxExemptDistribution: "Tax-exempt income distribution",
  capitalDistribution: "Capital distribution",
};

export function inputLabel(key: string): string {
  return INPUT_LABEL[key] ?? key;
}

// Same wording the market modules show for an account that has no tax category yet.
export const UNMAPPED_CATEGORY_LABEL = "Needs a tax category";

export function categoryLabel(categories: Record<Market, TbCategoryDef[]>, market: Market, id: TbCategoryId): string {
  if (id === UNMAPPED_CATEGORY) return UNMAPPED_CATEGORY_LABEL;
  return categories[market].find((c) => c.id === id)?.label ?? id;
}
