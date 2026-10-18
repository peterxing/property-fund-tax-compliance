import { test } from "node:test";
import assert from "node:assert/strict";
import { monthWeeks, obligationLabel } from "../../../src/app/workspaces/calendar/model.ts";
import type { CalendarMonth } from "../../../src/domain/portfolio/index.ts";

test("monthWeeks lays obligations into weekday cells without dropping empty weeks", () => {
  const month: CalendarMonth = {
    key: "2026-09",
    label: "September 2026",
    rows: [
      {
        date: "2026-09-30",
        fundId: "southbank",
        fundName: "Southbank",
        fund: "Southbank",
        market: "AU",
        obligation: "AMMA statements",
        status: "overdue",
        kind: "AMMA",
        workspaceRoute: "/",
        source: "market",
      },
    ],
  };
  const weeks = monthWeeks(month);
  assert.equal(weeks.length, 5);
  assert.equal(weeks[0]![0], null);
  assert.equal(weeks[4]![3]?.rows[0]?.obligation, "AMMA statements");
});

test("obligationLabel uses the product em dash wording", () => {
  assert.equal(obligationLabel("Fund payment notice - Quarter ended 30 Sep 2026"), "Fund payment notice — Quarter ended 30 Sep 2026");
});
