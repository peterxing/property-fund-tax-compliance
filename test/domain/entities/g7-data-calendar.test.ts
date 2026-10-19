import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarView, icsCalendar, riskRegister } from "../../../src/domain/portfolio/index.ts";
import { appDataProblem } from "../../../src/domain/core/schema.ts";
import { obligationOccurrences } from "../../../src/domain/entities/obligations.ts";
import { denied, frozenSeed, ok, seed } from "../core-fixtures.ts";

const NOW = new Date(2026, 9, 12, 9, 0, 0);

test("entity-import-funds imports all rows with schema-valid defaults and one audit each", () => {
  const before = frozenSeed();
  const after = ok(before, "a-moreno", {
    type: "entity-import-funds",
    rows: [
      { market: "AU", name: "Bulk AU Trust", sector: "Office", listed: false, periodStart: "2025-07-01", periodEnd: "2026-06-30", unitsOnIssue: 1000, governance: "no-agent" },
      { market: "SG", name: "Bulk SG REIT", sector: "Logistics", listed: true, periodStart: "2026-07-01", periodEnd: "2026-09-30", unitsOnIssue: 2000, governance: "agent-signs-off", assessmentYear: 2027 },
    ],
  });
  assert.equal(after.funds.some((fund) => fund.id === "bulk-au-trust"), true);
  assert.equal(after.taxAdjustments["bulk-au-trust"]?.div40, 0);
  assert.deepEqual(after.sgLedger["bulk-sg-reit"], { exempt: 0, capital: 0, afterTax: 0 });
  assert.equal(after.audit.slice(-2).every((entry) => entry.action === "Fund imported"), true);
  assert.equal(appDataProblem(after), null);
});

test("entity-import-funds is Head-of-Tax only, all-or-nothing and enforces limits and duplicate names", () => {
  const data = frozenSeed();
  const good = { market: "AU" as const, name: "Bulk One", sector: "Office", listed: false, periodStart: "2025-07-01", periodEnd: "2026-06-30", unitsOnIssue: 1000, governance: "no-agent" as const };
  assert.equal(denied(data, "w-l-teo", { type: "entity-import-funds", rows: [good] }), "You don't have permission to import funds");
  assert.equal(denied(data, "a-moreno", { type: "entity-import-funds", rows: [good, { ...good, name: "" }] }), "Line 3: Fund name is required");
  assert.equal(data.funds.some((fund) => fund.name === "Bulk One"), false);
  assert.equal(denied(data, "a-moreno", { type: "entity-import-funds", rows: [good, { ...good, name: "Bulk One" }] }), "Line 3: fund name Bulk One appears more than once");
  assert.equal(denied(data, "a-moreno", { type: "entity-import-funds", rows: [{ ...good, name: data.funds[0]!.name }] }), `Line 2: fund name ${data.funds[0]!.name} already exists`);
  assert.equal(denied(data, "a-moreno", { type: "entity-import-funds", rows: Array.from({ length: 201 }, (_, i) => ({ ...good, name: `Bulk ${i}` })) }), "A fund import can have up to 200 rows");
});

test("custom obligations support CRUD, done toggling, calendar, ICS, risk and delete cascade", () => {
  let data = frozenSeed();
  data = ok(data, "a-moreno", { type: "entity-add-obligation", obligation: { fundId: "telok-ayer", title: "Payroll return", category: "payroll", firstDue: "2026-01-31", recurrence: "monthly", notes: "Payroll team owner" } });
  const obligation = data.obligations[0]!;
  assert.equal(obligation.createdBy, "A. Moreno");
  assert.deepEqual(obligationOccurrences(obligation, NOW).slice(0, 3).map((row) => row.dueDate), ["2026-01-31", "2026-02-28", "2026-03-31"]);
  data = ok(data, "a-moreno", { type: "entity-set-obligation-done", id: obligation.id, dueDate: "2026-02-28", done: true });
  assert.equal(data.obligations[0]!.done.includes("2026-02-28"), true);
  data = ok(data, "a-moreno", { type: "entity-update-obligation", id: obligation.id, patch: { title: "Payroll return and payment", recurrence: "quarterly" } });
  assert.equal(data.obligations[0]!.title, "Payroll return and payment");
  const calendar = calendarView(data, { user: data.users[0]!, now: NOW }, "all", { fundId: "telok-ayer", showCompleted: true });
  assert.ok(calendar.rows.some((row) => row.obligation === "Payroll return and payment" && row.status === "overdue"));
  assert.match(icsCalendar(calendar.rows, { now: NOW }), /Payroll return and payment/);
  assert.ok(riskRegister(data, { user: data.users[0]!, now: NOW }, "all").rows.some((row) => row.title === "Payroll return and payment is overdue" && row.severity === "note"));
  data = ok(data, "a-moreno", { type: "entity-delete-fund", fundId: "telok-ayer", confirmName: "Telok Ayer Commercial REIT" });
  assert.equal(data.obligations.some((item) => item.fundId === "telok-ayer"), false);
  assert.equal(appDataProblem(data), null);
});

test("custom obligations are not workflow-locked but remain permission-checked", () => {
  const data = seed();
  const action = { type: "entity-add-obligation" as const, obligation: { fundId: "meranti", title: "Insurance renewal", category: "insurance" as const, firstDue: "2026-12-31", recurrence: "annually" as const, notes: "" } };
  assert.equal(data.funds.find((fund) => fund.id === "meranti")?.status, "In review");
  assert.equal(ok(data, "a-moreno", action).obligations.some((item) => item.title === "Insurance renewal"), true);
  assert.equal(denied(data, "m-castillo", action), "You don't have permission to edit obligations for this fund");
  assert.equal(denied(data, "r-okafor", action), "You don't have access to this fund");
});
