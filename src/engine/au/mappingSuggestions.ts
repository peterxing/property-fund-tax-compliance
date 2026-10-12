import type { EntityKind } from "../types.ts";
import type { SuggestionHint as BaseSuggestionHint } from "../mappingSuggestions.ts";
import type { Nature } from "../taxonomy.ts";
import type { RuleEntry } from "../rules.ts";
import type { AuTaxCategoryId } from "./taxonomy.ts";

type Statement = "PL" | "BS";

export type AuSuggestionHint = Omit<BaseSuggestionHint, "nature"> & { nature?: Nature };

export interface CategorySuggestion {
  category: AuTaxCategoryId;
  confidence: number;
  reason: string;
}

interface Rule {
  category: AuTaxCategoryId;
  confidence: number;
  patterns: readonly RegExp[];
  reason: string;
}

interface StatementInference {
  statement: Statement;
  confidence: number;
  reason: string;
}

const INCOME_POLARITY_CUES = /\b(reimbursement|reimbursed|recovery|recoveries|recharge|income|received|rebate|refund|credit[- ]note)\b/i;
const EXPENSE_POLARITY_CUES = /\b(expense|expensed|cost(?:s)?|amorti[sz]ation|depreciation|paid|write[- ]off|provision|loss|impairment)\b/i;

const PL_RULES: readonly Rule[] = [
  { category: "REV_RENT_BASE", confidence: 0.99, patterns: [/\bbase rent\b/i, /\brental income\b/i, /\brental revenue\b/i, /\blease income\b/i, /\bgross rent\b/i, /\brent received\b/i, /\bminimum guaranteed rent\b/i, /\bcontract rent\b/i, /\bshop rental\b/i, /\bbase rental\b/i], reason: "Lease and rental wording indicates ordinary rental income." },
  { category: "REV_RENT_RECOVERIES", confidence: 0.98, patterns: [/\bservice charge recover/i, /\boutgoings recover/i, /\bcam recover/i, /\btenant recover/i, /\brecovery income\b/i, /\butility recover/i, /\brecovery of .*charges?\b/i, /\bservice charge income\b/i], reason: "Recoveries and service-charge wording indicates tenant outgoings recovered as income." },
  { category: "REV_RENT_CARPARK", confidence: 0.98, patterns: [/\bcar ?park (?:income|revenue|fees?)\b/i, /\bparking (?:income|revenue|fees?)\b/i, /\bparking receipts\b/i, /\bcasual parking income\b/i, /\bparking licence income\b/i], reason: "Parking wording indicates property income from car parks or parking." },
  { category: "REV_RENT_TURNOVER", confidence: 0.98, patterns: [/\bturnover rent\b/i, /\bpercentage rent\b/i], reason: "Turnover-rent wording indicates variable rent under the lease." },
  { category: "REV_RENT_OTHER", confidence: 0.92, patterns: [/\bforfeited deposit income\b/i, /\blease surrender income\b/i, /\blease break fee income\b/i, /\badvertising income\b/i, /\bcommon area promotion income\b/i], reason: "Other lease-related wording indicates property income that should stay in the rental stream." },
  { category: "REV_STRAIGHT_LINE_RENT", confidence: 0.99, patterns: [/\bstraight[- ]line rent\b/i, /\bstraight line rental adjustment\b/i, /\brent smoothing\b/i], reason: "Straight-line-rent wording indicates an accounting timing adjustment." },
  { category: "REV_INTEREST", confidence: 0.99, patterns: [/\binterest income\b/i, /\bdeposit interest\b/i, /\bbank interest\b/i, /\binterest received\b/i, /\binterest earned\b/i], reason: "Interest-received wording indicates interest income." },
  { category: "REV_FRANKED_DIVIDEND", confidence: 0.98, patterns: [/\bfranked dividend\b/i, /\bfranked distribution\b/i, /\bdividend income franked\b/i], reason: "Franked-dividend wording indicates assessable franked distributions." },
  { category: "REV_UNFRANKED_DIVIDEND", confidence: 0.98, patterns: [/\bunfranked dividend\b/i, /\bunfranked distribution\b/i, /\bdividend income\b/i, /\bdividend received\b/i], reason: "Dividend wording without franking cues indicates unfranked dividend income." },
  { category: "REV_TRUST_DISTRIBUTION_FRANKED", confidence: 0.96, patterns: [/\btrust distribution\b.*\bfranked\b/i, /\bunit trust distribution\b.*\bfranked\b/i, /\bfund distribution\b.*\bfranked\b/i], reason: "Franked trust-distribution wording indicates traceable franked income." },
  { category: "REV_TRUST_DISTRIBUTION_UNFRANKED", confidence: 0.9, patterns: [/\btrust distribution(?: income)?\b/i, /\bunit trust distribution\b/i, /\bmanaged fund distribution\b/i, /\bdistribution received from .*trust\b/i], reason: "Trust-distribution wording indicates income that should be traced through to its underlying character." },
  { category: "REV_FOREIGN_INCOME", confidence: 0.995, patterns: [/\bforeign income\b/i, /\boverseas income\b/i, /\boverseas rental income\b/i, /\bforeign rental income\b/i, /\bforeign dividend\b/i, /\bforeign sourced interest\b/i, /\boverseas fee income\b/i], reason: "Foreign-source wording indicates foreign income." },
  { category: "REV_AGENCY_COMMISSION", confidence: 0.98, patterns: [/\bagency commission income\b/i, /\bleasing commission income\b/i, /\bbrokerage income\b/i, /\bcommission revenue\b/i, /\bagency fees earned\b/i], reason: "Agency and commission wording indicates fee income." },
  { category: "REV_MANAGEMENT_FEE", confidence: 0.98, patterns: [/\bproperty management fee income\b/i, /\basset management fee income\b/i, /\bmanagement fee income\b/i, /\bmanagement services revenue\b/i, /\bfund management fee income\b/i, /\bmanagement fee revenue\b/i], reason: "Management-fee wording indicates assessable service income." },
  { category: "REV_OTHER_AU", confidence: 0.72, patterns: [/\bsundry income\b/i, /\bother income\b/i, /\bmisc(?:ellaneous)? income\b/i], reason: "Generic income wording indicates residual assessable income." },
  { category: "REV_FAIR_VALUE_GAIN_PROPERTY", confidence: 0.99, patterns: [/\bfair value gain.*investment propert/i, /\brevaluation gain.*investment propert/i], reason: "Investment-property fair-value wording indicates an unrealised gain." },
  { category: "REV_FAIR_VALUE_GAIN_DERIVATIVES", confidence: 0.97, patterns: [/\bfair value gain.*derivative/i, /\bmark to market gain\b/i, /\bmtm gain\b/i], reason: "Derivative fair-value wording indicates a non-cash TOFA-related gain." },
  { category: "REV_GAIN_DISPOSAL", confidence: 0.96, patterns: [/\bgain on disposal\b/i, /\bprofit on disposal\b/i, /\bgain on sale\b/i, /\bdisposal gain\b/i], reason: "Disposal-gain wording indicates a disposal result needing CGT or trading review." },
  { category: "REV_EQUITY_ACCOUNTED_PROFIT", confidence: 0.98, patterns: [/\bshare of profit.*associate/i, /\bequity accounted profit\b/i, /\bshare of profit.*joint venture/i], reason: "Equity-accounted wording indicates accounting profit that is not itself the taxing point." },
  { category: "EXP_LAND_TAX", confidence: 0.99, patterns: [/\bland tax\b/i], reason: "Land-tax wording indicates deductible land tax." },
  { category: "EXP_COUNCIL_RATES", confidence: 0.99, patterns: [/\bcouncil rates?\b/i, /\bshire rates?\b/i, /\bmunicipal rates?\b/i], reason: "Council-rates wording indicates deductible property rates." },
  { category: "EXP_WATER_RATES", confidence: 0.99, patterns: [/\bwater rates?\b/i, /\bsewerage rates?\b/i], reason: "Water-rates wording indicates property rates and utilities outgoings." },
  { category: "EXP_REPAIRS_REVENUE", confidence: 0.97, patterns: [/\br&m\b/i, /\brepairs? and maintenance\b/i, /\bmaintenance expense\b/i, /\brepairs? expense\b/i, /\broutine repairs?\b/i, /\bcleaning and repairs?\b/i], reason: "R&M wording indicates repairs and maintenance." },
  { category: "EXP_REPAIRS_CAPITAL", confidence: 0.97, patterns: [/\bcapital repairs?\b/i, /\bmajor refurbishment\b/i, /\bfitout capitalised through p&l\b/i, /\bcapital replacement works\b/i], reason: "Capital-repair wording indicates a capital improvement rather than a revenue repair." },
  { category: "EXP_INSURANCE", confidence: 0.98, patterns: [/\binsurance\b/i, /\bpublic liability insurance\b/i, /\bprofessional indemnity\b/i, /\bindustrial special risks insurance\b/i], reason: "Insurance wording indicates insurance expense." },
  { category: "EXP_PROPERTY_MANAGEMENT", confidence: 0.99, patterns: [/\bproperty management fee\b(?! income)/i, /\bmanaging agent fee\b/i, /\bfacilities management fee\b/i, /\bbuilding management fee\b/i, /\bproperty management fees\b/i, /\bproperty manager fee\b/i], reason: "Property-management wording indicates property management fees." },
  { category: "EXP_LEASING_FEES", confidence: 0.99, patterns: [/\bleasing commission\b(?! income)/i, /\bletting fee\b/i, /\bleasing fee(?:s)?\b/i, /\btenant incentive fee\b/i], reason: "Leasing-fee wording indicates leasing commissions or fees." },
  { category: "EXP_RESPONSIBLE_ENTITY_FEE", confidence: 0.99, patterns: [/\bresponsible entity fee\b/i, /\bre fee\b/i, /\bresponsible entity base fee\b/i], reason: "Responsible-entity wording indicates trust management fees." },
  { category: "EXP_TRUSTEE_FEE", confidence: 0.99, patterns: [/\btrustee fees?\b/i], reason: "Trustee-fee wording indicates recurring trustee fees." },
  { category: "EXP_CUSTODIAN_FEE", confidence: 0.99, patterns: [/\bcustodian fees?\b/i], reason: "Custodian wording indicates custodian fees." },
  { category: "EXP_INVESTMENT_MGMT_FEE", confidence: 0.99, patterns: [/\binvestment management fee\b/i, /\basset management fee expense\b/i, /\bfund management fee\b(?! income)/i, /\bperformance fee expense\b/i], reason: "Investment-management wording indicates recurring fund management fees." },
  { category: "EXP_AUDIT_FEES", confidence: 0.99, patterns: [/\baudit fees?\b/i], reason: "Audit wording indicates audit fees." },
  { category: "EXP_LEGAL_FEES", confidence: 0.98, patterns: [/\blegal fees?\b/i, /\blegal expenses?\b/i, /\bsolicitors fees?\b/i], reason: "Legal-fee wording indicates legal costs." },
  { category: "EXP_TAX_FEES", confidence: 0.98, patterns: [/\btax fees?\b/i, /\btax advisory\b/i, /\btax compliance\b/i, /\btax consulting\b/i], reason: "Tax-fee wording indicates tax compliance or advisory fees." },
  { category: "EXP_VALUATION_FEES", confidence: 0.98, patterns: [/\bvaluation fees?\b/i, /\bproperty valuation charges?\b/i], reason: "Valuation wording indicates valuation fees." },
  { category: "EXP_BORROWING_COSTS", confidence: 0.97, patterns: [/\bloan establishment fee\b/i, /\barrangement fee\b/i, /\bfacility fee\b/i, /\bborrowing costs?\b/i, /\bdebt raising costs?\b/i], reason: "Borrowing-cost wording indicates financing costs that are usually spread for tax." },
  { category: "EXP_BORROWING_COSTS_AMORT", confidence: 0.99, patterns: [/\bamorti[sz]ation of borrowing costs\b/i, /\bborrowing costs? amorti[sz]ation\b/i, /\bfacility fee amorti[sz]ation\b/i, /\bloan fee amorti[sz]ation\b/i], reason: "Amortisation wording indicates accounting spread of borrowing costs." },
  { category: "EXP_INTEREST", confidence: 0.99, patterns: [/\binterest expense\b/i, /\binterest paid\b/i, /\bloan interest\b/i, /\bbank interest expense\b/i, /\binterest on mortgage\b/i, /\bterm loan interest\b/i, /\brelated party loan interest\b/i], reason: "Interest-expense wording indicates borrowing interest." },
  { category: "EXP_LEASE_INCENTIVE_AMORT", confidence: 0.98, patterns: [/\blease incentive amorti[sz]ation\b/i, /\bamorti[sz]ation of lease incentive\b/i], reason: "Lease-incentive-amortisation wording indicates an accounting timing entry." },
  { category: "EXP_DEPRECIATION", confidence: 0.99, patterns: [/\bdepreciation\b/i], reason: "Depreciation wording indicates accounting depreciation." },
  { category: "EXP_AMORTISATION", confidence: 0.99, patterns: [/^\s*(?:[0-9-]+\s+)?amorti[sz]ation(?:\s*-\s*.*)?\s*$/i, /\bamorti[sz]ation intangible asset\b/i], reason: "Amortisation wording indicates accounting amortisation." },
  { category: "EXP_FAIR_VALUE_LOSS_PROPERTY", confidence: 0.99, patterns: [/\bfair value loss.*investment propert/i, /\brevaluation loss.*investment propert/i], reason: "Investment-property fair-value wording indicates an unrealised loss." },
  { category: "EXP_FAIR_VALUE_LOSS_DERIVATIVES", confidence: 0.97, patterns: [/\bfair value loss.*derivative/i, /\bmark to market loss\b/i, /\bmtm loss\b/i], reason: "Derivative fair-value wording indicates a non-cash TOFA-related loss." },
  { category: "EXP_LOSS_DISPOSAL", confidence: 0.96, patterns: [/\bloss on disposal\b/i, /\bloss on sale\b/i, /\bdisposal loss\b/i], reason: "Disposal-loss wording indicates a disposal result needing CGT or trading review." },
  { category: "EXP_IMPAIRMENT", confidence: 0.98, patterns: [/\bimpairment\b/i, /\bexpected credit loss\b/i, /\bprovision for doubtful debts\b/i], reason: "Impairment and provision wording indicates non-deductible impairment." },
  { category: "EXP_STAMP_DUTY_ACQ", confidence: 0.99, patterns: [/\bstamp duty\b/i, /\btransfer duty\b/i], reason: "Stamp-duty wording indicates acquisition or transaction duty." },
  { category: "EXP_ACQUISITION_COSTS", confidence: 0.97, patterns: [/\bacquisition costs?\b/i, /\bdue diligence\b/i, /\bcapital raising costs?\b/i, /\bacquisition expenses?\b/i], reason: "Acquisition-cost wording indicates capital transaction costs." },
  { category: "EXP_ENTERTAINMENT", confidence: 0.98, patterns: [/\bentertainment\b/i, /\bhospitality\b/i, /\bclient gifts?\b/i], reason: "Entertainment wording indicates entertainment expenditure." },
  { category: "EXP_PENALTIES", confidence: 0.99, patterns: [/\bfines?\b/i, /\bpenalt(?:y|ies)\b/i, /\blate payment charge\b/i], reason: "Penalty wording indicates non-deductible penalties or fines." },
  { category: "EXP_INCOME_TAX", confidence: 0.99, patterns: [/\bincome tax expense\b/i, /\bcurrent tax\b/i, /\bdeferred tax expense\b/i, /^(?!.*(?:land|payroll|gst)).*\btax expense\b/i], reason: "Income-tax-expense wording indicates income tax." },
  { category: "EXP_GST_NON_RECOVERABLE", confidence: 0.76, patterns: [/\bnon[- ]recoverable gst\b/i, /\birrecoverable gst\b/i, /\bgst not claimable\b/i], reason: "Non-recoverable-GST wording indicates GST that follows the underlying cost." },
  { category: "EXP_DEV_COST_OF_SALES", confidence: 0.99, patterns: [/\bcost of sales\b/i, /\bdevelopment cost sold\b/i, /\bconstruction cost sold\b/i, /\bland cost sold\b/i, /\bproject cost of sales\b/i], reason: "Cost-of-sales wording indicates developer trading-stock cost." },
  { category: "EXP_DEV_HOLDING_COSTS", confidence: 0.97, patterns: [/\bproject holding costs?\b/i, /\bdevelopment holding costs?\b/i, /\bproject overhead recoverable\b/i, /\bdevelopment overheads?\b/i], reason: "Development-project wording indicates developer holding costs." },
  { category: "EXP_AGENCY_COMMISSION", confidence: 0.98, patterns: [/\bagency commission expense\b/i, /\bleasing commission expense\b/i, /\bbrokerage expense\b/i, /\bagency fee expense\b/i, /\bcommission expense\b/i], reason: "Commission wording indicates deductible commission expense." },
  { category: "EXP_WAGES", confidence: 0.98, patterns: [/\bwages\b/i, /\bsalar(?:y|ies)\b/i, /\bdirectors?(?:'s)? remuneration\b/i, /\bsalary expense\b/i, /\bpayroll wages\b/i], reason: "Payroll wording indicates wages and salaries." },
  { category: "EXP_SUPER", confidence: 0.99, patterns: [/\bsuperannuation\b/i, /\bsuper guarantee\b/i, /\bsg expense\b/i], reason: "Superannuation wording indicates employer super expense." },
  { category: "EXP_PAYROLL_TAX", confidence: 0.99, patterns: [/\bpayroll tax\b/i, /\bstate payroll tax\b/i], reason: "Payroll-tax wording indicates state payroll tax." },
  { category: "EXP_OTHER_DEDUCTIBLE", confidence: 0.65, patterns: [/\bsubscriptions?\b/i, /\bsoftware\b/i, /\bbank charges?\b/i, /\bstationery\b/i, /\btelephone\b/i, /\bcleaning\b/i, /\bsecurity\b/i, /\btravel\b/i], reason: "Common operating-expense wording indicates a likely deductible operating cost." },
  { category: "EXP_OTHER_NON_DEDUCTIBLE", confidence: 0.55, patterns: [/\bprivate use\b/i, /\bnon[- ]deductible\b/i], reason: "Explicit non-deductible wording indicates a manual add-back category." },
  { category: "BS_INVESTMENT_PROPERTY", confidence: 0.98, patterns: [/\binvestment propert(?:y|ies)\b/i], reason: "Investment-property wording indicates a balance-sheet property account." },
  { category: "BS_DEPRECIATING_ASSETS", confidence: 0.97, patterns: [/\bppe\b/i, /\bproperty, plant and equipment\b/i, /\bplant and equipment\b/i, /\baccumulated depreciation\b/i, /\boffice equipment at cost\b/i], reason: "PPE wording indicates depreciating assets." },
  { category: "BS_DEVELOPMENT_INVENTORY", confidence: 0.98, patterns: [/\bdevelopment inventory\b/i, /\bwork in progress\b/i, /\bproperty inventory\b/i, /\bunsold units\b/i, /\bproject wip\b/i], reason: "Development-inventory wording indicates trading stock or WIP." },
  { category: "BS_INVESTMENTS", confidence: 0.97, patterns: [/\binvestment in trust\b/i, /\bunits in trust\b/i, /\binvestment in managed fund\b/i, /\binvestment in associate\b/i, /\binvestments?\b/i], reason: "Investment wording indicates an investment balance-sheet account." },
  { category: "BS_DERIVATIVE_ASSET", confidence: 0.98, patterns: [/\bderivative asset\b/i, /\bswap asset\b/i], reason: "Derivative-asset wording indicates a derivative balance-sheet asset." },
  { category: "BS_DERIVATIVE_LIABILITY", confidence: 0.98, patterns: [/\bderivative liabilit/i, /\bswap liability\b/i], reason: "Derivative-liability wording indicates a derivative balance-sheet liability." },
  { category: "BS_CASH", confidence: 0.99, patterns: [/\bcash\b/i, /\bbank account\b/i, /\bfixed deposit\b/i, /\bterm deposit\b/i, /\bcash management account\b/i, /\bpetty cash\b/i], reason: "Cash and bank wording indicates a cash balance." },
  { category: "BS_RECEIVABLES", confidence: 0.99, patterns: [/\breceivable(?:s)?\b/i, /\bdebtor\b/i, /\bdue from\b/i, /\bincome receivable\b/i], reason: "Receivable wording indicates a balance-sheet asset." },
  { category: "BS_PREPAYMENTS", confidence: 0.99, patterns: [/\bprepaid\b/i, /\bprepayment(?:s)?\b/i], reason: "Prepayment wording indicates a balance-sheet asset." },
  { category: "BS_PAYABLES", confidence: 0.99, patterns: [/\bpayable(?:s)?\b/i, /\bcreditor(?:s)?\b/i, /\baccruals?\b/i, /\baccrued\b/i, /\bdue to\b/i, /\btenant deposits received\b/i], reason: "Payable wording indicates a balance-sheet liability." },
  { category: "BS_PROVISIONS", confidence: 0.99, patterns: [/\bprovision(?:s)?\b/i, /\bcurrent tax liabilit/i, /\bemployee provision(?:s)?\b/i], reason: "Provision wording indicates a balance-sheet provision." },
  { category: "BS_BORROWINGS", confidence: 0.995, patterns: [/\bborrowings?\b/i, /\bterm loan\b/i, /\bbank loan\b/i, /\bmortgage\b/i, /\bloan from\b/i, /\bnotes payable\b/i], reason: "Borrowing wording indicates debt balances." },
  { category: "BS_DEFERRED_TAX", confidence: 0.99, patterns: [/\bdeferred tax\b/i], reason: "Deferred-tax wording indicates deferred-tax balances." },
  { category: "BS_EQUITY", confidence: 0.99, patterns: [/\bequity\b/i, /\bretained earnings\b/i, /\bunitholders'? funds\b/i, /\bshare capital\b/i, /\bcapital reserve\b/i], reason: "Equity wording indicates equity balances." },
  { category: "BS_OTHER", confidence: 0.97, patterns: [/\bgst clearing\b/i, /\bgst suspense\b/i], reason: "GST clearing wording indicates a balance-sheet clearing account rather than income or expense." },
  { category: "EQ_DISTRIBUTIONS_TO_UNITHOLDERS", confidence: 0.99, patterns: [/\bdistribution to unitholders\b/i, /\bunit holder distribution\b/i], reason: "Distribution wording indicates an appropriation of profit rather than an operating expense." },
  { category: "EQ_DIVIDENDS_PAID", confidence: 0.99, patterns: [/\bdividend declared\b/i, /\bdividends paid\b/i, /\binterim dividend\b/i], reason: "Dividend wording indicates an appropriation of profit rather than an operating expense." },
] as const;

const BS_OVERRIDE_PATTERNS: readonly RegExp[] = [
  /\breceivable\b/i,
  /\bdebtor\b/i,
  /\bprepaid\b/i,
  /\bprepayment\b/i,
  /\bpayable(?:s)?\b/i,
  /\bcreditor(?:s)?\b/i,
  /\baccruals?\b/i,
  /\baccrued\b/i,
  /\bdue to\b/i,
  /\bdue from\b/i,
  /\baccumulated depreciation\b/i,
  /\bprovision\b/i,
  /\bdeferred tax\b/i,
];

const PL_OVERRIDE_PATTERNS: readonly RegExp[] = [
  /\binterest expense\b/i,
  /\bincome tax expense\b/i,
  /\bdepreciation\b/i,
  /\bamorti[sz]ation\b/i,
  /\bgain on\b/i,
  /\bloss on\b/i,
  /\bdistribution to\b/i,
  /\bdividend declared\b/i,
];

const PL_GENERIC_PATTERNS: readonly RegExp[] = [
  /\bincome\b/i,
  /\brevenue\b/i,
  /\bexpense\b/i,
  /\bfees?\b/i,
  /\bcosts?\b/i,
  /\bgain\b/i,
  /\bloss\b/i,
  /\bcommission\b/i,
];

function clampConfidence(confidence: number): number {
  return Math.max(0, Math.min(0.99, Math.round(confidence * 100) / 100));
}

function hasAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function inferredPrefix(accountCode: string, hint?: AuSuggestionHint): string | undefined {
  if (hint?.accountCodePrefix) return hint.accountCodePrefix.trim();
  return /^\s*([0-9])/.exec(accountCode)?.[1];
}

function inferStatement(accountCode: string, accountName: string, hint?: AuSuggestionHint): StatementInference | undefined {
  const text = `${accountCode} ${accountName}`.trim();
  if (text === "") return undefined;
  if (/\b(?:income|interest|rent|commission)\s+receivable\b/i.test(text)) {
    return { statement: "BS", confidence: 0.99, reason: "Receivable wording overrides income wording for balance-sheet accounts." };
  }
  if (/\bbonus accrual\b/i.test(text)) {
    return { statement: "PL", confidence: 0.99, reason: "Bonus-accrual wording indicates a payroll charge, not a liability account mapping." };
  }
  if (/\bexpected credit loss provision\b/i.test(text) || /\bprovision for doubtful debts\b/i.test(text)) {
    return { statement: "PL", confidence: 0.99, reason: "Impairment-provision wording indicates a profit-and-loss bad debt or impairment charge." };
  }
  if (/\binterest payable\b/i.test(text)) {
    return { statement: "BS", confidence: 0.99, reason: "Interest-payable wording overrides borrowing and expense wording for liabilities." };
  }
  if (/\bdeferred tax expense\b/i.test(text)) {
    return { statement: "PL", confidence: 0.99, reason: "Deferred-tax-expense wording indicates the accounting tax charge, not the deferred-tax balance-sheet account." };
  }
  if (/\boffice equipment at cost\b/i.test(text) || /\binvestment in managed fund\b/i.test(text) || /\bswap asset\b/i.test(text) || /\bswap liability\b/i.test(text)) {
    return { statement: "BS", confidence: 0.99, reason: "Specific fixed-asset, investment or derivative wording indicates a balance-sheet account." };
  }
  if (/\baccumulated depreciation\b/i.test(text)) {
    return { statement: "BS", confidence: 0.99, reason: "Accumulated depreciation is a balance-sheet contra-asset." };
  }
  if (/\bprepayment (?:penalty|fee)\b/i.test(text)) {
    return { statement: "PL", confidence: 0.99, reason: "Prepayment-penalty wording indicates a finance cost, not a prepaid asset." };
  }
  const hasBsOverride = hasAny(text, BS_OVERRIDE_PATTERNS) && !/\bprovision for doubtful debts\b/i.test(text);
  const hasPlOverride = hasAny(text, PL_OVERRIDE_PATTERNS);
  const hasPlRuleMatch = PL_RULES.filter((rule) => !rule.category.startsWith("BS_") && !rule.category.startsWith("EQ_")).some((rule) => hasAny(text, rule.patterns));
  const hasBsRuleMatch = PL_RULES.filter((rule) => rule.category.startsWith("BS_") || rule.category.startsWith("EQ_")).some((rule) => hasAny(text, rule.patterns));
  if (hasBsOverride && !hasPlOverride) return { statement: "BS", confidence: 0.97, reason: "Explicit balance-sheet cues were found." };
  if (hasPlOverride && !hasBsOverride) return { statement: "PL", confidence: 0.97, reason: "Explicit profit-and-loss cues were found." };
  if (hasBsOverride && hasPlOverride) return { statement: "BS", confidence: 0.95, reason: "A higher-precedence balance-sheet cue was found alongside profit-and-loss wording." };
  if (hasPlRuleMatch && !hasBsRuleMatch) return { statement: "PL", confidence: 0.88, reason: "A profit-and-loss mapping pattern matched before any balance-sheet pattern." };
  if (hasBsRuleMatch && !hasPlRuleMatch) return { statement: "BS", confidence: 0.88, reason: "A balance-sheet mapping pattern matched before any profit-and-loss pattern." };
  if (hasAny(text, PL_GENERIC_PATTERNS)) return { statement: "PL", confidence: 0.75, reason: "Generic profit-and-loss wording was found." };
  if (hint?.statement) return { statement: hint.statement, confidence: 0.55, reason: "Statement hint used as a weak tie-breaker." };
  if (hint?.nature === "BALANCE") return { statement: "BS", confidence: 0.55, reason: "Balance-sheet nature hint used as a weak tie-breaker." };
  if (hint?.nature === "INCOME" || hint?.nature === "EXPENSE") return { statement: "PL", confidence: 0.55, reason: "Profit-and-loss nature hint used as a weak tie-breaker." };
  const prefix = inferredPrefix(accountCode, hint);
  if (prefix && ["1", "2", "3"].includes(prefix)) return { statement: "BS", confidence: 0.4, reason: "Account-code prefix suggests a balance-sheet account." };
  if (prefix === "4") return { statement: "PL", confidence: 0.4, reason: "Account-code prefix suggests an income account." };
  if (prefix && ["5", "6", "7", "8", "9"].includes(prefix)) return { statement: "PL", confidence: 0.4, reason: "Account-code prefix suggests an expense account." };
  if (hint?.balanceSign === "DEBIT") return { statement: "BS", confidence: 0.3, reason: "Debit balance used as the weakest balance-sheet tie-breaker." };
  if (hint?.balanceSign === "CREDIT") return { statement: "PL", confidence: 0.3, reason: "Credit balance used as the weakest profit-and-loss tie-breaker." };
  return undefined;
}

function fallbackSuggestions(hint?: AuSuggestionHint, statement?: Statement, prefix?: string): CategorySuggestion[] {
  if (statement === "BS" || hint?.statement === "BS" || hint?.nature === "BALANCE") {
    return [{ category: "BS_OTHER", confidence: 0.2, reason: "No stronger AU mapping rule matched after the account was treated as balance sheet." }];
  }
  if (statement === "PL" && (hint?.nature === "INCOME" || prefix === "4")) {
    return [{ category: "REV_OTHER_AU", confidence: 0.25, reason: "No stronger AU mapping rule matched after the account was treated as profit-and-loss income." }];
  }
  return [{ category: "EXP_OTHER_DEDUCTIBLE", confidence: 0.2, reason: "No stronger AU mapping rule matched after the account was treated as profit-and-loss expense." }];
}

function suggestWithinStatement(text: string, statement: Statement, inference: StatementInference | undefined, hint?: AuSuggestionHint): CategorySuggestion[] {
  const hasIncomeCue = INCOME_POLARITY_CUES.test(text) && !/\bincome tax expense\b/i.test(text);
  const hasExpenseCue = EXPENSE_POLARITY_CUES.test(text);
  const matched = PL_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
    .filter((rule) => statement === "PL" ? !rule.category.startsWith("BS_") : rule.category.startsWith("BS_") || rule.category.startsWith("EQ_"))
    .filter((rule) => !(hasIncomeCue && rule.category.startsWith("EXP_")))
    .filter((rule) => !(!hasIncomeCue && hasExpenseCue && rule.category.startsWith("REV_")))
    .map((rule) => ({
      category: rule.category,
      confidence: clampConfidence(rule.confidence),
      specificity: Math.max(...rule.patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source.length)),
      reason: inference ? `${rule.reason} ${inference.reason}` : rule.reason,
    }))
    .sort((a, b) => b.confidence - a.confidence || b.specificity - a.specificity);
  const deduped: CategorySuggestion[] = [];
  for (const suggestion of matched) {
    if (!deduped.some((item) => item.category === suggestion.category)) deduped.push(suggestion);
    if (deduped.length >= 5) break;
  }
  return deduped.length > 0 ? deduped : fallbackSuggestions(hint, statement, inferredPrefix(text, hint));
}

export function suggestAuCategory(accountCode: string, accountName: string, hint?: AuSuggestionHint): CategorySuggestion[] {
  const text = `${accountCode} ${accountName}`.trim();
  const prefix = inferredPrefix(accountCode, hint);
  if (text === "") return fallbackSuggestions(hint, hint?.statement ?? (hint?.nature === "BALANCE" ? "BS" : undefined), prefix);
  if (/\bnotes payable\b/i.test(text)) {
    return [{ category: "BS_BORROWINGS", confidence: 0.99, reason: "Notes-payable wording indicates financing debt rather than ordinary trade creditors." }];
  }
  if (/\bgst .*entertainment\b/i.test(text) || /\bentertainment.*gst\b/i.test(text)) {
    return [{ category: "EXP_ENTERTAINMENT", confidence: 0.99, reason: "Where GST is attached to an entertainment caption, the underlying non-deductible entertainment nature outranks the generic non-recoverable GST cue." }];
  }
  const inference = inferStatement(accountCode, accountName, hint);
  if (inference) return suggestWithinStatement(text, inference.statement, inference, hint);
  return fallbackSuggestions(hint, undefined, prefix);
}

export const RULES_REGISTER: readonly RuleEntry[] = [
  {
    id: "au-mapping.property-ledger-dictionary.2026-10-10",
    domain: "AU_INCOME_TAX",
    title: "Australian property-industry chart-of-accounts mapping dictionary",
    summary: "The AU mapper classifies accounts as profit and loss or balance sheet using explicit wording cues first, then applies Australian property-tax category rules and only falls back to hints or prefixes with low confidence.",
    effectiveFrom: "2026-10-10",
    sources: [
      {
        title: "ATO | Company tax rate changes",
        url: "https://www.ato.gov.au/tax-rates-and-codes/company-tax-rate-changes",
        retrieved: "2026-10-10",
        publisher: "ATO",
      },
      {
        title: "ATO | Trust tax return 2025 instructions – general information for trusts",
        url: "https://www.ato.gov.au/forms-and-instructions/trust-tax-return-2025-instructions/general-information-for-trusts",
        retrieved: "2026-10-10",
        publisher: "ATO",
      },
    ],
    confidence: "ASSUMPTION",
    notes: "The account-caption dictionary is product policy informed by Australian property ledgers (Yardi, MRI, Xero, MYOB and SAP style names). Unknown captions must stay low confidence at 0.30 or below.",
  },
] as const;
