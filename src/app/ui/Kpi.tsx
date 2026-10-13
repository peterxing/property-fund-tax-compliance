import type { ReactNode } from "react";
import { cls } from "./cls.ts";

export interface KpiProps {
  label: ReactNode;
  value: ReactNode;
  /** Supporting line under the value ("2.7% of the distribution"). */
  sub?: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
  className?: string;
}

export function Kpi({ label, value, sub, tone = "default", className }: KpiProps) {
  return (
    <div className={cls("kpi", tone !== "default" && `kpi--${tone}`, className)}>
      <dt className="kpi__label">{label}</dt>
      <dd className="kpi__value">{value}</dd>
      {sub ? <dd className="kpi__sub">{sub}</dd> : null}
    </div>
  );
}

export interface KpiStripProps {
  children: ReactNode;
  /** Names the group for assistive tech ("Distribution summary"). */
  label?: string;
  className?: string;
}

/** A row of key figures, a description list so each label is tied to its value. */
export function KpiStrip({ children, label, className }: KpiStripProps) {
  return (
    <dl className={cls("kpis", className)} aria-label={label}>
      {children}
    </dl>
  );
}
