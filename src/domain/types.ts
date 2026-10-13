// =====================================================================================================================
// CONTRACT: domain types. Pure TypeScript, no DOM/React/Node imports. Every domain module and every UI module
// imports its shapes from here. Do not change a field without updating every consumer and the golden tests.
//
// Money is ALWAYS integer minor units ("Cents", AUD or SGD cents). Units are whole numbers. Dates are ISO strings.
// Erasable syntax only (no enums / namespaces / parameter properties): tests run directly under Node type-stripping.
// =====================================================================================================================

export type Cents = number;
export type ISODate = string; // "2026-06-30"
export type LocalDateTime = string; // "2026-10-07T11:30:00" wall-clock, no zone, exactly as seeded
export type Market = "AU" | "SG";
export type Currency = "AUD" | "SGD";
export type FundId = string;
export type UserId = string;

// ---------------------------------------------------------------------------------------------------- workflow
export type WorkflowStatus = "Preparing" | "In review" | "Signed off";
export type GovernanceMode = "agent-lodges" | "agent-signs-off" | "no-agent";
export type ApprovalLevel = "review" | "agent";
export type RoleId = "head-of-tax" | "reviewer" | "preparer" | "tax-agent" | "finance";
export type ActionId =
  | "edit" // edit components, holders and the trial balance
  | "submit"
  | "publish" // publish notices
  | "query" // raise and answer queries
  | "return" // return to preparer
  | "approve-review"
  | "approve-agent"
  | "sign-off"
  | "reopen"
  | "lodge" // record lodgment
  | "manage-access";

export interface GovernanceDef {
  label: string; // "Tax agent reviews and lodges"
  levels: ApprovalLevel[]; // approvals required before sign-off
  agentLodges: boolean;
}

export interface User {
  id: UserId;
  name: string; // "A. Moreno"
  title: string; // "Head of Tax"
  organisation: string; // "Fund manager" | "Arden Tax Partners"
  role: RoleId;
  funds: "all" | FundId[];
}

export interface Approval {
  fundId: FundId;
  level: ApprovalLevel;
  by: string; // user display name
  at: LocalDateTime;
}

export interface Lodgment {
  fundId: FundId;
  kind: "aiir" | "return" | "form-ut";
  reference: string; // "Receipt 418806117352"
  date: ISODate;
  actor: string;
}

export interface AuditEntry {
  id: string;
  fundId: FundId;
  at: LocalDateTime;
  actor: string;
  action: string; // "Submitted for review"
  detail?: string;
}

export interface QueryMessage {
  by: string;
  at: LocalDateTime;
  text: string;
}
export interface Query {
  id: string;
  fundId: FundId;
  subject: string;
  status: "open" | "resolved";
  raisedBy: string;
  raisedAt: LocalDateTime;
  messages: QueryMessage[];
}

// ---------------------------------------------------------------------------------------------------- funds & holders
export interface AuInputs {
  cashDistribution: Cents;
  ausOtherIncome: Cents;
  ncmi: Cents;
  excludedNcmi: Cents;
  cleanBuilding: Cents;
  interest: Cents;
  discountGainTarp: Cents; // gain AFTER the 50% discount (the discount amount equals this figure)
  otherGainTarp: Cents;
  foreignIncome: Cents;
}
export interface SgInputs {
  taxableSpecifiedIncome: Cents;
  taxableDistributed: Cents;
  taxExemptDistribution: Cents;
  capitalDistribution: Cents;
}

interface FundBase {
  id: FundId;
  name: string;
  sector: string; // "Office", "Diversified, stapled", "Data centres"
  listed: boolean;
  periodLabel: string; // "Income year ended 30 Jun 2026" | "Distribution period 1 Jul – 30 Sep 2026"
  periodStart: ISODate;
  periodEnd: ISODate;
  unitsOnIssue: number;
  status: WorkflowStatus;
  whtRemitted: Cents | null; // remitted to the ATO / IRAS for the period; null = not yet remitted
  governance: GovernanceMode;
}
export interface AuFund extends FundBase {
  market: "AU";
  regime: "AMIT";
  currency: "AUD";
  inputs: AuInputs;
}
export interface SgFund extends FundBase {
  market: "SG";
  regime: "S-REIT";
  currency: "SGD";
  assessmentYear: number; // YA2027
  inputs: SgInputs;
}
export type Fund = AuFund | SgFund;

export type AuHolderStatus = "resident" | "foreign-eoi" | "foreign-non-eoi";
export type SgHolderClass = "individual" | "qualifying" | "nrni" | "nr-fund" | "other";

interface HolderBase {
  id: string;
  fundId: FundId;
  holder: string; // "Sakuragawa Life Assurance"
  country: string; // "Japan" | "Non-EOI address" | "Various"
  units: number;
}
export interface AuHolder extends HolderBase {
  auStatus: AuHolderStatus;
}
export interface SgHolder extends HolderBase {
  sgClass: SgHolderClass;
}
export type Holder = AuHolder | SgHolder;

// ---------------------------------------------------------------------------------------------------- trial balance
/** Mapping categories. AU and SG share most ids; labels/treatments differ by market (see TB_CATEGORIES in the seed). */
export type TbCategoryId = string;
/**
 * Reserved id for a row that has not been mapped to a tax category (e.g. a CSV import row without a usable category).
 * It is NOT in AppData.tbCategories. Views label it "Needs a tax category" with treatment "Excluded until mapped" (the reference
 * app's wording), and TbView.allMapped is false while any row carries it (the status chip then reads "1 account needs a tax category" /
 * "N accounts need a tax category"). Preparers can pick it back from the category select too.
 */
export const UNMAPPED_CATEGORY = "unmapped" as const;

export interface TbRow {
  id: string;
  fundId: FundId;
  account: string; // "4000"
  name: string;
  category: TbCategoryId;
  current: Cents; // debits positive, credits negative
  prior: Cents;
}

export interface TbCategoryDef {
  id: TbCategoryId;
  label: string; // "Rental and property income"
  treatment: string; // AU: "Assessable — Australian income, other" | SG: "Specified income — taxable"
}

/** Tax adjustments entered by the preparer, keyed per fund (AU: div40, div43, tarpDiscountGross, tarpOther; SG: capitalAllowances). */
export type TaxAdjustments = Record<string, Cents>;

export interface TaxAdjustmentDef {
  key: string;
  label: string;
  help: string;
}

// ---------------------------------------------------------------------------------------------------- notices
export interface AuNotice {
  id: string;
  fundId: FundId;
  label: string; // "Quarter ended 30 Sep 2025"
  recordDate: ISODate;
  paymentDate: ISODate;
  cash: Cents;
  final: boolean;
  publishedOn: ISODate | null;
  /** Components notified for non-resident withholding purposes in this notice. null = not notified yet (the unpublished draft): the reference estimates it as the balance of the year's components not yet notified. */
  notified: { other: Cents; ncmi: Cents; excludedNcmi: Cents; clean: Cents; interest: Cents } | null;
}
export interface SgNotice {
  id: string;
  fundId: FundId;
  recordDate: ISODate;
  declarationDeadline: ISODate; // Form A / Form B due
  paymentDate: ISODate;
  publishedOn: ISODate | null;
  notified: { taxable: Cents; exempt: Cents; capital: Cents } | null;
}

// ---------------------------------------------------------------------------------------------------- property & cost base
export interface Property {
  id: string;
  fundId: FundId;
  name: string;
  location: string;
  acquired: ISODate;
  cost: Cents;
  improvements: Cents;
  capitalWorksClaimed: Cents; // AU Div 43 claimed; 0 for SG
  valuation: Cents;
}
export interface UnitCostBaseSeed {
  unitPrice: number; // per unit, in currency units (e.g. 0.72)
  priceBasis: "market price" | "NAV per unit";
  opening: Record<string, Cents>; // holderId -> opening unit cost base
}
/** SG distribution tracking schedule opening balances (Form UT). */
export interface SgLedgerSeed {
  exempt: Cents;
  capital: Cents;
  afterTax: Cents;
}

// ---------------------------------------------------------------------------------------------------- app state
export const STATE_VERSION = 1 as const;

export interface AppData {
  version: typeof STATE_VERSION;
  funds: Fund[];
  holders: Holder[];
  tbRows: TbRow[];
  tbCategories: Record<Market, TbCategoryDef[]>;
  taxAdjustments: Record<FundId, TaxAdjustments>;
  adjustmentDefs: Record<Market, TaxAdjustmentDef[]>;
  properties: Property[];
  unitCostBase: Record<FundId, UnitCostBaseSeed>;
  sgLedger: Record<FundId, SgLedgerSeed>;
  auNotices: AuNotice[];
  sgNotices: SgNotice[];
  queries: Query[];
  audit: AuditEntry[];
  approvals: Approval[];
  lodgments: Lodgment[];
  users: User[];
}

export type JurisdictionFilter = "all" | Market;
export interface UiState {
  currentUserId: UserId;
  jurisdiction: JurisdictionFilter;
  selectedFundId: FundId | null;
}

/** Everything the app persists in the browser. */
export interface Persisted {
  data: AppData;
  ui: UiState;
}

/** Context passed to every selector/action: who is acting and what "now" is (injected so tests are deterministic). */
export interface Ctx {
  now: Date;
  user: User;
}

// ---------------------------------------------------------------------------------------------------- distribution view model
export interface DestinationDef {
  key: "gross" | "net" | "withheld" | "unallocated";
  label: string; // AU: "Australian residents" | "Foreign investors, net" | "Withheld for the ATO" | "Units not on register"
}

export interface ComponentLine {
  key: string; // AU: ausOtherIncome|ncmi|excludedNcmi|cleanBuilding|interest|discountGainTarp|cgtConcessionTarp|otherGainTarp|foreignIncome|taxDeferred ; SG: taxableDistributed|taxExemptDistribution|capitalDistribution
  label: string;
  short: string; // short label used on the Sankey
  treatment: string; // "Fund payment · 15% EOI · 30% non-EOI"
  amount: Cents;
  centsPerUnit: number; // e.g. 3.4203 (cents per unit); SG notices need 6 dp
  toGross: Cents;
  toNet: Cents;
  withheld: Cents;
  unallocated: Cents;
  attributed: boolean;
}

export interface HolderLineDetail {
  key: string;
  label: string;
  amount: Cents;
  rate: number; // 0..1
  withheld: Cents;
}
export interface HolderLine {
  holder: Holder;
  share: number; // units / max(unitsOnIssue, registerUnits)
  cash: Cents;
  withheld: Cents;
  net: Cents;
  group: "gross" | "net";
  statusLabel: string; // "Foreign resident — EOI country" | "Qualifying unitholder"
  rateSummary: string; // "15% fund payment · 10% clean building · 10% interest" | "No withholding"
  withholdingParts: Array<{ label: string; amount: Cents }>;
  lines: HolderLineDetail[];
}

export type CheckSeverity = "exception" | "note";
export interface Check {
  id: string;
  severity: CheckSeverity;
  title: string;
  detail: string;
}

export interface WithholdingRecon {
  computed: Cents;
  remitted: Cents | null;
  variance: Cents | null; // computed - remitted
  status: "not-remitted" | "reconciled" | "under-remitted" | "over-remitted";
}

export interface SankeyNode {
  key: string;
  label: string;
  valueLabel: string; // pre-formatted "A$48.32m"
  value: Cents;
}
export interface SankeyLink {
  source: string;
  target: string;
  value: Cents;
}
export interface SankeyModel {
  sources: SankeyNode[];
  targets: SankeyNode[];
  links: SankeyLink[];
  /** Destination keys used for colouring: gross | net | withheld | unallocated */
  targetKinds: Record<string, DestinationDef["key"]>;
}

export interface AuFacts {
  attributed: Cents; // attributed amounts (assessable + NANE)
  cgtConcession: Cents;
  taxDeferred: Cents; // positive when cash exceeds attributed + concession
  costBaseNet: Cents; // cash - attributed - concession; >0 excess (decrease), <0 shortfall (increase)
  fundPayment: Cents;
  ammaDue: ISODate;
  foreignHolderCount: number;
}
export interface SgFacts {
  payoutRatio: number | null; // taxableDistributed / taxableSpecifiedIncome
  retained: Cents;
  trusteeTax: Cents; // 17% of retained
  formUtDue: ISODate;
  undeclaredHolders: number; // class "other"
}

export interface FundCalc {
  fundId: FundId;
  market: Market;
  currency: Currency;
  components: ComponentLine[];
  characterTotal: Cents;
  cash: Cents;
  withheld: Cents;
  holders: HolderLine[];
  registerUnits: number;
  unallocatedUnits: number;
  checks: Check[];
  exceptions: number; // checks with severity "exception"
  destinations: DestinationDef[];
  recon: WithholdingRecon;
  narrative: string; // sentence under the chart
  sankey: SankeyModel;
  au?: AuFacts;
  sg?: SgFacts;
}

// ---------------------------------------------------------------------------------------------------- workflow view model
export interface ApprovalStatus {
  level: ApprovalLevel;
  label: string; // "Reviewer" | "Tax agent"
  done: boolean;
  by?: string;
  at?: LocalDateTime;
}
export interface WorkflowView {
  fundId: FundId;
  status: WorkflowStatus;
  governance: GovernanceDef & { mode: GovernanceMode };
  approvals: ApprovalStatus[];
  signOff: { done: boolean; by?: string; at?: LocalDateTime; waitingOn: string }; // waitingOn e.g. "Head of Tax"
  openQueries: number;
  exceptions: number;
  /** What the current user can do right now, with a reason when an action is shown but disabled. */
  available: Array<{ action: ActionId; label: string; enabled: boolean; reason?: string }>;
  /**
   * Capability flags for ctx.user on this fund right now (permission AND fund access AND status). The UI gates controls on these only.
   *  edit: status is Preparing and the role can edit. query: can raise/answer queries. publish: can publish notices (a notice that
   *  is already published stays locked regardless). lodge: fund is Signed off and the user records lodgment under this governance.
   */
  can: { edit: boolean; query: boolean; publish: boolean; lodge: boolean };
  locked: boolean; // true when status !== "Preparing" (components, holders and TB are read-only)
  lockedReason: string; // "Signed off — reopen to edit" | "In review — return to preparer to edit" | "View only for your role" | ""
  signOffBlockedReason: string; // "Sign-off waits for: Reviewer and Tax agent approval." | ""
}

// ---------------------------------------------------------------------------------------------------- trial balance view
export interface TbRowView {
  id: string;
  account: string;
  name: string;
  category: TbCategoryId;
  categoryLabel: string;
  treatment: string;
  current: Cents;
  prior: Cents;
  change: Cents;
  changePct: number | null; // null when prior is 0
}
export interface BookToTaxRow {
  label: string; // "Net profit per accounts" | "Add: fair value loss" | "Less: straight-line rent"
  amount: Cents; // signed
  kind: "start" | "add" | "less" | "subtotal" | "result";
}
export interface TbView {
  fundId: FundId;
  periodLabel: string;
  balanced: boolean;
  totalDebitsLessCredits: Cents;
  allMapped: boolean;
  matchesDistribution: boolean;
  bookToTax: { title: string; rows: BookToTaxRow[]; resultLabel: string; result: Cents; extra?: { label: string; amount: Cents } };
  adjustments: Array<TaxAdjustmentDef & { amount: Cents }>;
  /**
   * Trial balance vs distribution, one row per EDITABLE input the trial balance can derive. `key` MUST be the AuInputs/SgInputs key
   * being compared (so the "sync-distribution-from-tb" action can copy `trialBalance` into `fund.inputs[key]`); derived-only lines such
   * as taxDeferred are not listed. The cash distribution (AU) and the taxable payout (SG) are decisions, not trial-balance outputs, so
   * they are never listed here and are never overwritten by the sync.
   */
  components: Array<{ key: string; label: string; trialBalance: Cents; distribution: Cents; agrees: boolean }>;
  /** Full inputs as they would be after the sync (decision fields carried over unchanged from the fund). */
  derivedInputs: AuInputs | SgInputs;
  rows: TbRowView[];
  categories: TbCategoryDef[];
}

// ---------------------------------------------------------------------------------------------------- generic documents (inline preview + PDF)
export type DocBlock =
  | { kind: "heading"; text: string; level?: 2 | 3 }
  | { kind: "paragraph"; text: string; tone?: "normal" | "muted" | "note" }
  | { kind: "kv"; title?: string; rows: Array<{ label: string; value: string; emphasis?: boolean }> }
  | {
      kind: "table";
      title?: string;
      columns: Array<{ key: string; label: string; align?: "left" | "right" }>;
      rows: Array<Record<string, string>>;
      totalRow?: Record<string, string>;
    }
  | { kind: "list"; items: string[] };

export interface DocModel {
  fileName: string; // "harbourline-office-trust-amma-sakuragawa-life-assurance.pdf"
  title: string; // "AMIT member annual statement"
  subtitle?: string; // fund name
  meta?: Array<{ label: string; value: string }>;
  blocks: DocBlock[];
  footnotes?: string[];
}

export interface CsvModel {
  fileName: string; // "...csv"
  columns: string[];
  rows: Array<Array<string | number>>;
}

/** Multi-sheet table export (written as .xlsx by exports/xlsx.ts). Cell values are numbers (plain, not cents) or strings. */
export interface WorkbookModel {
  fileName: string; // "property-fund-tax-compliance-portfolio.xlsx"
  sheets: Array<{ name: string; columns: string[]; rows: Array<Array<string | number>> }>;
}

/** One entry of the fund rail on the left of the Distributions, Trial balance, Tax returns, Investor reporting and Cost base workspaces. */
export interface FundListItem {
  fund: Fund;
  status: WorkflowStatus;
  exceptions: number;
}
export interface FundGroup {
  market: Market;
  label: string; // "Australia · AMIT · AUD" | "Singapore · S-REIT · SGD"
  funds: FundListItem[];
}

// ---------------------------------------------------------------------------------------------------- tax returns / investor reporting
export interface ReadinessItem {
  id: string;
  label: string; // "Distribution signed off"
  detail: string; // "Components and withholding are locked"
  done: boolean;
}
export interface ReturnView {
  title: string; // "Tax return lodgment" | "Form UT filing"
  ready: boolean;
  items: ReadinessItem[];
  referenceLabel: string; // "ATO receipt reference" | "IRAS acknowledgement reference"
  lodgmentKind: Lodgment["kind"];
  lodgment: Lodgment | null;
  dueLabel: string; // "AMMA due 30 Sep 2026" | "Form UT YA2027 · due 15 Apr 2027"
  papers: DocModel; // working papers
}

export interface AiirLine {
  holderId: string;
  holder: string;
  country: string;
  statusLabel: string;
  units: number;
  attributed: Cents;
  cash: Cents;
  costBaseNet: Cents; // signed: >0 excess (decrease), <0 shortfall
  withheld: Cents;
}
export interface AuInvestorView {
  market: "AU";
  notices: Array<{ id: string; label: string; paymentDate: ISODate; cash: Cents; publishedOn: ISODate | null; locked: boolean; isCurrentYearDraft: boolean }>;
  selectedNoticeId: string | null;
  noticeDoc: DocModel | null;
  vsYear: Array<{ label: string; published: Cents; year: Cents; difference: Cents }>;
  canPublishSelected: boolean;
  aiir: {
    ready: boolean;
    items: ReadinessItem[];
    aiirDue: ISODate;
    withholdingReportDue: ISODate;
    note: string;
    lodgment: Lodgment | null;
    lines: AiirLine[];
    totals: { units: number; attributed: Cents; cash: Cents; costBaseNet: Cents; withheld: Cents };
    csv: CsvModel;
  };
}
export interface SgInvestorView {
  market: "SG";
  notice: {
    published: boolean;
    publishedOn: ISODate | null;
    recordDate: ISODate;
    declarationDeadline: ISODate;
    paymentDate: ISODate;
    assessmentYear: number;
    doc: DocModel;
    canPublish: boolean;
  };
  s45g: {
    paymentDate: ISODate;
    fileAndPayBy: ISODate;
    overdue: boolean;
    deducted: Cents;
    paid: Cents | null;
    status: WithholdingRecon["status"];
    rows: Array<{ holder: string; country: string; classLabel: string; rateLabel: string; taxable: Cents; deducted: Cents }>;
    totals: { taxable: Cents; deducted: Cents };
    csv: CsvModel;
    emptyMessage: string | null; // "No tax deducted from this distribution"
  };
}
export type InvestorView = AuInvestorView | SgInvestorView;

// ---------------------------------------------------------------------------------------------------- cost base & CGT
export type DeferredTaxInvestor = "foreign-eoi" | "foreign-non-eoi" | "complying-super" | "company";
export interface PropertyGainRow {
  id: string;
  name: string;
  location: string;
  acquired: ISODate;
  heldLabel: string; // "Held 12 months — discount applies" | "Held under 12 months — no discount"
  discountApplies: boolean;
  costBase: Cents; // AU: tax cost base after capital works; SG: cost
  capitalWorks: Cents; // AU only
  valuation: Cents;
  unrealised: Cents;
}
export interface UnitCostBaseRow {
  holderId: string;
  holder: string;
  statusLabel: string;
  units: number;
  opening: Cents;
  adjustment: Cents;
  closing: Cents;
  perUnit: number;
  marketValue: Cents;
  unrealised: Cents;
}
export interface CostBaseView {
  market: Market;
  asAtLabel: string; // "Harbourline Office Trust · valuations at 30 Jun 2026"
  properties: PropertyGainRow[];
  propertyTotals: { costBase: Cents; valuation: Cents; unrealised: Cents };
  /** AU only */
  cgtSummary?: Array<{ label: string; amount: Cents; emphasis?: boolean }>;
  deferredTax?: { investors: Array<{ id: DeferredTaxInvestor; label: string; amount: Cents }>; selected: DeferredTaxInvestor; note: string };
  /** SG only */
  sgNote?: string;
  unitPriceLabel: string; // "A$0.720 · market price"
  adjustmentLabel: string; // "AMIT cost base net amount" | "Return of capital reduces the cost of units"
  unitRows: UnitCostBaseRow[];
  unitTotals: { units: number; opening: Cents; adjustment: Cents; closing: Cents; marketValue: Cents; unrealised: Cents };
  footnote: string;
  propertiesCsv: CsvModel;
  unitsCsv: CsvModel;
  propertiesDoc: DocModel;
}

// ---------------------------------------------------------------------------------------------------- bulk review
export type NextForYou =
  | { kind: "signed-off"; text: string } // "already signed off"
  | { kind: "blocked"; text: string } // "2 open exceptions"
  | { kind: "waiting"; text: string } // "waiting for tax agent approval"
  | { kind: "submit"; text: string }
  | { kind: "approve-review"; text: string }
  | { kind: "approve-agent"; text: string }
  | { kind: "sign-off"; text: string }
  | { kind: "none"; text: string };
export interface BulkRow {
  fund: Fund;
  governanceLabel: string;
  status: WorkflowStatus;
  approvals: ApprovalStatus[];
  exceptions: number;
  openQueries: number;
  next: NextForYou;
  canSubmit: boolean;
  canApproveReview: boolean;
  canSignOff: boolean;
}
export interface BulkResult {
  done: FundId[];
  skipped: Array<{ fundId: FundId; reason: string }>;
}

// ---------------------------------------------------------------------------------------------------- analytics
export interface LeakageRow {
  fundId: FundId;
  fundName: string;
  currency: Currency;
  distribution: Cents;
  finalWithholding: Cents;
  recoverable: Cents;
  trusteeTax: Cents;
  totalPct: number; // 0..100, one decimal shown
}
export interface MixRow {
  fundId: FundId;
  fundName: string;
  taxable: number; // percentages 0..100
  capitalGains: number;
  taxExempt: number;
  taxDeferredAndCapital: number;
}
export type DeadlineStatus = "overdue" | "open" | "done";
export interface DeadlineRow {
  date: ISODate;
  fundId: FundId;
  fundName: string;
  obligation: string; // "AMMA statements" | "AIIR" | "Form UT" ...
  status: DeadlineStatus;
}
/**
 * Analytics "Distribution scenario", uniform across markets so the UI renders it without branching.
 *  AU: input is the cash distribution for the year (cents). SG: input is the taxable payout as a percentage 0..100.
 */
export interface ScenarioView {
  fundId: FundId;
  currency: Currency;
  inputKind: "cash" | "payout";
  inputLabel: string; // "Cash distribution for the year" | "Taxable payout (% of taxable specified income)"
  inputValue: number; // the value this result was computed for: cents (cash) or percent (payout)
  defaultValue: number; // the current position expressed as the input: cash cents | payout percent
  rows: Array<{ measure: string; now: string; scenario: string }>;
  note: string;
}
export interface AnalyticsView {
  leakage: LeakageRow[];
  leakageHeadline: string; // "Southbank Industrial Partners Fund loses the most, 8.2% of its distribution, mostly final withholding (8.2%)."
  mix: MixRow[];
  mixHeadline: string;
  deadlines: DeadlineRow[]; // includes done items; UI filters unless "Show completed"
  overdueCount: number;
}

// ---------------------------------------------------------------------------------------------------- access
export interface AccessView {
  users: Array<{ user: User; isCurrent: boolean; fundNames: string[]; allFunds: boolean }>;
  governance: Array<{ fund: Fund; status: WorkflowStatus; mode: GovernanceMode; label: string; approvalsBeforeSignOff: string; recordsLodgment: string }>;
  modes: Array<{ mode: GovernanceMode; label: string }>;
  permissions: Array<{ action: ActionId; label: string; roles: Record<RoleId, boolean> }>;
  roles: Array<{ id: RoleId; label: string }>;
  disclaimer: string;
}

// ---------------------------------------------------------------------------------------------------- rules tab
export interface RuleRow {
  item: string;
  treatment: string;
  basis: string; // statutory citation
}
export interface RulesTable {
  title: string; // "Rules applied to Australian AMITs for the 2025–26 income year."
  rows: RuleRow[];
}

// ---------------------------------------------------------------------------------------------------- actions (reducers)
export type Action =
  | { type: "submit"; fundId: FundId }
  | { type: "return"; fundId: FundId }
  | { type: "approve"; fundId: FundId; level: ApprovalLevel }
  | { type: "sign-off"; fundId: FundId }
  | { type: "reopen"; fundId: FundId }
  | { type: "update-inputs"; fundId: FundId; inputs: Partial<AuInputs> | Partial<SgInputs> }
  | { type: "update-holder-units"; fundId: FundId; holderId: string; units: number }
  | { type: "update-units-on-issue"; fundId: FundId; units: number }
  | { type: "update-remitted"; fundId: FundId; remitted: Cents | null }
  | { type: "update-tb-category"; fundId: FundId; rowId: string; category: TbCategoryId }
  | { type: "update-tax-adjustment"; fundId: FundId; key: string; amount: Cents }
  | { type: "import-tb"; fundId: FundId; rows: Array<{ account: string; name: string; category?: TbCategoryId; current: Cents; prior: Cents }> }
  | { type: "sync-distribution-from-tb"; fundId: FundId }
  | { type: "publish-notice"; fundId: FundId; noticeId: string }
  | { type: "record-lodgment"; fundId: FundId; kind: Lodgment["kind"]; reference: string; date: ISODate }
  | { type: "raise-query"; fundId: FundId; subject: string; message: string }
  | { type: "reply-query"; fundId: FundId; queryId: string; message: string }
  | { type: "resolve-query"; fundId: FundId; queryId: string }
  | { type: "set-governance"; fundId: FundId; mode: GovernanceMode }
  | { type: "set-user-funds"; userId: UserId; funds: "all" | FundId[] };

export type ActionResult =
  | { ok: true; data: AppData }
  | { ok: false; reason: string };

export type BulkKind = "submit" | "approve-review" | "sign-off";

// ---------------------------------------------------------------------------------------------------- store (React-agnostic)
export interface Store {
  getState(): Persisted;
  subscribe(listener: () => void): () => void;
  /** Applies a domain action as the current user. Returns the failure reason (never throws for rule violations). */
  dispatch(action: Action): ActionResult;
  /** Applies one action to many funds as the current user; funds that cannot take it are skipped with a reason. */
  dispatchBulk(kind: BulkKind, fundIds: FundId[]): BulkResult;
  setUser(userId: UserId): void;
  setJurisdiction(filter: JurisdictionFilter): void;
  selectFund(fundId: FundId | null): void;
  /** Re-seeds all demo data (keeps the current user). */
  reset(): void;
}
