import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampLevel, sectionLevels } from "../../src/app/doc/docLevels.ts";

describe("sectionLevels", () => {
  it("puts blocks before any heading at the title's level", () => {
    assert.deepEqual(sectionLevels([{ kind: "paragraph" }, { kind: "table" }], 4), [4, 4]);
  });

  it("opens a section one level below the title for a level-2 heading, and one more for level 3", () => {
    const blocks = [{ kind: "heading", level: 2 }, { kind: "table" }, { kind: "heading", level: 3 }, { kind: "kv" }, { kind: "heading" }, { kind: "list" }];
    assert.deepEqual(sectionLevels(blocks, 3), [4, 4, 5, 5, 4, 4]);
  });

  it("makes each heading its own level and the blocks after it live in that section", () => {
    assert.deepEqual(sectionLevels([{ kind: "heading", level: 2 }, { kind: "paragraph" }], 2), [3, 3]);
  });

  it("handles no blocks", () => {
    assert.deepEqual(sectionLevels([], 4), []);
  });
});

describe("clampLevel", () => {
  it("keeps headings between h2 and h6", () => {
    assert.equal(clampLevel(1), 2);
    assert.equal(clampLevel(2), 2);
    assert.equal(clampLevel(4), 4);
    assert.equal(clampLevel(6), 6);
    assert.equal(clampLevel(9), 6);
  });
});
