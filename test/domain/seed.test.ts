// Seed dataset tests: record counts, referential integrity, integer cents, independent copies and golden values taken from the
// reference app's rendered screens (a golden amount is the displayed currency amount x 100; units are whole units).
import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultUi, seedData } from "../../src/domain/seed/index.ts";
import { STATE_VERSION, UNMAPPED_CATEGORY } from "../../src/domain/types.ts";
import type { AppData, AuFund, Fund, SgFund, TbRow, UiState } from "../../src/domain/types.ts";

const FUND_IDS = ["harbourline", "southbank", "wattle", "kurrajong", "coastline", "telok-ayer", "loyang", "meranti", "kallang"];
const AU_IDS = FUND_IDS.slice(0, 5);
const SG_IDS = FUND_IDS.slice(5);

// Read-only in the tests below; the tests that mutate call seedData() themselves.
const seed: AppData = seedData();

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);
const idsOf = (items: { id: string }[]): string[] => items.map((item) => item.id);
const rowsOf = (fundId: string): TbRow[] => seed.tbRows.filter((row) => row.fundId === fundId);
const holdersOf = (fundId: string) => seed.holders.filter((holder) => holder.fundId === fundId);
const propertiesOf = (fundId: string) => seed.properties.filter((property) => property.fundId === fundId);

function fundOf(data: AppData, id: string): Fund {
  const fund = data.funds.find((candidate) => candidate.id === id);
  assert.ok(fund, `fund ${id} exists`);
  return fund;
}
function auFund(data: AppData, id: string): AuFund {
  const fund = fundOf(data, id);
  assert.equal(fund.market, "AU", `${id} is an AU fund`);
  return fund as AuFund;
}
function sgFund(data: AppData, id: string): SgFund {
  const fund = fundOf(data, id);
  assert.equal(fund.market, "SG", `${id} is an SG fund`);
  return fund as SgFund;
}
/** The cash the fund distributes, as the Analytics screen shows it (AU: cash distribution; SG: taxable + tax-exempt + capital). */
function distributionCash(fund: Fund): number {
  return fund.market === "AU" ? fund.inputs.cashDistribution : fund.inputs.taxableDistributed + fund.inputs.taxExemptDistribution + fund.inputs.capitalDistribution;
}

function visitNumbers(value: unknown, path: string, onNumber: (value: number, path: string) => void): void {
  if (typeof value === "number") onNumber(value, path);
  else if (Array.isArray(value)) value.forEach((item, index) => visitNumbers(item, `${path}[${index}]`, onNumber));
  else if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) visitNumbers(child, `${path}.${key}`, onNumber);
}
function collectObjects(value: unknown, into: Set<object>): Set<object> {
  if (value !== null && typeof value === "object") {
    into.add(value);
    for (const child of Object.values(value)) collectObjects(child, into);
  }
  return into;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMonth = (iso: string): string => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const dayMonthYear = (iso: string): string => `${dayMonth(iso)} ${iso.slice(0, 4)}`;

// ------------------------------------------------------------------------------------------------ shape, counts, order
test("seed has the contract shape and the documented record counts", () => {
  assert.equal(seed.version, STATE_VERSION);
  assert.deepEqual(
    Object.keys(seed).sort(),
    ["adjustmentDefs", "approvals", "assets", "audit", "auNotices", "funds", "gstFilings", "gstLedger", "holders", "lodgments", "manualAdjustments", "obligations", "properties", "propertyProfiles", "queries", "sgLedger", "sgNotices", "taxAdjustments", "tbCategories", "tbRows", "unitCostBase", "users", "version", "versions"].sort(),
  );
  assert.deepEqual(
    {
      funds: seed.funds.length,
      holders: seed.holders.length,
      tbRows: seed.tbRows.length,
      properties: seed.properties.length,
      auNotices: seed.auNotices.length,
      sgNotices: seed.sgNotices.length,
      queries: seed.queries.length,
      audit: seed.audit.length,
      approvals: seed.approvals.length,
      lodgments: seed.lodgments.length,
      users: seed.users.length,
    },
    { funds: 9, holders: 42, tbRows: 149, properties: 28, auNotices: 18, sgNotices: 4, queries: 4, audit: 27, approvals: 5, lodgments: 2, users: 8 },
  );
  assert.deepEqual(idsOf(seed.funds), FUND_IDS);
  assert.deepEqual(seed.funds.map((fund) => fund.market), [...AU_IDS.map(() => "AU"), ...SG_IDS.map(() => "SG")]);
  assert.deepEqual(Object.keys(seed.tbCategories).sort(), ["AU", "SG"]);
  assert.deepEqual(Object.keys(seed.adjustmentDefs).sort(), ["AU", "SG"]);
});

test("AU funds are AMIT/AUD and SG funds are S-REIT/SGD for YA2027, each with exactly its market's input fields", () => {
  const auInputs = ["ausOtherIncome", "cashDistribution", "cleanBuilding", "discountGainTarp", "excludedNcmi", "foreignIncome", "interest", "ncmi", "otherGainTarp"];
  const sgInputs = ["capitalDistribution", "taxExemptDistribution", "taxableDistributed", "taxableSpecifiedIncome"];
  for (const fund of seed.funds) {
    if (fund.market === "AU") {
      assert.equal(fund.regime, "AMIT", fund.id);
      assert.equal(fund.currency, "AUD", fund.id);
      assert.equal("assessmentYear" in fund, false, `${fund.id} has no assessment year`);
      assert.deepEqual(Object.keys(fund.inputs).sort(), auInputs, fund.id);
    } else {
      assert.equal(fund.regime, "S-REIT", fund.id);
      assert.equal(fund.currency, "SGD", fund.id);
      assert.equal(fund.assessmentYear, 2027, fund.id);
      assert.deepEqual(Object.keys(fund.inputs).sort(), sgInputs, fund.id);
    }
  }
});

const FUND_TABLE = [
  { id: "harbourline", name: "Harbourline Office Trust", sector: "Office", listed: true, status: "Signed off", governance: "agent-signs-off", periodLabel: "Income year ended 30 Jun 2026", periodStart: "2025-07-01", periodEnd: "2026-06-30", unitsOnIssue: 1412680000, whtRemitted: 250448636 },
  { id: "southbank", name: "Southbank Industrial Partners Fund", sector: "Logistics", listed: false, status: "In review", governance: "agent-lodges", periodLabel: "Income year ended 30 Jun 2026", periodStart: "2025-07-01", periodEnd: "2026-06-30", unitsOnIssue: 684215000, whtRemitted: 241009925 },
  { id: "wattle", name: "Wattle Retail Property Trust", sector: "Retail", listed: true, status: "Signed off", governance: "no-agent", periodLabel: "Income year ended 30 Jun 2026", periodStart: "2025-07-01", periodEnd: "2026-06-30", unitsOnIssue: 2105330000, whtRemitted: 274264560 },
  { id: "kurrajong", name: "Kurrajong Stapled Property Trust", sector: "Diversified, stapled", listed: true, status: "In review", governance: "agent-lodges", periodLabel: "Income year ended 30 Jun 2026", periodStart: "2025-07-01", periodEnd: "2026-06-30", unitsOnIssue: 951400000, whtRemitted: 209240269 },
  { id: "coastline", name: "Coastline Healthcare Property Fund", sector: "Healthcare", listed: false, status: "Preparing", governance: "no-agent", periodLabel: "Income year ended 30 Sep 2026", periodStart: "2025-10-01", periodEnd: "2026-09-30", unitsOnIssue: 318940000, whtRemitted: null },
  { id: "telok-ayer", name: "Telok Ayer Commercial REIT", sector: "Office & retail", listed: true, status: "Preparing", governance: "agent-signs-off", periodLabel: "Distribution period 1 Jul – 30 Sep 2026", periodStart: "2026-07-01", periodEnd: "2026-09-30", unitsOnIssue: 4236180000, whtRemitted: null },
  { id: "loyang", name: "Loyang Logistics REIT", sector: "Logistics", listed: true, status: "Signed off", governance: "no-agent", periodLabel: "Distribution period 1 Jan – 30 Jun 2026", periodStart: "2026-01-01", periodEnd: "2026-06-30", unitsOnIssue: 2871050000, whtRemitted: 279264400 },
  { id: "meranti", name: "Meranti Digital Infrastructure REIT", sector: "Data centres", listed: true, status: "In review", governance: "agent-lodges", periodLabel: "Distribution period 1 Jul – 30 Sep 2026", periodStart: "2026-07-01", periodEnd: "2026-09-30", unitsOnIssue: 1588920000, whtRemitted: null },
  { id: "kallang", name: "Kallang Riverside Retail REIT", sector: "Retail", listed: true, status: "Preparing", governance: "no-agent", periodLabel: "Distribution period 1 Jul – 30 Sep 2026", periodStart: "2026-07-01", periodEnd: "2026-09-30", unitsOnIssue: 3402760000, whtRemitted: null },
];

test("fund headers (status, governance, period, units, withholding remitted) match the reference", () => {
  assert.deepEqual(
    seed.funds.map(({ id, name, sector, listed, status, governance, periodLabel, periodStart, periodEnd, unitsOnIssue, whtRemitted }) => ({
      id, name, sector, listed, status, governance, periodLabel, periodStart, periodEnd, unitsOnIssue, whtRemitted,
    })),
    FUND_TABLE,
  );
});

test("period labels agree with the period dates; an AU year starts the day after the prior year end", () => {
  for (const fund of seed.funds) {
    assert.ok(fund.periodStart < fund.periodEnd, `${fund.id}: start before end`);
    if (fund.market === "AU") {
      const end = new Date(`${fund.periodEnd}T00:00:00Z`);
      const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), end.getUTCDate() + 1));
      assert.equal(fund.periodStart, start.toISOString().slice(0, 10), `${fund.id}: AU period start`);
      assert.equal(fund.periodLabel, `Income year ended ${dayMonthYear(fund.periodEnd)}`, fund.id);
    } else {
      assert.equal(fund.periodLabel, `Distribution period ${dayMonth(fund.periodStart)} – ${dayMonthYear(fund.periodEnd)}`, fund.id);
    }
  }
});

// ------------------------------------------------------------------------------------------------ referential integrity
test("ids are unique within every collection and trial balance ids follow tb-<fund>-<account>", () => {
  const collections: Array<[string, { id: string }[]]> = [
    ["funds", seed.funds],
    ["holders", seed.holders],
    ["tbRows", seed.tbRows],
    ["properties", seed.properties],
    ["auNotices", seed.auNotices],
    ["sgNotices", seed.sgNotices],
    ["queries", seed.queries],
    ["audit", seed.audit],
    ["users", seed.users],
  ];
  for (const [name, items] of collections) assert.equal(new Set(idsOf(items)).size, items.length, `${name}: ids are unique`);
  for (const row of seed.tbRows) assert.equal(row.id, `tb-${row.fundId}-${row.account}`);
});

test("every record points at an existing fund, and notices sit on a fund of the right market", () => {
  const known = new Set(FUND_IDS);
  const collections: Array<[string, { fundId: string }[]]> = [
    ["holders", seed.holders],
    ["tbRows", seed.tbRows],
    ["properties", seed.properties],
    ["auNotices", seed.auNotices],
    ["sgNotices", seed.sgNotices],
    ["queries", seed.queries],
    ["audit", seed.audit],
    ["approvals", seed.approvals],
    ["lodgments", seed.lodgments],
  ];
  for (const [name, items] of collections) for (const item of items) assert.ok(known.has(item.fundId), `${name}: unknown fund ${item.fundId}`);
  for (const notice of seed.auNotices) assert.equal(fundOf(seed, notice.fundId).market, "AU", notice.id);
  for (const notice of seed.sgNotices) assert.equal(fundOf(seed, notice.fundId).market, "SG", notice.id);
  for (const user of seed.users) if (user.funds !== "all") for (const id of user.funds) assert.ok(known.has(id), `${user.id}: unknown fund ${id}`);
  assert.deepEqual(Object.keys(seed.taxAdjustments).sort(), [...FUND_IDS].sort());
  assert.deepEqual(Object.keys(seed.unitCostBase).sort(), [...FUND_IDS].sort());
  assert.deepEqual(Object.keys(seed.sgLedger).sort(), [...SG_IDS].sort());
});

test("every trial balance row uses a category of its market or the reserved unmapped id", () => {
  for (const row of seed.tbRows) {
    const allowed = idsOf(seed.tbCategories[fundOf(seed, row.fundId).market]);
    assert.ok(row.category === UNMAPPED_CATEGORY || allowed.includes(row.category), `${row.id}: ${row.category}`);
  }
  assert.equal(idsOf(seed.tbCategories.AU).includes(UNMAPPED_CATEGORY), false);
  assert.equal(idsOf(seed.tbCategories.SG).includes(UNMAPPED_CATEGORY), false);
});

test("each holder carries the status (AU) or class (SG) of its fund's market", () => {
  const auStatuses = ["resident", "foreign-eoi", "foreign-non-eoi"];
  const sgClasses = ["individual", "qualifying", "nrni", "nr-fund", "other"];
  for (const holder of seed.holders) {
    if (fundOf(seed, holder.fundId).market === "AU") {
      assert.ok("auStatus" in holder && auStatuses.includes(holder.auStatus), `${holder.id}: AU status`);
      assert.equal("sgClass" in holder, false, `${holder.id}: no SG class on an AU holder`);
    } else {
      assert.ok("sgClass" in holder && sgClasses.includes(holder.sgClass), `${holder.id}: SG class`);
      assert.equal("auStatus" in holder, false, `${holder.id}: no AU status on an SG holder`);
    }
    assert.ok(holder.units > 0 && holder.holder.length > 0 && holder.country.length > 0, holder.id);
  }
});

test("unit cost base covers exactly the holders of each fund; tax adjustments follow the market's definitions", () => {
  for (const fund of seed.funds) {
    assert.deepEqual(Object.keys(seed.unitCostBase[fund.id].opening).sort(), idsOf(holdersOf(fund.id)).sort(), `${fund.id}: opening cost base per holder`);
    assert.deepEqual(Object.keys(seed.taxAdjustments[fund.id]), seed.adjustmentDefs[fund.market].map((def) => def.key), `${fund.id}: adjustment keys`);
  }
  assert.deepEqual(seed.adjustmentDefs.AU.map((def) => def.key), ["div40", "div43", "tarpDiscountGross", "tarpOther"]);
  assert.deepEqual(seed.adjustmentDefs.SG.map((def) => def.key), ["capitalAllowances"]);
  for (const def of [...seed.adjustmentDefs.AU, ...seed.adjustmentDefs.SG]) assert.ok(def.label.length > 0 && def.help.length > 0, def.key);
});

test("people named in workflow records are seeded users", () => {
  const names = new Set(seed.users.map((user) => user.name));
  for (const entry of seed.audit) assert.ok(names.has(entry.actor), `audit ${entry.id}: ${entry.actor}`);
  for (const approval of seed.approvals) assert.ok(names.has(approval.by), `approval: ${approval.by}`);
  for (const lodgment of seed.lodgments) assert.ok(names.has(lodgment.actor), `lodgment: ${lodgment.actor}`);
  for (const query of seed.queries) {
    assert.ok(names.has(query.raisedBy), `${query.id}: ${query.raisedBy}`);
    for (const message of query.messages) assert.ok(names.has(message.by), `${query.id}: ${message.by}`);
  }
});

// ------------------------------------------------------------------------------------------------ numbers and copies
test("every number is a safe integer (cents or whole units), except the per-unit prices", () => {
  const offenders: string[] = [];
  let count = 0;
  visitNumbers(seed, "seed", (value, path) => {
    count++;
    if (/^seed\.unitCostBase\.[\w-]+\.unitPrice$/.test(path)) {
      if (!(value > 0 && value < 10)) offenders.push(`${path}=${value}`);
    } else if (!Number.isSafeInteger(value)) offenders.push(`${path}=${value}`);
  });
  assert.deepEqual(offenders, []);
  assert.ok(count >= 700, `walked ${count} numbers`);
});

test("amounts are held in cents, not currency units (scale checks)", () => {
  for (const fund of seed.funds) {
    const cash = distributionCash(fund);
    assert.ok(cash >= 1_000_000_000 && cash <= 100_000_000_000, `${fund.id}: distribution of ${cash} cents is between 10m and 1bn`);
  }
  for (const property of seed.properties) assert.ok(property.valuation >= 5_000_000_000 && property.valuation <= 1_000_000_000_000, `${property.id}: valuation ${property.valuation}`);
  assert.equal(fundOf(seed, "harbourline").unitsOnIssue, 1_412_680_000, "units stay whole units");
});

test("the seed round-trips through JSON unchanged (it is persisted as JSON)", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(seed)), seed);
});

test("seedData() returns an independent deep copy on every call", () => {
  const first = seedData();
  const second = seedData();
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), false);
  assert.equal(Object.isFrozen(first.funds), false);
  assert.equal(Object.isFrozen(first.funds[0]), false);
  const firstObjects = collectObjects(first, new Set());
  const secondObjects = [...collectObjects(second, new Set())];
  assert.ok(firstObjects.size >= 400, `walked ${firstObjects.size} objects`);
  assert.equal(secondObjects.filter((object) => firstObjects.has(object)).length, 0, "no object is shared between two calls");
});

test("mutating one seedData() result never leaks into the next call", () => {
  const pristine = seedData();
  const dirty = seedData();
  auFund(dirty, "harbourline").inputs.cashDistribution += 1;
  sgFund(dirty, "loyang").inputs.capitalDistribution = 0;
  dirty.funds.pop();
  dirty.holders[0].units = 0;
  dirty.tbRows[0].current += 1;
  dirty.tbCategories.AU.pop();
  dirty.adjustmentDefs.AU[0].label = "changed";
  dirty.taxAdjustments.harbourline.div40 = 0;
  dirty.properties[0].valuation = 0;
  dirty.unitCostBase.harbourline.opening["h-hl-1"] = 0;
  dirty.sgLedger.loyang.afterTax = 0;
  const notice = dirty.auNotices[0];
  if (notice.notified) notice.notified.other = 0;
  const sgNotified = dirty.sgNotices[1].notified;
  if (sgNotified) sgNotified.taxable = 0;
  dirty.queries[0].messages.push({ by: "x", at: "x", text: "x" });
  const lBrennan = dirty.users.find((user) => user.id === "l-brennan");
  if (lBrennan && Array.isArray(lBrennan.funds)) lBrennan.funds.push("kallang");
  dirty.audit.pop();
  dirty.approvals.length = 0;
  dirty.lodgments.length = 0;

  assert.notDeepEqual(dirty, pristine);
  assert.deepEqual(seedData(), pristine);
  assert.deepEqual(seed, pristine, "the module-level read-only copy is untouched");
});

test("defaultUi() starts as A. Moreno on all jurisdictions with Harbourline selected, and returns a fresh object", () => {
  const expected: UiState = { currentUserId: "a-moreno", jurisdiction: "all", selectedFundId: "harbourline" };
  const ui = defaultUi();
  assert.deepEqual(ui, expected);
  assert.ok(seed.users.some((user) => user.id === ui.currentUserId));
  assert.ok(seed.funds.some((fund) => fund.id === ui.selectedFundId));
  ui.selectedFundId = null;
  ui.jurisdiction = "SG";
  assert.deepEqual(defaultUi(), expected);
  assert.notEqual(defaultUi(), defaultUi());
});

// ------------------------------------------------------------------------------------------------ trial balance
test("trial balance: per-fund row counts, every fund balances to zero (current and prior), accounts are unique", () => {
  assert.deepEqual(FUND_IDS.map((id) => rowsOf(id).length), [17, 16, 16, 16, 17, 17, 17, 17, 16]);
  for (const id of FUND_IDS) {
    const rows = rowsOf(id);
    assert.equal(sum(rows.map((row) => row.current)), 0, `${id}: current sums to zero`);
    assert.equal(sum(rows.map((row) => row.prior)), 0, `${id}: prior sums to zero`);
    assert.equal(new Set(rows.map((row) => row.account)).size, rows.length, `${id}: unique accounts`);
    assert.ok(rows.every((row) => /^\d{4}$/.test(row.account) && row.name.length > 0), `${id}: account numbers and names`);
  }
});

test("trial balance: every fund's distribution account matches the fund's distribution", () => {
  for (const fund of seed.funds) {
    const distributions = rowsOf(fund.id).filter((row) => row.category === "distributions");
    assert.equal(sum(distributions.map((row) => row.current)), distributionCash(fund), `${fund.id}: distribution rows`);
  }
});

test("trial balance: the only unmapped account is Coastline 4510, whose missing prior year is seeded as zero", () => {
  const unmapped = seed.tbRows.filter((row) => row.category === UNMAPPED_CATEGORY);
  assert.deepEqual(unmapped, [{ id: "tb-coastline-4510", fundId: "coastline", account: "4510", name: "Make-good income received", category: "unmapped", current: -18643000, prior: 0 }]);
});

test("trial balance: rows per category match the reference accounts", () => {
  const countByCategory = (market: string): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const row of seed.tbRows) if (fundOf(seed, row.fundId).market === market) counts[row.category] = (counts[row.category] ?? 0) + 1;
    return counts;
  };
  assert.deepEqual(countByCategory("AU"), {
    "balance-sheet": 20, distributions: 5, rent: 10, "clean-building": 1, "interest-income": 5, "fair-value": 5, "straight-line": 5, "book-gain-sale": 3,
    "deductible-expense": 15, "depreciation-book": 5, "non-deductible": 5, "ncmi-rent": 1, "foreign-income": 1, unmapped: 1,
  });
  assert.deepEqual(countByCategory("SG"), {
    "balance-sheet": 16, distributions: 4, rent: 8, "interest-income": 4, "exempt-income": 2, "fair-value": 4, "straight-line": 4, "deductible-expense": 16,
    "depreciation-book": 4, "non-deductible": 4, "book-gain-sale": 1,
  });
  // The one-off categories sit where the reference puts them.
  const owner = (category: string): string[] => seed.tbRows.filter((row) => row.category === category).map((row) => row.fundId);
  assert.deepEqual(owner("ncmi-rent"), ["kurrajong"]);
  assert.deepEqual(owner("foreign-income"), ["coastline"]);
  assert.deepEqual(owner("clean-building"), ["harbourline"]);
  assert.deepEqual(owner("exempt-income"), ["telok-ayer", "meranti"]);
});

test("tbCategories: reference order per market with distributions and balance sheet last, unmapped excluded", () => {
  assert.deepEqual(idsOf(seed.tbCategories.AU), [
    "rent", "ncmi-rent", "ncmi-transitional", "clean-building", "interest-income", "foreign-income", "deductible-expense", "depreciation-book",
    "fair-value", "straight-line", "book-gain-sale", "non-deductible", "distributions", "balance-sheet",
  ]);
  assert.deepEqual(idsOf(seed.tbCategories.SG), [
    "rent", "interest-income", "exempt-income", "deductible-expense", "depreciation-book", "fair-value", "straight-line", "book-gain-sale",
    "non-deductible", "distributions", "balance-sheet",
  ]);
  for (const market of ["AU", "SG"] as const) {
    for (const category of seed.tbCategories[market]) assert.ok(category.label.trim() === category.label && category.label.length > 0 && category.treatment.length > 0, `${market} ${category.id}`);
    assert.equal(new Set(seed.tbCategories[market].map((category) => category.label)).size, seed.tbCategories[market].length, `${market}: labels are unique`);
  }
  // ncmi-transitional is offered in the AU select but no seeded account uses it.
  const used = (market: "AU" | "SG") => new Set(seed.tbRows.filter((row) => fundOf(seed, row.fundId).market === market).map((row) => row.category));
  assert.deepEqual(idsOf(seed.tbCategories.AU).filter((id) => !used("AU").has(id)), ["ncmi-transitional"]);
  assert.deepEqual(idsOf(seed.tbCategories.SG).filter((id) => !used("SG").has(id)), []);
});

test("tbCategories: labels and treatments are recorded exactly as the reference displays them, per market", () => {
  const byId = (market: "AU" | "SG", id: string) => seed.tbCategories[market].find((category) => category.id === id);
  assert.deepEqual(byId("AU", "rent"), { id: "rent", label: "Rental and property income", treatment: "Assessable — Australian income, other" });
  assert.deepEqual(byId("SG", "rent"), { id: "rent", label: "Rental and property income", treatment: "Specified income — taxable" });
  assert.deepEqual(byId("AU", "ncmi-rent"), { id: "ncmi-rent", label: "Cross-staple rent (NCMI)", treatment: "Assessable — non-concessional MIT income" });
  assert.deepEqual(byId("AU", "clean-building"), { id: "clean-building", label: "Clean building rental income", treatment: "Assessable — clean building MIT income" });
  assert.deepEqual(byId("AU", "depreciation-book"), { id: "depreciation-book", label: "Accounting depreciation", treatment: "Added back — replaced by Div 40 and Div 43" });
  assert.deepEqual(byId("SG", "depreciation-book"), { id: "depreciation-book", label: "Accounting depreciation", treatment: "Added back — replaced by capital allowances" });
  assert.deepEqual(byId("SG", "interest-income"), { id: "interest-income", label: "Interest income", treatment: "Ancillary specified income — taxable" });
  assert.deepEqual(byId("SG", "exempt-income"), { id: "exempt-income", label: "Tax-exempt income", treatment: "Not taxable — available for tax-exempt distributions" });
  assert.deepEqual(byId("AU", "book-gain-sale"), { id: "book-gain-sale", label: "Accounting gain on disposal", treatment: "Replaced by the tax capital gain" });
  assert.deepEqual(byId("SG", "book-gain-sale"), { id: "book-gain-sale", label: "Accounting gain on disposal", treatment: "Capital — not taxable" });
  assert.deepEqual(byId("AU", "balance-sheet"), { id: "balance-sheet", label: "Balance sheet", treatment: "Not part of taxable income" });
  assert.equal(byId("AU", "exempt-income"), undefined, "tax-exempt income is a Singapore category");
});

// ------------------------------------------------------------------------------------------------ properties, holders
test("property valuations add up to the investment properties account (1100) for every fund", () => {
  assert.deepEqual(FUND_IDS.map((id) => propertiesOf(id).length), [3, 3, 4, 3, 3, 3, 4, 2, 3]);
  for (const id of FUND_IDS) {
    const account = rowsOf(id).find((row) => row.account === "1100");
    assert.ok(account, `${id}: account 1100 exists`);
    assert.equal(account.category, "balance-sheet");
    assert.equal(sum(propertiesOf(id).map((property) => property.valuation)), Math.abs(account.current), `${id}: valuations vs account 1100`);
  }
});

test("properties are well formed: fund-prefixed ids, acquired before period end, no negative tax cost base, Div 43 only in Australia", () => {
  for (const property of seed.properties) {
    const fund = fundOf(seed, property.fundId);
    assert.ok(property.id.startsWith(`${fund.id}-`), property.id);
    assert.ok(property.acquired <= fund.periodEnd, `${property.id}: acquired ${property.acquired}`);
    assert.ok(property.cost > 0 && property.improvements >= 0 && property.capitalWorksClaimed >= 0, property.id);
    assert.ok(property.cost + property.improvements - property.capitalWorksClaimed > 0, `${property.id}: tax cost base`);
    if (fund.market === "SG") assert.equal(property.capitalWorksClaimed, 0, `${property.id}: no Div 43 claim in Singapore`);
  }
});

test("holder units add up to units on issue except Kurrajong, whose register is short by 1,250,000 units", () => {
  const shortfall: Record<string, number> = {};
  for (const fund of seed.funds) {
    const difference = fund.unitsOnIssue - sum(holdersOf(fund.id).map((holder) => holder.units));
    if (difference !== 0) shortfall[fund.id] = difference;
  }
  assert.deepEqual(shortfall, { kurrajong: 1_250_000 });
  assert.deepEqual(FUND_IDS.map((id) => holdersOf(id).length), [5, 4, 4, 5, 4, 5, 5, 5, 5]);

  // The reference flags "Units not on register A$76.3k": the distribution that belongs to the missing units.
  const kurrajong = auFund(seed, "kurrajong");
  const missingCents = (kurrajong.inputs.cashDistribution / kurrajong.unitsOnIssue) * 1_250_000;
  assert.equal(Math.round(missingCents / 10_000) / 10, 76.3);
  assert.equal(seed.queries.find((query) => query.id === "q-2")?.subject, "Register short by 1,250,000 units");
});

test("unit prices, price bases and opening unit cost base", () => {
  const prices = Object.fromEntries(Object.entries(seed.unitCostBase).map(([id, entry]) => [id, [entry.unitPrice, entry.priceBasis]]));
  assert.deepEqual(prices, {
    harbourline: [0.72, "market price"],
    southbank: [0.82, "NAV per unit"],
    wattle: [0.726, "market price"],
    kurrajong: [0.764, "market price"],
    coastline: [0.962, "NAV per unit"],
    "telok-ayer": [0.853, "market price"],
    loyang: [1.723, "market price"],
    meranti: [1.408, "market price"],
    kallang: [0.78, "market price"],
  });
  assert.deepEqual(seed.unitCostBase.harbourline.opening, { "h-hl-1": 61057620300, "h-hl-2": 8238749800, "h-hl-3": 16172360600, "h-hl-4": 8950740500, "h-hl-5": 1123753500 });
  for (const fund of seed.funds) for (const [holderId, cost] of Object.entries(seed.unitCostBase[fund.id].opening)) assert.ok(cost > 0, `${fund.id}/${holderId}`);
});

test("Singapore distribution tracking openings (Form UT ledger)", () => {
  assert.deepEqual(seed.sgLedger, {
    "telok-ayer": { exempt: 120677000, capital: 988421500, afterTax: 0 },
    loyang: { exempt: 0, capital: 216648000, afterTax: 41836600 },
    meranti: { exempt: 65539000, capital: 0, afterTax: 0 },
    kallang: { exempt: 0, capital: 341260600, afterTax: 0 },
  });
});

// ------------------------------------------------------------------------------------------------ notices
test("AU notices: counts per fund, cash adds up to each fund's distribution, one final notice per fund, Coastline's last is an unpublished draft", () => {
  assert.deepEqual(AU_IDS.map((id) => seed.auNotices.filter((notice) => notice.fundId === id).length), [4, 2, 4, 4, 4]);
  for (const id of AU_IDS) {
    const notices = seed.auNotices.filter((notice) => notice.fundId === id);
    assert.equal(sum(notices.map((notice) => notice.cash)), auFund(seed, id).inputs.cashDistribution, `${id}: notice cash`);
    assert.equal(notices.filter((notice) => notice.final).length, 1, `${id}: one final notice`);
    assert.equal(notices[notices.length - 1].final, true, `${id}: the final notice is the last`);
  }
  for (const notice of seed.auNotices) {
    assert.ok(notice.recordDate <= notice.paymentDate, `${notice.id}: record date before payment date`);
    if (notice.publishedOn !== null) assert.ok(notice.publishedOn <= notice.paymentDate, `${notice.id}: published by the payment date`);
  }
  assert.deepEqual(seed.auNotices.filter((notice) => notice.publishedOn === null || notice.notified === null).map((notice) => notice.id), ["coastline-2026-09-30"]);
  const draft = seed.auNotices.find((notice) => notice.id === "coastline-2026-09-30");
  assert.deepEqual(draft, {
    id: "coastline-2026-09-30", fundId: "coastline", label: "Quarter ended 30 Sep 2026", recordDate: "2026-09-30", paymentDate: "2026-11-13", cash: 536400000, final: true, publishedOn: null, notified: null,
  });
});

test("AU notified components reconcile to the fund's inputs, except the seeded Southbank estate-sale gap and Kurrajong's classification", () => {
  for (const id of ["harbourline", "southbank", "wattle", "kurrajong"]) {
    const fund = auFund(seed, id);
    const adjustments = seed.taxAdjustments[id];
    const notified = seed.auNotices.filter((notice) => notice.fundId === id).map((notice) => notice.notified);
    assert.ok(notified.every((entry) => entry !== null), `${id}: every notice has notified amounts`);
    const total = (key: "other" | "ncmi" | "excludedNcmi" | "clean" | "interest"): number => sum(notified.map((entry) => (entry ? entry[key] : 0)));
    assert.equal(total("interest"), fund.inputs.interest, `${id}: interest`);
    assert.equal(total("clean"), fund.inputs.cleanBuilding, `${id}: clean building`);
    assert.equal(total("ncmi") + total("excludedNcmi"), fund.inputs.ncmi + fund.inputs.excludedNcmi, `${id}: NCMI, however notified`);
    const other = fund.inputs.ausOtherIncome + adjustments.tarpDiscountGross + adjustments.tarpOther;
    // Southbank's estate sale settled after the notices went out (query q-3): the gross discounted gain was never notified.
    assert.equal(total("other"), id === "southbank" ? other - 1_976_000_000 : other, `${id}: other Australian income`);
  }
  // Kurrajong's notices carry the cross-staple rent as excluded NCMI while the fund inputs hold it as NCMI (query q-1).
  const kurrajong = seed.auNotices.filter((notice) => notice.fundId === "kurrajong");
  assert.equal(sum(kurrajong.map((notice) => notice.notified?.ncmi ?? 0)), 0);
  assert.equal(sum(kurrajong.map((notice) => notice.notified?.excludedNcmi ?? 0)), auFund(seed, "kurrajong").inputs.ncmi);
});

test("SG notices: one per fund, only Loyang's is published and notified", () => {
  assert.deepEqual(seed.sgNotices.map((notice) => notice.fundId), SG_IDS);
  for (const notice of seed.sgNotices) assert.ok(notice.recordDate <= notice.declarationDeadline && notice.declarationDeadline <= notice.paymentDate, `${notice.id}: dates in order`);
  assert.deepEqual(seed.sgNotices.filter((notice) => notice.notified === null).map((notice) => notice.fundId), ["telok-ayer", "meranti", "kallang"]);
  assert.deepEqual(seed.sgNotices.filter((notice) => notice.publishedOn === null).map((notice) => notice.fundId), ["telok-ayer", "meranti", "kallang"]);
  assert.deepEqual(seed.sgNotices.find((notice) => notice.fundId === "loyang"), {
    id: "loyang-notice", fundId: "loyang", recordDate: "2026-08-07", declarationDeadline: "2026-08-14", paymentDate: "2026-08-28", publishedOn: "2026-07-30",
    notified: { taxable: 6981610000, exempt: 0, capital: 430200000 },
  });
  // What Loyang notified is what its fund inputs distribute.
  const loyang = sgFund(seed, "loyang");
  assert.deepEqual(seed.sgNotices.find((notice) => notice.fundId === "loyang")?.notified, {
    taxable: loyang.inputs.taxableDistributed, exempt: loyang.inputs.taxExemptDistribution, capital: loyang.inputs.capitalDistribution,
  });
});

// ------------------------------------------------------------------------------------------------ workflow records
test("queries: Kurrajong has two open, Southbank one, Meranti's is resolved; the first message opens the thread", () => {
  assert.deepEqual(seed.queries.map((query) => [query.id, query.fundId, query.status]), [
    ["q-1", "kurrajong", "open"],
    ["q-2", "kurrajong", "open"],
    ["q-3", "southbank", "open"],
    ["q-4", "meranti", "resolved"],
  ]);
  for (const query of seed.queries) {
    assert.ok(query.messages.length > 0, query.id);
    assert.equal(query.messages[0].by, query.raisedBy, `${query.id}: first message author`);
    assert.equal(query.messages[0].at, query.raisedAt, `${query.id}: first message time`);
    const times = query.messages.map((message) => message.at);
    assert.deepEqual(times, [...times].sort(), `${query.id}: messages are chronological`);
  }
  assert.deepEqual(seed.queries.map((query) => query.subject), [
    "Cross-staple rent: NCMI or transitional?",
    "Register short by 1,250,000 units",
    "Estate sale: discount eligibility",
    "Co-location income as specified income",
  ]);
});

test("audit trail keeps the reference file order and is chronological within each fund", () => {
  assert.deepEqual(idsOf(seed.audit), [
    "a-01", "a-02", "a-02b", "a-02c", "a-03", "a-04", "a-05", "a-06", "a-07", "a-08", "a-08b", "a-09", "a-10", "a-11", "a-12", "a-12b", "a-06b", "a-13",
    "a-14", "a-15", "a-16", "a-16b", "a-17", "a-18", "a-19", "a-19b", "a-20",
  ]);
  for (const id of FUND_IDS) {
    const times = seed.audit.filter((entry) => entry.fundId === id).map((entry) => entry.at);
    assert.deepEqual(times, [...times].sort(), `${id}: audit entries are chronological`);
  }
  assert.deepEqual(seed.audit[0], {
    id: "a-01", fundId: "harbourline", at: "2026-07-28T10:12:00", actor: "R. Okafor", action: "Trust components loaded", detail: "FY2026 tax trial balance mapped to AMIT components",
  });
  assert.deepEqual(seed.audit[2], { id: "a-02b", fundId: "harbourline", at: "2026-09-01T15:20:00", actor: "L. Brennan", action: "Approved — reviewer" });
  assert.deepEqual(seed.audit[seed.audit.length - 1], {
    id: "a-20", fundId: "kallang", at: "2026-10-10T15:42:00", actor: "W. L. Teo", action: "Distribution components loaded", detail: "Taxable distribution set at 85% while asset enhancement works are funded",
  });
  // Southbank's TARP update names the same gain the fund inputs carry; Kallang's note describes its 85% taxable distribution.
  assert.equal(seed.audit.find((entry) => entry.id === "a-05")?.detail, "A$0 → A$9,880,000 — estate sale settled 26 Jun 2026");
  assert.equal(auFund(seed, "southbank").inputs.discountGainTarp, 988000000);
  const kallang = sgFund(seed, "kallang");
  assert.ok(Math.abs(kallang.inputs.taxableDistributed / kallang.inputs.taxableSpecifiedIncome - 0.85) < 0.0001);
});

test("workflow state is consistent: audit milestones, approvals and lodgments match each fund's status and governance", () => {
  const fundsWith = (action: string): string[] => FUND_IDS.filter((id) => seed.audit.some((entry) => entry.fundId === id && entry.action === action));
  const fundsWithStatus = (predicate: (status: string) => boolean): string[] => seed.funds.filter((fund) => predicate(fund.status)).map((fund) => fund.id);
  assert.deepEqual(fundsWith("Signed off"), fundsWithStatus((status) => status === "Signed off"));
  assert.deepEqual(fundsWith("Submitted for review"), fundsWithStatus((status) => status !== "Preparing"));

  const approvalAction = { review: "Approved — reviewer", agent: "Approved — tax agent" };
  for (const approval of seed.approvals) {
    const logged = seed.audit.some((entry) => entry.fundId === approval.fundId && entry.actor === approval.by && entry.at === approval.at && entry.action === approvalAction[approval.level]);
    assert.ok(logged, `${approval.fundId}/${approval.level}: approval is in the audit trail`);
  }
  assert.equal(seed.audit.filter((entry) => entry.action.startsWith("Approved")).length, seed.approvals.length);

  const required = { "no-agent": ["review"], "agent-signs-off": ["review", "agent"], "agent-lodges": ["review", "agent"] };
  for (const fund of seed.funds) {
    const levels = seed.approvals.filter((approval) => approval.fundId === fund.id).map((approval) => approval.level);
    if (fund.status === "Signed off") assert.deepEqual([...levels].sort(), [...required[fund.governance]].sort(), `${fund.id}: approvals required by its governance`);
    if (fund.status === "Preparing") assert.deepEqual(levels, [], `${fund.id}: nothing is approved while preparing`);
  }
  for (const lodgment of seed.lodgments) assert.equal(fundOf(seed, lodgment.fundId).status, "Signed off", `${lodgment.fundId}: lodged only after sign-off`);

  // Every open query was raised through a "Query raised" audit entry with the same author, time and subject.
  const open = seed.queries.filter((query) => query.status === "open");
  assert.equal(seed.audit.filter((entry) => entry.action === "Query raised").length, open.length);
  for (const query of open) {
    const logged = seed.audit.some((entry) => entry.action === "Query raised" && entry.fundId === query.fundId && entry.actor === query.raisedBy && entry.at === query.raisedAt && entry.detail === query.subject);
    assert.ok(logged, `${query.id}: raised in the audit trail`);
  }
});

test("approvals and lodgments", () => {
  assert.deepEqual(seed.approvals, [
    { fundId: "harbourline", level: "review", by: "L. Brennan", at: "2026-09-01T15:20:00" },
    { fundId: "harbourline", level: "agent", by: "D. Harrow", at: "2026-09-07T10:05:00" },
    { fundId: "wattle", level: "review", by: "L. Brennan", at: "2026-08-27T09:40:00" },
    { fundId: "loyang", level: "review", by: "N. Pillai", at: "2026-08-01T11:15:00" },
    { fundId: "meranti", level: "review", by: "N. Pillai", at: "2026-10-09T14:30:00" },
  ]);
  assert.deepEqual(seed.lodgments, [
    { fundId: "wattle", kind: "aiir", reference: "Receipt 418806117352", date: "2026-10-02", actor: "A. Moreno" },
    { fundId: "wattle", kind: "return", reference: "Receipt 418806221407", date: "2026-10-09", actor: "A. Moreno" },
  ]);
});

test("users: roles and fund scopes (the AU team cannot see Singapore funds and vice versa)", () => {
  assert.deepEqual(
    seed.users.map((user) => [user.id, user.name, user.role, user.funds]),
    [
      ["a-moreno", "A. Moreno", "head-of-tax", "all"],
      ["l-brennan", "L. Brennan", "reviewer", AU_IDS],
      ["n-pillai", "N. Pillai", "reviewer", SG_IDS],
      ["r-okafor", "R. Okafor", "preparer", AU_IDS],
      ["w-l-teo", "W. L. Teo", "preparer", SG_IDS],
      ["d-harrow", "D. Harrow", "tax-agent", ["harbourline", "southbank", "kurrajong"]],
      ["s-lim", "S. Lim", "tax-agent", ["telok-ayer", "meranti"]],
      ["m-castillo", "M. Castillo", "finance", "all"],
    ],
  );
  assert.deepEqual(
    seed.users.map((user) => [user.title, user.organisation]),
    [
      ["Head of Tax", "Fund manager"],
      ["Tax manager, Australia", "Fund manager"],
      ["Tax manager, Singapore", "Fund manager"],
      ["Tax accountant, Australia", "Fund manager"],
      ["Tax accountant, Singapore", "Fund manager"],
      ["Registered tax agent", "Arden Tax Partners"],
      ["Tax adviser", "Tanjong Tax Advisory"],
      ["Fund finance", "Fund manager"],
    ],
  );
});

// ------------------------------------------------------------------------------------------------ golden values from the reference screens
test("golden: Harbourline header, components, trial balance and tax adjustments", () => {
  const fund = auFund(seed, "harbourline");
  assert.deepEqual(fund.inputs, {
    cashDistribution: 9244600000, // A$92,446,000
    ausOtherIncome: 4831840000,
    ncmi: 0,
    excludedNcmi: 0,
    cleanBuilding: 620530000, // A$6,205,300
    interest: 118490000, // A$1,184,900
    discountGainTarp: 391200000, // A$3,912,000
    otherGainTarp: 0,
    foreignIncome: 0,
  });
  assert.equal(fund.whtRemitted, 250448636);
  const row = (account: string) => rowsOf("harbourline").find((candidate) => candidate.account === account);
  assert.deepEqual(row("1000"), { id: "tb-harbourline-1000", fundId: "harbourline", account: "1000", name: "Cash at bank", category: "balance-sheet", current: 1941366000, prior: 2174329900 });
  assert.equal(row("1100")?.current, 150704586900); // A$1,507,045,869
  assert.equal(row("1100")?.prior, 149805752400);
  assert.equal(row("3100")?.name, "Unitholders' equity");
  assert.equal(row("3100")?.current, -116071510800);
  assert.deepEqual(propertiesOf("harbourline").map((property) => property.valuation), [78366385200, 40690238500, 31647963200]);
  assert.deepEqual(seed.taxAdjustments.harbourline, { div40: 185549600, div43: 371970300, tarpDiscountGross: 782400000, tarpOther: 0 });
});

test("golden: Coastline and Kurrajong components, Singapore inputs and capital allowances", () => {
  assert.equal(auFund(seed, "coastline").inputs.cashDistribution, 2104800000); // A$21,048,000
  assert.equal(auFund(seed, "coastline").inputs.interest, 21230000); // "Australian interest A$212,300"
  assert.equal(auFund(seed, "coastline").inputs.foreignIncome, 110480000); // "Assessable foreign income A$1,104,800"
  assert.equal(auFund(seed, "kurrajong").inputs.ncmi, 961580000);
  assert.equal(auFund(seed, "wattle").inputs.otherGainTarp, 128800000);
  assert.deepEqual(sgFund(seed, "telok-ayer").inputs, { taxableSpecifiedIncome: 5841260000, taxableDistributed: 5841260000, taxExemptDistribution: 311840000, capitalDistribution: 190580000 });
  assert.deepEqual(sgFund(seed, "loyang").inputs, { taxableSpecifiedIncome: 7124090000, taxableDistributed: 6981610000, taxExemptDistribution: 0, capitalDistribution: 430200000 });
  assert.deepEqual(sgFund(seed, "meranti").inputs, { taxableSpecifiedIncome: 2766430000, taxableDistributed: 2683440000, taxExemptDistribution: 144270000, capitalDistribution: 0 });
  assert.deepEqual(sgFund(seed, "kallang").inputs, { taxableSpecifiedIncome: 4190650000, taxableDistributed: 3562050000, taxExemptDistribution: 0, capitalDistribution: 0 });
  assert.deepEqual(
    SG_IDS.map((id) => seed.taxAdjustments[id].capitalAllowances),
    [162597200, 188328700, 79113800, 122306700],
  );
});

test("golden: cash distributed per fund as the Analytics screen shows it", () => {
  assert.deepEqual(
    Object.fromEntries(seed.funds.map((fund) => [fund.id, distributionCash(fund)])),
    {
      harbourline: 9244600000, // A$92,446,000
      southbank: 4721200000, // A$47,212,000
      wattle: 12968800000, // A$129,688,000
      kurrajong: 5803600000, // A$58,036,000
      coastline: 2104800000, // A$21,048,000
      "telok-ayer": 6343680000, // S$63,436,800
      loyang: 7411810000, // S$74,118,100
      meranti: 2827710000, // S$28,277,100
      kallang: 3562050000, // S$35,620,500
    },
  );
});

test("golden: withholding already remitted (null until the fund remits)", () => {
  assert.deepEqual(
    Object.fromEntries(seed.funds.map((fund) => [fund.id, fund.whtRemitted])),
    {
      harbourline: 250448636,
      southbank: 241009925,
      wattle: 274264560,
      kurrajong: 209240269,
      coastline: null,
      "telok-ayer": null,
      loyang: 279264400,
      meranti: null,
      kallang: null,
    },
  );
});
