// Helpers for the documentation tests. The tax rule documents in docs/rules quote worked examples and rate tables; the tests under
// test/docs recompute every quoted figure with the engine and check that the document says the same thing, so a change to a rate or a
// formula cannot leave the documentation behind.
//
// Conventions the documents follow (docs/rules/README.md, "How the documents are checked"):
//   * A worked example is a heading "### Example <ID>: <title>", where <ID> is upper case with at least one hyphen (AMIT-1, LT-NSW-2).
//     Its section runs to the next heading of the same or a higher level.
//   * Any other section is found by its exact heading text.
//   * Quotes are compared after collapsing whitespace, so table padding and line wrapping do not matter.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const RULE_DOCS_DIR = fileURLToPath(new URL("../../docs/rules/", import.meta.url));

const EXAMPLE_HEADING = /^(#{2,6})\s+Example\s+([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)(?=[:\s]|$)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const cache = new Map<string, string>();

/** The text of docs/rules/<name> (name with or without ".md"). */
export function readRuleDoc(name: string): string {
  const file = name.endsWith(".md") ? name : `${name}.md`;
  let text = cache.get(file);
  if (text === undefined) {
    text = readFileSync(`${RULE_DOCS_DIR}${file}`, "utf8").replace(/\r\n?/g, "\n");
    cache.set(file, text);
  }
  return text;
}

/** Every markdown file in docs/rules. */
export function ruleDocNames(): string[] {
  return readdirSync(RULE_DOCS_DIR).filter((name) => name.endsWith(".md")).sort();
}

/** Lines with their heading level (0 for non-headings); lines inside fenced code blocks are never headings. */
function lines(markdown: string): Array<{ text: string; level: number; title: string }> {
  let fenced = false;
  return markdown.split("\n").map((text) => {
    if (/^\s*(```|~~~)/.test(text)) {
      fenced = !fenced;
      return { text, level: 0, title: "" };
    }
    if (fenced) return { text, level: 0, title: "" };
    const heading = HEADING.exec(text);
    return heading ? { text, level: heading[1]!.length, title: heading[2]! } : { text, level: 0, title: "" };
  });
}

function sectionFrom(markdown: string, matches: (line: { level: number; title: string; text: string }) => boolean, what: string): string {
  const all = lines(markdown);
  const starts = all.flatMap((line, index) => (line.level > 0 && matches(line) ? [index] : []));
  assert.equal(starts.length, 1, `${what}: expected exactly one heading, found ${starts.length}`);
  const start = starts[0]!;
  const level = all[start]!.level;
  let end = all.length;
  for (let i = start + 1; i < all.length; i++) {
    if (all[i]!.level > 0 && all[i]!.level <= level) {
      end = i;
      break;
    }
  }
  return all.slice(start, end).map((line) => line.text).join("\n");
}

/** The ids of the worked examples in a document, in order. */
export function exampleIds(markdown: string): string[] {
  return lines(markdown).flatMap((line) => {
    const match = line.level > 0 ? EXAMPLE_HEADING.exec(line.text) : null;
    return match ? [match[2]!] : [];
  });
}

/** The section of a worked example: its heading through to the next heading of the same or a higher level. */
export function exampleSection(markdown: string, id: string): string {
  return sectionFrom(markdown, (line) => EXAMPLE_HEADING.exec(line.text)?.[2] === id, `Example ${id}`);
}

/** The section under the heading whose text is exactly `title` (without the leading #s). */
export function headingSection(markdown: string, title: string): string {
  return sectionFrom(markdown, (line) => line.title === title, `Heading "${title}"`);
}

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

function assertQuotes(where: string, text: string, quotes: readonly string[]): void {
  const haystack = squash(text);
  const missing = quotes.filter((quote) => !haystack.includes(squash(quote)));
  assert.deepEqual(missing, [], `${where} does not quote: ${missing.map((quote) => JSON.stringify(quote)).join(", ")}`);
}

/** Every quote appears in the worked example `id` of docs/rules/<doc>. */
export function assertExampleQuotes(doc: string, id: string, quotes: readonly string[]): void {
  assertQuotes(`docs/rules/${doc} Example ${id}`, exampleSection(readRuleDoc(doc), id), quotes);
}

/** Every quote appears in the section under the heading `title` of docs/rules/<doc>. */
export function assertSectionQuotes(doc: string, title: string, quotes: readonly string[]): void {
  assertQuotes(`docs/rules/${doc} section "${title}"`, headingSection(readRuleDoc(doc), title), quotes);
}

/** Every quote appears somewhere in docs/rules/<doc>. */
export function assertDocQuotes(doc: string, quotes: readonly string[]): void {
  assertQuotes(`docs/rules/${doc}`, readRuleDoc(doc), quotes);
}

/** A markdown table row from its cells: "| a | b |". Use it to check a rate table row the test has rendered from the engine. */
export function tableRow(cells: readonly (string | number)[]): string {
  return `| ${cells.map(String).join(" | ")} |`;
}
