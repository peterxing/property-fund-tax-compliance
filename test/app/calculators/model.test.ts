import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { CALCULATORS, calculatorById, calculatorCsv, calculatorHash, defaultValues, rulesForResult, type CalculatorDefinition, type CalculatorOutput, type CalculatorValues } from "../../../src/app/workspaces/calculators/model.ts";

const cases: Array<{ id: string; summary: RegExp; expected: Array<[string, string]> }> = [
  // Source: AU transferDuty.ts primary SRO/Revenue NSW/QRO rule tables. Arithmetic: NSW 2026 $12.5m residential uses premium schedule -> $798,237 base, no foreign surcharge.
  { id: "au-transfer-duty", summary: /A\$798,237/, expected: [["Total duty", "A$798,237"], ["Foreign surcharge duty", "A$0"]] },
  // Source: AU landTax.ts state land-tax rule tables. Arithmetic: NSW trust $8.0m taxable value -> $116,616 general land tax, no surcharge.
  { id: "au-land-tax", summary: /A\$116,616/, expected: [["General land tax", "A$116,616"], ["Total tax", "A$116,616"]] },
  // Source: AU CGT ATO cost-base/discount rules. Arithmetic: $15.0m - ($10.0m + $0.35m - $0.5m) = $5.15m; less $0.25m losses; 50% discount = $2.45m net.
  { id: "au-cgt", summary: /A\$2,450,000/, expected: [["Cost base", "A$9,850,000"], ["Net capital gain", "A$2,450,000"]] },
  // Source: AU FRCGW Subdiv 14-D rules. Arithmetic: 2026 direct real property, no clearance, nil threshold, 15% x $8.0m = $1.2m.
  { id: "au-frcgw", summary: /A\$1,200,000/, expected: [["Rate", "15%"], ["Amount to withhold", "A$1,200,000"]] },
  // Source: AU MIT withholding ATO fund-payment rules. Arithmetic: $700k ordinary @15% + $100k clean @10% + $200k NCMI @30% = $175k, blended 17.5%.
  { id: "au-mit-withholding", summary: /A\$175,000/, expected: [["Total fund payment", "A$1,000,000"], ["Withholding amount", "A$175,000"]] },
  // Source: AU Div 40 ATO decline-in-value rules. Arithmetic: diminishing value 200%/10 years on $1.2m = $240k; then 20% x $960k = $192k; leap-year apportionment gives $154,021.
  { id: "au-div40", summary: /A\$586,021/, expected: [["2026", "A$240,000"], ["2028", "A$154,021"]] },
  // Source: AU Div 43 ATO capital works rates. Arithmetic: commercial $20.0m x 2.5% = $500k each full income year.
  { id: "au-div43", summary: /A\$1,500,000/, expected: [["2026", "A$500,000"], ["2028", "A$500,000"]] },
  // Source: AU companyTax.ts ATO company-rate rules. Arithmetic: $4.0m rent - $1.0m expenses - $0.25m losses = $2.75m; passive income >80%, 30% tax = $825k.
  { id: "au-company-tax", summary: /A\$825,000/, expected: [["Taxable income", "A$2,750,000"], ["Base rate entity", "No"]] },
  // Source: AU borrowingCosts.ts ATO s25-25 rules. Arithmetic: $250k spread over five actual-day income years; leap year receives $50,110 and totals $250k.
  { id: "au-borrowing-costs", summary: /A\$250,000/, expected: [["2028", "A$50,110"], ["2030", "A$49,973"]] },
  // Source: IRAS BSD/ABSD stamp-duty rates. Arithmetic: $12.0m residential BSD = $659,600; entity ABSD 65% x $12.0m = $7.8m; total $8,459,600.
  { id: "sg-stamp-duty", summary: /S\$8,459,600/, expected: [["BSD", "S$659,600"], ["ABSD", "S$7,800,000"]] },
  // Source: IRAS property-tax non-residential 10% rule. Arithmetic: $240k annual value x 10% = $24k, no rebate.
  { id: "sg-property-tax", summary: /S\$24,000/, expected: [["Gross tax", "S$24,000"], ["Net tax", "S$24,000"]] },
  // Source: IRAS Section 45 WHT and penalty rules. Arithmetic: interest WHT 15% x $1.0m = $150k; late penalty 5% + 1% = $9k.
  { id: "sg-withholding-tax", summary: /S\$150,000/, expected: [["Tax", "S$150,000"], ["Late penalty", "S$9,000"]] },
  // Source: IRAS CIT rate/exemption/rebate page. Arithmetic: $500k - $102.5k PTE = $397.5k; 17% = $67,575; 50% rebate less $2k cash grant effect = $31,788; payable $35,788.
  { id: "sg-cit", summary: /S\$35,788/, expected: [["Exemption", "S$102,500"], ["Tax payable", "S$35,788"]] },
  // Source: IRAS GST registration and late-payment pages. Arithmetic: retrospective turnover $1.2m > $1.0m; filing $600; payment $100k x (5% + 8%) = $13k.
  { id: "sg-gst", summary: /S\$13,600/, expected: [["Registration basis", "RETROSPECTIVE"], ["Late payment penalty", "S$13,000"]] },
  // Source: IRAS badges-of-trade guidance. Arithmetic: capital leans on three weighted factors: -4 -3 -3 = -10, threshold <= -8 means likely capital.
  { id: "sg-badges", summary: /score -10/, expected: [["Outcome", "LIKELY CAPITAL"], ["Total score", "-10"]] },
  // Source: IRAS capital-allowance s19A 3-year rules. Arithmetic: $900k asset acquired in basis period for YA2027, $300k each for YA2027 and YA2028 in displayed range.
  { id: "sg-capital-allowances", summary: /S\$600,000/, expected: [["2027", "S$300,000"], ["2028", "S$300,000"]] },
];

function invalidValues(calculator: CalculatorDefinition): CalculatorValues {
  const values = defaultValues(calculator);
  const field = calculator.fields.find((candidate) => candidate.kind === "select") ?? calculator.fields.find((candidate) => candidate.kind === "money" || candidate.kind === "number") ?? calculator.fields.find((candidate) => candidate.kind === "date");
  assert.notEqual(field, undefined, calculator.id);
  if (!field) return values;
  if (field.kind === "select") return { ...values, [field.key]: "__not-an-option__" };
  if (field.kind === "date") return { ...values, [field.key]: "not-a-date" };
  return { ...values, [field.key]: (field.min ?? 0) - 1 };
}

function textOf(result: Extract<CalculatorOutput, { ok: true }>): string {
  return [
    result.summary,
    result.headlineLabel,
    result.headlineValue,
    ...result.lines.flatMap((line) => [line.label, line.value, line.note ?? ""]),
    ...(result.schedule ?? []).flatMap((line) => [line.label, line.value, line.note ?? ""]),
  ].join("\n");
}

function mutateAllFields(calculator: CalculatorDefinition, value: string | number): CalculatorValues {
  const values = defaultValues(calculator);
  for (const field of calculator.fields) {
    if (field.kind === "money" || field.kind === "number" || field.kind === "date" || field.kind === "select" || field.kind === "text") {
      values[field.key] = value;
    }
  }
  return values;
}

test("calculator registry has the expected coverage", () => {
  assert.equal(CALCULATORS.length, 16);
  assert.equal(cases.length, CALCULATORS.length);
});

describe("calculator worked examples", () => {
  for (const item of cases) {
    it(`${item.id} computes the hand-checked example and rejects invalid input`, () => {
      const calculator = calculatorById(item.id);
      const result = calculator.compute(defaultValues(calculator));
      assert.equal(result.ok, true, calculator.name);
      if (!result.ok) return;
      assert.match(result.summary, item.summary, calculator.name);
      for (const [label, value] of item.expected) {
        const actual: string | undefined = result.lines.find((line) => line.label === label)?.value;
        assert.equal(actual, value, `${calculator.name}: ${label}`);
      }
      assert.ok(calculator.rules.every((rule) => rule.id.length > 0 && rule.sources.length > 0), calculator.name);
      const rules = rulesForResult(calculator, result);
      assert.ok(rules.length > 0, `${calculator.name}: basis rules`);
      if (calculator.id === "au-transfer-duty" || calculator.id === "au-land-tax") {
        const state = String(defaultValues(calculator).state).toLowerCase();
        assert.ok(rules.every((rule) => rule.id.includes(`.${state}.`)), `${calculator.name}: no other state rules`);
      } else if (calculator.market === "SG") {
        assert.ok(rules.every((rule) => !rule.id.startsWith("au-")), `${calculator.name}: no AU rules`);
      } else {
        assert.ok(rules.every((rule) => rule.id.startsWith("au-")), `${calculator.name}: AU domain rules`);
      }
      assert.ok(calculatorCsv(calculator, result).rows.length >= result.lines.length + 1, calculator.name);
      const invalid = calculator.compute(invalidValues(calculator));
      assert.equal(invalid.ok, false, calculator.name);
      if (!invalid.ok) assert.match(invalid.message, /allowed range|valid option|valid date/i, calculator.name);
    });
  }
});

test("extreme fuzz inputs never throw or render NaN/Infinity", () => {
  for (const calculator of CALCULATORS) {
    for (const extreme of [0, -1, 1_000_000_000_000_000, 10_000_000_000_000_000, ""]) {
      let result: CalculatorOutput | undefined;
      assert.doesNotThrow(() => {
        result = calculator.compute(mutateAllFields(calculator, extreme));
      }, `${calculator.id}: ${String(extreme)}`);
      assert.ok(result, calculator.id);
      const text = result.ok ? textOf(result) : result.message;
      assert.doesNotMatch(text, /\b(?:NaN|Infinity)\b/, `${calculator.id}: ${String(extreme)}`);
    }
  }
});

test("calculator deep-link parameter round trips", () => {
  for (const calculator of CALCULATORS) {
    const url = new URL(calculatorHash(calculator.id).replace(/^#/, "http://pfc.local"));
    assert.equal(calculatorById(url.searchParams.get("calc") ?? "").id, calculator.id);
  }
});
