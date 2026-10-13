import type { AppData, Fund, JurisdictionFilter, User } from "../types.ts";
import { userHasFund } from "../permissions.ts";

/** Funds `user` may open under the jurisdiction filter, in the order the data lists them. */
export function visibleFundsOf(data: AppData, user: User, jurisdiction: JurisdictionFilter): Fund[] {
  return data.funds.filter((fund) => userHasFund(user, fund.id) && (jurisdiction === "all" || fund.market === jurisdiction));
}
