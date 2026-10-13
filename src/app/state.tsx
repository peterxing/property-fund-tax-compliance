// App state: the domain store bound to React, plus the hooks every workspace uses.
//   StoreProvider, useStore, usePersisted, useAppData, useUi, useUiActions, useCtx
//   useDispatch, useDispatchBulk (failures are announced and shown as a role="alert" notice with the reason)
//   useVisibleFunds, useFundParam (route <-> store selection), useFund (inside FundWorkspaceFrame), useFundCalc, useWorkflow
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createStore, fundCalc, visibleFunds, workflowView } from "../domain/index.ts";
import type {
  Action,
  ActionResult,
  AppData,
  BulkKind,
  BulkResult,
  Ctx,
  Fund,
  FundCalc,
  FundId,
  JurisdictionFilter,
  Persisted,
  Store,
  UiState,
  User,
  UserId,
  WorkflowView,
} from "../domain/types.ts";
import { currentRoute, navigate, resolveFundId, useRoute, withParams } from "./router.ts";
import { useNotify } from "./ui/LiveRegion.tsx";

// ------------------------------------------------------------------------------------------------ store
const StoreContext = createContext<Store | null>(null);

let singleton: Store | null = null;

/** The app-wide store, created on first use. Throws (inside render, so the error boundary shows it) if the domain cannot start. */
export function appStore(): Store {
  singleton ??= createStore();
  return singleton;
}

/** The store if it has been created; the error boundary uses it to offer "Reset demo data" without creating one. */
export function peekStore(): Store | null {
  return singleton;
}

export function StoreProvider({ children, store }: { children: ReactNode; store?: Store }) {
  const value = useMemo(() => store ?? appStore(), [store]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore() must be used inside <StoreProvider>.");
  return store;
}

/** The whole persisted state (data + ui); re-renders on every store change. Prefer useAppData / useUi. */
export function usePersisted(): Persisted {
  const store = useStore();
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.getState(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useAppData(): AppData {
  return usePersisted().data;
}

function resolveUser(data: AppData, ui: UiState): User {
  const user = data.users.find((u) => u.id === ui.currentUserId) ?? data.users[0];
  if (!user) throw new Error("The demo data has no users.");
  return user;
}

export interface UiView extends UiState {
  /** The persona currently acting (falls back to the first user if the stored id is unknown). */
  user: User;
  users: User[];
}

export function useUi(): UiView {
  const { data, ui } = usePersisted();
  return useMemo(() => ({ ...ui, user: resolveUser(data, ui), users: data.users }), [data, ui]);
}

export interface UiActions {
  setUser(userId: UserId): void;
  setJurisdiction(filter: JurisdictionFilter): void;
  selectFund(fundId: FundId | null): void;
}

export function useUiActions(): UiActions {
  const store = useStore();
  return useMemo(
    () => ({
      setUser: (userId) => store.setUser(userId),
      setJurisdiction: (filter) => store.setJurisdiction(filter),
      selectFund: (fundId) => store.selectFund(fundId),
    }),
    [store],
  );
}

/** { now, user } for selectors and actions. `now` is re-read whenever the store changes and at least every 60 s so overdue statuses roll over. */
export function useCtx(): Ctx {
  const persisted = usePersisted();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const user = resolveUser(persisted.data, persisted.ui);
  // `persisted` and `tick` are not read inside the memo: they are the triggers that refresh `now`.
  return useMemo(() => ({ now: new Date(), user }), [user, persisted, tick]);
}

// ------------------------------------------------------------------------------------------------ dispatch
function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
}

/** Applies a domain action as the current user. Never throws: rule violations (and unexpected errors) come back as { ok: false, reason } and are shown to the user. */
export function useDispatch(): (action: Action) => ActionResult {
  const store = useStore();
  const notify = useNotify();
  return useCallback(
    (action) => {
      let result: ActionResult;
      try {
        result = store.dispatch(action);
      } catch (error) {
        result = { ok: false, reason: describeError(error) };
      }
      if (!result.ok) notify({ tone: "error", message: result.reason });
      return result;
    },
    [store, notify],
  );
}

/** Applies one step to many funds; funds that cannot take it are skipped with a reason (see BulkResult). */
export function useDispatchBulk(): (kind: BulkKind, fundIds: FundId[]) => BulkResult {
  const store = useStore();
  const notify = useNotify();
  return useCallback(
    (kind, fundIds) => {
      try {
        return store.dispatchBulk(kind, fundIds);
      } catch (error) {
        const reason = describeError(error);
        notify({ tone: "error", message: reason });
        return { done: [], skipped: fundIds.map((fundId) => ({ fundId, reason })) };
      }
    },
    [store, notify],
  );
}

// ------------------------------------------------------------------------------------------------ funds
export function useVisibleFunds(): Fund[] {
  const { data, ui } = usePersisted();
  const user = resolveUser(data, ui);
  return useMemo(() => visibleFunds(data, user, ui.jurisdiction), [data, user, ui.jurisdiction]);
}

/**
 * The fund the current workspace shows, kept in sync in both directions: a `fund` in the hash wins when the persona can see it,
 * otherwise the store selection (then the first visible fund) is used and written back to the hash. Choosing a fund updates the
 * store selection. Returns null when the persona has no visible fund.
 */
export function useFundParam(): FundId | null {
  const route = useRoute();
  const store = useStore();
  const { ui } = usePersisted();
  const funds = useVisibleFunds();
  const hashFund = route.params.fund ?? null;
  const visibleIds = useMemo(() => funds.map((f) => f.id), [funds]);
  const resolved = resolveFundId(hashFund, ui.selectedFundId, visibleIds);

  useEffect(() => {
    if (resolved !== ui.selectedFundId) store.selectFund(resolved);
  }, [resolved, ui.selectedFundId, store]);

  useEffect(() => {
    if (resolved && hashFund !== resolved) navigate(withParams(currentRoute(), { fund: resolved }), { replace: true });
  }, [resolved, hashFund]);

  return resolved;
}

export const FundContext = createContext<Fund | null>(null);

/** The fund shown by the surrounding FundWorkspaceFrame. */
export function useFund(): Fund {
  const fund = useContext(FundContext);
  if (!fund) throw new Error("useFund() must be used inside <FundWorkspaceFrame>.");
  return fund;
}

// Selector results depend only on (immutable data, fund, user, minute), so the header, the workspace and any tab share one computation.
const memo = new WeakMap<AppData, Map<string, unknown>>();

function memoByData<T>(data: AppData, key: string, compute: () => T): T {
  let bucket = memo.get(data);
  if (!bucket) {
    bucket = new Map();
    memo.set(data, bucket);
  }
  if (bucket.has(key)) return bucket.get(key) as T;
  if (bucket.size > 200) bucket.clear();
  const value = compute();
  bucket.set(key, value);
  return value;
}

/** fundCalc(data, fundId, now) shared between components for the same data snapshot. Treat the result as read-only. */
export function useFundCalc(fundId: FundId): FundCalc {
  const data = useAppData();
  const { now } = useCtx();
  const minute = Math.floor(now.getTime() / 60_000);
  return useMemo(() => memoByData(data, `calc|${fundId}|${minute}`, () => fundCalc(data, fundId, now)), [data, fundId, minute, now]);
}

/** workflowView(data, fundId, ctx) for the current user, shared like useFundCalc. */
export function useWorkflow(fundId: FundId): WorkflowView {
  const data = useAppData();
  const ctx = useCtx();
  const minute = Math.floor(ctx.now.getTime() / 60_000);
  return useMemo(
    () => memoByData(data, `wf|${fundId}|${ctx.user.id}|${minute}`, () => workflowView(data, fundId, ctx)),
    [data, fundId, ctx, minute],
  );
}
