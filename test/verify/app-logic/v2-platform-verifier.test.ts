import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { csvText } from "../../../src/app/exports/csv.ts";
import { ROUTES } from "../../../src/app/router.ts";
import type { AppPath } from "../../../src/app/router.ts";
import { applyAction } from "../../../src/domain/actions.ts";
import { compareLines, compareSources, labelSimilarity, parseAmount, parseTheirFile, sourceCsv } from "../../../src/domain/compare/index.ts";
import type { TheirLine } from "../../../src/domain/compare/types.ts";
import type { FixedAsset } from "../../../src/domain/assets/types.ts";
import { FEATURE_PROVIDERS } from "../../../src/domain/providers.ts";
import { seedData } from "../../../src/domain/seed/index.ts";
import {
  accessView,
  analyticsView,
  auditFor,
  bulkRows,
  costBaseView,
  fundCalc,
  fundGroups,
  investorView,
  queriesFor,
  returnView,
  rulesFor,
  scenarioView,
  statementDoc,
  tbView,
  visibleFunds,
  workbookModel,
} from "../../../src/domain/selectors.ts";
import { createStore } from "../../../src/domain/store.ts";
import type { ActionResult, AppData, Ctx, Fund, FundId, User } from "../../../src/domain/types.ts";
import { inputHash, lastSignOffVersion, versionDiff } from "../../../src/domain/governance/versions.ts";
import { calendarView, icsCalendar, riskRegister } from "../../../src/domain/portfolio/index.ts";

const NOW = new Date("2026-10-12T09:00:00+11:00");
const repoFile = (path: string) => new URL(`../../../${path}`, import.meta.url);

function ctx(data: AppData, userId = "a-moreno"): Ctx {
  const user = data.users.find((u) => u.id === userId);
  assert.ok(user, `missing seed user ${userId}`);
  return { now: NOW, user };
}

function must(result: ActionResult): AppData {
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
  return result.data;
}

function reasonOf(result: ActionResult): string {
  assert.equal(result.ok, false);
  return result.reason;
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertNoNaN(value: unknown, path = "value"): void {
  if (typeof value === "number") {
    assert.equal(Number.isNaN(value), false, `${path} is NaN`);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNaN(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) assertNoNaN(child, `${path}.${key}`);
}

function assertNoUndefined(value: unknown, path = "value"): void {
  assert.notEqual(value, undefined, `${path} is undefined`);
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUndefined(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) assertNoUndefined(child, `${path}.${key}`);
}

function withEveryUserAllFunds(data: AppData): AppData {
  return { ...data, users: data.users.map((user) => ({ ...user, funds: "all" as const })) };
}

test("compare parser handles workbook paste edge cases, amounts, skipped headings and limits", () => {
  assert.equal(parseAmount("$1,234.50"), 123450);
  assert.equal(parseAmount("(1,234.50)"), -123450);
  assert.equal(parseAmount("1,234.50-"), -123450);
  assert.equal(parseAmount("-1234.5"), -123450);
  assert.equal(parseAmount("A$1,234.50"), 123450);
  assert.equal(parseAmount("S$1,234.50"), 123450);
  assert.equal(parseAmount("−1234.50"), -123450);
  assert.equal(parseAmount("=1+1"), null);

  const parsed = parseTheirFile(
    "\uFEFFRef\tDescription\tAmount\r\nHeading only\t\t\r\nA1\t\"Quoted, comma and \"\"quote\"\"\"\tA$1,234.50\r\nB2\t\"line\nbreak\"\t(1,234.50)\r\nC3\t=SUM(A1:A2)\t1,234.50-\r\n",
  );
  assert.equal(parsed.delimiter, "\t");
  assert.equal(parsed.lines.length, 3);
  assert.equal(parsed.skipped.length, 1);
  assert.deepEqual(
    parsed.lines.map((line) => [line.reference, line.label, line.amount]),
    [
      ["A1", 'Quoted, comma and "quote"', 123450],
      ["B2", "line\nbreak", -123450],
      ["C3", "=SUM(A1:A2)", -123450],
    ],
  );

  const twoThousandRows = `Ref,Label,Amount\n${Array.from({ length: 2000 }, (_, i) => `R${i},Line ${i},1.00`).join("\n")}`;
  assert.equal(parseTheirFile(twoThousandRows).lines.length, 2000);
  assert.throws(() => parseTheirFile(`${twoThousandRows}\nR2001,Line 2001,1.00`), /2,000 rows/);
  assert.throws(() => parseTheirFile(`Ref,Label,Amount\n${"x".repeat(1_000_001)}`), /1 MB/);
});

test("compare matcher is one-to-one, honours references, remaps, tolerance edge and hints", () => {
  const ours = [
    { ref: "AU_BAS.1A", label: "GST sales total", amount: 10000, note: "=guard me" },
    { ref: "component.cleanBuilding", label: "Clean building MIT income", amount: 20000 },
    { ref: "component.interest", label: "Australian interest", amount: 30000 },
  ];
  const theirs: TheirLine[] = [
    { index: 2, reference: "1a", label: "anything", amount: 10000, raw: ["1a", "anything", "100.00"] },
    { index: 3, label: "Clean building income", amount: 20100, raw: ["", "Clean building income", "201.00"] },
    { index: 4, label: "Clean building income duplicate", amount: 20000, raw: ["", "Clean building income duplicate", "200.00"] },
    { index: 5, reference: "manual", label: "Manual line", amount: -30000, raw: ["manual", "Manual line", "-300.00"] },
  ];
  const result = compareLines(ours, theirs, { tolerance: 100, remaps: { manual: "component.interest" } });
  assert.deepEqual(result.counts, { match: 1, "within-tolerance": 1, differs: 1, "only-in-theirs": 1, "only-in-ours": 0 });
  assert.equal(result.rows.find((row) => row.theirs?.reference === "1a")?.ours?.ref, "AU_BAS.1A");
  assert.equal(result.rows.find((row) => row.status === "within-tolerance")?.difference, -100);
  assert.equal(result.rows.find((row) => row.theirs?.reference === "manual")?.hint, "Sign convention?");
  assert.equal(labelSimilarity("Tax exempt income dist", "Tax-exempt income distribution") >= 0.58, true);
  assert.equal(labelSimilarity("Gross rent", "Deferred tax liability") < 0.58, true);
  assert.match(result.headline, /^2 of 3 comparable lines match; largest difference/);
});

test("compare CSV exports are formula-guarded by the shared CSV writer", () => {
  const model = sourceCsv("source.csv", [{ ref: "=HYPERLINK(\"x\")", label: "+cmd", amount: 123 }]);
  const text = csvText(model);
  assert.match(text, /'=HYPERLINK/);
  assert.match(text, /'\+cmd/);
});

test("compare sources cover all nine funds with unique finite refs", () => {
  const data = seedData();
  const context = ctx(data);
  assert.equal(data.funds.length, 9);
  for (const fund of data.funds) {
    const sources = compareSources(data, fund.id, context);
    assert.ok(sources.length >= 7, `${fund.id} should expose core compare sources`);
    for (const source of sources) {
      assert.ok(source.lines.length > 0, `${fund.id}/${source.id} has lines`);
      const refs = new Set<string>();
      for (const line of source.lines) {
        assert.equal(Number.isFinite(line.amount), true, `${fund.id}/${source.id}/${line.ref} amount`);
        assert.equal(refs.has(line.ref), false, `${fund.id}/${source.id} duplicate ref ${line.ref}`);
        refs.add(line.ref);
      }
    }
  }
});

test("practice compare files produce the planted outcomes", () => {
  const data = seedData();
  const context = ctx(data);
  for (const [fundId, expected] of [
    ["harbourline", { match: 2, "within-tolerance": 1, differs: 2, "only-in-theirs": 1, "only-in-ours": 5 }],
    ["loyang", { match: 1, "within-tolerance": 1, differs: 1, "only-in-theirs": 1, "only-in-ours": 0 }],
  ] as const) {
    const source = compareSources(data, fundId, context).find((s) => s.id === "distribution-components");
    assert.ok(source, `${fundId} distribution source`);
    const theirText = readFileSync(repoFile(`docs/samples/compare-${fundId}-distribution-theirs.csv`), "utf8");
    const parsed = parseTheirFile(theirText);
    assert.deepEqual(compareLines(source.lines, parsed.lines, { tolerance: source.tolerance }, fundId === "loyang" ? "SGD" : "AUD").counts, expected);
  }
});

test("calendar preserves analytics deadlines, filters personas and emits RFC 5545 ICS", () => {
  const data = seedData();
  const headCtx = ctx(data);
  const calendar = calendarView(data, headCtx, "all", { showCompleted: true });
  const calendarKeys = new Set(calendar.rows.map((row) => `${row.date}|${row.fundId}|${row.obligation}|${row.status}`));
  for (const row of analyticsView(data, headCtx, "all").deadlines) {
    assert.equal(calendarKeys.has(`${row.date}|${row.fundId}|${row.obligation}|${row.status}`), true, `${row.fundId} ${row.obligation}`);
  }

  assert.equal(new Set(calendarView(data, ctx(data, "l-brennan"), "all", { showCompleted: true }).rows.map((row) => row.market)).size, 1);
  assert.deepEqual([...new Set(calendarView(data, ctx(data, "s-lim"), "all", { showCompleted: true }).rows.map((row) => row.fundId))].sort(), ["meranti", "telok-ayer"]);
  assert.equal(new Set(calendarView(data, ctx(data, "m-castillo"), "all", { showCompleted: true }).rows.map((row) => row.fundId)).size, 9);

  const rows = [
    {
      date: "2026-12-31",
      fundId: "fund-a",
      fundName: "Fund A",
      fund: "Fund A — 漢字 emoji 🧾 long long long long long long long long",
      market: "AU" as const,
      obligation: "Escape \\ comma, semicolon; newline\ntext",
      status: "open" as const,
      workspace: "/calendar",
      workspaceRoute: "/calendar",
      kind: "Other" as const,
      source: "market" as const,
    },
    {
      date: "2026-12-31",
      fundId: "fund-b",
      fundName: "Fund B",
      fund: "Fund B",
      market: "SG" as const,
      obligation: "Escape \\ comma, semicolon; newline\ntext",
      status: "done" as const,
      workspace: "/calendar",
      workspaceRoute: "/calendar",
      kind: "Other" as const,
      source: "market" as const,
    },
  ];
  const ics = icsCalendar(rows, { now: NOW, prodId: "-//Verifier//EN" });
  assert.equal(ics.endsWith("\r\n"), true);
  assert.equal(ics.includes("\n") && !ics.includes("\r\n") ? false : true, true);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.match(ics, /DTSTART;VALUE=DATE:20261231/);
  assert.match(ics, /DTSTAMP:\d{8}T\d{6}Z/);
  assert.match(ics, /comma\\, semicolon\\; newline\\ntext/);
  for (const line of ics.split("\r\n").filter(Boolean)) assert.ok(new TextEncoder().encode(line).byteLength <= 75, `folded line too long: ${line}`);
  const uid = ics.match(/^UID:(.+)$/m)?.[1];
  assert.ok(uid);
  assert.equal(icsCalendar(rows, { now: NOW }).includes(`UID:${uid}`), true);
});

test("risk register rows are deduped, route-valid, persona-filtered and exportable", () => {
  const data = seedData();
  const routes = new Set<AppPath>(ROUTES.map((route) => route.path));
  const risks = riskRegister(data, ctx(data), "all");
  const keys = new Set<string>();
  for (const row of risks.rows) {
    const key = `${row.fundId}|${row.title.toLowerCase()}`;
    assert.equal(keys.has(key), false, key);
    keys.add(key);
    assert.equal(routes.has(row.workspaceRoute as AppPath), true, `${row.title} route ${row.workspaceRoute}`);
  }
  assert.equal(risks.summary.bySeverity.exception + risks.summary.bySeverity.note, risks.filteredRows.length);
  assert.equal(risks.csv.rows.length, risks.filteredRows.length);
  assert.ok(csvText(risks.csv).startsWith("\uFEFFSeverity,Area,Fund"));

  assert.deepEqual([...new Set(riskRegister(data, ctx(data, "l-brennan"), "all").rows.map((row) => row.market))], ["AU"]);
  assert.ok(riskRegister(data, ctx(data), "all", { severity: "exception" }).filteredRows.every((row) => row.severity === "exception"));
});

test("created AU and SG funds survive selectors and feature providers for every user with access", () => {
  let data = withEveryUserAllFunds(seedData());
  data = must(
    applyAction(
      data,
      { type: "entity-create-fund", fund: { market: "AU", name: "Verifier AU Fund", sector: "Office", listed: false, periodStart: "2025-07-01", periodEnd: "2026-06-30", unitsOnIssue: 1000, governance: "no-agent" } },
      ctx(data),
    ),
  );
  data = must(
    applyAction(
      data,
      { type: "entity-create-fund", fund: { market: "SG", name: "Verifier SG Fund", sector: "Logistics", listed: true, periodStart: "2026-01-01", periodEnd: "2026-06-30", unitsOnIssue: 2000, governance: "no-agent", assessmentYear: 2027 } },
      ctx(data),
    ),
  );
  for (const fund of data.funds.filter((f) => f.id.startsWith("verifier-"))) {
    for (const user of data.users.filter((u) => u.funds === "all" || u.funds.includes(fund.id))) {
      const context = { now: NOW, user };
      const outputs: unknown[] = [
        visibleFunds(data, user, "all"),
        fundGroups(data, context, "all"),
        fundCalc(data, fund.id, NOW),
        tbView(data, fund.id, NOW),
        returnView(data, fund.id, context),
        investorView(data, fund.id, context),
        costBaseView(data, fund.id, context),
        bulkRows(data, context, "all"),
        analyticsView(data, context, "all"),
        scenarioView(data, fund.id, context),
        workbookModel(data, context, "all"),
        accessView(data, context),
        rulesFor(fund),
        compareSources(data, fund.id, context),
        calendarView(data, context, "all", { showCompleted: true }),
        riskRegister(data, context, "all"),
      ];
      const holder = data.holders.find((h) => h.fundId === fund.id);
      if (holder) outputs.push(statementDoc(data, fund.id, holder.id, NOW));
      for (const provider of FEATURE_PROVIDERS) {
        outputs.push(provider.deadlines?.(data, fund, NOW) ?? []);
        outputs.push(provider.risks?.(data, fund, NOW) ?? []);
        outputs.push(provider.compareSources?.(data, fund, NOW) ?? []);
      }
      outputs.forEach((output, index) => assertNoNaN(output, `${fund.id}/${user.id}/output${index}`));
    }
  }
});

test("entity reducers validate permissions, imports, deletion cascades and user fund lists", () => {
  let data = seedData();
  const financeCtx = ctx(data, "m-castillo");
  assert.equal(applyAction(data, { type: "entity-add-holder", fundId: "coastline", holder: { holder: "Bad", country: "AU", units: 1, auStatus: "resident" } }, financeCtx).ok, false);
  assert.equal(applyAction(data, { type: "entity-add-holder", fundId: "harbourline", holder: { holder: "Bad", country: "AU", units: 1, auStatus: "resident" } }, ctx(data, "r-okafor")).ok, false);
  assert.match(
    reasonOf(applyAction(data, { type: "entity-import-holders", fundId: "coastline", mode: "append", rows: [{ holder: "No country", country: "", units: 1, auStatus: "resident" }] }, ctx(data, "r-okafor"))),
    /country/i,
  );
  assert.match(
    reasonOf(applyAction(data, { type: "entity-import-properties", fundId: "coastline", mode: "append", rows: [{ name: "Bad", location: "NSW", acquired: "2026-01-01", cost: -1, improvements: 0, valuation: 0 }] }, ctx(data, "r-okafor"))),
    /cost/i,
  );

  const usersBefore = new Map(data.users.filter((u) => u.funds !== "all").map((u) => [u.id, [...(u.funds as string[])]]));
  data = must(applyAction(data, { type: "entity-add-property", fundId: "coastline", property: { name: "Verifier Tower", location: "Sydney", acquired: "2025-07-01", cost: 100000, improvements: 0, capitalWorksClaimed: 0, valuation: 120000 } }, ctx(data, "r-okafor")));
  const propertyId = data.properties.find((p) => p.fundId === "coastline" && p.name === "Verifier Tower")!.id;
  const asset: FixedAsset = { id: "asset-v", fundId: "coastline", propertyId, kind: "AU_DIV40", description: "Verifier lift", cost: 100000, startDate: "2025-07-01", assetClassId: "LIFTS_ELECTRIC", method: "PRIME_COST", effectiveLifeYears: 10 };
  data = { ...data, assets: [...data.assets, asset] };
  data = must(applyAction(data, { type: "entity-delete-fund", fundId: "coastline", confirmName: "Coastline Healthcare Property Fund" }, ctx(data)));
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      for (const [index, row] of value.entries()) {
        if (row && typeof row === "object" && "fundId" in row) assert.notEqual((row as { fundId?: string }).fundId, "coastline", `${key}[${index}]`);
      }
    }
  }
  assert.equal(Object.hasOwn(data.unitCostBase, "coastline"), false);
  assert.equal(Object.hasOwn(data.taxAdjustments, "coastline"), false);
  assert.equal(data.assets.some((asset) => asset.propertyId === propertyId), false);
  for (const user of data.users) {
    if (user.funds === "all") continue;
    assert.ok(user.funds.length <= (usersBefore.get(user.id)?.length ?? Number.POSITIVE_INFINITY), `${user.id} fund list grew`);
    assert.equal(user.funds.includes("coastline"), false);
  }

  const singletonData = { ...seedData(), users: [...seedData().users, { id: "one", name: "One Fund", title: "", organisation: "", role: "reviewer" as const, funds: ["coastline"] }] };
  assert.match(reasonOf(applyAction(singletonData, { type: "entity-delete-fund", fundId: "coastline", confirmName: "Coastline Healthcare Property Fund" }, ctx(singletonData))), /access to this fund only/i);
});

test("store importData round trips bare backups and refuses bad payloads with readable messages", () => {
  const data = seedData();
  const store = createStore({ storage: null, now: () => NOW });
  assert.equal(store.importData(jsonClone(data)), null);
  assert.deepEqual(store.getState().data, data);

  const old = { ...jsonClone(data), version: 1 };
  assert.match(store.importData(old) ?? "", /not a backup this version can load/i);
  const hostile = JSON.parse(`{"version":2,"__proto__":{"polluted":true}}`);
  assert.match(store.importData(hostile) ?? "", /not allowed|not a backup/i);
  assert.match(store.importData({ ...jsonClone(data), funds: "wrong" }) ?? "", /not a backup this version can load/i);
  assert.match(store.importData({ ...jsonClone(data), funds: Array.from({ length: 1000 }, () => data.funds[0]) }) ?? "", /not a backup this version can load/i);
});

test("store importData accepts documented backup wrapper", () => {
  const data = seedData();
  const store = createStore({ storage: null, now: () => NOW });
  const problem = store.importData({ app: "property-fund-tax-compliance", version: data.version, exportedAt: "2026-10-12T09:00:00Z", data: jsonClone(data) });
  assert.equal(problem, null);
});

test("governance hashes, automatic versions, reopen reasons, diffs and seeded versions", () => {
  const data = seedData();
  const reordered = {
    ...data,
    holders: [...data.holders].reverse(),
    tbRows: [...data.tbRows].reverse(),
    manualAdjustments: [...data.manualAdjustments].reverse(),
  };
  assert.equal(inputHash(data, "harbourline"), inputHash(reordered, "harbourline"));
  assert.notEqual(
    inputHash(data, "harbourline"),
    inputHash({ ...data, funds: data.funds.map((fund) => (fund.id === "harbourline" && fund.market === "AU" ? { ...fund, inputs: { ...fund.inputs, cashDistribution: fund.inputs.cashDistribution + 1 } } : fund)) }, "harbourline"),
  );

  for (const fund of data.funds.filter((f) => f.status === "Signed off" || f.status === "In review")) {
    const latest = data.versions.filter((version) => version.fundId === fund.id).at(-1);
    assert.ok(latest, `${fund.id} seeded version`);
    assert.equal(latest.inputHash, inputHash(data, fund.id), `${fund.id} seed version is stale`);
  }

  let next = seedData();
  assert.match(reasonOf(applyAction(next, { type: "reopen", fundId: "harbourline", reason: "bad" }, ctx(next))), /reopen reason/i);
  assert.match(reasonOf(applyAction(next, { type: "reopen", fundId: "harbourline", reason: "x".repeat(501) }, ctx(next))), /reopen reason/i);
  next = must(applyAction(next, { type: "submit", fundId: "coastline" }, ctx(next)));
  next = must(applyAction(next, { type: "approve", fundId: "coastline", level: "review" }, ctx(next, "l-brennan")));
  next = must(applyAction(next, { type: "sign-off", fundId: "coastline" }, ctx(next)));
  next = must(applyAction(next, { type: "reopen", fundId: "coastline", reason: "Verifier needs to test a corrected trial balance" }, ctx(next)));
  assert.deepEqual(next.versions.filter((version) => version.fundId === "coastline").map((version) => version.trigger), ["submit", "sign-off", "reopen"]);
  assert.equal(next.versions.at(-1)?.reason, "Verifier needs to test a corrected trial balance");

  const signed = next.versions.find((version) => version.fundId === "coastline" && version.trigger === "sign-off")!;
  const changed = { ...next, funds: next.funds.map((fund) => (fund.id === "coastline" && fund.market === "AU" ? { ...fund, inputs: { ...fund.inputs, cashDistribution: fund.inputs.cashDistribution + 10000 } } : fund)) };
  const diff = versionDiff(changed, signed, "current", NOW);
  assert.equal(diff.hashEqual, false);
  assert.equal(diff.stale, true);
  assert.ok(diff.inputs.some((row) => row.ref === "input:cashDistribution"));
});

test("manual adjustments affect AU and SG TB-derived inputs and are locked outside Preparing", () => {
  let data = seedData();
  assert.match(reasonOf(applyAction(data, { type: "gov-add-adjustment", fundId: "harbourline", label: "Locked", amount: 100, component: "ausOtherIncome", reason: "Signed off lock test" }, ctx(data, "r-okafor"))), /signed off/i);

  const auBefore = tbView(data, "coastline", NOW);
  data = must(applyAction(data, { type: "gov-add-adjustment", fundId: "coastline", label: "Verifier AU", amount: 12300, component: "ausOtherIncome", reason: "Verifier checks AU manual adjustments" }, ctx(data, "r-okafor")));
  const auAfter = tbView(data, "coastline", NOW);
  assert.ok("ausOtherIncome" in auAfter.derivedInputs && "ausOtherIncome" in auBefore.derivedInputs);
  assert.equal(auAfter.derivedInputs.ausOtherIncome - auBefore.derivedInputs.ausOtherIncome, 12300);
  assert.ok(auAfter.bookToTax.rows.some((row) => row.label === "Manual adjustment: Verifier AU" && row.amount === 12300));

  const sgBefore = tbView(data, "telok-ayer", NOW);
  data = must(applyAction(data, { type: "gov-add-adjustment", fundId: "telok-ayer", label: "Verifier SG", amount: -54300, component: "taxableSpecifiedIncome", reason: "Verifier checks SG manual adjustments" }, ctx(data, "w-l-teo")));
  const sgAfter = tbView(data, "telok-ayer", NOW);
  assert.ok("taxableSpecifiedIncome" in sgAfter.derivedInputs && "taxableSpecifiedIncome" in sgBefore.derivedInputs);
  assert.equal(sgAfter.derivedInputs.taxableSpecifiedIncome - sgBefore.derivedInputs.taxableSpecifiedIncome, -54300);
  assert.ok(sgAfter.bookToTax.rows.some((row) => row.label === "Manual adjustment: Verifier SG" && row.amount === -54300));
});

test("manual adjustments preserve cents in TB-derived inputs", () => {
  let data = seedData();
  const before = tbView(data, "coastline", NOW);
  data = must(applyAction(data, { type: "gov-add-adjustment", fundId: "coastline", label: "Cents", amount: 12345, component: "ausOtherIncome", reason: "Verifier cents precision check" }, ctx(data, "r-okafor")));
  const after = tbView(data, "coastline", NOW);
  assert.ok("ausOtherIncome" in after.derivedInputs && "ausOtherIncome" in before.derivedInputs);
  assert.equal(after.derivedInputs.ausOtherIncome - before.derivedInputs.ausOtherIncome, 12345);
});

test("prior-year book-to-tax values are recomputed from seed TB balances", () => {
  const data = seedData();
  const harbourline = tbView(data, "harbourline", NOW);
  assert.equal(harbourline.bookToTax.rows.at(-1)?.prior, 5962433900);
  assert.equal(harbourline.bookToTax.rows.find((row) => row.label === "Net profit per accounts")?.prior, 8463148100);
  const loyang = tbView(data, "loyang", NOW);
  assert.equal(loyang.bookToTax.resultPrior, 7201023100);
  assert.equal(loyang.bookToTax.rows.find((row) => row.label === "Less: straight-line rent")?.prior, -124058000);
});

test("AU TB resultPrior exposes the prior-year result consistently with the result row", () => {
  const view = tbView(seedData(), "harbourline", NOW);
  assert.equal(view.bookToTax.resultPrior, 5962433900);
});
