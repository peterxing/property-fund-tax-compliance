import type { SankeyModel } from "../../domain/types.ts";

export type SankeySide = "source" | "target";

export interface SankeyLayoutOptions {
  /** Room left of the source column for its labels. */
  labelLeft?: number;
  /** Room right of the target column for its labels. */
  labelRight?: number;
  nodeWidth?: number;
  /** Vertical gap between source nodes / between target nodes. */
  sourcePadding?: number;
  targetPadding?: number;
  /** Nodes with a tiny value are drawn at least this tall so they stay visible and labelled. */
  minNodeHeight?: number;
  top?: number;
  bottom?: number;
  /** Height of one label, used to keep neighbouring labels from overlapping. */
  sourceLabelHeight?: number;
  targetLabelHeight?: number;
  /** Heights of labels that are taller (or shorter) than the default, in the order of the model's nodes; they replace the default for that node. */
  sourceLabelHeights?: readonly number[];
  targetLabelHeights?: readonly number[];
}

export interface SankeyNodeLayout {
  key: string;
  side: SankeySide;
  label: string;
  valueLabel: string;
  /** The value the node is drawn for: the larger of its own value and the flow through it. */
  value: number;
  /** Share of the column total, 0..1 (0 when the column is empty). */
  share: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Vertical centre for the label (spread so labels do not overlap). */
  labelY: number;
}

export interface SankeyLinkLayout {
  source: string;
  target: string;
  value: number;
  /** Cubic Bézier along the middle of the ribbon. */
  path: string;
  /** Ribbon thickness in px (at least 1 so every flow is visible). */
  strokeWidth: number;
  /** Ribbon thickness the value earns on the shared scale (may be < 1). */
  thickness: number;
}

export interface SankeyLayout {
  width: number;
  height: number;
  nodes: SankeyNodeLayout[];
  links: SankeyLinkLayout[];
  /** Pixels per cent, shared by both columns. */
  scale: number;
  /** Nothing to draw: no nodes or no value. */
  empty: boolean;
}

export const SANKEY_DEFAULTS = {
  labelLeft: 176,
  labelRight: 196,
  nodeWidth: 14,
  sourcePadding: 14,
  targetPadding: 28,
  minNodeHeight: 3,
  top: 8,
  bottom: 8,
  sourceLabelHeight: 17,
  targetLabelHeight: 34,
} as const satisfies Omit<Required<SankeyLayoutOptions>, "sourceLabelHeights" | "targetLabelHeights">;

const round = (n: number): number => Math.round(n * 100) / 100;
const positive = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * The pixels-per-unit scale at which a column of nodes (each at least `minHeight` tall) exactly fits `available` pixels.
 * Zero when there is nothing to scale or no room.
 */
export function fitScale(values: readonly number[], available: number, minHeight: number): number {
  const total = values.reduce((sum, v) => sum + positive(v), 0);
  if (total <= 0 || available <= 0) return 0;
  const used = (scale: number): number => values.reduce((sum, v) => sum + Math.max(minHeight, positive(v) * scale), 0);
  if (used(0) >= available) return 0;
  let lo = 0;
  let hi = available / total;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (used(mid) <= available) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Nudge label blocks (centres given top to bottom, each `heights[i]` tall) apart so none overlap, staying inside [top, bottom]. */
export function spreadLabelBlocks(centres: readonly number[], heights: readonly number[], top: number, bottom: number): number[] {
  const out = [...centres];
  for (let i = 0; i < out.length; i++) {
    const floor = i === 0 ? top + heights[0]! / 2 : out[i - 1]! + (heights[i - 1]! + heights[i]!) / 2;
    if (out[i]! < floor) out[i] = floor;
  }
  for (let i = out.length - 1; i >= 0; i--) {
    const ceiling = i === out.length - 1 ? bottom - heights[i]! / 2 : out[i + 1]! - (heights[i]! + heights[i + 1]!) / 2;
    if (out[i]! > ceiling) out[i] = ceiling;
  }
  return out;
}

/** Nudge label centres (given top to bottom) apart so no two are closer than `gap`, staying inside [min, max]. */
export function spreadLabels(centres: readonly number[], gap: number, min: number, max: number): number[] {
  return spreadLabelBlocks(centres, centres.map(() => gap), min - gap / 2, max + gap / 2);
}

interface Column {
  keys: string[];
  values: number[];
}

function column(nodes: SankeyModel["sources"], flow: Map<string, number>): Column {
  return { keys: nodes.map((n) => n.key), values: nodes.map((n) => Math.max(positive(n.value), flow.get(n.key) ?? 0)) };
}

/** The ribbons the layout can draw (both ends exist and the value is positive) and the flow through each node. */
function flows(model: SankeyModel): { links: SankeyModel["links"]; outflow: Map<string, number>; inflow: Map<string, number> } {
  const sourceKeys = new Set(model.sources.map((n) => n.key));
  const targetKeys = new Set(model.targets.map((n) => n.key));
  const links = model.links.filter((l) => sourceKeys.has(l.source) && targetKeys.has(l.target) && positive(l.value) > 0);
  const outflow = new Map<string, number>();
  const inflow = new Map<string, number>();
  for (const link of links) {
    outflow.set(link.source, (outflow.get(link.source) ?? 0) + link.value);
    inflow.set(link.target, (inflow.get(link.target) ?? 0) + link.value);
  }
  return { links, outflow, inflow };
}

/** The value each node is drawn for, in the order of the model's nodes: the larger of its own value and the flow through it. */
export function nodeValues(model: SankeyModel): { sources: number[]; targets: number[] } {
  const { outflow, inflow } = flows(model);
  return { sources: column(model.sources, outflow).values, targets: column(model.targets, inflow).values };
}

/**
 * Lays a two-column Sankey out in a `width` x `height` box. Pure: the same model and size always give the same geometry.
 *
 * - Node heights are proportional to value on one scale shared by both columns, except that no node is shorter than `minNodeHeight`.
 * - Columns are centred vertically, nodes never overlap and never leave the box.
 * - Within a node the ribbons are stacked in the order of the node at the other end, so they cross as little as possible, and each
 *   ribbon's thickness is its value on the shared scale, so flow is conserved through every node.
 * - Ribbons that name a node the model does not have are ignored.
 */
export function layoutSankey(model: SankeyModel, size: { width: number; height: number }, options: SankeyLayoutOptions = {}): SankeyLayout {
  const o = { ...SANKEY_DEFAULTS, ...options };
  const width = Math.max(0, size.width);
  const height = Math.max(0, size.height);

  const { links, outflow, inflow } = flows(model);
  const sources = column(model.sources, outflow);
  const targets = column(model.targets, inflow);

  const sourceTotal = sources.values.reduce((a, b) => a + b, 0);
  const targetTotal = targets.values.reduce((a, b) => a + b, 0);
  const empty = width === 0 || height === 0 || (sourceTotal <= 0 && targetTotal <= 0);
  if (empty || model.sources.length + model.targets.length === 0) return { width, height, nodes: [], links: [], scale: 0, empty: true };

  const inner = Math.max(0, height - o.top - o.bottom);
  const room = (count: number, padding: number): number => inner - padding * Math.max(0, count - 1);
  const scales = [
    sourceTotal > 0 ? fitScale(sources.values, room(sources.values.length, o.sourcePadding), o.minNodeHeight) : Infinity,
    targetTotal > 0 ? fitScale(targets.values, room(targets.values.length, o.targetPadding), o.minNodeHeight) : Infinity,
  ];
  const scale = Math.min(...scales);

  const nodes: SankeyNodeLayout[] = [];
  const place = (
    side: SankeySide,
    source: SankeyModel["sources"],
    col: Column,
    padding: number,
    x: number,
    labelHeight: number,
    labelHeights: readonly number[] | undefined,
  ): void => {
    const heights = col.values.map((v) => Math.max(o.minNodeHeight, v * scale));
    const used = heights.reduce((a, b) => a + b, 0) + padding * Math.max(0, heights.length - 1);
    let y = o.top + Math.max(0, (inner - used) / 2);
    const total = col.values.reduce((a, b) => a + b, 0);
    const placed = source.map((node, i) => {
      const h = heights[i]!;
      const top = y;
      y += h + padding;
      return { node, i, top, h };
    });
    const labelYs = spreadLabelBlocks(
      placed.map((p) => p.top + p.h / 2),
      placed.map((p) => labelHeights?.[p.i] ?? labelHeight),
      o.top,
      height - o.bottom,
    );
    placed.forEach((p, n) => {
      nodes.push({
        key: p.node.key,
        side,
        label: p.node.label,
        valueLabel: p.node.valueLabel,
        value: col.values[p.i]!,
        share: total > 0 ? col.values[p.i]! / total : 0,
        x: round(x),
        y: round(p.top),
        width: o.nodeWidth,
        height: round(p.h),
        labelY: round(labelYs[n]!),
      });
    });
  };
  place("source", model.sources, sources, o.sourcePadding, o.labelLeft, o.sourceLabelHeight, options.sourceLabelHeights);
  place(
    "target",
    model.targets,
    targets,
    o.targetPadding,
    Math.max(o.labelLeft + o.nodeWidth, width - o.labelRight - o.nodeWidth),
    o.targetLabelHeight,
    options.targetLabelHeights,
  );

  const byKey = new Map(nodes.map((n) => [`${n.side}:${n.key}`, n]));
  const sourceOrder = new Map(model.sources.map((n, i) => [n.key, i]));
  const targetOrder = new Map(model.targets.map((n, i) => [n.key, i]));
  const sourceOffset = new Map<string, number>();
  const targetOffset = new Map<string, number>();

  // Stack ribbons inside each node ordered by the node at the other end.
  const outgoing = [...links.keys()].sort(
    (a, b) => targetOrder.get(links[a]!.target)! - targetOrder.get(links[b]!.target)! || a - b,
  );
  const incoming = [...links.keys()].sort(
    (a, b) => sourceOrder.get(links[a]!.source)! - sourceOrder.get(links[b]!.source)! || a - b,
  );
  const fromOffset = new Map<number, number>();
  const toOffset = new Map<number, number>();
  for (const index of outgoing) {
    const link = links[index]!;
    const at = sourceOffset.get(link.source) ?? 0;
    fromOffset.set(index, at);
    sourceOffset.set(link.source, at + link.value * scale);
  }
  for (const index of incoming) {
    const link = links[index]!;
    const at = targetOffset.get(link.target) ?? 0;
    toOffset.set(index, at);
    targetOffset.set(link.target, at + link.value * scale);
  }

  const laidLinks: SankeyLinkLayout[] = links.map((link, index) => {
    const from = byKey.get(`source:${link.source}`)!;
    const to = byKey.get(`target:${link.target}`)!;
    const thickness = link.value * scale;
    const x0 = from.x + from.width;
    const x1 = to.x;
    const y0 = from.y + fromOffset.get(index)! + thickness / 2;
    const y1 = to.y + toOffset.get(index)! + thickness / 2;
    const mid = (x0 + x1) / 2;
    return {
      source: link.source,
      target: link.target,
      value: link.value,
      path: `M${round(x0)},${round(y0)}C${round(mid)},${round(y0)} ${round(mid)},${round(y1)} ${round(x1)},${round(y1)}`,
      strokeWidth: round(Math.max(thickness, 1)),
      thickness: round(thickness),
    };
  });

  return { width, height, nodes, links: laidLinks, scale, empty: false };
}

/** "26.0%" style share of a total (empty when there is no total). */
export function shareText(value: number, total: number): string {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "";
}

/** A destination's amount with its share ("A$40.63m · 70.0%"), unless the model's label already carries a percentage. */
export function withShare(valueLabel: string, share: string): string {
  return share && !valueLabel.includes("%") ? `${valueLabel} · ${share}` : valueLabel;
}

/** A sentence for the chart's accessible name: what flows from where to where, with the pre-formatted amounts. */
export function sankeySummary(model: SankeyModel, subject = "Distribution"): string {
  if (model.sources.length === 0 && model.targets.length === 0) return `${subject} flow chart: nothing to show.`;
  const targetTotal = model.targets.reduce((sum, n) => sum + positive(n.value), 0);
  const from = model.sources.map((n) => `${n.label} ${n.valueLabel}`).join(", ");
  const to = model.targets
    .map((n) => {
      const share = shareText(positive(n.value), targetTotal);
      return `${n.label} ${n.valueLabel.includes("%") || !share ? n.valueLabel : `${n.valueLabel} (${share})`}`;
    })
    .join(", ");
  return `${subject} flow chart. From: ${from || "no sources"}. To: ${to || "no destinations"}.`;
}
