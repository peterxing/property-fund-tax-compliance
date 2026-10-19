import assert from "node:assert/strict";
import test from "node:test";
import { CAPITAL_ALLOWANCE_REGIMES, computeCapitalAllowances } from "../../src/engine/capitalAllowances.ts";
import { money } from "../../src/domain/format.ts";
import { assertExampleQuotes, assertSectionQuotes, exampleIds, readRuleDoc, tableRow } from "./docText.ts";

const doc = "sg-capital-allowances";
const D = (dollars: number) => dollars * 100;
const sgd = (cents: number) => money(cents, "SGD", 2);

test("sg-capital-allowances worked examples match the engine", () => {
  assert.deepEqual(exampleIds(readRuleDoc(doc)), ["CA-1", "CA-2", "R14N-1"]);

  const ca = computeCapitalAllowances({
    fromYa: 2026,
    toYa: 2029,
    financialYearEndMonth: 6,
    financialYearEndDay: 30,
    assets: [{ id: "fitout", label: "Fit-out plant", regime: "S19A_3Y", cost: D(900_000), acquisitionDate: "2025-07-01", disposalDate: "2028-06-30", disposalProceeds: D(100_000) }],
  });
  const first = ca.assetLines.find((line) => line.ya === 2027)!;
  const second = ca.assetLines.find((line) => line.ya === 2028)!;
  const disposal = ca.assetLines.find((line) => line.ya === 2029 && line.note === "Balancing adjustment on disposal")!;
  assertExampleQuotes(doc, "CA-1", [
    sgd(first.allowanceClaimed),
    sgd(first.closingTaxWrittenDownValue),
    sgd(second.allowanceClaimed),
    sgd(second.closingTaxWrittenDownValue),
    sgd(disposal.openingTaxWrittenDownValue),
    sgd(D(100_000)),
    sgd(disposal.balancingAllowance),
  ]);

  const low = computeCapitalAllowances({
    fromYa: 2026,
    toYa: 2026,
    financialYearEndMonth: 6,
    financialYearEndDay: 30,
    assets: [
      { id: "a", label: "Low-value asset A", regime: "S19A_1Y_LOW_VALUE", cost: D(30_000), acquisitionDate: "2025-06-30" },
      { id: "b", label: "Low-value asset B", regime: "S19A_1Y_LOW_VALUE", cost: D(5_000), acquisitionDate: "2025-06-30" },
    ],
  });
  assert.equal(low.findings[0]?.id, "CA.LOW_VALUE_ASSET.LIMIT");
  assertExampleQuotes(doc, "CA-2", [sgd(D(5_000)), "CA.LOW_VALUE_ASSET.LIMIT"]);

  const rr = computeCapitalAllowances({
    fromYa: 2026,
    toYa: 2028,
    financialYearEndMonth: 12,
    financialYearEndDay: 31,
    assets: [],
    renovationExpenditures: [{ id: "rr", label: "Lobby refresh", cost: D(360_000), incurredDate: "2025-03-01", claimMode: "THREE_YEAR" }],
  });
  assert.equal(rr.findings[0]?.id, "CA.S14N.CAP");
  assertExampleQuotes(doc, "R14N-1", [sgd(D(360_000)), sgd(D(300_000)), "CA.S14N.CAP", sgd(rr.yaSummaries[0]!.section14nDeduction), sgd(rr.yaSummaries[1]!.section14nDeduction), sgd(rr.yaSummaries[2]!.section14nDeduction)]);
});

test("sg-capital-allowances tables quote code-derived regimes and thresholds", () => {
  const regime = (id: string) => CAPITAL_ALLOWANCE_REGIMES.find((item) => item.id === id)!;
  assertSectionQuotes(doc, "Capital allowance rates and thresholds", [
    tableRow(["Section 19 working life", "20% initial allowance if not disabled, then remaining cost equally over 6, 12 or 16 years", "elected/prescribed life buckets: 6 / 12 / 16 years", "`capital-allowances.s19-s19a.2022-plus`"]),
    tableRow([regime("S19A_3Y").label, "Equal whole-dollar allocation over 3 YAs", "1/3, 1/3, 1/3", "`capital-allowances.s19-s19a.2022-plus`"]),
    tableRow([regime("S19A_2Y").label, "Whole-dollar allocation by weights 75 / 25", "allowed acquisition YAs in code: 2021, 2022, 2024; otherwise warning", "`capital-allowances.s19-s19a.2022-plus`"]),
    tableRow(["Low-value asset one-year", "Whole rounded cost in one YA when within caps", "asset cost ≤ S$5,000.00; annual cap S$30,000.00", "`capital-allowances.s19-s19a.2022-plus`"]),
    tableRow(["IBA", "25% initial allowance, remainder over 25 years", "25% IA, 25-year AA schedule", "`capital-allowances.iba-lia-s19b.2022-plus`"]),
  ]);

  assertSectionQuotes(doc, "Section 14N rates and thresholds", [
    tableRow(["R14N cap", "Each relevant three-year period", "S$300,000.00", "`capital-allowances.s14n.2022-plus`"]),
    tableRow(["R14N three-year mode", "Default before YA 2025 unless one-year selected and allowed", "Equal whole-dollar allocation over 3 consecutive YAs", "`capital-allowances.s14n.2022-plus`"]),
    tableRow(["R14N one-year mode", "YA 2021, YA 2022, YA 2024 and YA 2025 onward", "100% in incurred YA", "`capital-allowances.s14n.2022-plus`"]),
    tableRow(["R14N investment holding", "Investment holding company / PROPERTY_FUND in code", "Deduction denied with warning `CA.S14N.INVESTMENT_HOLDING`", "`capital-allowances.s14n.2022-plus`"]),
  ]);
});
