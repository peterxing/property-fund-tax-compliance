import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSankey } from "../../src/domain/shared/sankey.ts";
import { fundCalc } from "../../src/domain/selectors.ts";
import type { ComponentLine, DestinationDef, SankeyModel } from "../../src/domain/types.ts";
import { AU_FUNDS, NOW, SG_FUNDS, seed, skipUnlessReady } from "./core-fixtures.ts";

const DESTINATIONS: DestinationDef[] = [
  { key: "gross", label: "Australian residents" },
  { key: "net", label: "Foreign investors, net" },
  { key: "withheld", label: "Withheld for the ATO" },
  { key: "unallocated", label: "Units not on register" },
];

function line(key: string, amount: number, flows: Partial<Pick<ComponentLine, "toGross" | "toNet" | "withheld" | "unallocated">>): ComponentLine {
  return { key, label: key, short: key.toUpperCase(), treatment: "", amount, centsPerUnit: 0, toGross: 0, toNet: 0, withheld: 0, unallocated: 0, attributed: true, ...flows };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const into = (model: SankeyModel, key: string) => sum(model.links.filter((l) => l.target === key).map((l) => l.value));
const out = (model: SankeyModel, key: string) => sum(model.links.filter((l) => l.source === key).map((l) => l.value));

function assertConserves(model: SankeyModel): void {
  for (const source of model.sources) assert.equal(out(model, source.key), source.value, `source ${source.key} sends all it has`);
  for (const target of model.targets) assert.equal(into(model, target.key), target.value, `target ${target.key} receives what its links carry`);
  assert.equal(sum(model.sources.map((s) => s.value)), sum(model.targets.map((t) => t.value)), "total in equals total out");
}

const components = [
  line("a", 100_000_00, { toGross: 60_000_00, toNet: 30_000_00, withheld: 10_000_00 }),
  line("b", 50_000_00, { toGross: 50_000_00 }),
  line("zero", 0, {}),
  line("d", 20_000_00, { unallocated: 20_000_00 }),
];

test("nodes and links conserve value", () => {
  const model = buildSankey({ components, destinations: DESTINATIONS, currency: "AUD" });
  assertConserves(model);
  assert.deepEqual(model.sources.map((s) => [s.key, s.value]), [["a", 100_000_00], ["b", 50_000_00], ["d", 20_000_00]]);
  assert.deepEqual(model.targets.map((t) => [t.key, t.value]), [["gross", 110_000_00], ["net", 30_000_00], ["withheld", 10_000_00], ["unallocated", 20_000_00]]);
  assert.deepEqual(model.links, [
    { source: "a", target: "gross", value: 60_000_00 },
    { source: "a", target: "net", value: 30_000_00 },
    { source: "a", target: "withheld", value: 10_000_00 },
    { source: "b", target: "gross", value: 50_000_00 },
    { source: "d", target: "unallocated", value: 20_000_00 },
  ]);
});

test("zero amounts are omitted: no zero source, no empty destination, no zero link", () => {
  const model = buildSankey({ components: components.filter((c) => c.key !== "d"), destinations: DESTINATIONS, currency: "AUD" });
  assert.ok(!model.sources.some((s) => s.key === "zero"));
  assert.ok(!model.targets.some((t) => t.key === "unallocated"), "nothing unallocated, so no unallocated node");
  assert.ok(!("unallocated" in model.targetKinds));
  assert.ok(model.links.every((l) => l.value > 0));
  assertConserves(model);
});

test("targetKinds maps each shown destination to its own kind", () => {
  const model = buildSankey({ components, destinations: DESTINATIONS, currency: "AUD" });
  assert.deepEqual(model.targetKinds, { gross: "gross", net: "net", withheld: "withheld", unallocated: "unallocated" });
  const sg = buildSankey({
    components: [line("t", 10_00, { toGross: 4_00, toNet: 6_00 })],
    destinations: [{ key: "gross", label: "Unitholders paid gross" }, { key: "net", label: "Unitholders paid net" }, { key: "withheld", label: "Withheld for IRAS" }],
    currency: "SGD",
  });
  assert.deepEqual(sg.targetKinds, { gross: "gross", net: "net" });
});

test("labels are formatted for the chart", () => {
  const model = buildSankey({ components, destinations: DESTINATIONS, currency: "AUD" });
  assert.deepEqual(model.sources[0], { key: "a", label: "A", valueLabel: "A$100.0k", value: 100_000_00 });
  const gross = model.targets.find((t) => t.key === "gross");
  assert.equal(gross?.label, "Australian residents");
  assert.equal(gross?.valueLabel, "A$110.0k · 64.7%");
  assert.equal(model.targets.find((t) => t.key === "withheld")?.valueLabel, "A$10.0k · 5.9%");
});

test("an empty or all-zero distribution gives an empty model", () => {
  const empty = { sources: [], targets: [], links: [], targetKinds: {} };
  assert.deepEqual(buildSankey({ components: [], destinations: DESTINATIONS, currency: "SGD" }), empty);
  assert.deepEqual(buildSankey({ components: [line("z", 0, {})], destinations: DESTINATIONS, currency: "SGD" }), empty);
});

test("only the destinations given are used, in the order given", () => {
  const model = buildSankey({
    components: [line("a", 100_00, { toGross: 40_00, toNet: 60_00 })],
    destinations: [{ key: "net", label: "N" }, { key: "gross", label: "G" }],
    currency: "SGD",
  });
  assert.deepEqual(model.targets.map((t) => t.key), ["net", "gross"]);
  assertConserves(model);
});

for (const [market, fundIds] of [["SG", SG_FUNDS], ["AU", AU_FUNDS]] as const) {
  test(`${market} calculations produce conserving Sankeys`, { skip: skipUnlessReady(market) }, () => {
    const data = seed();
    for (const id of fundIds) {
      const calc = fundCalc(data, id, NOW);
      assertConserves(calc.sankey);
      assert.ok(calc.sankey.links.every((l) => l.value > 0), id);
      for (const target of calc.sankey.targets) assert.ok(calc.sankey.targetKinds[target.key], `${id} ${target.key} has a kind`);
      for (const source of calc.sankey.sources) assert.ok(calc.components.some((c) => c.key === source.key && c.amount > 0), `${id} ${source.key}`);
    }
  });
}
