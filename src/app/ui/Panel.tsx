import { useId, type ComponentProps, type ElementType, type ReactNode } from "react";
import { cls } from "./cls.ts";

export interface PanelProps extends Omit<ComponentProps<"section">, "title"> {
  /** Uppercase caption in the header strip. Without a title (and actions) the header is omitted. */
  title?: ReactNode;
  /** Heading level of the title (default 3: the fund / page title above is an h2). */
  level?: 2 | 3 | 4 | 5 | 6;
  /** Right-hand side of the header strip: buttons, a lock note, a select. */
  actions?: ReactNode;
  /** Pads the body (default). Pass false for tables and charts that run edge to edge. */
  padded?: boolean;
  bodyClassName?: string;
}

/** The white bordered card with a header strip used for every block of a workspace. A titled panel is a labelled region. */
export function Panel({ title, level = 3, actions, padded = true, bodyClassName, className, children, ...rest }: PanelProps) {
  const id = useId();
  const Heading = `h${level}` as ElementType;
  const hasHeader = Boolean(title) || Boolean(actions);
  return (
    <section className={cls("panel", className)} aria-labelledby={title ? `${id}-title` : undefined} {...rest}>
      {hasHeader ? (
        <header className="panel__header">
          {title ? (
            <Heading id={`${id}-title`} className="panel__title">
              {title}
            </Heading>
          ) : (
            <span />
          )}
          {actions ? <div className="panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cls("panel__body", !padded && "panel__body--flush", bodyClassName)}>{children}</div>
    </section>
  );
}
