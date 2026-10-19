// Keeps the tax documentation honest as a set: every calculation document has a test, every worked example is pinned by one, and the
// links between the documents (including links to rules in the generated register) resolve.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { exampleIds, readRuleDoc, ruleDocNames } from "./docText.ts";
import { README_PATH, renderReadme } from "../../scripts/docs/coverageSummary.ts";

const TEST_DIR = fileURLToPath(new URL("./", import.meta.url));
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** Documents that index the others rather than describe a calculation. */
const INDEX_DOCS = new Set(["README.md", "RULE-REGISTER.md"]);
/** Documents whose relative links are checked. */
const LINKED_DOCS = ["README.md", "SECURITY-REVIEW.md", "docs/ARCHITECTURE.md", "docs/DEPLOYMENT.md", "docs/LIMITATIONS.md", "docs/PRODUCT.md", "docs/REFERENCE-PARITY.md", "docs/parity/au.md", "docs/parity/sg.md"];

const calculationDocs = (): string[] => ruleDocNames().filter((name) => !INDEX_DOCS.has(name));

test("every calculation document in docs/rules has its own documentation test", () => {
  const missing = calculationDocs().filter((name) => !existsSync(`${TEST_DIR}${name.replace(/\.md$/, ".test.ts")}`));
  assert.deepEqual(missing, [], "add test/docs/<name>.test.ts for each of these");
});

test("the reviewer's guide (docs/rules/README.md) links every calculation document", () => {
  const guide = readRuleDoc("README.md");
  const unlisted = calculationDocs().filter((name) => !guide.includes(`](${name})`));
  assert.deepEqual(unlisted, [], "list these in docs/rules/README.md");
});

test("the reviewer's guide's document index and confidence summary match the documents (run npm run docs:rules)", () => {
  const onDisk = readFileSync(README_PATH, "utf8").replace(/\r\n?/g, "\n");
  assert.equal(onDisk, renderReadme(onDisk), "docs/rules/README.md is out of date: run `npm run docs:rules`");
});

test("worked example ids are unique across the documents and each one is pinned by a documentation test", () => {
  const owner = new Map<string, string>();
  for (const name of ruleDocNames()) {
    for (const id of exampleIds(readRuleDoc(name))) {
      assert.ok(!owner.has(id), `Example ${id} appears in both ${owner.get(id)} and ${name}`);
      owner.set(id, name);
    }
  }
  const sources = readdirSync(TEST_DIR)
    .filter((file) => file.endsWith(".test.ts") && file !== "coverage.test.ts")
    .map((file) => readFileSync(`${TEST_DIR}${file}`, "utf8"))
    .join("\n");
  const unpinned = [...owner].filter(([id]) => !sources.includes(`"${id}"`)).map(([id, doc]) => `${id} (${doc})`);
  assert.deepEqual(unpinned, [], "every worked example must be recomputed by a test in test/docs");
});

test("relative links in the documentation point at files and register entries that exist", () => {
  const register = readRuleDoc("RULE-REGISTER.md");
  const files = [...ruleDocNames().map((name) => `docs/rules/${name}`), ...LINKED_DOCS];
  const broken: string[] = [];
  for (const file of files) {
    const text = readFileSync(`${ROOT}${file}`, "utf8");
    const base = dirname(`${ROOT}${file}`);
    for (const match of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1]!;
      if (/^(?:[a-z]+:|#)/i.test(target)) continue;
      const [path, anchor] = target.split("#") as [string, string | undefined];
      const absolute = resolve(base, decodeURIComponent(path));
      if (!existsSync(absolute)) {
        broken.push(`${file} → ${target} (no such file)`);
        continue;
      }
      if (anchor && absolute.endsWith("RULE-REGISTER.md") && !register.includes(`id="${anchor}"`)) broken.push(`${file} → ${target} (no such rule in the register)`);
    }
  }
  assert.deepEqual(broken, []);
});
