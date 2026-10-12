import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apportionAuInputTaxCredits,
  assessAuGstRegistration,
  buildAuBas,
  classifyAuPropertySupply,
  computeAuFailureToLodgePenalty,
  computeAuGeneralInterestCharge,
  computeChangeInCreditablePurposeAdjustment,
  computeGstPropertySettlementWithholding,
  computeMarginSchemeGst,
  gstRateByDate,
} from "../../../src/engine/au/gst.ts";

test("GST rate stays at 10% for the Australian module", () => {
  assert.equal(gstRateByDate("2000-07-01"), 1_000);
  assert.equal(gstRateByDate("2026-10-10"), 1_000);
});

test("property classification follows ATO residential, commercial, commercial-residential and going-concern rules", () => {
  assert.equal(classifyAuPropertySupply({ date: "2026-10-10", transactionType: "LEASE", propertyKind: "RESIDENTIAL_RENT" }).suggestedTaxCode, "SALE_INPUT_TAXED_RESIDENTIAL_RENT");
  assert.equal(classifyAuPropertySupply({ date: "2026-10-10", transactionType: "LEASE", propertyKind: "COMMERCIAL" }).suggestedTaxCode, "SALE_TAXABLE");
  assert.equal(classifyAuPropertySupply({ date: "2026-10-10", transactionType: "SALE", propertyKind: "NEW_RESIDENTIAL", useMarginScheme: true }).suggestedTaxCode, "SALE_MARGIN_SCHEME");
  assert.equal(classifyAuPropertySupply({ date: "2026-10-10", transactionType: "SALE", qualifiesAsGoingConcern: true, propertyKind: "COMMERCIAL" }).suggestedTaxCode, "SALE_GST_FREE_GOING_CONCERN");
});

test("margin scheme helpers match ATO worked examples", () => {
  const consideration = computeMarginSchemeGst({ saleDate: "2020-05-15", salePrice: 51_500_000, method: "CONSIDERATION", purchasePrice: 15_000_000 });
  assert.equal(consideration.margin, 36_500_000);
  assert.equal(consideration.gstPayable, 3_318_182);

  const valuation = computeMarginSchemeGst({ saleDate: "2018-12-02", salePrice: 144_000_000, method: "VALUATION", valuationAmount: 100_000_000 });
  assert.equal(valuation.margin, 44_000_000);
  assert.equal(valuation.gstPayable, 4_000_000);
});

test("GST withholding helper applies full-taxable, margin-scheme and excluded-potential-land rules", () => {
  const full = computeGstPropertySettlementWithholding({ contractDate: "2026-10-10", contractPrice: 880_000_00, supplyType: "FULLY_TAXABLE", supplierRegisteredOrRequired: true, isNewResidentialPremises: true });
  assert.equal(full.withholdingRequired, true);
  assert.equal(full.amount, 8_000_000);

  const margin = computeGstPropertySettlementWithholding({ contractDate: "2026-10-10", contractPrice: 880_000_00, supplyType: "MARGIN_SCHEME", supplierRegisteredOrRequired: true, isNewResidentialPremises: true });
  assert.equal(margin.amount, 6_160_000);

  const excluded = computeGstPropertySettlementWithholding({
    contractDate: "2026-10-10",
    contractPrice: 500_000_00,
    supplyType: "FULLY_TAXABLE",
    supplierRegisteredOrRequired: true,
    isPotentialResidentialLand: true,
    purchaserRegisteredForGst: true,
    purchaserAcquiringForCreditablePurpose: true,
  });
  assert.equal(excluded.withholdingRequired, false);
});

test("input-tax apportionment and Division 129 use ATO percentage mechanics", () => {
  const apportionment = apportionAuInputTaxCredits({
    taxableSupplies: 60_000_000,
    gstFreeSupplies: 10_000_000,
    inputTaxedSupplies: 30_000_000,
    directCreditableGst: 900_000,
    directBlockedGst: 100_000,
    residualGst: 200_000,
  });
  assert.equal(apportionment.creditableUseBps, 7_000);
  assert.equal(apportionment.claimableGst, 1_040_000);
  assert.equal(apportionment.blockedGst, 160_000);

  const div129 = computeChangeInCreditablePurposeAdjustment({
    purchaseValueExGst: 1_500_000,
    fullInputTaxCredit: 150_000,
    previousCreditableUseBps: 10_000,
    actualCreditableUseBps: 7_000,
    adjustmentPeriodIndex: 1,
  });
  assert.equal(div129.applies, true);
  assert.equal(div129.kind, "INCREASING");
  assert.equal(div129.amount, 45_000);
});

test("BAS builder aggregates full-reporting and simpler-BAS labels and raises key checks", () => {
  const full = buildAuBas({
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    accountingMethod: "NON_CASH",
    reportingCycle: "QUARTERLY",
    reportingMethod: "FULL",
    transactions: [
      { date: "2026-07-05", taxCode: "SALE_TAXABLE", netAmount: 10_000_000, gstAmount: 1_000_000 },
      { date: "2026-07-06", taxCode: "SALE_GST_FREE_EXPORT", netAmount: 5_000_000, gstAmount: 0 },
      { date: "2026-07-07", taxCode: "SALE_GST_FREE_GOING_CONCERN", netAmount: 3_000_000, gstAmount: 0 },
      { date: "2026-07-08", taxCode: "SALE_INPUT_TAXED_RESIDENTIAL_RENT", netAmount: 7_000_000, gstAmount: 0 },
      { date: "2026-07-15", taxCode: "PURCHASE_CAPITAL_TAXABLE", netAmount: 2_000_000, gstAmount: 200_000, hasTaxInvoice: true },
      { date: "2026-07-20", taxCode: "PURCHASE_NON_CAPITAL_TAXABLE", netAmount: 5_000_000, gstAmount: 500_000, hasTaxInvoice: false },
      { date: "2026-07-21", taxCode: "PURCHASE_NON_CAPITAL_GST_FREE", netAmount: 1_000_000, gstAmount: 0 },
    ],
  });
  assert.equal(full.labels.g1TotalSales, 26_000_000);
  assert.equal(full.labels.g2ExportSales, 5_000_000);
  assert.equal(full.labels.g3OtherGstFreeSales, 3_000_000);
  assert.equal(full.labels.g4InputTaxedSales, 7_000_000);
  assert.equal(full.labels.g10CapitalPurchases, 2_200_000);
  assert.equal(full.labels.g11NonCapitalPurchases, 6_500_000);
  assert.equal(full.labels.label1aGstOnSales, 1_000_000);
  assert.equal(full.labels.label1bGstOnPurchases, 700_000);
  assert.equal(full.payable, 300_000);
  assert.deepEqual(full.reportedLabels, { G1: 26_000_000, G2: 5_000_000, G3: 3_000_000, G10: 2_200_000, G11: 6_500_000, "1A": 1_000_000, "1B": 700_000 });
  assert.equal(full.findings.some((f) => f.id === "AU_GST.MISSING_TAX_INVOICE"), true);

  const simpler = buildAuBas({
    periodStart: "2026-07-01",
    periodEnd: "2026-09-30",
    accountingMethod: "NON_CASH",
    reportingCycle: "QUARTERLY",
    gstTurnoverCents: 900_000_000,
    transactions: [{ date: "2026-07-05", taxCode: "SALE_TAXABLE", netAmount: 1_000_000, gstAmount: 100_000 }],
  });
  assert.deepEqual(simpler.requiredLabels, ["G1", "1A", "1B"]);
  assert.equal("G2" in simpler.reportedLabels, false);
});

test("BAS reported labels ignore cents while keeping cent-accurate workings", () => {
  const margin = buildAuBas({
    periodStart: "2020-10-01",
    periodEnd: "2020-12-31",
    accountingMethod: "NON_CASH",
    reportingCycle: "QUARTERLY",
    reportingMethod: "SIMPLER_BAS",
    transactions: [{ date: "2020-12-01", taxCode: "SALE_MARGIN_SCHEME", netAmount: 40_000_000, gstAmount: 3_636_364 }],
  });

  assert.equal(margin.labels.g1TotalSales, 40_000_000);
  assert.equal(margin.labels.label1aGstOnSales, 3_636_364);
  assert.deepEqual(margin.reportedLabels, { G1: 40_000_000, "1A": 3_636_300, "1B": 0 });
});

test("registration, FTL and GIC helpers use exact threshold and published rates", () => {
  assert.equal(assessAuGstRegistration({ assessmentDate: "2026-10-10", projectedGstTurnover: 7_500_000 }).registrationRequired, true);
  assert.equal(assessAuGstRegistration({ assessmentDate: "2026-10-10", projectedGstTurnover: 7_499_999 }).registrationRequired, false);

  const ftl = computeAuFailureToLodgePenalty({ dueDate: "2026-07-01", lodgedDate: "2026-07-30", entitySize: "SMALL" });
  assert.equal(ftl.periodsLate, 2);
  assert.equal(ftl.penalty, 72_800);

  const gic = computeAuGeneralInterestCharge({ principal: 100_000, dueDate: "2026-10-01", paidDate: "2026-10-02" });
  assert.equal(gic.daysLate, 1);
  assert.equal(gic.interest, 32);
});
