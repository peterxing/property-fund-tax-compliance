// OWNER: Assets & allowances agent (F3). Asset contributions to Risks and Compare.
import { money } from "../format.ts";
import type { FeatureProviders, RiskItem } from "../providers.ts";
import type { AppData, Fund } from "../types.ts";
import { assetRegisterView } from "./index.ts";

export const assetsProviders: FeatureProviders = {
  id: "assets",
  risks(data: AppData, fund: Fund): RiskItem[] {
    const view = assetRegisterView(data, fund.id);
    const risks: RiskItem[] = [];
    for (const row of view.comparisons) {
      if (row.difference !== 0) {
        risks.push({
          id: `assets-${fund.id}-${row.key}`,
          fundId: fund.id,
          severity: "exception",
          area: "Assets",
          title: `${row.label} differs from the trial balance`,
          detail: `The register differs from the trial balance adjustment by ${money(Math.abs(row.difference), fund.currency, 2)}.`,
          workspace: "/assets",
        });
      }
    }
    view.warnings.forEach((warning, i) => {
      risks.push({ id: `assets-${fund.id}-warning-${i}`, fundId: fund.id, severity: "exception", area: "Assets", title: "Asset register input needs review", detail: warning, workspace: "/assets" });
    });
    return risks;
  },
  compareSources(data: AppData, fund: Fund) {
    const view = assetRegisterView(data, fund.id);
    return [
      {
        id: "assets",
        label: "Asset register",
        description: "Current-year deductions from the fixed asset register.",
        tolerance: 0,
        lines: [
          ...view.rows.map((row) => ({ ref: `asset.${row.id}`, label: row.description, amount: row.deduction, section: row.kindLabel, note: row.basis })),
          ...view.totals.map((row) => ({ ref: `asset.total.${row.kind}`, label: `${row.label} total`, amount: row.deduction, section: "Totals", note: "Engine-backed asset register total" })),
        ],
      },
    ];
  },
};
