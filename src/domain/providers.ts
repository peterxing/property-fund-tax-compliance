// Feature contributions to the portfolio pages. Each feature module (src/domain/<feature>/providers.ts) exports one FeatureProviders
// object; the Compliance calendar, the Risk register and Compare read them all from FEATURE_PROVIDERS, so a feature adds its deadlines,
// risks and comparable figures without editing those pages. All functions are pure and must never throw for valid data.
import type { AppData, Cents, DeadlineRow, Fund, FundId } from "./types.ts";
import { assetsProviders } from "./assets/providers.ts";
import { governanceProviders } from "./governance/providers.ts";
import { gstProviders } from "./gst/providers.ts";
import { ptaxProviders } from "./ptax/providers.ts";
import { obligationsProviders } from "./entities/obligations.ts";

/** One line of the Risk register. `workspace` is the app route path where it is resolved ("/gst"); the UI adds ?fund=. */
export interface RiskItem {
  id: string;
  fundId: FundId;
  severity: "exception" | "note";
  /** Short area label shown as a tag: "Distribution", "GST", "Land tax" ... */
  area: string;
  title: string;
  detail: string;
  workspace: string;
}

/** One figure a user can compare with their own system's output. `ref` is a stable key ("AU_BAS.1A", "component.cleanBuilding"). */
export interface CompareLine {
  ref: string;
  label: string;
  amount: Cents;
  /** Optional group heading ("Withholding by holder"). */
  section?: string;
  /** Where the figure comes from, shown next to a difference ("TAA 1953 Sch 1 s12-385; fund calculation"). */
  note?: string;
}

/** A statement of figures for one fund (distribution components, BAS labels, book-to-tax ...). */
export interface CompareSource {
  id: string;
  label: string;
  description?: string;
  lines: CompareLine[];
  /** Default tolerance in cents (100 = A$1 / S$1). */
  tolerance?: Cents;
}

export interface FeatureProviders {
  id: string;
  deadlines?(data: AppData, fund: Fund, now: Date): DeadlineRow[];
  risks?(data: AppData, fund: Fund, now: Date): RiskItem[];
  compareSources?(data: AppData, fund: Fund, now: Date): CompareSource[];
}

export const FEATURE_PROVIDERS: readonly FeatureProviders[] = [gstProviders, ptaxProviders, assetsProviders, governanceProviders, obligationsProviders];
