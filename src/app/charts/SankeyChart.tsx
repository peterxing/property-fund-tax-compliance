import { useMemo, type CSSProperties } from "react";
import type { SankeyModel } from "../../domain/types.ts";
import { cls } from "../ui/cls.ts";
import { LABEL_GAP, LABEL_LINE_EM, LABEL_TYPE, VALUE_GAP, planSankeyLabels, type LabelBlock } from "./sankeyLabels.ts";
import { layoutSankey, sankeySummary, type SankeyNodeLayout } from "./sankeyLayout.ts";
import { useElementWidth } from "./useElementWidth.ts";

export interface SankeyChartProps {
  model: SankeyModel;
  /** The chart's accessible name; by default a sentence listing every source and destination with its amount. */
  summary?: string;
  /** What is being charted, for the generated summary ("Distribution"). */
  subject?: string;
  /** Shown instead of the chart when there is nothing to draw. */
  emptyMessage?: string;
  /** Fixed chart height in px; by default it grows with the number of nodes and with the lines the labels need. */
  height?: number;
  /** Fixed chart width in px, for drawing without a browser to measure in (tests, exports); by default the chart fills its container. */
  width?: number;
  className?: string;
}

function kindOf(model: SankeyModel, key: string): string {
  return model.targetKinds[key] ?? "gross";
}

const em = (n: number): string => `${Number(n.toFixed(3))}em`;

function NodeLabel({ node, block }: { node: SankeyNodeLayout; block: LabelBlock }) {
  const source = node.side === "source";
  const x = source ? node.x - LABEL_GAP : node.x + node.width + LABEL_GAP;
  if (block.inline) {
    return (
      <text x={x} y={node.labelY} dy="0.35em" textAnchor="end" className="sankey__label">
        <tspan className="sankey__label-name">{block.name[0]}</tspan>
        <tspan className="sankey__label-value" dx={VALUE_GAP}>
          {block.value}
        </tspan>
      </text>
    );
  }
  // The name's lines and the amount are centred on the node as one block.
  const first = -0.35 - (block.name.length - 1) * (LABEL_LINE_EM / 2);
  return (
    <text x={x} y={node.labelY} textAnchor={source ? "end" : "start"} className="sankey__label">
      {block.truncated ? <title>{`${node.label}: ${node.valueLabel}`}</title> : null}
      {block.name.map((line, i) => (
        <tspan key={i} x={x} dy={em(i === 0 ? first : LABEL_LINE_EM)} className="sankey__label-name">
          {line}
        </tspan>
      ))}
      <tspan x={x} dy={em(LABEL_LINE_EM)} className="sankey__label-value">
        {block.value}
      </tspan>
    </text>
  );
}

/**
 * Where a distribution goes: components on the left, destinations on the right, ribbons between them sized by amount. The labels are
 * planned from the width of their text (`planSankeyLabels`) so none is clipped however narrow the chart is, and the layout is computed by
 * `layoutSankey`; this component measures its width, draws the result and describes it for assistive technology (the workspace shows the
 * same numbers in a table).
 */
export function SankeyChart({
  model,
  summary,
  subject,
  emptyMessage = "Nothing to chart: there is no distribution to show.",
  height,
  width: fixedWidth,
  className,
}: SankeyChartProps) {
  const [ref, measured] = useElementWidth<HTMLDivElement>(860);
  const width = fixedWidth ?? measured;
  const plan = useMemo(() => planSankeyLabels(model, width), [model, width]);
  const nodeCount = Math.max(model.sources.length, model.targets.length);
  const naturalHeight = plan.stacked ? Math.max(300, nodeCount * 50 + 24) : Math.max(260, nodeCount * 44 + 24);
  const chartHeight = height ?? Math.max(naturalHeight, Math.ceil(plan.minHeight));
  const layout = useMemo(
    () =>
      layoutSankey(
        model,
        { width, height: chartHeight },
        {
          labelLeft: plan.labelLeft,
          labelRight: plan.labelRight,
          sourcePadding: plan.sourcePadding,
          targetPadding: plan.targetPadding,
          sourceLabelHeights: plan.sources.map((b) => b.height),
          targetLabelHeights: plan.targets.map((b) => b.height),
        },
      ),
    [model, width, chartHeight, plan],
  );
  const name = summary ?? sankeySummary(model, subject);
  // layoutSankey lists the sources then the targets, each in the order of the model, like the plan.
  const blocks = [...plan.sources, ...plan.targets];
  const style = plan.fontSize === LABEL_TYPE.size ? undefined : ({ "--sankey-label-size": `${plan.fontSize}px` } as CSSProperties);

  return (
    <div ref={ref} className={cls("sankey", className)}>
      {layout.empty ? (
        <p className="sankey__empty">{emptyMessage}</p>
      ) : (
        <svg
          className="sankey__svg"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          role="img"
          aria-label={name}
          style={style}
        >
          <title>{name}</title>
          <g fill="none">
            {layout.links.map((link) => (
              <path
                key={`${link.source}>${link.target}`}
                d={link.path}
                strokeWidth={link.strokeWidth}
                className={`sankey__link sankey__link--${kindOf(model, link.target)}`}
              />
            ))}
          </g>
          <g>
            {layout.nodes.map((node) => (
              <rect
                key={`${node.side}:${node.key}`}
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx={2}
                className={cls("sankey__node", node.side === "source" ? "sankey__node--source" : `sankey__node--${kindOf(model, node.key)}`)}
              />
            ))}
          </g>
          <g>
            {layout.nodes.map((node, i) => (blocks[i] ? <NodeLabel key={`${node.side}:${node.key}`} node={node} block={blocks[i]} /> : null))}
          </g>
        </svg>
      )}
    </div>
  );
}
