// Renders the document index and the confidence summary in docs/rules/README.md from the calculation documents themselves (their title,
// worked examples and "At a glance" table), so the reviewer's guide cannot disagree with the documents. Written by `npm run docs:rules`;
// test/docs/coverage.test.ts fails when the README is out of date.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const RULE_DOCS_DIR = fileURLToPath(new URL("../../docs/rules/", import.meta.url));
export const README_PATH = `${RULE_DOCS_DIR}README.md`;
export const GENERATED_START = "<!-- BEGIN GENERATED: document index and confidence summary (npm run docs:rules) -->";
export const GENERATED_END = "<!-- END GENERATED -->";

const INDEX_DOCS = new Set(["README.md", "RULE-REGISTER.md"]);
/** Reading order: Australia then Singapore, distributions first, as a reviewer would usually work. */
const ORDER = [
  "au-amit-distributions.md",
  "au-land-tax.md",
  "au-duties.md",
  "au-capital-allowances.md",
  "au-cgt.md",
  "au-gst.md",
  "au-income-tax.md",
  "sg-reit-distributions.md",
  "sg-property-tax.md",
  "sg-stamp-duty.md",
  "sg-capital-allowances.md",
  "sg-income-tax.md",
  "sg-withholding-tax.md",
  "sg-gst.md",
];

interface GlanceRow {
  calculation: string;
  where: string;
  confidence: string;
}

interface CalculationDoc {
  file: string;
  title: string;
  examples: number;
  rows: GlanceRow[];
}

const cells = (line: string): string[] => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());

function glance(file: string, text: string): GlanceRow[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === "## At a glance");
  if (start < 0) throw new Error(`${file} has no "## At a glance" section`);
  const table: string[][] = [];
  for (let i = start + 1; i < lines.length && !/^#{1,2} /.test(lines[i]!); i++) if (lines[i]!.trim().startsWith("|")) table.push(cells(lines[i]!));
  const [header, , ...body] = table;
  if (!header || header[0] !== "Calculation" || header[1] !== "Where in the app" || header.at(-1) !== "Confidence") {
    throw new Error(`${file}: the "At a glance" table must have the columns Calculation | Where in the app | … | Confidence`);
  }
  return body.map((row) => ({ calculation: row[0]!, where: row[1]!, confidence: row.at(-1)! }));
}

export function calculationDocs(): CalculationDoc[] {
  const files = readdirSync(RULE_DOCS_DIR).filter((name) => name.endsWith(".md") && !INDEX_DOCS.has(name));
  const unknown = files.filter((file) => !ORDER.includes(file));
  if (unknown.length > 0) throw new Error(`Add ${unknown.join(", ")} to ORDER in scripts/docs/coverageSummary.ts`);
  return ORDER.filter((file) => files.includes(file)).map((file) => {
    const text = readFileSync(`${RULE_DOCS_DIR}${file}`, "utf8").replace(/\r\n?/g, "\n");
    const title = /^# (.+)$/m.exec(text)?.[1]?.trim() ?? file;
    const examples = text.split("\n").filter((line) => /^#{2,6}\s+Example\s+[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+(?=[:\s]|$)/.test(line)).length;
    return { file, title, examples, rows: glance(file, text) };
  });
}

/**
 * The grade to show for a confidence cell: the weakest grade the cell mentions, so a mixed cell ("A for the formula; B for the roll-forward")
 * is summarised as B. A leading range such as "C/D" is kept as written.
 */
function gradeOf(confidence: string): string {
  if (/^not modelled/i.test(confidence)) return "Not modelled";
  const range = /^([A-D])\s*\/\s*([A-D])\b/.exec(confidence);
  if (range) return `${range[1]}/${range[2]}`;
  const letters = [...confidence.matchAll(/(?:^|[;,/]\s*|\(\s*)([A-D])(?=[\s;,/)]|$)/g)].map((match) => match[1]!);
  return letters.length > 0 ? letters.sort().at(-1)! : "See document";
}

export function renderGeneratedSection(): string {
  const docs = calculationDocs();
  const out: string[] = [GENERATED_START, "", "### Documents", "", "| Document | Market | Calculations | Worked examples |", "| --- | --- | ---: | ---: |"];
  for (const doc of docs) out.push(`| [${doc.title}](${doc.file}) | ${doc.file.startsWith("au-") ? "Australia" : "Singapore"} | ${doc.rows.length} | ${doc.examples} |`);
  const totalRows = docs.reduce((sum, doc) => sum + doc.rows.length, 0);
  const totalExamples = docs.reduce((sum, doc) => sum + doc.examples, 0);
  out.push(`| **All** | | **${totalRows}** | **${totalExamples}** |`, "");
  out.push("### Confidence by calculation", "", "Copied from each document's **At a glance** table; the document explains each grade and what a reviewer should confirm. Where a calculation has parts with different grades, **Grade** shows the weakest and **Detail** gives the split.", "");
  const grades = docs.flatMap((doc) => doc.rows.map((row) => gradeOf(row.confidence)));
  const count = (grade: string) => grades.filter((g) => g === grade || g.endsWith(`/${grade}`)).length;
  out.push(`Across the ${grades.length} calculations: **A** ${count("A")}, **B** ${count("B")}, **C** ${count("C")}, **D** ${count("D")} (a C/D range counts as D).`, "");
  out.push("| Calculation | Where in the app | Grade | Detail | Document |", "| --- | --- | --- | --- | --- |");
  for (const doc of docs) {
    for (const row of doc.rows) {
      const grade = gradeOf(row.confidence);
      const detail = row.confidence.replace(/\s+/g, " ") === grade ? "" : row.confidence;
      out.push(`| ${row.calculation} | ${row.where} | **${grade}** | ${detail} | [${doc.file}](${doc.file}) |`);
    }
  }
  out.push("", GENERATED_END);
  return out.join("\n");
}

/** The README with its generated section replaced by the current rendering. */
export function renderReadme(current: string): string {
  const start = current.indexOf(GENERATED_START);
  const end = current.indexOf(GENERATED_END);
  if (start < 0 || end < start) throw new Error(`docs/rules/README.md must contain the markers ${GENERATED_START} … ${GENERATED_END}`);
  return `${current.slice(0, start)}${renderGeneratedSection()}${current.slice(end + GENERATED_END.length)}`;
}
