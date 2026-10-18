import type { ReactNode } from "react";

export type IconName =
  | "distributions"
  | "table"
  | "landmark"
  | "file-text"
  | "scale"
  | "receipt"
  | "building"
  | "layers"
  | "columns"
  | "calendar"
  | "flag"
  | "calculator"
  | "book"
  | "database"
  | "list-checks"
  | "bar-chart"
  | "users"
  | "lock"
  | "check"
  | "circle"
  | "circle-check"
  | "x"
  | "chevron-down"
  | "chevron-right"
  | "info"
  | "alert-triangle"
  | "alert-circle"
  | "download"
  | "upload"
  | "undo"
  | "shield-check"
  | "send"
  | "reopen"
  | "plus"
  | "minus"
  | "home";

// 16px line icons on a 16 x 16 grid; stroke and size come from the wrapper so they follow currentColor and the surrounding text.
const GLYPHS: Record<IconName, ReactNode> = {
  distributions: (
    <>
      <path d="M2 4h3c3 0 3 8 6 8h3" />
      <path d="M2 12h3c3 0 3-8 6-8h3" />
    </>
  ),
  table: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M2 10h12M6.5 6.5v7" />
    </>
  ),
  landmark: (
    <>
      <path d="M2 6 8 2.5 14 6z" />
      <path d="M3.5 7.5v4M6.5 7.5v4M9.5 7.5v4M12.5 7.5v4M2 13.5h12" />
    </>
  ),
  "file-text": (
    <>
      <path d="M4 1.5h5l3.5 3.5v9.5H4z" />
      <path d="M9 1.5V5h3.5M6 8.5h4M6 11.2h4" />
    </>
  ),
  scale: (
    <>
      <path d="M8 2.5v11M5 13.5h6M3 4.5h10" />
      <path d="M3 5 1.5 9.5h3zM13 5l-1.5 4.5h3z" />
    </>
  ),
  receipt: (
    <>
      <path d="M4 2h8v12l-2-1.2L8 14l-2-1.2L4 14z" />
      <path d="M6.2 5.5h3.6M6.2 8h3.6M6.2 10.5h2" />
    </>
  ),
  building: (
    <>
      <path d="M3 14V3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5V14" />
      <path d="M2 14h12M6 14v-3h4v3M5.5 5h.01M8 5h.01M10.5 5h.01M5.5 7.5h.01M8 7.5h.01M10.5 7.5h.01" />
    </>
  ),
  layers: (
    <>
      <path d="M8 2.5 14 5.6 8 8.7 2 5.6z" />
      <path d="M3.8 8 2 8.9 8 12l6-3.1-1.8-.9" />
      <path d="M3.8 11.1 2 12 8 15l6-3-1.8-.9" />
    </>
  ),
  columns: (
    <>
      <rect x="2" y="3" width="4.5" height="10" rx="1" />
      <rect x="9.5" y="3" width="4.5" height="10" rx="1" />
      <path d="M7 6h2M9 6 8 5 7 6l1 1M9 10H7M7 10l1-1 1 1-1 1" />
    </>
  ),
  calendar: (
    <>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M5 2v3M11 2v3M2.5 6.5h11M5.5 9h.01M8 9h.01M10.5 9h.01M5.5 11.5h.01M8 11.5h.01" />
    </>
  ),
  flag: (
    <>
      <path d="M4 14V2.5" />
      <path d="M4 3h8l-1.2 2L12 7H4" />
      <path d="M4 7h6" />
    </>
  ),
  calculator: (
    <>
      <rect x="3" y="2" width="10" height="12" rx="1.5" />
      <path d="M5.5 4.5h5M5.5 7.5h.01M8 7.5h.01M10.5 7.5h.01M5.5 10h.01M8 10h.01M10.5 10h.01M5.5 12.5h.01M8 12.5h.01M10.5 12.5h.01" />
    </>
  ),
  book: (
    <>
      <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2H13v11.5H4.5A1.5 1.5 0 0 0 3 15z" />
      <path d="M3 3.5v10A1.5 1.5 0 0 1 4.5 12H13M6 5h4.5M6 7.5h3" />
    </>
  ),
  database: (
    <>
      <ellipse cx="8" cy="3.5" rx="5" ry="2" />
      <path d="M3 3.5v4c0 1.1 2.2 2 5 2s5-.9 5-2v-4" />
      <path d="M3 7.5v4c0 1.1 2.2 2 5 2s5-.9 5-2v-4" />
    </>
  ),
  "list-checks": (
    <>
      <path d="M2 4.2l1 1 2-2M2 8.2l1 1 2-2M2 12.2l1 1 2-2" />
      <path d="M7.5 4.5H14M7.5 8.5H14M7.5 12.5H14" />
    </>
  ),
  "bar-chart": (
    <>
      <path d="M2.5 2v11.5H14" />
      <path d="M5.5 11V8M8.5 11V5M11.5 11V7" />
    </>
  ),
  users: (
    <>
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
      <path d="M10.6 3.3a2.5 2.5 0 0 1 0 4.4M12 9.8c1.5.4 2.5 1.7 2.5 3.7" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </>
  ),
  check: <path d="M3 8.5 6.5 12 13 4.5" />,
  circle: <circle cx="8" cy="8" r="6" />,
  "circle-check": (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M5.2 8.2 7.2 10.2 10.8 6" />
    </>
  ),
  x: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />,
  "chevron-down": <path d="M4 6l4 4 4-4" />,
  "chevron-right": <path d="M6 4l4 4-4 4" />,
  info: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.4v3.8M8 4.9h.01" />
    </>
  ),
  "alert-triangle": (
    <>
      <path d="M8 2 14.5 13.5h-13z" />
      <path d="M8 6.5v3.2M8 11.7h.01" />
    </>
  ),
  "alert-circle": (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.9v3.9M8 11h.01" />
    </>
  ),
  download: <path d="M8 2v8.5M4.5 7.5 8 11l3.5-3.5M2.5 13.5h11" />,
  upload: <path d="M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 13.5h11" />,
  undo: <path d="M5.5 3.5l-3 3 3 3M2.5 6.5h7a3.5 3.5 0 0 1 0 7H6" />,
  "shield-check": (
    <>
      <path d="M8 1.8l5 1.8v4.2c0 3-2.2 5.2-5 6.4-2.8-1.2-5-3.4-5-6.4V3.6z" />
      <path d="M5.8 8l1.6 1.6 3-3.2" />
    </>
  ),
  send: <path d="M14 2 7 9M14 2l-4.5 12L7 9 2 6.5z" />,
  reopen: <path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1M2.5 2.5v3.2h3.2" />,
  plus: <path d="M8 3v10M3 8h10" />,
  minus: <path d="M3 8h10" />,
  home: <path d="M2.5 7.5 8 2.5l5.5 5M4 6.8V13.5h8V6.8" />,
};

export const ICON_NAMES = Object.keys(GLYPHS) as IconName[];

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

/** Decorative 16px line icon (aria-hidden); pair it with visible text or an aria-label on the control. */
export function Icon({ name, size = 16, className }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  );
}
