import assert from "node:assert/strict";
import test from "node:test";
import { assessBadgesOfTrade, BADGES_OF_TRADE_FACTORS } from "../../src/engine/badgesOfTrade.ts";
import { computeCit } from "../../src/engine/cit.ts";
import { determineEciRequirement, determineReturnForm } from "../../src/engine/returns.ts";
import { money } from "../../src/domain/format.ts";
import { assertExampleQuotes, assertSectionQuotes, exampleIds, readRuleDoc, tableRow } from "./docText.ts";

const doc = "sg-income-tax";
const D = (dollars: number) => dollars * 100;
const sgd = (cents: number) => money(cents, "SGD", 2);

test("sg-income-tax worked examples match the engine", () => {
  assert.deepEqual(exampleIds(readRuleDoc(doc)), ["CIT-1", "PTE-1", "BOT-1"]);

  const cit = computeCit({ ya: 2026, normalChargeableIncome: D(500_000), startUpExemption: false, isActiveCompany: true, localEmployeeCount: 1 });
  assertExampleQuotes(doc, "CIT-1", [
    sgd(cit.exemptionAmount),
    sgd(cit.chargeableIncomeAfterExemption),
    sgd(cit.taxBeforeRebate),
    sgd(cit.rebateCashGrant),
    sgd(cit.rebate),
    sgd(cit.taxPayable),
    money(cit.taxPayable, "SGD", 0),
  ]);

  const pte = computeCit({ ya: 2027, normalChargeableIncome: D(100_000), startUpExemption: false });
  assert.equal(pte.findings[0]?.id, "CIT.REBATE_NOT_VERIFIED");
  assertExampleQuotes(doc, "PTE-1", [
    sgd(pte.exemptionAmount),
    sgd(pte.chargeableIncomeAfterExemption),
    sgd(pte.taxBeforeRebate),
    sgd(pte.rebate),
    sgd(pte.taxPayable),
    "CIT.REBATE_NOT_VERIFIED",
  ]);

  const badges = assessBadgesOfTrade({
    factors: {
      MOTIVE: { lean: "STRONGLY_TRADING" },
      FREQUENCY: { lean: "TRADING" },
      HOLDING_PERIOD: { lean: "TRADING" },
      SUPPLEMENTARY_WORK: { lean: "TRADING" },
      CIRCUMSTANCES_OF_SALE: { lean: "TRADING" },
    },
  });
  assertExampleQuotes(doc, "BOT-1", [String(badges.totalScore), badges.outcome, "decision-support heuristic only"]);
});

test("sg-income-tax rate and threshold tables quote code-derived rows", () => {
  const pte2026 = computeCit({ ya: 2026, normalChargeableIncome: D(500_000), startUpExemption: false });
  const pte2019 = computeCit({ ya: 2019, normalChargeableIncome: D(500_000), startUpExemption: false });
  const sute2026 = computeCit({ ya: 2026, normalChargeableIncome: D(500_000), startUpExemption: true });
  const sute2019 = computeCit({ ya: 2019, normalChargeableIncome: D(500_000), startUpExemption: true });
  const rebate2026 = computeCit({ ya: 2026, normalChargeableIncome: D(1_000_000), isActiveCompany: true, localEmployeeCount: 1 });

  assertSectionQuotes(doc, "Corporate income tax rates and thresholds", [
    tableRow(["CIT-HEADLINE", "From YA 2022", `${pte2026.headlineRateBps / 100}% headline corporate tax rate`, "`cit.rate-and-exemptions.2022-plus`"]),
    tableRow(["PTE-2020+ cap", "YA 2020 onward", `Maximum exemption ${sgd(pte2026.exemptionScheme.maxExemptAmount)}`, "`cit.rate-and-exemptions.2022-plus`"]),
    tableRow(["PTE-pre-2020 cap", "YA 2019 and earlier in code", `Maximum exemption ${sgd(pte2019.exemptionScheme.maxExemptAmount)}`, "`cit.rate-and-exemptions.2022-plus`"]),
    tableRow(["SUTE-2020+ cap", "YA 2020 onward", `Maximum exemption ${sgd(sute2026.exemptionScheme.maxExemptAmount)}`, "`cit.rate-and-exemptions.2022-plus`"]),
    tableRow(["SUTE-pre-2020 cap", "YA 2019 and earlier in code", `Maximum exemption ${sgd(sute2019.exemptionScheme.maxExemptAmount)}`, "`cit.rate-and-exemptions.2022-plus`"]),
    tableRow(["Rebate YA2026", "YA 2026", `50% of tax before rebate, cap S$40,000.00, cash grant ${sgd(rebate2026.rebateCashGrant)} where active-company and local-employee tests pass`, "`cit.rebates.2024-2026`"]),
  ]);
});

test("sg-income-tax return and badges tables quote code-derived rows", () => {
  const lite = determineReturnForm({ kind: "PROPERTY_COMPANY", isSingaporeIncorporated: true, annualRevenue: D(200_000), onlyIncomeTaxedAt17Percent: true, financialYearEnd: "2026-06-30" });
  const cs = determineReturnForm({ kind: "PROPERTY_COMPANY", isSingaporeIncorporated: true, annualRevenue: D(5_000_000), onlyIncomeTaxedAt17Percent: true, financialYearEnd: "2026-06-30" });
  const formUt = determineReturnForm({ kind: "REIT", isSingaporeIncorporated: false, annualRevenue: D(5_000_001), financialYearEnd: "2026-12-31", hasSection43_2ReitTreatment: true });
  const eci = determineEciRequirement({ kind: "PROPERTY_COMPANY", isSingaporeIncorporated: true, annualRevenue: D(5_000_000), financialYearEnd: "2026-06-30", onlyIncomeTaxedAt17Percent: true }, 0);
  assert.equal(lite.form, "FORM_C_S_LITE");
  assert.equal(cs.form, "FORM_C_S");
  assert.equal(formUt.form, "FORM_UT");
  assert.equal(eci.waived, true);
  assertSectionQuotes(doc, "Income tax computation rates and thresholds", [
    tableRow(["Form C-S Lite revenue cap", "Company return selection", "Annual revenue ≤ S$200,000.00", "`returns.forms-and-eci.2022-plus`"]),
    tableRow(["Form C-S revenue cap", "Company return selection and ECI waiver", "Annual revenue ≤ S$5,000,000.00", "`returns.forms-and-eci.2022-plus`"]),
    tableRow(["REIT trustee Form UT due date", "Section 43(2) REIT trustee", "15 April of the YA", "`cit.reit-trustee-prevailing-rate.2025-plus`"]),
    tableRow(["ECI waiver", "Ordinary company ECI", "Annual revenue ≤ S$5,000,000.00 and ECI before exemption is nil", "`returns.forms-and-eci.2022-plus`"]),
  ]);

  const leanScore = { STRONGLY_CAPITAL: -2, CAPITAL: -1, NEUTRAL: 0, TRADING: 1, STRONGLY_TRADING: 2 } as const;
  assertSectionQuotes(doc, "Badges scoring table", [
    ...BADGES_OF_TRADE_FACTORS.map((factor) => tableRow([
      factor.label,
      factor.weight,
      factor.weight * leanScore.STRONGLY_CAPITAL,
      factor.weight * leanScore.CAPITAL,
      factor.weight * leanScore.NEUTRAL,
      factor.weight * leanScore.TRADING,
      factor.weight * leanScore.STRONGLY_TRADING,
    ])),
    tableRow(["Likely capital threshold", "n/a", "total score ≤ -8", "", "", "", ""]),
    tableRow(["Likely trading threshold", "n/a", "", "", "", "", "total score ≥ 8"]),
  ]);
});
