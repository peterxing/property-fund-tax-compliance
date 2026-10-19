import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CALCULATORS, calculatorById, calculatorHash, defaultValues, type CalculatorDefinition, type CalculatorOutput, type CalculatorValues } from "../../../src/app/workspaces/calculators/model.ts";

const expected: Record<string, { summary: RegExp; lines: Record<string, string> }> = {
  "au-transfer-duty": { summary: /A\$798,237/, lines: { "Dutiable value": "A$12,500,000", "Base duty": "A$798,237", "Total duty": "A$798,237" } },
  "au-land-tax": { summary: /A\$116,616/, lines: { "Taxable land value": "A$8,000,000", "General land tax": "A$116,616", "Total tax": "A$116,616" } },
  "au-cgt": { summary: /A\$2,450,000/, lines: { "Cost base": "A$9,850,000", "Gross capital gain": "A$5,150,000", "Net capital gain": "A$2,450,000" } },
  "au-frcgw": { summary: /A\$1,200,000/, lines: { "Threshold": "A$0", "Rate": "15%", "Amount to withhold": "A$1,200,000" } },
  "au-mit-withholding": { summary: /A\$175,000/, lines: { "Total fund payment": "A$1,000,000", "Withholding amount": "A$175,000", "Final tax": "Yes" } },
  "au-div40": { summary: /A\$586,021/, lines: { "2026": "A$240,000", "2027": "A$192,000", "2028": "A$154,021" } },
  "au-div43": { summary: /A\$1,500,000/, lines: { "2026": "A$500,000", "2027": "A$500,000", "2028": "A$500,000" } },
  "au-company-tax": { summary: /A\$825,000/, lines: { "Accounting profit": "A$3,000,000", "Taxable income": "A$2,750,000", "Base rate entity": "No" } },
  "au-borrowing-costs": { summary: /A\$250,000/, lines: { "2026": "A$49,973", "2028": "A$50,110", "2030": "A$49,973" } },
  "sg-stamp-duty": { summary: /S\$8,459,600/, lines: { "BSD": "S$659,600", "ABSD": "S$7,800,000", "Net duty": "S$8,459,600" } },
  "sg-property-tax": { summary: /S\$24,000/, lines: { "Gross tax": "S$24,000", "Rebate": "S$0", "Net tax": "S$24,000" } },
  "sg-withholding-tax": { summary: /S\$150,000/, lines: { "Effective rate": "15%", "Tax": "S$150,000", "Late penalty": "S$7,500" } },
  "sg-cit": { summary: /S\$35,788/, lines: { "Headline rate": "17%", "Exemption": "S$102,500", "Tax payable": "S$35,788" } },
  "sg-gst": { summary: /S\$13,600/, lines: { "Registration basis": "RETROSPECTIVE", "Late filing penalty": "S$600", "Late payment penalty": "S$13,000" } },
  "sg-badges": { summary: /score -10/, lines: { "Outcome": "LIKELY CAPITAL", "Total score": "-10" } },
  "sg-capital-allowances": { summary: /S\$600,000/, lines: { "2027": "S$300,000", "2028": "S$300,000" } },
};

function assertOk(result: CalculatorOutput, label: string): asserts result is Extract<CalculatorOutput, { ok: true }> {
  assert.equal(result.ok, true, label);
}

function visibleText(result: Extract<CalculatorOutput, { ok: true }>): string {
  return [
    result.summary,
    result.headlineLabel,
    result.headlineValue,
    ...result.lines.flatMap((line) => [line.label, line.value, line.note ?? ""]),
    ...(result.schedule ?? []).flatMap((line) => [line.label, line.value, line.note ?? ""]),
    ...result.findings.flatMap((finding) => [finding.id, finding.severity, finding.message]),
    ...result.notes,
  ].join("\n");
}

function mutate(values: CalculatorValues, key: string, value: string | number | boolean): CalculatorValues {
  return { ...values, [key]: value };
}

function invalidScenarios(calculator: CalculatorDefinition): CalculatorValues[] {
  const defaults = defaultValues(calculator);
  const scenarios: CalculatorValues[] = [];
  const moneyOrNumber = calculator.fields.find((field) => field.kind === "money" || field.kind === "number");
  if (moneyOrNumber) {
    scenarios.push(mutate(defaults, moneyOrNumber.key, -1));
    if (calculator.id !== "sg-property-tax") scenarios.push(mutate(defaults, moneyOrNumber.key, 9_000_000_000_000_000));
  }
  const dateFields = calculator.fields.filter((field) => field.kind === "date");
  if (dateFields[0]) scenarios.push(mutate(defaults, dateFields[0].key, ""));
  if (dateFields.length >= 2) {
    scenarios.push({
      ...defaults,
      [dateFields[0].key]: String(defaults[dateFields[1].key]),
      [dateFields[1].key]: String(defaults[dateFields[0].key]),
    });
  }
  return scenarios;
}

function ruleMatches(definition: CalculatorDefinition, id: string): boolean {
  const needle = id.toLowerCase();
  return definition.rules.some((rule) => {
    const ruleId = rule.id.toLowerCase();
    return ruleId === needle || ruleId.includes(needle) || needle.includes(ruleId);
  });
}

describe("calculator verifier: all 16 worked examples and input mapping", () => {
  test("calculator registry contains exactly the scoped calculators", () => {
    assert.equal(CALCULATORS.length, 16);
    assert.deepEqual(CALCULATORS.map((calculator) => calculator.id).sort(), Object.keys(expected).sort());
  });

  for (const calculator of CALCULATORS) {
    test(`${calculator.id} maps UI fields to the engine and matches the independent worked example`, () => {
      const result = calculator.compute(defaultValues(calculator));
      assertOk(result, calculator.id);
      const oracle = expected[calculator.id];
      assert.ok(oracle, calculator.id);
      assert.match(result.summary, oracle.summary);
      for (const [label, value] of Object.entries(oracle.lines)) {
        assert.equal(result.lines.find((line) => line.label === label)?.value, value, `${calculator.id}: ${label}`);
      }
      assert.doesNotMatch(visibleText(result), /\bNaN\b/);
    });

    test(`${calculator.id} invalid, empty, wrong-order and absurdly large inputs never throw or display NaN`, () => {
      for (const values of invalidScenarios(calculator)) {
        let result: CalculatorOutput | undefined;
        assert.doesNotThrow(() => {
          result = calculator.compute(values);
        });
        assert.ok(result, calculator.id);
        if (result.ok) assert.doesNotMatch(visibleText(result), /\bNaN\b/, calculator.id);
        else assert.doesNotMatch(result.message, /\bNaN\b/, calculator.id);
      }
    });

    test(`${calculator.id} hash parameter round-trips`, () => {
      const url = new URL(calculatorHash(calculator.id).replace(/^#/, "http://pfc.local"));
      assert.equal(calculatorById(url.searchParams.get("calc") ?? "").id, calculator.id);
    });
  }
});

describe("calculator verifier: basis rule filtering", () => {
  test("Singapore property tax absurdly large annual value does not display NaN", () => {
    const calculator = calculatorById("sg-property-tax");
    const result = calculator.compute({ ...defaultValues(calculator), annualValue: 9_000_000_000_000_000 });
    assertOk(result, calculator.id);
    assert.doesNotMatch(visibleText(result), /\bNaN\b/);
  });

  test("every reported rule id resolves to a rule exposed by that calculator", () => {
    const mismatches = CALCULATORS.flatMap((calculator) => {
      const result = calculator.compute(defaultValues(calculator));
      assertOk(result, calculator.id);
      return (result.ruleIds ?? []).filter((id) => !ruleMatches(calculator, id)).map((id) => `${calculator.id}:${id}`);
    });
    assert.deepEqual(mismatches, []);
  });

  test("worked examples with multiple candidate rules identify a strict used-rule subset", () => {
    const offenders = CALCULATORS.filter((calculator) => calculator.rules.length > 1).flatMap((calculator) => {
      const result = calculator.compute(defaultValues(calculator));
      assertOk(result, calculator.id);
      const matched = (result.ruleIds ?? []).filter((id) => ruleMatches(calculator, id));
      return matched.length > 0 && matched.length < calculator.rules.length ? [] : [calculator.id];
    });
    assert.deepEqual(offenders, []);
  });
});
