import type { EntityKind } from "./types.ts";
import type { Nature, TaxCategoryId } from "./taxonomy.ts";

type Statement = "PL" | "BS";

export interface SuggestionHint {
  entityKind?: EntityKind;
  statement?: Statement;
  nature?: Nature;
  balanceSign?: "DEBIT" | "CREDIT";
  accountCodePrefix?: string;
}

export interface CategorySuggestion {
  category: TaxCategoryId;
  confidence: number;
  reason: string;
}

interface Rule {
  category: TaxCategoryId;
  confidence: number;
  patterns: readonly RegExp[];
  reason: string;
}

interface StatementInference {
  statement: Statement;
  confidence: number;
  reason: string;
}

const PL_RULES: readonly Rule[] = [
  { category: "REV_RENTAL", confidence: 0.99, patterns: [/\bbase rent\b/i, /\bbase rental\b/i, /\brental income\b/i, /^(?!.*turnover rent).*\brent income\b/i, /\brental revenue\b/i, /^(?!.*expense).*\blease rental\b/i, /\blease income\b/i, /\bgross rent\b/i, /\brent received\b/i], reason: "Rent and lease-revenue wording indicates property rental income." },
  { category: "REV_SERVICE_CHARGE", confidence: 0.98, patterns: [/\bservice charge recover(?:y|ies)\b/i, /\brecover(?:y|ies) of service charges?\b/i, /\bservice charge(?:s)?(?: (?:income|revenue))?\b/i, /\brecovery of property outgoings\b/i, /\boutgoings recover(?:ed|ies)(?: from tenants?)?\b/i, /\bcam recover/i, /\btenant recover/i, /\butility recover/i], reason: "Service-charge, CAM and tenant-recovery wording indicates service-charge income." },
  { category: "REV_CARPARK_OTHER", confidence: 0.97, patterns: [/\bcar ?park (?:income|revenue)\b/i, /\bturnover rent\b/i, /\bforfeit(?:ed)? deposit income\b/i, /\blease termination (?:compensation|income)\b/i, /\badvertising income\b.*\bcommon area\b/i], reason: "Other property-income wording indicates car-park / turnover-rent / lease-related income." },
  { category: "REV_DEV_SALES", confidence: 0.98, patterns: [/\bdevelopment sales\b/i, /\bproperty sales\b/i, /\bunit sales\b/i, /\bunbilled sales\b/i, /\bsale of development units\b/i], reason: "Sales wording indicates developer trading receipts." },
  { category: "REV_FEES", confidence: 0.97, patterns: [/\bmanagement fee income\b/i, /\basset management fee (?:income|revenue)\b/i, /\bproperty management fee income\b/i, /\bproperty management income\b/i, /\bproject management fee (?:income|revenue)\b/i, /\bagency commission (?:income|revenue)\b/i, /\bcommission income\b/i], reason: "Fee and commission income wording indicates service revenue." },
  { category: "INC_INTEREST", confidence: 0.98, patterns: [/\binterest income\b/i, /\bdeposit interest\b/i, /\bcoupon interest\b/i, /\bfixed deposit interest received\b/i, /\binterest received\b/i, /\binterest earned\b/i, /\bbank interest\b/i], reason: "Interest-received wording indicates interest income." },
  { category: "INC_DIVIDEND_SG", confidence: 0.97, patterns: [/\bsingapore dividend\b/i, /\bone[- ]tier dividend\b/i, /\bdividend income sg\b/i], reason: "Singapore one-tier dividend wording indicates exempt dividend income." },
  { category: "INC_FOREIGN", confidence: 0.96, patterns: [/\bforeign[- ]sourced\b/i, /\boverseas dividend\b/i, /\bbranch profit\b/i, /\bforeign service income\b/i, /\bforeign rental income\b/i], reason: "Foreign-source wording indicates separate foreign-income review." },
  { category: "INC_OTHER_TAXABLE", confidence: 0.72, patterns: [/\bsundry income\b/i, /\bother income\b/i, /\bmisc(?:ellaneous)? income\b/i], reason: "Generic income wording indicates residual other taxable income." },
  { category: "INC_FV_GAIN_PROPERTY", confidence: 0.99, patterns: [/\bfair value gain.*investment propert/i, /\brevaluation gain.*investment propert/i], reason: "Investment-property fair-value wording indicates a non-taxable revaluation gain." },
  { category: "INC_FV_GAIN_OTHER", confidence: 0.95, patterns: [/\bfair value gain.*derivative/i, /\bmark to market gain\b/i, /\bfrs ?109 gain\b/i], reason: "Financial-instrument fair-value wording indicates other fair-value gains." },
  { category: "INC_GAIN_DISPOSAL", confidence: 0.95, patterns: [/\bgain on disposal\b/i, /\bprofit on disposal\b/i, /\bgain on sale of (?:investment|quoted shares)\b/i, /\bgain on disposal of subsidiary\b/i, /\bgain on disposal of ppe\b/i, /\bdisposal gain\b/i], reason: "Disposal-gain wording indicates gains that require capital-versus-revenue review." },
  { category: "INC_FX_REALISED", confidence: 0.93, patterns: [/\brealised fx gain\b/i, /\bfx gain realised\b/i, /\bforex realised gain\b/i, /\bexchange gain realised\b/i, /\brealised foreign exchange gain\b/i], reason: "Realised FX-gain wording indicates realised foreign exchange income." },
  { category: "INC_FX_UNREALISED", confidence: 0.93, patterns: [/\bunrealised fx gain\b/i, /\bmtm fx gain\b/i, /\bunrealised foreign exchange gain\b/i], reason: "Unrealised FX-gain wording indicates unrealised foreign exchange income." },
  { category: "EXP_PROPERTY_TAX", confidence: 0.99, patterns: [/\bproperty tax(?: expense)?\b/i], reason: "Property-tax wording indicates property-tax expense." },
  { category: "EXP_REPAIRS_MAINT", confidence: 0.98, patterns: [/\br&m\b/i, /\brepairs? & maintenance\b/i, /\brepairs? and maintenance\b/i, /\blift maintenance\b/i, /\bmaintenance expense\b/i], reason: "R&M wording indicates repair and maintenance expense." },
  { category: "EXP_UTILITIES", confidence: 0.98, patterns: [/\butilities\b/i, /\belectricity charges?\b/i, /\bwater charges?\b/i, /\butility expense\b/i], reason: "Utilities wording indicates utility and outgoings expense." },
  { category: "EXP_INSURANCE", confidence: 0.97, patterns: [/^(?:[0-9-]+\s+)?insurance$/i, /\binsurance expenses?\b/i, /\binsurance premiums?\b/i, /\bproperty insurance\b/i, /\bfire insurance\b/i, /\bprofessional indemnity\b/i, /\bpublic liability insurance\b/i], reason: "Insurance-expense wording indicates insurance expense." },
  { category: "EXP_LEASING_COMMISSION", confidence: 0.97, patterns: [/\bleasing commission\b/i, /\bletting commission\b/i, /\btenant agent fee\b/i], reason: "Leasing-commission wording indicates leasing commission expense." },
  { category: "EXP_PROPERTY_MGMT", confidence: 0.98, patterns: [/\bproperty management fee\b(?!.*income)/i, /\bproperty manager fees?\b/i, /\bmanaging agent fee\b/i, /\bmanagement fee - property\b/i, /\bfacilities management(?: fee)?\b/i, /\bbuilding management fee\b/i], reason: "Property-management wording indicates property management expense." },
  { category: "EXP_RENOVATION", confidence: 0.96, patterns: [/\brenovation expense\b/i, /\brefurbishment costs?\b/i, /\bfit[- ]out costs?\b/i], reason: "Renovation wording indicates renovation / refurbishment expense." },
  { category: "EXP_MANAGER_FEE", confidence: 0.98, patterns: [/\bmanager'?s management fee\b/i, /\bmanagement fee expense\b/i, /\bbase management fee\b/i, /\bperformance fee expense\b/i, /\bacquisition fee\b/i, /\bdivestment fee\b/i], reason: "Fund / REIT management-fee wording indicates manager fee expense." },
  { category: "EXP_TRUSTEE_FEE", confidence: 0.98, patterns: [/\btrustee fee\b/i, /\bcustodian fee\b/i], reason: "Trustee and custodian wording indicates trustee-fee expense." },
  { category: "EXP_PROFESSIONAL", confidence: 0.97, patterns: [/\baudit and secretarial fees?\b/i, /\baudit (?:and tax )?fees?\b/i, /\btax (?:advisory |compliance )?fees?\b/i, /\blegal (?:and professional )?fees?\b/i, /\bprofessional (?:services )?fees?\b/i, /\bvaluation fees?\b/i], reason: "Professional-fee wording indicates professional expense." },
  { category: "EXP_STAFF", confidence: 0.97, patterns: [/\bsalar(?:y|ies)\b/i, /\bstaff costs?\b/i, /\bsalaries and cpf\b/i, /\bdirectors?' (?:fees|remuneration)\b/i, /\bcpf (?:expense|contribution)\b/i, /\bbonus accrual\b/i, /\bpayroll costs?\b/i, /\bsdl\b/i, /\bforeign worker levy\b/i, /\bwages\b/i, /\bbonus\b/i], reason: "Payroll and remuneration wording indicates staff costs." },
  { category: "EXP_ADMIN", confidence: 0.9, patterns: [/\bgeneral (?:and|&) administrative(?: expenses?)?\b/i, /\badministrative expenses?\b/i, /\badmin expenses?\b/i, /\boffice administration(?: expense)?\b/i], reason: "General-and-administrative wording indicates admin expense." },
  { category: "EXP_ENTERTAINMENT", confidence: 0.98, patterns: [/\bentertainment expense\b/i, /\bclient gifts? and corporate hospitality\b/i, /\bhospitality\b/i, /\bstaff and client entertainment\b/i, /\bmeals and entertainment\b/i, /\bclient hospitality\b/i, /\bstaff gifts?\b/i], reason: "Entertainment wording indicates entertainment or gifts expense." },
  { category: "EXP_OTHER_DEDUCTIBLE", confidence: 0.88, patterns: [/\bmarketing and advertising\b/i, /\badvertising and promotion\b/i, /\bmarketing expenses?\b/i, /\bshow flat expenses?\b/i, /\boffice rental\b/i, /\brent expense\b/i, /\blease rental expense\b/i, /\bsoftware subscriptions?\b/i, /\bcloud software subscriptions?\b/i, /\btelephone and internet\b/i, /\btravel and transport\b/i, /\bbank charges?\b/i, /\bprinting and stationery\b/i, /\btraining and development\b/i, /\brecruitment fees?\b/i, /\bsubscriptions? and licences?\b/i, /\bsubscriptions? and licenses?\b/i, /\bcourier and postage\b/i, /\bcleaning fees?\b/i, /\bsecurity services\b/i, /\blandscaping\b/i, /\bpest control\b/i, /\bquit rent\b/i, /\bland rent\b/i, /\bmcst\b/i, /\bmanagement corporation contributions?\b/i], reason: "Common operating-expense wording indicates a normal deductible business expense without a more specific tax category." },
  { category: "EXP_OTHER_DEDUCTIBLE", confidence: 0.55, patterns: [/\bsundry expenses?\b/i, /\bmisc(?:ellaneous)? expenses?\b/i, /\bother expenses?\b/i, /\bother operating expenses?\b/i], reason: "Generic expense wording indicates a deductible expense but needs human review because the caption is not specific." },
  { category: "EXP_DONATIONS", confidence: 0.99, patterns: [/\bdonation\b/i, /\bcharit(?:y|able)\b/i, /\bipc contribution\b/i], reason: "Donation wording indicates donations expense." },
  { category: "EXP_INTEREST", confidence: 0.99, patterns: [/\binterest expense\b/i, /\binterest paid\b/i, /\binterest on\b/i, /\bloan interest\b/i, /\bbank loan interest\b/i, /\binterest expense - term loan\b/i, /\binterest expense - bank loan\b/i], reason: "Interest-expense wording indicates borrowing-cost expense." },
  { category: "EXP_FINANCE_OTHER", confidence: 0.97, patterns: [/\bcommitment fee\b/i, /\barrangement fee\b/i, /\bguarantee fee\b/i, /\bhedging costs?\b/i, /\bprepayment (?:fee|penalty)\b/i, /\bamorti[sz]ation of borrowing costs\b/i, /\bloan arrangement fee amorti[sz]ation\b/i, /\bfacility fee amorti[sz]ation\b/i], reason: "Financing-cost wording indicates non-interest finance costs." },
  { category: "EXP_DEPRECIATION", confidence: 0.99, patterns: [/\bdepreciation\b/i, /^\s*(?:[0-9-]+\s+)?amorti[sz]ation(?:\s*-\s*.*)?\s*$/i, /\bamorti[sz]ation of software\b/i, /\bamorti[sz]ation of leasehold improvements\b/i], reason: "Depreciation or amortisation wording indicates non-deductible depreciation expense." },
  { category: "EXP_ACQUISITION_COSTS", confidence: 0.96, patterns: [/\bdue diligence costs?\b/i, /\bacquisition costs?\b/i, /\bdisposal costs?\b/i], reason: "Acquisition / disposal wording indicates capital transaction costs." },
  { category: "EXP_STAMP_DUTY", confidence: 0.99, patterns: [/\bstamp duty\b/i, /\bbsd\b/i, /\babsd\b/i, /\bssd\b/i], reason: "Stamp-duty wording indicates stamp-duty cost." },
  { category: "EXP_FV_LOSS_PROPERTY", confidence: 0.99, patterns: [/\bfair value loss.*investment propert/i, /\brevaluation loss.*investment propert/i], reason: "Investment-property fair-value wording indicates a fair-value loss." },
  { category: "EXP_FV_LOSS_OTHER", confidence: 0.95, patterns: [/\bfair value loss.*derivative/i, /\bmark to market loss\b/i, /\bfrs ?109 loss\b/i], reason: "Financial-instrument fair-value wording indicates other fair-value losses." },
  { category: "EXP_LOSS_DISPOSAL", confidence: 0.95, patterns: [/\bloss on disposal\b/i, /\bloss on sale of (?:investment|quoted shares)\b/i, /\bloss on disposal of ppe\b/i, /\bdisposal loss\b/i], reason: "Disposal-loss wording indicates disposal losses." },
  { category: "EXP_IMPAIRMENT", confidence: 0.98, patterns: [/\bimpairment\b/i, /\bprovision for doubtful debts\b/i, /\bexpected credit loss provision\b/i, /\bgeneral provision\b/i], reason: "Impairment or doubtful-debt provision wording indicates impairment or general provision expense." },
  { category: "EXP_BAD_DEBTS", confidence: 0.97, patterns: [/\bbad debts? written off\b/i, /\bspecific bad debt\b/i, /\btrade bad debts? written off\b/i, /\bbalance written off\b/i], reason: "Bad-debt write-off wording indicates specific bad debts." },
  { category: "EXP_FX_REALISED", confidence: 0.93, patterns: [/\brealised fx loss\b/i, /\bfx loss realised\b/i, /\bforex realised loss\b/i, /\bexchange loss realised\b/i, /\brealised foreign exchange loss\b/i], reason: "Realised FX-loss wording indicates realised foreign exchange loss." },
  { category: "EXP_FX_UNREALISED", confidence: 0.93, patterns: [/\bunrealised fx loss\b/i, /\bmtm fx loss\b/i, /\bunrealised foreign exchange loss\b/i], reason: "Unrealised FX-loss wording indicates unrealised foreign exchange loss." },
  { category: "EXP_DEV_COST_OF_SALES", confidence: 0.98, patterns: [/\bcost of sales\b/i, /\bconstruction cost sold\b/i, /\bdevelopment cost sold\b/i, /\bland cost sold\b/i], reason: "Developer cost-of-sales wording indicates development cost of sales." },
  { category: "EXP_DEV_SELLING", confidence: 0.97, patterns: [/\bmarketing expense\b/i, /\bsales commission\b/i, /\bproject marketing\b/i, /\badvertising expense\b.*\bdevelopment\b/i, /\bproject promotion expense\b/i], reason: "Project-marketing wording indicates development selling costs." },
  { category: "EXP_PENALTIES", confidence: 0.98, patterns: [/\bfine\b/i, /^(?!.*prepayment penalty).*\bpenalt(?:y|ies)\b/i, /\blate payment charge\b/i], reason: "Penalty wording indicates non-deductible fines or penalties." },
  { category: "EXP_INCOME_TAX", confidence: 0.99, patterns: [/\bprovision charge for income tax\b/i, /\bincome tax expense\b/i, /\bcorporate income tax expense\b/i, /\bcurrent tax\b/i, /\bdeferred tax (?:expense|charge)\b/i, /^(?!.*property tax).*tax expense\b/i], reason: "Income-tax-expense wording indicates non-deductible income tax expense." },
  { category: "EXP_DISTRIBUTIONS_OWNERS", confidence: 0.99, patterns: [/\bdistribution to unitholders\b/i, /\bdistribution to shareholders\b/i, /\bdividend declared\b/i], reason: "Distribution wording indicates owner distributions rather than operating expenses." },
] as const;

const BS_RULES: readonly Rule[] = [
  { category: "BS_INVESTMENT_PROPERTY", confidence: 0.96, patterns: [/\binvestment propert(?:y|ies)\b/i], reason: "Investment-property wording indicates an investment-property balance-sheet account." },
  { category: "BS_PROPERTY_PLANT_EQUIPMENT", confidence: 0.97, patterns: [/\bproperty, plant and equipment\b/i, /\bpp&e\b/i, /\bppe\b/i, /\bplant and machinery\b/i, /\boffice equipment at cost\b/i, /\bland & buildings at cost\b/i, /\baccumulated depreciation\b/i], reason: "PPE and accumulated-depreciation wording indicates property, plant and equipment." },
  { category: "BS_DEVELOPMENT_PROPERTIES", confidence: 0.97, patterns: [/\bdevelopment propert(?:y|ies)\b/i, /\bdevelopment land inventory\b/i, /\bunsold development units\b/i, /\bproperty inventory\b/i, /\binventory property\b/i], reason: "Development-property wording indicates development inventory." },
  { category: "BS_CASH", confidence: 0.98, patterns: [/\bcash(?: at bank)?\b/i, /\bbank balances?\b/i, /\bbank balance\b/i, /\bbank account\b/i, /\bpetty cash\b/i, /\bfixed deposits?\b(?!.*interest)/i], reason: "Cash, bank-balance and fixed-deposit wording indicates cash balances." },
  { category: "BS_RECEIVABLES", confidence: 0.98, patterns: [/\breceivable(?:s)?\b/i, /\bdebtor(?:s)?\b/i, /\bdue from\b/i, /\bamount due from\b/i, /\bprepaid\b/i, /\bprepayment(?:s)?\b/i, /\bprepaid insurance\b/i, /\butility deposits? paid\b/i, /\bincome receivable\b/i, /\binterest receivable\b/i], reason: "Receivable, due-from or prepaid wording indicates an asset / receivable balance." },
  { category: "BS_PAYABLES", confidence: 0.98, patterns: [/\bpayable(?:s)?\b/i, /\bcreditor(?:s)?\b/i, /\baccrual(?:s)?\b/i, /\baccrued\b.*\bpayable\b/i, /\bamount due to\b/i, /\bdue to\b/i, /\bprovision for income tax\b/i, /\bincome tax provision\b/i, /\b(?:rental|tenant) deposits? received\b/i, /\bsecurity deposits?\b/i], reason: "Payable, creditor, accrual and liability-provision wording indicates payables." },
  { category: "BS_BORROWINGS", confidence: 0.99, patterns: [/\bborrowing(?:s)?\b/i, /\bbank loans?\b/i, /\bterm loans?\b/i, /\bmortgage loans?\b/i, /\bshareholder loans?\b/i, /\bloan from shareholder\b/i, /\bloans? from related part(?:y|ies)\b/i, /\bnotes payable\b/i], reason: "Loan and borrowing wording indicates balance-sheet borrowings." },
  { category: "BS_DEFERRED_TAX", confidence: 0.98, patterns: [/\bdeferred tax assets?\b/i, /\bdeferred tax liabilit(?:y|ies)\b/i, /\bnet deferred tax\b/i, /\bdeferred tax balance\b/i], reason: "Deferred-tax asset / liability wording indicates deferred-tax balances." },
  { category: "BS_EQUITY", confidence: 0.98, patterns: [/\bequity\b/i, /\breserve(?:s)?\b/i, /\bshare capital\b/i, /\bretained earnings\b/i, /\bunitholders'? funds\b/i], reason: "Equity and reserve wording indicates equity balances." },
] as const;

const BS_OVERRIDE_PATTERNS: readonly RegExp[] = [
  /\bincome receivable\b/i,
  /\binterest receivable\b/i,
  /\bpayable(?:s)?\b/i,
  /\breceivable(?:s)?\b/i,
  /\bcreditor(?:s)?\b/i,
  /\bdebtor(?:s)?\b/i,
  /\bprepaid\b/i,
  /\bprepayment(?:s)?\b/i,
  /\baccrual(?:s)?\b/i,
  /\baccrued\b.*\bpayable\b/i,
  /\baccumulated depreciation\b/i,
  /\bamount due (?:to|from)\b/i,
  /\bdue (?:to|from)\b/i,
  /\bprovision for\b/i,
  /\bdeferred tax (?:assets?|liabilit(?:y|ies)|balance)\b/i,
  /\b(?:rental|tenant) deposits? received\b/i,
  /\bsecurity deposits?\b/i,
  /\bloan from\b/i,
  /\bloans? from\b/i,
];

const PL_OVERRIDE_PATTERNS: readonly RegExp[] = [
  /\binterest expense\b/i,
  /\binterest paid\b/i,
  /\binterest on\b/i,
  /\bincome tax expense\b/i,
  /\bmanagement fee expense\b/i,
  /\bamorti[sz]ation of\b/i,
  /\bprepayment (?:penalty|fee)\b/i,
  /\bdepreciation\b/i,
  /\bgain on\b/i,
  /\bloss on\b/i,
  /\bdistribution to\b/i,
  /\bwrite-?off\b/i,
  /\bprovision charge\b/i,
];

const PL_GENERIC_PATTERNS: readonly RegExp[] = [
  /\bincome\b/i,
  /\brevenue\b/i,
  /\bexpense\b/i,
  /\bfee\b/i,
  /\bfees\b/i,
  /\bcost\b/i,
  /\bcosts\b/i,
  /\bcharge\b/i,
  /\bcharges\b/i,
  /\bcommission\b/i,
  /\bgain\b/i,
  /\bloss\b/i,
  /\bdepreciation\b/i,
  /\bamorti[sz]ation\b/i,
  /\bwrite-?off\b/i,
  /\bimpairment\b/i,
];

function clampConfidence(confidence: number): number {
  return Math.max(0, Math.min(0.99, Math.round(confidence * 100) / 100));
}

function hasAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function inferredPrefix(accountCode: string, hint?: SuggestionHint): string | undefined {
  if (hint?.accountCodePrefix) return hint.accountCodePrefix.trim();
  const match = /^\s*([0-9])/.exec(accountCode);
  return match?.[1];
}

function inferStatement(accountCode: string, accountName: string, hint?: SuggestionHint): StatementInference | undefined {
  const text = `${accountCode} ${accountName}`.trim();
  if (text === "") return undefined;

  const hasBsOverride = hasAny(text, BS_OVERRIDE_PATTERNS)
    && !/\b(?:provision for doubtful debts|general provision)\b/i.test(text);
  const hasPlOverride = hasAny(text, PL_OVERRIDE_PATTERNS);
  const hasPlGeneric = hasAny(text, PL_GENERIC_PATTERNS);
  const hasPlRuleMatch = PL_RULES.some((rule) => hasAny(text, rule.patterns));
  const hasBsRuleMatch = BS_RULES.some((rule) => hasAny(text, rule.patterns));

  if (/\b(?:income|interest)\s+receivable\b/i.test(text)) {
    return { statement: "BS", confidence: 0.99, reason: "Receivable wording takes precedence over income wording for balance-sheet accounts." };
  }
  if (/\b(?:impairment loss|provision for doubtful debts|expected credit loss provision|general provision)\b/i.test(text)) {
    return { statement: "PL", confidence: 0.99, reason: "Impairment and doubtful-debt wording indicate a profit-and-loss charge rather than the receivable balance itself." };
  }
  if (/\bbonus accrual\b/i.test(text)) {
    return { statement: "PL", confidence: 0.99, reason: "Bonus-accrual wording indicates an employment-cost charge rather than a generic balance-sheet accrual caption." };
  }
  if (/\baccumulated depreciation\b/i.test(text)) {
    return { statement: "BS", confidence: 0.99, reason: "Accumulated-depreciation wording indicates a balance-sheet contra-asset rather than the current-year expense." };
  }
  if (/\bprepaid\b/i.test(text) || (/\bprepayment(?:s)?\b/i.test(text) && !/\bprepayment (?:penalty|fee)\b/i.test(text))) {
    return { statement: "BS", confidence: 0.99, reason: "Prepaid wording indicates a balance-sheet asset." };
  }
  if (/\b(?:accrued interest payable|interest payable)\b/i.test(text)) {
    return { statement: "BS", confidence: 0.99, reason: "Payable wording takes precedence over interest wording for liabilities." };
  }
  if (/\bprovision for income tax\b/i.test(text) || /\bincome tax provision\b/i.test(text)) {
    return { statement: "BS", confidence: 0.99, reason: "Provision-for-tax wording indicates a liability balance rather than the tax-expense line." };
  }
  if (/\binterest (?:expense|paid|on)\b/i.test(text) || /\b(?:loan interest|bank loan interest|mortgage interest)\b/i.test(text)) {
    return { statement: "PL", confidence: 0.99, reason: "Interest-expense wording takes precedence over loan / borrowing wording." };
  }
  if (/\bamorti[sz]ation of borrowing costs\b/i.test(text) || /\bloan arrangement fee amorti[sz]ation\b/i.test(text)) {
    return { statement: "PL", confidence: 0.99, reason: "Amortisation wording indicates a profit-and-loss expense rather than the balance-sheet debt account." };
  }
  if (/\bprepayment (?:penalty|fee)\b/i.test(text)) {
    return { statement: "PL", confidence: 0.99, reason: "Prepayment-penalty wording indicates a finance charge rather than a prepaid asset." };
  }

  if (hasBsOverride && !hasPlOverride) return { statement: "BS", confidence: 0.97, reason: "Explicit balance-sheet cues were found." };
  if (hasPlOverride && !hasBsOverride) return { statement: "PL", confidence: 0.97, reason: "Explicit profit-and-loss cues were found." };
  if (hasBsOverride && hasPlOverride) {
    return { statement: "BS", confidence: 0.95, reason: "A balance-sheet cue with higher precedence (such as payable / receivable / provision for / prepaid) was found alongside profit-and-loss wording." };
  }
  if (hasPlRuleMatch && !hasBsRuleMatch) {
    return { statement: "PL", confidence: 0.88, reason: "A mapped profit-and-loss pattern was matched before any balance-sheet pattern." };
  }
  if (hasBsRuleMatch && !hasPlRuleMatch) {
    return { statement: "BS", confidence: 0.88, reason: "A mapped balance-sheet pattern was matched before any profit-and-loss pattern." };
  }
  if (hasPlGeneric) return { statement: "PL", confidence: 0.75, reason: "Generic profit-and-loss wording was found." };

  if (hint?.statement) return { statement: hint.statement, confidence: 0.55, reason: "Statement hint used as a weak tie-breaker." };
  if (hint?.nature === "BALANCE") return { statement: "BS", confidence: 0.55, reason: "Balance-sheet nature hint used as a weak tie-breaker." };
  if (hint?.nature === "INCOME" || hint?.nature === "EXPENSE") return { statement: "PL", confidence: 0.55, reason: "Profit-and-loss nature hint used as a weak tie-breaker." };

  const prefix = inferredPrefix(accountCode, hint);
  if (prefix && ["1", "2", "3"].includes(prefix)) return { statement: "BS", confidence: 0.4, reason: "Account-code prefix suggests a balance-sheet account." };
  if (prefix === "4") return { statement: "PL", confidence: 0.4, reason: "Account-code prefix suggests an income account." };
  if (prefix && ["5", "6", "7", "8", "9"].includes(prefix)) return { statement: "PL", confidence: 0.4, reason: "Account-code prefix suggests an expense account." };

  if (hint?.balanceSign === "DEBIT") return { statement: "BS", confidence: 0.3, reason: "Debit balance sign used as a weak balance-sheet tie-breaker." };
  if (hint?.balanceSign === "CREDIT") return { statement: "PL", confidence: 0.3, reason: "Credit balance sign used as a weak profit-and-loss tie-breaker." };

  return undefined;
}

function fallbackSuggestions(hint?: SuggestionHint, statement?: Statement, prefix?: string): CategorySuggestion[] {
  if (statement === "BS" || hint?.statement === "BS" || hint?.nature === "BALANCE") {
    return [{ category: "BS_OTHER", confidence: 0.2, reason: "No stronger match was found after classifying the account as a balance-sheet item." }];
  }
  if (statement === "PL" && (hint?.nature === "INCOME" || prefix === "4")) {
    return [{ category: "INC_OTHER_TAXABLE", confidence: 0.25, reason: "No stronger match was found after classifying the account as a profit-and-loss income item." }];
  }
  return [{ category: "EXP_OTHER_DEDUCTIBLE", confidence: 0.2, reason: "No stronger match was found after classifying the account as a profit-and-loss expense item." }];
}

function suggestWithinStatement(text: string, statement: Statement, inference: StatementInference | undefined, hint?: SuggestionHint): CategorySuggestion[] {
  const rules = statement === "BS" ? BS_RULES : PL_RULES;
  const matched = rules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
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

  if (deduped.length > 0) return deduped;
  return fallbackSuggestions(hint, statement, inferredPrefix(text, hint));
}

export function suggestCategory(accountCode: string, accountName: string, hint?: SuggestionHint): CategorySuggestion[] {
  const text = `${accountCode} ${accountName}`.trim();
  const prefix = inferredPrefix(accountCode, hint);
  if (text === "") return fallbackSuggestions(hint, hint?.statement ?? (hint?.nature === "BALANCE" ? "BS" : undefined), prefix);

  const inference = inferStatement(accountCode, accountName, hint);
  if (inference) return suggestWithinStatement(text, inference.statement, inference, hint);
  return fallbackSuggestions(hint, undefined, prefix);
}

export const RULES_REGISTER = [
  {
    id: "mapping.property-industry-dictionary.2026-10-09",
    domain: "OTHER",
    title: "Property-industry chart-of-accounts mapping dictionary",
    summary: "The mapper classifies the statement first (profit and loss versus balance sheet) using explicit wording cues, then applies property-industry category rules and only uses hints / account-code prefixes as weak tie-breakers.",
    effectiveFrom: "2026-10-09",
    sources: [
      {
        title: "Internal mapping policy informed by IRAS tax-computation categories and common property-industry COA naming",
        url: "https://www.iras.gov.sg/taxes/corporate-income-tax/form-c-s-form-c-s-(lite)-form-c-filing/preparing-a-tax-computation",
        retrieved: "2026-10-09",
        publisher: "IRAS + project mapping policy",
      },
    ],
    confidence: "ASSUMPTION",
    notes: "Precedence rules: receivable / payable / prepaid / accrual / provision-for-liability / deferred-tax-balance cues beat generic income or expense words; conversely explicit 'interest expense', 'interest paid/on', 'income tax expense', 'amortisation of borrowing costs' and similar P&L cues beat loan-account wording. Unknown names always return low-confidence suggestions (0.30 or below).",
  },
] as const;
