import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocateDistributionToMembers,
  allocateSharedExpenses,
  computeDistribution,
  modelScenarios,
  reconcileWithholding,
} from "../../../src/engine/au/distribution.ts";

test("distribution policy and member allocation reconcile exactly for an AMIT", () => {
  const distribution = computeDistribution({
    trustRegime: "AMIT",
    periodStart: "2025-07-01",
    periodEnd: "2026-06-30",
    recordDate: "2026-06-30",
    incomeYearEnd: "2026-06-30",
    unitsOutstanding: 100,
    distributableIncome: 900_00,
    componentPools: {
      RENT: 600_00,
      INTEREST: 100_00,
      FRANKED_DIVIDEND: 100_00,
      CAPITAL_GAIN_DISCOUNTABLE: 200_00,
      NON_ASSESSABLE_TAX_DEFERRED: 50_00,
    },
    taxOffsets: 30_00,
    mitFundPaymentBreakdown: {
      ordinaryFundPayment: 600_00,
      ncmiFundPayment: 100_00,
    },
    policy: {
      label: "Base",
      distributableIncomePayoutBps: 8000,
      taxDeferredPayoutBps: 10000,
      retainedCashAmount: 20_00,
      dpuDecimals: 4,
      attributionMethod: "TIME_WEIGHTED_DAILY",
    },
  });
  assert.equal(distribution.declaredCashDistribution, 750_00);

  const allocation = allocateDistributionToMembers({
    trustRegime: "AMIT",
    periodStart: "2025-07-01",
    periodEnd: "2026-06-30",
    recordDate: "2026-06-30",
    incomeYearEnd: "2026-06-30",
    unitsOutstanding: 100,
    distributableIncome: 900_00,
    componentPools: {
      RENT: 600_00,
      INTEREST: 100_00,
      FRANKED_DIVIDEND: 100_00,
      CAPITAL_GAIN_DISCOUNTABLE: 200_00,
      NON_ASSESSABLE_TAX_DEFERRED: 50_00,
    },
    taxOffsets: 30_00,
    distribution,
    policy: {
      label: "Base",
      distributableIncomePayoutBps: 8000,
      taxDeferredPayoutBps: 10000,
      retainedCashAmount: 20_00,
      dpuDecimals: 4,
      attributionMethod: "TIME_WEIGHTED_DAILY",
    },
    mitFundPaymentBreakdown: {
      ordinaryFundPayment: 600_00,
      ncmiFundPayment: 100_00,
    },
    members: [
      {
        memberId: "A",
        displayName: "Resident Alice",
        profile: { memberClass: "RESIDENT_INDIVIDUAL", quotedTfn: true },
        unitsHeldOnRecordDate: 40,
        holdingPeriods: [{ from: "2025-07-01", to: "2026-06-30", units: 40 }],
        startingCostBase: 1_000_00,
      },
      {
        memberId: "B",
        displayName: "Foreign Bob",
        profile: { memberClass: "FOREIGN_COMPANY_EOI" },
        unitsHeldOnRecordDate: 60,
        holdingPeriods: [{ from: "2025-07-01", to: "2026-06-30", units: 60 }],
      },
    ],
  });
  assert.equal(allocation.totals.grossCashDistribution, 750_00);
  assert.equal(allocation.totals.grossCashDistribution, allocation.totals.netCashDistribution + allocation.totals.totalWithheld);
  assert.equal(allocation.members[1]?.mitWithheld, 72_00);
  assert.ok(allocation.members[0]?.ammaStatement);
  assert.ok(allocation.members[1]?.fundPaymentNotice);

  const reconciliation = reconcileWithholding({
    allocation,
    remittedToAto: allocation.totals.totalWithheld,
    statementsIssued: allocation.members.length,
  });
  assert.equal(reconciliation.variance, 0);
});

test("time-weighted attribution can differ from record-date allocation for mid-period movements", () => {
  const baseInput = {
    trustRegime: "AMIT" as const,
    periodStart: "2025-07-01",
    periodEnd: "2026-06-30",
    recordDate: "2026-06-30",
    incomeYearEnd: "2026-06-30",
    unitsOutstanding: 100,
    distributableIncome: 100_00,
    componentPools: { RENT: 100_00 },
    policy: { distributableIncomePayoutBps: 10000, dpuDecimals: 4 } as const,
  };
  const distribution = computeDistribution(baseInput);
  const recordDate = allocateDistributionToMembers({
    ...baseInput,
    distribution,
    policy: { ...baseInput.policy, attributionMethod: "RECORD_DATE" },
    members: [
      { memberId: "E", displayName: "Exit", profile: { memberClass: "RESIDENT_COMPANY", quotedAbn: true }, unitsHeldOnRecordDate: 0, holdingPeriods: [{ from: "2025-07-01", to: "2025-12-31", units: 100 }] },
      { memberId: "F", displayName: "40%", profile: { memberClass: "FOREIGN_COMPANY_EOI" }, unitsHeldOnRecordDate: 40, holdingPeriods: [{ from: "2026-01-01", to: "2026-06-30", units: 40 }] },
      { memberId: "G", displayName: "60%", profile: { memberClass: "FOREIGN_COMPANY_EOI" }, unitsHeldOnRecordDate: 60, holdingPeriods: [{ from: "2026-01-01", to: "2026-06-30", units: 60 }] },
    ],
  });
  const timeWeighted = allocateDistributionToMembers({
    ...baseInput,
    distribution,
    policy: { ...baseInput.policy, attributionMethod: "TIME_WEIGHTED_DAILY" },
    members: [
      { memberId: "E", displayName: "Exit", profile: { memberClass: "RESIDENT_COMPANY", quotedAbn: true }, unitsHeldOnRecordDate: 0, holdingPeriods: [{ from: "2025-07-01", to: "2025-12-31", units: 100 }] },
      { memberId: "F", displayName: "40%", profile: { memberClass: "FOREIGN_COMPANY_EOI" }, unitsHeldOnRecordDate: 40, holdingPeriods: [{ from: "2026-01-01", to: "2026-06-30", units: 40 }] },
      { memberId: "G", displayName: "60%", profile: { memberClass: "FOREIGN_COMPANY_EOI" }, unitsHeldOnRecordDate: 60, holdingPeriods: [{ from: "2026-01-01", to: "2026-06-30", units: 60 }] },
    ],
  });
  assert.equal(recordDate.members[0]?.grossCashDistribution, 0);
  assert.ok((timeWeighted.members[0]?.grossCashDistribution ?? 0) > 0);
  assert.equal(timeWeighted.totals.grossCashDistribution, 100_00);
});

test("expense allocation and scenario modelling are deterministic", () => {
  const expenses = allocateSharedExpenses({
    directExpensesByCharacter: { RENT: 100_00 },
    sharedExpenses: 30_00,
    grossIncomeByCharacter: { RENT: 200_00, FOREIGN_INCOME: 100_00 },
  });
  assert.equal(expenses.allocatedByCharacter.RENT, 120_00);
  assert.equal(expenses.allocatedByCharacter.FOREIGN_INCOME, 10_00);

  const scenarios = modelScenarios({
    trustRegime: "MIT",
    periodStart: "2025-07-01",
    periodEnd: "2026-06-30",
    recordDate: "2026-06-30",
    incomeYearEnd: "2026-06-30",
    unitsOutstanding: 100,
    distributableIncome: 500_00,
    componentPools: { RENT: 500_00, NON_ASSESSABLE_TAX_DEFERRED: 50_00 },
    policies: [
      { label: "90%", distributableIncomePayoutBps: 9000, dpuDecimals: 4 },
      { label: "100%", distributableIncomePayoutBps: 10000, dpuDecimals: 4 },
    ],
  });
  assert.equal(scenarios[0]?.declaredCashDistribution, 500_00);
  assert.equal(scenarios[1]?.declaredCashDistribution, 550_00);
});

