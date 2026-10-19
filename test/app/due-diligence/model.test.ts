import assert from "node:assert/strict";
import test from "node:test";
import { dueDiligenceView } from "../../../src/domain/duediligence/index.ts";
import { seedData } from "../../../src/domain/seed/index.ts";

test("findings CSV has section, status, finding, evidence and link for every finding", () => {
  const data = seedData();
  const user = data.users.find((candidate) => candidate.id === "a-moreno")!;
  const view = dueDiligenceView(data, "harbourline", { now: new Date("2026-10-12T09:00:00Z"), user });
  assert.deepEqual(view.csv.columns, ["Section", "Status", "Finding", "Evidence", "Link"]);
  assert.equal(view.csv.rows.length, view.sections.length);
  for (const [index, section] of view.sections.entries()) {
    assert.equal(view.csv.rows[index]?.[0], section.title);
    assert.equal(view.csv.rows[index]?.[1], section.status);
    assert.equal(view.csv.rows[index]?.[2], section.finding);
    assert.equal(view.csv.rows[index]?.[3], section.evidence.join(" | "));
    assert.match(String(view.csv.rows[index]?.[4]), /^#\/.*fund=harbourline|^#\/\?fund=harbourline/);
  }
});

test("PDF model includes every section plus persona, date and limitations", () => {
  const data = seedData();
  const user = data.users.find((candidate) => candidate.id === "m-castillo")!;
  const view = dueDiligenceView(data, "harbourline", { now: new Date("2026-10-12T09:00:00Z"), user });
  assert.equal(view.doc.title, "Tax due diligence report");
  assert.ok(view.doc.meta?.some((row) => row.label === "Prepared by" && row.value.includes("M. Castillo")));
  assert.ok(view.doc.meta?.some((row) => row.label === "As at" && row.value === "12 Oct 2026"));
  assert.match(view.doc.blocks.map((block) => ("text" in block ? block.text : "")).join(" "), /figures held in this browser/i);
  const table = view.doc.blocks.find((block) => block.kind === "table");
  assert.ok(table && "rows" in table);
  assert.deepEqual(table.rows.map((row) => row.section), view.sections.map((section) => section.title));
});
