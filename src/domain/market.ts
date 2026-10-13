// =====================================================================================================================
// CONTRACT: the market module interface. AU (src/domain/au/index.ts) and SG (src/domain/sg/index.ts) each export one
// `MarketModule` implementation; selectors.ts dispatches to the right one by fund.market. Implementations are PURE:
// they read AppData and return view models; they never mutate state and never touch the DOM.
//
// Rule-bearing numbers (rates, thresholds, due dates) must come from the shared engine in src/engine (which carries source
// citations and effective dates), not from literals in this layer. Where the managed reference app and the engine disagree,
// do NOT silently copy the reference: record it in docs/REFERENCE-PARITY.md with the evidence and the choice made.
// =====================================================================================================================
import type {
  AppData,
  CostBaseView,
  Cents,
  Ctx,
  DeadlineRow,
  DeferredTaxInvestor,
  DocModel,
  Fund,
  FundCalc,
  InvestorView,
  LeakageRow,
  Market,
  MixRow,
  ReturnView,
  RulesTable,
  ScenarioView,
  TbView,
} from "./types.ts";

export interface MarketModule {
  readonly market: Market;

  /** Distribution calculation, per-holder withholding, checks, reconciliation, narrative and Sankey model. */
  fundCalc(data: AppData, fund: Fund, now: Date): FundCalc;

  /** Trial balance workspace: balance/mapping/agreement flags, book-to-tax, adjustments, component comparison, rows. */
  tbView(data: AppData, fund: Fund, now: Date): TbView;

  /** Tax returns workspace: readiness checklist, lodgment record and working-papers document. */
  returnView(data: AppData, fund: Fund, calc: FundCalc, ctx: Ctx): ReturnView;

  /** Investor reporting workspace (AU: fund payment notices + AIIR; SG: distribution tax notice + s45G filing). */
  investorView(data: AppData, fund: Fund, calc: FundCalc, ctx: Ctx, selectedNoticeId?: string | null): InvestorView;

  /** Cost base & CGT workspace. `investor` only applies to AU (deferred tax for a chosen investor type). */
  costBaseView(data: AppData, fund: Fund, calc: FundCalc, investor?: DeferredTaxInvestor): CostBaseView;

  /** Per-holder statement shown in the Statements tab (AU: AMIT member annual statement; SG: unitholder statement). */
  statementDoc(data: AppData, fund: Fund, calc: FundCalc, holderId: string): DocModel;

  /** The Rules tab content. */
  rules(fund: Fund): RulesTable;

  /** Filing and notice obligations for one fund, with status relative to ctx.now (a signed-off/lodged item is "done"). */
  deadlines(data: AppData, fund: Fund, calc: FundCalc, now: Date): DeadlineRow[];

  /** Tax leakage and distribution-mix rows for the Analytics charts. */
  leakage(fund: Fund, calc: FundCalc): LeakageRow;
  mix(fund: Fund, calc: FundCalc): MixRow;

  /**
   * Analytics "Distribution scenario". AU: `value` is a cash distribution in cents. SG: `value` is a taxable payout as a
   * percentage 0..100 (the SG control is a payout percentage, not a cash amount). Omit `value` for the current position.
   */
  scenario(data: AppData, fund: Fund, calc: FundCalc, value?: number): ScenarioView;
}

export type { Cents };
