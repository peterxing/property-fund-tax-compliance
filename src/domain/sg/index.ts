// SG market module (S-REIT): s45G withholding on unitholders, Form UT, the distribution tax notice and the 90% transparency test.
// Rates, thresholds and due dates are read from the shared engine (src/engine/reitTax.ts); see docs/parity/sg.md for where this
// module departs from the managed reference app.
import type { MarketModule } from "../market.ts";
import { sgLeakage, sgMix, sgScenario } from "./analytics.ts";
import { sgFundCalc } from "./components.ts";
import { sgCostBaseView } from "./costBase.ts";
import { sgDeadlines } from "./deadlines.ts";
import { sgInvestorView } from "./investor.ts";
import { sgReturnView } from "./returns.ts";
import { sgRules } from "./rules.ts";
import { sgStatementDoc } from "./statements.ts";
import { sgTbView } from "./tb.ts";

export const sgModule: MarketModule = {
  market: "SG",
  fundCalc: sgFundCalc,
  tbView: sgTbView,
  returnView: sgReturnView,
  investorView: sgInvestorView,
  costBaseView: sgCostBaseView,
  statementDoc: sgStatementDoc,
  rules: sgRules,
  deadlines: sgDeadlines,
  leakage: sgLeakage,
  mix: sgMix,
  scenario: sgScenario,
};
