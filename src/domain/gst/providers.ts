// OWNER: GST & BAS agent (F1). Feature contributions to calendar, risk register and compare.
import type { FeatureProviders } from "../providers.ts";
import { gstPeriods, gstReturnView } from "./index.ts";

export const gstProviders: FeatureProviders = {
  id: "gst",
  deadlines(data, fund, now) {
    return gstPeriods(data, fund, now).map((period) => ({
      date: period.dueDate,
      fundId: fund.id,
      fundName: fund.name,
      obligation: `${period.kind === "BAS" ? "BAS" : "GST return (F5)"} ${period.label.replace(/^BAS |^GST F5 /, "")}`,
      status: period.status === "lodged" ? "done" : period.status,
      workspace: "/gst",
    }));
  },
  risks(data, fund, now) {
    const ctx = { now, user: data.users[0] };
    return gstPeriods(data, fund, now).flatMap((period) => {
      const view = gstReturnView(data, fund.id, period.end, ctx);
      const overdue = period.status === "overdue"
        ? [{ id: `gst-overdue-${fund.id}-${period.end}`, fundId: fund.id, severity: "exception" as const, area: "GST", title: `${period.kind} overdue`, detail: `${period.label} was due ${period.dueDate}.`, workspace: "/gst" }]
        : [];
      return [
        ...overdue,
        ...view.checks.map((check) => ({ id: `gst-${fund.id}-${period.end}-${check.id}`, fundId: fund.id, severity: check.severity, area: "GST", title: check.title, detail: check.detail, workspace: "/gst" })),
      ];
    });
  },
  compareSources(data, fund, now) {
    const ctx = { now, user: data.users[0] };
    return gstPeriods(data, fund, now).map((period) => {
      const view = gstReturnView(data, fund.id, period.end, ctx);
      return {
        id: `gst-${fund.id}-${period.end}`,
        label: period.label,
        description: `${period.kind} due ${period.dueDate}`,
        tolerance: fund.market === "AU" ? 0 : 1,
        lines: view.boxes.map((box) => ({ ref: box.ref, label: box.label, amount: box.amount, section: period.kind, note: fund.market === "AU" ? "ATO BAS label from AU GST engine" : "IRAS F5 box from Singapore GST engine" })),
      };
    });
  },
};
