import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { cls } from "./cls.ts";
import { Spinner } from "./Spinner.tsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/** Class names for a button look; use on links: <a className={buttonClass({ variant: "secondary" })} href=...>. */
export function buttonClass({ variant = "secondary", size = "md", className }: ButtonClassOptions = {}): string {
  return cls("btn", `btn--${variant}`, size === "sm" && "btn--sm", className);
}

export interface ButtonProps extends Omit<ComponentProps<"button">, "disabled"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and ignores clicks; the label stays. */
  loading?: boolean;
  /**
   * Rendered as aria-disabled so the button stays focusable and its reason can be read (point aria-describedby at the visible reason).
   * Clicks do nothing while disabled.
   */
  disabled?: boolean;
  icon?: ReactNode;
  iconAfter?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  iconAfter,
  className,
  children,
  onClick,
  type = "button",
  ...rest
}: ButtonProps) {
  const blocked = disabled || loading;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (blocked) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      {...rest}
      type={type}
      className={buttonClass({ variant, size, className })}
      aria-disabled={blocked || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
    >
      {loading ? <Spinner size={14} /> : icon}
      {children === undefined || children === null ? null : <span className="btn__label">{children}</span>}
      {iconAfter}
    </button>
  );
}
