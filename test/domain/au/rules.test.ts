import assert from "node:assert/strict";
import { test } from "node:test";
import { auModule } from "../../../src/domain/au/index.ts";
import type { RuleRow } from "../../../src/domain/types.ts";
import { AU_ALL_RULES } from "../../../src/engine/au/registry.ts";
import { AU_IDS, auFund, freshData, NOW } from "./helpers.ts";

const MIT_WHT = "Income Tax (Managed Investment Trust Withholding Tax) Act 2008 s4";
const BTR_ENGINE_RULE = "au-members.mit-foreign-member-withholding.2008-plus";

const ITEM = {
  eoi: "Fund payment — address in an information exchange (EOI) country",
  clean: "Clean building MIT fund payment — EOI country",
  buildToRent: "Build-to-rent MIT fund payment — EOI country",
  ncmi: "Non-concessional MIT income (NCMI)",
  excluded: "Cross-staple rent excluded from NCMI under the transitional rules (pre-27 March 2018 arrangements)",
  nonEoi: "Fund payment — address outside EOI countries",
  interest: "Interest paid to foreign residents",
} as const;

const EXPECTED_ROWS: RuleRow[] = [
  { item: ITEM.eoi, treatment: "15% final withholding", basis: MIT_WHT },
  { item: ITEM.clean, treatment: "10%", basis: MIT_WHT },
  {
    item: ITEM.buildToRent,
    treatment: "15% on eligible build-to-rent fund payments from 1 January 2025 (30% outside EOI countries)",
    basis: `ATO, Build to rent development tax incentives; engine rule ${BTR_ENGINE_RULE}`,
  },
  { item: ITEM.ncmi, treatment: "30%", basis: MIT_WHT },
  {
    item: ITEM.excluded,
    treatment:
      "15% for EOI countries; for a facility already in use, the relief applies to amounts derived before 1 July 2026 (non-economic infrastructure) or before 1 July 2034 (economic infrastructure)",
    basis: `LCR 2020/2 para 251; TAA 1953 Sch 1 s12-440; ${MIT_WHT}`,
  },
  { item: ITEM.nonEoi, treatment: "30%", basis: MIT_WHT },
  { item: "Discounted TARP capital gains in the fund payment", treatment: "Grossed up (doubled)", basis: "TAA 1953 Sch 1 s12A-110" },
  { item: ITEM.interest, treatment: "10% withholding", basis: "ITAA 1936 s128B" },
  {
    item: "AMIT cost base net amount",
    treatment: "Cash less attributed amounts and AMIT CGT gross-up amount; excess decreases, shortfall increases cost base",
    basis: "ITAA 1997 Subdiv 104-E (CGT event E10)",
  },
  { item: "AMMA statements", treatment: "Within 3 months after the end of the income year", basis: "ITAA 1997 Div 276" },
  { item: "Fund payment notice", treatment: "Given, or published on the fund's website, at or before each payment", basis: "TAA 1953 Sch 1 Subdiv 12-H and 12A-B" },
  { item: "Annual investment income report (AIIR)", treatment: "By 31 October after the financial year", basis: "TAA 1953 Sch 1 Div 393" },
  {
    item: "Annual report of amounts withheld from fund payments",
    treatment: "Within 6 months and 14 days after the income year (14 January for a 30 June year)",
    basis: "TAA 1953 Sch 1 s16-153(4) and (4A)",
  },
];

test("the Rules tab for the 2025–26 income year lists the thirteen rules the module applies", () => {
  const data = freshData();
  for (const id of AU_IDS) {
    const table = auModule.rules(auFund(data, id));
    assert.equal(table.title, "Rules applied to Australian AMITs for the 2025–26 income year.", id);
    assert.deepEqual(table.rows, EXPECTED_ROWS, id);
  }
});

test("the income year in the title follows the fund's year end", () => {
  const data = freshData();
  const fund = auFund(data, "harbourline");
  const titleFor = (periodEnd: string): string => auModule.rules({ ...fund, periodEnd }).title;
  assert.equal(titleFor("2026-06-30"), "Rules applied to Australian AMITs for the 2025–26 income year.");
  assert.equal(titleFor("2026-09-30"), "Rules applied to Australian AMITs for the 2025–26 income year.", "a substituted accounting period is part of the same income year");
  assert.equal(titleFor("2027-06-30"), "Rules applied to Australian AMITs for the 2026–27 income year.");
  assert.equal(titleFor("2025-06-30"), "Rules applied to Australian AMITs for the 2024–25 income year.");
  assert.equal(titleFor("2099-06-30"), "Rules applied to Australian AMITs for the 2098–99 income year.");
  assert.equal(titleFor("2100-06-30"), "Rules applied to Australian AMITs for the 2099–00 income year.", "the ATO's style across a century");
});

test("every rule has an item, a treatment and a statutory source", () => {
  const table = auModule.rules(auFund(freshData(), "wattle"));
  assert.equal(new Set(table.rows.map((r) => r.item)).size, table.rows.length, "items are unique");
  for (const row of table.rows) {
    assert.ok(row.item.length > 0 && row.treatment.length > 0 && row.basis.length > 0, row.item);
    for (const text of [row.item, row.treatment, row.basis]) {
      assert.ok(!/undefined|NaN|\s{2,}|^\s|\s$/.test(text), `${row.item}: "${text}"`);
    }
  }
});

// The stated rates are the rates the calculation applies, row for row.
const percent = (treatment: string): number => {
  const match = /^(\d+(?:\.\d+)?)%/.exec(treatment);
  assert.ok(match, treatment);
  return Number(match[1]) / 100;
};

test("the rates the Rules tab states are the rates the calculation applies to each investor", () => {
  const data = freshData();
  data.funds.forEach((f) => {
    if (f.market === "AU" && f.id === "harbourline") f.inputs.excludedNcmi = 100_000_00;
  });
  const harbourline = auFund(data, "harbourline");
  const rows = auModule.rules(harbourline).rows;
  const rate = (item: string): number => {
    const row = rows.find((r) => r.item === item);
    assert.ok(row, item);
    return percent(row.treatment);
  };
  // component -> the row that states its rate, for an EOI address and for a non-EOI address
  const eoiRow: Record<string, string> = {
    ausOtherIncome: ITEM.eoi,
    cleanBuilding: ITEM.clean,
    ncmi: ITEM.ncmi,
    excludedNcmi: ITEM.excluded,
    discountGainTarp: ITEM.eoi,
    cgtConcessionTarp: ITEM.eoi,
    otherGainTarp: ITEM.eoi,
    interest: ITEM.interest,
  };
  const nonEoiRow: Record<string, string> = {
    ausOtherIncome: ITEM.nonEoi,
    cleanBuilding: ITEM.nonEoi,
    ncmi: ITEM.nonEoi,
    excludedNcmi: ITEM.nonEoi,
    discountGainTarp: ITEM.nonEoi,
    cgtConcessionTarp: ITEM.nonEoi,
    otherGainTarp: ITEM.nonEoi,
    interest: ITEM.interest,
  };

  let checked = 0;
  for (const id of AU_IDS) {
    const fund = id === "harbourline" ? harbourline : auFund(data, id);
    const calc = auModule.fundCalc(data, fund, NOW);
    for (const h of calc.holders) {
      const foreign = h.statusLabel.startsWith("Foreign");
      const eoi = h.statusLabel === "Foreign resident — EOI country";
      for (const l of h.lines) {
        if (l.amount === 0 || !(l.key in eoiRow)) continue;
        const expected = !foreign ? 0 : rate(eoi ? eoiRow[l.key] : nonEoiRow[l.key]);
        assert.equal(l.rate, expected, `${id} ${h.holder.holder} ${l.key}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 80, `${checked} lines checked`);
  const eoiLine = auModule.fundCalc(data, harbourline, NOW).holders.find((h) => h.holder.id === "h-hl-3")?.lines.find((l) => l.key === "excludedNcmi");
  assert.equal(eoiLine?.rate, 0.15, "excluded NCMI for an EOI address (the row's 15%)");
  const nonEoiLine = auModule.fundCalc(data, harbourline, NOW).holders.find((h) => h.holder.id === "h-hl-5")?.lines.find((l) => l.key === "excludedNcmi");
  assert.equal(nonEoiLine?.rate, 0.3);
});

test("the table is a copy: changing a result does not change the next one", () => {
  const fund = auFund(freshData(), "harbourline");
  const first = auModule.rules(fund);
  first.rows[0].treatment = "changed";
  first.rows.pop();
  first.title = "changed";
  assert.deepEqual(auModule.rules(fund).rows, EXPECTED_ROWS);
  assert.equal(auModule.rules(fund).title, "Rules applied to Australian AMITs for the 2025–26 income year.");
});

test("a fund from another market is refused", () => {
  const data = freshData();
  const sg = data.funds.find((f) => f.market !== "AU");
  assert.ok(sg);
  assert.throws(() => auModule.rules(sg), /not an Australian fund/);
});

test("the transitional row states both end dates and cites LCR 2020/2 (the engine's rules docs carry neither date)", () => {
  const rows = auModule.rules(auFund(freshData(), "coastline")).rows;
  const row = rows.find((r) => r.item === ITEM.excluded);
  assert.ok(row);
  assert.match(row.treatment, /before 1 July 2026 \(non-economic infrastructure\)/);
  assert.match(row.treatment, /before 1 July 2034 \(economic infrastructure\)/);
  assert.ok(row.treatment.indexOf("2026") < row.treatment.indexOf("2034"));
  assert.ok(!/30 June 2026|relief ends/.test(row.treatment), "the single-date wording is gone");
  assert.ok(row.basis.startsWith("LCR 2020/2 para 251"), row.basis);
  assert.ok(row.basis.includes("TAA 1953 Sch 1 s12-440"), row.basis);
});

// The concession is the engine's: 15% on an eligible build-to-rent fund payment to an EOI-country member from 1 January 2025.
// The engine encodes it in src/engine/au/members.ts (BTR_WITHHOLDING_RATES), under this rule id.
test("the build-to-rent row states the engine's rate and start date and cites the engine rule and the ATO page it cites", () => {
  const rule = AU_ALL_RULES.find((r) => r.id === BTR_ENGINE_RULE);
  assert.ok(rule, "the engine rule exists");
  assert.match(rule.summary, /15% for eligible build-to-rent fund payments from 1 January 2025/);
  assert.ok(
    rule.sources.some((s) => s.title === "ATO | Build to rent development tax incentives" && s.url.includes("build-to-rent-development-tax-incentives")),
    "the engine rule cites the ATO's build to rent page",
  );

  const row = auModule.rules(auFund(freshData(), "harbourline")).rows.find((r) => r.item === ITEM.buildToRent);
  assert.ok(row);
  assert.equal(row.treatment, "15% on eligible build-to-rent fund payments from 1 January 2025 (30% outside EOI countries)");
  assert.equal(row.basis, `ATO, Build to rent development tax incentives; engine rule ${rule.id}`);
  assert.equal(percent(row.treatment), 0.15);
});

test("the build-to-rent row appears only once the engine has the rate: a year ending on or after 1 January 2025", () => {
  const fund = auFund(freshData(), "harbourline");
  const itemsFor = (periodEnd: string): string[] => auModule.rules({ ...fund, periodEnd }).rows.map((r) => r.item);
  for (const periodEnd of ["2024-06-30", "2024-12-31"]) {
    assert.ok(!itemsFor(periodEnd).includes(ITEM.buildToRent), periodEnd);
    assert.equal(itemsFor(periodEnd).length, 12, periodEnd);
  }
  for (const periodEnd of ["2025-01-01", "2025-06-30", "2026-06-30", "2026-09-30", "2027-06-30"]) {
    assert.equal(itemsFor(periodEnd).indexOf(ITEM.buildToRent), 2, periodEnd);
    assert.equal(itemsFor(periodEnd).length, 13, periodEnd);
  }
});
