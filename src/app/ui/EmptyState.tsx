import type { ElementType, ReactNode } from "react";
import { cls } from "./cls.ts";
import { Icon, type IconName } from "./icons.tsx";

export interface EmptyStateProps {
  title: ReactNode;
  children?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  /** Render the title as a heading of this level (omit for a plain paragraph). */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}

/** A calm "nothing here" block with a short explanation and an optional action. */
export function EmptyState({ title, children, icon = "info", action, headingLevel, className }: EmptyStateProps) {
  const Title: ElementType = headingLevel ? `h${headingLevel}` : "p";
  return (
    <div className={cls("empty", className)}>
      <Icon name={icon} size={22} className="empty__icon" />
      <Title className="empty__title">{title}</Title>
      {children ? <div className="empty__text">{children}</div> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}
