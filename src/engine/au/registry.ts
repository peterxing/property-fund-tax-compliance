import type { RuleDomain, RuleEntry } from "../rules.ts";
import { RULES as AMIT_RULES } from "./amit.ts";
import { RULES as BORROWING_COST_RULES } from "./borrowingCosts.ts";
import { RULES as CALENDAR_RULES } from "./calendar.ts";
import { RULES as CAPITAL_WORKS_RULES } from "./capitalWorks.ts";
import { RULES as CGT_RULES } from "./cgt.ts";
import { RULES as AU_DATE_RULES } from "./dates.ts";
import { RULES as COMPANY_TAX_RULES } from "./companyTax.ts";
import { RULES as DEPRECIATION_RULES } from "./depreciation.ts";
import { RULES as GST_RULES } from "./gst.ts";
import { RULES as GST_CODE_RULES } from "./gstCodes.ts";
import { RULES as DISTRIBUTION_RULES } from "./distribution.ts";
import { RULES as IDENTIFIER_RULES } from "./identifiers.ts";
import { RULES as MEMBER_RULES } from "./members.ts";
import { RULES as LAND_TAX_RULES } from "./landTax.ts";
import { RULES_REGISTER as MAPPING_RULES } from "./mappingSuggestions.ts";
import { RULES as MIT_WITHHOLDING_RULES } from "./mitWithholding.ts";
import { RULES as RETURN_RULES } from "./returns.ts";
import { RULES as TRUST_TAX_RULES } from "./trustTax.ts";
import { RULES as TRANSFER_DUTY_RULES } from "./transferDuty.ts";

export const AU_RULE_DOMAIN_LABEL: Record<RuleDomain, string> = {
  STAMP_DUTY: "Stamp duty",
  PROPERTY_TAX: "Property tax",
  CORPORATE_TAX: "Corporate tax",
  CAPITAL_ALLOWANCES: "Capital allowances",
  GST: "GST",
  REIT_TAX: "REIT taxation",
  WITHHOLDING_TAX: "Withholding tax",
  FILING: "Filing",
  IDENTIFIERS: "Identifiers",
  OTHER: "Other",
  AU_INCOME_TAX: "AU income tax",
  AU_TRUST_TAX: "AU trust taxation",
  AU_MIT: "AU MIT / AMIT",
  AU_CAPITAL_ALLOWANCES: "AU capital allowances",
  AU_CGT: "AU CGT",
  AU_GST: "AU GST",
  AU_TRANSFER_DUTY: "AU transfer duty",
  AU_LAND_TAX: "AU land tax",
  AU_FILING: "AU filing",
  AU_IDENTIFIERS: "AU identifiers",
};

export const AU_ALL_RULES: readonly RuleEntry[] = [
  ...AU_DATE_RULES,
  ...IDENTIFIER_RULES,
  ...GST_CODE_RULES,
  ...GST_RULES,
  ...CALENDAR_RULES,
  ...RETURN_RULES,
  ...CAPITAL_WORKS_RULES,
  ...DEPRECIATION_RULES,
  ...BORROWING_COST_RULES,
  ...CGT_RULES,
  ...COMPANY_TAX_RULES,
  ...TRUST_TAX_RULES,
  ...MEMBER_RULES,
  ...MIT_WITHHOLDING_RULES,
  ...AMIT_RULES,
  ...DISTRIBUTION_RULES,
  ...LAND_TAX_RULES,
  ...TRANSFER_DUTY_RULES,
  ...MAPPING_RULES,
].slice().sort((a, b) => (a.domain === b.domain ? a.title.localeCompare(b.title) : a.domain.localeCompare(b.domain)));
