import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ammaDueDate,
  ammaRevisionCutoff,
  attributeTrustComponents,
  buildAmmaStatement,
  computeAmitCostBaseNetAmount,
  determineTrustComponents,
} from "../../../src/engine/au/amit.ts";

test("AMIT trust components apply unders, overs and nil floor by character", () => {
  const result = determineTrustComponents({
    incomeYear: 2026,
    baseComponents: { RENT: 1_000_00, FOREIGN_INCOME: 100_00 },
    undersOvers: [
      { character: "RENT", amount: 50_00, adjustmentType: "UNDER", baseYear: 2025 },
      { character: "FOREIGN_INCOME", amount: 120_00, adjustmentType: "OVER", baseYear: 2025 },
    ],
  });
  assert.equal(result.determinedTrustComponents.RENT, 1_050_00);
  assert.equal(result.determinedTrustComponents.FOREIGN_INCOME, 0);
  assert.equal(result.carryForwardDeficits.FOREIGN_INCOME, undefined);
  assert.equal(result.discoveryYearConsequences.deductionsByCharacter.FOREIGN_INCOME, 20_00);
});

test("AMIT attribution allocates exactly and cost base net amount handles E10 excess", () => {
  const attributed = attributeTrustComponents({
    determinedTrustComponents: {
      RENT: 1_001,
      CAPITAL_GAIN_DISCOUNTABLE: 999,
      NON_ASSESSABLE_TAX_EXEMPT: 500,
    },
    members: [
      { memberId: "A", member: { memberClass: "RESIDENT_INDIVIDUAL", quotedTfn: true }, weight: 2 },
      { memberId: "B", member: { memberClass: "RESIDENT_COMPANY", quotedAbn: true }, weight: 1 },
    ],
  });
  assert.equal(attributed.members[0]?.components.RENT, 667);
  assert.equal(attributed.members[1]?.components.RENT, 334);
  assert.equal(attributed.totals.CAPITAL_GAIN_DISCOUNTABLE, 999);

  const cbna = computeAmitCostBaseNetAmount({
    assessableAttributed: 900_00,
    naneAttributed: 100_00,
    taxOffsets: 50_00,
    cashPaymentsOrEntitlements: 1_300_00,
    startingCostBase: 200_00,
  });
  assert.equal(cbna.increaseAmount, 1_000_00);
  assert.equal(cbna.reductionAmount, 1_350_00);
  assert.equal(cbna.excessDecrease, 350_00);
  assert.equal(cbna.closingCostBase, 0);
  assert.equal(cbna.cgtEventE10Gain, 150_00);
});

test("AMMA statement due dates and summary fields follow the AMIT guidance", () => {
  const cbna = computeAmitCostBaseNetAmount({
    assessableAttributed: 600_00,
    naneAttributed: 25_00,
    taxOffsets: 149_00,
    cashPaymentsOrEntitlements: 613_00,
  });
  const statement = buildAmmaStatement({
    incomeYearEnd: "2026-06-30",
    memberId: "M1",
    member: { memberClass: "RESIDENT_INDIVIDUAL", quotedTfn: true },
    attributedComponents: {
      RENT: 105_00,
      FRANKED_DIVIDEND: 100_00,
      CAPITAL_GAIN_DISCOUNTABLE: 70_00,
      CAPITAL_GAIN_OTHER: 85_00,
      FOREIGN_INCOME: 282_00,
      NON_ASSESSABLE_TAX_EXEMPT: 25_00,
    },
    cashDistribution: 613_00,
    taxOffsets: 149_00,
    foreignResidentWithheld: 25_00,
    costBaseNetAmount: cbna,
  });
  assert.equal(ammaDueDate("2026-06-30"), "2026-09-30");
  assert.equal(ammaRevisionCutoff("2026-06-30"), "2030-06-30");
  assert.equal(statement.summary.netCapitalGain, 155_00);
  assert.equal(statement.summary.assessableForeignIncome, 282_00);
  assert.equal(statement.components.costBaseExcessDecrease, 137_00);
});

test("ammaDueDate: three months after the year end, finishing on a month-end for a month-end year", () => {
  assert.equal(ammaDueDate("2026-06-30"), "2026-09-30");
  assert.equal(ammaDueDate("2026-09-30"), "2026-12-31");
  assert.equal(ammaDueDate("2026-03-31"), "2026-06-30");
  assert.equal(ammaDueDate("2026-12-31"), "2027-03-31");
  assert.equal(ammaDueDate("2026-02-28"), "2026-05-31");
  assert.equal(ammaDueDate("2024-02-29"), "2024-05-31");
  assert.equal(ammaDueDate("2026-04-30"), "2026-07-31");
  assert.equal(ammaDueDate("2026-06-15"), "2026-09-15", "a mid-month year end keeps its day");
  assert.equal(ammaDueDate("2026-01-30"), "2026-04-30", "clamped to a shorter month");
});
