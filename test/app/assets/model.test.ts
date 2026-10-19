import assert from "node:assert/strict";
import { test } from "node:test";
import { seedData } from "../../../src/domain/seed/index.ts";
import { csvTemplate, parseAssetCsv, registerStatus } from "../../../src/app/workspaces/assets/model.ts";

test("asset register status reports agreement and differences", () => {
  assert.deepEqual(registerStatus([{ agrees: true, difference: 0 }], "AUD"), { tone: "good", text: "Register agrees with the trial balance" });
  const status = registerStatus([{ agrees: false, difference: 12345 }], "AUD");
  assert.equal(status.tone, "warn");
  assert.match(status.text, /A\$123\.45/);
});

test("asset import CSV parser creates market-specific drafts", () => {
  const fund = seedData().funds.find((f) => f.id === "coastline");
  assert.ok(fund);
  const csv = "kind,propertyId,description,cost,startDate,assetClassId,methodOrRegime,effectiveLifeYears\nAU_DIV40,,New HVAC,1200.50,2025-10-01,HVAC_PACKAGED_UNIT,DIMINISHING_VALUE,15";
  const parsed = parseAssetCsv(csv, fund);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.assets.length, 1);
  assert.equal(parsed.assets[0]?.kind, "AU_DIV40");
  assert.equal(parsed.assets[0]?.cost, 120050);

  const pool = parseAssetCsv("kind,propertyId,description,cost,startDate,assetClassId,methodOrRegime,effectiveLifeYears\nAU_DIV40,,Low-cost controller,950,2025-10-01,OTHER_PLANT,LOW_VALUE_POOL,4", fund);
  assert.deepEqual(pool.errors, []);
  assert.equal(pool.assets[0]?.kind, "AU_DIV40");
  assert.equal(pool.assets[0]?.poolMethod, "LOW_VALUE_POOL");
});

test("asset import CSV parser creates Singapore s14N renovation drafts", () => {
  const fund = seedData().funds.find((f) => f.id === "telok-ayer");
  assert.ok(fund);
  const csv = "kind,propertyId,description,cost,startDate,assetClassId,methodOrRegime,effectiveLifeYears\nSG_RR,,Lobby renovation,120000,2026-08-01,,ONE_YEAR,";
  const parsed = parseAssetCsv(csv, fund);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.assets.length, 1);
  assert.equal(parsed.assets[0]?.kind, "SG_RR");
  assert.equal(parsed.assets[0]?.claimMode, "ONE_YEAR");
});

test("asset import CSV parser validates bad rows", () => {
  const auFund = seedData().funds.find((f) => f.id === "coastline");
  const sgFund = seedData().funds.find((f) => f.id === "telok-ayer");
  assert.ok(auFund);
  assert.ok(sgFund);
  const header = "kind,propertyId,description,cost,startDate,assetClassId,methodOrRegime,effectiveLifeYears";
  assert.match(parseAssetCsv(`${header}\nAU_DIV40,,Bad date,100,2026-13-40,OTHER_PLANT,PRIME_COST,10`, auFund).errors.join(" "), /startDate/);
  assert.match(parseAssetCsv(`${header}\nAU_DIV40,,Negative,-1,2026-01-01,OTHER_PLANT,PRIME_COST,10`, auFund).errors.join(" "), /cost/);
  assert.match(parseAssetCsv(`${header}\nNOPE,,Unknown,100,2026-01-01,OTHER_PLANT,PRIME_COST,10`, auFund).errors.join(" "), /kind/);
  assert.match(parseAssetCsv(`${header}\nSG_PLANT,,Wrong market,100,2026-01-01,P_AND_M_GENERAL,S19A_3Y,`, auFund).errors.join(" "), /kind/);
  assert.match(parseAssetCsv(`${header}\nAU_DIV40,,Wrong market,100,2026-01-01,OTHER_PLANT,PRIME_COST,10`, sgFund).errors.join(" "), /kind/);
  assert.match(parseAssetCsv(`${header}\nAU_DIV40,,${"x".repeat(201)},100,2026-01-01,OTHER_PLANT,PRIME_COST,10`, auFund).errors.join(" "), /description/);
  assert.match(parseAssetCsv(`${header}\nAU_DIV40,,Bad life,100,2026-01-01,OTHER_PLANT,PRIME_COST,-1`, auFund).errors.join(" "), /effectiveLifeYears/);
  assert.match(parseAssetCsv(`${header}\nAU_DIV40,,Bad class,100,2026-01-01,NOT_A_CLASS,PRIME_COST,10`, auFund).errors.join(" "), /assetClassId/);
  assert.match(parseAssetCsv(`${header}\nSG_RR,,Bad R&R,100,2026-01-01,,BAD,`, sgFund).errors.join(" "), /THREE_YEAR|ONE_YEAR/);
  assert.match(parseAssetCsv(`${header}\nAU_DIV40,harbourline-harbourline-tower,Wrong property,100,2026-01-01,OTHER_PLANT,PRIME_COST,10`, auFund, seedData().properties).errors.join(" "), /propertyId/);
  const tooMany = `${header}\n${Array.from({ length: 2001 }, (_, i) => `AU_DIV40,,Asset ${i},100,2026-01-01,OTHER_PLANT,PRIME_COST,10`).join("\n")}`;
  assert.match(parseAssetCsv(tooMany, auFund).errors.join(" "), /2,000|2000/);
});

test("asset CSV template is shaped for the selected market", () => {
  const sgFund = seedData().funds.find((f) => f.id === "telok-ayer");
  assert.ok(sgFund);
  const model = csvTemplate(sgFund);
  assert.equal(model.columns[0], "kind");
  assert.equal(model.rows[0]?.[0], "SG_PLANT");
});
