import { Icon, cls, type IconName } from "../../ui/index.ts";
import "./trial-balance.css";

export type PillTone = "good" | "warn" | "bad";

const PILL_ICON: Record<PillTone, IconName> = { good: "circle-check", warn: "alert-triangle", bad: "alert-circle" };

/** A status the page reports: an icon and words as well as a colour, so it never rests on colour alone. */
export function StatusPill({ tone, children, className }: { tone: PillTone; children: string; className?: string }) {
  return (
    <span className={cls("tag", `tag--${tone}`, "tb-chip", className)}>
      <Icon name={PILL_ICON[tone]} size={14} />
      {children}
    </span>
  );
}
