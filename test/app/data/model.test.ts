import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../../../src/domain/store.ts";
import { seedData } from "../../../src/domain/seed/index.ts";
import {
  BACKUP_APP,
  MAX_BACKUP_BYTES,
  backupEnvelope,
  backupFileProblem,
  backupFileName,
  backupText,
  dataFromBackup,
  holdersTemplate,
  parseHoldersCsv,
  parseBackupText,
  parsePropertiesCsv,
  propertiesTemplate,
  restoreSummary,
} from "../../../src/app/workspaces/data/model.ts";

test("holder CSV parser reads AU and SG rows and reports readable problems", () => {
  assert.deepEqual(parseHoldersCsv("holder,country,units,auStatus\nA Holder,Australia,100,resident", "AU"), [
    { holder: "A Holder", country: "Australia", units: 100, auStatus: "resident" },
  ]);
  assert.deepEqual(parseHoldersCsv("holder,country,units,sgClass\nS Holder,Singapore,200,qualifying", "SG"), [
    { holder: "S Holder", country: "Singapore", units: 200, sgClass: "qualifying" },
  ]);
  assert.equal(parseHoldersCsv("holder,country,units,auStatus\nBad,Australia,x,resident", "AU"), "Line 2: units must be a whole number of zero or more.");
  assert.match(holdersTemplate("AU"), /auStatus/);
});

test("holder CSV parser handles BOM, quotes, duplicates, unknown classes and wrong-market rows", () => {
  assert.deepEqual(parseHoldersCsv('\uFEFFholder,country,units,auStatus\n"Quoted, Holder",Australia,"1,000",resident', "AU"), [
    { holder: "Quoted, Holder", country: "Australia", units: 1000, auStatus: "resident" },
  ]);
  assert.equal(parseHoldersCsv("holder,country,units,auStatus\nA,Australia,1,resident\nA,Australia,2,resident", "AU"), "Line 3: holder A appears more than once.");
  assert.equal(parseHoldersCsv("holder,country,units,auStatus\nA,Australia,1,unknown", "AU"), "Line 2: auStatus must be resident, foreign-eoi or foreign-non-eoi.");
  assert.equal(parseHoldersCsv("holder,country,units,auStatus\nA,Australia,1,resident", "SG"), "Line 2: sgClass must be individual, qualifying, nrni, nr-fund or other.");
  const many = ["holder,country,units,sgClass", ...Array.from({ length: 2001 }, (_, i) => `H${i},Singapore,1,qualifying`)].join("\n");
  assert.equal(parseHoldersCsv(many, "SG"), "The CSV can have up to 2,000 rows.");
});

test("property CSV parser reads cents from decimal amounts", () => {
  assert.deepEqual(parsePropertiesCsv("name,location,acquired,cost,improvements,capitalWorksClaimed,valuation\nTower,Sydney,2024-01-01,10.25,2,1,20"), [
    { name: "Tower", location: "Sydney", acquired: "2024-01-01", cost: 1025, improvements: 200, capitalWorksClaimed: 100, valuation: 2000 },
  ]);
  assert.equal(parsePropertiesCsv("name,location,acquired,cost,valuation\nTower,Sydney,not-a-date,1,2"), "Line 2: name, location and acquired (YYYY-MM-DD) are required.");
  assert.match(propertiesTemplate(), /capitalWorksClaimed/);
});

test("property CSV parser handles quotes, duplicates and 2,000-row limit", () => {
  assert.deepEqual(parsePropertiesCsv('name,location,acquired,cost,valuation\n"Tower, One","Sydney, NSW",2024-01-01,1,2'), [
    { name: "Tower, One", location: "Sydney, NSW", acquired: "2024-01-01", cost: 100, improvements: 0, capitalWorksClaimed: 0, valuation: 200 },
  ]);
  assert.equal(parsePropertiesCsv("name,location,acquired,cost,valuation\nTower,Sydney,2024-01-01,1,2\nTower,Sydney,2024-01-01,1,2"), "Line 3: property Tower appears more than once.");
  const many = ["name,location,acquired,cost,valuation", ...Array.from({ length: 2001 }, (_, i) => `P${i},Sydney,2024-01-01,1,2`)].join("\n");
  assert.equal(parsePropertiesCsv(many), "The CSV can have up to 2,000 rows.");
});

test("backup wrapper round trips through store.importData and refuses wrong wrappers", () => {
  const data = seedData();
  const now = new Date("2026-10-17T00:00:00.000Z");
  const envelope = backupEnvelope(data, now);
  assert.equal(envelope.app, BACKUP_APP);
  assert.equal(backupFileName(now), "pfc-backup-2026-10-17.json");
  assert.equal(dataFromBackup({ ...envelope, app: "other" }), "This is not a Property Fund Tax Compliance backup.");
  const parsed = JSON.parse(backupText(data, now));
  const restored = dataFromBackup(parsed);
  assert.notEqual(typeof restored, "string");
  const store = createStore({ storage: null });
  assert.equal(store.importData(restored), null);
  assert.deepEqual(store.getState().data, data);
  assert.match(restoreSummary(data), /AU funds, 4 SG funds/);
});

test("backup wrapper accepts bare AppData and refuses old versions, hostile keys and oversize files", () => {
  const data = seedData();
  assert.deepEqual(dataFromBackup(data), data);
  assert.equal(dataFromBackup({ app: BACKUP_APP, version: 1, exportedAt: "2026-10-17T00:00:00.000Z", data }), "This backup was made by another data version.");
  assert.equal(parseBackupText('{"app":"property-fund-tax-compliance","version":2,"data":{"constructor":{}}}'), "The backup contains a field name that is not allowed (__proto__, constructor or prototype).");
  assert.equal(parseBackupText("{not json"), "The file is not valid JSON.");
  assert.equal(backupFileProblem({ size: MAX_BACKUP_BYTES + 1 }), "The file is larger than 8 MB.");
  assert.equal(backupFileProblem({ size: MAX_BACKUP_BYTES }), null);
});
