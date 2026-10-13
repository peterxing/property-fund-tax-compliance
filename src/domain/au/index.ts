// AU market module (AMIT / MIT): distribution calculation, trial balance, tax return, investor reporting, cost base and analytics.
import type { MarketModule } from "../market.ts";
import { leakage, mix, scenario } from "./analytics.ts";
import { fundCalc } from "./calc.ts";
import { costBaseView } from "./costBase.ts";
import { deadlines } from "./deadlines.ts";
import { investorView } from "./investor.ts";
import { returnView } from "./returns.ts";
import { rules } from "./rules.ts";
import { statementDoc } from "./statements.ts";
import { tbView } from "./tb.ts";

export const auModule: MarketModule = {
  market: "AU",
  fundCalc,
  tbView,
  returnView,
  investorView,
  costBaseView,
  statementDoc,
  rules,
  deadlines,
  leakage,
  mix,
  scenario,
};