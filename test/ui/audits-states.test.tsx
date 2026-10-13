// More states of the shell under the audits (audit.ts): every fund in every fund workspace, the jurisdiction filter on the pages it changes
// (including the empty states of a persona with nothing to see) and every tab of the workspaces that have tabs. The allow-list is the one of
// the main sweep (allowlist.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALLOWANCES } from "./allowlist.ts";
import { applyAllowances, auditPage, expectClean } from "./audit.ts";
import { expectAuditsClean } from "./expect.ts";
import { mountApp } from "./harness.tsx";
import { FUNDS, PERSONAS } from "./personas.ts";
import { ROUTES } from "./routes.ts";

async function expectPageClean(options: Parameters<typeof mountApp>[0], context: string): Promise<void> {
  const app = await mountApp(options);
  expectClean(applyAllowances(auditPage(app.container), ALLOWANCES).unexpected, `${context} (${app.hash()})`);
}

describe("every fund in every fund workspace (as A. Moreno, who sees them all)", () => {
  for (const fund of FUNDS) {
    describe(`${fund.name} (${fund.market}, ${fund.status})`, () => {
      for (const route of ROUTES.filter((r) => r.scope === "fund")) {
        it(`${route.label} passes the audits`, async () => {
          await expectPageClean({ hash: `${route.hash}${route.hash.includes("?") ? "&" : "?"}fund=${fund.id}`, user: "a-moreno" }, `${route.label} for ${fund.name}`);
        });
      }
    });
  }
});

describe("the jurisdiction filter", () => {
  for (const persona of PERSONAS) {
    describe(`${persona.name} (${persona.title})`, () => {
      for (const jurisdiction of ["AU", "SG"] as const) {
        for (const route of ROUTES.filter((r) => ["Distributions", "Bulk review", "Analytics"].includes(r.label))) {
          it(`${route.label} with ${jurisdiction} selected passes the audits`, async () => {
            await expectPageClean({ hash: route.hash, user: persona.id, jurisdiction }, `${route.label} as ${persona.name} with ${jurisdiction}`);
          });
        }
      }
    });
  }
});

// The tabs are found on each page, so a tab or a workspace that gains tabs later is audited without a change here. One fund per market and status
// keeps the run short; every fund is audited on its default tab above.
describe("every tab of the fund workspaces (as A. Moreno)", () => {
  for (const fund of FUNDS.filter((candidate) => ["southbank", "telok-ayer", "harbourline"].includes(candidate.id))) {
    it(`${fund.name} (${fund.market}, ${fund.status}): choosing each tab selects it, is written to the hash and passes the audits`, async () => {
      let tabsAudited = 0;
      for (const route of ROUTES.filter((r) => r.scope === "fund")) {
        const app = await mountApp({ user: "a-moreno", hash: `${route.hash}${route.hash.includes("?") ? "&" : "?"}fund=${fund.id}` });
        const count = app.allByRole("tab").length;
        for (let index = 0; index < count; index++) {
          const tab = app.allByRole("tab")[index]!;
          const name = (tab.textContent ?? "").trim();
          await app.click(tab);
          const where = `${route.label} for ${fund.name}, tab "${name}"`;
          const selected = app.allByRole("tab").filter((candidate) => candidate.getAttribute("aria-selected") === "true");
          assert.equal(selected.length, 1, `${where}: exactly one tab is selected`);
          assert.equal((selected[0]?.textContent ?? "").trim(), name, `${where}: the tab that was chosen is the selected one`);
          assert.match(app.hash(), /[?&]tab=[a-z-]+/, `${where}: the tab is in the hash`);
          expectAuditsClean(app, where);
          tabsAudited++;
        }
        await app.unmount();
      }
      assert.ok(tabsAudited > 0, "at least one fund workspace has tabs");
    });
  }
});
