// The Distributions workspace's logic with no React: what each key figure, table cell and amount box says, for every seeded fund, against the
// reference captures. The real selectors and actions run underneath, so a change in the domain that moves a number shows up here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inputLabel } from "../../../src/domain/core/labels.ts";
import { money, pct, ratePct } from "../../../src/domain/format.ts";
import { applyAction, fundCalc, workflowView } from "../../../src/domain/index.ts";
import { trusteePosition } from "../../../src/domain/sg/withholding.ts";
import type { AppData, ComponentLine, FundCalc, FundId } from "../../../src/domain/types.ts";
import {
  AMOUNT_RULES,
  COST_BASE_EXCESS,
  COST_BASE_SHORTFALL,
  COST_BASE_UNCHANGED,
  EDITING_HINT,
  NIL,
  PER_UNIT_DECIMALS,
  amountText,
  distributionTable,
  emptyChartMessage,
  emptyTableMessage,
  foreignHoldersText,
  inputAction,
  inputFields,
  inputValue,
  kpiModels,
  panelNote,
  parseAmount,
  perUnitText,
  savedMessage,
  tableColumns,
} from "../../../src/app/workspaces/distributions/model.ts";
import { AU_FUNDS, NOW, PERSONAS, SG_FUNDS, ctxOf, fundOf, ok, seed } from "../../domain/core-fixtures.ts";

const data = seed();
const ALL_FUNDS = [...AU_FUNDS, ...SG_FUNDS];
const calcOf = (id: FundId, from: AppData = data): FundCalc => fundCalc(from, id, NOW);

/** One key figure the way the reference prints it: LABEL, value (with the per-unit figure after it), supporting line. */
const printed = (id: FundId, from: AppData = data): Array<[string, string, string]> =>
  kpiModels(fundOf(from, id), calcOf(id, from)).map((k) => [k.label.toUpperCase(), k.unit ? `${k.value} ${k.unit}` : k.value, k.sub]);

const AU_FUND_PAYMENT_SUB = "Australian income excluding interest, with TARP gains grossed up";
const SG_PAYOUT_SUB = "Tax transparency needs at least 90% for the year";

/** The cells of a table row after its label: amount, cents per unit, then one per destination column. */
const cellsOf = (row: { amount: string; perUnit: string; cells: string[] }): string[] => [row.amount, row.perUnit, ...row.cells];

describe("key figures against the reference captures", () => {
  it("Australian funds: fund payment, AMIT cost base net amount and withholding computed", () => {
    const expected: Record<string, Array<[string, string, string]>> = {
      harbourline: [
        ["FUND PAYMENT", "A$62,347,700", AU_FUND_PAYMENT_SUB],
        ["AMIT COST BASE NET AMOUNT", "A$28,913,400 2.0467 c/unit", "Excess — members decrease their cost base"],
        ["WITHHOLDING COMPUTED", "A$2,504,486", "3 foreign holders on the register"],
      ],
      southbank: [
        ["FUND PAYMENT", "A$51,626,250", AU_FUND_PAYMENT_SUB],
        ["AMIT COST BASE NET AMOUNT", "A$4,816,860 0.7040 c/unit", "Shortfall — members increase their cost base"],
        ["WITHHOLDING COMPUTED", "A$3,892,099", "2 foreign holders on the register"],
      ],
      wattle: [
        ["FUND PAYMENT", "A$112,315,700", AU_FUND_PAYMENT_SUB],
        ["AMIT COST BASE NET AMOUNT", "A$14,430,500 0.6854 c/unit", "Excess — members decrease their cost base"],
        ["WITHHOLDING COMPUTED", "A$2,742,646", "2 foreign holders on the register"],
      ],
      kurrajong: [
        ["FUND PAYMENT", "A$39,859,900", AU_FUND_PAYMENT_SUB],
        ["AMIT COST BASE NET AMOUNT", "A$17,658,200 1.8560 c/unit", "Excess — members decrease their cost base"],
        ["WITHHOLDING COMPUTED", "A$2,452,995", "3 foreign holders on the register"],
      ],
      coastline: [
        ["FUND PAYMENT", "A$16,970,450", AU_FUND_PAYMENT_SUB],
        ["AMIT COST BASE NET AMOUNT", "A$2,760,450 0.8655 c/unit", "Excess — members decrease their cost base"],
        ["WITHHOLDING COMPUTED", "A$640,638", "2 foreign holders on the register"],
      ],
    };
    for (const id of AU_FUNDS) assert.deepEqual(printed(id), expected[id], id);
  });

  it("Singapore funds: taxable specified income, taxable payout and trustee tax on retained income", () => {
    const expected: Record<string, Array<[string, string, string]>> = {
      "telok-ayer": [
        ["TAXABLE SPECIFIED INCOME", "S$58,412,600", "Per the period's tax computation"],
        ["TAXABLE PAYOUT", "100.0%", SG_PAYOUT_SUB],
        ["TRUSTEE TAX ON RETAINED INCOME", "S$0", "17% of S$0 retained"],
      ],
      loyang: [
        ["TAXABLE SPECIFIED INCOME", "S$71,240,900", "Per the period's tax computation"],
        ["TAXABLE PAYOUT", "98.0%", SG_PAYOUT_SUB],
        ["TRUSTEE TAX ON RETAINED INCOME", "S$242,216", "17% of S$1,424,800 retained"],
      ],
      meranti: [
        ["TAXABLE SPECIFIED INCOME", "S$27,664,300", "Per the period's tax computation"],
        ["TAXABLE PAYOUT", "97.0%", SG_PAYOUT_SUB],
        ["TRUSTEE TAX ON RETAINED INCOME", "S$141,083", "17% of S$829,900 retained"],
      ],
      kallang: [
        ["TAXABLE SPECIFIED INCOME", "S$41,906,500", "Per the period's tax computation"],
        ["TAXABLE PAYOUT", "85.0%", SG_PAYOUT_SUB],
        ["TRUSTEE TAX ON RETAINED INCOME", "S$1,068,620", "17% of S$6,286,000 retained"],
      ],
    };
    for (const id of SG_FUNDS) assert.deepEqual(printed(id), expected[id], id);
  });

  it("every fund gets three key figures with distinct ids", () => {
    for (const id of ALL_FUNDS) {
      const kpis = kpiModels(fundOf(data, id), calcOf(id));
      assert.equal(kpis.length, 3, id);
      assert.equal(new Set(kpis.map((k) => k.id)).size, 3, id);
    }
  });

  it("the cost base figure is the size of the adjustment and the line under it carries the direction", () => {
    const southbank = calcOf("southbank");
    assert.ok(southbank.au!.costBaseNet < 0, "Southbank's attributed amounts exceed its cash");
    const [, costBase] = kpiModels(fundOf(data, "southbank"), southbank);
    assert.equal(costBase!.value, "A$4,816,860");
    assert.equal(costBase!.sub, COST_BASE_SHORTFALL);

    const wattle = calcOf("wattle");
    assert.ok(wattle.au!.costBaseNet > 0);
    assert.equal(kpiModels(fundOf(data, "wattle"), wattle)[1]!.sub, COST_BASE_EXCESS);

    const level: FundCalc = { ...wattle, au: { ...wattle.au!, costBaseNet: 0 } };
    const [, none] = kpiModels(fundOf(data, "wattle"), level);
    assert.equal(none!.value, "A$0");
    assert.equal(none!.unit, "0.0000 c/unit");
    assert.equal(none!.sub, COST_BASE_UNCHANGED);
  });

  it("counts the foreign holders on the register, in the singular, the plural and when there are none", () => {
    assert.equal(foreignHoldersText(3), "3 foreign holders on the register");
    assert.equal(foreignHoldersText(1), "1 foreign holder on the register");
    assert.equal(foreignHoldersText(0), "No foreign holders on the register");
    const harbourline = calcOf("harbourline");
    assert.equal(harbourline.au!.foreignHolderCount, 3);
    const resident: FundCalc = { ...harbourline, au: { ...harbourline.au!, foreignHolderCount: 0 } };
    assert.equal(kpiModels(fundOf(data, "harbourline"), resident)[2]!.sub, "No foreign holders on the register");
  });

  it("reads the trustee rate and the payout threshold from the engine, and agrees with the module's own trustee tax", () => {
    for (const id of SG_FUNDS) {
      const fund = fundOf(data, id);
      if (fund.market !== "SG") throw new Error(`${id} should be a Singapore fund`);
      const calc = calcOf(id);
      const position = trusteePosition(fund.periodEnd, fund.inputs.taxableSpecifiedIncome, fund.inputs.taxableDistributed);
      assert.equal(position.trusteeTax, calc.sg!.trusteeTax, `${id}: trustee tax`);
      assert.equal(position.retained, calc.sg!.retained, `${id}: retained`);
      const [, payout, tax] = kpiModels(fund, calc);
      assert.equal(payout!.sub, `Tax transparency needs at least ${pct(position.thresholdPct, 0)} for the year`);
      assert.equal(tax!.sub, `${ratePct(position.rate)} of ${money(calc.sg!.retained, "SGD")} retained`);
    }
  });

  it("flags a payout below the threshold and nothing else; no income at all shows a dash, not a percentage", () => {
    const tones = Object.fromEntries(SG_FUNDS.map((id) => [id, kpiModels(fundOf(data, id), calcOf(id)).map((k) => k.tone)]));
    assert.deepEqual(tones, {
      "telok-ayer": ["default", "default", "default"],
      loyang: ["default", "default", "default"],
      meranti: ["default", "default", "default"],
      kallang: ["default", "warn", "default"],
    });
    for (const id of AU_FUNDS) assert.ok(kpiModels(fundOf(data, id), calcOf(id)).every((k) => k.tone === "default"), id);

    const kallang = calcOf("kallang");
    const noIncome: FundCalc = { ...kallang, sg: { ...kallang.sg!, payoutRatio: null } };
    const [, payout] = kpiModels(fundOf(data, "kallang"), noIncome);
    assert.equal(payout!.value, NIL);
    assert.equal(payout!.tone, "default");
  });
});

describe("the components table", () => {
  it("has a row for each component that has an amount, in the module's order, with its treatment line", () => {
    for (const id of ALL_FUNDS) {
      const calc = calcOf(id);
      const table = distributionTable(fundOf(data, id), calc);
      assert.deepEqual(
        table.rows.map((r) => [r.key, r.label, r.treatment]),
        calc.components.filter((c) => c.amount !== 0).map((c) => [c.key, c.label, c.treatment]),
        id,
      );
    }
  });

  it("leaves out the components with nothing in them, as the reference does", () => {
    const keysOf = (id: FundId) => distributionTable(fundOf(data, id), calcOf(id)).rows.map((r) => r.key);
    // The reference's Southbank: four lines, then the total and the cash row.
    assert.deepEqual(keysOf("southbank"), ["ausOtherIncome", "interest", "discountGainTarp", "cgtConcessionTarp"]);
    assert.deepEqual(keysOf("harbourline"), ["ausOtherIncome", "cleanBuilding", "interest", "discountGainTarp", "cgtConcessionTarp", "taxDeferred"]);
    assert.deepEqual(keysOf("wattle"), ["ausOtherIncome", "interest", "discountGainTarp", "cgtConcessionTarp", "otherGainTarp", "taxDeferred"]);
    assert.deepEqual(keysOf("kurrajong"), ["ausOtherIncome", "ncmi", "interest", "taxDeferred"]);
    assert.deepEqual(keysOf("coastline"), ["ausOtherIncome", "interest", "foreignIncome", "taxDeferred"]);
    assert.deepEqual(keysOf("telok-ayer"), ["taxableDistributed", "taxExemptDistribution", "capitalDistribution"]);
    assert.deepEqual(keysOf("loyang"), ["taxableDistributed", "capitalDistribution"]);
    assert.deepEqual(keysOf("meranti"), ["taxableDistributed", "taxExemptDistribution"]);
    assert.deepEqual(keysOf("kallang"), ["taxableDistributed"]);

    for (const id of ALL_FUNDS) {
      const shown = new Set(keysOf(id));
      for (const line of calcOf(id).components.filter((c) => !shown.has(c.key))) {
        assert.deepEqual([line.amount, line.toGross, line.toNet, line.withheld, line.unallocated], [0, 0, 0, 0, 0], `${id}/${line.key}: only a line with nothing in it is left out`);
      }
    }
  });

  it("keeps a line with no amount, in its place, if a column shown has a figure for it (the module does not produce one)", () => {
    const harbourline = fundOf(data, "harbourline");
    const calc = calcOf("harbourline");
    const stray = (key: string, patch: Partial<ComponentLine>): FundCalc => ({
      ...calc,
      components: calc.components.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    });

    const withNet = distributionTable(harbourline, stray("ncmi", { toNet: 12_300_000 }));
    assert.deepEqual(withNet.rows.map((r) => r.key), ["ausOtherIncome", "ncmi", "cleanBuilding", "interest", "discountGainTarp", "cgtConcessionTarp", "taxDeferred"]);
    assert.deepEqual(cellsOf(withNet.rows[1]!), [NIL, NIL, NIL, "A$123,000", NIL]);

    const withUnallocated = distributionTable(harbourline, stray("excludedNcmi", { unallocated: 5_000_000 }));
    assert.deepEqual(withUnallocated.columns.map((c) => c.key), ["gross", "net", "withheld", "unallocated"], "the column appears for the figure that needs it");
    assert.deepEqual(withUnallocated.rows.map((r) => r.key), ["ausOtherIncome", "excludedNcmi", "cleanBuilding", "interest", "discountGainTarp", "cgtConcessionTarp", "taxDeferred"]);
    assert.deepEqual(cellsOf(withUnallocated.rows[1]!), [NIL, NIL, NIL, NIL, NIL, "A$50,000"]);
  });

  it("has a column for each destination, and shows units not on the register only when some of the distribution goes there", () => {
    assert.deepEqual(
      tableColumns(calcOf("harbourline")).map((c) => c.label),
      ["Australian residents", "Foreign investors, net", "Withheld for the ATO"],
    );
    assert.deepEqual(
      tableColumns(calcOf("telok-ayer")).map((c) => c.label),
      ["Paid gross", "Non-residents & others, net", "Withheld for IRAS"],
    );
    assert.deepEqual(
      tableColumns(calcOf("kurrajong")).map((c) => c.label),
      ["Australian residents", "Foreign investors, net", "Withheld for the ATO", "Units not on register"],
    );
    for (const id of ALL_FUNDS) {
      const calc = calcOf(id);
      const hasUnallocated = calc.components.some((c) => c.unallocated !== 0);
      assert.equal(tableColumns(calc).some((c) => c.key === "unallocated"), hasUnallocated, id);
      assert.equal(hasUnallocated, id === "kurrajong", `${id}: only Kurrajong has units missing from its register`);
    }
  });

  it("matches the reference rows: Harbourline", () => {
    const table = distributionTable(fundOf(data, "harbourline"), calcOf("harbourline"));
    const row = (key: string) => table.rows.find((r) => r.key === key)!;
    assert.deepEqual(cellsOf(row("ausOtherIncome")), ["A$48,318,400", "3.4203", "A$35,688,454", "A$10,652,902", "A$1,977,044"]);
    assert.deepEqual(cellsOf(row("cleanBuilding")), ["A$6,205,300", "0.4393", "A$4,583,297", "A$1,445,667", "A$176,336"]);
    assert.deepEqual(cellsOf(row("interest")), ["A$1,184,900", "0.0839", "A$875,179", "A$278,749", "A$30,972"]);
    assert.deepEqual(cellsOf(row("discountGainTarp")), ["A$3,912,000", "0.2769", "A$2,889,442", "A$862,490", "A$160,067"]);
    assert.deepEqual(cellsOf(row("cgtConcessionTarp")), ["A$3,912,000", "0.2769", "A$2,889,442", "A$862,490", "A$160,067"]);
    assert.deepEqual(cellsOf(row("taxDeferred")), ["A$28,913,400", "2.0467", "A$21,355,727", "A$7,557,673", NIL]);
    assert.deepEqual(table.total, {
      label: "Total by tax character",
      amount: "A$92,446,000",
      perUnit: "6.5440",
      cells: ["A$68,281,542", "A$21,659,972", "A$2,504,486"],
    });
    assert.deepEqual(table.cash, { label: "Cash distribution", note: "Paid for the income year", amount: "A$92,446,000", perUnit: "6.5440" });
  });

  it("matches the reference totals: Southbank, Wattle, Kurrajong, Coastline", () => {
    const totalOf = (id: FundId) => distributionTable(fundOf(data, id), calcOf(id)).total;
    assert.deepEqual(totalOf("wattle"), { label: "Total by tax character", amount: "A$129,688,000", perUnit: "6.1600", cells: ["A$108,937,920", "A$18,007,434", "A$2,742,646"] });
    assert.deepEqual(totalOf("kurrajong"), {
      label: "Total by tax character",
      amount: "A$58,036,000",
      perUnit: "6.1001",
      cells: ["A$40,625,200", "A$14,881,554", "A$2,452,995", "A$76,251"],
    });
    const southbank = distributionTable(fundOf(data, "southbank"), calcOf("southbank"));
    assert.equal(southbank.total.amount, "A$52,028,860");
    assert.equal(southbank.cash!.amount, "A$47,212,000", "the cash row is what was paid, not what was attributed");
    assert.equal(southbank.rows.find((r) => r.key === "ausOtherIncome")!.amount, "A$31,866,250");
    const coastline = distributionTable(fundOf(data, "coastline"), calcOf("coastline"));
    assert.equal(coastline.total.amount, "A$21,048,000");
    assert.equal(coastline.cash!.amount, "A$21,048,000");
  });

  it("matches the reference rows and total: Telok Ayer", () => {
    const table = distributionTable(fundOf(data, "telok-ayer"), calcOf("telok-ayer"));
    assert.deepEqual(
      table.rows.map((r) => [r.label, r.treatment]),
      [
        ["Taxable income distribution", "0% individuals & qualifying · 10% qualifying non-residents · 17% others"],
        ["Tax-exempt income distribution", "Not taxable · no withholding"],
        ["Capital distribution", "Not taxable · reduces cost of units for traders"],
      ],
    );
    assert.deepEqual(cellsOf(table.rows[0]!), ["S$58,412,600", "1.3789", "S$43,809,450", "S$12,733,947", "S$1,869,203"]);
    assert.deepEqual(cellsOf(table.rows[1]!), ["S$3,118,400", "0.0736", "S$2,338,800", "S$779,600", NIL]);
    assert.deepEqual(cellsOf(table.rows[2]!), ["S$1,905,800", "0.0450", "S$1,429,350", "S$476,450", NIL]);
    assert.deepEqual(table.total, { label: "Total distribution", amount: "S$63,436,800", perUnit: "1.4975", cells: ["S$47,577,600", "S$13,989,997", "S$1,869,203"] });
    assert.equal(table.cash, null, "a Singapore fund has no separate cash row");
  });

  it("the total row is the module's total and its destination columns add up to it, for every fund", () => {
    for (const id of ALL_FUNDS) {
      const fund = fundOf(data, id);
      const calc = calcOf(id);
      const table = distributionTable(fund, calc);
      const sum = (pick: (line: ComponentLine) => number) => calc.components.reduce((total, line) => total + pick(line), 0);

      assert.equal(sum((c) => c.amount), calc.characterTotal, `${id}: the lines add up to the total by tax character`);
      assert.equal(sum((c) => c.toGross) + sum((c) => c.toNet) + sum((c) => c.withheld) + sum((c) => c.unallocated), calc.characterTotal, `${id}: the destinations add up`);
      assert.equal(sum((c) => c.withheld), calc.withheld, `${id}: withheld`);

      assert.equal(table.total.amount, amountText(calc.characterTotal, calc.currency), `${id}: total amount`);
      const byKey = Object.fromEntries(table.columns.map((column, index) => [column.key, table.total.cells[index]]));
      assert.equal(byKey.gross, amountText(sum((c) => c.toGross), calc.currency), `${id}: gross`);
      assert.equal(byKey.net, amountText(sum((c) => c.toNet), calc.currency), `${id}: net`);
      assert.equal(byKey.withheld, amountText(calc.withheld, calc.currency), `${id}: withheld`);
      assert.equal(table.total.cells.length, table.columns.length, `${id}: one total per column`);
      for (const row of table.rows) assert.equal(row.cells.length, table.columns.length, `${id}/${row.key}: one cell per column`);

      // The lines the table leaves out are nil, so what it lists still adds up to the total.
      const shown = new Set(table.rows.map((r) => r.key));
      const listed = calc.components.filter((line) => shown.has(line.key));
      const listedSum = (pick: (line: ComponentLine) => number) => listed.reduce((total, line) => total + pick(line), 0);
      assert.equal(listedSum((c) => c.amount), calc.characterTotal, `${id}: the rows listed add up to the total by tax character`);
      assert.equal(listedSum((c) => c.toGross), sum((c) => c.toGross), `${id}: gross`);
      assert.equal(listedSum((c) => c.toNet), sum((c) => c.toNet), `${id}: net`);
      assert.equal(listedSum((c) => c.withheld), calc.withheld, `${id}: withheld`);
      assert.equal(listedSum((c) => c.unallocated), sum((c) => c.unallocated), `${id}: units not on the register`);
    }
  });

  it("writes cents per unit to four decimal places for both markets", () => {
    assert.equal(PER_UNIT_DECIMALS, 4);
    for (const id of ALL_FUNDS) {
      const table = distributionTable(fundOf(data, id), calcOf(id));
      for (const row of table.rows) assert.match(row.perUnit, new RegExp(`^\\d+\\.\\d{${PER_UNIT_DECIMALS}}$`), `${id}/${row.key}`);
      assert.match(table.total.perUnit, /^\d+\.\d{4}$/, id);
    }
  });

  it("the Australian table ends with the cash row and a Singapore table has none", () => {
    for (const id of AU_FUNDS) {
      const table = distributionTable(fundOf(data, id), calcOf(id));
      assert.equal(table.cash?.label, "Cash distribution", id);
      assert.equal(table.total.label, "Total by tax character", id);
    }
    for (const id of SG_FUNDS) {
      const table = distributionTable(fundOf(data, id), calcOf(id));
      assert.equal(table.cash, null, id);
      assert.equal(table.total.label, "Total distribution", id);
    }
  });
});

describe("zero and negative amounts", () => {
  it("writes nothing as an en dash, never A$0 or S$0", () => {
    assert.equal(NIL, "\u2013");
    assert.equal(amountText(0, "AUD"), NIL);
    assert.equal(amountText(0, "SGD"), NIL);
    assert.equal(perUnitText(0), NIL);
    assert.equal(amountText(12_300_000, "AUD"), "A$123,000");
    assert.equal(perUnitText(1.5), "1.5000");
  });

  it("a line with no amount is not a row, and a zero cell in a line with an amount is a dash", () => {
    const calc = calcOf("harbourline");
    const harbourline = distributionTable(fundOf(data, "harbourline"), calc);
    const idle = calc.components.filter((c) => c.amount === 0).map((c) => c.key);
    assert.deepEqual(idle, ["ncmi", "excludedNcmi", "otherGainTarp", "foreignIncome"]);
    for (const key of idle) assert.ok(!harbourline.rows.some((r) => r.key === key), `${key}: nothing to show, so no row`);
    for (const row of harbourline.rows) assert.ok(cellsOf(row).some((cell) => cell !== NIL), `${row.key}: a row has a figure to show`);
    const deferred = harbourline.rows.find((r) => r.key === "taxDeferred")!;
    assert.equal(deferred.cells[2], NIL, "no withholding on the part that is not attributed");
  });

  it("keeps the typographic minus from the domain formatter on a negative amount", () => {
    assert.equal(amountText(-481_686_000, "AUD"), "\u2212A$4,816,860");
    assert.equal(amountText(-481_686_000, "AUD"), money(-481_686_000, "AUD"));
    assert.ok(!amountText(-10_000, "SGD").includes("-"));
  });

  it("an Australian fund whose amounts are all zero has no rows, the module's sentence and no chart", () => {
    const zeroed = ok(data, "r-okafor", {
      type: "update-inputs",
      fundId: "coastline",
      inputs: { cashDistribution: 0, ausOtherIncome: 0, ncmi: 0, excludedNcmi: 0, cleanBuilding: 0, interest: 0, discountGainTarp: 0, otherGainTarp: 0, foreignIncome: 0 },
    });
    const calc = calcOf("coastline", zeroed);
    const table = distributionTable(fundOf(zeroed, "coastline"), calc);
    assert.ok(calc.components.length > 0 && calc.components.every((c) => c.amount === 0), "the module still reports its lines, all of them nil");
    assert.deepEqual(table.rows, []);
    assert.deepEqual(cellsOf(table.total), [NIL, NIL, NIL, NIL, NIL], "the total row stays");
    assert.deepEqual(table.cash, { label: "Cash distribution", note: "Paid for the income year", amount: NIL, perUnit: NIL }, "and so does the cash row");
    assert.equal(calc.narrative, "A$0 by tax character: A$0 to Australian residents and A$0 to foreign investors after A$0 withheld for the ATO.");
    assert.deepEqual([calc.sankey.sources.length, calc.sankey.targets.length, calc.sankey.links.length], [0, 0, 0]);
    const kpis = printed("coastline", zeroed);
    assert.deepEqual(kpis.map(([, value]) => value), ["A$0", "A$0 0.0000 c/unit", "A$0"]);
    assert.equal(kpis[1]![2], COST_BASE_UNCHANGED);
  });

  it("a Singapore fund whose amounts are all zero has no rows, and no payout percentage to show", () => {
    const zeroed = ok(data, "w-l-teo", {
      type: "update-inputs",
      fundId: "kallang",
      inputs: { taxableSpecifiedIncome: 0, taxableDistributed: 0, taxExemptDistribution: 0, capitalDistribution: 0 },
    });
    const calc = calcOf("kallang", zeroed);
    const table = distributionTable(fundOf(zeroed, "kallang"), calc);
    assert.ok(calc.components.length > 0 && calc.components.every((c) => c.amount === 0));
    assert.deepEqual(table.rows, []);
    assert.deepEqual(cellsOf(table.total), [NIL, NIL, NIL, NIL, NIL]);
    assert.equal(table.cash, null);
    assert.equal(calc.narrative, "S$0 distributed: S$0 paid gross and S$0 to non-resident and other holders after S$0 withheld for IRAS.");
    assert.deepEqual(calc.sankey.links, []);
    assert.deepEqual(printed("kallang", zeroed).map(([, value]) => value), ["S$0", NIL, "S$0"]);
    assert.equal(kpiModels(fundOf(zeroed, "kallang"), calc)[1]!.tone, "default");
  });

  it("says why there is no chart, and where to put amounts when the user can", () => {
    assert.equal(emptyChartMessage(false), "Nothing to chart yet: no distribution amounts have been entered.");
    assert.equal(emptyChartMessage(true), "Nothing to chart yet: no distribution amounts have been entered. Add them under Distribution inputs.");
  });

  it("says why the table has no rows, and points to the boxes only when the user has them", () => {
    assert.equal(emptyTableMessage(true), "No amounts yet. Enter the distribution inputs below.");
    assert.equal(emptyTableMessage(false), "No amounts yet.");
  });
});

describe("the note in the panel header", () => {
  const note = (fundId: FundId, userId: string) => panelNote(workflowView(data, fundId, ctxOf(data, userId)));

  it("says why a signed-off, in-review or view-only fund cannot be edited, in the module's words", () => {
    assert.deepEqual(note("harbourline", "a-moreno"), { kind: "locked", text: "Signed off — reopen to edit" });
    assert.deepEqual(note("southbank", "a-moreno"), { kind: "locked", text: "In review — return to preparer to edit" });
    assert.deepEqual(note("coastline", "m-castillo"), { kind: "locked", text: "View only for your role" });
    assert.deepEqual(note("kallang", "n-pillai"), { kind: "locked", text: "View only for your role" });
  });

  it("is a hint, not a lock, when the user can edit", () => {
    assert.deepEqual(note("coastline", "r-okafor"), { kind: "editing", text: EDITING_HINT });
    assert.deepEqual(note("coastline", "a-moreno"), { kind: "editing", text: EDITING_HINT });
    assert.deepEqual(note("kallang", "w-l-teo"), { kind: "editing", text: EDITING_HINT });
  });

  it("follows the workflow for every persona and fund: editable means a hint, otherwise the lock reason", () => {
    for (const id of ALL_FUNDS) {
      for (const persona of PERSONAS) {
        const view = workflowView(data, id, ctxOf(data, persona));
        const shown = panelNote(view);
        if (view.can.edit) assert.equal(shown?.kind, "editing", `${persona} on ${id}`);
        else if (view.lockedReason) assert.deepEqual(shown, { kind: "locked", text: view.lockedReason }, `${persona} on ${id}`);
        else assert.equal(shown, null, `${persona} on ${id}`);
      }
    }
  });
});

describe("the amount boxes", () => {
  const AU_LABELS = [
    "Cash distribution",
    "Australian income — other",
    "Non-concessional MIT income",
    "Excluded from NCMI — transitional",
    "Clean building MIT income",
    "Australian interest",
    "Discounted capital gains — TARP",
    "Other capital gains — TARP",
    "Assessable foreign income",
  ];
  const SG_LABELS = ["Taxable specified income", "Taxable income distribution", "Tax-exempt income distribution", "Capital distribution"];

  it("has a box for every input of a fund, labelled as the reference and the audit trail label it", () => {
    assert.deepEqual(inputFields("AU").map((f) => f.label), AU_LABELS);
    assert.deepEqual(inputFields("SG").map((f) => f.label), SG_LABELS);
    for (const id of ALL_FUNDS) {
      const fund = fundOf(data, id);
      const fields = inputFields(fund.market);
      assert.deepEqual([...fields.map((f) => f.key)].sort(), Object.keys(fund.inputs).sort(), `${id}: every input has a box and every box an input`);
      for (const field of fields) assert.equal(field.label, inputLabel(field.key), `${id}/${field.key}: same words as the audit trail`);
    }
  });

  it("explains every box in plain words, without repeating a rate or leaving a placeholder", () => {
    const placeholder = /\b(null|undefined|nan|todo|tbd|lorem|infinity)\b|\[object/i;
    for (const market of ["AU", "SG"] as const) {
      for (const field of inputFields(market)) {
        assert.ok(field.hint.length >= 20, `${field.key}: needs a real hint`);
        assert.ok(!placeholder.test(field.hint), `${field.key}: ${field.hint}`);
        assert.ok(!/\d\s?%/.test(field.hint), `${field.key}: rates belong to the engine, not to help text: ${field.hint}`);
        assert.ok(field.hint.endsWith("."), `${field.key}: a sentence`);
      }
    }
    const gain = inputFields("AU").find((f) => f.key === "discountGainTarp")!;
    assert.match(gain.hint, /Gain after the discount/);
    // The hint names the AMIT gross-up amount the way the module labels it, so a rename in the domain cannot leave the two out of step.
    const grossUp = calcOf("harbourline").components.find((c) => c.key === "cgtConcessionTarp")!;
    assert.ok(gain.hint.includes(`The ${grossUp.label.split(" — ")[0]} equals this figure`), `${gain.hint} / ${grossUp.label}`);
  });

  it("reads the saved amount behind each box", () => {
    const harbourline = fundOf(data, "harbourline");
    assert.equal(inputValue(harbourline, "cashDistribution"), 9_244_600_000);
    assert.equal(inputValue(harbourline, "interest"), 118_490_000);
    assert.equal(inputValue(harbourline, "ncmi"), 0);
    assert.equal(inputValue(fundOf(data, "kallang"), "taxableSpecifiedIncome"), 4_190_650_000);
    assert.equal(inputValue(fundOf(data, "kallang"), "interest"), 0, "a box the fund does not have reads as nothing");
  });

  it("accepts amounts the way people type them", () => {
    assert.deepEqual(parseAmount("1,250,000", "AUD"), { ok: true, value: 125_000_000 });
    assert.deepEqual(parseAmount("A$1,250,000.50", "AUD"), { ok: true, value: 125_000_050 });
    assert.deepEqual(parseAmount("S$ 0.07", "SGD"), { ok: true, value: 7 });
    assert.deepEqual(parseAmount("0", "AUD"), { ok: true, value: 0 });
    assert.deepEqual(parseAmount("  42  ", "SGD"), { ok: true, value: 4_200 });
    assert.deepEqual(parseAmount("12.", "AUD"), { ok: true, value: 1_200 });
    assert.deepEqual(parseAmount(".5", "AUD"), { ok: true, value: 50 });
  });

  it("tells the user what is wrong with an amount, in words", () => {
    const message = (text: string): string => {
      const parsed = parseAmount(text, "AUD");
      assert.equal(parsed.ok, false, `"${text}" should be rejected`);
      return parsed.ok ? "" : parsed.message;
    };
    assert.equal(message(""), "Enter an amount, for example 1,250,000.");
    assert.equal(message("   "), "Enter an amount, for example 1,250,000.");
    assert.equal(message("-5"), "Enter zero or a positive amount.");
    assert.equal(message("-0.01"), "Enter zero or a positive amount.");
    assert.equal(message("(1,200)"), "Enter zero or a positive amount.");
    assert.equal(message("\u22121,200"), "Enter zero or a positive amount.");
    for (const text of ["abc", "NaN", "Infinity", "1e5", "0x10", "1,2,3x", "12 345 six", "--5", "$"]) {
      assert.equal(message(text), "Use digits only, for example 1,250,000 or 1,250,000.50.", text);
    }
    assert.equal(message("12.345"), "Use at most two decimal places.");
    assert.equal(message("99999999999999999999"), "That amount is too large.");
    assert.equal(message("90071992547409.92"), "That amount is too large.");
  });

  it("never lets through an amount the domain would refuse", () => {
    assert.deepEqual(AMOUNT_RULES, { min: 0, allowEmpty: false });
    for (const text of ["0", "0.01", "1", "212,300", "1,250,000.50", "90,071,992,547,409.91"]) {
      const parsed = parseAmount(text, "AUD");
      assert.equal(parsed.ok, true, text);
      if (!parsed.ok) continue;
      assert.ok(Number.isSafeInteger(parsed.value) && parsed.value >= AMOUNT_RULES.min, text);
      const result = applyAction(data, { type: "update-inputs", fundId: "coastline", inputs: { interest: parsed.value } }, ctxOf(data, "r-okafor"));
      assert.equal(result.ok, true, `${text}: ${result.ok ? "" : result.reason}`);
    }
  });

  it("builds the update-inputs action for a committed box, and nothing when there is nothing to save", () => {
    const coastline = fundOf(data, "coastline");
    assert.deepEqual(inputAction(coastline, "interest", 150_000_000), { type: "update-inputs", fundId: "coastline", inputs: { interest: 150_000_000 } });
    assert.equal(inputAction(coastline, "interest", inputValue(coastline, "interest")), null, "the same amount is not a change");
    assert.equal(inputAction(coastline, "interest", null), null, "an empty box is not an amount");
    assert.equal(inputAction(coastline, "taxableDistributed", 5), null, "a Singapore input on an Australian fund");
    const kallang = fundOf(data, "kallang");
    assert.equal(inputAction(kallang, "interest", 5), null, "an Australian input on a Singapore fund");
    assert.equal(inputValue(kallang, "capitalDistribution"), 0);
    assert.equal(inputAction(kallang, "capitalDistribution", 0), null, "nothing was entered there before either");
    assert.deepEqual(inputAction(kallang, "capitalDistribution", 250_000), { type: "update-inputs", fundId: "kallang", inputs: { capitalDistribution: 250_000 } });
    assert.deepEqual(inputAction(kallang, "taxableDistributed", 0), { type: "update-inputs", fundId: "kallang", inputs: { taxableDistributed: 0 } }, "zero is an amount");
  });

  it("a saved box moves the table, the key figures and the sentence, and the audit trail records it", () => {
    const before = fundOf(data, "coastline");
    const after = ok(data, "r-okafor", inputAction(before, "interest", 400_000_000)!);
    const fund = fundOf(after, "coastline");
    assert.equal(inputValue(fund, "interest"), 400_000_000);

    const calc = calcOf("coastline", after);
    const table = distributionTable(fund, calc);
    assert.equal(table.rows.find((r) => r.key === "interest")!.amount, "A$4,000,000");
    assert.notEqual(calc.narrative, calcOf("coastline").narrative);
    assert.notEqual(table.total.amount, distributionTable(before, calcOf("coastline")).total.amount);
    assert.equal(printed("coastline", after)[2]![1], money(calc.withheld, "AUD"));
    const entry = after.audit[after.audit.length - 1]!;
    assert.deepEqual([entry.fundId, entry.actor, entry.action, entry.detail], ["coastline", "R. Okafor", "Australian interest updated", "A$212,300 → A$4,000,000"]);
  });

  it("announces a save with the box's label", () => {
    const cleanBuilding = inputFields("AU").find((f) => f.key === "cleanBuilding")!;
    assert.equal(savedMessage(cleanBuilding), "Saved: Clean building MIT income");
    assert.equal(savedMessage(inputFields("SG")[0]!), "Saved: Taxable specified income");
  });
});

describe("the key figures keep up with edits", () => {
  it("Singapore payout and trustee tax follow the two income boxes", () => {
    const fund = fundOf(data, "kallang");
    const edited = ok(data, "w-l-teo", { type: "update-inputs", fundId: "kallang", inputs: { taxableDistributed: 4_000_000_000 } });
    const [income, payout, tax] = printed("kallang", edited);
    assert.equal(income![1], money(inputValue(fund, "taxableSpecifiedIncome"), "SGD"), "the income box was not touched");
    assert.equal(payout![1], "95.5%");
    assert.equal(kpiModels(fundOf(edited, "kallang"), calcOf("kallang", edited))[1]!.tone, "default", "back above the threshold");
    assert.equal(tax![2], "17% of S$1,906,500 retained");
  });

  it("an Australian cash change flips the cost base between excess and shortfall", () => {
    const flipped = ok(data, "r-okafor", { type: "update-inputs", fundId: "coastline", inputs: { cashDistribution: 1_000_000_000 } });
    assert.ok(calcOf("coastline", flipped).au!.costBaseNet < 0);
    assert.equal(printed("coastline", flipped)[1]![2], COST_BASE_SHORTFALL);
  });
});

describe("what the model leaves to its arguments", () => {
  it("depends on the fund and calculation it is given and nothing else", () => {
    const fund = fundOf(data, "wattle");
    const calc = calcOf("wattle");
    assert.deepEqual(kpiModels(fund, calc), kpiModels(structuredClone(fund), structuredClone(calc)));
    assert.deepEqual(distributionTable(fund, calc), distributionTable(structuredClone(fund), structuredClone(calc)));
  });
});
