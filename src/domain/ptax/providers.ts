// OWNER: Property taxes & duties agent (F2). What this feature contributes to the portfolio pages: deadlines (Compliance calendar), risks (Risk register)
// and figures to compare (Compare). Leave a function out when the feature has nothing to add.
import type { FeatureProviders } from "../providers.ts";
import type { AppData, DeadlineRow, Fund } from "../types.ts";
import { dateLabel } from "../format.ts";
import { dutiesView, futureDutyDeadlineRows, missedDutyDeadlineRows, propertyTaxView, TAX_WORKSPACE } from "./index.ts";

export const ptaxProviders: FeatureProviders = {
  id: "ptax",
  deadlines(data: AppData, fund: Fund, now: Date): DeadlineRow[] {
    const annual = propertyTaxView(data, fund.id, { now });
    const rows: DeadlineRow[] = [];
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    for (const row of annual.rows) {
      if (!row.dueDate || row.status !== "modelled") continue;
      rows.push({
        date: row.dueDate,
        fundId: fund.id,
        fundName: fund.name,
        obligation: `${fund.market === "AU" ? "Land tax" : "Property tax"} — ${row.propertyName}`,
        status: row.paid ? "done" : row.dueDate < today ? "overdue" : "open",
        workspace: TAX_WORKSPACE,
      });
    }
    for (const deadline of futureDutyDeadlineRows(data, fund, now)) {
      rows.push({ date: deadline.date, fundId: fund.id, fundName: fund.name, obligation: deadline.obligation, status: "open", workspace: TAX_WORKSPACE });
    }
    return rows;
  },
  risks(data: AppData, fund: Fund, now: Date) {
    const annual = propertyTaxView(data, fund.id, { now });
    const duties = dutiesView(data, fund.id, { now });
    return [
      ...annual.rows
        .filter((row) => row.status !== "modelled" || (row.dueDate !== null && !row.paid && row.dueDate < `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`))
        .map((row) => ({
          id: `ptax-annual-${row.propertyId}`,
          fundId: fund.id,
          severity: row.status === "missing-data" ? "exception" as const : "note" as const,
          area: fund.market === "AU" ? "Land tax" : "Property tax",
          title: row.status === "modelled" ? `${row.propertyName}: payment overdue` : `${row.propertyName}: ${row.status === "missing-data" ? "missing tax profile data" : "state not modelled"}`,
          detail: row.status === "modelled" ? `${row.dueLabel}; no payment recorded.` : row.basis,
          workspace: TAX_WORKSPACE,
        })),
      ...duties.rows
        .filter((row) => row.status !== "modelled")
        .map((row) => ({ id: `ptax-duty-${row.propertyId}`, fundId: fund.id, severity: row.status === "missing-data" ? "exception" as const : "note" as const, area: "Duties", title: `${row.propertyName}: duty not calculated`, detail: row.basis, workspace: TAX_WORKSPACE })),
      ...missedDutyDeadlineRows(data, fund, now).map((row) => ({ id: `ptax-duty-deadline-${row.property.id}`, fundId: fund.id, severity: "note" as const, area: "Duties", title: `${row.property.name}: stamp duty deadline has passed`, detail: `The stamping deadline was ${dateLabel(row.dueDate)}. Confirm duty was paid and the evidence is filed.`, workspace: TAX_WORKSPACE })),
    ];
  },
  compareSources(data: AppData, fund: Fund, now: Date) {
    const annual = propertyTaxView(data, fund.id, { now });
    const duties = dutiesView(data, fund.id, { now });
    return [
      {
        id: "ptax-annual",
        label: fund.market === "AU" ? "Land tax by property" : "Property tax by property",
        description: "Annual property tax amounts from the property tax workspace.",
        tolerance: 100,
        lines: annual.rows.filter((row) => row.status === "modelled").map((row) => ({ ref: `ptax.annual.${row.propertyId}`, label: row.propertyName, amount: row.total, section: annual.title, note: row.basisTitle })),
      },
      {
        id: "ptax-duties",
        label: "Acquisition duties by property",
        description: "Transfer duty / BSD / ABSD from the property tax workspace.",
        tolerance: 100,
        lines: duties.rows.filter((row) => row.status === "modelled").map((row) => ({ ref: `ptax.duty.${row.propertyId}`, label: row.propertyName, amount: row.totalDuty, section: "Duties on acquisition", note: row.basisTitle })),
      },
    ];
  },
};
