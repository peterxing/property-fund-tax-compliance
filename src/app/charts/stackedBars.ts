export interface NiceScale {
  /** Upper end of the axis (a multiple of `step` at or above the data maximum). */
  max: number;
  step: number;
  /** 0, step, 2*step ... max. */
  ticks: number[];
}

const clean = (n: number): number => Math.round(n * 1e9) / 1e9;

/**
 * Axis for bars that grow from zero: a round step (1, 2, 3, 5 or 10 times a power of ten) that gives about `intervals` ticks, and the
 * smallest multiple of it that covers `max`. A maximum of zero (or less) gives the axis 0..1 so an all-zero chart still has a scale.
 */
export function niceScale(max: number, intervals = 4): NiceScale {
  if (!Number.isFinite(max) || max <= 0) return { max: 1, step: 1, ticks: [0, 1] };
  const raw = max / Math.max(1, intervals);
  const base = 10 ** Math.floor(Math.log10(raw));
  const f = raw / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 3 ? 3 : f <= 5 ? 5 : 10;
  const step = clean(nice * base);
  const count = Math.max(1, Math.ceil(clean(max / step)));
  const ticks = Array.from({ length: count + 1 }, (_, i) => clean(i * step));
  return { max: ticks[ticks.length - 1]!, step, ticks };
}

/** Axis for a 100% chart: 0, 25, 50, 75, 100. */
export const PERCENT_SCALE: NiceScale = { max: 100, step: 25, ticks: [0, 25, 50, 75, 100] };

export interface StackedSegment {
  key: string;
  label: string;
  /** In the unit of the axis (percent points, dollars...). Negative and non-finite values draw nothing. */
  value: number;
}

export interface StackedRow {
  key?: string;
  label: string;
  segments: readonly StackedSegment[];
}

export function rowTotal(row: Pick<StackedRow, "segments">): number {
  return row.segments.reduce((sum, s) => sum + (Number.isFinite(s.value) && s.value > 0 ? s.value : 0), 0);
}

/**
 * The axis and each segment's width as a percentage of the track.
 * `"max"` scales to the largest row total; `100` treats every row as a share of 100 (rows are normalised so each fills the track).
 */
export function stackedLayout(
  rows: readonly StackedRow[],
  scale: "max" | 100,
): { axis: NiceScale; widths: number[][]; totals: number[] } {
  const totals = rows.map(rowTotal);
  const axis = scale === 100 ? PERCENT_SCALE : niceScale(Math.max(0, ...totals));
  const widths = rows.map((row, r) =>
    row.segments.map((segment) => {
      const value = Number.isFinite(segment.value) && segment.value > 0 ? segment.value : 0;
      if (scale === 100) return totals[r]! > 0 ? (value / totals[r]!) * 100 : 0;
      return (value / axis.max) * 100;
    }),
  );
  return { axis, widths, totals };
}
