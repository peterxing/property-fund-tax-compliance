// OWNER: Assets & allowances agent (F3). Record, action and view-model types for this feature.
import type { AuCapitalWorksBuildingType } from "../../engine/au/capitalWorks.ts";
import type { AuDepreciationMethod } from "../../engine/au/depreciation.ts";
import type { CapitalAllowanceRegime } from "../../engine/capitalAllowances.ts";
import type { Cents, CsvModel, DocModel, FundId, ISODate, Market } from "../types.ts";

export type AssetKind = "AU_DIV40" | "AU_DIV43" | "SG_PLANT" | "AU_BORROWING";

export interface FixedAssetBase {
  id: string;
  fundId: FundId;
  propertyId: string | null;
  description: string;
  cost: Cents;
  startDate: ISODate;
  disposalDate?: ISODate;
  disposalProceeds?: Cents;
  notes?: string;
}

export interface AuDiv40Asset extends FixedAssetBase {
  kind: "AU_DIV40";
  assetClassId: string;
  method: AuDepreciationMethod;
  effectiveLifeYears?: number;
  taxableUseBps?: number;
}

export interface AuDiv43Asset extends FixedAssetBase {
  kind: "AU_DIV43";
  buildingType: AuCapitalWorksBuildingType;
  constructionStartDate: ISODate;
  constructionCompleteDate: ISODate;
  firstIncomeUseDate: ISODate;
  constructionExpenditure: Cents;
  priorDivision43Claims?: Cents;
  taxableUseBps?: number;
}

export interface SgPlantAsset extends FixedAssetBase {
  kind: "SG_PLANT";
  assetClassId: string;
  regime: CapitalAllowanceRegime;
  claimStartYa?: number;
  prescribedWorkingLifeYears?: number;
  electedWorkingLifeYears?: 6 | 12 | 16;
  claimInitialAllowance?: boolean;
}

export interface AuBorrowingCostAsset extends FixedAssetBase {
  kind: "AU_BORROWING";
  loanEndDate: ISODate;
  taxableUseBps?: number;
}

export type FixedAsset = AuDiv40Asset | AuDiv43Asset | SgPlantAsset | AuBorrowingCostAsset;
export type FixedAssetDraft = FixedAsset extends infer T ? (T extends FixedAsset ? Omit<T, "id" | "fundId"> : never) : never;

export type AssetAction =
  | { type: "asset-add"; fundId: FundId; asset: FixedAssetDraft }
  | { type: "asset-update"; fundId: FundId; assetId: string; asset: FixedAssetDraft }
  | { type: "asset-dispose"; fundId: FundId; assetId: string; disposalDate: ISODate; disposalProceeds: Cents }
  | { type: "asset-delete"; fundId: FundId; assetId: string }
  | { type: "asset-import"; fundId: FundId; assets: FixedAssetDraft[] }
  | { type: "asset-apply-to-trial-balance"; fundId: FundId };

export interface AssetRegisterRow {
  id: string;
  fundId: FundId;
  propertyId: string | null;
  propertyName: string;
  kind: AssetKind;
  kindLabel: string;
  description: string;
  cost: Cents;
  startDate: ISODate;
  basis: string;
  openingWrittenDownValue: Cents;
  deduction: Cents;
  closingWrittenDownValue: Cents;
  disposalDate: ISODate | null;
  disposalProceeds: Cents | null;
  note: string | null;
}

export interface AssetKindTotal {
  kind: AssetKind;
  label: string;
  deduction: Cents;
  closingWrittenDownValue: Cents;
  count: number;
}

export interface RegisterTrialBalanceComparison {
  key: "div40" | "div43" | "capitalAllowances";
  label: string;
  register: Cents;
  trialBalance: Cents;
  difference: Cents;
  agrees: boolean;
}

export interface AssetScheduleLine {
  year: string;
  kind: AssetKind;
  label: string;
  deduction: Cents;
}

export interface AssetRegisterView {
  fundId: FundId;
  market: Market;
  rows: AssetRegisterRow[];
  totals: AssetKindTotal[];
  comparisons: RegisterTrialBalanceComparison[];
  schedule: AssetScheduleLine[];
  csv: CsvModel;
  scheduleDoc: DocModel;
  warnings: string[];
}
