import { test } from "node:test";
import assert from "node:assert/strict";
import { OWNER_OCCUPIED_RESIDENTIAL_TYPES, PROPERTY_TAX_USAGES, computePropertyTax, reconcilePropertyTax } from "../../src/engine/propertyTax.ts";

test("computePropertyTax handles 2025 owner-occupier residential rates and rebate", () => {
  const result = computePropertyTax({
    year: 2025,
    segments: [
      {
        id: "home",
        from: "2025-01-01",
        to: "2025-12-31",
        annualValue: 3_600_000,
        usage: "OWNER_OCCUPIED_RESIDENTIAL",
        residentialType: "PRIVATE",
      },
    ],
    notice: { kind: "ANNUAL_BILL", noticeDate: "2025-01-01" },
  });
  assert.equal(result.grossTax, 96_000);
  assert.equal(result.rebate, 14_400);
  assert.equal(result.netTax, 81_600);
  assert.equal(result.deadlines.paymentDueDate, "2025-01-31");
});

test("computePropertyTax handles 2024 non-owner-occupier residential rates", () => {
  const result = computePropertyTax({
    year: 2024,
    segments: [{ id: "rental", from: "2024-01-01", to: "2024-12-31", annualValue: 3_600_000, usage: "NON_OWNER_OCCUPIED_RESIDENTIAL" }],
  });
  assert.equal(result.grossTax, 480_000);
  assert.equal(result.rebate, 0);
});

test("computePropertyTax uses the 10% rule for non-residential or vacant property", () => {
  const result = computePropertyTax({
    year: 2026,
    segments: [{ id: "land", from: "2026-01-01", to: "2026-12-31", annualValue: 2_000_000, usage: "NON_RESIDENTIAL_OR_VACANT" }],
    notice: { kind: "VALUATION_NOTICE", noticeDate: "2026-02-10" },
  });
  assert.equal(result.grossTax, 200_000);
  assert.equal(result.deadlines.objectionDueDate, "2026-03-12");
});

test("reconcilePropertyTax flags billing differences", () => {
  const computed = computePropertyTax({
    year: 2025,
    segments: [{ id: "home", from: "2025-01-01", to: "2025-12-31", annualValue: 3_600_000, usage: "OWNER_OCCUPIED_RESIDENTIAL", residentialType: "PRIVATE" }],
  });
  const match = reconcilePropertyTax(computed, { grossTax: 96_000, rebate: 14_400, netTax: 81_600 });
  assert.equal(match.matches, true);
  const mismatch = reconcilePropertyTax(computed, { netTax: 150_000 });
  assert.equal(mismatch.matches, false);
});

test("property-tax UI catalogues cover all supported ids", () => {
  assert.deepEqual(
    PROPERTY_TAX_USAGES.map((item) => item.id).sort(),
    ["NON_OWNER_OCCUPIED_RESIDENTIAL", "NON_RESIDENTIAL_OR_VACANT", "OWNER_OCCUPIED_RESIDENTIAL"],
  );
  assert.deepEqual(
    OWNER_OCCUPIED_RESIDENTIAL_TYPES.map((item) => item.id).sort(),
    ["HDB_1_2_ROOM", "HDB_3_ROOM", "HDB_4_ROOM", "HDB_5_ROOM", "HDB_EXECUTIVE", "OTHER_OWNER_OCCUPIED", "PRIVATE"],
  );
});
