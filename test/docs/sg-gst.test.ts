import assert from "node:assert/strict";
import { test } from "node:test";
import { calculatorById, defaultValues } from "../../src/app/workspaces/calculators/model.ts";
import { money } from "../../src/domain/format.ts";
import { gstReturnView } from "../../src/domain/gst/index.ts";
import { seedData } from "../../src/domain/seed/index.ts";
import type { AppData, Ctx } from "../../src/domain/types.ts";
import {
  assessGstRegistration,
  buildGstReturn,
  classifyPropertySupply,
  computeGstLateFilingPenalty,
  computeGstLatePaymentPenalty,
  computePartialExemption,
  gstGiroPaymentDate,
  gstRateByDate,
  gstReturnDueDate,
  latestInputTaxClaimDate,
} from "../../src/engine/gst.ts";
import { GST_CODES } from "../../src/engine/gstCodes.ts";
import { buildIaf } from "../../src/engine/iaf.ts";
import { assertDocQuotes, assertExampleQuotes, assertSectionQuotes, exampleIds, readRuleDoc, tableRow } from "./docText.ts";

const DOC = "sg-gst";
const SGD = "SGD";

function ctx(data: AppData): Ctx {
  return { now: new Date("2026-10-12T09:00:00"), user: data.users[0]! };
}

function pct(bps: number): string {
  return `${bps / 100}%`;
}

function boxesRow(ref: string, cents: number): string {
  return tableRow([ref, money(cents, SGD, 2)]);
}

test("Singapore GST document covers exactly the tested examples", () => {
  assert.deepEqual(exampleIds(readRuleDoc(DOC)), ["GSTSG-1", "GSTSG-2", "F5-1", "F5-2", "GSTREG-1", "GSTPEN-1", "IAF-1"]);
});

test("Singapore GST rate table matches gstRateByDate behaviour", () => {
  const rows = [
    ["1 Apr 1994 to 31 Dec 2002", "1994-04-01", "2002-12-31"],
    ["1 Jan 2003 to 31 Dec 2003", "2003-01-01", "2003-12-31"],
    ["1 Jan 2004 to 30 Jun 2007", "2004-01-01", "2007-06-30"],
    ["1 Jul 2007 to 31 Dec 2022", "2007-07-01", "2022-12-31"],
    ["1 Jan 2023 to 31 Dec 2023", "2023-01-01", "2023-12-31"],
    ["1 Jan 2024 onward", "2024-01-01", "2026-10-19"],
  ] as const;
  assertSectionQuotes(
    DOC,
    "Singapore GST standard-rate history",
    rows.map(([label, start, end]) => {
      const startRate = gstRateByDate(start);
      assert.equal(gstRateByDate(end), startRate, end);
      return tableRow([label, pct(startRate), "`gst.rate-and-f5.1994-plus`"]);
    }),
  );
});

test("Singapore GST code mapping table matches GST_CODES", () => {
  const cell = (values: readonly number[]) => (values.length === 0 ? "-" : values.join(","));
  const rows = GST_CODES.map((code) =>
    tableRow([
      code.code,
      code.side,
      code.rateBehavior,
      cell(code.feedsBaseBoxes),
      cell(code.feedsTaxBoxes),
      cell(code.feedsIndicatorBoxes),
      code.inputTaxClaimability,
      code.effectiveTo ? `${code.effectiveFrom} to ${code.effectiveTo}` : code.effectiveFrom,
    ]),
  );
  assertSectionQuotes(DOC, "Singapore GST code to F5 box mapping", rows);
});

test("Partial-exemption threshold table matches engine probes", () => {
  const pass = computePartialExemption({
    periodStart: "2014-04-01",
    periodEnd: "2014-06-30",
    taxableSupplies: 238_000_000,
    exemptSupplies: 12_000_000,
    directTaxableInputTax: 0,
    directReg33InputTax: 0,
    directExemptInputTax: 0,
    residualInputTax: 0,
  });
  assert.equal(pass.deMinimisPass, true);
  assert.equal(pass.exemptSuppliesPerMonth, 4_000_000);
  const overMonthly = computePartialExemption({
    periodStart: "2014-04-01",
    periodEnd: "2014-06-30",
    taxableSupplies: 237_999_999,
    exemptSupplies: 12_000_001,
    directTaxableInputTax: 0,
    directReg33InputTax: 0,
    directExemptInputTax: 0,
    residualInputTax: 0,
  });
  assert.equal(overMonthly.deMinimisPass, false);
  const reg35Boundary = computePartialExemption({
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    taxableSupplies: 190_000_000,
    exemptSupplies: 10_000_000,
    directTaxableInputTax: 0,
    directReg33InputTax: 0,
    directExemptInputTax: 0,
    residualInputTax: 0,
  });
  assert.equal(reg35Boundary.deMinimisPass, true);
  assert.equal(latestInputTaxClaimDate("2026-02-01"), "2031-02-01");
  assertSectionQuotes(DOC, "Partial-exemption thresholds and rounding", [
    tableRow(["De minimis monthly exempt-supply limit", money(pass.exemptSuppliesPerMonth, SGD, 2), "Relevant exempt supplies divided by inclusive month count using truncation", "`gst.partial-exemption.real-estate.2022-plus`"]),
    tableRow(["De minimis percentage limit", "5%", "Exact integer cross-multiplication, no decimal rounding", "`gst.partial-exemption.real-estate.2022-plus`"]),
    tableRow(["Regulation 35 non-Regulation 33 limit", "5%", "Exact integer cross-multiplication, no decimal rounding", "`gst.partial-exemption.real-estate.2022-plus`"]),
    tableRow(["Residual input-tax recovery", "nearest whole percent", "Half-up whole-percent rounding, then `Math.round(inputTax * bps / 10,000)`", "`gst.partial-exemption.real-estate.2022-plus`"]),
    tableRow(["Input-tax claim time limit", "5 years", "Adds five years to the invoice or import-permit date", "`gst.partial-exemption.real-estate.2022-plus`"]),
  ]);
});

test("Example GSTSG-1 recomputes the rate-change and credit-note F5", () => {
  const result = buildGstReturn({
    periodStart: "2023-12-01",
    periodEnd: "2024-01-31",
    transactions: [
      { date: "2023-12-31", documentNo: "S-2023", counterparty: "Office tenant", taxCode: "SR", netAmount: 100_000, gstAmount: 8_000, currency: SGD },
      { date: "2024-01-01", documentNo: "S-2024", counterparty: "Office tenant", taxCode: "SR", netAmount: 100_000, gstAmount: 9_000, currency: SGD },
      { date: "2024-01-15", documentNo: "CN-1", counterparty: "Office tenant", taxCode: "SR", netAmount: -10_000, gstAmount: -900, currency: SGD },
      { date: "2024-01-31", documentNo: "R-1", counterparty: "Resident", taxCode: "ESN33", netAmount: 50_000, gstAmount: 0, currency: SGD },
    ],
  });
  assert.equal(result.boxes.box1StandardRatedSupplies, 190_000);
  assert.equal(result.boxes.box3ExemptSupplies, 50_000);
  assert.equal(result.boxes.box4TotalSupplies, 240_000);
  assert.equal(result.boxes.box6OutputTaxDue, 16_100);
  assert.equal(result.boxes.box8NetGst, 16_100);
  assert.equal(classifyPropertySupply({ date: "2024-01-01", transactionType: "LEASE", propertyUse: "OFFICE" }).suggestedTaxCode, "SR");
  assert.equal(classifyPropertySupply({ date: "2024-01-01", transactionType: "LEASE", propertyUse: "RESIDENTIAL" }).suggestedTaxCode, "ESN33");
  assert.equal(classifyPropertySupply({ date: "2024-01-01", transactionType: "IMPORTED_SERVICE", reverseChargeApplies: true }).suggestedTaxCode, "SRRC");
  assertExampleQuotes(DOC, "GSTSG-1", [
    tableRow(["2023-12-31 commercial lease", "SR", money(100_000, SGD, 2), money(8_000, SGD, 2)]),
    tableRow(["2024-01-01 commercial lease", "SR", money(100_000, SGD, 2), money(9_000, SGD, 2)]),
    tableRow(["2024-01-15 commercial credit note", "SR", money(-10_000, SGD, 2), money(-900, SGD, 2)]),
    tableRow(["2024-01-31 residential lease", "ESN33", money(50_000, SGD, 2), money(0, SGD, 2)]),
    `Box 1 standard-rated supplies **${money(result.boxes.box1StandardRatedSupplies, SGD, 2)}**`,
    `Box 3 exempt supplies **${money(result.boxes.box3ExemptSupplies, SGD, 2)}**`,
    `Box 4 total supplies **${money(result.boxes.box4TotalSupplies, SGD, 2)}**`,
    `Box 6 output tax **${money(result.boxes.box6OutputTaxDue, SGD, 2)}**`,
    `Box 8 net GST **${money(result.boxes.box8NetGst, SGD, 2)}**`,
    "`SR` for an office lease",
    "`ESN33` for a residential lease",
    "`SRRC` for an imported service",
  ]);
});

test("Example GSTSG-2 recomputes the IRAS partial-exemption example", () => {
  const result = computePartialExemption({
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    taxableSupplies: 100_000_000,
    exemptSupplies: 6_500_000,
    regulation33ExemptSupplies: 1_500_000,
    nonRegulation33ExemptSupplies: 5_000_000,
    directTaxableInputTax: 5_600_000,
    directReg33InputTax: 700,
    directExemptInputTax: 14_000,
    residualInputTax: 70_000,
  });
  assert.equal(result.deMinimisPass, false);
  assert.equal(result.regulation35Pass, true);
  assert.equal(result.recoverableResidualBps, 9500);
  assert.equal(result.claimableInputTax, 5_667_200);
  assert.equal(result.disallowedInputTax, 17_500);
  assertExampleQuotes(DOC, "GSTSG-2", [
    `taxable supplies **${money(100_000_000, SGD, 2)}**`,
    `total exempt supplies **${money(6_500_000, SGD, 2)}**`,
    `**${money(1_500_000, SGD, 2)}** are Regulation 33`,
    `**${money(5_000_000, SGD, 2)}** are non-Regulation 33`,
    `direct taxable **${money(5_600_000, SGD, 2)}**`,
    `direct Regulation 33 **${money(700, SGD, 2)}**`,
    `direct non-Regulation 33 **${money(14_000, SGD, 2)}**`,
    `residual **${money(70_000, SGD, 2)}**`,
    `**${money(6_500_000, SGD, 2)} / ${money(106_500_000, SGD, 2)} = 6.10%**`,
    `**${money(5_000_000, SGD, 2)} / ${money(106_500_000, SGD, 2)} = 4.69%**`,
    `**${money(101_500_000, SGD, 2)} / ${money(106_500_000, SGD, 2)} = 95.3%**`,
    `rounded half-up to **${result.recoverableResidualBps / 100}%**`,
    `Claimable input tax is **${money(result.claimableInputTax, SGD, 2)}**`,
    `Disallowed input tax is **${money(result.disallowedInputTax, SGD, 2)}**`,
  ]);
});

test("F5 formulas and Example F5-1 match the seeded Telok Ayer return", () => {
  assertSectionQuotes(DOC, "Singapore F5 box formulas", [
    tableRow(["Box 1", "Sum net amounts for `SR`, `SRCA-S`, `SRCA-C`, `DS`, `SRRC`, `SROVR`, `SROVR-RS`, `SROVR-LVG`, `SRLVG`, `NA`"]),
    tableRow(["Box 4", "Box 1 + Box 2 + Box 3"]),
    tableRow(["Box 8", "Box 6 − Box 7"]),
    tableRow(["Box 20", "Box 8 + Box 19"]),
  ]);
  const data = seedData();
  const view = gstReturnView(data, "telok-ayer", "2026-09-30", ctx(data));
  const boxMap = Object.fromEntries(view.boxes.map((box) => [box.ref, box.amount]));
  const expected: Record<string, number> = {
    "SG_F5.1": 1_472_281_957,
    "SG_F5.2": 43_302_411,
    "SG_F5.3": 75_779_218,
    "SG_F5.4": 1_591_363_586,
    "SG_F5.5": 704_030_811,
    "SG_F5.6": 132_505_376,
    "SG_F5.7": 55_322_073,
    "SG_F5.8": 77_183_303,
    "SG_F5.9": 0,
    "SG_F5.13": 1_591_363_586,
    "SG_F5.14": 0,
    "SG_F5.19": 0,
    "SG_F5.21": 0,
  };
  for (const [ref, cents] of Object.entries(expected)) assert.equal(boxMap[ref], cents, ref);
  assertExampleQuotes(DOC, "F5-1", [
    ...Object.entries(expected).map(([ref, cents]) => boxesRow(ref, cents)),
    `Box 1 is **${money(expected["SG_F5.1"]!, SGD, 2)}**`,
    `Box 2 is **${money(expected["SG_F5.2"]!, SGD, 2)}**`,
    `Box 3 is **${money(expected["SG_F5.3"]!, SGD, 2)}**`,
    `Box 4 is their sum, **${money(expected["SG_F5.4"]!, SGD, 2)}**`,
    `Box 6 is 9% of standard-rated supplies, **${money(expected["SG_F5.6"]!, SGD, 2)}**`,
    `Box 7 is **${money(expected["SG_F5.7"]!, SGD, 2)}**`,
    `Box 8 and Box 20 are **${money(expected["SG_F5.8"]!, SGD, 2)}**`,
  ]);
});

test("Example F5-2 matches GST due-date and GIRO helpers", () => {
  assert.equal(gstReturnDueDate("2026-06-30"), "2026-07-31");
  assert.equal(gstReturnDueDate("2026-03-31"), "2026-04-30");
  assert.equal(gstReturnDueDate("2026-07-05"), "2026-08-05");
  assert.equal(gstGiroPaymentDate("2026-06-30"), "2026-08-15");
  assertExampleQuotes(DOC, "F5-2", [
    "2026-06-30 is due 2026-07-31",
    "2026-03-31 is due 2026-04-30",
    "ending 2026-07-05 is due 2026-08-05",
    "2026-06-30 quarter, the GIRO deduction helper returns 2026-08-15",
  ]);
});

test("Registration threshold table and Example GSTREG-1 match assessGstRegistration", () => {
  const retro = assessGstRegistration({ assessmentDate: "2025-12-31", retrospectiveAnnualTaxableTurnover: 100_000_001 });
  const edge = assessGstRegistration({ assessmentDate: "2025-12-31", retrospectiveAnnualTaxableTurnover: 100_000_000 });
  const before = assessGstRegistration({ assessmentDate: "2025-03-15", forecastDate: "2025-03-15", forecastTaxableTurnoverNext12Months: 150_000_000 });
  const after = assessGstRegistration({ assessmentDate: "2025-08-10", forecastDate: "2025-08-10", forecastTaxableTurnoverNext12Months: 150_000_000 });
  assert.equal(retro.basis, "RETROSPECTIVE");
  assert.equal(retro.applicationDueDate, "2026-01-30");
  assert.equal(retro.effectiveRegistrationDate, "2026-03-01");
  assert.equal(edge.registrationRequired, false);
  assert.equal(before.applicationDueDate, "2025-04-14");
  assert.equal(before.effectiveRegistrationDate, "2025-04-15");
  assert.equal(after.applicationDueDate, "2025-09-09");
  assert.equal(after.effectiveRegistrationDate, "2025-10-10");
  assertSectionQuotes(DOC, "Singapore GST registration thresholds and dates", [
    tableRow(["Retrospective turnover", `More than ${money(retro.thresholdAmount, SGD, 2)}`, "`>` threshold, not `>=`"]),
    tableRow(["Prospective turnover", `More than ${money(retro.thresholdAmount, SGD, 2)}`, "`>` threshold and forecast date required"]),
    tableRow(["Application due date", "30 days after assessment or forecast date", "`addDays(date, 30)`"]),
    tableRow(["Retrospective effective date", "1 Mar of the next calendar year", "`${assessmentYear + 1}-03-01`"]),
    tableRow(["Prospective effective date before 1 Jul 2025", "31st day after forecast date", "`addDays(forecastDate, 31)`"]),
    tableRow(["Prospective effective date on/after 1 Jul 2025", "2 months after forecast date", "`addMonths(forecastDate, 2)`"]),
  ]);
  assertExampleQuotes(DOC, "GSTREG-1", [
    `turnover **${money(100_000_001, SGD, 2)}**`,
    "basis **RETROSPECTIVE**",
    `application due **${retro.applicationDueDate}**`,
    `effective registration **${retro.effectiveRegistrationDate}**`,
    `At exactly **${money(100_000_000, SGD, 2)}**`,
    "**registration not required**",
    "forecast dated **2025-03-15**",
    `turnover **${money(150_000_000, SGD, 2)}** gives application due **${before.applicationDueDate}**`,
    `effective registration **${before.effectiveRegistrationDate}**`,
    "forecast dated **2025-08-10**",
    `application due **${after.applicationDueDate}**`,
    `effective registration **${after.effectiveRegistrationDate}**`,
  ]);
});

test("Penalty table and Example GSTPEN-1 match penalty helpers and calculator output", () => {
  const latePayment = computeGstLatePaymentPenalty({ unpaidTax: 1_000_000, dueDate: "2025-07-31", paidDate: "2025-12-16", penaltyNoticeDate: "2025-08-05" });
  const lateFiling = computeGstLateFilingPenalty({ dueDate: "2025-10-31", filedDate: "2026-02-15" });
  const cap = computeGstLateFilingPenalty({ dueDate: "2025-10-31", filedDate: "2030-01-15" });
  assert.equal(latePayment, 130_000);
  assert.equal(lateFiling, 80_000);
  assert.equal(cap, 1_000_000);
  const calculator = calculatorById("sg-gst");
  const output = calculator.compute(defaultValues(calculator));
  assert.equal(output.ok, true);
  assert.equal(output.ok ? output.headlineValue : "", "S$13,600");
  assert.equal(output.ok ? output.lines.find((line) => line.label === "Late filing penalty")?.value : "", "S$600");
  assert.equal(output.ok ? output.lines.find((line) => line.label === "Late payment penalty")?.value : "", "S$13,000");
  assertSectionQuotes(DOC, "Singapore GST penalty thresholds", [
    tableRow(["Late filing immediate penalty", money(20_000, SGD, 2), `${money(1_000_000, SGD, 2)} per return`, "`gst.registration-and-penalties.2022-plus`"]),
    tableRow(["Late filing monthly increment", `${money(20_000, SGD, 2)} per completed month`, `${money(1_000_000, SGD, 2)} per return`, "`gst.registration-and-penalties.2022-plus`"]),
    tableRow(["Late payment first penalty", "5% of unpaid tax", "No separate cap in code", "`gst.registration-and-penalties.2022-plus`"]),
    tableRow(["Late payment additional penalty", "2% per month", "50% of unpaid tax", "`gst.registration-and-penalties.2022-plus`"]),
    tableRow(["Additional-penalty trigger", "60 days after 5% penalty notice", "N/A", "`gst.registration-and-penalties.2022-plus`"]),
  ]);
  assertExampleQuotes(DOC, "GSTPEN-1", [
    "due **2025-07-31**",
    `unpaid GST **${money(1_000_000, SGD, 2)}**`,
    "notice on **2025-08-05**",
    "payment on **2025-12-16**",
    `first penalty **${money(50_000, SGD, 2)}**`,
    `additional penalty **${money(80_000, SGD, 2)}**`,
    `total late-payment penalty **${money(latePayment, SGD, 2)}**`,
    "return due **2025-10-31**",
    "filed **2026-02-15**",
    `penalty is **${money(lateFiling, SGD, 2)}**`,
    `**${money(20_000, SGD, 2)}** immediately plus **3 × ${money(20_000, SGD, 2)}**`,
    `gives **${money(cap, SGD, 2)}**`,
    "penalties are **S$13,600**",
    "late filing **S$600**",
    "late payment **S$13,000**",
  ]);
});

test("IAF section table and Example IAF-1 match buildIaf", () => {
  const result = buildIaf({
    company: {
      companyName: "Example S-REIT",
      companyUen: "201912345A",
      gstRegistrationNumber: "M21234567X",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
    },
    purchaseLedger: [
      { date: "2026-02-01", documentNo: "P001", counterpartyName: "Vendor", taxCode: "TX", currency: SGD, netAmount: 100_000, gstAmount: 9_000 },
    ],
    supplyLedger: [
      { date: "2026-02-01", documentNo: "S001", counterpartyName: "Tenant", taxCode: "SR", currency: SGD, netAmount: 200_000, gstAmount: 18_000 },
    ],
    generalLedger: [
      { date: "2026-02-01", journalNo: "J001", accountCode: "4000", accountName: "Rental Income", debit: 0, credit: 218_000, taxCode: "SR" },
    ],
  });
  assert.match(result.text, /\[CompanyInfo\]/);
  assert.match(result.text, /\[PurchaseLedger\]/);
  assert.match(result.text, /\[SupplyLedger\]/);
  assert.match(result.text, /\[GeneralLedger\]/);
  assert.match(result.text, /1\|2026-02-01\|P001\|Vendor\|\|\|TX\|SGD\|1000\.00\|90\.00\|1090\.00\|\|/);
  assert.match(result.text, /1\|2026-02-01\|S001\|Tenant\|\|\|SR\|SGD\|2000\.00\|180\.00\|2180\.00\|/);
  assert.ok(result.findings.some((finding) => finding.id === "IAF.SPEC.ASSUMED"));
  assertSectionQuotes(DOC, "IRAS Audit File assumed sections", [
    tableRow(["CompanyInfo", "Field\\|Value"]),
    tableRow(["PurchaseLedger", "LineNo\\|Date\\|DocumentNo\\|Counterparty\\|CounterpartyRef\\|Description\\|TaxCode\\|Currency\\|NetAmountSGD\\|GSTAmountSGD\\|GrossAmountSGD\\|PropertyRef\\|PermitNumber"]),
    tableRow(["SupplyLedger", "LineNo\\|Date\\|DocumentNo\\|Counterparty\\|CounterpartyRef\\|Description\\|TaxCode\\|Currency\\|NetAmountSGD\\|GSTAmountSGD\\|GrossAmountSGD\\|PropertyRef"]),
    tableRow(["GeneralLedger", "LineNo\\|Date\\|JournalNo\\|AccountCode\\|AccountName\\|Description\\|DebitSGD\\|CreditSGD\\|TaxCode\\|SourceDocumentNo"]),
  ]);
  assertExampleQuotes(DOC, "IAF-1", [
    "**Example S-REIT**",
    "**IRAS-IAF-ASSUMED-2026.1**",
    "**[CompanyInfo]**",
    "**[PurchaseLedger]**",
    "**[SupplyLedger]**",
    "**[GeneralLedger]**",
    "**1|2026-02-01|P001|Vendor|||TX|SGD|1000.00|90.00|1090.00||**",
    "**1|2026-02-01|S001|Tenant|||SR|SGD|2000.00|180.00|2180.00|**",
    "**IAF.SPEC.ASSUMED**",
  ]);
});

test("document cites the scoped source and evidence files", () => {
  assertDocQuotes(DOC, [
    "test/engine/gst.test.ts",
    "test/engine/gstCodes.test.ts",
    "test/engine/iaf.test.ts",
    "test/engine/independent-verification-gst-reit.test.ts",
    "test/domain/gst/gst.test.ts",
    "test/verify/gst/independent-gst-verifier.test.ts",
    "test/verify/calculators/calculator-verifier.test.ts",
    "src/engine/gst.ts",
    "src/engine/gstCodes.ts",
    "src/engine/iaf.ts",
    "src/domain/gst/index.ts",
    "src/domain/gst/seed.ts",
    "src/app/workspaces/calculators/model.ts",
  ]);
});
