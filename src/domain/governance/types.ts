// OWNER: Governance agent (F8: versions, manual adjustments, prior-year view). Record, action and view-model types for this feature.
// The shapes below are PLACEHOLDERS written by the lead to wire the contract: redesign them freely, but keep schema.ts (exact-shape
// validation of saved state), seed.ts and reducer.ts consistent with whatever you choose. AppData imports the record types from here.
import type { Cents, FundId, LocalDateTime } from "../types.ts";

export type CalcVersionTrigger = "manual" | "submit" | "sign-off" | "reopen";

export interface CalcSnapshotLine {
  ref: string;
  label: string;
  amount: Cents;
}

export interface CalcSnapshotInput {
  ref: string;
  label: string;
  value: string | number | null;
}

export interface CalcVersion {
  id: string;
  fundId: FundId;
  label: string;
  at: LocalDateTime;
  by: string;
  trigger: CalcVersionTrigger;
  reason: string | null;
  inputHash: string;
  snapshot: CalcSnapshotLine[];
  inputs: CalcSnapshotInput[];
}

export type ManualAdjustmentComponent =
  | "ausOtherIncome"
  | "ncmi"
  | "excludedNcmi"
  | "cleanBuilding"
  | "interest"
  | "discountGainTarp"
  | "otherGainTarp"
  | "foreignIncome"
  | "taxableSpecifiedIncome";

export interface ManualAdjustment {
  id: string;
  fundId: FundId;
  label: string;
  amount: Cents;
  component: ManualAdjustmentComponent;
  reason: string;
  by: string;
  at: LocalDateTime;
}

export interface VersionDiffLine {
  ref: string;
  label: string;
  then: Cents | null;
  now: Cents | null;
  change: Cents;
}

export interface VersionInputDiff {
  ref: string;
  label: string;
  then: string | number | null;
  now: string | number | null;
}

export interface VersionDiff {
  lines: VersionDiffLine[];
  inputs: VersionInputDiff[];
  hashEqual: boolean;
  stale: boolean;
}

export type GovernanceAction =
  | { type: "gov-save-version"; fundId: FundId; label: string }
  | { type: "gov-add-adjustment"; fundId: FundId; label: string; amount: Cents; component: ManualAdjustmentComponent; reason: string }
  | { type: "gov-remove-adjustment"; fundId: FundId; id: string };
