import { test } from "node:test";
import assert from "node:assert/strict";
import { STORAGE_KEY, createStore, loadPersisted } from "../../src/domain/store.ts";
import type { StorageLike } from "../../src/domain/store.ts";
import { defaultUi, seedData } from "../../src/domain/seed/index.ts";
import { visibleFunds } from "../../src/domain/selectors.ts";
import { STATE_VERSION } from "../../src/domain/types.ts";
import type { Action, JurisdictionFilter, Persisted, UiState } from "../../src/domain/types.ts";
import { NOW, NOW_STAMP, PERSONAS, seed, userOf } from "./core-fixtures.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const calls = { get: 0, set: 0 };
  const storage: StorageLike = {
    getItem: (key) => {
      calls.get++;
      return map.get(key) ?? null;
    },
    setItem: (key, value) => {
      calls.set++;
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
  return { storage, map, calls };
}

const make = (storage: StorageLike | null, initial?: Persisted) => createStore({ storage, now: () => NOW, initial });
const stored = (map: Map<string, string>): Persisted => JSON.parse(map.get(STORAGE_KEY) ?? "null");
const stateWith = (ui: UiState): Persisted => ({ data: seed(), ui });
const submit = (fundId: string): Action => ({ type: "submit", fundId });

test("a new store starts from the seed as the default persona and writes nothing yet", () => {
  const { storage, calls } = memoryStorage();
  const store = make(storage);
  assert.deepEqual(store.getState().data, seedData());
  assert.deepEqual(store.getState().ui, { ...defaultUi(), selectedFundId: "harbourline" });
  assert.equal(store.getState().ui.currentUserId, "a-moreno");
  assert.equal(calls.set, 0);
});

test("state is persisted under STORAGE_KEY on every change and restored by the next store", () => {
  const { storage, map, calls } = memoryStorage();
  const first = make(storage);
  const result = first.dispatch(submit("coastline"));
  assert.equal(result.ok, true);
  assert.equal(calls.set, 1);
  assert.equal(stored(map).data.funds.find((f) => f.id === "coastline")?.status, "In review");
  first.setUser("l-brennan");
  first.selectFund("southbank");
  first.setJurisdiction("AU");
  assert.equal(calls.set, 4);
  assert.deepEqual(stored(map).ui, { currentUserId: "l-brennan", jurisdiction: "AU", selectedFundId: "southbank" });

  const second = make(storage);
  assert.deepEqual(second.getState(), first.getState());
  assert.equal(second.getState().data.audit.at(-1)?.action, "Submitted for review");
  assert.equal(second.getState().data.audit.at(-1)?.at, NOW_STAMP);
});

test("corrupted or foreign storage falls back to the seed without throwing", () => {
  const bad = [
    "{not json",
    "",
    "null",
    "123",
    "[]",
    JSON.stringify({}),
    JSON.stringify({ data: "nope", ui: {} }),
    JSON.stringify({ data: { version: STATE_VERSION } }),
    JSON.stringify({ data: { ...seedData(), funds: "nope" } }),
    JSON.stringify({ data: { ...seedData(), funds: [{ id: "x" }] } }),
    JSON.stringify({ data: { ...seedData(), users: [] } }),
    JSON.stringify({ data: { ...seedData(), users: [{ id: "u", name: "U", role: "wizard", funds: "all" }] } }),
    JSON.stringify({ data: { ...seedData(), tbCategories: { AU: [] } } }),
  ];
  for (const raw of bad) {
    const { storage } = memoryStorage({ [STORAGE_KEY]: raw });
    const store = make(storage);
    assert.deepEqual(store.getState().data, seedData(), raw.slice(0, 40));
    assert.equal(store.getState().ui.currentUserId, "a-moreno");
  }
});

test("state saved by another version is ignored", () => {
  for (const version of [STATE_VERSION + 1, STATE_VERSION - 1, 0]) {
    const old = { data: { ...seedData(), version }, ui: { currentUserId: "l-brennan", jurisdiction: "AU", selectedFundId: "southbank" } };
    const { storage } = memoryStorage({ [STORAGE_KEY]: JSON.stringify(old) });
    const store = make(storage);
    assert.equal(store.getState().data.version, STATE_VERSION);
    assert.equal(store.getState().ui.currentUserId, "a-moreno", `version ${version}`);
  }
});

test("a store without storage works in memory", () => {
  const store = make(null);
  assert.equal(store.dispatch(submit("coastline")).ok, true);
  assert.equal(store.getState().data.funds.find((f) => f.id === "coastline")?.status, "In review");
  store.reset();
  assert.equal(store.getState().data.funds.find((f) => f.id === "coastline")?.status, "Preparing");
});

test("storage that throws never breaks the store", () => {
  const broken: StorageLike = {
    getItem: () => {
      throw new Error("private mode");
    },
    setItem: () => {
      throw new Error("quota exceeded");
    },
    removeItem: () => {
      throw new Error("nope");
    },
  };
  const store = make(broken);
  assert.deepEqual(store.getState().data, seedData());
  assert.equal(store.dispatch(submit("coastline")).ok, true);
  store.setUser("r-okafor");
  assert.equal(store.getState().ui.currentUserId, "r-okafor");
  assert.equal(store.getState().data.funds.find((f) => f.id === "coastline")?.status, "In review");
  assert.deepEqual(loadPersisted(broken).data, seedData());
});

test("loadPersisted reads without writing and repairs a stored ui", () => {
  const base = seedData();
  const save = (ui: unknown) => memoryStorage({ [STORAGE_KEY]: JSON.stringify({ data: base, ui }) });

  const unknownUser = save({ currentUserId: "ghost", jurisdiction: "AU", selectedFundId: "southbank" });
  assert.deepEqual(loadPersisted(unknownUser.storage).ui, { currentUserId: "a-moreno", jurisdiction: "AU", selectedFundId: "southbank" });

  const badJurisdiction = save({ currentUserId: "l-brennan", jurisdiction: "NZ", selectedFundId: "southbank" });
  assert.deepEqual(loadPersisted(badJurisdiction.storage).ui, { currentUserId: "l-brennan", jurisdiction: "all", selectedFundId: "southbank" });

  const hiddenFund = save({ currentUserId: "r-okafor", jurisdiction: "all", selectedFundId: "meranti" });
  assert.equal(loadPersisted(hiddenFund.storage).ui.selectedFundId, "harbourline", "a fund the user cannot see falls back to the first one they can");

  const noFunds = save({ currentUserId: "r-okafor", jurisdiction: "SG", selectedFundId: "harbourline" });
  assert.deepEqual(loadPersisted(noFunds.storage).ui, { currentUserId: "r-okafor", jurisdiction: "SG", selectedFundId: null });

  const noUi = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ data: base }) });
  assert.deepEqual(loadPersisted(noUi.storage).ui, { currentUserId: "a-moreno", jurisdiction: "all", selectedFundId: "harbourline" });

  for (const { calls } of [unknownUser, badJurisdiction, hiddenFund, noFunds, noUi]) assert.equal(calls.set, 0, "loading never writes");
  assert.deepEqual(loadPersisted(null), loadPersisted(undefined));
});

test("the initial option replaces storage for the first state and is persisted once something changes", () => {
  const { storage, map, calls } = memoryStorage({ [STORAGE_KEY]: "{broken" });
  const initial = stateWith({ currentUserId: "w-l-teo", jurisdiction: "SG", selectedFundId: "kallang" });
  const store = make(storage, initial);
  assert.equal(store.getState(), initial);
  assert.equal(calls.get, 0);
  store.selectFund("meranti");
  assert.equal(stored(map).ui.selectedFundId, "meranti");
  assert.equal(stored(map).ui.currentUserId, "w-l-teo");
});

test("reset re-seeds the data, keeps the current user and clears the jurisdiction toggle", () => {
  const { storage, map } = memoryStorage();
  const store = make(storage);
  store.setUser("w-l-teo");
  assert.equal(store.dispatch(submit("kallang")).ok, true);
  store.setJurisdiction("SG");
  store.selectFund("meranti");
  store.reset();
  const { data, ui } = store.getState();
  assert.deepEqual(data, seedData());
  assert.deepEqual(ui, { currentUserId: "w-l-teo", jurisdiction: "all", selectedFundId: "telok-ayer" });
  assert.deepEqual(stored(map), store.getState(), "the reset is persisted");
});

test("reset for a user without funds in the toggle leaves a valid selection", () => {
  const store = make(null);
  store.setUser("l-brennan");
  store.setJurisdiction("SG");
  assert.equal(store.getState().ui.selectedFundId, null, "Brennan has no Singapore funds");
  store.reset();
  assert.deepEqual(store.getState().ui, { currentUserId: "l-brennan", jurisdiction: "all", selectedFundId: "harbourline" });
});

test("the selected fund stays visible to the current user whatever persona and jurisdiction are chosen", () => {
  const jurisdictions: JurisdictionFilter[] = ["all", "AU", "SG"];
  let checked = 0;
  for (const userId of PERSONAS) {
    for (const jurisdiction of jurisdictions) {
      for (const start of [null, "harbourline", "meranti"]) {
        for (const order of ["user-first", "jurisdiction-first"] as const) {
          const store = make(null, stateWith({ currentUserId: "a-moreno", jurisdiction: "all", selectedFundId: start }));
          if (order === "user-first") {
            store.setUser(userId);
            store.setJurisdiction(jurisdiction);
          } else {
            store.setJurisdiction(jurisdiction);
            store.setUser(userId);
          }
          const { data, ui } = store.getState();
          const visible = visibleFunds(data, userOf(data, userId), jurisdiction).map((f) => f.id);
          if (visible.length === 0) assert.equal(ui.selectedFundId, null, `${userId} ${jurisdiction} ${start}`);
          else assert.ok(ui.selectedFundId !== null && visible.includes(ui.selectedFundId), `${userId} ${jurisdiction} ${start} -> ${ui.selectedFundId}`);
          checked++;
        }
      }
    }
  }
  assert.equal(checked, PERSONAS.length * 3 * 3 * 2);
});

test("switching persona or jurisdiction keeps the selection when it is still visible", () => {
  const store = make(null, stateWith({ currentUserId: "a-moreno", jurisdiction: "all", selectedFundId: "meranti" }));
  store.setUser("s-lim");
  assert.equal(store.getState().ui.selectedFundId, "meranti", "Lim can see Meranti");
  store.setUser("d-harrow");
  assert.equal(store.getState().ui.selectedFundId, "harbourline", "Harrow cannot, so the first fund he can see");
  store.setUser("a-moreno");
  store.selectFund("kallang");
  store.setJurisdiction("AU");
  assert.equal(store.getState().ui.selectedFundId, "harbourline");
  store.setJurisdiction("SG");
  assert.equal(store.getState().ui.selectedFundId, "telok-ayer");
  store.setJurisdiction("all");
  assert.equal(store.getState().ui.selectedFundId, "telok-ayer", "a visible selection is kept");
});

test("selectFund ignores funds the user cannot see and accepts null", () => {
  const store = make(null);
  store.setUser("w-l-teo");
  const before = store.getState();
  store.selectFund("harbourline");
  assert.equal(store.getState(), before, "Teo has no access to an Australian fund");
  store.selectFund("nope");
  assert.equal(store.getState(), before);
  store.selectFund("meranti");
  assert.equal(store.getState().ui.selectedFundId, "meranti");
  store.selectFund(null);
  assert.equal(store.getState().ui.selectedFundId, null);
});

test("setUser and setJurisdiction ignore values that do not exist", () => {
  const store = make(null);
  const before = store.getState();
  store.setUser("ghost");
  store.setJurisdiction("NZ" as JurisdictionFilter);
  assert.equal(store.getState(), before);
});

test("giving the current user fewer funds moves the selection to one they can still see", () => {
  const store = make(null, stateWith({ currentUserId: "a-moreno", jurisdiction: "all", selectedFundId: "meranti" }));
  const result = store.dispatch({ type: "set-user-funds", userId: "a-moreno", funds: ["harbourline"] });
  assert.equal(result.ok, true);
  assert.equal(store.getState().ui.selectedFundId, "harbourline");
  assert.deepEqual(userOf(store.getState().data, "a-moreno").funds, ["harbourline"]);
});

test("subscribers run synchronously after each real change, in order, with the new state already visible", () => {
  const store = make(null);
  const seen: string[] = [];
  store.subscribe(() => seen.push(`first:${store.getState().ui.currentUserId}`));
  store.subscribe(() => seen.push("second"));
  store.setUser("r-okafor");
  assert.deepEqual(seen, ["first:r-okafor", "second"]);
  store.dispatch(submit("coastline"));
  assert.equal(seen.length, 4);
  store.setJurisdiction("AU");
  store.selectFund("kurrajong");
  assert.equal(seen.length, 8, "two listeners x four changes");
});

test("nothing is notified or replaced for no-ops and refused actions", () => {
  const store = make(null);
  let calls = 0;
  store.subscribe(() => calls++);
  const before = store.getState();
  store.setUser("a-moreno");
  store.setJurisdiction("all");
  store.selectFund("harbourline");
  store.selectFund("meranti-nope");
  assert.deepEqual(store.dispatch({ type: "update-remitted", fundId: "coastline", remitted: null }), { ok: true, data: before.data }, "same value: a successful no-op");
  const refused = store.dispatch({ type: "return", fundId: "coastline" });
  assert.deepEqual(refused, { ok: false, reason: "Only a fund in review can be returned to the preparer" });
  assert.equal(calls, 0);
  assert.equal(store.getState(), before);
});

test("unsubscribe stops notifications and is safe to call twice", () => {
  const store = make(null);
  let calls = 0;
  const off = store.subscribe(() => calls++);
  store.setUser("r-okafor");
  assert.equal(calls, 1);
  off();
  off();
  store.setUser("l-brennan");
  assert.equal(calls, 1);
});

test("a listener removed during a notification is not called, and a throwing listener cannot stop the others", () => {
  const globals = globalThis as { reportError?: (error: unknown) => void };
  const previous = globals.reportError;
  const reported: unknown[] = [];
  globals.reportError = (error) => reported.push(error);
  try {
    const store = make(null);
    const calls: string[] = [];
    let offThird = () => {};
    store.subscribe(() => {
      calls.push("a");
      offThird();
    });
    store.subscribe(() => {
      calls.push("b");
      throw new Error("listener failed");
    });
    offThird = store.subscribe(() => calls.push("c"));
    store.subscribe(() => calls.push("d"));
    store.setUser("r-okafor");
    assert.deepEqual(calls, ["a", "b", "d"]);
    assert.equal(reported.length, 1);
    assert.equal((reported[0] as Error).message, "listener failed");
  } finally {
    if (previous) globals.reportError = previous;
    else delete globals.reportError;
  }
});

test("getState keeps its identity until something changes", () => {
  const store = make(null);
  const first = store.getState();
  assert.equal(store.getState(), first);
  store.selectFund("southbank");
  const second = store.getState();
  assert.notEqual(second, first);
  assert.equal(second.data, first.data, "a ui change keeps the same data object");
  assert.notEqual(second.ui, first.ui);
  assert.equal(store.getState(), second);
  store.dispatch(submit("coastline"));
  const third = store.getState();
  assert.notEqual(third.data, second.data);
  assert.equal(third.ui, second.ui, "a data change keeps the same ui object when the selection is still valid");
  assert.equal(store.getState(), third);
});

test("dispatch acts as the current user at the injected time and returns the reason when refused", () => {
  const store = make(null);
  store.setUser("r-okafor");
  const refused = store.dispatch({ type: "sign-off", fundId: "coastline" });
  assert.deepEqual(refused, { ok: false, reason: "You don't have permission to sign off" });
  const done = store.dispatch(submit("coastline"));
  assert.equal(done.ok, true);
  const entry = store.getState().data.audit.at(-1);
  assert.equal(entry?.actor, "R. Okafor");
  assert.equal(entry?.at, NOW_STAMP);
});

test("a reducer that blows up leaves the state untouched", () => {
  const store = make(null);
  let calls = 0;
  store.subscribe(() => calls++);
  const before = store.getState();
  const exploding = new Proxy({}, {
    ownKeys() {
      throw new Error("boom");
    },
  });
  const result = store.dispatch({ type: "update-inputs", fundId: "coastline", inputs: exploding });
  assert.deepEqual(result, { ok: false, reason: "Something went wrong. Nothing was changed." });
  assert.equal(store.getState(), before);
  assert.equal(calls, 0);
});

test("dispatchBulk applies the step to every eligible fund as one change", () => {
  const store = make(null);
  store.setUser("w-l-teo");
  let calls = 0;
  store.subscribe(() => calls++);
  const result = store.dispatchBulk("submit", ["telok-ayer", "kallang", "meranti", "telok-ayer", "nope"]);
  assert.deepEqual(result.done, ["telok-ayer", "kallang"]);
  assert.deepEqual(result.skipped, [
    { fundId: "meranti", reason: "Not preparing" },
    { fundId: "nope", reason: "Unknown fund" },
  ]);
  assert.equal(calls, 1, "one notification for the whole batch");
  const statuses = Object.fromEntries(store.getState().data.funds.map((f) => [f.id, f.status]));
  assert.equal(statuses["telok-ayer"], "In review");
  assert.equal(statuses["kallang"], "In review");
  const before = store.getState();
  assert.deepEqual(store.dispatchBulk("submit", ["loyang"]).done, []);
  assert.equal(store.getState(), before, "nothing eligible: no change, no notification");
  assert.equal(calls, 1);
});
