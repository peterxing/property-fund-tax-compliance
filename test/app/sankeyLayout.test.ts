import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SankeyModel } from "../../src/domain/types.ts";
import {
  SANKEY_DEFAULTS,
  fitScale,
  layoutSankey,
  nodeValues,
  sankeySummary,
  shareText,
  spreadLabelBlocks,
  spreadLabels,
  withShare,
  type SankeyLayout,
  type SankeyNodeLayout,
} from "../../src/app/charts/sankeyLayout.ts";

const TARGETS = [
  { key: "gross", label: "Australian residents" },
  { key: "net", label: "Foreign investors, net" },
  { key: "withheld", label: "Withheld for the ATO" },
  { key: "unallocated", label: "Units not on register" },
] as const;

/** A model whose sources each split across the four targets by `shares` (the last link takes the remainder, so flow is exact). */
function model(sourceValues: Record<string, number>, shares = [0.5, 0.34, 0.14, 0.02]): SankeyModel {
  const links: SankeyModel["links"] = [];
  const targetTotals = new Map<string, number>();
  for (const [source, value] of Object.entries(sourceValues)) {
    let left = value;
    TARGETS.forEach((target, i) => {
      const part = i === TARGETS.length - 1 ? left : Math.round(value * shares[i]!);
      left -= part;
      if (part > 0) links.push({ source, target: target.key, value: part });
      targetTotals.set(target.key, (targetTotals.get(target.key) ?? 0) + part);
    });
  }
  return {
    sources: Object.entries(sourceValues).map(([key, value]) => ({ key, label: key, value, valueLabel: `$${value}` })),
    targets: TARGETS.map((t) => ({ key: t.key, label: t.label, value: targetTotals.get(t.key) ?? 0, valueLabel: `$${targetTotals.get(t.key) ?? 0}` })),
    links,
    targetKinds: { gross: "gross", net: "net", withheld: "withheld", unallocated: "unallocated" },
  };
}

const BIG = model({ other: 3_187_000_000, clean: 952_000_000, interest: 421_000_000, ncmi: 305_000_000, discount: 214_000_000, deferred: 123_000_000 });
const SIZE = { width: 860, height: 380 };

const side = (layout: SankeyLayout, which: "source" | "target"): SankeyNodeLayout[] => layout.nodes.filter((n) => n.side === which);
const close = (a: number, b: number, tolerance: number, message?: string): void =>
  assert.ok(Math.abs(a - b) <= tolerance, `${message ?? ""} expected ${a} to be within ${tolerance} of ${b}`);

describe("fitScale", () => {
  it("scales a column to exactly fill the room", () => {
    const scale = fitScale([100, 300, 600], 500, 3);
    close(100 * scale + 300 * scale + 600 * scale, 500, 0.001);
  });

  it("gives tiny values their minimum height out of the room", () => {
    const scale = fitScale([1_000_000, 1], 200, 3);
    close(1_000_000 * scale + Math.max(3, 1 * scale), 200, 0.001);
    assert.ok(scale > 0);
  });

  it("is zero with nothing to scale or no room", () => {
    assert.equal(fitScale([], 300, 3), 0);
    assert.equal(fitScale([0, 0], 300, 3), 0);
    assert.equal(fitScale([5, 5], 0, 3), 0);
    assert.equal(fitScale([5, 5, 5, 5], 10, 3), 0);
  });

  it("ignores negative and non-finite values", () => {
    assert.equal(fitScale([-5, Number.NaN], 100, 3), 0);
    close(fitScale([-5, 10], 100, 3) * 10, 97, 0.001, "only the positive value counts, the other takes its minimum 3px");
  });
});

describe("spreadLabels", () => {
  it("leaves labels that already have room alone", () => {
    assert.deepEqual(spreadLabels([20, 60, 100], 17, 8, 200), [20, 60, 100]);
  });

  it("pushes crowded labels apart, keeping their order", () => {
    const out = spreadLabels([50, 52, 54, 56], 17, 8, 300);
    for (let i = 1; i < out.length; i++) assert.ok(out[i]! - out[i - 1]! >= 17 - 1e-9, `gap ${i}`);
    assert.deepEqual([...out].sort((a, b) => a - b), out);
  });

  it("keeps labels inside the bounds", () => {
    const out = spreadLabels([2, 3, 298, 299], 17, 8, 300);
    assert.ok(out.every((y) => y >= 8 && y <= 300), JSON.stringify(out));
    for (let i = 1; i < out.length; i++) assert.ok(out[i]! - out[i - 1]! >= 17 - 1e-9);
  });

  it("does not throw when the labels cannot all fit", () => {
    const out = spreadLabels([10, 11, 12, 13], 40, 8, 60);
    assert.equal(out.length, 4);
    assert.ok(out.every(Number.isFinite));
  });

  it("handles no labels", () => {
    assert.deepEqual(spreadLabels([], 17, 0, 100), []);
  });
});

describe("spreadLabelBlocks", () => {
  it("leaves blocks that already have room alone", () => {
    assert.deepEqual(spreadLabelBlocks([20, 80, 140], [30, 30, 30], 0, 200), [20, 80, 140]);
  });

  it("keeps neighbouring blocks half of each one's height apart, so tall labels get more room than short ones", () => {
    assert.deepEqual(spreadLabelBlocks([50, 52, 54], [40, 20, 60], 0, 400), [50, 80, 120]);
  });

  it("keeps the whole block, not only its centre, inside the bounds", () => {
    assert.deepEqual(spreadLabelBlocks([0, 1000], [40, 60], 10, 300), [30, 270]);
  });

  it("pulls crowded blocks up from the bottom edge without letting them overlap", () => {
    const heights = [40, 40, 40];
    const out = spreadLabelBlocks([280, 290, 295], heights, 0, 300);
    assert.deepEqual(out, [200, 240, 280]);
    out.forEach((y, i) => {
      assert.ok(y - heights[i]! / 2 >= 0 && y + heights[i]! / 2 <= 300, `block ${i} leaves the bounds`);
      if (i > 0) assert.ok(y - out[i - 1]! >= (heights[i]! + heights[i - 1]!) / 2 - 1e-9, `block ${i} overlaps`);
    });
  });

  it("agrees with spreadLabels when every block is the same height", () => {
    const centres = [50, 52, 54, 56, 200];
    assert.deepEqual(spreadLabels(centres, 17, 8, 300), spreadLabelBlocks(centres, centres.map(() => 17), 8 - 8.5, 300 + 8.5));
  });

  it("handles no blocks, and does not throw when they cannot all fit", () => {
    assert.deepEqual(spreadLabelBlocks([], [], 0, 100), []);
    assert.ok(spreadLabelBlocks([10, 11, 12], [60, 60, 60], 0, 100).every(Number.isFinite));
  });
});

describe("layoutSankey", () => {
  const layout = layoutSankey(BIG, SIZE);

  it("returns every node and link inside the box", () => {
    assert.equal(layout.empty, false);
    assert.equal(side(layout, "source").length, 6);
    assert.equal(side(layout, "target").length, 4);
    assert.equal(layout.links.length, BIG.links.length);
    for (const n of layout.nodes) {
      assert.ok(n.y >= SANKEY_DEFAULTS.top - 0.01, `${n.key} top`);
      assert.ok(n.y + n.height <= SIZE.height - SANKEY_DEFAULTS.bottom + 0.01, `${n.key} bottom`);
      assert.ok(n.x >= 0 && n.x + n.width <= SIZE.width, `${n.key} sideways`);
    }
  });

  it("draws node heights in proportion to value, on one scale for both columns", () => {
    assert.ok(layout.scale > 0);
    for (const n of layout.nodes) close(n.height, n.value * layout.scale, 0.01, n.key);
    const [a, b] = side(layout, "source");
    close(a!.height / a!.value, b!.height / b!.value, 1e-6);
    const t = side(layout, "target")[0]!;
    close(t.height / t.value, a!.height / a!.value, 1e-6);
  });

  it("does not let nodes in a column overlap, and keeps the model's order", () => {
    for (const which of ["source", "target"] as const) {
      const nodes = side(layout, which);
      const padding = which === "source" ? SANKEY_DEFAULTS.sourcePadding : SANKEY_DEFAULTS.targetPadding;
      for (let i = 1; i < nodes.length; i++) {
        assert.ok(nodes[i]!.y >= nodes[i - 1]!.y + nodes[i - 1]!.height + padding - 0.02, `${which} ${i} overlaps`);
      }
    }
    assert.deepEqual(side(layout, "source").map((n) => n.key), BIG.sources.map((n) => n.key));
    assert.deepEqual(side(layout, "target").map((n) => n.key), BIG.targets.map((n) => n.key));
  });

  it("separates the columns, sources left and targets right", () => {
    const sourceX = new Set(side(layout, "source").map((n) => n.x));
    const targetX = new Set(side(layout, "target").map((n) => n.x));
    assert.equal(sourceX.size, 1);
    assert.equal(targetX.size, 1);
    assert.ok([...targetX][0]! > [...sourceX][0]! + 100);
  });

  it("conserves flow: the ribbons through a node add up to the node's height", () => {
    for (const n of layout.nodes) {
      const through = layout.links
        .filter((l) => (n.side === "source" ? l.source : l.target) === n.key)
        .reduce((sum, l) => sum + l.thickness, 0);
      close(through, n.height, 0.06, `${n.side} ${n.key}`);
    }
    for (const link of layout.links) close(link.thickness, link.value * layout.scale, 0.01);
  });

  it("anchors each ribbon on the edge of its two nodes", () => {
    for (const link of layout.links) {
      const from = layout.nodes.find((n) => n.side === "source" && n.key === link.source)!;
      const to = layout.nodes.find((n) => n.side === "target" && n.key === link.target)!;
      const numbers = link.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      assert.equal(numbers.length, 8, link.path);
      assert.equal(numbers[0], from.x + from.width);
      assert.equal(numbers[6], to.x);
      assert.ok(numbers[1]! >= from.y - 0.01 && numbers[1]! <= from.y + from.height + 0.01, `${link.source} start`);
      assert.ok(numbers[7]! >= to.y - 0.01 && numbers[7]! <= to.y + to.height + 0.01, `${link.target} end`);
    }
  });

  it("reports each node's share of its column", () => {
    for (const which of ["source", "target"] as const) {
      close(
        side(layout, which).reduce((sum, n) => sum + n.share, 0),
        1,
        1e-9,
        which,
      );
    }
    const other = side(layout, "source").find((n) => n.key === "other")!;
    close(other.share, 3_187_000_000 / 5_202_000_000, 1e-9);
  });

  it("carries labels through and spaces them so they cannot collide", () => {
    for (const which of ["source", "target"] as const) {
      const nodes = side(layout, which);
      const gap = which === "source" ? SANKEY_DEFAULTS.sourceLabelHeight : SANKEY_DEFAULTS.targetLabelHeight;
      for (let i = 1; i < nodes.length; i++) assert.ok(nodes[i]!.labelY - nodes[i - 1]!.labelY >= gap - 0.02, `${which} label ${i}`);
    }
    assert.equal(side(layout, "target")[2]!.valueLabel, BIG.targets[2]!.valueLabel);
  });

  it("is deterministic and does not touch its input", () => {
    const before = JSON.stringify(BIG);
    assert.deepEqual(layoutSankey(BIG, SIZE), layout);
    assert.equal(JSON.stringify(BIG), before);
  });
});

describe("layoutSankey with tiny values", () => {
  const tiny = model({ other: 4_800_000_000, interest: 10_000, foreign: 25_000_000 }, [0.6, 0.3, 0.1, 0]);
  const layout = layoutSankey(tiny, { width: 860, height: 320 });

  it("keeps a minimum height so the node stays visible", () => {
    const interest = side(layout, "source").find((n) => n.key === "interest")!;
    assert.ok(interest.height >= SANKEY_DEFAULTS.minNodeHeight);
    assert.ok(interest.value * layout.scale < SANKEY_DEFAULTS.minNodeHeight, "the proportional height really is below the minimum");
  });

  it("draws every ribbon at least a pixel wide", () => {
    assert.ok(layout.links.length > 0);
    for (const link of layout.links) assert.ok(link.strokeWidth >= 1, `${link.source}->${link.target}`);
  });

  it("still fits the box and keeps nodes apart", () => {
    for (const which of ["source", "target"] as const) {
      const nodes = side(layout, which);
      for (const n of nodes) assert.ok(n.y >= 0 && n.y + n.height <= 320, `${n.key} inside`);
      for (let i = 1; i < nodes.length; i++) assert.ok(nodes[i]!.y >= nodes[i - 1]!.y + nodes[i - 1]!.height, `${which} ${i}`);
    }
  });

  it("honours a larger minimum node height", () => {
    const tall = layoutSankey(tiny, { width: 860, height: 320 }, { minNodeHeight: 10 });
    assert.ok(side(tall, "source").every((n) => n.height >= 10 - 0.01));
  });

  it("copes with a short box and many nodes", () => {
    const many = model(Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`s${i}`, (i + 1) * 1_000_000])));
    const short = layoutSankey(many, { width: 700, height: 200 });
    assert.equal(short.empty, false);
    for (const n of short.nodes) assert.ok(n.y >= 0 && n.y + n.height <= 200 + 0.01, n.key);
  });
});

describe("layoutSankey edge cases", () => {
  it("is empty for an empty model", () => {
    const layout = layoutSankey({ sources: [], targets: [], links: [], targetKinds: {} }, SIZE);
    assert.equal(layout.empty, true);
    assert.deepEqual(layout.nodes, []);
    assert.deepEqual(layout.links, []);
  });

  it("is empty when every value is zero", () => {
    const zero = model({ a: 0, b: 0 });
    assert.equal(layoutSankey(zero, SIZE).empty, true);
  });

  it("is empty for a box with no area", () => {
    assert.equal(layoutSankey(BIG, { width: 0, height: 300 }).empty, true);
    assert.equal(layoutSankey(BIG, { width: 800, height: 0 }).empty, true);
    assert.equal(layoutSankey(BIG, { width: -5, height: -5 }).empty, true);
  });

  it("ignores ribbons that name a missing node, and ribbons with no value", () => {
    const base = model({ a: 100, b: 300 });
    const messy: SankeyModel = {
      ...base,
      links: [
        ...base.links,
        { source: "ghost", target: "gross", value: 999 },
        { source: "a", target: "ghost", value: 999 },
        { source: "a", target: "net", value: 0 },
        { source: "a", target: "net", value: -50 },
        { source: "a", target: "net", value: Number.NaN },
      ],
    };
    const layout = layoutSankey(messy, SIZE);
    assert.equal(layout.links.length, base.links.length);
    assert.deepEqual(layout, layoutSankey(base, SIZE));
  });

  it("draws a node for the larger of its own value and the flow through it", () => {
    const flowing: SankeyModel = {
      sources: [{ key: "a", label: "A", value: 10, valueLabel: "10" }],
      targets: [{ key: "x", label: "X", value: 0, valueLabel: "0" }],
      links: [{ source: "a", target: "x", value: 40 }],
      targetKinds: {},
    };
    const layout = layoutSankey(flowing, SIZE);
    assert.equal(side(layout, "source")[0]!.value, 40);
    assert.equal(side(layout, "target")[0]!.value, 40);
  });

  it("still lays out when only one column has value", () => {
    const lonely: SankeyModel = {
      sources: [{ key: "a", label: "A", value: 50, valueLabel: "50" }],
      targets: [{ key: "x", label: "X", value: 0, valueLabel: "0" }],
      links: [],
      targetKinds: {},
    };
    const layout = layoutSankey(lonely, SIZE);
    assert.equal(layout.empty, false);
    assert.equal(layout.links.length, 0);
    assert.equal(layout.nodes.length, 2);
    assert.ok(Number.isFinite(layout.scale));
  });

  it("makes room for labels on a narrow box without moving the columns past each other", () => {
    const narrow = layoutSankey(BIG, { width: 300, height: 300 });
    const sx = side(narrow, "source")[0]!.x;
    const tx = side(narrow, "target")[0]!.x;
    assert.ok(tx >= sx + SANKEY_DEFAULTS.nodeWidth);
  });

  it("accepts layout overrides", () => {
    const wide = layoutSankey(BIG, SIZE, { labelLeft: 40, nodeWidth: 24 });
    assert.equal(side(wide, "source")[0]!.x, 40);
    assert.equal(side(wide, "source")[0]!.width, 24);
  });

  it("spaces labels by the height each one is given, and keeps every label block inside the box", () => {
    const sourceLabelHeights = [60, 18, 46, 18, 32, 18];
    const targetLabelHeights = [70, 50, 62, 40];
    const laid = layoutSankey(BIG, SIZE, { sourceLabelHeights, targetLabelHeights });
    for (const [which, heights] of [["source", sourceLabelHeights], ["target", targetLabelHeights]] as const) {
      const nodes = side(laid, which);
      nodes.forEach((n, i) => {
        assert.ok(n.labelY - heights[i]! / 2 >= SANKEY_DEFAULTS.top - 0.01, `${which} ${i} starts above the box`);
        assert.ok(n.labelY + heights[i]! / 2 <= SIZE.height - SANKEY_DEFAULTS.bottom + 0.01, `${which} ${i} ends below the box`);
        if (i > 0) assert.ok(n.labelY - nodes[i - 1]!.labelY >= (heights[i]! + heights[i - 1]!) / 2 - 0.02, `${which} ${i} overlaps the label above`);
      });
    }
  });

  it("uses the default label height for a node with no height of its own, and keeps a label level with its node when there is room", () => {
    const two = model({ a: 100, b: 100 });
    const plain = layoutSankey(two, { width: 860, height: 600 });
    const partly = layoutSankey(two, { width: 860, height: 600 }, { sourceLabelHeights: [30] });
    assert.deepEqual(side(partly, "target").map((n) => n.labelY), side(plain, "target").map((n) => n.labelY));
    for (const n of side(partly, "source")) close(n.labelY, n.y + n.height / 2, 0.02, `${n.key} label is level with its node`);
  });
});

describe("nodeValues", () => {
  it("is the value each node is drawn for, in the model's order", () => {
    const laid = layoutSankey(BIG, SIZE);
    const values = nodeValues(BIG);
    assert.deepEqual(values.sources, side(laid, "source").map((n) => n.value));
    assert.deepEqual(values.targets, side(laid, "target").map((n) => n.value));
  });

  it("takes the larger of a node's value and the flow through it, and ignores ribbons that name a node the model does not have", () => {
    const odd: SankeyModel = {
      sources: [
        { key: "a", label: "A", value: 10, valueLabel: "10" },
        { key: "b", label: "B", value: 100, valueLabel: "100" },
      ],
      targets: [{ key: "x", label: "X", value: 0, valueLabel: "0" }],
      links: [
        { source: "a", target: "x", value: 30 },
        { source: "b", target: "x", value: 40 },
        { source: "a", target: "missing", value: 999 },
        { source: "zzz", target: "x", value: 999 },
      ],
      targetKinds: {},
    };
    assert.deepEqual(nodeValues(odd), { sources: [30, 100], targets: [70] });
  });

  it("is empty for an empty model", () => {
    assert.deepEqual(nodeValues({ sources: [], targets: [], links: [], targetKinds: {} }), { sources: [], targets: [] });
  });
});

describe("shareText and sankeySummary", () => {
  it("formats a share to one decimal place", () => {
    assert.equal(shareText(1, 4), "25.0%");
    assert.equal(shareText(1, 3), "33.3%");
    assert.equal(shareText(0, 10), "0.0%");
  });

  it("is empty without a total", () => {
    assert.equal(shareText(5, 0), "");
    assert.equal(shareText(5, -1), "");
  });

  it("says what flows where, with the formatted amounts and shares", () => {
    const text = sankeySummary(
      {
        sources: [
          { key: "a", label: "Other income", value: 75, valueLabel: "A$75" },
          { key: "b", label: "Interest", value: 25, valueLabel: "A$25" },
        ],
        targets: [
          { key: "x", label: "Residents", value: 60, valueLabel: "A$60" },
          { key: "y", label: "ATO", value: 40, valueLabel: "A$40" },
        ],
        links: [],
        targetKinds: {},
      },
      "Distribution",
    );
    assert.equal(text, "Distribution flow chart. From: Other income A$75, Interest A$25. To: Residents A$60 (60.0%), ATO A$40 (40.0%).");
  });

  it("says so when there is nothing to show", () => {
    assert.equal(sankeySummary({ sources: [], targets: [], links: [], targetKinds: {} }), "Distribution flow chart: nothing to show.");
    assert.equal(sankeySummary({ sources: [], targets: [], links: [], targetKinds: {} }, "Withholding"), "Withholding flow chart: nothing to show.");
  });

  it("does not repeat a share that the model's amount already carries", () => {
    const text = sankeySummary({
      sources: [{ key: "a", label: "Other income", value: 100, valueLabel: "A$100" }],
      targets: [
        { key: "x", label: "Residents", value: 60, valueLabel: "A$60 · 60.0%" },
        { key: "y", label: "ATO", value: 40, valueLabel: "A$40" },
      ],
      links: [],
      targetKinds: {},
    });
    assert.equal(text, "Distribution flow chart. From: Other income A$100. To: Residents A$60 · 60.0%, ATO A$40 (40.0%).");
  });
});

describe("withShare", () => {
  it("puts the share after the amount", () => {
    assert.equal(withShare("A$40.63m", "70.0%"), "A$40.63m · 70.0%");
  });

  it("leaves an amount that already carries a percentage alone", () => {
    assert.equal(withShare("A$40.63m · 70.0%", "70.0%"), "A$40.63m · 70.0%");
    assert.equal(withShare("A$40.63m · 70.0%", ""), "A$40.63m · 70.0%");
  });

  it("leaves the amount alone when there is no share to show", () => {
    assert.equal(withShare("A$40.63m", ""), "A$40.63m");
  });
});
