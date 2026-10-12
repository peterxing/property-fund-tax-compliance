import { test } from "node:test";
import assert from "node:assert/strict";
import { BADGES_OF_TRADE_FACTORS, assessBadgesOfTrade } from "../../src/engine/badgesOfTrade.ts";

test("assessBadgesOfTrade can lean clearly capital", () => {
  const result = assessBadgesOfTrade({
    factors: {
      MOTIVE: { lean: "STRONGLY_CAPITAL", facts: ["Board paper said long-term investment yield"] },
      HOLDING_PERIOD: { lean: "CAPITAL", facts: ["Held for many years before sale"] },
      FREQUENCY: { lean: "CAPITAL", facts: ["Isolated disposal"] },
      SUPPLEMENTARY_WORK: { lean: "NEUTRAL" },
    },
  });
  assert.equal(result.outcome, "LIKELY_CAPITAL");
  assert.ok(result.totalScore < 0);
});

test("assessBadgesOfTrade can lean clearly trading", () => {
  const result = assessBadgesOfTrade({
    factors: {
      MOTIVE: { lean: "STRONGLY_TRADING", facts: ["Acquisition memo targeted quick resale profit"] },
      FREQUENCY: { lean: "TRADING", facts: ["Repeated similar flips"] },
      HOLDING_PERIOD: { lean: "TRADING", facts: ["Short holding period"] },
      SUPPLEMENTARY_WORK: { lean: "TRADING", facts: ["Subdivision and active marketing"] },
      CONNECTION_WITH_TRADE: { lean: "TRADING", facts: ["Taxpayer is already in the property trade"] },
    },
  });
  assert.equal(result.outcome, "LIKELY_TRADING");
  assert.ok(result.reasons.length > 0);
});

test("assessBadgesOfTrade warns when too few factors are supplied", () => {
  const result = assessBadgesOfTrade({
    factors: {
      MOTIVE: { lean: "NEUTRAL" },
      HOLDING_PERIOD: { lean: "CAPITAL" },
    },
  });
  assert.equal(result.findings.some((finding) => finding.id === "BADGES_OF_TRADE.SPARSE_FACT_PATTERN"), true);
});

test("badges-of-trade factor catalogue covers all supported keys and five lean options", () => {
  assert.deepEqual(
    BADGES_OF_TRADE_FACTORS.map((factor) => factor.key).sort(),
    ["CIRCUMSTANCES_OF_SALE", "CONNECTION_WITH_TRADE", "FINANCING", "FREQUENCY", "HOLDING_PERIOD", "MOTIVE", "ORGANISATION", "SUPPLEMENTARY_WORK"],
  );
  for (const factor of BADGES_OF_TRADE_FACTORS) {
    assert.equal(factor.options.length, 5);
    assert.deepEqual(
      factor.options.map((option) => option.lean).sort(),
      ["CAPITAL", "NEUTRAL", "STRONGLY_CAPITAL", "STRONGLY_TRADING", "TRADING"],
    );
  }
});
