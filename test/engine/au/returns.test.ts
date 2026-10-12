import { test } from "node:test";
import assert from "node:assert/strict";
import { AU_RETURN_TYPES, auReturnDueDate, determineAuReturn } from "../../../src/engine/au/returns.ts";

const dollars = (amount: number): number => amount * 100;

test("return catalogue is stable and AMIT uses its own return type", () => {
  assert.deepEqual(AU_RETURN_TYPES.map((item) => item.id), ["AMIT_TAX_RETURN", "TRUST_TAX_RETURN", "COMPANY_TAX_RETURN"]);
  const amit = determineAuReturn({ incomeYear: 2026, regime: "AMIT" });
  assert.equal(amit.returnType, "AMIT_TAX_RETURN");
  assert.equal(amit.dueDate, "2026-10-31");
});

test("self-lodger defaults follow 31 October and 1 December for June balancers", () => {
  assert.equal(auReturnDueDate({ incomeYear: 2026, regime: "UNIT_TRUST" }), "2026-10-31");
  const company = determineAuReturn({ incomeYear: 2026, regime: "COMPANY" });
  assert.equal(company.dueDate, "2026-10-31");
  assert.equal(company.paymentDueDate, "2026-12-01");
});

test("registered-agent trust due dates respect size and liability thresholds", () => {
  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "UNIT_TRUST", lodgedBy: "REGISTERED_AGENT", annualTotalIncome: dollars(11_000_000), latestYearTaxable: true }).dueDate, "2027-01-31");
  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "UNIT_TRUST", lodgedBy: "REGISTERED_AGENT", annualTotalIncome: dollars(11_000_000), latestYearTaxable: false }).dueDate, "2027-02-28");
  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "UNIT_TRUST", lodgedBy: "REGISTERED_AGENT", latestYearTaxLiability: dollars(20_000) }).dueDate, "2027-03-31");
  const remaining = determineAuReturn({ incomeYear: 2026, regime: "UNIT_TRUST", lodgedBy: "REGISTERED_AGENT", applyFiveJuneConcession: true });
  assert.equal(remaining.dueDate, "2027-05-15");
  assert.equal(remaining.concessionDueDate, undefined);
});

test("registered-agent company due dates follow the ATO company program boundaries", () => {
  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "COMPANY", lodgedBy: "REGISTERED_AGENT", priorYearReturnsOutstanding: true }).dueDate, "2026-10-31");
  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "COMPANY", lodgedBy: "REGISTERED_AGENT", nonFullSelfAssessment: true }).dueDate, "2026-12-01");
  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "COMPANY", lodgedBy: "REGISTERED_AGENT", annualTotalIncome: dollars(20_000_000), latestYearTaxable: true }).dueDate, "2027-01-31");
  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "COMPANY", lodgedBy: "REGISTERED_AGENT", annualTotalIncome: dollars(20_000_000), latestYearTaxable: false }).dueDate, "2027-02-28");
  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "COMPANY", lodgedBy: "REGISTERED_AGENT", totalIncomePreviousYear: dollars(2_000_001) }).dueDate, "2027-03-31");
  const concession = determineAuReturn({
    incomeYear: 2026,
    regime: "COMPANY",
    lodgedBy: "REGISTERED_AGENT",
    applyFiveJuneConcession: true,
    expectsCurrentYearNonTaxableOrRefund: true,
    expectsPriorYearNonTaxableOrRefund: true,
  });
  assert.equal(concession.dueDate, "2027-05-15");
  assert.equal(concession.concessionDueDate, "2027-06-05");
});

test("SAP returns use month-based trust and company formulas", () => {
  assert.equal(determineAuReturn({ incomeYear: 2026, regime: "UNIT_TRUST", yearEnd: { month: 12, day: 31 } }).dueDate, "2027-04-30");
  const company = determineAuReturn({ incomeYear: 2026, regime: "COMPANY", yearEnd: { month: 12, day: 31 } });
  assert.equal(company.dueDate, "2027-07-15");
  assert.equal(company.paymentDueDate, "2027-06-01");
});

