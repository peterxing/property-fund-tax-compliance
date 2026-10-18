// The pure side of the Distributions review tabs (src/app/workspaces/distributions/tabs/tabModel.ts), checked against the real seed and the
// real market modules at the fixed "today" of the domain tests: which tab a hash opens, the badges on the tab strip, the Checks list, the
// Withholding table and its reconciliation, which unitholder a statement opens on, how a query is validated and how the audit trail reads.
//   node --disable-warning=ExperimentalWarning --test test/app/distributions-tabs/tabModel.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditFor, fundCalc, getFund, queriesFor, rulesFor, statementDoc } from "../../../src/domain/index.ts";
import { integer } from "../../../src/domain/format.ts";
import type { AppData, Check, FundId, HolderLine, Query } from "../../../src/domain/types.ts";
import { AU_FUNDS, NOW, SG_FUNDS, denied, frozenSeed, ok, seed } from "../../domain/core-fixtures.ts";
import {
  AUTHORITY,
  CHECK_TAGS,
  DEFAULT_REVIEW_TAB,
  HOLDER_PARAM,
  NIL,
  NO_CHECKS,
  QUERY_DENIED_REASON,
  QUERY_ERRORS,
  REGISTER_BALANCED,
  REPLY_ERROR,
  REVIEW_TABS,
  TAB_PARAM,
  auditRows,
  checkCounts,
  checksBadge,
  checksSummary,
  holderOptions,
  holderRow,
  openQueryCount,
  orderChecks,
  queriesBadge,
  queryRaisedMessage,
  queryResolvedMessage,
  reconModel,
  reconSentence,
  registerStatus,
  registerStatusFor,
  remittedSavedMessage,
  replySentMessage,
  resolveStatementHolder,
  reviewTabFromParam,
  statementParams,
  threadModel,
  unitsOnIssueSavedMessage,
  unitsSavedMessage,
  validateQuery,
  validateReply,
  withholdingTable,
  type TabBadge,
} from "../../../src/app/workspaces/distributions/tabs/tabModel.ts";

// ---------------------------------------------------------------------------------------------------------------- helpers
/** The seed, deeply frozen: a model function that changed the data it was given would throw. */
const SEED: AppData = frozenSeed();
const ALL_FUNDS: FundId[] = [...AU_FUNDS, ...SG_FUNDS];

const calcOf = (data: AppData, id: FundId) => fundCalc(data, id, NOW);
const tableOf = (data: AppData, id: FundId) => withholdingTable(getFund(data, id), calcOf(data, id));
const reconOf = (data: AppData, id: FundId) => reconModel(getFund(data, id), calcOf(data, id));
const checksOf = (data: AppData, id: FundId): Check[] => calcOf(data, id).checks;
const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

const exception = (title: string): Check => ({ id: `e-${title}`, severity: "exception", title, detail: "" });
const note = (title: string): Check => ({ id: `n-${title}`, severity: "note", title, detail: "" });
const isException = (check: Check): boolean => check.severity === "exception";

function queryOf(patch: Partial<Query> = {}): Query {
  return { id: "q-x", fundId: "southbank", subject: "A question", status: "open", raisedBy: "D. Harrow", raisedAt: "2026-10-07T11:30:00", messages: [], ...patch };
}

// ---------------------------------------------------------------------------------------------------------------- tabs
describe("which tab the hash opens", () => {
  it("lists the review tabs in order", () => {
    assert.deepEqual(
      REVIEW_TABS.map((tab) => tab.label),
      ["Withholding", "Statements", "Checks", "Queries", "Versions", "Audit trail", "Rules"],
    );
    assert.equal(DEFAULT_REVIEW_TAB, "withholding");
  });

  it("opens each tab by its id", () => {
    for (const { id } of REVIEW_TABS) assert.equal(reviewTabFromParam(id), id);
  });

  it("takes the singular statement and audit-trail, any capitals and stray spaces", () => {
    assert.equal(reviewTabFromParam("statement"), "statements");
    assert.equal(reviewTabFromParam("audit-trail"), "audit");
    assert.equal(reviewTabFromParam(" Queries "), "queries");
    assert.equal(reviewTabFromParam("RULES"), "rules");
  });

  it("opens Withholding when the value is missing or unknown, even a name Object.prototype owns", () => {
    for (const value of [undefined, null, "", " ", "nope", "withholding2", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      assert.equal(reviewTabFromParam(value), "withholding", String(value));
    }
  });

  it("opens Statements on one holder with the parameters the router carries", () => {
    const params = statementParams("h-hl-2");
    assert.deepEqual(params, { tab: "statements", holder: "h-hl-2" });
    assert.equal(reviewTabFromParam(params[TAB_PARAM]), "statements");
    assert.equal(params[HOLDER_PARAM], "h-hl-2");
  });

  it("uses the parameter names the header's open-queries link points at", () => {
    assert.equal(TAB_PARAM, "tab");
    assert.equal(HOLDER_PARAM, "holder");
  });
});

// ---------------------------------------------------------------------------------------------------------------- badges
const BADGES: Record<string, { checks: TabBadge | null; queries: TabBadge | null }> = {
  harbourline: { checks: { text: "1 note", tone: "neutral" }, queries: null },
  southbank: { checks: { text: "2 exceptions", tone: "danger" }, queries: { text: "1 open", tone: "neutral" } },
  wattle: { checks: null, queries: null },
  kurrajong: { checks: { text: "3 exceptions", tone: "danger" }, queries: { text: "2 open", tone: "neutral" } },
  coastline: { checks: { text: "1 exception", tone: "danger" }, queries: null },
  "telok-ayer": { checks: { text: "2 notes", tone: "neutral" }, queries: null },
  loyang: { checks: null, queries: null },
  // Meranti's only query is resolved, so there is nothing open to count.
  meranti: { checks: { text: "2 notes", tone: "neutral" }, queries: null },
  kallang: { checks: { text: "1 exception", tone: "danger" }, queries: null },
};

describe("the badges on the tab strip", () => {
  for (const id of ALL_FUNDS) {
    it(`${id} shows ${JSON.stringify(BADGES[id])}`, () => {
      const expected = BADGES[id];
      assert.ok(expected, `no expectation for ${id}`);
      assert.deepEqual(checksBadge(checksOf(SEED, id)), expected.checks);
      assert.deepEqual(queriesBadge(queriesFor(SEED, id)), expected.queries);
    });
  }

  it("counts the exceptions in preference to the notes, and each in the singular for one", () => {
    assert.deepEqual(checksBadge([note("a"), note("b"), exception("c")]), { text: "1 exception", tone: "danger" });
    assert.deepEqual(checksBadge([exception("a"), exception("b"), note("c")]), { text: "2 exceptions", tone: "danger" });
    assert.deepEqual(checksBadge([note("a")]), { text: "1 note", tone: "neutral" });
    assert.deepEqual(checksBadge([note("a"), note("b"), note("c")]), { text: "3 notes", tone: "neutral" });
    assert.equal(checksBadge([]), null);
  });

  it("counts exceptions and notes apart", () => {
    assert.deepEqual(checkCounts(checksOf(SEED, "southbank")), { exceptions: 2, notes: 2 });
    assert.deepEqual(checkCounts([]), { exceptions: 0, notes: 0 });
  });

  it("counts the open queries only", () => {
    const mixed = [queryOf({ id: "q-a" }), queryOf({ id: "q-b", status: "resolved" }), queryOf({ id: "q-c" })];
    assert.equal(openQueryCount(mixed), 2);
    assert.deepEqual(queriesBadge(mixed), { text: "2 open", tone: "neutral" });
    assert.equal(queriesBadge([queryOf({ status: "resolved" })]), null);
    assert.equal(queriesBadge([]), null);
  });

  it("follows a query being raised, answered and resolved", () => {
    const raised = ok(seed(), "a-moreno", { type: "raise-query", fundId: "southbank", subject: "Cost base workpaper", message: "Please send workpaper TT-07." });
    assert.deepEqual(queriesBadge(queriesFor(raised, "southbank")), { text: "2 open", tone: "neutral" });
    const newest = queriesFor(raised, "southbank")[0]!;
    const answered = ok(raised, "d-harrow", { type: "reply-query", fundId: "southbank", queryId: newest.id, message: "Attached." });
    assert.deepEqual(queriesBadge(queriesFor(answered, "southbank")), { text: "2 open", tone: "neutral" });
    const resolved = ok(answered, "a-moreno", { type: "resolve-query", fundId: "southbank", queryId: newest.id });
    assert.deepEqual(queriesBadge(queriesFor(resolved, "southbank")), { text: "1 open", tone: "neutral" });
  });
});

// ---------------------------------------------------------------------------------------------------------------- checks
const SUMMARIES: Record<string, string> = {
  harbourline: "No exceptions · 1 note",
  southbank: "2 exceptions · 2 notes",
  wattle: "No checks raised",
  kurrajong: "3 exceptions · 2 notes",
  coastline: "1 exception · 2 notes",
  "telok-ayer": "No exceptions · 2 notes",
  loyang: "No checks raised",
  meranti: "No exceptions · 2 notes",
  kallang: "1 exception · 2 notes",
};

describe("the Checks tab", () => {
  it("lists the exceptions before the notes, each group in the order the market module raised it", () => {
    for (const id of ALL_FUNDS) {
      const checks = checksOf(SEED, id);
      const ordered = orderChecks(checks);
      assert.equal(ordered.length, checks.length, id);
      const firstNote = ordered.findIndex((c) => !isException(c));
      if (firstNote >= 0) assert.ok(ordered.slice(firstNote).every((c) => !isException(c)), `${id}: an exception follows a note`);
      assert.deepEqual(ordered.filter(isException).map((c) => c.id), checks.filter(isException).map((c) => c.id), id);
      assert.deepEqual(ordered.filter((c) => !isException(c)).map((c) => c.id), checks.filter((c) => !isException(c)).map((c) => c.id), id);
    }
  });

  it("is stable and leaves the list it was given alone", () => {
    const checks = [note("n1"), exception("e1"), note("n2"), exception("e2")];
    const before = [...checks];
    assert.deepEqual(
      orderChecks(checks).map((c) => c.title),
      ["e1", "e2", "n1", "n2"],
    );
    assert.deepEqual(checks, before);
    assert.deepEqual(orderChecks([]), []);
  });

  it("names the exceptions of Southbank and Kurrajong", () => {
    const titles = (id: FundId) => orderChecks(checksOf(SEED, id)).filter(isException).map((c) => c.title);
    assert.deepEqual(titles("southbank"), ["AMMA statements overdue", "Withholding reconciliation variance"]);
    assert.deepEqual(titles("kurrajong"), ["Unit register out of balance", "AMMA statements overdue", "Withholding reconciliation variance"]);
    assert.deepEqual(titles("wattle"), []);
  });

  for (const id of ALL_FUNDS) {
    it(`${id} is summarised as "${SUMMARIES[id]}"`, () => {
      assert.equal(checksSummary(checksOf(SEED, id)), SUMMARIES[id]);
    });
  }

  it("words the summary for every mix of exceptions and notes", () => {
    assert.equal(checksSummary([]), NO_CHECKS);
    assert.equal(checksSummary([exception("a")]), "1 exception");
    assert.equal(checksSummary([exception("a"), exception("b")]), "2 exceptions");
    assert.equal(checksSummary([exception("a"), note("b")]), "1 exception · 1 note");
    assert.equal(checksSummary([note("a")]), "No exceptions · 1 note");
    assert.equal(checksSummary([note("a"), note("b")]), "No exceptions · 2 notes");
    assert.equal(checksSummary([exception("a"), exception("b"), note("c"), note("d"), note("e")]), "2 exceptions · 3 notes");
  });

  it("tags an exception as bad and a note as a warning, in words", () => {
    assert.deepEqual(CHECK_TAGS.exception, { label: "Exception", tone: "bad" });
    assert.deepEqual(CHECK_TAGS.note, { label: "Note", tone: "warn" });
  });
});

// ---------------------------------------------------------------------------------------------------------------- withholding table
describe("the Withholding table", () => {
  it("has a row for every holder in the order of the register", () => {
    for (const id of ALL_FUNDS) {
      const calc = calcOf(SEED, id);
      const rows = tableOf(SEED, id).rows;
      assert.deepEqual(rows.map((r) => r.id), calc.holders.map((l) => l.holder.id), id);
      assert.deepEqual(rows.map((r) => r.name), calc.holders.map((l) => l.holder.holder), id);
      assert.deepEqual(rows.map((r) => r.units), calc.holders.map((l) => l.holder.units), id);
    }
  });

  it("reads a foreign holder as the notice does", () => {
    const { components, ...row } = tableOf(SEED, "harbourline").rows.find((r) => r.id === "h-hl-3")!;
    assert.equal(components.length, 6);
    assert.deepEqual(row, {
      id: "h-hl-3",
      name: "Sakuragawa Life Assurance",
      country: "Japan",
      status: "Foreign resident — EOI country",
      rates: "15% fund payment · 10% clean building · 10% interest",
      units: 211_902_000,
      unitsText: "211,902,000",
      cash: "A$13,866,900.00",
      withheld: "A$1,374,057.00",
      net: "A$12,492,843.00",
    });
  });

  it("shows each component of that holder with the rate applied and the tax withheld on it, and leaves out the empty ones", () => {
    const row = tableOf(SEED, "harbourline").rows.find((r) => r.id === "h-hl-3")!;
    assert.deepEqual(row.components, [
      { key: "ausOtherIncome", label: "Australian income — other", amount: "A$7,247,760.00", rate: "15%", withheld: "A$1,087,164.00" },
      { key: "cleanBuilding", label: "Clean building MIT income", amount: "A$930,795.00", rate: "10%", withheld: "A$93,079.50" },
      { key: "interest", label: "Australian interest", amount: "A$177,735.00", rate: "10%", withheld: "A$17,773.50" },
      { key: "discountGainTarp", label: "Discounted capital gains — TARP", amount: "A$586,800.00", rate: "15%", withheld: "A$88,020.00" },
      { key: "cgtConcessionTarp", label: "AMIT CGT gross-up amount — TARP", amount: "A$586,800.00", rate: "15%", withheld: "A$88,020.00" },
      { key: "taxDeferred", label: "Other non-attributable amounts", amount: "A$4,337,010.00", rate: "0%", withheld: NIL },
    ]);
    for (const id of ALL_FUNDS) {
      for (const line of calcOf(SEED, id).holders) {
        const shown = holderRow(line, getFund(SEED, id).currency);
        assert.equal(shown.components.length, line.lines.filter((l) => l.amount !== 0).length, `${id} ${line.holder.id}`);
        assert.equal(new Set(shown.components.map((c) => c.key)).size, shown.components.length, `${id} ${line.holder.id}: duplicate keys`);
      }
    }
  });

  it("totals the tax withheld on the components to the tax withheld on the holder", () => {
    for (const id of ALL_FUNDS) {
      for (const line of calcOf(SEED, id).holders) assert.equal(sum(line.lines.map((l) => l.withheld)), line.withheld, `${id} ${line.holder.id}`);
    }
  });

  it("draws nothing withheld as a dash, with the whole cash as the net", () => {
    const resident = tableOf(SEED, "southbank").rows.find((r) => r.id === "h-sb-2")!;
    assert.equal(resident.name, "Eucalypt Industry Super");
    assert.equal(resident.status, "Australian resident");
    assert.equal(resident.rates, "No withholding");
    assert.equal(resident.withheld, NIL);
    assert.equal(resident.net, resident.cash);
    assert.equal(resident.cash, "A$9,442,400.00");
    assert.equal(NIL, "–");
  });

  it("shows every amount to the cent in the fund's own currency", () => {
    for (const id of AU_FUNDS) for (const row of tableOf(SEED, id).rows) assert.match(row.cash, /^A\$[\d,]+\.\d\d$/, `${id} ${row.id}`);
    for (const id of SG_FUNDS) for (const row of tableOf(SEED, id).rows) assert.match(row.cash, /^S\$[\d,]+\.\d\d$/, `${id} ${row.id}`);
  });

  it("totals the rows, so the foot of the table always adds up", () => {
    for (const id of ALL_FUNDS) {
      const calc = calcOf(SEED, id);
      const table = tableOf(SEED, id);
      const fund = getFund(SEED, id);
      assert.equal(table.totals.withheld, reconOf(SEED, id).computed, `${id}: withheld total against the computed withholding`);
      assert.equal(table.totals.units, integer(sum(calc.holders.map((l) => l.holder.units))), id);
      assert.equal(table.unitsOnIssue, fund.unitsOnIssue, id);
      assert.equal(table.currency, fund.currency, id);
    }
    assert.deepEqual(tableOf(SEED, "harbourline").totals, { units: "1,412,680,000", cash: "A$92,446,000.00", withheld: "A$2,504,486.36", net: "A$89,941,513.64" });
    assert.equal(tableOf(SEED, "harbourline").unitsOnIssueText, "1,412,680,000");
    assert.deepEqual(tableOf(SEED, "kallang").totals, { units: "3,402,760,000", cash: "S$35,620,500.00", withheld: "S$837,081.75", net: "S$34,783,418.25" });
  });

  it("says the register matches the units on issue when it does, and how far out it is when it does not", () => {
    for (const id of ALL_FUNDS.filter((fund) => fund !== "kurrajong")) {
      assert.deepEqual(tableOf(SEED, id).register, { balanced: true, text: REGISTER_BALANCED }, id);
    }
    assert.deepEqual(tableOf(SEED, "kurrajong").register, {
      balanced: false,
      text: "Register holds 950,150,000 units against 951,400,000 on issue (1,250,000 units not allocated to a holder).",
    });
    assert.equal(tableOf(SEED, "kurrajong").totals.units, "950,150,000");
    assert.equal(tableOf(SEED, "kurrajong").unitsOnIssueText, "951,400,000");
  });

  it("words a register that holds more than is on issue as over-allocated", () => {
    assert.deepEqual(registerStatus(1_000, 1_000), { balanced: true, text: REGISTER_BALANCED });
    assert.equal(registerStatus(1_000, 900).text, "Register holds 900 units against 1,000 on issue (100 units not allocated to a holder).");
    assert.equal(registerStatus(1_000, 1_250).text, "Register holds 1,250 units against 1,000 on issue (250 units over-allocated).");
    assert.equal(registerStatus(1_000, 1_250).balanced, false);
    assert.equal(registerStatus(1_000, 999).text, "Register holds 999 units against 1,000 on issue (1 unit not allocated to a holder).");
    assert.equal(registerStatus(1_000, 1_001).text, "Register holds 1,001 units against 1,000 on issue (1 unit over-allocated).");
  });

  it("follows the units a preparer edits", () => {
    const fewer = ok(seed(), "r-okafor", { type: "update-holder-units", fundId: "coastline", holderId: "h-cl-1", units: 191_364_000 - 1_000 });
    const under = tableOf(fewer, "coastline");
    assert.equal(under.rows.find((r) => r.id === "h-cl-1")!.unitsText, "191,363,000");
    assert.equal(under.totals.units, "318,939,000");
    assert.deepEqual(under.register, {
      balanced: false,
      text: "Register holds 318,939,000 units against 318,940,000 on issue (1,000 units not allocated to a holder).",
    });
    assert.deepEqual(registerStatusFor(getFund(fewer, "coastline"), calcOf(fewer, "coastline")), under.register);

    const more = ok(seed(), "r-okafor", { type: "update-holder-units", fundId: "coastline", holderId: "h-cl-1", units: 191_364_000 + 500 });
    assert.equal(tableOf(more, "coastline").register.text, "Register holds 318,940,500 units against 318,940,000 on issue (500 units over-allocated).");

    const issued = ok(seed(), "r-okafor", { type: "update-units-on-issue", fundId: "coastline", units: 318_940_001 });
    assert.equal(tableOf(issued, "coastline").unitsOnIssueText, "318,940,001");
    assert.equal(tableOf(issued, "coastline").register.text, "Register holds 318,940,000 units against 318,940,001 on issue (1 unit not allocated to a holder).");
    const restored = ok(issued, "r-okafor", { type: "update-units-on-issue", fundId: "coastline", units: 318_940_000 });
    assert.deepEqual(tableOf(restored, "coastline").register, { balanced: true, text: REGISTER_BALANCED });
  });

  it("does not change the data it reads", () => {
    const data = frozenSeed();
    for (const id of ALL_FUNDS) tableOf(data, id);
    assert.deepEqual(data, SEED);
  });
});

// ---------------------------------------------------------------------------------------------------------------- reconciliation
interface ExpectedRecon {
  status: string;
  headline: string;
  tone: string;
  computed: string;
  remitted: string | null;
  remittedLabel: string;
}

const RECON: Record<string, ExpectedRecon> = {
  harbourline: { status: "reconciled", headline: "Reconciled", tone: "good", computed: "A$2,504,486.36", remitted: "A$2,504,486.36", remittedLabel: "Remitted to the ATO" },
  southbank: {
    status: "under-remitted",
    headline: "Variance A$1,482,000.00 under-remitted",
    tone: "bad",
    computed: "A$3,892,099.25",
    remitted: "A$2,410,099.25",
    remittedLabel: "Remitted to the ATO",
  },
  wattle: { status: "reconciled", headline: "Reconciled", tone: "good", computed: "A$2,742,645.60", remitted: "A$2,742,645.60", remittedLabel: "Remitted to the ATO" },
  kurrajong: {
    status: "under-remitted",
    headline: "Variance A$360,592.50 under-remitted",
    tone: "bad",
    computed: "A$2,452,995.19",
    remitted: "A$2,092,402.69",
    remittedLabel: "Remitted to the ATO",
  },
  coastline: { status: "not-remitted", headline: "Not yet remitted", tone: "neutral", computed: "A$640,637.88", remitted: null, remittedLabel: "Remitted to the ATO" },
  "telok-ayer": { status: "not-remitted", headline: "Not yet remitted", tone: "neutral", computed: "S$1,869,203.20", remitted: null, remittedLabel: "Remitted to IRAS" },
  loyang: { status: "reconciled", headline: "Reconciled", tone: "good", computed: "S$2,792,644.00", remitted: "S$2,792,644.00", remittedLabel: "Remitted to IRAS" },
  meranti: { status: "not-remitted", headline: "Not yet remitted", tone: "neutral", computed: "S$1,529,560.80", remitted: null, remittedLabel: "Remitted to IRAS" },
  kallang: { status: "not-remitted", headline: "Not yet remitted", tone: "neutral", computed: "S$837,081.75", remitted: null, remittedLabel: "Remitted to IRAS" },
};

describe("the withholding reconciliation", () => {
  for (const id of ALL_FUNDS) {
    it(`${id} reads "${RECON[id]?.headline}"`, () => {
      const expected = RECON[id];
      assert.ok(expected, `no expectation for ${id}`);
      assert.deepEqual(reconOf(SEED, id), { ...expected, computedLabel: "Computed withholding" });
    });
  }

  it("names the authority of the market", () => {
    assert.deepEqual(AUTHORITY, { AU: "the ATO", SG: "IRAS" });
  });

  it("calls a remitted amount over or under the computed withholding by the difference", () => {
    const computed = calcOf(SEED, "coastline").recon.computed;
    assert.equal(computed, 64_063_788);
    const step = (remitted: number | null) => reconOf(ok(seed(), "r-okafor", { type: "update-remitted", fundId: "coastline", remitted }), "coastline");

    assert.deepEqual(step(computed), { ...RECON.coastline!, status: "reconciled", headline: "Reconciled", tone: "good", remitted: "A$640,637.88", computedLabel: "Computed withholding" });
    assert.equal(step(70_000_000).headline, "Variance A$59,362.12 over-remitted");
    assert.equal(step(70_000_000).tone, "bad");
    assert.equal(step(60_000_000).headline, "Variance A$40,637.88 under-remitted");
    assert.equal(step(60_000_000).remitted, "A$600,000.00");
  });

  it("goes back to not yet remitted when the amount is cleared", () => {
    const remitted = ok(seed(), "r-okafor", { type: "update-remitted", fundId: "coastline", remitted: 64_063_788 });
    const cleared = ok(remitted, "r-okafor", { type: "update-remitted", fundId: "coastline", remitted: null });
    assert.deepEqual(reconOf(cleared, "coastline"), { ...RECON.coastline, computedLabel: "Computed withholding" });
  });

  it("states a Singapore variance in Singapore dollars", () => {
    const over = ok(seed(), "w-l-teo", { type: "update-remitted", fundId: "telok-ayer", remitted: 187_000_000 });
    assert.equal(reconOf(over, "telok-ayer").headline, "Variance S$796.80 over-remitted");
    assert.equal(reconOf(over, "telok-ayer").remitted, "S$1,870,000.00");
    const exact = ok(seed(), "w-l-teo", { type: "update-remitted", fundId: "telok-ayer", remitted: 186_920_320 });
    assert.equal(reconOf(exact, "telok-ayer").headline, "Reconciled");
  });

  it("words each status as a sentence", () => {
    const aud = getFund(SEED, "coastline").currency;
    const sgd = getFund(SEED, "telok-ayer").currency;
    assert.equal(reconSentence({ computed: 100, remitted: 100, variance: 0, status: "reconciled" }, aud), "Reconciled");
    assert.equal(reconSentence({ computed: 100, remitted: null, variance: null, status: "not-remitted" }, aud), "Not yet remitted");
    assert.equal(reconSentence({ computed: 150_000, remitted: 100_000, variance: 50_000, status: "under-remitted" }, aud), "Variance A$500.00 under-remitted");
    assert.equal(reconSentence({ computed: 100_000, remitted: 120_000, variance: -20_000, status: "over-remitted" }, sgd), "Variance S$200.00 over-remitted");
  });
});

// ---------------------------------------------------------------------------------------------------------------- statements
const DEFAULT_HOLDER: Record<string, string> = {
  harbourline: "h-hl-3",
  southbank: "h-sb-3",
  wattle: "h-wt-3",
  kurrajong: "h-kj-3",
  coastline: "h-cl-3",
  "telok-ayer": "h-ta-4",
  loyang: "h-ly-3",
  meranti: "h-mr-3",
  kallang: "h-kr-4",
};

describe("the Statements tab", () => {
  for (const id of ALL_FUNDS) {
    it(`${id} opens on its first unitholder with tax withheld (${DEFAULT_HOLDER[id]})`, () => {
      const holders = calcOf(SEED, id).holders;
      assert.equal(resolveStatementHolder(holders), DEFAULT_HOLDER[id]);
      assert.equal(resolveStatementHolder(holders, ""), DEFAULT_HOLDER[id]);
      assert.equal(resolveStatementHolder(holders, null), DEFAULT_HOLDER[id]);
      assert.ok(holders.find((l) => l.holder.id === DEFAULT_HOLDER[id])!.withheld > 0);
    });
  }

  it("opens on the holder asked for when it is on this fund's register", () => {
    const holders = calcOf(SEED, "harbourline").holders;
    assert.equal(resolveStatementHolder(holders, "h-hl-2"), "h-hl-2");
    assert.equal(resolveStatementHolder(holders, "h-hl-5"), "h-hl-5");
  });

  it("falls back to the default for a holder that is not on the register", () => {
    const holders = calcOf(SEED, "harbourline").holders;
    assert.equal(resolveStatementHolder(holders, "h-sb-3"), "h-hl-3");
    assert.equal(resolveStatementHolder(holders, "nobody"), "h-hl-3");
    assert.equal(resolveStatementHolder(holders, "__proto__"), "h-hl-3");
  });

  it("opens on the first holder when nobody has tax withheld, and on nobody when the register is empty", () => {
    const untaxed: HolderLine[] = calcOf(SEED, "harbourline").holders.map((line) => ({ ...line, withheld: 0 }));
    assert.equal(resolveStatementHolder(untaxed), "h-hl-1");
    assert.equal(resolveStatementHolder([]), null);
    assert.equal(resolveStatementHolder([], "h-hl-3"), null);
  });

  it("offers every holder in register order as 'name · country'", () => {
    const options = holderOptions(calcOf(SEED, "harbourline").holders);
    assert.deepEqual(options, [
      { value: "h-hl-1", label: "Australian resident unitholders (retail register) · Australia" },
      { value: "h-hl-2", label: "Banksia Super Fund · Australia" },
      { value: "h-hl-3", label: "Sakuragawa Life Assurance · Japan" },
      { value: "h-hl-4", label: "Nordfjell Sovereign Holdings · Norway" },
      { value: "h-hl-5", label: "Offshore nominee account · Non-EOI address" },
    ]);
    assert.deepEqual(holderOptions([]), []);
  });

  it("has a statement to show for every holder of every fund", () => {
    for (const id of ALL_FUNDS) {
      for (const option of holderOptions(calcOf(SEED, id).holders)) {
        const doc = statementDoc(SEED, id, option.value, NOW);
        assert.ok(doc.title.length > 0, `${id} ${option.value}`);
        assert.ok(doc.blocks.length > 0, `${id} ${option.value}`);
        assert.match(doc.fileName, /\.pdf$/, `${id} ${option.value}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------- queries
describe("raising a query", () => {
  it("needs a subject and a message, and keeps the text trimmed", () => {
    assert.deepEqual(validateQuery({ subject: "  Estate sale  ", message: "\n Please confirm the dates. \n" }), {
      ok: true,
      value: { subject: "Estate sale", message: "Please confirm the dates." },
    });
  });

  it("keeps the line breaks inside the message", () => {
    const result = validateQuery({ subject: "Subject", message: "One\n\nTwo" });
    assert.ok(result.ok);
    assert.equal(result.value.message, "One\n\nTwo");
  });

  it("asks for a missing subject first, then a missing message", () => {
    assert.deepEqual(validateQuery({ subject: " ", message: "text" }), { ok: false, errors: { subject: "Enter a subject" }, first: "subject" });
    assert.deepEqual(validateQuery({ subject: "text", message: "\n\t " }), { ok: false, errors: { message: "Enter a message" }, first: "message" });
    assert.deepEqual(validateQuery({ subject: "", message: "" }), {
      ok: false,
      errors: { subject: "Enter a subject", message: "Enter a message" },
      first: "subject",
    });
  });

  it("uses the words of the domain, and the domain accepts what it passes", () => {
    const base = seed();
    assert.equal(denied(base, "a-moreno", { type: "raise-query", fundId: "southbank", subject: "", message: "text" }), QUERY_ERRORS.subject);
    assert.equal(denied(base, "a-moreno", { type: "raise-query", fundId: "southbank", subject: "text", message: "" }), QUERY_ERRORS.message);
    const check = validateQuery({ subject: "  Estate sale  ", message: "  Please confirm.  " });
    assert.ok(check.ok);
    const after = ok(base, "a-moreno", { type: "raise-query", fundId: "southbank", subject: check.value.subject, message: check.value.message });
    assert.equal(queriesFor(after, "southbank")[0]!.subject, "Estate sale");
  });

  it("explains in words why Fund finance cannot change a thread", () => {
    assert.match(QUERY_DENIED_REASON, /permission/);
    assert.match(denied(seed(), "m-castillo", { type: "raise-query", fundId: "southbank", subject: "Subject", message: "Message" }), /permission/);
  });
});

describe("replying to a query", () => {
  it("needs some text, and keeps it trimmed", () => {
    assert.deepEqual(validateReply("  Yes, attached.  "), { ok: true, message: "Yes, attached." });
    assert.deepEqual(validateReply(""), { ok: false, error: "Enter a reply" });
    assert.deepEqual(validateReply(" \n\t "), { ok: false, error: REPLY_ERROR });
  });
});

describe("the query threads", () => {
  it("reads an open thread as the capture does", () => {
    const [thread, ...rest] = queriesFor(SEED, "southbank").map(threadModel);
    assert.equal(rest.length, 0);
    assert.deepEqual(thread, {
      id: "q-3",
      subject: "Estate sale: discount eligibility",
      open: true,
      statusLabel: "Open",
      raised: "Raised by D. Harrow · 7 Oct 2026, 11:30",
      messages: [
        {
          key: "q-3-0",
          by: "D. Harrow",
          at: "2026-10-07T11:30:00",
          atText: "7 Oct 2026, 11:30",
          text: "The estate sale settled on 26 June 2026. Please provide the contract dates and the cost base workpaper to confirm the 12-month holding period for the discount.",
        },
      ],
    });
  });

  it("reads a resolved thread with its whole conversation", () => {
    const [thread] = queriesFor(SEED, "meranti").map(threadModel);
    assert.equal(thread!.id, "q-4");
    assert.equal(thread!.open, false);
    assert.equal(thread!.statusLabel, "Resolved");
    assert.equal(thread!.raised, "Raised by S. Lim · 6 Oct 2026, 13:40");
    assert.deepEqual(
      thread!.messages.map((m) => [m.key, m.by, m.atText]),
      [
        ["q-4-0", "S. Lim", "6 Oct 2026, 13:40"],
        ["q-4-1", "W. L. Teo", "7 Oct 2026, 17:05"],
        ["q-4-2", "S. Lim", "8 Oct 2026, 10:20"],
      ],
    );
  });

  it("lists the newest thread first and every thread once", () => {
    const threads = queriesFor(SEED, "kurrajong").map(threadModel);
    assert.deepEqual(threads.map((t) => t.id), ["q-2", "q-1"]);
    assert.deepEqual(threads[1]!.messages.map((m) => m.by), ["L. Brennan", "R. Okafor"]);
    for (const id of ALL_FUNDS) {
      const ids = queriesFor(SEED, id).map(threadModel).map((t) => t.id);
      assert.equal(new Set(ids).size, ids.length, id);
    }
  });

  it("puts a query raised now first, then adds the reply and the resolution to its thread", () => {
    const raised = ok(seed(), "a-moreno", { type: "raise-query", fundId: "southbank", subject: "Cost base workpaper", message: "Please send workpaper TT-07." });
    const [first, second] = queriesFor(raised, "southbank").map(threadModel);
    assert.equal(first!.subject, "Cost base workpaper");
    assert.equal(first!.open, true);
    assert.equal(first!.raised, "Raised by A. Moreno · 13 Oct 2026, 11:30");
    assert.deepEqual(first!.messages.map((m) => [m.by, m.text]), [["A. Moreno", "Please send workpaper TT-07."]]);
    assert.equal(second!.id, "q-3");

    const answered = ok(raised, "d-harrow", { type: "reply-query", fundId: "southbank", queryId: first!.id, message: "Attached." });
    const replied = queriesFor(answered, "southbank").map(threadModel).find((t) => t.id === first!.id)!;
    assert.deepEqual(replied.messages.map((m) => [m.key, m.by, m.text]), [
      [`${first!.id}-0`, "A. Moreno", "Please send workpaper TT-07."],
      [`${first!.id}-1`, "D. Harrow", "Attached."],
    ]);

    const resolved = ok(answered, "a-moreno", { type: "resolve-query", fundId: "southbank", queryId: first!.id });
    const closed = queriesFor(resolved, "southbank").map(threadModel).find((t) => t.id === first!.id)!;
    assert.equal(closed.open, false);
    assert.equal(closed.statusLabel, "Resolved");
  });

  it("words what the live region says", () => {
    assert.equal(queryRaisedMessage("Cost base workpaper"), "Query raised: Cost base workpaper.");
    assert.equal(replySentMessage("Cost base workpaper"), "Reply sent on Cost base workpaper.");
    assert.equal(queryResolvedMessage("Cost base workpaper"), "Query resolved: Cost base workpaper.");
  });
});

// ---------------------------------------------------------------------------------------------------------------- audit trail
describe("the Audit trail tab", () => {
  it("reads the newest entry of Southbank first, as the capture does", () => {
    const rows = auditRows(auditFor(SEED, "southbank"));
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0], {
      id: "a-06b",
      at: "2026-10-07T11:30:00",
      atText: "7 Oct 2026, 11:30",
      action: "Query raised",
      actor: "D. Harrow",
      detail: "Estate sale: discount eligibility",
    });
    assert.deepEqual(
      rows.map((r) => r.action),
      ["Query raised", "Submitted for review", "Discounted capital gains — TARP updated", "Trust components loaded"],
    );
    assert.equal(rows[2]!.detail, "A$0 → A$9,880,000 — estate sale settled 26 Jun 2026");
  });

  it("runs from the newest entry to the oldest on every fund, with every entry once", () => {
    for (const id of ALL_FUNDS) {
      const entries = auditFor(SEED, id);
      const rows = auditRows(entries);
      assert.equal(rows.length, entries.length, id);
      assert.deepEqual(rows.map((r) => r.id), entries.map((e) => e.id), id);
      for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1]!.at >= rows[i]!.at, `${id}: ${rows[i - 1]!.id} is older than ${rows[i]!.id}`);
      assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, id);
    }
  });

  it("leaves an entry without a detail with an empty one", () => {
    const approved = auditRows(auditFor(SEED, "harbourline")).find((r) => r.action === "Approved — tax agent")!;
    assert.equal(approved.detail, "");
    assert.equal(approved.actor, "D. Harrow");
    assert.equal(approved.atText, "7 Sep 2026, 10:05");
    assert.equal(auditRows([{ id: "x", fundId: "wattle", at: "2026-01-02T03:04:00", actor: "Someone", action: "Did a thing" }])[0]!.detail, "");
  });

  it("keeps the order it is given", () => {
    const entries = auditFor(SEED, "kurrajong");
    assert.deepEqual(auditRows([...entries].reverse()).map((r) => r.id), [...entries].reverse().map((e) => e.id));
    assert.deepEqual(auditRows([]), []);
  });

  it("shows what a preparer just did at the top, newest first even when the minute is the same", () => {
    const units = ok(seed(), "r-okafor", { type: "update-holder-units", fundId: "coastline", holderId: "h-cl-1", units: 191_000_000 });
    const remitted = ok(units, "r-okafor", { type: "update-remitted", fundId: "coastline", remitted: 64_063_788 });
    const rows = auditRows(auditFor(remitted, "coastline"));
    assert.deepEqual(rows.slice(0, 2).map((r) => [r.action, r.actor, r.atText]), [
      ["Withholding remitted updated", "R. Okafor", "13 Oct 2026, 11:30"],
      ["Unitholder register updated", "R. Okafor", "13 Oct 2026, 11:30"],
    ]);
    assert.equal(rows.length, 3);
  });

  it("records raising, answering and resolving a query", () => {
    const raised = ok(seed(), "a-moreno", { type: "raise-query", fundId: "southbank", subject: "Cost base workpaper", message: "Please send TT-07." });
    const id = queriesFor(raised, "southbank")[0]!.id;
    const answered = ok(raised, "d-harrow", { type: "reply-query", fundId: "southbank", queryId: id, message: "Attached." });
    const resolved = ok(answered, "a-moreno", { type: "resolve-query", fundId: "southbank", queryId: id });
    assert.deepEqual(
      auditRows(auditFor(resolved, "southbank")).slice(0, 3).map((r) => [r.action, r.actor]),
      [
        ["Query resolved", "A. Moreno"],
        ["Query answered", "D. Harrow"],
        ["Query raised", "A. Moreno"],
      ],
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------- rules
describe("the Rules tab", () => {
  it("has a titled table with something in every cell for every fund", () => {
    for (const id of ALL_FUNDS) {
      const rules = rulesFor(getFund(SEED, id));
      assert.ok(rules.title.length > 0, id);
      assert.ok(rules.rows.length > 0, id);
      for (const row of rules.rows) {
        assert.ok(row.item.trim().length > 0, `${id}: an item is empty`);
        assert.ok(row.treatment.trim().length > 0, `${id}: ${row.item} has no treatment`);
        assert.ok(row.basis.trim().length > 0, `${id}: ${row.item} has no basis`);
      }
    }
  });

  it("is the market's own table", () => {
    assert.match(rulesFor(getFund(SEED, "southbank")).title, /Australian AMITs/);
    assert.deepEqual(rulesFor(getFund(SEED, "southbank")), rulesFor(getFund(SEED, "harbourline")));
    assert.notDeepEqual(rulesFor(getFund(SEED, "southbank")), rulesFor(getFund(SEED, "loyang")));
  });
});

// ---------------------------------------------------------------------------------------------------------------- announcements
describe("what the live region says after a save", () => {
  it("names the holder and says whether the register still matches", () => {
    assert.equal(
      unitsSavedMessage("Kestrel Pension Plan", registerStatus(1_000, 1_000)),
      "Saved: Units held by Kestrel Pension Plan. Register matches the units on issue.",
    );
    assert.equal(
      unitsSavedMessage("Kestrel Pension Plan", registerStatus(1_000, 900)),
      "Saved: Units held by Kestrel Pension Plan. Register holds 900 units against 1,000 on issue (100 units not allocated to a holder).",
    );
    assert.equal(unitsOnIssueSavedMessage(registerStatus(1_000, 1_000)), "Saved: Units on issue. Register matches the units on issue.");
  });

  it("gives the result of the reconciliation after the amount remitted is saved", () => {
    assert.equal(remittedSavedMessage("Reconciled"), "Saved: Withholding remitted. Reconciled.");
    assert.equal(remittedSavedMessage("Variance A$1,482,000.00 under-remitted"), "Saved: Withholding remitted. Variance A$1,482,000.00 under-remitted.");
    assert.equal(remittedSavedMessage("Not yet remitted"), "Saved: Withholding remitted. Not yet remitted.");
  });
});
