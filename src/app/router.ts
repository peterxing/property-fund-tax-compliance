// Hash router. The pure helpers (parseHash, buildHash, routeForFund, resolveFundId, ...) have no DOM access so Node tests can import
// this file; the hooks at the bottom (useRoute, navigate, ...) touch window only when called in a browser.
import { useCallback, useMemo, useSyncExternalStore } from "react";

export type AppPath =
  | "/"
  | "/trial-balance"
  | "/tax-returns"
  | "/investor-reporting"
  | "/cost-base"
  | "/gst"
  | "/property-taxes"
  | "/assets"
  | "/compare"
  | "/bulk-review"
  | "/analytics"
  | "/calendar"
  | "/risks"
  | "/calculators"
  | "/rules"
  | "/data"
  | "/access";
export type RoutePath = AppPath | "/_gallery";
export type WorkspaceId =
  | "distributions"
  | "trial-balance"
  | "tax-returns"
  | "investor-reporting"
  | "cost-base"
  | "gst"
  | "property-taxes"
  | "assets"
  | "compare"
  | "bulk-review"
  | "analytics"
  | "calendar"
  | "risks"
  | "calculators"
  | "rules"
  | "data"
  | "access";

export interface RouteDef {
  path: AppPath;
  id: WorkspaceId;
  label: string;
  /** "fund" workspaces show the fund rail and header; "portfolio" workspaces span all funds. */
  scope: "fund" | "portfolio";
}

export const ROUTES: readonly RouteDef[] = [
  { path: "/", id: "distributions", label: "Distributions", scope: "fund" },
  { path: "/trial-balance", id: "trial-balance", label: "Trial balance", scope: "fund" },
  { path: "/tax-returns", id: "tax-returns", label: "Tax returns", scope: "fund" },
  { path: "/investor-reporting", id: "investor-reporting", label: "Investor reporting", scope: "fund" },
  { path: "/cost-base", id: "cost-base", label: "Cost base & CGT", scope: "fund" },
  { path: "/gst", id: "gst", label: "GST & BAS", scope: "fund" },
  { path: "/property-taxes", id: "property-taxes", label: "Property taxes", scope: "fund" },
  { path: "/assets", id: "assets", label: "Assets & allowances", scope: "fund" },
  { path: "/compare", id: "compare", label: "Compare", scope: "fund" },
  { path: "/bulk-review", id: "bulk-review", label: "Bulk review", scope: "portfolio" },
  { path: "/analytics", id: "analytics", label: "Analytics", scope: "portfolio" },
  { path: "/calendar", id: "calendar", label: "Compliance calendar", scope: "portfolio" },
  { path: "/risks", id: "risks", label: "Risk register", scope: "portfolio" },
  { path: "/calculators", id: "calculators", label: "Calculators", scope: "portfolio" },
  { path: "/rules", id: "rules", label: "Rules & sources", scope: "portfolio" },
  { path: "/data", id: "data", label: "Data", scope: "portfolio" },
  { path: "/access", id: "access", label: "Access", scope: "portfolio" },
];

export const GALLERY_PATH = "/_gallery" as const;
export const DEFAULT_PATH: AppPath = "/";

/** Query params that only make sense for the fund they were set on; they are dropped when another fund is chosen. */
export const FUND_SCOPED_PARAMS: readonly string[] = ["holder", "notice"];

export interface Route {
  path: RoutePath;
  params: Record<string, string>;
}

export interface ParseOptions {
  /** Accept "#/_gallery" (dev builds only). */
  gallery?: boolean;
}

export function routeDef(path: string): RouteDef | undefined {
  return ROUTES.find((r) => r.path === path);
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function normalisePath(raw: string, options: ParseOptions): RoutePath {
  const cleaned = safeDecode(raw).trim().toLowerCase().replace(/\/{2,}/g, "/");
  const withSlash = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  const path = withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
  if (path === GALLERY_PATH) return options.gallery ? GALLERY_PATH : DEFAULT_PATH;
  return routeDef(path) ? (path as AppPath) : DEFAULT_PATH;
}

/** "#/trial-balance?fund=southbank&tab=checks" -> { path: "/trial-balance", params: { fund, tab } }. Never throws; unknown paths fall back to "/". */
export function parseHash(hash: string, options: ParseOptions = {}): Route {
  const body = (hash ?? "").replace(/^#/, "");
  const q = body.indexOf("?");
  const rawPath = q === -1 ? body : body.slice(0, q);
  const rawQuery = q === -1 ? "" : body.slice(q + 1);
  const params: Record<string, string> = {};
  if (rawQuery) {
    for (const [key, value] of new URLSearchParams(rawQuery)) {
      if (key && value && !(key in params)) params[key] = value;
    }
  }
  return { path: normalisePath(rawPath, options), params };
}

const PRIORITY_PARAMS = ["fund", "tab"];

function sortedKeys(params: Record<string, string>): string[] {
  const keys = Object.keys(params).filter((k) => params[k] !== undefined && params[k] !== "");
  const first = PRIORITY_PARAMS.filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !PRIORITY_PARAMS.includes(k)).sort();
  return [...first, ...rest];
}

/** The canonical hash for a route: "#/path" plus "?fund=..&tab=.." (fund, tab, then the rest alphabetically; empty values are omitted). */
export function buildHash(route: { path: string; params?: Record<string, string | null | undefined> }): string {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(route.params ?? {})) {
    if (value !== null && value !== undefined && value !== "") clean[key] = value;
  }
  const query = sortedKeys(clean)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(clean[k]!)}`)
    .join("&");
  const path = route.path.startsWith("/") ? route.path : `/${route.path}`;
  return `#${path}${query ? `?${query}` : ""}`;
}

/** The route to link to when `fundId` is chosen from the rail: same workspace and tab, fund-scoped params cleared. */
export function routeForFund(route: Route, fundId: string): Route {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(route.params)) {
    if (!FUND_SCOPED_PARAMS.includes(key)) params[key] = value;
  }
  params.fund = fundId;
  return { path: route.path, params };
}

/** A route with `patch` merged into its params; null / undefined / "" removes a param. */
export function withParams(route: Route, patch: Record<string, string | null | undefined>): Route {
  const params: Record<string, string> = { ...route.params };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") delete params[key];
    else params[key] = value;
  }
  return { path: route.path, params };
}

/**
 * Which fund the workspace shows. The hash wins when the persona can see that fund; a hash without a fund falls back to the store's
 * selection, then to the first visible fund; a hash fund the persona cannot see falls back to the first visible fund.
 */
export function resolveFundId(
  hashFund: string | null | undefined,
  storeFundId: string | null | undefined,
  visibleIds: readonly string[],
): string | null {
  if (visibleIds.length === 0) return null;
  if (hashFund) {
    const hit = visibleIds.find((id) => id === hashFund) ?? visibleIds.find((id) => id.toLowerCase() === hashFund.toLowerCase());
    return hit ?? visibleIds[0] ?? null;
  }
  if (storeFundId && visibleIds.includes(storeFundId)) return storeFundId;
  return visibleIds[0] ?? null;
}

export function sameRoute(a: Route, b: Route): boolean {
  return buildHash(a) === buildHash(b);
}

/** Label for the document title and the nav: the workspace name, or the gallery's. */
export function routeLabel(path: RoutePath): string {
  return path === GALLERY_PATH ? "Design gallery" : (routeDef(path)?.label ?? "Distributions");
}

// ------------------------------------------------------------------------------------------------ browser bindings
const listeners = new Set<() => void>();
let bound = false;

function notifyAll(): void {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!bound && typeof window !== "undefined") {
    bound = true;
    window.addEventListener("hashchange", notifyAll);
    window.addEventListener("popstate", notifyAll);
  }
  return () => {
    listeners.delete(listener);
  };
}

function currentHash(): string {
  return typeof window === "undefined" ? "" : window.location.hash;
}

function galleryEnabled(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

export function currentRoute(): Route {
  return parseHash(currentHash(), { gallery: galleryEnabled() });
}

export interface NavigateOptions {
  /** Replace the current history entry instead of adding one (default false). */
  replace?: boolean;
}

/** Go to a route, a path ("/analytics") or a hash ("#/analytics?fund=x"). Re-selecting the current location adds no history entry. */
export function navigate(to: string | Route, options: NavigateOptions = {}): void {
  if (typeof window === "undefined") return;
  const route = typeof to === "string" ? parseHash(to.startsWith("#") ? to : `#${to}`, { gallery: galleryEnabled() }) : to;
  const hash = buildHash(route);
  if (hash === window.location.hash) return;
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  if (options.replace) window.history.replaceState(window.history.state, "", url);
  else window.history.pushState(null, "", url);
  notifyAll();
}

/** The current route; re-renders on hash changes, back/forward and navigate(). */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, currentHash, () => "");
  return useMemo(() => parseHash(hash, { gallery: galleryEnabled() }), [hash]);
}

/** One query param of the current route ("" when absent). */
export function useRouteParam(key: string): string {
  return useRoute().params[key] ?? "";
}

/**
 * Update query params of the current route (null / "" removes one). In-page state such as the active tab replaces the history
 * entry by default so Back leaves the workspace instead of stepping through every tab; pass { replace: false } to add an entry.
 */
export function useSetRouteParams(): (patch: Record<string, string | null | undefined>, options?: NavigateOptions) => void {
  return useCallback((patch, options) => {
    navigate(withParams(currentRoute(), patch), { replace: options?.replace ?? true });
  }, []);
}
