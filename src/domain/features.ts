// Routes feature actions (prefixed action types such as "gst-...", "ptax-...") to the feature that owns them. Core workflow actions
// stay in actions.ts; anything else lands here from its `default:` branch.
import type { Action, ActionResult, AppData, Ctx } from "./types.ts";
import { applyAssetAction, isAssetAction } from "./assets/reducer.ts";
import { applyEntityAction, isEntityAction } from "./entities/reducer.ts";
import { applyGovernanceAction, isGovernanceAction } from "./governance/reducer.ts";
import { applyGstAction, isGstAction } from "./gst/reducer.ts";
import { applyPtaxAction, isPtaxAction } from "./ptax/reducer.ts";

/** The result of a feature action, or null when no feature claims the action type. */
export function applyFeatureAction(data: AppData, action: Action, ctx: Ctx): ActionResult | null {
  if (isGstAction(action)) return applyGstAction(data, action, ctx);
  if (isPtaxAction(action)) return applyPtaxAction(data, action, ctx);
  if (isAssetAction(action)) return applyAssetAction(data, action, ctx);
  if (isGovernanceAction(action)) return applyGovernanceAction(data, action, ctx);
  if (isEntityAction(action)) return applyEntityAction(data, action, ctx);
  return null;
}
