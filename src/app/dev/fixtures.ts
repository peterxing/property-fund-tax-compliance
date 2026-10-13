// Fixtures for the design gallery only: no domain calls, so the gallery works while the domain is unfinished.
// Imported solely by dev/Gallery.tsx, which is not part of production builds.
import { money, moneyCompact } from "../../domain/format.ts";
import type {
  AuFund,
  DocModel,
  Fund,
  FundGroup,
  FundListItem,
  SankeyModel,
  SgFund,
  User,
  WorkflowStatus,
} from "../../domain/types.ts";
import type { WorkflowButton } from "../shell/FundHeader.tsx";
import type { StackedRow } from "../charts/stackedBars.ts";
import type { ChainStep } from "../labels.ts";

export const FIXTURE_USERS: User[] = [
  { id: "a-moreno", name: "A. Moreno", title: "Head of Tax", organisation: "Fund manager", role: "head-of-tax", funds: "all" },
  { id: "l-brennan", name: "L. Brennan", title: "Reviewer", organisation: "Fund manager", role: "reviewer", funds: ["harbourline", "southbank", "wattle", "kurrajong", "coastline"] },
  { id: "r-okafor", name: "R. Okafor", title: "Preparer", organisation: "Fund manager", role: "preparer", funds: ["harbourline", "southbank", "wattle", "kurrajong", "coastline"] },
  { id: "d-harrow", name: "D. Harrow", title: "Tax agent", organisation: "Arden Tax Partners", role: "tax-agent", funds: ["harbourline"] },
];

function au(id: string, name: string, sector: string, status: WorkflowStatus, units: number): AuFund {
  return {
    id,
    name,
    sector,
    listed: true,
    periodLabel: "Income year ended 30 Jun 2026",
    periodStart: "2025-07-01",
    periodEnd: "2026-06-30",
    unitsOnIssue: units,
    status,
    whtRemitted: null,
    governance: "agent-lodges",
    market: "AU",
    regime: "AMIT",
    currency: "AUD",
    inputs: {
      cashDistribution: 0,
      ausOtherIncome: 0,
      ncmi: 0,
      excludedNcmi: 0,
      cleanBuilding: 0,
      interest: 0,
      discountGainTarp: 0,
      otherGainTarp: 0,
      foreignIncome: 0,
    },
  };
}

function sg(id: string, name: string, sector: string, status: WorkflowStatus, units: number): SgFund {
  return {
    id,
    name,
    sector,
    listed: true,
    periodLabel: "Distribution period 1 Jul – 30 Sep 2026",
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    unitsOnIssue: units,
    status,
    whtRemitted: null,
    governance: "no-agent",
    market: "SG",
    regime: "S-REIT",
    currency: "SGD",
    assessmentYear: 2027,
    inputs: { taxableSpecifiedIncome: 0, taxableDistributed: 0, taxExemptDistribution: 0, capitalDistribution: 0 },
  };
}

export const FIXTURE_AU_FUND: Fund = au("harbourline", "Harbourline Office Trust", "Office", "In review", 412_000_000);
export const FIXTURE_SG_FUND: Fund = sg("telok-ayer", "Telok Ayer Commercial REIT", "Office & retail", "Preparing", 905_300_000);

const item = (fund: Fund, status: WorkflowStatus, exceptions: number): FundListItem => ({ fund, status, exceptions });

export const FIXTURE_FUND_GROUPS: FundGroup[] = [
  {
    market: "AU",
    label: "Australia · AMIT · AUD",
    funds: [
      item(FIXTURE_AU_FUND, "In review", 0),
      item(au("southbank", "Southbank Industrial Partners Fund", "Industrial", "In review", 188_400_000), "In review", 2),
      item(au("wattle", "Wattle Retail Property Trust", "Retail", "Signed off", 301_250_000), "Signed off", 0),
      item(au("kurrajong", "Kurrajong Stapled Property Trust", "Diversified, stapled", "Preparing", 97_800_000), "Preparing", 1),
    ],
  },
  {
    market: "SG",
    label: "Singapore · S-REIT · SGD",
    funds: [item(FIXTURE_SG_FUND, "Preparing", 0), item(sg("loyang", "Loyang Logistics REIT", "Logistics", "Signed off", 640_000_000), "Signed off", 0)],
  },
];

export const FIXTURE_CHAIN_PENDING: ChainStep[] = [
  { key: "review", label: "Reviewer", done: false, state: "pending", detail: "" },
  { key: "agent", label: "Tax agent", done: false, state: "pending", detail: "" },
  { key: "sign-off", label: "Sign-off", done: false, state: "pending · Head of Tax", detail: "" },
];

export const FIXTURE_CHAIN_DONE: ChainStep[] = [
  { key: "review", label: "Reviewer", done: true, state: "done,", detail: "L. Brennan, 1 Sep 2026" },
  { key: "agent", label: "Tax agent", done: true, state: "done,", detail: "D. Harrow, 3 Sep 2026" },
  { key: "sign-off", label: "Sign-off", done: true, state: "done,", detail: "A. Moreno, 4 Sep 2026" },
];

export const FIXTURE_ACTIONS_REVIEW: WorkflowButton[] = [
  { action: "approve-review", label: "Approve as reviewer", enabled: true },
  { action: "return", label: "Return to preparer", enabled: true },
  { action: "sign-off", label: "Sign off", enabled: false, reason: "Waiting for the reviewer and the tax agent to approve." },
];

export const FIXTURE_ACTIONS_PREPARING: WorkflowButton[] = [
  { action: "submit", label: "Submit for review", enabled: false, reason: "Resolve 2 open exceptions first." },
];

export const FIXTURE_ACTIONS_SIGNED: WorkflowButton[] = [{ action: "reopen", label: "Reopen", enabled: true }];

// ---------------------------------------------------------------------------------------------------- charts
const AUD = (cents: number): string => moneyCompact(cents, "AUD");
const dollars = (amount: number): number => amount * 100;

interface SourceSpec {
  key: string;
  label: string;
  cents: number;
}

/** A Sankey where every source splits across the four destinations in fixed shares (the remainder goes to the last link). */
function sankeyFrom(
  sources: SourceSpec[],
  shares: Record<"gross" | "net" | "withheld" | "unallocated", number>,
  labels: Partial<Record<"gross" | "net" | "withheld" | "unallocated", string>> = {},
): SankeyModel {
  const targets = [
    { key: "gross", label: labels.gross ?? "Australian residents" },
    { key: "net", label: labels.net ?? "Foreign investors, net" },
    { key: "withheld", label: labels.withheld ?? "Withheld for the ATO" },
    { key: "unallocated", label: labels.unallocated ?? "Units not on register" },
  ] as const;
  const links: SankeyModel["links"] = [];
  const totals = new Map<string, number>();
  for (const source of sources) {
    let left = source.cents;
    targets.forEach((target, i) => {
      const value = i === targets.length - 1 ? left : Math.round(source.cents * shares[target.key]);
      left -= value;
      if (value > 0) links.push({ source: source.key, target: target.key, value });
      totals.set(target.key, (totals.get(target.key) ?? 0) + value);
    });
  }
  return {
    sources: sources.map((s) => ({ key: s.key, label: s.label, value: s.cents, valueLabel: AUD(s.cents) })),
    targets: targets.map((t) => ({ key: t.key, label: t.label, value: totals.get(t.key) ?? 0, valueLabel: AUD(totals.get(t.key) ?? 0) })),
    links,
    targetKinds: { gross: "gross", net: "net", withheld: "withheld", unallocated: "unallocated" },
  };
}

export const FIXTURE_SANKEY: SankeyModel = sankeyFrom(
  [
    { key: "ausOtherIncome", label: "Other income", cents: dollars(31_870_000) },
    { key: "cleanBuilding", label: "Clean building", cents: dollars(9_520_000) },
    { key: "interest", label: "Interest", cents: dollars(4_210_000) },
    { key: "ncmi", label: "NCMI", cents: dollars(3_050_000) },
    { key: "discountGainTarp", label: "Discount gain", cents: dollars(2_140_000) },
    { key: "taxDeferred", label: "Tax deferred", cents: dollars(1_230_000) },
  ],
  { gross: 0.5, net: 0.34, withheld: 0.14, unallocated: 0.02 },
);

/** One source is a rounding error next to the rest: it must stay visible and labelled. */
export const FIXTURE_SANKEY_TINY: SankeyModel = sankeyFrom(
  [
    { key: "ausOtherIncome", label: "Other income", cents: dollars(48_000_000) },
    { key: "interest", label: "Interest", cents: dollars(100) },
    { key: "foreignIncome", label: "Foreign income", cents: dollars(250_000) },
  ],
  { gross: 0.6, net: 0.3, withheld: 0.1, unallocated: 0 },
);

export const FIXTURE_SANKEY_EMPTY: SankeyModel = { sources: [], targets: [], links: [], targetKinds: {} };

/** Long names on both sides: the margins have to grow to the words, and wrap them when the chart is narrow, at every width. */
export const FIXTURE_SANKEY_LONG: SankeyModel = sankeyFrom(
  [
    { key: "ncmiTransitional", label: "Excluded from NCMI — transitional", cents: dollars(6_400_000) },
    { key: "ausOtherIncome", label: "Other income", cents: dollars(21_300_000) },
    { key: "interest", label: "Interest", cents: dollars(2_100_000) },
    { key: "taxDeferred", label: "Tax deferred", cents: dollars(900_000) },
  ],
  { gross: 0.52, net: 0.3, withheld: 0.15, unallocated: 0.03 },
  { net: "Foreign investors, net of withholding" },
);

export const LEAKAGE_COLORS = {
  withheld: "var(--viz-withheld)",
  recoverable: "var(--viz-net)",
  trustee: "var(--viz-unallocated)",
} as const;

const leak = (label: string, withheld: number, recoverable = 0, trustee = 0): StackedRow => ({
  label,
  segments: [
    { key: "withheld", label: "Final withholding", value: withheld },
    { key: "recoverable", label: "Withholding holders can recover", value: recoverable },
    { key: "trustee", label: "Tax paid by the trustee", value: trustee },
  ],
});

export const FIXTURE_LEAKAGE: StackedRow[] = [
  leak("Harbourline Office Trust", 2.7),
  leak("Southbank Industrial Partners Fund", 8.2),
  leak("Wattle Retail Property Trust", 2.1),
  leak("Kurrajong Stapled Property Trust", 4.2),
  leak("Coastline Healthcare Property Fund", 3.0),
  leak("Telok Ayer Commercial REIT", 1.4, 1.5),
  leak("Loyang Logistics REIT", 3.8, 0, 0.3),
  leak("Meranti Digital Infrastructure REIT", 3.8, 1.5, 0.6),
  leak("Kallang Riverside Retail REIT", 1.5, 0.8, 3.1),
];

export const MIX_COLORS = {
  gross: "var(--viz-gross)",
  net: "var(--viz-net)",
  withheld: "var(--viz-withheld)",
  unallocated: "var(--viz-unallocated)",
} as const;

const mix = (label: string, gross: number, net: number, withheld: number, unallocated = 0): StackedRow => ({
  label,
  segments: [
    { key: "gross", label: "Australian residents", value: gross },
    { key: "net", label: "Foreign investors, net", value: net },
    { key: "withheld", label: "Withheld for the ATO", value: withheld },
    { key: "unallocated", label: "Units not on register", value: unallocated },
  ],
});

export const FIXTURE_MIX: StackedRow[] = [
  mix("Harbourline Office Trust", 50.0, 34.1, 14.2, 1.7),
  mix("Southbank Industrial Partners Fund", 31.2, 47.5, 19.8, 1.5),
  mix("Wattle Retail Property Trust", 72.4, 20.2, 7.4),
];

// ---------------------------------------------------------------------------------------------------- documents
export const FIXTURE_DOC: DocModel = {
  fileName: "harbourline-office-trust-amit-member-annual-statement.pdf",
  title: "AMIT member annual statement",
  subtitle: "Harbourline Office Trust",
  meta: [
    { label: "Income year", value: "Year ended 30 Jun 2026" },
    { label: "Member", value: "Sakuragawa Life Assurance" },
    { label: "Units held", value: "12,400,000" },
    { label: "Issued", value: "12 Sep 2026" },
  ],
  blocks: [
    { kind: "heading", text: "Your share of the trust's components" },
    {
      kind: "paragraph",
      text: "The amounts below are the components of your distribution for the income year, attributed to you under the trust's constitution.",
    },
    {
      kind: "table",
      title: "Components",
      columns: [
        { key: "component", label: "Component" },
        { key: "cash", label: "Cash distribution", align: "right" },
        { key: "attributed", label: "Attributed", align: "right" },
        { key: "withheld", label: "Tax withheld", align: "right" },
      ],
      rows: [
        { component: "Australian other income", cash: "A$421,880.00", attributed: "A$421,880.00", withheld: "A$63,282.00" },
        { component: "Interest", cash: "A$21,310.00", attributed: "A$21,310.00", withheld: "A$2,131.00" },
        { component: "Clean building income", cash: "A$96,400.00", attributed: "A$96,400.00", withheld: "A$9,640.00" },
        { component: "Discount gain (after discount)", cash: "A$14,720.00", attributed: "A$14,720.00", withheld: "A$2,208.00" },
      ],
      totalRow: { component: "Total", cash: "A$554,310.00", attributed: "A$554,310.00", withheld: "A$77,261.00" },
    },
    {
      kind: "kv",
      title: "Withholding summary",
      rows: [
        { label: "Fund payment amount", value: "A$432,800.00" },
        { label: "Tax withheld at 15%", value: "A$64,920.00" },
        { label: "Tax withheld at 10%", value: "A$12,341.00" },
        { label: "Total tax withheld", value: "A$77,261.00", emphasis: true },
      ],
    },
    { kind: "heading", text: "Cost base", level: 3 },
    {
      kind: "list",
      items: ["Cost base reduction: A$0.00 (no excess of cash over attributed amounts).", "Cost base increase: A$12,400.00 (attributed amounts exceed the cash)."],
    },
    { kind: "paragraph", text: "Keep this statement with your records. It is not a notice of assessment.", tone: "note" },
  ],
  footnotes: ["Amounts are in Australian dollars (AUD).", "Rates assume the holder is a foreign resident in an information-exchange country."],
};

type WideAmounts = [aCash: number, aAttributed: number, bCash: number, bAttributed: number];

const wideCells = ([aCash, aAttributed, bCash, bAttributed]: WideAmounts): Record<string, string> => {
  const A = (dollars: number): string => money(dollars * 100, "AUD", 2);
  const aWithheld = (aAttributed * 15) / 100;
  const bWithheld = (bAttributed * 15) / 100;
  return {
    aCash: A(aCash),
    aAttributed: A(aAttributed),
    aWithheld: A(aWithheld),
    bCash: A(bCash),
    bAttributed: A(bAttributed),
    bWithheld: A(bWithheld),
    cash: A(aCash + bCash),
    attributed: A(aAttributed + bAttributed),
    withheld: A(aWithheld + bWithheld),
  };
};

// Every amount is a multiple of $20, so 15% withholding is exact and the total row adds up.
const WIDE_ROWS: Array<[component: string, amounts: WideAmounts]> = [
  ["Australian other income", [421_880, 421_880, 188_420, 188_420]],
  ["Interest", [21_300, 21_300, 9_640, 9_640]],
  ["Clean building income", [96_400, 96_400, 41_200, 41_200]],
  ["Discount gain (after discount)", [14_720, 14_720, 6_300, 6_300]],
  ["Non-concessional MIT income the trustee elected to exclude from withholding for the income year", [8_900, 8_900, 3_100, 3_100]],
];
const WIDE_TOTAL = WIDE_ROWS.reduce<WideAmounts>(
  (sum, [, amounts]) => [sum[0] + amounts[0], sum[1] + amounts[1], sum[2] + amounts[2], sum[3] + amounts[3]],
  [0, 0, 0, 0],
);
const WIDE_CASH = money((WIDE_TOTAL[0] + WIDE_TOTAL[2]) * 100, "AUD", 2);

/**
 * A statement built to stress the layout: a ten-column table far wider than a phone, a long unbroken reference in the header, long key-value
 * labels and a URL in a paragraph. The table must scroll inside the document and the page must never widen.
 */
export const FIXTURE_DOC_WIDE: DocModel = {
  fileName: "southbank-industrial-partners-fund-class-a-class-b-schedule.pdf",
  title: "Components by unit class",
  subtitle: "Southbank Industrial Partners Fund",
  meta: [
    { label: "Income year", value: "Year ended 30 Jun 2026" },
    { label: "Reference", value: "SIPF-2026-AMMA-CLASS-A-CLASS-B-RECONCILIATION-0000000000000001-REV-3" },
    { label: "Unit classes", value: "Class A, Class B" },
  ],
  blocks: [
    {
      kind: "paragraph",
      text: "This schedule supersedes the draft issued on 4 September 2026 (https://example.invalid/statements/southbank/2026/class-a-class-b/reconciliation/0000000000000001).",
    },
    {
      kind: "table",
      title: "Components by unit class",
      columns: [
        { key: "component", label: "Component" },
        { key: "aCash", label: "Class A cash", align: "right" },
        { key: "aAttributed", label: "Class A attributed", align: "right" },
        { key: "aWithheld", label: "Class A tax withheld", align: "right" },
        { key: "bCash", label: "Class B cash", align: "right" },
        { key: "bAttributed", label: "Class B attributed", align: "right" },
        { key: "bWithheld", label: "Class B tax withheld", align: "right" },
        { key: "cash", label: "Total cash", align: "right" },
        { key: "attributed", label: "Total attributed", align: "right" },
        { key: "withheld", label: "Total tax withheld", align: "right" },
      ],
      rows: WIDE_ROWS.map(([component, amounts]) => ({ component, ...wideCells(amounts) })),
      totalRow: { component: "Total", ...wideCells(WIDE_TOTAL) },
    },
    {
      kind: "kv",
      title: "Reconciliation to the trustee resolution",
      rows: [
        { label: "Distribution declared in the trustee resolution of 28 June 2026, as amended on 14 July 2026", value: WIDE_CASH },
        { label: "Less: amounts retained by the trustee under clause 14.3 of the constitution", value: money(0, "AUD", 2) },
        { label: "Cash paid to members", value: WIDE_CASH, emphasis: true },
      ],
    },
  ],
  footnotes: ["Withholding is 15% of each attributed amount for foreign residents in information-exchange countries."],
};
// ---------------------------------------------------------------------------------------------------- table
export interface FixtureTableRow {
  fund: string;
  detail: string;
  distribution: string;
  withheld: string;
  leakage: string;
}

export const FIXTURE_TABLE: FixtureTableRow[] = [
  { fund: "Harbourline Office Trust", detail: "Office · Year ended 30 Jun 2026", distribution: "A$92,446,000", withheld: "A$2,504,486", leakage: "2.7%" },
  { fund: "Southbank Industrial Partners Fund", detail: "Industrial · Year ended 30 Jun 2026", distribution: "A$47,212,000", withheld: "A$3,892,099", leakage: "8.2%" },
  { fund: "Wattle Retail Property Trust", detail: "Retail · Year ended 30 Jun 2026", distribution: "A$129,688,000", withheld: "A$2,742,646", leakage: "2.1%" },
];
