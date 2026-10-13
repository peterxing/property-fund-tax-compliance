import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PERCENT_SCALE, niceScale, rowTotal, stackedLayout, type StackedRow } from "../../src/app/charts/stackedBars.ts";

const row = (label: string, ...values: number[]): StackedRow => ({
  label,
  segments: values.map((value, i) => ({ key: `s${i}`, label: `Segment ${i}`, value })),
});

describe("niceScale", () => {
  it("picks a round step and covers the maximum tightly", () => {
    assert.deepEqual(niceScale(8.2), { max: 9, step: 3, ticks: [0, 3, 6, 9] });
    assert.deepEqual(niceScale(7), { max: 8, step: 2, ticks: [0, 2, 4, 6, 8] });
    assert.deepEqual(niceScale(2.7), { max: 3, step: 1, ticks: [0, 1, 2, 3] });
  });

  it("handles fractions without floating point noise", () => {
    const scale = niceScale(0.37);
    assert.deepEqual(scale.ticks, [0, 0.1, 0.2, 0.3, 0.4]);
    assert.equal(scale.max, 0.4);
    assert.equal(scale.step, 0.1);
  });

  it("scales up to large values", () => {
    const scale = niceScale(8_200_000);
    assert.equal(scale.step, 3_000_000);
    assert.equal(scale.max, 9_000_000);
  });

  it("gives a zero, negative or broken maximum the axis 0..1", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) assert.deepEqual(niceScale(bad), { max: 1, step: 1, ticks: [0, 1] }, String(bad));
  });

  it("always starts at zero, ends at max, is evenly spaced and uses a round step", () => {
    for (let max = 0.05; max < 5000; max *= 1.37) {
      const scale = niceScale(max);
      assert.equal(scale.ticks[0], 0, `max ${max}`);
      assert.equal(scale.ticks.at(-1), scale.max, `max ${max}`);
      assert.ok(scale.max >= max - 1e-9, `covers ${max}`);
      assert.ok(scale.max - scale.step < max + 1e-9, `tight for ${max}`);
      assert.ok(scale.ticks.length - 1 >= 3 && scale.ticks.length - 1 <= 4, `${scale.ticks.length - 1} intervals for ${max}`);
      scale.ticks.forEach((tick, i) => assert.ok(Math.abs(tick - i * scale.step) < 1e-9, `tick ${i} for ${max}`));
      const mantissa = scale.step / 10 ** Math.floor(Math.log10(scale.step));
      assert.ok([1, 2, 3, 5].some((m) => Math.abs(mantissa - m) < 1e-6) || Math.abs(mantissa - 10) < 1e-6, `step ${scale.step}`);
    }
  });

  it("respects a different number of intervals", () => {
    const scale = niceScale(100, 5);
    assert.equal(scale.step, 20);
    assert.equal(scale.ticks.length, 6);
  });
});

describe("rowTotal", () => {
  it("adds the positive, finite segments", () => {
    assert.equal(rowTotal(row("a", 1, 2, 3)), 6);
    assert.equal(rowTotal(row("a", 1, -2, Number.NaN, Number.POSITIVE_INFINITY, 4)), 5);
    assert.equal(rowTotal(row("a")), 0);
  });
});

describe("stackedLayout", () => {
  it("scales a max-mode chart to the nice axis so the longest bar nearly fills the track", () => {
    const rows = [row("a", 2.7), row("b", 1.0, 7.2), row("c", 3.0)];
    const { axis, widths, totals } = stackedLayout(rows, "max");
    assert.deepEqual(totals, [2.7, 8.2, 3]);
    assert.equal(axis.max, 9);
    assert.deepEqual(widths[0], [(2.7 / 9) * 100]);
    assert.ok(Math.abs(widths[1]!.reduce((a, b) => a + b, 0) - (8.2 / 9) * 100) < 1e-9);
    assert.ok(widths.flat().every((w) => w >= 0 && w <= 100));
  });

  it("keeps segment widths proportional to their values", () => {
    const { widths } = stackedLayout([row("a", 1, 2, 4)], "max");
    assert.ok(Math.abs(widths[0]![1]! / widths[0]![0]! - 2) < 1e-9);
    assert.ok(Math.abs(widths[0]![2]! / widths[0]![0]! - 4) < 1e-9);
  });

  it("normalises every row to fill the track in 100% mode", () => {
    const { axis, widths } = stackedLayout([row("a", 50, 30, 20), row("b", 1, 1, 2), row("c", 0, 0)], 100);
    assert.equal(axis, PERCENT_SCALE);
    assert.deepEqual(widths[0], [50, 30, 20]);
    assert.deepEqual(widths[1], [25, 25, 50]);
    assert.deepEqual(widths[2], [0, 0]);
  });

  it("draws nothing for negative or non-finite values", () => {
    const { widths } = stackedLayout([row("a", -3, Number.NaN, 5)], "max");
    assert.deepEqual(widths[0]!.slice(0, 2), [0, 0]);
    assert.ok(widths[0]![2]! > 0);
  });

  it("gives an empty chart a scale and no widths", () => {
    const empty = stackedLayout([], "max");
    assert.deepEqual(empty.axis, { max: 1, step: 1, ticks: [0, 1] });
    assert.deepEqual(empty.widths, []);
    assert.deepEqual(empty.totals, []);
    assert.deepEqual(stackedLayout([row("a", 0, 0)], "max").widths, [[0, 0]]);
  });

  it("has a percent scale at quarter steps", () => {
    assert.deepEqual(PERCENT_SCALE.ticks, [0, 25, 50, 75, 100]);
  });
});
