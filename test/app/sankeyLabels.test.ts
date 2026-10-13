import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fundCalc } from "../../src/domain/index.ts";
import { seedData } from "../../src/domain/seed/index.ts";
import type { SankeyModel } from "../../src/domain/types.ts";
import {
  LABEL_GAP,
  LABEL_LINE_EM,
  LABEL_TYPE,
  baseMargins,
  ellipsize,
  estimateTextWidth,
  labelWords,
  planSankeyLabels,
  wrapText,
  type LabelBlock,
  type SankeyLabelPlan,
} from "../../src/app/charts/sankeyLabels.ts";
import { SANKEY_DEFAULTS, layoutSankey } from "../../src/app/charts/sankeyLayout.ts";
import { FIXTURE_SANKEY, FIXTURE_SANKEY_EMPTY, FIXTURE_SANKEY_LONG, FIXTURE_SANKEY_TINY } from "../../src/app/dev/fixtures.ts";

// Widths measured in Chromium with the app's own font (Geist Variable) at 12.5px: names at weight 600, amounts at weight 400 with tabular figures.
const MEASURED_NAMES: Record<string, number> = {
  "Excluded from NCMI — transitional": 207.84,
  "Foreign investors, net of withholding": 217.73,
  "Units not on register": 121.69,
  "Non-residents & others, net": 163.67,
  "Discounted gains": 103.78,
  "Tax-exempt income": 117.02,
  "Australian residents": 120.16,
  "Withheld for the ATO": 123.84,
  "Other income": 80.82,
  "Tax deferred": 75.26,
  "Foreign investors, net": 128.83,
  Interest: 46.96,
  NCMI: 32.82,
  transitional: 68.42,
};
const MEASURED_VALUES: Record<string, number> = {
  "A$40.63m · 70.0%": 103.49,
  "A$517.9k": 56.1,
  "S$1.44m": 51.84,
  "A$100.00m · 100.0%": 118.49,
  "A$30.24m": 59.69,
  "S$12.33m · 66.6%": 103.15,
  "A$2.45m · 4.2%": 88.49,
  "A$76.3k · 0.1%": 84.91,
};

const w = (text: string, size: number = LABEL_TYPE.size): number => estimateTextWidth(text, size);
const squash = (text: string): string => text.trim().split(/\s+/).join(" ");

describe("estimateTextWidth", () => {
  it("is never narrower than the browser draws the text, and never more than 15% wider", () => {
    for (const [text, measured] of [...Object.entries(MEASURED_NAMES), ...Object.entries(MEASURED_VALUES)]) {
      const estimate = w(text, 12.5);
      assert.ok(estimate >= measured, `${text}: estimated ${estimate.toFixed(1)}px, drawn ${measured}px`);
      assert.ok(estimate <= measured * 1.15, `${text}: estimated ${estimate.toFixed(1)}px, drawn ${measured}px`);
    }
  });

  it("scales with the font size, and is zero for no text", () => {
    assert.equal(w("", 12.5), 0);
    assert.ok(Math.abs(w("Other income", 25) - 2 * w("Other income", 12.5)) < 1e-9);
    assert.ok(w("Other income", 11) < w("Other income", 12.5));
  });

  it("measures characters outside basic Latin (dashes, the middle dot, an ellipsis) rather than ignoring them", () => {
    for (const ch of ["—", "–", "·", "…", "’", "×", "é", "日"]) assert.ok(w(`a${ch}b`) > w("ab"), ch);
    assert.ok(w("—") > w("-"));
  });
});

describe("labelWords", () => {
  it("splits at spaces and ignores extra whitespace", () => {
    assert.deepEqual(labelWords("  Other   income "), ["Other", "income"]);
    assert.deepEqual(labelWords(""), []);
  });

  it("keeps a dash with the word before it, so no line starts with one", () => {
    assert.deepEqual(labelWords("Excluded from NCMI — transitional"), ["Excluded", "from", "NCMI —", "transitional"]);
    assert.deepEqual(labelWords("2025 – 2026"), ["2025 –", "2026"]);
  });

  it("keeps an ampersand with the word after it, so no line ends with one", () => {
    assert.deepEqual(labelWords("Non-residents & others, net"), ["Non-residents", "& others,", "net"]);
    assert.deepEqual(labelWords("Terms &"), ["Terms", "&"]);
  });
});

describe("ellipsize", () => {
  it("leaves text that fits alone and otherwise ends it with an ellipsis within the width", () => {
    assert.equal(ellipsize("Interest", 100, 12.5), "Interest");
    for (const max of [20, 45, 80, 120]) {
      const cut = ellipsize("Excluded from NCMI — transitional", max, 12.5);
      assert.ok(cut.endsWith("…"), cut);
      assert.ok(w(cut) <= max || cut === "E…", `${cut} is ${w(cut).toFixed(1)}px in ${max}px`);
      assert.ok("Excluded from NCMI — transitional".startsWith(cut.slice(0, -1).trimEnd()));
    }
  });
});

describe("wrapText", () => {
  const LONG = "Excluded from NCMI — transitional";

  it("keeps a name that fits on one line", () => {
    assert.deepEqual(wrapText("Other income", 200, 12.5, 3), { lines: ["Other income"], overflow: false, truncated: false });
  });

  it("breaks a name at spaces so that no line is wider than the room, and loses no word", () => {
    for (let room = 60; room <= 260; room += 5) {
      const wrapped = wrapText(LONG, room, 12.5, 4);
      if (wrapped.overflow) continue;
      assert.equal(wrapped.lines.join(" "), LONG, `room ${room}`);
      for (const line of wrapped.lines) assert.ok(w(line) <= room, `${line} is ${w(line).toFixed(1)}px in ${room}px`);
      for (const line of wrapped.lines) assert.ok(!line.startsWith("—"), `${line} starts with a dash`);
    }
  });

  it("uses as few lines as it can", () => {
    assert.equal(wrapText(LONG, w(LONG) + 1, 12.5, 3).lines.length, 1);
    assert.equal(wrapText(LONG, w(LONG) - 1, 12.5, 3).lines.length, 2);
  });

  it("says so when a word is wider than the line, or the name needs more lines than it may have", () => {
    const tooNarrow = wrapText("Transitional", 20, 12.5, 3);
    assert.equal(tooNarrow.overflow, true);
    assert.deepEqual(tooNarrow.lines, ["Transitional"]);
    const tooTall = wrapText(LONG, 60, 12.5, 2);
    assert.equal(tooTall.overflow, true);
    assert.equal(tooTall.truncated, false);
  });

  it("with force always fits: it breaks long words, and ends the last line with an ellipsis when there are too many lines", () => {
    const broken = wrapText("Transitional", 30, 12.5, 5, true);
    assert.equal(broken.truncated, false);
    assert.ok(broken.lines.length > 1);
    assert.equal(broken.lines.join(""), "Transitional");
    for (const line of broken.lines) assert.ok(w(line) <= 30 || [...line].length === 1, line);

    const cut = wrapText(LONG, 70, 12.5, 2, true);
    assert.equal(cut.lines.length, 2);
    assert.equal(cut.truncated, true);
    assert.ok(cut.lines[1]!.endsWith("…"));
    for (const line of cut.lines) assert.ok(w(line) <= 70, line);
  });

  it("gives one empty line for no text", () => {
    assert.deepEqual(wrapText("", 100, 12.5, 3), { lines: [""], overflow: false, truncated: false });
  });
});

describe("baseMargins", () => {
  it("is the room the chart has always reserved for short labels", () => {
    const expectMargins = (width: number, compact: boolean, left: number, right: number): void => {
      const got = baseMargins(width);
      assert.equal(got.compact, compact, `${width}`);
      assert.ok(Math.abs(got.labelLeft - left) < 1e-9, `${width}: left ${got.labelLeft}`);
      assert.ok(Math.abs(got.labelRight - right) < 1e-9, `${width}: right ${got.labelRight}`);
    };
    expectMargins(860, false, 189.2, 206.4);
    expectMargins(1400, false, 190, 210);
    expectMargins(620, false, 150, 160);
    expectMargins(619, true, 130, 150);
    expectMargins(360, true, 93.6, 108);
    expectMargins(200, true, 86, 100);
  });
});

// ------------------------------------------------------------------------------------------------------ plans
const data = seedData();
const NOW = new Date(2026, 9, 12, 9, 0, 0);
const FUND_MODELS: [string, SankeyModel][] = data.funds.map((fund) => [fund.id, fundCalc(data, fund.id, NOW).sankey]);
const MODELS: [string, SankeyModel][] = [...FUND_MODELS, ["long fixture", FIXTURE_SANKEY_LONG], ["fixture", FIXTURE_SANKEY], ["tiny fixture", FIXTURE_SANKEY_TINY]];
const WIDTHS = [300, 320, 360, 390, 480, 560, 619, 620, 660, 700, 768, 860, 900, 1100, 1400];

const sides = (plan: SankeyLabelPlan): [string, LabelBlock[], number][] => [
  ["source", plan.sources, plan.labelLeft],
  ["target", plan.targets, plan.labelRight],
];

/** Every label fits the margin it sits in, and is as tall as its lines need. */
function assertLabelsFit(plan: SankeyLabelPlan, what: string): void {
  for (const [side, blocks, margin] of sides(plan)) {
    blocks.forEach((block, i) => {
      assert.ok(block.width + LABEL_GAP <= margin + 0.01, `${what}: ${side} label ${i} is ${block.width.toFixed(1)}px wide in a ${margin.toFixed(1)}px margin`);
      assert.equal(block.lines, block.name.length + (block.inline ? 0 : 1), `${what}: ${side} label ${i} lines`);
      assert.ok(block.height >= block.lines * plan.fontSize * LABEL_LINE_EM, `${what}: ${side} label ${i} is too short for its lines`);
    });
  }
}

/** As `assertLabelsFit`, and the margins leave the nodes and some room for the ribbons between them. */
function assertFits(plan: SankeyLabelPlan, width: number, what: string): void {
  assertLabelsFit(plan, what);
  assert.ok(plan.labelLeft + plan.labelRight + 2 * SANKEY_DEFAULTS.nodeWidth <= width - 50, `${what}: the margins leave no room for the ribbons`);
}

describe("planSankeyLabels", () => {
  it("keeps the chart's usual margins when the labels are short", () => {
    for (const width of [560, 860, 1100]) {
      const plan = planSankeyLabels(FIXTURE_SANKEY, width);
      const base = baseMargins(width);
      assert.equal(plan.labelLeft, base.labelLeft, `${width} left`);
      assert.equal(plan.labelRight, base.labelRight, `${width} right`);
      assert.equal(plan.fontSize, LABEL_TYPE.size);
      assert.equal(plan.stacked, base.compact);
    }
  });

  it("puts the amount beside a source's name from 620px and under it below, as the chart always has", () => {
    assert.ok(planSankeyLabels(FIXTURE_SANKEY, 619).sources.every((b) => !b.inline && b.lines === b.name.length + 1));
    assert.ok(planSankeyLabels(FIXTURE_SANKEY, 620).sources.every((b) => b.inline && b.lines === 1));
    for (const width of [400, 860]) assert.ok(planSankeyLabels(FIXTURE_SANKEY, width).targets.every((b) => !b.inline && b.lines === b.name.length + 1));
  });

  it("never clips a label of any fund, or the long fixture, at any chart width from 300px", () => {
    for (const [id, model] of MODELS) {
      for (const width of WIDTHS) {
        const plan = planSankeyLabels(model, width);
        assertFits(plan, width, `${id} at ${width}`);
        for (const [side, blocks] of [["source", plan.sources], ["target", plan.targets]] as const) {
          const nodes = side === "source" ? model.sources : model.targets;
          blocks.forEach((block, i) => {
            assert.equal(block.truncated, false, `${id} at ${width}: ${side} label ${i} was cut short`);
            assert.equal(block.name.join(" "), squash(nodes[i]!.label), `${id} at ${width}: ${side} label ${i} lost a word`);
          });
        }
      }
    }
  });

  it("keeps the full label type for every fund from 360px", () => {
    for (const [id, model] of FUND_MODELS) {
      for (const width of WIDTHS.filter((x) => x >= 360)) assert.equal(planSankeyLabels(model, width).fontSize, LABEL_TYPE.size, `${id} at ${width}`);
    }
  });

  it("widens the left margin to the longest source label between 620px and 700px, where the old fixed room cut it off", () => {
    const meranti = FUND_MODELS.find(([id]) => id === "meranti")![1];
    for (const width of [620, 660, 700]) {
      const plan = planSankeyLabels(meranti, width);
      const base = baseMargins(width);
      assert.equal(plan.stacked, false);
      assert.ok(plan.labelLeft > base.labelLeft + 20, `${width}: ${plan.labelLeft} vs ${base.labelLeft}`);
      const widest = Math.max(...plan.sources.map((b) => b.width));
      assert.ok(plan.labelLeft >= widest + LABEL_GAP);
    }
  });

  it("gives the right margin what the destination amounts need when the old room was narrower", () => {
    const kurrajong = FUND_MODELS.find(([id]) => id === "kurrajong")![1];
    const plan = planSankeyLabels(kurrajong, 360);
    assert.ok(plan.labelRight > baseMargins(360).labelRight + 10);
    for (const block of plan.targets) assert.ok(block.width + LABEL_GAP <= plan.labelRight + 0.01);
  });

  it("shows a destination's share once, whether or not the model's amount already carries it", () => {
    for (const [id, model] of MODELS) {
      for (const block of planSankeyLabels(model, 900).targets) {
        if (model.targets.length === 0) continue;
        assert.equal((block.value.match(/%/g) ?? []).length, 1, `${id}: ${block.value}`);
      }
    }
    assert.ok(planSankeyLabels(FIXTURE_SANKEY, 900).targets[0]!.value.includes(" · "));
  });

  it("breaks the long name onto lines when the chart is narrow and keeps it on one line when there is room", () => {
    const label = "Excluded from NCMI — transitional";
    const narrow = planSankeyLabels(FIXTURE_SANKEY_LONG, 360);
    assert.ok(narrow.sources[0]!.name.length >= 2);
    assert.equal(narrow.sources[0]!.name.join(" "), label);
    assert.equal(narrow.stacked, true);
    const wide = planSankeyLabels(FIXTURE_SANKEY_LONG, 1100);
    assert.deepEqual(wide.sources[0]!.name, [label]);
    assert.equal(wide.sources[0]!.inline, true);
    // From 620px up the amount only goes beside the name if the whole label fits; otherwise it stays under the name.
    assert.equal(planSankeyLabels(FIXTURE_SANKEY_LONG, 620).sources[0]!.inline, false);
  });

  it("takes the type down a step at a time, and gives the ribbons less room, before it cuts a word off", () => {
    let previous: number = LABEL_TYPE.size;
    for (let width = 400; width >= 240; width -= 10) {
      const plan = planSankeyLabels(FIXTURE_SANKEY_LONG, width);
      assert.ok(plan.fontSize <= previous + 1e-9, `${width}: the type grew as the chart narrowed`);
      previous = plan.fontSize;
      assert.ok(plan.fontSize >= LABEL_TYPE.min - 1e-9 && plan.fontSize <= LABEL_TYPE.size + 1e-9);
      assert.equal(((plan.fontSize - LABEL_TYPE.min) / LABEL_TYPE.step) % 1, 0);
      assertLabelsFit(plan, `long fixture at ${width}`);
    }
    assert.ok(previous < LABEL_TYPE.size);
  });

  it("as a last resort ends names with an ellipsis, and still fits every label", () => {
    const plan = planSankeyLabels(FIXTURE_SANKEY_LONG, 190);
    const cut = [...plan.sources, ...plan.targets].filter((b) => b.truncated);
    assert.ok(cut.length > 0);
    for (const block of cut) assert.ok(block.name.some((line) => line.endsWith("…")) || block.value.endsWith("…"));
    assert.equal(plan.fontSize, LABEL_TYPE.min);
    for (const [side, blocks, margin] of sides(plan)) {
      for (const block of blocks) assert.ok(block.width + LABEL_GAP <= margin + 0.01, `${side} ${block.name.join(" ")}`);
    }
  });

  it("asks for a height at which every label and every node has room", () => {
    for (const [id, model] of MODELS) {
      for (const width of WIDTHS) {
        const plan = planSankeyLabels(model, width);
        for (const [side, blocks] of [["source", plan.sources], ["target", plan.targets]] as const) {
          const need = blocks.reduce((sum, b) => sum + b.height, 0) + SANKEY_DEFAULTS.top + SANKEY_DEFAULTS.bottom;
          assert.ok(plan.minHeight >= need - 1e-9, `${id} at ${width}: ${side} labels need ${need}, plan says ${plan.minHeight}`);
        }
        assert.ok(plan.sourcePadding >= 14 && plan.targetPadding >= 28);
      }
    }
  });

  it("lays the labels out without overlap or leaving the chart, at the height the plan asks for", () => {
    for (const [id, model] of MODELS) {
      for (const width of [360, 480, 620, 700, 900, 1100]) {
        const plan = planSankeyLabels(model, width);
        const nodeCount = Math.max(model.sources.length, model.targets.length);
        const height = Math.max(plan.stacked ? 300 : 260, nodeCount * (plan.stacked ? 50 : 44) + 24, Math.ceil(plan.minHeight));
        const layout = layoutSankey(
          model,
          { width, height },
          {
            labelLeft: plan.labelLeft,
            labelRight: plan.labelRight,
            sourcePadding: plan.sourcePadding,
            targetPadding: plan.targetPadding,
            sourceLabelHeights: plan.sources.map((b) => b.height),
            targetLabelHeights: plan.targets.map((b) => b.height),
          },
        );
        for (const [side, blocks] of [["source", plan.sources], ["target", plan.targets]] as const) {
          const nodes = layout.nodes.filter((n) => n.side === side);
          assert.equal(nodes.length, blocks.length);
          const placed = nodes.map((node, i) => ({ y: node.labelY, h: blocks[i]!.height })).sort((a, b) => a.y - b.y);
          placed.forEach((p, i) => {
            assert.ok(p.y - p.h / 2 >= -0.01, `${id} at ${width}: a ${side} label starts above the chart`);
            assert.ok(p.y + p.h / 2 <= height + 0.01, `${id} at ${width}: a ${side} label ends below the chart`);
            if (i > 0) assert.ok(p.y - placed[i - 1]!.y >= (p.h + placed[i - 1]!.h) / 2 - 0.02, `${id} at ${width}: ${side} labels overlap`);
          });
        }
      }
    }
  });

  it("is a pure function of the model and the width", () => {
    for (const [, model] of MODELS) assert.deepEqual(planSankeyLabels(model, 500), planSankeyLabels(model, 500));
  });

  it("plans nothing for an empty model", () => {
    const plan = planSankeyLabels(FIXTURE_SANKEY_EMPTY, 860);
    assert.deepEqual(plan.sources, []);
    assert.deepEqual(plan.targets, []);
    assert.equal(plan.minHeight, 0);
    assert.equal(planSankeyLabels(FIXTURE_SANKEY_EMPTY, 0).minHeight, 0);
  });
});
