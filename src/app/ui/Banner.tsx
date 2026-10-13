import type { ReactNode } from "react";
import { cls } from "./cls.ts";
import { Icon, type IconName } from "./icons.tsx";

export type BannerTone = "info" | "warn" | "error" | "success";

const TONE_ICON: Record<BannerTone, IconName> = { info: "info", warn: "alert-triangle", error: "alert-circle", success: "circle-check" };

export interface BannerProps {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons or links on the right. */
  actions?: ReactNode;
  /** Override the leading icon; null removes it. */
  icon?: IconName | null;
  /** Defaults: error -> "alert", success -> "status", otherwise none (static content). */
  role?: "alert" | "status" | "note" | "none";
  className?: string;
  id?: string;
}

export function Banner({ tone = "info", title, children, actions, icon, role, className, id }: BannerProps) {
  const effectiveRole = role ?? (tone === "error" ? "alert" : tone === "success" ? "status" : undefined);
  const iconName = icon === undefined ? TONE_ICON[tone] : icon;
  return (
    <div id={id} className={cls("banner", `banner--${tone}`, className)} role={effectiveRole === "none" ? undefined : effectiveRole}>
      {iconName ? <Icon name={iconName} size={18} className="banner__icon" /> : null}
      <div className="banner__body">
        {title ? <p className="banner__title">{title}</p> : null}
        {children ? <div className="banner__text">{children}</div> : null}
      </div>
      {actions ? <div className="banner__actions">{actions}</div> : null}
    </div>
  );
}
