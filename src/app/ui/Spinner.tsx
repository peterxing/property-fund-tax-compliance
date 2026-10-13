export interface SpinnerProps {
  size?: number;
  /** Accessible name; leave out when the spinner sits next to visible text that already says what is happening. */
  label?: string;
  className?: string;
}

/** A small rotating ring (static under prefers-reduced-motion). */
export function Spinner({ size = 16, label, className }: SpinnerProps) {
  return (
    <span
      className={className ? `spinner ${className}` : "spinner"}
      style={{ width: size, height: size }}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
