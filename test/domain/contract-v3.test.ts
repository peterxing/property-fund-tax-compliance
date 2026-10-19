// The data added after version 2 was first saved: obligations, an AU fund's expense allocation policy and an SG fund holder's exemption
// section. They are optional in the saved-state schema, so an older save or backup still loads, and normaliseAppData fills them in.
import assert from "node:assert/strict";
import { test } from "node:test";
import { appDataProblem, persistedProblem } from "../../src/domain/core/schema.ts";
import { normaliseAppData } from "../../src/domain/core/normalise.ts";
import { STORAGE_KEY, createStore, loadPersisted } from "../../src/domain/store.ts";
import { defaultUi, seedData } from "../../src/domain/seed/index.ts";
import type { AppData, AuFund, SgHolder } from "../../src/domain/types.ts";
import { MAX_OBLIGATIONS } from "../../src/domain/core/validate.ts";
import { inputHash } from "../../src/domain/governance/versions.ts";

const withoutObligations = (): Omit<AppData, "obligations"> => {
  const { obligations: _drop, ...rest } = seedData();
  return rest;
};

test("a state saved before obligations existed still validates, loads and gains an empty list", () => {
  const old = withoutObligations();
  assert.equal(appDataProblem(old), null);
  assert.equal(persistedProblem({ data: old, ui: defaultUi() }), null);

  const storage = new Map([[STORAGE_KEY, JSON.stringify({ data: old, ui: defaultUi() })]]);
  const loaded = loadPersisted({ getItem: (k) => storage.get(k) ?? null, setItem: () => {}, removeItem: () => {} });
  assert.deepEqual(loaded.data.obligations, [], "the saved data was kept and the new list added");
  assert.equal(loaded.data.funds.length, seedData().funds.length);

  const store = createStore({ storage: null, initial: { data: old as AppData, ui: defaultUi() } });
  assert.deepEqual(store.getState().data.obligations, []);
  assert.equal(store.importData(old), null, "an older backup restores");
  assert.deepEqual(store.getState().data.obligations, []);
});

test("normaliseAppData leaves complete data alone", () => {
  const data = seedData();
  assert.equal(normaliseAppData(data), data);
});

test("obligations must point at a fund, have unique ids and list each completed date once, on or after the first due date", () => {
  const data = seedData();
  const ok = { id: "ob-1", fundId: "harbourline", title: "Council rates", category: "council-rates", firstDue: "2026-11-30", recurrence: "quarterly", notes: "", done: ["2026-11-30"], createdBy: "A. Moreno", createdAt: "2026-10-12T09:00:00" };
  assert.equal(appDataProblem({ ...data, obligations: [ok] }), null);
  assert.match(appDataProblem({ ...data, obligations: [{ ...ok, fundId: "nowhere" }] }) ?? "", /names a fund that does not exist/);
  assert.match(appDataProblem({ ...data, obligations: [ok, ok] }) ?? "", /repeats id ob-1/);
  assert.match(appDataProblem({ ...data, obligations: [{ ...ok, done: ["2026-11-30", "2026-11-30"] }] }) ?? "", /repeats date/);
  assert.match(appDataProblem({ ...data, obligations: [{ ...ok, done: ["2026-08-31"] }] }) ?? "", /before the first due date/);
  assert.match(appDataProblem({ ...data, obligations: [{ ...ok, recurrence: "weekly" }] }) ?? "", /must be one of none, monthly, quarterly, annually/);
});

test("an AU fund's expense allocation is pro-rata, other-income or custom shares totalling 100%", () => {
  const withAllocation = (allocation: unknown) => {
    const data = seedData();
    const fund = data.funds.find((f) => f.id === "harbourline") as AuFund;
    (fund as unknown as Record<string, unknown>).expenseAllocation = allocation;
    return appDataProblem(data);
  };
  assert.equal(withAllocation({ method: "pro-rata" }), null);
  assert.equal(withAllocation({ method: "other-income" }), null);
  assert.equal(withAllocation({ method: "custom", sharesBps: { other: 7_000, ncmi: 1_000, transitional: 0, clean: 2_000 } }), null);
  assert.match(withAllocation({ method: "custom", sharesBps: { other: 7_000, ncmi: 1_000, transitional: 0, clean: 1_999 } }) ?? "", /must total 10,000/);
  assert.match(withAllocation({ method: "custom", sharesBps: { other: 10_000, ncmi: 0, transitional: 0 } }) ?? "", /clean/);
  assert.match(withAllocation({ method: "pro-rata", sharesBps: {} }) ?? "", /sharesBps/);
  assert.match(withAllocation({ method: "evenly" }) ?? "", /pro-rata, other-income or custom/);
});

test("an SG holder's fund exemption section is one of the four sections and only for a non-resident fund", () => {
  const withSection = (holderId: string, section: unknown) => {
    const data = seedData();
    const holder = data.holders.find((h) => h.id === holderId) as SgHolder;
    (holder as unknown as Record<string, unknown>).sgFundSection = section;
    return appDataProblem(data);
  };
  const nrFund = seedData().holders.find((h) => "sgClass" in h && h.sgClass === "nr-fund")!;
  const other = seedData().holders.find((h) => "sgClass" in h && h.sgClass !== "nr-fund")!;
  assert.equal(withSection(nrFund.id, "13OA"), null);
  assert.match(withSection(nrFund.id, "13X") ?? "", /must be one of 13D, 13U, 13V, 13OA/);
  assert.match(withSection(other.id, "13D") ?? "", /only for a non-resident fund/);
});

test("the saved-state schema caps obligations at the add reducer's limit", () => {
  const data = seedData();
  const at = (i: number) => ({ id: `ob-${i}`, fundId: "harbourline", title: "Council rates", category: "council-rates", firstDue: "2026-11-30", recurrence: "none", notes: "", done: [], createdBy: "A. Moreno", createdAt: "2026-10-12T09:00:00" });
  const many = (n: number) => Array.from({ length: n }, (_, i) => at(i + 1));
  assert.equal(appDataProblem({ ...data, obligations: many(MAX_OBLIGATIONS) }), null, "a portfolio at the cap still loads");
  assert.match(appDataProblem({ ...data, obligations: many(MAX_OBLIGATIONS + 1) }) ?? "", /obligations/, "a crafted backup with more than the reducer allows is refused");
});

test("a saved version's input hash covers an nr-fund holder's exemption section without moving older hashes", () => {
  const data = seedData();
  const nrFund = data.holders.find((h): h is SgHolder => "sgClass" in h && h.sgClass === "nr-fund" && h.sgFundSection === undefined)!;
  const before = inputHash(data, nrFund.fundId);
  const withSection: AppData = { ...data, holders: data.holders.map((h) => (h.id === nrFund.id ? { ...nrFund, sgFundSection: "13OA" } : h)) };
  assert.notEqual(inputHash(withSection, nrFund.fundId), before, "setting the section (which changes the withholding rate) is a change of inputs");
  const cleared: AppData = { ...data, holders: data.holders.map((h) => (h.id === nrFund.id ? { ...nrFund } : h)) };
  assert.equal(inputHash(cleared, nrFund.fundId), before, "holders without a section hash as they always did");
});
