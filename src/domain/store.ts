// The in-browser store. OWNER: domain-core agent. React-agnostic (the UI binds it with useSyncExternalStore).
//
//  * State persists to localStorage under STORAGE_KEY as Persisted (data + ui). On load the stored blob is deep-validated (core/schema.ts:
//    exact shapes, enums, safe-integer amounts, real dates, ids that exist, size limits); if it is not a valid state of this version, or the
//    JSON is invalid, or storage is unavailable (private mode), fall back to the seed silently. Never throw during load.
//  * dispatch(action) -> applyAction with ctx = { now: now(), user: current user }; on success replaces data, persists, notifies.
//  * setUser/setJurisdiction/selectFund update ui only. After a user change, selectedFundId must remain one the user can see
//    (else fall back to the first visible fund, or null).
//  * reset() re-seeds data and keeps the current user, jurisdiction toggle reset to "all".
//  * importData(value) replaces all data with a validated backup (same checks as saved state) and keeps the persona when it still exists.
//  * dispatch / dispatchBulk refuse (and do not save) a result that would fail those same checks, so no action can ever store data the
//    loader would reject on the next visit.
//
// Behaviour the UI relies on:
//  * getState() returns the same object until something really changes (no-op dispatches, ignored selections and repeated setUser calls
//    neither replace it nor notify), which is what useSyncExternalStore needs.
//  * Listeners run synchronously after a change, in subscription order. A listener removed during a notification is not called, and one
//    that throws cannot stop the others. subscribe() returns an unsubscribe that is safe to call twice.
//  * Persistence writes on every change and swallows storage errors (quota, private mode). `initial` bypasses reading storage but is still
//    persisted once the state changes. loadPersisted() is pure apart from reading storage and never throws; it does not write.
//  * A rule violation or an unexpected error inside a reducer leaves the state untouched and comes back as { ok: false, reason }.
import type {
  Action,
  ActionResult,
  AppData,
  BulkKind,
  BulkResult,
  Ctx,
  FundId,
  JurisdictionFilter,
  Persisted,
  Store,
  UiState,
  UserId,
} from "./types.ts";
import { applyAction, applyBulk } from "./actions.ts";
import { STATE_VERSION } from "./types.ts";
import { MAX_SERIALISED, appDataProblem, validatePersisted } from "./core/schema.ts";
import { normaliseAppData } from "./core/normalise.ts";
import { visibleFundsOf } from "./core/visible.ts";
import { defaultUi, seedData } from "./seed/index.ts";

export const STORAGE_KEY = "pfc.state.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoreOptions {
  /** Where to persist. Omit for the browser's localStorage when it is available; null for no persistence. */
  storage?: StorageLike | null;
  now?: () => Date;
  /** Initial state override (tests). */
  initial?: Persisted;
}

const FAILED = "Something went wrong. Nothing was changed.";
const JURISDICTIONS: readonly JurisdictionFilter[] = ["all", "AU", "SG"];

// ---------------------------------------------------------------------------------------------------- loading
type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasPoisonKey(value: unknown): boolean {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === null || typeof next !== "object") continue;
    for (const key of Object.keys(next)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") return true;
      stack.push((next as Dict)[key]);
    }
  }
  return false;
}

/** ui with a valid user, jurisdiction and selected fund for this data. `keepNull` leaves an explicit "no fund selected" alone. */
function reconcile(data: AppData, ui: UiState, keepNull = false): UiState {
  const user = data.users.find((u) => u.id === ui.currentUserId) ?? data.users[0];
  const jurisdiction = JURISDICTIONS.includes(ui.jurisdiction) ? ui.jurisdiction : "all";
  const visible = user ? visibleFundsOf(data, user, jurisdiction) : [];
  const selected = typeof ui.selectedFundId === "string" && visible.some((f) => f.id === ui.selectedFundId) ? ui.selectedFundId : null;
  const selectedFundId = selected ?? (keepNull && ui.selectedFundId === null ? null : (visible[0]?.id ?? null));
  const currentUserId = user ? user.id : ui.currentUserId;
  if (currentUserId === ui.currentUserId && jurisdiction === ui.jurisdiction && selectedFundId === ui.selectedFundId) return ui;
  return { currentUserId, jurisdiction, selectedFundId };
}

function freshState(): Persisted {
  const data = seedData();
  return { data, ui: reconcile(data, defaultUi()) };
}

function readPersisted(raw: string): Persisted | null {
  if (raw.length > MAX_SERIALISED) return null;
  const parsed: unknown = JSON.parse(raw);
  if (hasPoisonKey(parsed)) return null;
  if (!isDict(parsed) || appDataProblem(parsed.data) !== null) return null;
  const data = parsed.data as AppData;
  const stored = isDict(parsed.ui) ? parsed.ui : {};
  const base = defaultUi();
  const fallbackUser = data.users.some((u) => u.id === base.currentUserId) ? base.currentUserId : data.users[0].id;
  const ui: UiState = {
    currentUserId: typeof stored.currentUserId === "string" ? stored.currentUserId : fallbackUser,
    jurisdiction: JURISDICTIONS.includes(stored.jurisdiction as JurisdictionFilter) ? (stored.jurisdiction as JurisdictionFilter) : "all",
    selectedFundId: typeof stored.selectedFundId === "string" ? stored.selectedFundId : null,
  };
  if (!data.users.some((u) => u.id === ui.currentUserId)) ui.currentUserId = fallbackUser;
  const valid = validatePersisted({ data, ui: reconcile(data, ui) });
  return valid ? { data: normaliseAppData(valid.data), ui: valid.ui } : null;
}

/**
 * The state to start from: what storage holds when it is valid for this version, otherwise the seed. Never throws, never writes.
 * A stored ui is repaired rather than rejected (unknown user -> the default user, bad jurisdiction -> "all", hidden fund -> first visible).
 */
export function loadPersisted(storage?: StorageLike | null): Persisted {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (typeof raw === "string" && raw !== "") {
      const restored = readPersisted(raw);
      if (restored) return restored;
    }
  } catch {
    // unreadable storage or invalid JSON: start from the seed
  }
  return freshState();
}

/** The app name written into backups by the Data page ({ app, version, exportedAt, data }). */
export const BACKUP_APP_NAME = "property-fund-tax-compliance";

/**
 * Accepts either bare AppData or the backup wrapper { app, version, exportedAt, data } the Data page downloads, and returns the AppData
 * part, or a readable reason when the wrapper belongs to another app or another data version.
 */
function unwrapBackup(value: unknown): unknown {
  if (!isDict(value) || !Object.hasOwn(value, "data") || Object.hasOwn(value, "funds")) return value;
  const keys = Object.keys(value);
  if (keys.some((k) => !["app", "version", "exportedAt", "data"].includes(k))) return "This file is not a backup from this app.";
  if (value.app !== BACKUP_APP_NAME) return "This file is not a backup from this app.";
  if (value.version !== STATE_VERSION) return `This backup is from data version ${String(value.version)}; this version of the app reads version ${STATE_VERSION} only.`;
  if (value.exportedAt !== undefined && (typeof value.exportedAt !== "string" || value.exportedAt.length > 64)) return "This backup's export date is not readable.";
  return value.data;
}
function browserStorage(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------- store
function sameUi(a: UiState, b: UiState): boolean {
  return a.currentUserId === b.currentUserId && a.jurisdiction === b.jurisdiction && a.selectedFundId === b.selectedFundId;
}

export function createStore(options: StoreOptions = {}): Store {
  const clock = options.now ?? (() => new Date());
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const initial = options.initial;
  const initialData = initial ? normaliseAppData(initial.data) : null;
  let state: Persisted = initial && initialData ? (initialData === initial.data ? initial : { data: initialData, ui: initial.ui }) : loadPersisted(storage);
  const subscribers = new Set<{ listener: () => void }>();

  function persist(): void {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // quota exceeded or storage unavailable: the app keeps working in memory
    }
  }

  function notify(): void {
    for (const entry of [...subscribers]) {
      if (!subscribers.has(entry)) continue;
      try {
        entry.listener();
      } catch (error) {
        (globalThis as { reportError?: (e: unknown) => void }).reportError?.(error);
      }
    }
  }

  function commit(next: Persisted): boolean {
    if (next.data === state.data && sameUi(next.ui, state.ui)) return false;
    state = next;
    persist();
    notify();
    return true;
  }

  function context(): Ctx | null {
    const user = state.data.users.find((u) => u.id === state.ui.currentUserId) ?? state.data.users[0];
    return user ? { now: clock(), user } : null;
  }

  return {
    getState: () => state,

    subscribe(listener) {
      const entry = { listener };
      subscribers.add(entry);
      return () => {
        subscribers.delete(entry);
      };
    },

    dispatch(action: Action): ActionResult {
      const ctx = context();
      if (!ctx) return { ok: false, reason: "No user is signed in" };
      let result: ActionResult;
      try {
        result = applyAction(state.data, action, ctx);
      } catch {
        return { ok: false, reason: FAILED };
      }
      if (result.ok && result.data !== state.data) {
        // Defence in depth: never save a state the loader would refuse (that would silently reset the user's data on the next visit).
        const problem = appDataProblem(result.data);
        if (problem !== null) return { ok: false, reason: `This change was not saved because it would leave the data unreadable (${problem}).` };
        commit({ data: result.data, ui: reconcile(result.data, state.ui) });
      }
      return result;
    },

    dispatchBulk(kind: BulkKind, fundIds: FundId[]): BulkResult {
      const ctx = context();
      const unique = [...new Set(fundIds)];
      const skipAll = (reason: string): BulkResult => ({ done: [], skipped: unique.map((fundId) => ({ fundId, reason })) });
      if (!ctx) return skipAll("No user is signed in");
      try {
        const { data, result } = applyBulk(state.data, kind, fundIds, ctx);
        if (data !== state.data) {
          const problem = appDataProblem(data);
          if (problem !== null) return skipAll(`Not saved: the result would leave the data unreadable (${problem}).`);
          commit({ data, ui: reconcile(data, state.ui) });
        }
        return result;
      } catch {
        return skipAll(FAILED);
      }
    },

    setUser(userId: UserId) {
      if (!state.data.users.some((u) => u.id === userId)) return;
      commit({ data: state.data, ui: reconcile(state.data, { ...state.ui, currentUserId: userId }) });
    },

    setJurisdiction(filter: JurisdictionFilter) {
      if (!JURISDICTIONS.includes(filter)) return;
      commit({ data: state.data, ui: reconcile(state.data, { ...state.ui, jurisdiction: filter }) });
    },

    selectFund(fundId: FundId | null) {
      if (fundId === null) {
        commit({ data: state.data, ui: { ...state.ui, selectedFundId: null } });
        return;
      }
      const user = state.data.users.find((u) => u.id === state.ui.currentUserId) ?? state.data.users[0];
      if (!user || !visibleFundsOf(state.data, user, state.ui.jurisdiction).some((f) => f.id === fundId)) return;
      commit({ data: state.data, ui: { ...state.ui, selectedFundId: fundId } });
    },

    reset() {
      const data = seedData();
      const keep = data.users.some((u) => u.id === state.ui.currentUserId) ? state.ui.currentUserId : defaultUi().currentUserId;
      const ui = reconcile(data, { currentUserId: keep, jurisdiction: "all", selectedFundId: null });
      commit({ data, ui });
    },

    importData(value: unknown): string | null {
      try {
        if (hasPoisonKey(value)) return "The backup contains a field name that is not allowed (__proto__, constructor or prototype).";
        const unwrapped = unwrapBackup(value);
        if (typeof unwrapped === "string") return unwrapped;
        const problem = appDataProblem(unwrapped);
        if (problem !== null) return `This file is not a backup this version can load: ${problem}.`;
        const data = normaliseAppData(structuredClone(unwrapped) as AppData);
        const keep = data.users.some((u) => u.id === state.ui.currentUserId) ? state.ui.currentUserId : data.users[0]!.id;
        commit({ data, ui: reconcile(data, { currentUserId: keep, jurisdiction: state.ui.jurisdiction, selectedFundId: state.ui.selectedFundId }) });
        return null;
      } catch {
        return "The backup could not be read.";
      }
    },
  };
}
