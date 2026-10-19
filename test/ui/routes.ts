// The workspaces as the shell shows them. shell.test.tsx checks this table against the router's, so adding a workspace without
// extending the sweeps fails a test.
export interface RouteFixture {
  /** The path in the hash: "#/trial-balance". */
  hash: string;
  path: string;
  /** Nav label. */
  label: string;
  /** Fund workspaces sit beside the fund rail; portfolio workspaces use the whole width. */
  scope: "fund" | "portfolio";
}

export const ROUTES: readonly RouteFixture[] = [
  { hash: "#/", path: "/", label: "Distributions", scope: "fund" },
  { hash: "#/trial-balance", path: "/trial-balance", label: "Trial balance", scope: "fund" },
  { hash: "#/tax-returns", path: "/tax-returns", label: "Tax returns", scope: "fund" },
  { hash: "#/investor-reporting", path: "/investor-reporting", label: "Investor reporting", scope: "fund" },
  { hash: "#/cost-base", path: "/cost-base", label: "Cost base & CGT", scope: "fund" },
  { hash: "#/gst", path: "/gst", label: "GST & BAS", scope: "fund" },
  { hash: "#/property-taxes", path: "/property-taxes", label: "Property taxes", scope: "fund" },
  { hash: "#/assets", path: "/assets", label: "Assets & allowances", scope: "fund" },
  { hash: "#/compare", path: "/compare", label: "Compare", scope: "fund" },
  { hash: "#/due-diligence", path: "/due-diligence", label: "Due diligence", scope: "fund" },
  { hash: "#/bulk-review", path: "/bulk-review", label: "Bulk review", scope: "portfolio" },
  { hash: "#/analytics", path: "/analytics", label: "Analytics", scope: "portfolio" },
  { hash: "#/calendar", path: "/calendar", label: "Compliance calendar", scope: "portfolio" },
  { hash: "#/risks", path: "/risks", label: "Risk register", scope: "portfolio" },
  { hash: "#/calculators", path: "/calculators", label: "Calculators", scope: "portfolio" },
  { hash: "#/rules", path: "/rules", label: "Rules & sources", scope: "portfolio" },
  { hash: "#/data", path: "/data", label: "Data", scope: "portfolio" },
  { hash: "#/access", path: "/access", label: "Access", scope: "portfolio" },
];
