import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { validatePersisted } from "../../src/domain/core/schema.ts";
import { defaultUi, seedData } from "../../src/domain/seed/index.ts";
import {
  accessView,
  analyticsView,
  bulkRows,
  costBaseView,
  fundCalc,
  fundGroups,
  investorView,
  returnView,
  statementDoc,
  tbView,
  visibleFunds,
  workbookModel,
  workflowView,
} from "../../src/domain/selectors.ts";
import { STORAGE_KEY, createStore } from "../../src/domain/store.ts";
import { FEATURE_PROVIDERS } from "../../src/domain/providers.ts";
import { gstLedgerView, gstPeriods, gstReturnView } from "../../src/domain/gst/index.ts";
import { dutiesView, propertyTaxKpis, propertyTaxView } from "../../src/domain/ptax/index.ts";
import { assetRegisterView, registerVsTrialBalance } from "../../src/domain/assets/index.ts";
import { lastSignOffVersion, versionDiff } from "../../src/domain/governance/versions.ts";
import { calendarView, riskRegister } from "../../src/domain/portfolio/index.ts";
import { compareSources } from "../../src/domain/compare/index.ts";
import type { StorageLike } from "../../src/domain/store.ts";
import type { AppData, JurisdictionFilter, Persisted } from "../../src/domain/types.ts";

const NOW = new Date("2026-10-13T11:30:00");
const JURISDICTIONS: JurisdictionFilter[] = ["all", "AU", "SG"];
const OPTIONAL_VIEW_FIELDS = new Set(["emphasis"]);
const BAD_TEXT = /\bNaN\b|\bundefined\b|\bInfinity\b/;
const MUTATIONS = 220;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };

function state(): Persisted {
  return { data: seedData(), ui: defaultUi() };
}

function storageWith(raw: string | null): StorageLike {
  return { getItem: (key) => (key === STORAGE_KEY ? raw : null), setItem: () => undefined, removeItem: () => undefined };
}

function load(raw: string | null): Persisted {
  return createStore({ storage: storageWith(raw), now: () => NOW }).getState();
}

function scan(value: unknown, path = "view", problems: string[] = [], depth = 0): string[] {
  if (problems.length >= 8) return problems;
  if (depth > 50) return problems.concat(`${path} too deep`);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) problems.push(`${path} is ${value}`);
    return problems;
  }
  if (typeof value === "string") {
    if (BAD_TEXT.test(value)) problems.push(`${path} contains ${value}`);
    return problems;
  }
  if (typeof value === "undefined") problems.push(`${path} is undefined`);
  if (value === null || typeof value !== "object") return problems;
  if (Array.isArray(value)) value.forEach((v, i) => scan(v, `${path}[${i}]`, problems, depth + 1));
  else for (const [k, v] of Object.entries(value)) if (!(v === undefined && OPTIONAL_VIEW_FIELDS.has(k))) scan(v, `${path}.${k}`, problems, depth + 1);
  return problems;
}

function sweep(data: AppData): string[] {
  const out: string[] = [];
  const look = (name: string, fn: () => unknown) => {
    try {
      out.push(...scan(fn(), name));
    } catch (e) {
      out.push(`${name} threw ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    }
  };
  for (const fund of data.funds) {
    look(`fundCalc ${fund.id}`, () => fundCalc(data, fund.id, NOW));
    look(`tbView ${fund.id}`, () => tbView(data, fund.id, NOW));
    const ctx = { user: data.users[0], now: NOW };
    look(`returnView ${fund.id}`, () => returnView(data, fund.id, ctx));
    look(`investorView ${fund.id}`, () => investorView(data, fund.id, ctx));
    look(`costBaseView ${fund.id}`, () => costBaseView(data, fund.id, ctx));
    look(`workflowView ${fund.id}`, () => workflowView(data, fund.id, ctx));
    for (const holder of data.holders.filter((h) => h.fundId === fund.id)) look(`statementDoc ${holder.id}`, () => statementDoc(data, fund.id, holder.id, NOW));
    // v2 feature selectors and providers: a damaged-but-accepted state must render in every one of them too
    look(`gstPeriods ${fund.id}`, () => gstPeriods(data, fund, NOW));
    look(`gstReturnView ${fund.id}`, () => gstReturnView(data, fund.id, null, ctx));
    for (const period of gstPeriods(data, fund, NOW)) look(`gstReturnView ${fund.id} ${period.end}`, () => gstReturnView(data, fund.id, period.end, ctx));
    look(`gstLedgerView ${fund.id}`, () => gstLedgerView(data, fund.id));
    look(`propertyTaxView ${fund.id}`, () => propertyTaxView(data, fund.id, ctx));
    look(`dutiesView ${fund.id}`, () => dutiesView(data, fund.id, ctx));
    look(`propertyTaxKpis ${fund.id}`, () => propertyTaxKpis(data, fund.id, ctx));
    look(`assetRegisterView ${fund.id}`, () => assetRegisterView(data, fund.id, ctx));
    look(`registerVsTrialBalance ${fund.id}`, () => registerVsTrialBalance(data, fund.id, ctx));
    look(`compareSources ${fund.id}`, () => compareSources(data, fund.id, ctx));
    const signOff = lastSignOffVersion(data, fund.id);
    if (signOff) look(`versionDiff ${fund.id}`, () => versionDiff(data, signOff, "current", NOW));
    for (const provider of FEATURE_PROVIDERS) {
      if (provider.deadlines) look(`deadlines:${provider.id} ${fund.id}`, () => provider.deadlines!(data, fund, NOW));
      if (provider.risks) look(`risks:${provider.id} ${fund.id}`, () => provider.risks!(data, fund, NOW));
      if (provider.compareSources) look(`compareSources:${provider.id} ${fund.id}`, () => provider.compareSources!(data, fund, NOW));
    }
  }
  for (const user of data.users) {
    const ctx = { user, now: NOW };
    look(`accessView ${user.id}`, () => accessView(data, ctx));
    for (const jurisdiction of JURISDICTIONS) {
      look(`bulkRows ${user.id} ${jurisdiction}`, () => bulkRows(data, ctx, jurisdiction));
      look(`analyticsView ${user.id} ${jurisdiction}`, () => analyticsView(data, ctx, jurisdiction));
      look(`workbookModel ${user.id} ${jurisdiction}`, () => workbookModel(data, ctx, jurisdiction));
      look(`fundGroups ${user.id} ${jurisdiction}`, () => fundGroups(data, ctx, jurisdiction));
      look(`visibleFunds ${user.id} ${jurisdiction}`, () => visibleFunds(data, user, jurisdiction));
      look(`calendarView ${user.id} ${jurisdiction}`, () => calendarView(data, ctx, jurisdiction, { showCompleted: true }));
      look(`riskRegister ${user.id} ${jurisdiction}`, () => riskRegister(data, ctx, jurisdiction));
    }
  }
  return out;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function jsonPointers(root: Json): Array<{ parent: Json[] | Obj; key: string | number; value: Json; path: string }> {
  const slots: Array<{ parent: Json[] | Obj; key: string | number; value: Json; path: string }> = [];
  const walk = (value: Json, path: string) => {
    if (value === null || typeof value !== "object") return;
    const keys = Array.isArray(value) ? [...value.keys()] : Object.keys(value);
    for (const key of keys) {
      const child = (value as Record<string | number, Json>)[key];
      slots.push({ parent: value as Json[] | Obj, key, value: child, path: `${path}${Array.isArray(value) ? `[${key}]` : `.${key}`}` });
      walk(child, slots.at(-1)?.path ?? path);
    }
  };
  walk(root, "");
  return slots;
}

function setSlot(slot: { parent: Json[] | Obj; key: string | number }, value: Json): void {
  (slot.parent as Record<string | number, Json>)[slot.key] = value;
}

function mutate(root: Obj, n: number): string | null {
  if (n % 31 === 0) return JSON.stringify(root).slice(0, 200);
  const rng = mulberry32(0x5eed + n);
  const slots = jsonPointers(root);
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  const numeric = slots.filter((s) => typeof s.value === "number");
  const strings = slots.filter((s) => typeof s.value === "string");
  const arrays = slots.filter((s) => Array.isArray(s.value));
  const objects = slots.filter((s) => s.value && typeof s.value === "object" && !Array.isArray(s.value));
  switch (n % 18) {
    case 0: setSlot(pick(numeric), "bad"); break;
    case 1: setSlot(pick(numeric), null); break;
    case 2: setSlot(pick(numeric), -1); break;
    case 3: setSlot(pick(numeric), 1.25); break;
    case 4: setSlot(pick(strings), 7); break;
    case 5: delete (pick(objects).value as Obj).id; break;
    case 6: (root.data as Obj).version = 999; break;
    case 7: ((root.data as Obj).funds as Obj[])[1].id = (((root.data as Obj).funds as Obj[])[0].id as string); break;
    case 8: ((root.data as Obj).holders as Obj[])[0].fundId = "ghost"; break;
    case 9: ((root.data as Obj).users as Obj[])[0].role = "owner"; break;
    case 10: ((root.data as Obj).users as Obj[])[0].funds = ["ghost"]; break;
    case 11: setSlot(pick(arrays.filter((s) => (s.value as Json[]).length > 0)), Array.from({ length: 20_001 }, () => null)); break;
    case 12: setSlot(pick(strings), "x".repeat(2_001)); break;
    case 13: Object.assign(pick(objects).value as Obj, JSON.parse('{"__proto__":{"polluted":true}}')); break;
    case 14: setSlot(pick(strings), [[[[[[[[[["too deep"]]]]]]]]]] as Json); break;
    case 15: ((root.data as Obj).tbRows as Obj[])[0].category = "not-a-category"; break;
    case 16: ((root.data as Obj).funds as Obj[])[0].inputs = { cashDistribution: 1 } as Json; break;
    default: setSlot(pick(numeric), 0); break;
  }
  return JSON.stringify(root);
}

test("validatePersisted accepts a seed-derived Persisted and returns an equal fresh object", () => {
  const seeded = state();
  const validated = validatePersisted(seeded);
  assert.deepEqual(validated, seeded);
  assert.notEqual(validated, seeded);
});

test("the reported corrupt cashDistribution falls back to the seed", () => {
  const bad = state() as unknown as { data: { funds: Array<{ inputs: { cashDistribution: unknown } }> } };
  bad.data.funds[0].inputs.cashDistribution = "bad";
  const loaded = load(JSON.stringify(bad));
  assert.deepEqual(loaded.data, seedData());
  assert.doesNotThrow(() => fundCalc(loaded.data, loaded.data.funds[0].id, NOW));
});

test("deterministic damaged persistence either renders safely or falls back", () => {
  let accepted = 0;
  let rejected = 0;
  const failures: string[] = [];
  for (let i = 0; i < MUTATIONS; i++) {
    const root = clone(state()) as unknown as Obj;
    const raw = mutate(root, i);
    try {
      const loaded = load(raw);
      const fellBack = isDeepStrictEqual(loaded.data, seedData());
      if (fellBack) rejected += 1;
      else {
        accepted += 1;
        const problems = sweep(loaded.data);
        if (problems.length) failures.push(`#${i}: ${problems.join("; ")}`);
      }
    } catch (e) {
      failures.push(`#${i}: ${e instanceof Error ? e.stack : String(e)}`);
    }
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(accepted > 0, "some valid unusual mutations should still load");
  assert.ok(rejected > 100, "hostile mutations should be rejected");
  // Pinned so a change in what the validator accepts is a deliberate, reviewed change. v3 (19 Oct 2026): the seed gained notices,
  // assets and obligations, which moves the seeded random picks; the 25 accepted mutations were audited and are all legal values
  // (negative or nil ledger and trial-balance amounts, a nil optional share, a fractional effective life, a string version value).
  assert.equal(`${accepted}/${rejected}`, "25/195");
});

test("valid but unusual states still load and render", () => {
  const unusual = state();
  const zeroFund = unusual.data.funds[0];
  unusual.data.holders = unusual.data.holders.filter((h, i) => {
    if (h.fundId === zeroFund.id) return false;
    if (i === 5) h.units = 0;
    return true;
  });
  unusual.data.unitCostBase[zeroFund.id].opening = {};
  zeroFund.unitsOnIssue = 0;
  unusual.data.tbRows = unusual.data.tbRows.filter((r) => r.fundId !== zeroFund.id);
  unusual.data.queries = [];
  unusual.data.audit = [];
  assert.deepEqual(validatePersisted(unusual), unusual);
  const loaded = load(JSON.stringify(unusual));
  assert.deepEqual(loaded.data, unusual.data);
  assert.deepEqual(sweep(loaded.data), []);
});

test("validation is fast and rejects oversize arrays quickly", () => {
  const start = performance.now();
  assert.deepEqual(validatePersisted(state()), state());
  assert.ok(performance.now() - start < 100);

  const oversized = state();
  const row = oversized.data.audit[0];
  oversized.data.audit = Array.from({ length: 20_001 }, (_, i) => ({ ...row, id: `a-${i}` }));
  const rejectStart = performance.now();
  assert.equal(validatePersisted(oversized), null);
  assert.ok(performance.now() - rejectStart < 100);
});

