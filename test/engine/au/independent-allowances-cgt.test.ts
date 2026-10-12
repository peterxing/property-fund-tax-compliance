/**
 * Independent verification for AU capital allowances / CGT.
 * Retrieval date for every cited ATO source: 2026-10-10.
 * Expected values are taken from ATO pages or hand calculations from cited legislative formulas,
 * not from running the implementation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCapitalWorksDeduction } from "../../../src/engine/au/capitalWorks.ts";
import { computeDepreciation } from "../../../src/engine/au/depreciation.ts";
import { computeBorrowingExpenseSchedule, computeBlackholeExpenditureSchedule } from "../../../src/engine/au/borrowingCosts.ts";
import { computeCgt, computeForeignResidentCgtWithholding } from "../../../src/engine/au/cgt.ts";

const D = (dollars: number): number => Math.round(dollars * 100);

test("Div 43 - ordinary residential buildings get 2.5% once first used to produce income", () => {
  // ATO Appendix 3 (retrieved 2026-10-10): "The company’s entitlement to a deduction begins on the date
  // the building is first used to produce assessable income after construction is completed."
  // https://www.ato.gov.au/forms-and-instructions/company-tax-return-2024-instructions/appendixes-for-the-company-tax-return/appendix-3-capital-works-deductions
  const r = computeCapitalWorksDeduction({
    incomeYear: 1987,
    asset: {
      id: "res-1985",
      label: "Residential boundary case",
      buildingType: "RESIDENTIAL",
      constructionStartDate: "1985-07-18",
      constructionCompleteDate: "1986-06-30",
      firstIncomeUseDate: "1986-07-01",
      constructionExpenditure: D(100_000),
    },
  });
  assert.equal(r.line.rateBps, 250);
  assert.equal(r.line.deduction, D(2_500));
});

test("Div 43 - pre-27 February 1992 industrial buildings outside the 1984-87 4% band still get 2.5%", () => {
  // ATO Appendix 3 (retrieved 2026-10-10): for capital works begun before 27 February 1992,
  // "The applicable rate is either 4% if the capital works were begun after 21 August 1984 and before
  // 16 September 1987, or 2.5% in any other case."
  // https://www.ato.gov.au/forms-and-instructions/company-tax-return-2024-instructions/appendixes-for-the-company-tax-return/appendix-3-capital-works-deductions
  const r = computeCapitalWorksDeduction({
    incomeYear: 1991,
    asset: {
      id: "ind-1990",
      label: "1990 factory",
      buildingType: "INDUSTRIAL",
      constructionStartDate: "1990-01-15",
      constructionCompleteDate: "1990-06-30",
      firstIncomeUseDate: "1990-07-01",
      constructionExpenditure: D(100_000),
    },
  });
  assert.equal(r.line.rateBps, 250);
  assert.equal(r.line.deduction, D(2_500));
});

test("Div 40 - ATO photocopier examples reproduce the published diminishing value and prime cost amounts", () => {
  // ATO depreciating assets guide 2025 (retrieved 2026-10-10):
  // diminishing value: $1,500 x (365/365) x (200%/5) = $600
  // prime cost: $1,500 x (365/365) x (100%/5) = $300
  // https://www.ato.gov.au/forms-and-instructions/depreciating-assets-guide-2025/depreciating-assets-effective-life-cost-and-decline-in-value/working-out-decline-in-value
  const baseAsset = {
    id: "copier",
    label: "Photocopier",
    assetClassId: "OTHER_PLANT",
    cost: D(1_500),
    startDate: "2024-07-01",
    effectiveLifeYears: 5,
  } as const;
  const dv = computeDepreciation({ incomeYear: 2025, asset: { ...baseAsset, method: "DIMINISHING_VALUE" } });
  const pc = computeDepreciation({ incomeYear: 2025, asset: { ...baseAsset, method: "PRIME_COST" } });
  assert.equal(dv.line.declineInValue, D(600));
  assert.equal(dv.line.closingAdjustableValue, D(900));
  assert.equal(pc.line.declineInValue, D(300));
  assert.equal(pc.line.closingAdjustableValue, D(1_200));
});

test("Div 40 - pre-budget-night 2017 residential grandfathering should not require installation before 1 July 2017 when the property itself was already purchased", () => {
  // ATO second-hand assets page (retrieved 2026-10-10): an exception applies if
  // "You purchased your residential rental property ... before 7:30 pm (AEST) on 9 May 2017."
  // The separate "installed ... before 1 July 2017" limb is a different exception.
  // https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties/rental-expenses/depreciating-assets-in-rental-properties/second-hand-depreciating-assets
  const r = computeDepreciation({
    incomeYear: 2018,
    asset: {
      id: "grandfathered-fridge",
      label: "Grandfathered second-hand fridge",
      assetClassId: "OTHER_PLANT",
      cost: D(1_500),
      startDate: "2017-04-01",
      method: "PRIME_COST",
      effectiveLifeYears: 5,
      residentialAccommodationUse: true,
      secondHand: true,
      purchasedBeforeBudgetNight2017: true,
      installedInRentalBefore2017_07_01: false,
      entityTypeForResidentialRestriction: "OTHER",
    },
  });
  assert.equal(r.line.deductionAllowed, D(300));
});

test("Borrowing expenses - ATO's Peter example gives $318.07 in year 1 and $1.75 in the final year", () => {
  // ATO borrowing expenses page (retrieved 2026-10-10):
  // first year = (363 / 1,826) x $1,600 = $318.07; final year = $1.75.
  // https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties/rental-expenses/borrowing-expenses
  const r = computeBorrowingExpenseSchedule({
    amount: D(1_600),
    incurredDate: "2024-07-03",
    loanStartDate: "2024-07-03",
    loanEndDate: "2049-07-02",
  });
  assert.equal(r.lines.length, 6);
  assert.equal(r.lines[0]?.deduction, D(318.07));
  assert.equal(r.lines.at(-1)?.deduction, D(1.75));
});

test("Section 40-880 - standard blackhole expenditure is 20% in the year incurred and the next 4 income years", () => {
  // ITAA 1997 s40-880(2) (retrieved 2026-10-10): "The amount you can deduct is 20% of the expenditure:
  // (a) for the income year in which you incur it; and (b) for each of the next 4 income years."
  // https://www.ato.gov.au/law/view/document?docid=PAC/19970038/40-880
  const r = computeBlackholeExpenditureSchedule({ amount: D(5_000), incurredDate: "2024-08-01" });
  assert.deepEqual(r.lines.map((line) => line.deduction), [D(1_000), D(1_000), D(1_000), D(1_000), D(1_000)]);
});

test("CGT - if the taxpayer does not choose indexation, an eligible individual defaults to the discount method", () => {
  // ATO indexation page (retrieved 2026-10-10): "If you are not a company ... and you wish to use the
  // indexation method, you must choose to do so, otherwise the discount method will apply."
  // ATO discount page: acquired 12+ months earlier; losses first, then discount.
  // https://www.ato.gov.au/forms-and-instructions/capital-gains-tax-guide-2021/whats-new/how-to-work-out-your-capital-gain-or-capital-loss/the-indexation-method
  // https://www.ato.gov.au/forms-and-instructions/capital-gains-tax-guide-2021/whats-new/how-to-work-out-your-capital-gain-or-capital-loss/the-discount-method
  const r = computeCgt({
    label: "Pre-1999 asset",
    entityType: "INDIVIDUAL",
    acquisitionDate: "1998-01-15",
    disposalContractDate: "2026-07-02",
    capitalProceeds: D(1_500),
    acquisitionPrice: D(1_000),
  });
  assert.equal(r.indexedCostBase, D(1_025)); // 68.7 / 67.0 = 1.025 to 3 decimals
  assert.equal(r.methodUsed, "DISCOUNT");
  assert.equal(r.grossCapitalGain, D(500));
  assert.equal(r.discountAmount, D(250));
  assert.equal(r.netCapitalGain, D(250));
});

test("CGT - companies with pre-21 September 1999 assets must use indexation, not the ordinary method", () => {
  // ATO indexation page (retrieved 2026-10-10): "If you are a company (other than a listed investment company)
  // and the capital gain meets the conditions listed above, you must use the indexation method".
  // https://www.ato.gov.au/forms-and-instructions/capital-gains-tax-guide-2021/whats-new/how-to-work-out-your-capital-gain-or-capital-loss/the-indexation-method
  const r = computeCgt({
    label: "Company pre-1999 asset",
    entityType: "COMPANY",
    acquisitionDate: "1998-01-15",
    disposalContractDate: "2026-07-02",
    capitalProceeds: D(1_500),
    acquisitionPrice: D(1_000),
  });
  assert.equal(r.methodUsed, "INDEXATION");
  assert.equal(r.indexedCostBase, D(1_025));
  assert.equal(r.grossCapitalGain, D(475));
  assert.equal(r.netCapitalGain, D(475));
});

test("FRCGW - contract date controls the 12.5%/15% boundary either side of 1 January 2025", () => {
  // ATO FRCGW overview (retrieved 2026-10-10): 12.5% for contracts from 1 July 2017 to 31 December 2024;
  // 15% from 1 January 2025.
  // https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/foreign-residents-and-capital-gains-tax/foreign-resident-capital-gains-withholding/foreign-resident-capital-gains-withholding-overview
  const before = computeForeignResidentCgtWithholding({
    contractDate: "2024-12-31",
    settlementDate: "2025-01-31",
    scenario: "DIRECT_REAL_PROPERTY",
    assetValue: D(1_200_000),
  });
  const after = computeForeignResidentCgtWithholding({
    contractDate: "2025-01-01",
    settlementDate: "2025-01-31",
    scenario: "DIRECT_REAL_PROPERTY",
    assetValue: D(1_200_000),
  });
  assert.equal(before.withholdingRateBps, 1250);
  assert.equal(before.amountToWithhold, D(150_000));
  assert.equal(after.withholdingRateBps, 1500);
  assert.equal(after.amountToWithhold, D(180_000));
});

test("FRCGW - a clearance certificate should not switch off withholding for options or rights", () => {
  // ATO vendor declarations page (retrieved 2026-10-10): for assets OTHER than taxable Australian real property,
  // the vendor may provide a vendor declaration; where the asset is taxable Australian real property, Australian
  // residents need a clearance certificate instead. An option/right is not direct real property.
  // https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/foreign-residents-and-capital-gains-tax/foreign-resident-capital-gains-withholding/vendor-declarations
  const r = computeForeignResidentCgtWithholding({
    contractDate: "2026-02-01",
    settlementDate: "2026-03-01",
    scenario: "OPTION_OR_RIGHT",
    assetValue: D(1_000_000),
    hasClearanceCertificate: true,
  });
  assert.equal(r.applies, true);
  assert.equal(r.withholdingRateBps, 1500);
  assert.equal(r.amountToWithhold, D(150_000));
});