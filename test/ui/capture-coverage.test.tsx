// The reference capture, page by page: every amount, figure, percentage, date and heading it shows must be on our page too, unless
// capture-differences.ts says why not. Each fund is opened as A. Moreno (the capture's persona, all funds, seed data) on its five workspace
// pages, and the Distributions page is read across its review tabs; Bulk review, Analytics and Access are read as portfolio pages.
// What is looked up comes from test/ui/fixtures/capture-*.json (made by scripts/capture-fixtures.mjs from the capture files), so CI
// does not need the reference folder; capture.test.tsx checks the fixtures against it when it is there.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DIFFERENCES, type Difference } from "./capture-differences.ts";
import { FIXTURE_FILES, FUND_PAGES, KINDS, PORTFOLIO_PAGES, has, searchable, type CaptureFixture, type Kind } from "./capture.ts";
import { flatText } from "./dom.ts";
import { mountApp, type MountedApp } from "./harness.tsx";
import { FUNDS } from "./personas.ts";
import { ROUTES } from "./routes.ts";

type Market = "AU" | "SG";

const load = (file: string): CaptureFixture => JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8")) as CaptureFixture;
const FIXTURES: Record<Market, CaptureFixture> = { AU: load(FIXTURE_FILES.AU), SG: load(FIXTURE_FILES.SG) };

// The three portfolio pages are in the Singapore capture file, under "portfolio".
const PORTFOLIO = "portfolio";
const PAGES_PER_FUND = FUND_PAGES.length;

interface Miss {
  kind: Kind;
  token: string;
}
interface PageResult {
  key: string;
  page: string;
  total: number;
  missed: Miss[];
  /** Missing strings by the difference that explains them (a difference can explain several). */
  explained: Array<{ miss: Miss; difference: Difference }>;
  unexplained: Miss[];
}

const results: PageResult[] = [];
const usedDifferences = new Set<Difference>();

const hashOf = (page: string): string => {
  const route = ROUTES.find((candidate) => candidate.label === page);
  assert.ok(route, `no route for the page "${page}"`);
  return route.hash;
};

const mainText = (app: MountedApp): string => flatText(app.$("main"), { ariaHidden: true });

/** What a person sees on the page, as searchable text; for Distributions, the page plus each of its review tabs. */
async function pageText(app: MountedApp, page: string, fundId: string | null): Promise<string> {
  await app.navigate(fundId === null ? hashOf(page) : `${hashOf(page)}?fund=${fundId}`);
  let text = mainText(app);
  if (page === "Distributions") {
    const tabs = app.allByRole("tab");
    assert.ok(tabs.length >= 6, `the review tabs are missing on Distributions of ${fundId}`);
    for (const tab of tabs) {
      await app.click(tab);
      text += `\n${mainText(app)}`;
    }
  }
  return searchable(text);
}

const matches = (difference: Difference, miss: Miss): boolean =>
  difference.kind === miss.kind && (typeof difference.token === "string" ? searchable(difference.token) === searchable(miss.token) : difference.token.test(miss.token));

function compare(market: Market, key: string, page: string, text: string): PageResult {
  const expected = FIXTURES[market].pages[key]?.[page];
  assert.ok(expected, `the ${market} fixture has no "${page}" text for ${key}`);
  const result: PageResult = { key, page, total: 0, missed: [], explained: [], unexplained: [] };
  for (const kind of KINDS) {
    for (const token of expected[kind]) {
      result.total += 1;
      if (has(text, kind, token)) continue;
      const miss: Miss = { kind, token };
      result.missed.push(miss);
      const difference = DIFFERENCES.find((candidate) => candidate.market === market && candidate.pages.includes(page) && (candidate.funds ?? [key]).includes(key) && matches(candidate, miss));
      if (difference) {
        usedDifferences.add(difference);
        result.explained.push({ miss, difference });
      } else {
        result.unexplained.push(miss);
      }
    }
  }
  results.push(result);
  return result;
}

function describeUnexplained(found: PageResult[]): string {
  const lines = found.flatMap((result) => result.unexplained.map((miss) => `  ${result.page} · ${miss.kind}: ${miss.token}`));
  return `${lines.length} captured string(s) are not on our page and have no entry in capture-differences.ts:\n${lines.join("\n")}`;
}

const percent = (part: number, whole: number): string => `${((100 * part) / whole).toFixed(1)}%`;

describe("capture coverage", () => {
  for (const fund of FUNDS) {
    it(`${fund.market} ${fund.name}: what the capture shows is on our pages`, async (t) => {
      const app = await mountApp({ hash: `${hashOf("Distributions")}?fund=${fund.id}`, user: "a-moreno", fund: fund.id });
      const found: PageResult[] = [];
      for (const page of FUND_PAGES) {
        const result = compare(fund.market, fund.id, page, await pageText(app, page, fund.id));
        found.push(result);
        t.diagnostic(`${page}: ${result.total - result.missed.length} of ${result.total} found, ${result.explained.length} explained, ${result.unexplained.length} unexplained`);
      }
      assert.ok(found.every((result) => result.unexplained.length === 0), describeUnexplained(found));
    });
  }

  it("the portfolio pages (Bulk review, Analytics, Access) show what the capture shows", async (t) => {
    const app = await mountApp({ hash: hashOf("Bulk review"), user: "a-moreno", jurisdiction: "all" });
    const found: PageResult[] = [];
    for (const page of PORTFOLIO_PAGES) {
      const result = compare("SG", PORTFOLIO, page, await pageText(app, page, null));
      found.push(result);
      t.diagnostic(`${page}: ${result.total - result.missed.length} of ${result.total} found, ${result.explained.length} explained, ${result.unexplained.length} unexplained`);
    }
    assert.ok(found.every((result) => result.unexplained.length === 0), describeUnexplained(found));
  });

  it("tells one fund from another: Kurrajong's capture is mostly not on Coastline's pages", async () => {
    const app = await mountApp({ hash: `${hashOf("Distributions")}?fund=coastline`, user: "a-moreno", fund: "coastline" });
    const text = await pageText(app, "Distributions", "coastline");
    const wanted = FIXTURES.AU.pages.kurrajong!.Distributions!;
    const absent = wanted.amount.filter((token) => !has(text, "amount", token));
    assert.ok(absent.length > wanted.amount.length / 2, `only ${absent.length} of ${wanted.amount.length} amounts of another fund were missing: the lookup is not discriminating`);
  });

  it("explains every difference with a one-line reason, on a page and a fund that exist", () => {
    for (const difference of DIFFERENCES) {
      const label = `${difference.market} ${difference.pages.join(", ")} ${difference.kind} ${String(difference.token)}`;
      assert.ok(/^\S.{30,}\S$/.test(difference.reason) && !difference.reason.includes("\n"), `${label}: the reason is one line of real words`);
      const pages: readonly string[] = difference.funds?.includes(PORTFOLIO) ? PORTFOLIO_PAGES : FUND_PAGES;
      assert.ok(difference.pages.every((page) => pages.includes(page)), `${label}: not a page of ${difference.funds?.join(", ") ?? "a fund"}`);
      for (const id of difference.funds ?? []) {
        const known = id === PORTFOLIO ? difference.market === "SG" : FUNDS.some((fund) => fund.id === id && fund.market === difference.market);
        assert.ok(known, `${label}: ${id} is not a ${difference.market} fund`);
      }
      assert.ok(typeof difference.token !== "string" || difference.token === difference.token.trim(), `${label}: the token has stray spaces`);
    }
  });
  it("reports the coverage per workspace and keeps capture-differences.ts honest", (t) => {
    if (results.length !== FUNDS.length * PAGES_PER_FUND + PORTFOLIO_PAGES.length) {
      t.skip("needs every capture page above to have been read in this run");
      return;
    }
    const pages = [...FUND_PAGES, ...PORTFOLIO_PAGES];
    const failures: string[] = [];
    let allTotal = 0;
    let allFound = 0;
    let allUnexplained = 0;
    for (const page of pages) {
      const rows = results.filter((result) => result.page === page);
      const total = rows.reduce((sum, row) => sum + row.total, 0);
      const missed = rows.reduce((sum, row) => sum + row.missed.length, 0);
      const unexplained = rows.reduce((sum, row) => sum + row.unexplained.length, 0);
      allTotal += total;
      allFound += total - missed;
      allUnexplained += unexplained;
      t.diagnostic(`${page.padEnd(20)} ${String(total - missed).padStart(5)} of ${String(total).padEnd(5)} on our page: ${percent(total - missed, total).padStart(6)} (${percent(total - unexplained, total)} counting documented differences)`);
      if ((total - missed) / total < 0.95) failures.push(`${page}: only ${percent(total - missed, total)} of the capture is on our pages`);
    }
    t.diagnostic(`${"All workspaces".padEnd(20)} ${String(allFound).padStart(5)} of ${String(allTotal).padEnd(5)} on our page: ${percent(allFound, allTotal).padStart(6)} (${percent(allTotal - allUnexplained, allTotal)} counting documented differences)`);

    for (const difference of DIFFERENCES) {
      if (usedDifferences.has(difference)) continue;
      if (difference.bug) t.diagnostic(`FIXED? "${String(difference.token)}" on ${difference.pages.join(", ")} is now on our page: drop the entry (${difference.reason})`);
      else failures.push(`capture-differences.ts: nothing differs any more for ${difference.market} ${difference.pages.join(", ")} ${difference.kind} ${String(difference.token)}: delete the entry`);
    }
    for (const difference of DIFFERENCES) {
      if (difference.bug && usedDifferences.has(difference)) t.diagnostic(`KNOWN BUG (${difference.market} ${difference.pages.join(", ")}): ${difference.reason}`);
    }
    assert.ok(failures.length === 0, failures.join("\n"));
  });
});
