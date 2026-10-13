import { Fragment, useId } from "react";
import { cls } from "../ui/cls.ts";
import { stackedLayout, type StackedRow } from "./stackedBars.ts";

export interface StackedBarsProps {
  rows: readonly StackedRow[];
  /** `"max"` sizes the axis to the largest row total (leakage); `100` shows each row as shares of 100% (mix). */
  scale: "max" | 100;
  /** The chart's accessible name. The workspace renders the same numbers as a real table. */
  summary: string;
  /** CSS colour per segment key, for example `"var(--viz-withheld)"`. Keys not listed cycle through the --viz-N tokens. */
  segmentColors?: Readonly<Record<string, string>>;
  /** Text for a segment's tooltip value and the legend-less fallbacks ("2.7%"). */
  formatValue?: (value: number) => string;
  /** Axis tick text ("6%"). */
  formatTick?: (value: number) => string;
  /** Legend entries; by default every segment key in order of first appearance. */
  legend?: ReadonlyArray<{ key: string; label: string }>;
  /** Shown instead of the chart when there are no rows. */
  emptyMessage?: string;
  className?: string;
}

/** Horizontal stacked bars with a labelled axis and a legend, drawn with CSS so they stay crisp and wrap their labels. */
export function StackedBars({
  rows,
  scale,
  summary,
  segmentColors = {},
  formatValue = String,
  formatTick = String,
  legend,
  emptyMessage = "No data to chart.",
  className,
}: StackedBarsProps) {
  const uid = useId();
  const { axis, widths } = stackedLayout(rows, scale);

  const keys: string[] = [];
  const labels = new Map<string, string>();
  for (const row of rows) {
    for (const segment of row.segments) {
      if (!labels.has(segment.key)) {
        labels.set(segment.key, segment.label);
        keys.push(segment.key);
      }
    }
  }
  const colorOf = (key: string): string => segmentColors[key] ?? `var(--viz-${(keys.indexOf(key) % 5) + 1})`;
  const entries = legend ?? keys.map((key) => ({ key, label: labels.get(key) ?? key }));
  const rowCount = rows.length;

  if (rowCount === 0) return <p className={cls("sbars__empty", className)}>{emptyMessage}</p>;

  return (
    <figure className={cls("sbars", className)}>
      <div className="sbars__plot" role="img" aria-label={summary} style={{ gridTemplateRows: `repeat(${rowCount}, auto) auto` }}>
        <div className="sbars__grid" aria-hidden="true" style={{ gridRow: `1 / span ${rowCount}` }}>
          {axis.ticks.map((tick) => (
            <span key={tick} className="sbars__line" style={{ left: `${(tick / axis.max) * 100}%` }} />
          ))}
        </div>
        {rows.map((row, r) => (
          <Fragment key={row.key ?? `${uid}-${r}`}>
            <div className="sbars__label" style={{ gridRow: r + 1 }}>
              {row.label}
            </div>
            <div className="sbars__track" style={{ gridRow: r + 1 }}>
              {row.segments.map((segment, s) =>
                widths[r]![s]! > 0 ? (
                  <span
                    key={segment.key}
                    className="sbars__seg"
                    style={{ width: `${widths[r]![s]}%`, background: colorOf(segment.key) }}
                    title={`${row.label}: ${segment.label} ${formatValue(segment.value)}`}
                  />
                ) : null,
              )}
            </div>
          </Fragment>
        ))}
        <div className="sbars__axis" aria-hidden="true" style={{ gridRow: rowCount + 1 }}>
          {axis.ticks.map((tick) => (
            <span key={tick} className="sbars__tick" style={{ left: `${(tick / axis.max) * 100}%` }}>
              {formatTick(tick)}
            </span>
          ))}
        </div>
      </div>
      {entries.length > 0 ? (
        <ul className="sbars__legend" aria-label="Legend">
          {entries.map((entry) => (
            <li key={entry.key}>
              <span className="sbars__swatch" style={{ background: colorOf(entry.key) }} aria-hidden="true" />
              {entry.label}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}
