/**
 * Aggregated register of every rule the engine implements, with its legal/guidance source and verification status.
 * This feeds the "Rules & sources" page and docs/rules/*.md. Add each engine module's RULES here.
 */
import type { RuleEntry } from "./rules.ts";
import { RULES as stampDuty } from "./stampDuty.ts";
import { RULES as propertyTax } from "./propertyTax.ts";
import { RULES as withholdingTax } from "./withholdingTax.ts";
import { RULES as badgesOfTrade } from "./badgesOfTrade.ts";
import { RULES as identifiers } from "./identifiers.ts";
import { RULES as cit } from "./cit.ts";
import { RULES as capitalAllowances } from "./capitalAllowances.ts";
import { RULES as taxComputation } from "./taxComputation.ts";
import { RULES as allocation } from "./allocation.ts";
import { RULES as returns } from "./returns.ts";
import { RULES_REGISTER as mapping } from "./mappingSuggestions.ts";
import { RULES as gstCodes } from "./gstCodes.ts";
import { RULES as gst } from "./gst.ts";
import { RULES as iaf } from "./iaf.ts";
import { RULES as reitTax } from "./reitTax.ts";
import { RULES as distribution } from "./distribution.ts";

const asRules = (rules: readonly unknown[]): RuleEntry[] => rules as RuleEntry[];

export const ALL_RULES: readonly RuleEntry[] = [
  ...asRules(stampDuty),
  ...asRules(propertyTax),
  ...asRules(withholdingTax),
  ...asRules(badgesOfTrade),
  ...asRules(identifiers),
  ...asRules(cit),
  ...asRules(capitalAllowances),
  ...asRules(taxComputation),
  ...asRules(allocation),
  ...asRules(returns),
  ...asRules(gstCodes),
  ...asRules(gst),
  ...asRules(iaf),
  ...asRules(reitTax),
  ...asRules(distribution),
  ...asRules(mapping),
];

export const RULE_DOMAIN_LABEL: Record<string, string> = {
  STAMP_DUTY: "Stamp duty (BSD / ABSD / SSD / lease)",
  PROPERTY_TAX: "Property tax",
  CORPORATE_TAX: "Corporate income tax",
  CAPITAL_ALLOWANCES: "Capital allowances",
  GST: "GST",
  REIT_TAX: "REIT & fund distributions",
  WITHHOLDING_TAX: "Withholding tax",
  FILING: "Filing & compliance calendar",
  IDENTIFIERS: "Identifiers & data",
  OTHER: "Other",
};
