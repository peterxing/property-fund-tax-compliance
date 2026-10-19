import assert from "node:assert/strict";
import test from "node:test";
import { applyAction } from "../../../src/domain/actions.ts";
import { dueDiligenceView, type DueDiligenceSection, type DueDiligenceStatus } from "../../../src/domain/duediligence/index.ts";
import { seedData } from "../../../src/domain/seed/index.ts";
import { UNMAPPED_CATEGORY, type AppData, type Ctx, type Fund, type FundId } from "../../../src/domain/types.ts";

const NOW = new Date("2026-10-12T09:00:00Z");
const SECTION_IDS = ["entity", "workflow", "distribution", "lodgment", "open-items", "property-taxes", "assets", "data-quality"] as const;

function ctx(data: AppData, userId = "a-moreno"): Ctx {
  const user = data.users.find((candidate) => candidate.id === userId);
  assert.ok(user);
  return { now: NOW, user };
}

function section(view: ReturnType<typeof dueDiligenceView>, id: string): DueDiligenceSection {
  const found = view.sections.find((candidate) => candidate.id === id);
  assert.ok(found, `Missing section ${id}`);
  return found;
}

function assertSection(input: {
  view: ReturnType<typeof dueDiligenceView>;
  id: (typeof SECTION_IDS)[number];
  status: DueDiligenceStatus;
  evidence: RegExp[];
}): void {
  const found = section(input.view, input.id);
  assert.equal(found.status, input.status, input.id);
  const evidence = found.evidence.join(" ");
  for (const expected of input.evidence) assert.match(evidence, expected, `${input.id}: ${expected}`);
}

function assertScenario(name: string, view: ReturnType<typeof dueDiligenceView>, expected: Record<(typeof SECTION_IDS)[number], { status: DueDiligenceStatus; evidence: RegExp[] }>): void {
  assert.deepEqual(view.sections.map((candidate) => candidate.id), [...SECTION_IDS], name);
  for (const id of SECTION_IDS) assertSection({ view, id, ...expected[id] });
}

function withFunds(data: AppData, map: (fund: Fund) => Fund): AppData {
  return { ...data, funds: data.funds.map(map) };
}

function createdEmptyFundReport(): ReturnType<typeof dueDiligenceView> {
  const data = seedData();
  const result = applyAction(
    data,
    {
      type: "entity-create-fund",
      fund: {
        market: "AU",
        name: "New Empty Due Diligence Fund",
        sector: "Office",
        listed: false,
        periodStart: "2026-07-01",
        periodEnd: "2027-06-30",
        unitsOnIssue: 1000,
        governance: "no-agent",
      },
    },
    ctx(data),
  );
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("entity-create-fund failed");
  const fund = result.data.funds.find((candidate) => candidate.name === "New Empty Due Diligence Fund");
  assert.ok(fund);
  return dueDiligenceView(result.data, fund.id, ctx(result.data));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

test("seeded scenarios pin every due-diligence section status and key evidence", () => {
  const data = seedData();

  // Hand checked from the seed:
  // Harbourline is AU, signed off, withholding remitted equals computed, all BAS periods are lodged, but due-diligence still shows
  // advisory notes: AIIR due in 90 days, one not-modelled property-tax/duty row, and market assumption-confidence rules.
  assertScenario("signed-off AU", dueDiligenceView(data, "harbourline", ctx(data)), {
    entity: { status: "Clear", evidence: [/AU · AMIT; sector Office; listed/, /Units on issue: 1,412,680,000/, /Tax agent signs off/] },
    workflow: { status: "Clear", evidence: [/Status: Signed off; 0 open queries; 0 distribution exceptions/, /current inputs match that hash/, /Saved calculation versions: 2/] },
    distribution: { status: "Clear", evidence: [/Cash distribution: A\$92,446,000/, /withholding computed: A\$2,504,486/, /Register units: 1,412,680,000/] },
    lodgment: { status: "Clear", evidence: [/Tax return lodgment: ready/, /4\/4 fund payment notices published/, /GST\/BAS periods: 4 lodged, 0 open, 0 overdue/] },
    "open-items": { status: "Attention", evidence: [/Risk register: 0 exceptions and 2 notes/, /AIIR 31 Oct 2026/] },
    "property-taxes": { status: "Attention", evidence: [/Annual land tax modelled total: A\$20,445,490/, /Acquisition duties modelled total: A\$48,618,552/, /Not modelled or missing-data rows: 1/] },
    assets: { status: "Clear", evidence: [/Asset register: 10 assets/, /Division 40 plant: A\$1,855,496/, /Deferred tax indicator .*A\$28,926,024/] },
    "data-quality": { status: "Attention", evidence: [/balanced; all accounts mapped; matches distribution/, /No manual tax adjustments/, /assumption rules/] },
  });

  // Kurrajong is AU and in review: two open queries, an under-remitted withholding variance of A$360,593, register short by
  // 1,250,000 units, and AMMA statements overdue on the fixed 12 Oct 2026 test date.
  assertScenario("in-review AU with exceptions", dueDiligenceView(data, "kurrajong", ctx(data)), {
    entity: { status: "Clear", evidence: [/AU · AMIT; sector Diversified, stapled; listed/, /Units on issue: 951,400,000/, /Tax agent reviews and lodges/] },
    workflow: { status: "Attention", evidence: [/Status: In review; 2 open queries; 3 distribution exceptions/, /Reviewer: pending; Tax agent: pending/, /No sign-off version is saved/] },
    distribution: { status: "Issue", evidence: [/under-remitted/, /variance: A\$360,593/, /unallocated units: 1,250,000/] },
    lodgment: { status: "Issue", evidence: [/Tax return lodgment: not ready/, /AIIR not ready/, /AMMA statements due 30 Sep 2026/] },
    "open-items": { status: "Issue", evidence: [/Open queries: 2/, /Risk register: 4 exceptions and 3 notes/, /Deadlines: 1 overdue/] },
    "property-taxes": { status: "Attention", evidence: [/Annual land tax modelled total: A\$13,960,867/, /Acquisition duties modelled total: A\$24,443,463/, /Not modelled or missing-data rows: 1/] },
    assets: { status: "Clear", evidence: [/Asset register: 10 assets/, /Division 40 plant: A\$1,272,506/, /Deferred tax indicator .*A\$40,151,760/] },
    "data-quality": { status: "Attention", evidence: [/balanced; all accounts mapped; matches distribution/, /No manual tax adjustments/, /assumption rules/] },
  });

  // Loyang is SG, signed off, with reconciled withholding and paid property taxes/duties; Form UT is ready but not filed yet, so lodgment
  // remains Attention, and SG assumption-confidence rules keep data quality at Attention.
  assertScenario("signed-off SG", dueDiligenceView(data, "loyang", ctx(data)), {
    entity: { status: "Clear", evidence: [/SG · S-REIT; sector Logistics; listed/, /Units on issue: 2,871,050,000/, /No tax agent/] },
    workflow: { status: "Clear", evidence: [/Status: Signed off; 0 open queries; 0 distribution exceptions/, /Reviewer: done by N\. Pillai/, /current inputs match that hash/] },
    distribution: { status: "Clear", evidence: [/Taxable income distribution: S\$69,816,100/, /withholding computed: S\$2,792,644/, /status: reconciled/] },
    lodgment: { status: "Attention", evidence: [/Form UT filing: ready/, /distribution tax notice published 30 Jul 2026/, /s45G status reconciled/] },
    "open-items": { status: "Clear", evidence: [/Open queries: 0/, /Risk register: 0 exceptions and 0 notes/, /0 due in the next 90 days/] },
    "property-taxes": { status: "Clear", evidence: [/Annual property tax modelled total: S\$39,172,370/, /Acquisition duties modelled total: S\$176,251,943/, /Not modelled or missing-data rows: 0/] },
    assets: { status: "Clear", evidence: [/Asset register: 5 assets/, /Singapore capital allowances: S\$1,883,287/, /Singapore doesn't tax capital gains/] },
    "data-quality": { status: "Attention", evidence: [/balanced; all accounts mapped; matches distribution/, /No manual tax adjustments/, /IRAS Audit File export layout/] },
  });

  // Created by entity-create-fund: no holders or rows are seeded for it. That makes distribution an Issue (register units 0 vs
  // 1,000 on issue), open-items an Issue through the distribution risk, and assets Attention because there is no register.
  assertScenario("brand-new empty fund", createdEmptyFundReport(), {
    entity: { status: "Clear", evidence: [/AU · AMIT; sector Office; unlisted/, /Units on issue: 1,000/, /No tax agent/] },
    workflow: { status: "Attention", evidence: [/Status: Preparing; 0 open queries; 1 distribution exceptions/, /Reviewer: pending/, /Saved calculation versions: 0/] },
    distribution: { status: "Issue", evidence: [/No amounts held/, /remitted: Not remitted/, /unallocated units: 1,000/] },
    lodgment: { status: "Attention", evidence: [/Tax return lodgment: not ready/, /0\/0 fund payment notices published/, /GST\/BAS periods: 0 lodged, 4 open, 0 overdue/] },
    "open-items": { status: "Issue", evidence: [/Open queries: 0/, /Risk register: 1 exception and 0 notes/, /BAS Jul–Sep 2026 28 Oct 2026/] },
    "property-taxes": { status: "Clear", evidence: [/Annual land tax modelled total: A\$0/, /Acquisition duties modelled total: A\$0/, /Not modelled or missing-data rows: 0/] },
    assets: { status: "Attention", evidence: [/Asset register: 0 assets/, /Register deductions agree/, /unit cost base closing total: A\$0/] },
    "data-quality": { status: "Attention", evidence: [/balanced; all accounts mapped; matches distribution/, /No manual tax adjustments/, /assumption rules/] },
  });
});

test("section status rules flip when the underlying seed facts change", () => {
  const base = seedData();
  assert.equal(section(dueDiligenceView(base, "loyang", ctx(base)), "distribution").status, "Clear");
  assert.equal(section(dueDiligenceView(withFunds(base, (fund) => (fund.id === "loyang" ? { ...fund, whtRemitted: (fund.whtRemitted ?? 0) - 100 } : fund)), "loyang", ctx(base)), "distribution").status, "Issue");

  const staleInputs = withFunds(base, (fund) =>
    fund.id === "loyang" && fund.market === "SG" ? { ...fund, inputs: { ...fund.inputs, taxableDistributed: fund.inputs.taxableDistributed + 100 } } : fund,
  );
  assert.equal(section(dueDiligenceView(staleInputs, "loyang", ctx(staleInputs)), "workflow").status, "Issue");
  assert.match(section(dueDiligenceView(staleInputs, "loyang", ctx(staleInputs)), "workflow").evidence.join(" "), /current inputs differ from that hash/);

  const overdueBas = { ...base, gstFilings: base.gstFilings.filter((filing) => !(filing.fundId === "loyang" && filing.periodEnd === "2026-06-30")) };
  assert.equal(section(dueDiligenceView(overdueBas, "loyang", ctx(overdueBas)), "lodgment").status, "Issue");
  assert.match(section(dueDiligenceView(overdueBas, "loyang", ctx(overdueBas)), "lodgment").evidence.join(" "), /GST\/BAS periods: 3 lodged, 0 open, 1 overdue/);

  const unpaidTax = {
    ...base,
    propertyProfiles: base.propertyProfiles.map((profile) =>
      profile.fundId === "loyang" && profile.propertyId === "loyang-loyang-logistics-hub"
        ? { ...profile, payments: profile.payments.filter((payment) => payment.kind !== "annual-tax") }
        : profile,
    ),
  };
  assert.equal(section(dueDiligenceView(unpaidTax, "loyang", ctx(unpaidTax)), "property-taxes").status, "Issue");
  assert.match(section(dueDiligenceView(unpaidTax, "loyang", ctx(unpaidTax)), "property-taxes").evidence.join(" "), /unpaid modelled properties: 1; overdue: 1/);

  const unmapped = { ...base, tbRows: base.tbRows.map((row) => (row.fundId === "loyang" && row.account === "1000" ? { ...row, category: UNMAPPED_CATEGORY } : row)) };
  assert.equal(section(dueDiligenceView(unmapped, "loyang", ctx(unmapped)), "data-quality").status, "Issue");
  assert.match(section(dueDiligenceView(unmapped, "loyang", ctx(unmapped)), "data-quality").evidence.join(" "), /1 unmapped account/);

  const openQuery = {
    ...base,
    queries: [
      ...base.queries,
      { id: "q-loyang-dd", fundId: "loyang" as FundId, subject: "Confirm sponsor waiver", status: "open" as const, raisedBy: "A. Moreno", raisedAt: "2026-10-12T09:00:00", messages: [] },
    ],
  };
  assert.equal(section(dueDiligenceView(openQuery, "loyang", ctx(openQuery)), "open-items").status, "Issue");
  assert.match(section(dueDiligenceView(openQuery, "loyang", ctx(openQuery)), "open-items").evidence.join(" "), /Confirm sponsor waiver/);
});

test("CSV and PDF models carry every finding and the report metadata", () => {
  const data = seedData();
  const user = data.users.find((candidate) => candidate.id === "m-castillo")!;
  const view = dueDiligenceView(data, "harbourline", { now: NOW, user });
  assert.deepEqual(view.csv.columns, ["Section", "Status", "Finding", "Evidence", "Link"]);
  assert.equal(view.csv.rows.length, view.sections.length);
  for (const [index, dueDiligenceSection] of view.sections.entries()) {
    assert.deepEqual(view.csv.rows[index]?.slice(0, 4), [dueDiligenceSection.title, dueDiligenceSection.status, dueDiligenceSection.finding, dueDiligenceSection.evidence.join(" | ")]);
  }
  assert.equal(view.doc.title, "Tax due diligence report");
  assert.ok(view.doc.meta?.some((row) => row.label === "Prepared by" && row.value === "M. Castillo · Fund finance"));
  assert.ok(view.doc.meta?.some((row) => row.label === "As at" && row.value === "12 Oct 2026"));
  assert.match(view.doc.blocks.map((block) => ("text" in block ? block.text : "")).join(" "), /figures held in this browser/i);
  const table = view.doc.blocks.find((block) => block.kind === "table");
  assert.ok(table && "rows" in table);
  assert.deepEqual(table.rows.map((row) => row.section), view.sections.map((dueDiligenceSection) => dueDiligenceSection.title));
});

test("selector is pure and enforces persona isolation", () => {
  const data = deepFreeze(seedData());
  const before = JSON.stringify(data);
  dueDiligenceView(data, "harbourline", ctx(data));
  assert.equal(JSON.stringify(data), before);
  assert.throws(() => dueDiligenceView(data, "telok-ayer", ctx(data, "l-brennan")), /Fund not available/);
});
