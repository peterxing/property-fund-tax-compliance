import type { RuleEntry } from "./rules.ts";
import { ENGINE_DISCLAIMER } from "./rules.ts";
import type { Finding } from "./types.ts";

export type FactorLean = "STRONGLY_CAPITAL" | "CAPITAL" | "NEUTRAL" | "TRADING" | "STRONGLY_TRADING";
export type BadgesOutcome = "LIKELY_CAPITAL" | "INCONCLUSIVE" | "LIKELY_TRADING";
export type BadgesFactorKey =
  | "MOTIVE"
  | "FREQUENCY"
  | "HOLDING_PERIOD"
  | "SUPPLEMENTARY_WORK"
  | "CIRCUMSTANCES_OF_SALE"
  | "FINANCING"
  | "ORGANISATION"
  | "CONNECTION_WITH_TRADE";

export interface BadgesFactorInput {
  lean: FactorLean;
  facts?: string[];
}

export interface AssessBadgesOfTradeInput {
  factors: Partial<Record<BadgesFactorKey, BadgesFactorInput>>;
}

export interface FactorContribution {
  factor: BadgesFactorKey;
  weight: number;
  lean: FactorLean;
  score: number;
  reason: string;
}

export interface AssessBadgesOfTradeResult {
  outcome: BadgesOutcome;
  totalScore: number;
  contributions: FactorContribution[];
  reasons: string[];
  documentsToRetain: string[];
  notes: string[];
  findings: Finding[];
  ruleVersion: string;
}

export const BADGES_OF_TRADE_FACTORS = [
  {
    key: "MOTIVE",
    label: "Purpose or motive at acquisition",
    weight: 4,
    question: "Why was the property acquired?",
    guidance: "IRAS treats acquisition purpose as a central badges-of-trade factor. A deliberate resale-profit motive points toward trading; a yield or long-term strategic hold points toward capital.",
    options: [
      { lean: "STRONGLY_TRADING", label: "Bought mainly for a near-term resale profit" },
      { lean: "TRADING", label: "Bought with a mixed but resale-led profit objective" },
      { lean: "NEUTRAL", label: "Purpose was mixed or unclear" },
      { lean: "CAPITAL", label: "Bought mainly for long-term rental yield or strategic holding" },
      { lean: "STRONGLY_CAPITAL", label: "Bought for a long-term hold with no planned disposal" },
    ],
  },
  {
    key: "FREQUENCY",
    label: "Frequency or repetition of similar transactions",
    weight: 3,
    question: "How often has the taxpayer made similar property disposals?",
    guidance: "Repeated similar transactions point more strongly to trading than an isolated disposal.",
    options: [
      { lean: "STRONGLY_TRADING", label: "Frequent repeat acquisitions and disposals" },
      { lean: "TRADING", label: "More than one similar disposal in a short period" },
      { lean: "NEUTRAL", label: "Some activity, but not clearly repetitive" },
      { lean: "CAPITAL", label: "Largely isolated disposal with limited comparable activity" },
      { lean: "STRONGLY_CAPITAL", label: "Single exceptional disposal only" },
    ],
  },
  {
    key: "HOLDING_PERIOD",
    label: "Length of ownership before sale",
    weight: 3,
    question: "How long was the property held before sale?",
    guidance: "IRAS looks at the holding period as one factor only. The option labels below are workflow heuristics, not IRAS bright-line thresholds.",
    options: [
      { lean: "STRONGLY_TRADING", label: "Under 1 year" },
      { lean: "TRADING", label: "1 to 3 years" },
      { lean: "NEUTRAL", label: "3 to 5 years" },
      { lean: "CAPITAL", label: "5 to 10 years" },
      { lean: "STRONGLY_CAPITAL", label: "More than 10 years" },
    ],
  },
  {
    key: "SUPPLEMENTARY_WORK",
    label: "Enhancement, subdivision or marketing work",
    weight: 2,
    question: "What development, enhancement or marketing work was done before sale?",
    guidance: "Subdivision, redevelopment, active enhancement and sales-marketing work tend to point toward trading.",
    options: [
      { lean: "STRONGLY_TRADING", label: "Major development, subdivision or sale-driven enhancement" },
      { lean: "TRADING", label: "Targeted works mainly to improve saleability or resale price" },
      { lean: "NEUTRAL", label: "Routine asset management only" },
      { lean: "CAPITAL", label: "Minimal works, mostly to preserve investment value" },
      { lean: "STRONGLY_CAPITAL", label: "No meaningful enhancement or sale-preparation work" },
    ],
  },
  {
    key: "CIRCUMSTANCES_OF_SALE",
    label: "Circumstances leading to sale",
    weight: 2,
    question: "Why was the property sold when it was sold?",
    guidance: "Forced or defensive disposals tend to support capital; pre-planned exits or opportunistic flips tend to support trading.",
    options: [
      { lean: "STRONGLY_TRADING", label: "Sale timing followed a planned exit or quick-profit strategy" },
      { lean: "TRADING", label: "Sale was opportunistic after a short-term gain" },
      { lean: "NEUTRAL", label: "Sale reason was mixed or unclear" },
      { lean: "CAPITAL", label: "Sale followed a strategic portfolio reshaping or long hold" },
      { lean: "STRONGLY_CAPITAL", label: "Sale was triggered by unexpected external pressure or necessity" },
    ],
  },
  {
    key: "FINANCING",
    label: "Financing pattern and pressure to repay",
    weight: 2,
    question: "What financing profile sat behind the acquisition and disposal?",
    guidance: "Short-term or highly geared funding that depends on resale points more toward trading than stable long-term funding.",
    options: [
      { lean: "STRONGLY_TRADING", label: "Short-term funding relied on resale proceeds" },
      { lean: "TRADING", label: "High gearing created clear pressure to sell" },
      { lean: "NEUTRAL", label: "Funding profile was mixed" },
      { lean: "CAPITAL", label: "Conventional long-term funding with no strong sale pressure" },
      { lean: "STRONGLY_CAPITAL", label: "Patient capital / unleveraged hold with no resale pressure" },
    ],
  },
  {
    key: "ORGANISATION",
    label: "Business-like organisation around the transaction",
    weight: 2,
    question: "How business-like was the activity around the property and its disposal?",
    guidance: "Dedicated teams, systems, marketing programmes and transaction pipelines point more strongly toward a trade.",
    options: [
      { lean: "STRONGLY_TRADING", label: "Dedicated deal, development or sales platform around the property" },
      { lean: "TRADING", label: "Clear business processes were set up to acquire and resell" },
      { lean: "NEUTRAL", label: "Some organised activity, but not clearly trade-like" },
      { lean: "CAPITAL", label: "Held and monitored like an investment asset" },
      { lean: "STRONGLY_CAPITAL", label: "No separate business-like resale organisation" },
    ],
  },
  {
    key: "CONNECTION_WITH_TRADE",
    label: "Connection with taxpayer's existing trade",
    weight: 2,
    question: "How closely is the property activity connected to the taxpayer's existing business?",
    guidance: "If the taxpayer already trades, develops or deals in property, that linkage tends to support a trading conclusion.",
    options: [
      { lean: "STRONGLY_TRADING", label: "Squarely within an existing property trading / development business" },
      { lean: "TRADING", label: "Closely linked to the taxpayer's ordinary business activities" },
      { lean: "NEUTRAL", label: "Connection to the existing trade is limited or mixed" },
      { lean: "CAPITAL", label: "Mostly outside the taxpayer's ordinary business" },
      { lean: "STRONGLY_CAPITAL", label: "No real connection to an existing trade" },
    ],
  },
] as const satisfies readonly {
  key: BadgesFactorKey;
  label: string;
  weight: number;
  question: string;
  guidance: string;
  options: readonly { lean: FactorLean; label: string }[];
}[];

const FACTOR_WEIGHTS: Record<BadgesFactorKey, number> = Object.fromEntries(BADGES_OF_TRADE_FACTORS.map((factor) => [factor.key, factor.weight])) as Record<BadgesFactorKey, number>;

const LEAN_SCORE: Record<FactorLean, number> = {
  STRONGLY_CAPITAL: -2,
  CAPITAL: -1,
  NEUTRAL: 0,
  TRADING: 1,
  STRONGLY_TRADING: 2,
};

const LABEL: Record<BadgesFactorKey, string> = Object.fromEntries(BADGES_OF_TRADE_FACTORS.map((factor) => [factor.key, factor.label])) as Record<BadgesFactorKey, string>;

export function assessBadgesOfTrade(input: AssessBadgesOfTradeInput): AssessBadgesOfTradeResult {
  const contributions: FactorContribution[] = (Object.keys(FACTOR_WEIGHTS) as BadgesFactorKey[])
    .filter((factor) => input.factors[factor] !== undefined)
    .map((factor) => {
      const response = input.factors[factor]!;
      const weight = FACTOR_WEIGHTS[factor];
      const score = weight * LEAN_SCORE[response.lean];
      return {
        factor,
        weight,
        lean: response.lean,
        score,
        reason: `${LABEL[factor]} was assessed as ${response.lean.toLowerCase().replaceAll("_", " ")}${response.facts?.length ? ` based on: ${response.facts.join("; ")}` : ""}.`,
      };
    });
  const totalScore = contributions.reduce((sum, contribution) => sum + contribution.score, 0);
  const outcome: BadgesOutcome = totalScore <= -8 ? "LIKELY_CAPITAL" : totalScore >= 8 ? "LIKELY_TRADING" : "INCONCLUSIVE";
  const reasons = contributions
    .slice()
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 5)
    .map((item) => item.reason);
  const findings: Finding[] = [
    {
      id: "BADGES_OF_TRADE.HEURISTIC",
      severity: "INFO",
      message: "This is a decision-support heuristic only. Singapore taxability remains a holistic legal and factual determination.",
    },
  ];
  if (contributions.length < 3) {
    findings.push({
      id: "BADGES_OF_TRADE.SPARSE_FACT_PATTERN",
      severity: "WARNING",
      message: "Fewer than three factors were supplied. The result is especially fragile and should not be relied on without fuller facts.",
    });
  }
  return {
    outcome,
    totalScore,
    contributions,
    reasons,
    documentsToRetain: [
      "Signed sale and purchase agreements, options and completion statements",
      "Board or investment committee papers showing acquisition purpose and exit rationale",
      "Financing documents, loan drawdowns and repayment correspondence",
      "Valuation reports, feasibility studies and contemporaneous market analyses",
      "Construction, refurbishment, subdivision, rezoning and marketing records",
      "Correspondence evidencing why the property was sold when it was sold",
      "Accounting treatment, management accounts and any tax opinions obtained",
    ],
    notes: [
      ENGINE_DISCLAIMER,
      "IRAS states that gains from sale of property are not taxable when they are capital gains, but they are taxable when the facts show a trade or an adventure in the nature of trade.",
      "The factors and safe direction of travel are taken from IRAS' badges-of-trade guidance; the numerical weights and outcome thresholds in this module are modelling assumptions to make the assessment transparent.",
    ],
    findings,
    ruleVersion: "badges-of-trade.heuristic.2026-10-09",
  };
}

export const RULES: RuleEntry[] = [
  {
    id: "badges-of-trade.iras.factors",
    domain: "OTHER",
    title: "IRAS badges of trade factors for gains from sale of real property",
    summary: "IRAS treats gains as taxable where the facts point to a trade or adventure in the nature of trade. Common factors include acquisition motive, frequency of transactions, length of ownership, supplementary work, financing and sale circumstances.",
    effectiveFrom: "2022-01-01",
    confidence: "VERIFIED",
    sources: [
      { title: "IRAS | Sale of property, shares and financial instruments gains", url: "https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/what-is-taxable-what-is-not/gains-from-sale-of-property-shares-and-financial-instruments", retrieved: "2026-10-09", publisher: "IRAS" },
      { title: "IRAS | e-Tax Guide index", url: "https://www.iras.gov.sg/quick-links/e-tax-guides", retrieved: "2026-10-09", publisher: "IRAS" },
    ],
  },
  {
    id: "badges-of-trade.scoring.assumption",
    domain: "OTHER",
    title: "Transparent scoring model for badges-of-trade assessment",
    summary: "The engine converts qualitative factor assessments into a transparent score for workflow triage.",
    effectiveFrom: "2022-01-01",
    confidence: "ASSUMPTION",
    notes: "IRAS does not publish a numeric scoring system or bright-line thresholds. The score, weights and cut-offs are implementation assumptions for decision support only.",
    sources: [{ title: "IRAS | Sale of property, shares and financial instruments gains", url: "https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/what-is-taxable-what-is-not/gains-from-sale-of-property-shares-and-financial-instruments", retrieved: "2026-10-09", publisher: "IRAS" }],
  },
];
