import type { Market, WorkflowStatus } from "../../domain/types.ts";
import { exceptionLabel, marketName, statusKey } from "../labels.ts";
import { cls } from "./cls.ts";
import { Icon } from "./icons.tsx";

export interface MarketBadgeProps {
  market: Market;
  className?: string;
}

/** "AU" / "SG" square badge. The country name is read by assistive tech; the code is what is drawn. */
export function MarketBadge({ market, className }: MarketBadgeProps) {
  return (
    <span className={cls("chip", "chip--market", market === "AU" ? "chip--au" : "chip--sg", className)}>
      <span className="sr-only">{marketName(market)} </span>
      <span aria-hidden="true">{market}</span>
    </span>
  );
}

export interface StatusChipProps {
  status: WorkflowStatus;
  /** Prefixes "Workflow status:" for assistive tech (use where the chip stands alone, like the fund header). */
  labelled?: boolean;
  className?: string;
}

/** Preparing (outlined), In review (amber), Signed off (purple with a lock): colour is never the only signal, the text is always there. */
export function StatusChip({ status, labelled = false, className }: StatusChipProps) {
  const key = statusKey(status);
  return (
    <span className={cls("chip", "chip--status", `chip--${key}`, className)}>
      {labelled ? <span className="sr-only">Workflow status: </span> : null}
      {key === "signed" ? <Icon name="lock" size={12} /> : null}
      {status}
    </span>
  );
}

export interface ExceptionChipProps {
  count: number;
  /** Shown instead of a chip when there are none. */
  emptyText?: string;
  className?: string;
}

/** Red "2 exceptions" chip; with none, quiet muted text ("No exceptions"). */
export function ExceptionChip({ count, emptyText = "No exceptions", className }: ExceptionChipProps) {
  if (count <= 0) return <span className={cls("chip-none", className)}>{emptyText}</span>;
  return <span className={cls("chip", "chip--danger", className)}>{exceptionLabel(count)}</span>;
}

export interface TagProps {
  children: string;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
  className?: string;
}

/** Small neutral or toned label for table cells and headers ("Balanced", "Overdue", "Done"). Text always carries the meaning. */
export function Tag({ children, tone = "neutral", className }: TagProps) {
  return <span className={cls("tag", `tag--${tone}`, className)}>{children}</span>;
}

/** The generic chip; Tag is the same component. */
export const Badge = Tag;
export type BadgeProps = TagProps;
