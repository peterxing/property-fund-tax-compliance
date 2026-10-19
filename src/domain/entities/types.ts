// OWNER: Funds & data agent (F7: fund, holder and property management; backup, restore and imports).
import type { AuExpenseAllocation, AuHolderStatus, Cents, FundId, GovernanceMode, ISODate, Market, ObligationCategory, ObligationRecurrence, SgFundSection, SgHolderClass } from "../types.ts";

export interface EntityFundDraft {
  market: Market;
  name: string;
  sector: string;
  listed: boolean;
  periodStart: ISODate;
  periodEnd: ISODate;
  unitsOnIssue: number;
  governance: GovernanceMode;
  assessmentYear?: number;
}

export interface EntityFundUpdate {
  name?: string;
  sector?: string;
  listed?: boolean;
  periodStart?: ISODate;
  periodEnd?: ISODate;
  unitsOnIssue?: number;
  governance?: GovernanceMode;
  assessmentYear?: number;
}

export interface EntityHolderDraft {
  holder: string;
  country: string;
  units: number;
  auStatus?: AuHolderStatus;
  sgClass?: SgHolderClass;
  /** Only with sgClass "nr-fund" (see SgHolder.sgFundSection). */
  sgFundSection?: SgFundSection;
}

export interface EntityPropertyDraft {
  name: string;
  location: string;
  acquired: ISODate;
  cost: Cents;
  improvements: Cents;
  capitalWorksClaimed?: Cents;
  valuation: Cents;
}

export interface EntityObligationDraft {
  fundId: FundId;
  title: string;
  category: ObligationCategory;
  firstDue: ISODate;
  recurrence: ObligationRecurrence;
  notes: string;
}

export type EntityAction =
  | { type: "entity-create-fund"; fund: EntityFundDraft }
  | { type: "entity-update-fund"; fundId: FundId; patch: EntityFundUpdate }
  | { type: "entity-delete-fund"; fundId: FundId; confirmName: string }
  | { type: "entity-add-holder"; fundId: FundId; holder: EntityHolderDraft }
  | { type: "entity-update-holder"; fundId: FundId; holderId: string; patch: Partial<EntityHolderDraft> }
  | { type: "entity-remove-holder"; fundId: FundId; holderId: string }
  | { type: "entity-import-holders"; fundId: FundId; rows: EntityHolderDraft[]; mode: "append" | "replace" }
  | { type: "entity-add-property"; fundId: FundId; property: EntityPropertyDraft }
  | { type: "entity-update-property"; fundId: FundId; propertyId: string; patch: Partial<EntityPropertyDraft> }
  | { type: "entity-remove-property"; fundId: FundId; propertyId: string }
  | { type: "entity-import-properties"; fundId: FundId; rows: EntityPropertyDraft[]; mode: "append" | "replace" }
  // Bulk fund import (Data page; implemented in entities/fundsImport.ts).
  | { type: "entity-import-funds"; rows: EntityFundDraft[] }
  // AU expense allocation policy (implemented in entities/expenseAllocation.ts).
  | { type: "entity-set-expense-allocation"; fundId: FundId; allocation: AuExpenseAllocation }
  // Custom compliance obligations (implemented in entities/obligations.ts).
  | { type: "entity-add-obligation"; obligation: EntityObligationDraft }
  | { type: "entity-update-obligation"; id: string; patch: Partial<Omit<EntityObligationDraft, "fundId">> }
  | { type: "entity-delete-obligation"; id: string }
  | { type: "entity-set-obligation-done"; id: string; dueDate: ISODate; done: boolean };
