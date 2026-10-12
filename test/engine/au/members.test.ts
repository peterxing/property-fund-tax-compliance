import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AU_MEMBER_CLASSES,
  AU_WITHHOLDING_SCENARIOS,
  determineMemberWithholding,
  type AuMemberClass,
  type AuWithholdingScenario,
} from "../../../src/engine/au/members.ts";

test("member and withholding catalogues cover their union ids", () => {
  const memberIds = new Set(AU_MEMBER_CLASSES.map((entry) => entry.id));
  const expectedMembers: AuMemberClass[] = [
    "RESIDENT_INDIVIDUAL",
    "RESIDENT_COMPANY",
    "COMPLYING_SUPER_FUND",
    "SMSF",
    "OTHER_RESIDENT_TRUST",
    "FOREIGN_INDIVIDUAL_EOI",
    "FOREIGN_INDIVIDUAL_NON_EOI",
    "FOREIGN_COMPANY_EOI",
    "FOREIGN_COMPANY_NON_EOI",
    "FOREIGN_FUND_EOI",
    "FOREIGN_FUND_NON_EOI",
    "FOREIGN_PENSION_EOI",
    "FOREIGN_PENSION_NON_EOI",
    "FOREIGN_SOVEREIGN_EOI",
    "FOREIGN_SOVEREIGN_NON_EOI",
    "CUSTODIAN",
    "NOMINEE",
  ];
  assert.deepEqual(new Set(expectedMembers), memberIds);

  const scenarioIds = new Set(AU_WITHHOLDING_SCENARIOS.map((entry) => entry.id));
  const expectedScenarios: AuWithholdingScenario[] = ["NONE", "TFN_ABN_WITHHOLDING", "MIT_FUND_PAYMENT_WITHHOLDING", "NOTICE_ONLY", "TRUSTEE_ASSESSED_NON_RESIDENT"];
  assert.deepEqual(new Set(expectedScenarios), scenarioIds);
});

test("resident investor without TFN or ABN is withheld at 47%", () => {
  const result = determineMemberWithholding({
    trustRegime: "AMIT",
    paymentDate: "2026-06-30",
    member: { memberClass: "RESIDENT_INDIVIDUAL" },
    actualCashPayment: 1_000_00,
    tfnWithholdingBase: 1_000_00,
  });
  assert.equal(result.scenario, "TFN_ABN_WITHHOLDING");
  assert.equal(result.rateBps, 4700);
  assert.equal(result.withholdingAmount, 470_00);
  assert.equal(result.creditLabel, "13R");
});

test("tax-deferred-only payment is not TFN withheld", () => {
  const result = determineMemberWithholding({
    trustRegime: "AMIT",
    paymentDate: "2026-06-30",
    member: { memberClass: "RESIDENT_INDIVIDUAL" },
    actualCashPayment: 250_00,
    tfnWithholdingBase: 0,
    returnOfCapitalOnly: true,
  });
  assert.equal(result.scenario, "NONE");
  assert.equal(result.withholdingAmount, 0);
});

test("MIT withholding blends ordinary, clean building, build-to-rent and NCMI rates", () => {
  const result = determineMemberWithholding({
    trustRegime: "MIT",
    paymentDate: "2026-06-30",
    withholdingMit: true,
    member: { memberClass: "FOREIGN_COMPANY_EOI" },
    actualCashPayment: 1_000_00,
    mitRateBuckets: {
      ordinaryFundPayment: 500_00,
      cleanBuildingFundPayment: 100_00,
      buildToRentFundPayment: 200_00,
      ncmiFundPayment: 100_00,
      excludedFromNcmiFundPayment: 100_00,
    },
  });
  assert.equal(result.scenario, "MIT_FUND_PAYMENT_WITHHOLDING");
  assert.equal(result.withholdingAmount, 160_00);
  assert.equal(result.bucketRates?.ordinaryFundPayment, 1500);
  assert.equal(result.bucketRates?.cleanBuildingFundPayment, 1000);
  assert.equal(result.bucketRates?.buildToRentFundPayment, 1500);
  assert.equal(result.bucketRates?.ncmiFundPayment, 3000);
  assert.equal(result.finalTax, true);
});

test("non-EOI foreign member gets 30% MIT withholding", () => {
  const result = determineMemberWithholding({
    trustRegime: "MIT",
    paymentDate: "2026-06-30",
    member: { memberClass: "FOREIGN_FUND_NON_EOI" },
    actualCashPayment: 300_00,
    mitRateBuckets: { ordinaryFundPayment: 300_00 },
  });
  assert.equal(result.withholdingAmount, 90_00);
  assert.equal(result.rateBps, 3000);
});

test("foreign member in a non-MIT is trustee assessed, not cash withheld", () => {
  const result = determineMemberWithholding({
    trustRegime: "UNIT_TRUST",
    paymentDate: "2026-06-30",
    member: { memberClass: "FOREIGN_INDIVIDUAL_EOI" },
    actualCashPayment: 300_00,
  });
  assert.equal(result.scenario, "TRUSTEE_ASSESSED_NON_RESIDENT");
  assert.equal(result.withholdingAmount, 0);
});

