import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_FUND_GROUPS } from "../../src/app/dev/fixtures.ts";
import { isPlainLeftClick, selectedRailItem, type ClickLike } from "../../src/app/shell/railModel.ts";

describe("selectedRailItem", () => {
  it("finds the selected fund in whichever market group lists it", () => {
    assert.equal(selectedRailItem(FIXTURE_FUND_GROUPS, "southbank")?.fund.name, "Southbank Industrial Partners Fund");
    assert.equal(selectedRailItem(FIXTURE_FUND_GROUPS, "loyang")?.fund.market, "SG");
  });

  it("returns the listed item itself, so its status and exception count come with it", () => {
    const found = selectedRailItem(FIXTURE_FUND_GROUPS, "southbank");
    assert.equal(found, FIXTURE_FUND_GROUPS[0]!.funds[1]);
    assert.equal(found?.status, "In review");
    assert.equal(found?.exceptions, 2);
  });

  it("is null when nothing is selected", () => {
    assert.equal(selectedRailItem(FIXTURE_FUND_GROUPS, null), null);
  });

  it("is null when the selected fund is not in the list (hidden by the persona or the jurisdiction)", () => {
    assert.equal(selectedRailItem(FIXTURE_FUND_GROUPS, "coastline"), null);
  });

  it("matches the whole fund id, not a prefix or the name", () => {
    assert.equal(selectedRailItem(FIXTURE_FUND_GROUPS, "south"), null);
    assert.equal(selectedRailItem(FIXTURE_FUND_GROUPS, "Southbank Industrial Partners Fund"), null);
    assert.equal(selectedRailItem(FIXTURE_FUND_GROUPS, ""), null);
  });

  it("is null for a rail with no groups, and skips a group with no funds", () => {
    assert.equal(selectedRailItem([], "southbank"), null);
    const withEmptyGroup = [{ market: "AU" as const, label: "Australia · AMIT · AUD", funds: [] }, ...FIXTURE_FUND_GROUPS];
    assert.equal(selectedRailItem(withEmptyGroup, "wattle")?.fund.id, "wattle");
  });
});

describe("isPlainLeftClick", () => {
  const click = (changes: Partial<ClickLike> = {}): ClickLike => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...changes });

  it("accepts a primary-button click with no modifier key", () => {
    assert.equal(isPlainLeftClick(click()), true);
  });

  it("rejects every modifier, which opens the link in a new tab or window or downloads it", () => {
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) {
      assert.equal(isPlainLeftClick(click({ [key]: true })), false, key);
    }
  });

  it("rejects a combination of modifiers", () => {
    assert.equal(isPlainLeftClick(click({ ctrlKey: true, shiftKey: true })), false);
  });

  it("rejects the middle and the secondary buttons", () => {
    assert.equal(isPlainLeftClick(click({ button: 1 })), false);
    assert.equal(isPlainLeftClick(click({ button: 2 })), false);
  });
});
