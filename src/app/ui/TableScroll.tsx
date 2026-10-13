import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cls } from "./cls.ts";

export interface TableScrollProps {
  /** Names the scrollable region, e.g. "Trial balance lines". */
  label: string;
  className?: string;
  children: ReactNode;
}

/**
 * Wraps a wide table so it scrolls sideways inside its own box instead of widening the page. Only when it really overflows does it become a
 * labelled, keyboard-focusable region (so arrow keys can scroll it); otherwise it is a plain wrapper with no extra tab stop.
 */
export function TableScroll({ label, className, children }: TableScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  const measure = (): void => {
    const el = ref.current;
    if (el) setOverflowing(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
  };

  // After every render (the table's content may have changed) and whenever the box is resized.
  useLayoutEffect(measure);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cls("table-scroll", className)}
      {...(overflowing ? { role: "region", "aria-label": label, tabIndex: 0 } : {})}
    >
      {children}
    </div>
  );
}