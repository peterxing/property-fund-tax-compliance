// Writes the generated parts of the tax documentation: docs/rules/RULE-REGISTER.md from the engine's rule register (ruleRegister.ts) and
// the document index and confidence summary in docs/rules/README.md from the calculation documents (coverageSummary.ts).
// Run with `npm run docs:rules`.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RULE_REGISTER_PATH, renderRuleRegister } from "./ruleRegister.ts";
import { README_PATH, renderReadme } from "./coverageSummary.ts";

const register = fileURLToPath(new URL(`../../${RULE_REGISTER_PATH}`, import.meta.url));
writeFileSync(register, renderRuleRegister(), "utf8");
console.log(`Wrote ${RULE_REGISTER_PATH}`);

const readme = readFileSync(README_PATH, "utf8").replace(/\r\n?/g, "\n");
writeFileSync(README_PATH, renderReadme(readme), "utf8");
console.log("Updated docs/rules/README.md (document index and confidence summary)");
