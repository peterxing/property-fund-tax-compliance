import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PATH,
  FUND_SCOPED_PARAMS,
  GALLERY_PATH,
  ROUTES,
  buildHash,
  parseHash,
  resolveFundId,
  routeDef,
  routeForFund,
  routeLabel,
  sameRoute,
  withParams,
} from "../../src/app/router.ts";

describe("ROUTES", () => {
  it("lists the workspaces in nav order with unique paths and ids", () => {
    assert.deepEqual(
      ROUTES.map((r) => r.label),
      [
        "Distributions",
        "Trial balance",
        "Tax returns",
        "Investor reporting",
        "Cost base & CGT",
        "GST & BAS",
        "Property taxes",
        "Assets & allowances",
        "Compare",
        "Due diligence",
        "Bulk review",
        "Analytics",
        "Compliance calendar",
        "Risk register",
        "Calculators",
        "Rules & sources",
        "Data",
        "Access",
      ],
    );
    assert.equal(new Set(ROUTES.map((r) => r.path)).size, ROUTES.length);
    assert.equal(new Set(ROUTES.map((r) => r.id)).size, ROUTES.length);
    assert.ok(ROUTES.every((r) => r.path.startsWith("/")));
  });

  it("scopes the first ten to a fund and the last eight to the portfolio", () => {
    assert.deepEqual(
      ROUTES.map((r) => r.scope),
      ["fund", "fund", "fund", "fund", "fund", "fund", "fund", "fund", "fund", "fund", "portfolio", "portfolio", "portfolio", "portfolio", "portfolio", "portfolio", "portfolio", "portfolio"],
    );
  });

  it("finds a definition by path", () => {
    assert.equal(routeDef("/analytics")?.id, "analytics");
    assert.equal(routeDef("/nope"), undefined);
  });
});

describe("parseHash", () => {
  it("treats an empty hash as Distributions", () => {
    for (const hash of ["", "#", "#/", "/", "#//"]) assert.deepEqual(parseHash(hash), { path: "/", params: {} }, JSON.stringify(hash));
  });

  it("reads each workspace path", () => {
    for (const route of ROUTES) assert.equal(parseHash(`#${route.path}`).path, route.path);
  });

  it("falls back to Distributions for an unknown path", () => {
    assert.deepEqual(parseHash("#/no-such-page?fund=wattle"), { path: DEFAULT_PATH, params: { fund: "wattle" } });
  });

  it("ignores case, a trailing slash and repeated slashes in the path", () => {
    assert.equal(parseHash("#/Trial-Balance/").path, "/trial-balance");
    assert.equal(parseHash("#//analytics").path, "/analytics");
  });

  it("reads fund and tab params", () => {
    assert.deepEqual(parseHash("#/trial-balance?fund=southbank&tab=checks"), {
      path: "/trial-balance",
      params: { fund: "southbank", tab: "checks" },
    });
  });

  it("keeps the first of a repeated param and drops empty ones", () => {
    assert.deepEqual(parseHash("#/?fund=a&fund=b&tab=&holder").params, { fund: "a" });
  });

  it("decodes percent-encoded values", () => {
    assert.equal(parseHash("#/?holder=Sakuragawa%20Life%20%26%20Co").params.holder, "Sakuragawa Life & Co");
  });

  it("never throws on malformed input", () => {
    assert.doesNotThrow(() => parseHash("#/%E0%A4%A?fund=%E0%A4%A"));
    assert.equal(parseHash("#/%E0%A4%A").path, "/");
    assert.doesNotThrow(() => parseHash(undefined as unknown as string));
  });

  it("accepts the gallery path only when asked", () => {
    assert.equal(parseHash("#/_gallery").path, "/");
    assert.equal(parseHash("#/_gallery", { gallery: false }).path, "/");
    assert.equal(parseHash("#/_gallery", { gallery: true }).path, GALLERY_PATH);
    assert.equal(parseHash("#/analytics", { gallery: true }).path, "/analytics");
  });
});

describe("buildHash", () => {
  it("builds a bare path", () => {
    assert.equal(buildHash({ path: "/" }), "#/");
    assert.equal(buildHash({ path: "/analytics", params: {} }), "#/analytics");
    assert.equal(buildHash({ path: "analytics" }), "#/analytics");
  });

  it("puts fund and tab first and sorts the rest", () => {
    assert.equal(buildHash({ path: "/", params: { z: "1", tab: "checks", a: "2", fund: "wattle" } }), "#/?fund=wattle&tab=checks&a=2&z=1");
  });

  it("omits empty, null and undefined values", () => {
    assert.equal(buildHash({ path: "/", params: { fund: "wattle", tab: "", holder: null, notice: undefined } }), "#/?fund=wattle");
  });

  it("encodes keys and values", () => {
    assert.equal(buildHash({ path: "/", params: { holder: "A & B" } }), "#/?holder=A%20%26%20B");
  });

  it("round-trips through parseHash", () => {
    const routes = [
      { path: "/", params: {} },
      { path: "/trial-balance", params: { fund: "telok-ayer", tab: "book-to-tax" } },
      { path: "/investor-reporting", params: { fund: "harbourline", holder: "Sakuragawa Life & Co", notice: "n/1" } },
      { path: "/access", params: { tab: "audit log" } },
    ] as const;
    for (const route of routes) {
      const parsed = parseHash(buildHash(route));
      assert.equal(parsed.path, route.path);
      assert.deepEqual(parsed.params, route.params);
    }
  });

  it("is stable: building a parsed hash gives the same hash", () => {
    const hash = "#/tax-returns?fund=loyang&tab=form-ut&x=1";
    assert.equal(buildHash(parseHash(hash)), hash);
    assert.equal(buildHash(parseHash("#/tax-returns?x=1&tab=form-ut&fund=loyang")), hash);
  });
});

describe("routeForFund", () => {
  it("keeps the workspace and tab and sets the fund", () => {
    assert.deepEqual(routeForFund({ path: "/trial-balance", params: { tab: "checks", fund: "wattle" } }, "loyang"), {
      path: "/trial-balance",
      params: { tab: "checks", fund: "loyang" },
    });
  });

  it("drops params that only belong to the previous fund", () => {
    const from = { path: "/investor-reporting", params: { fund: "wattle", holder: "h-12", notice: "n-3", tab: "notices" } } as const;
    const next = routeForFund(from, "kurrajong");
    assert.deepEqual(next.params, { tab: "notices", fund: "kurrajong" });
    for (const key of FUND_SCOPED_PARAMS) assert.ok(!(key in next.params));
  });

  it("does not mutate the route it was given", () => {
    const from = { path: "/" as const, params: { fund: "a", holder: "x" } };
    routeForFund(from, "b");
    assert.deepEqual(from.params, { fund: "a", holder: "x" });
  });
});

describe("withParams", () => {
  const base = { path: "/" as const, params: { fund: "wattle", tab: "withholding" } };

  it("sets and replaces params", () => {
    assert.deepEqual(withParams(base, { tab: "checks", holder: "h-1" }).params, { fund: "wattle", tab: "checks", holder: "h-1" });
  });

  it("removes a param given null, undefined or an empty string", () => {
    assert.deepEqual(withParams(base, { tab: null }).params, { fund: "wattle" });
    assert.deepEqual(withParams(base, { tab: undefined, fund: "" }).params, {});
  });

  it("leaves the original alone", () => {
    withParams(base, { tab: "x" });
    assert.equal(base.params.tab, "withholding");
  });
});

describe("resolveFundId", () => {
  const visible = ["harbourline", "southbank", "telok-ayer"];

  it("uses the hash fund when the persona can see it", () => {
    assert.equal(resolveFundId("southbank", "harbourline", visible), "southbank");
  });

  it("matches the hash fund ignoring case", () => {
    assert.equal(resolveFundId("Telok-Ayer", null, visible), "telok-ayer");
  });

  it("falls back to the first visible fund when the hash fund is hidden or unknown", () => {
    assert.equal(resolveFundId("wattle", "southbank", visible), "harbourline");
    assert.equal(resolveFundId("nope", null, visible), "harbourline");
  });

  it("uses the store selection when the hash has no fund", () => {
    assert.equal(resolveFundId(null, "telok-ayer", visible), "telok-ayer");
    assert.equal(resolveFundId(undefined, "southbank", visible), "southbank");
  });

  it("ignores a store selection the persona cannot see", () => {
    assert.equal(resolveFundId(null, "wattle", visible), "harbourline");
    assert.equal(resolveFundId("", null, visible), "harbourline");
  });

  it("returns null when nothing is visible", () => {
    assert.equal(resolveFundId("southbank", "southbank", []), null);
    assert.equal(resolveFundId(null, null, []), null);
  });
});

describe("sameRoute and routeLabel", () => {
  it("compares routes by their canonical hash", () => {
    assert.ok(sameRoute({ path: "/", params: { fund: "a", tab: "b" } }, { path: "/", params: { tab: "b", fund: "a" } }));
    assert.ok(sameRoute({ path: "/", params: { tab: "" } }, { path: "/", params: {} }));
    assert.ok(!sameRoute({ path: "/", params: { fund: "a" } }, { path: "/", params: { fund: "b" } }));
    assert.ok(!sameRoute({ path: "/", params: {} }, { path: "/analytics", params: {} }));
  });

  it("names every route", () => {
    assert.equal(routeLabel("/"), "Distributions");
    assert.equal(routeLabel("/cost-base"), "Cost base & CGT");
    assert.equal(routeLabel("/data"), "Data");
    assert.equal(routeLabel(GALLERY_PATH), "Design gallery");
  });
});
