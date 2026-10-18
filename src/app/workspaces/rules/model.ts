import type { RuleConfidence, RuleRegisterRow } from "../../../domain/portfolio/index.ts";

export const CONFIDENCE_LABEL: Record<RuleConfidence, string> = {
  VERIFIED: "Verified",
  VERIFIED_SECONDARY: "Verified secondary",
  ASSUMPTION: "Assumption",
};

export const CONFIDENCE_TONE: Record<RuleConfidence, "good" | "info" | "warn"> = {
  VERIFIED: "good",
  VERIFIED_SECONDARY: "info",
  ASSUMPTION: "warn",
};

export function effectiveLabel(row: RuleRegisterRow): string {
  const from = row.effectiveFrom || "start not stated";
  const to = row.effectiveTo || "current";
  return `${from} to ${to}`;
}

export function ruleParam(row: RuleRegisterRow): string {
  return row.registryKey;
}
