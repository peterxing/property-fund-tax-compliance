import type { ComponentType } from "react";
import { WORKSPACE_ICON } from "../labels.ts";
import { ROUTES, type RouteDef, type WorkspaceId } from "../router.ts";
import type { IconName } from "../ui/icons.tsx";
import Access from "./Access.tsx";
import Analytics from "./Analytics.tsx";
import BulkReview from "./BulkReview.tsx";
import CostBase from "./CostBase.tsx";
import Distributions from "./Distributions.tsx";
import InvestorReporting from "./InvestorReporting.tsx";
import TaxReturns from "./TaxReturns.tsx";
import TrialBalance from "./TrialBalance.tsx";

export interface Workspace extends RouteDef {
  icon: IconName;
  component: ComponentType;
}

const COMPONENTS: Record<WorkspaceId, ComponentType> = {
  distributions: Distributions,
  "trial-balance": TrialBalance,
  "tax-returns": TaxReturns,
  "investor-reporting": InvestorReporting,
  "cost-base": CostBase,
  "bulk-review": BulkReview,
  analytics: Analytics,
  access: Access,
};

/** Every workspace in navigation order: the route, its icon and the component App renders for it. A workspace author replaces the file, not this list. */
export const WORKSPACES: readonly Workspace[] = ROUTES.map((def) => ({ ...def, icon: WORKSPACE_ICON[def.id], component: COMPONENTS[def.id] }));

export function workspaceFor(path: string): Workspace {
  return WORKSPACES.find((w) => w.path === path) ?? WORKSPACES[0]!;
}
