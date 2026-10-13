// Rebuilds test/ui/fixtures/capture-au.json and capture-sg.json from the reference capture, which lives outside the repository.
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs scripts/capture-fixtures.mjs <folder with pfc-ref-text-*.decoded.json>
// The folder may also come from PFC_CAPTURE_DIR. Only the strings the capture-coverage test looks for are kept, never the pages themselves.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_FILES, fixturesFromFolder, stringifyFixture } from "../test/ui/capture.ts";

const folder = process.argv[2] ?? process.env.PFC_CAPTURE_DIR;
if (!folder) {
  console.error("Say where the reference capture is: scripts/capture-fixtures.mjs <folder> (or set PFC_CAPTURE_DIR).");
  process.exit(1);
}

const target = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "ui", "fixtures");
mkdirSync(target, { recursive: true });
const fixtures = fixturesFromFolder(resolve(folder));
for (const market of ["AU", "SG"]) {
  const text = stringifyFixture(fixtures[market]);
  writeFileSync(join(target, FIXTURE_FILES[market]), text);
  console.log(`${FIXTURE_FILES[market]}: ${text.length} characters`);
}
