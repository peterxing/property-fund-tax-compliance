import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { RULE_REGISTER_PATH, renderRuleRegister } from "../../scripts/docs/ruleRegister.ts";
import { rulesRegister } from "../../src/domain/portfolio/index.ts";

const file = fileURLToPath(new URL(`../../${RULE_REGISTER_PATH}`, import.meta.url));

test("docs/rules/RULE-REGISTER.md is what the engine's rule register renders (run npm run docs:rules after changing a rule)", () => {
  const onDisk = readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
  assert.equal(onDisk, renderRuleRegister(), "RULE-REGISTER.md is out of date: run `npm run docs:rules`");
});

test("the register lists every rule once, each with at least one dated source", () => {
  const rows = rulesRegister("all").rows;
  const text = renderRuleRegister();
  for (const row of rows) {
    assert.ok(text.includes(`\`${row.id}\``), `${row.id} is listed`);
    assert.ok(row.sources.length > 0, `${row.id} cites a source`);
    for (const source of row.sources) assert.match(source.retrieved, /^\d{4}-\d{2}-\d{2}$/, `${row.id} dates its source`);
  }
  assert.equal(new Set(rows.map((row) => row.registryKey)).size, rows.length, "no rule is listed twice");
});
