// The audits (audit.ts) on every workspace for every persona: 8 routes x 8 personas, each mounted fresh. The only findings tolerated are the
// ones in allowlist.ts (none at the moment); anything else is a bug in the page, listed with where it is.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALLOWANCES } from "./allowlist.ts";
import { applyAllowances, auditPage, expectClean, type Allowance } from "./audit.ts";
import { mountApp } from "./harness.tsx";
import { PERSONAS } from "./personas.ts";
import { ROUTES } from "./routes.ts";

const used = new Set<Allowance>();
let swept = 0;

for (const persona of PERSONAS) {
  describe(`${persona.name} (${persona.title})`, () => {
    for (const route of ROUTES) {
      it(`${route.label} passes the audits`, async () => {
        const app = await mountApp({ hash: route.hash, user: persona.id });
        const { unexpected, used: matched } = applyAllowances(auditPage(app.container), ALLOWANCES);
        for (const allowance of matched) used.add(allowance);
        swept += 1;
        expectClean(unexpected, `${route.label} as ${persona.name} (${app.hash()})`);
      });
    }
  });
}

describe("the allow-list", () => {
  it("has a reason for every entry, and says which entries nothing matched any more", (t) => {
    for (const allowance of ALLOWANCES) assert.ok(allowance.reason.length > 20, `an allow-list entry needs a reason: ${String(allowance.rule)} ${String(allowance.match)}`);
    const stale = ALLOWANCES.filter((allowance) => !used.has(allowance));
    if (swept === PERSONAS.length * ROUTES.length && stale.length > 0) {
      t.diagnostic(`allow-list entries that matched nothing (delete them): ${stale.map((allowance) => String(allowance.match ?? allowance.rule)).join(", ")}`);
    }
  });
});
