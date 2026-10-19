import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { costBaseView, investorView } from "../../../src/domain/index.ts";
import type { CostBaseView, DeferredTaxInvestor } from "../../../src/domain/types.ts";
import {
  DEFAULT_INVESTOR,
  cgtSummary,
  currencyOf,
  deferredTaxModel,
  gainCell,
  parseInvestor,
  propertyTable,
  unitPriceHeading,
  unitTable,
} from "../../../src/app/workspaces/cost-base/model.ts";
import { AU_IDS, SG_IDS, ctxFor, freshData } from "../investor-reporting/fixtures.ts";

const data = freshData();
const ctx = ctxFor(data);
const view = (id: string, investor?: DeferredTaxInvestor): CostBaseView => costBaseView(data, id, ctx, investor);
const INVESTORS: DeferredTaxInvestor[] = ["foreign-eoi", "foreign-non-eoi", "complying-super", "company"];

describe("deferred tax investor parameter", () => {
  it("accepts the four investor types", () => {
    for (const id of INVESTORS) assert.equal(parseInvestor(id), id);
  });

  it("falls back to the foreign EOI investor for anything else", () => {
    assert.equal(DEFAULT_INVESTOR, "foreign-eoi");
    for (const bad of [null, undefined, "", "company ", "Company", "retail", "__proto__", "foreign-eoi,company", "<b>"]) {
      assert.equal(parseInvestor(bad), "foreign-eoi", String(bad));
    }
  });
});

describe("currency", () => {
  it("follows the fund's market", () => {
    assert.equal(currencyOf("AU"), "AUD");
    assert.equal(currencyOf("SG"), "SGD");
  });
});

describe("gain and loss cells", () => {
  it("writes a gain plainly and a loss with its minus sign and the loss flag", () => {
    assert.deepEqual(gainCell(24690778900, "AUD"), { amount: "A$246,907,789", loss: false });
    assert.deepEqual(gainCell(-6623992300, "AUD"), { amount: "−A$66,239,923", loss: true });
    assert.deepEqual(gainCell(-9963401700, "SGD"), { amount: "−S$99,634,017", loss: true });
    assert.deepEqual(gainCell(0, "AUD"), { amount: "A$0", loss: false });
  });

  it("never flags a loss that rounds to nothing, and always flags one that shows a minus sign", () => {
    for (const cents of [-1, -49, -50, -51, -99, -100, -149, -150, 0, 1, 49, 50, 99, 100, 150, 12345, -12345]) {
      const cell = gainCell(cents, "AUD");
      assert.equal(cell.loss, cell.amount.startsWith("−"), `${cents}: ${cell.amount}`);
    }
    assert.equal(gainCell(-49, "AUD").amount, "A$0");
    assert.equal(gainCell(-49, "AUD").loss, false);
  });
});

describe("property table", () => {
  it("lays out Harbourline's three properties and the total", () => {
    const table = propertyTable(view("harbourline"));
    assert.equal(table.rows.length, 3);
    assert.deepEqual(table.rows[0], {
      id: table.rows[0]?.id,
      name: "Harbourline Tower",
      location: "210 Kent Street, Sydney NSW",
      acquired: "18 Mar 2014",
      held: "Held 12 months — discount applies",
      costBase: "A$536,756,063",
      capitalWorks: "after A$81,170,778 capital works",
      valuation: "A$783,663,852",
      unrealised: { amount: "A$246,907,789", loss: false },
    });
    assert.deepEqual(table.total, {
      costBase: "A$1,314,205,709",
      valuation: "A$1,507,045,869",
      unrealised: { amount: "A$192,840,160", loss: false },
    });
  });

  it("marks a property below its tax cost base as a loss, and one held under 12 months as undiscounted", () => {
    const [, riverside, collins] = propertyTable(view("harbourline")).rows;
    assert.equal(riverside?.name, "Riverside Place");
    assert.deepEqual(riverside?.unrealised, { amount: "−A$66,239,923", loss: true });
    assert.equal(collins?.name, "Collins Quarter");
    assert.equal(collins?.acquired, "20 Feb 2026");
    assert.equal(collins?.held, "Held under 12 months — no discount");
    assert.deepEqual(collins?.unrealised, { amount: "A$12,172,294", loss: false });
  });

  it("shows Wattle's net unrealised loss in the total", () => {
    const table = propertyTable(view("wattle"));
    assert.equal(table.rows.length, 4);
    assert.deepEqual(table.total.unrealised, { amount: "−A$37,616,644", loss: true });
    assert.deepEqual(table.rows.map((r) => r.unrealised.loss), [false, true, true, false]);
  });

  it("agrees with the view for every fund: one row per property, losses flagged by sign, totals unchanged", () => {
    for (const id of [...AU_IDS, ...SG_IDS]) {
      const v = view(id);
      const table = propertyTable(v);
      assert.equal(table.rows.length, v.properties.length, id);
      table.rows.forEach((row, i) => {
        const p = v.properties[i]!;
        assert.equal(row.unrealised.loss, p.unrealised < 0 && Math.round(Math.abs(p.unrealised) / 100) > 0, `${id} ${row.name}`);
        assert.equal(row.unrealised.amount.startsWith("−"), row.unrealised.loss, `${id} ${row.name}`);
      });
      assert.equal(table.total.unrealised.loss, v.propertyTotals.unrealised < 0, id);
    }
  });

  it("repeats nothing for Singapore: no discount wording and no capital works line", () => {
    for (const id of SG_IDS) {
      const table = propertyTable(view(id));
      for (const row of table.rows) {
        assert.equal(row.held, "", `${id} ${row.name}`);
        assert.equal(row.capitalWorks, null, `${id} ${row.name}`);
        assert.match(row.costBase, /^S\$/);
        assert.match(row.valuation, /^S\$/);
      }
    }
  });

  it("formats Telok Ayer's properties in Singapore dollars with Bugis Gateway Mall as a loss", () => {
    const table = propertyTable(view("telok-ayer"));
    assert.equal(table.rows.length, 3);
    assert.equal(table.rows[0]?.acquired, "16 May 2011");
    assert.equal(table.rows[0]?.costBase, "S$2,333,455,721");
    assert.deepEqual(table.rows[2]?.unrealised, { amount: "−S$99,634,017", loss: true });
    assert.deepEqual(table.total, { costBase: "S$5,724,414,685", valuation: "S$6,503,887,222", unrealised: { amount: "S$779,472,537", loss: false } });
  });
});

describe("CGT summary", () => {
  it("lists Harbourline's lines in order and stresses only the net capital gain", () => {
    assert.deepEqual(cgtSummary(view("harbourline").cgtSummary, "AUD"), [
      { label: "Gains", amount: "A$259,080,083", emphasis: false },
      { label: "Less: losses", amount: "−A$66,239,923", emphasis: false },
      { label: "Gains held 12 months or more, after losses", amount: "A$192,840,160", emphasis: false },
      { label: "Other gains, after losses", amount: "A$0", emphasis: false },
      { label: "Less: 50% CGT discount at the trust", amount: "−A$96,420,080", emphasis: false },
      { label: "Net capital gain if sold at valuation", amount: "A$96,420,080", emphasis: true },
    ]);
  });

  it("separates Coastline's property held under 12 months from the discounted gains", () => {
    const lines = cgtSummary(view("coastline").cgtSummary, "AUD");
    assert.equal(lines.find((l) => l.label === "Other gains, after losses")?.amount, "A$923,466");
    assert.equal(lines.find((l) => l.label === "Gains held 12 months or more, after losses")?.amount, "A$68,162,333");
    assert.equal(lines.at(-1)?.amount, "A$35,004,633");
  });

  it("nets Wattle to nothing", () => {
    const lines = cgtSummary(view("wattle").cgtSummary, "AUD");
    assert.equal(lines.at(-1)?.label, "Net capital gain if sold at valuation");
    assert.equal(lines.at(-1)?.amount, "A$0");
    assert.equal(lines.filter((l) => l.emphasis).length, 1);
  });

  it("has no lines for Singapore, which has no CGT summary", () => {
    for (const id of SG_IDS) assert.equal(view(id).cgtSummary, undefined, id);
    assert.deepEqual(cgtSummary(undefined, "SGD"), []);
  });
});

describe("deferred tax", () => {
  const deferred = (id: string, investor?: DeferredTaxInvestor) => {
    const d = view(id, investor).deferredTax;
    assert.ok(d, `${id} has deferred tax`);
    return deferredTaxModel(d, "AUD");
  };

  it("defaults to a foreign investor from an EOI country and offers all four types", () => {
    const model = deferred("harbourline");
    assert.equal(model.selected, "foreign-eoi");
    assert.deepEqual(model.options.map((o) => o.value), INVESTORS);
    assert.deepEqual(model.options.map((o) => o.label), [
      "Foreign investor — EOI country",
      "Foreign investor — non-EOI country",
      "Australian complying super fund",
      "Australian company",
    ]);
    assert.equal(model.heading, "Deferred tax — Foreign investor — EOI country");
    assert.equal(model.amount, "A$28,926,024");
    assert.match(model.note, /^15% withholding on the fund payment/);
  });

  it("gives the EOI figure for each AU fund", () => {
    const expected: Record<string, string> = {
      harbourline: "A$28,926,024",
      southbank: "A$41,589,080",
      kurrajong: "A$40,151,760",
      coastline: "A$10,362,870",
      wattle: "A$0",
    };
    for (const id of AU_IDS) assert.equal(deferred(id).amount, expected[id], id);
  });

  it("recomputes, retitles and re-explains when the investor type changes", () => {
    const seen = new Map<DeferredTaxInvestor, ReturnType<typeof deferred>>();
    for (const investor of INVESTORS) seen.set(investor, deferred("harbourline", investor));
    assert.equal(seen.get("foreign-non-eoi")?.amount, "A$57,852,048");
    assert.equal(seen.get("foreign-non-eoi")?.heading, "Deferred tax — Foreign investor — non-EOI country");
    assert.match(seen.get("foreign-non-eoi")?.note ?? "", /^30% withholding/);
    assert.equal(seen.get("complying-super")?.amount, "A$19,284,016");
    assert.equal(seen.get("complying-super")?.heading, "Deferred tax — Australian complying super fund");
    assert.match(seen.get("complying-super")?.note ?? "", /one-third discount/);
    assert.equal(seen.get("company")?.amount, "A$57,852,048");
    assert.equal(seen.get("company")?.heading, "Deferred tax — Australian company");
    assert.match(seen.get("company")?.note ?? "", /no CGT discount/);
    for (const [investor, model] of seen) assert.equal(model.selected, investor);
    assert.equal(new Set([...seen.values()].map((m) => m.note)).size, 4);
  });

  it("keeps every option available whichever one is selected", () => {
    for (const investor of INVESTORS) assert.deepEqual(deferred("southbank", investor).options.map((o) => o.value), INVESTORS);
  });

  it("is nil for Wattle, whose net capital loss carries forward", () => {
    for (const investor of INVESTORS) {
      const model = deferred("wattle", investor);
      assert.equal(model.amount, "A$0", investor);
      assert.match(model.note, /Net capital loss of A\$37,616,644 carries forward to offset later gains\.$/, investor);
    }
  });

  it("does not exist for Singapore", () => {
    for (const id of SG_IDS) assert.equal(view(id).deferredTax, undefined, id);
  });

  it("matches the investor chosen through parseInvestor", () => {
    assert.equal(deferred("harbourline", parseInvestor("company")).amount, "A$57,852,048");
    assert.equal(deferred("harbourline", parseInvestor("nonsense")).amount, "A$28,926,024");
  });
});

describe("unit cost base", () => {
  it("lays out Harbourline's holders and totals", () => {
    const table = unitTable(view("harbourline"));
    assert.equal(table.rows.length, 5);
    assert.deepEqual(table.rows[0], {
      id: table.rows[0]?.id,
      holder: "Australian resident unitholders (retail register)",
      status: "Australian resident",
      units: "902,151,600",
      opening: "A$610,576,203",
      adjustment: "−A$18,464,387",
      closing: "A$592,111,816",
      perUnit: "0.6563",
      marketValue: "A$649,549,152",
      unrealised: { amount: "A$57,437,336", loss: false },
    });
    assert.deepEqual(table.total, {
      units: "1,412,680,000",
      opening: "A$955,432,247",
      adjustment: "−A$28,913,400",
      closing: "A$926,518,847",
      marketValue: "A$1,017,129,600",
      unrealised: { amount: "A$90,610,753", loss: false },
    });
  });

  it("flags a holder under water as a loss", () => {
    const sakuragawa = unitTable(view("harbourline")).rows.find((r) => r.holder === "Sakuragawa Life Assurance");
    assert.deepEqual(sakuragawa?.unrealised, { amount: "−A$4,817,156", loss: true });
    assert.equal(sakuragawa?.status, "Foreign resident — EOI country");
  });

  it("shows a cost base shortfall as an increase for Southbank", () => {
    const table = unitTable(view("southbank"));
    assert.equal(table.total.adjustment, "A$4,816,860");
    assert.equal(table.rows[0]?.adjustment, "A$1,445,058");
    assert.ok(table.rows.every((r) => !r.adjustment.startsWith("−")));
  });

  it("writes cost base per unit to four decimals and without a currency symbol", () => {
    for (const id of [...AU_IDS, ...SG_IDS]) {
      const v = view(id);
      for (const row of unitTable(v).rows) {
        assert.match(row.perUnit, /^\d+\.\d{4}$/, `${id} ${row.holder}`);
        const source = v.unitRows.find((r) => r.holderId === row.id)!;
        assert.ok(Math.abs(Number(row.perUnit) - source.closing / 100 / source.units) < 0.0001, `${id} ${row.holder}: ${row.perUnit}`);
      }
    }
    assert.equal(unitTable(view("coastline")).rows.find((r) => r.holder === "Kestrel Pension Plan")?.perUnit, "1.0111");
  });

  it("agrees with the view for every fund: rows, totals and the sign of every loss", () => {
    for (const id of [...AU_IDS, ...SG_IDS]) {
      const v = view(id);
      const table = unitTable(v);
      assert.equal(table.rows.length, v.unitRows.length, id);
      assert.equal(table.total.unrealised.loss, v.unitTotals.unrealised < 0, id);
      for (const row of table.rows) assert.equal(row.unrealised.amount.startsWith("−"), row.unrealised.loss, `${id} ${row.holder}`);
      const closing = v.unitRows.reduce((sum, r) => sum + r.closing, 0);
      assert.ok(Math.abs(closing - v.unitTotals.closing) <= v.unitRows.length, `${id} closing ${closing} vs ${v.unitTotals.closing}`);
    }
  });

  it("carries the AIIR's cost base net amount into the unit adjustment, with the opposite sign", () => {
    for (const id of AU_IDS) {
      const d = freshData();
      const c = ctxFor(d);
      const investor = investorView(d, id, c);
      assert.equal(investor.market, "AU");
      if (investor.market !== "AU") continue;
      assert.equal(costBaseView(d, id, c).unitTotals.adjustment, -investor.aiir.totals.costBaseNet, id);
    }
  });

  it("formats Singapore unit cost base in Singapore dollars, with no adjustment where there is no return of capital", () => {
    const telok = unitTable(view("telok-ayer"));
    assert.equal(telok.total.units, "4,236,180,000");
    assert.equal(telok.total.adjustment, "−S$1,905,800");
    assert.equal(telok.rows[0]?.status, "Individual");
    assert.deepEqual(telok.rows[2]?.unrealised, { amount: "−S$21,490,189", loss: true });
    const meranti = unitTable(view("meranti"));
    assert.equal(meranti.total.adjustment, "S$0");
    assert.ok(meranti.rows.every((r) => r.adjustment === "S$0"));
  });

  it("shows Singapore excess over cost base on the affected unit row", () => {
    const d = freshData();
    d.unitCostBase["loyang"].opening["h-ly-1"] = 100_000;
    const table = unitTable(costBaseView(d, "loyang", ctxFor(d)));
    assert.equal(table.rows[0]?.excessOverCostBase, "S$1,504,700");
    assert.equal(table.rows[1]?.excessOverCostBase, undefined);
  });

  it("titles the unit price with the period end", () => {
    assert.equal(unitPriceHeading("2026-06-30"), "Unit price at 30 Jun 2026");
    assert.equal(unitPriceHeading("2026-09-30"), "Unit price at 30 Sep 2026");
  });
});

describe("cost base view wording the page relies on", () => {
  it("names the valuation date and where the unit price comes from", () => {
    assert.equal(view("harbourline").asAtLabel, "Harbourline Office Trust · valuations at 30 Jun 2026");
    assert.equal(view("harbourline").unitPriceLabel, "A$0.720 · market price");
    assert.equal(view("southbank").unitPriceLabel, "A$0.820 · NAV per unit");
    assert.equal(view("harbourline").adjustmentLabel, "AMIT cost base net amount");
    assert.equal(view("telok-ayer").adjustmentLabel, "Return of capital reduces the cost of units");
  });

  it("explains Singapore's lack of CGT and gives Australia its own footnote", () => {
    for (const id of SG_IDS) assert.match(view(id).sgNote ?? "", /^Singapore doesn't tax capital gains\./, id);
    for (const id of AU_IDS) assert.equal(view(id).sgNote, undefined, id);
    assert.match(view("harbourline").footnote, /CGT event E10/);
    assert.match(view("telok-ayer").footnote, /s35\(15C\)/);
  });
});
