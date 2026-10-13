import { visibleFunds } from "../../domain/index.ts";
import type { JurisdictionFilter } from "../../domain/types.ts";
import { jurisdictionMessage, workingAsMessage } from "../labels.ts";
import { useStore, useUi, useUiActions } from "../state.tsx";
import { useAnnounce } from "../ui/LiveRegion.tsx";

/** How many funds the persona currently in the store can see (read at call time, so it reflects a change just made). */
function visibleCount(store: ReturnType<typeof useStore>): number {
  const state = store.getState();
  const user = state.data.users.find((u) => u.id === state.ui.currentUserId);
  return user ? visibleFunds(state.data, user, state.ui.jurisdiction).length : 0;
}

/** The persona switcher's state and handler: changing it updates the store and says who you are now and how many funds you can see. */
export function usePersonaControl(): { users: ReturnType<typeof useUi>["users"]; userId: string; onChange(userId: string): void } {
  const store = useStore();
  const ui = useUi();
  const { setUser } = useUiActions();
  const announce = useAnnounce();
  return {
    users: ui.users,
    userId: ui.user.id,
    onChange(userId) {
      setUser(userId);
      const next = store.getState().data.users.find((u) => u.id === userId);
      if (next) announce(workingAsMessage(next, visibleCount(store)));
    },
  };
}

/** The jurisdiction filter's state and handler: changing it updates the store and says what is shown now. */
export function useJurisdictionControl(): { value: JurisdictionFilter; onChange(filter: JurisdictionFilter): void } {
  const store = useStore();
  const { jurisdiction } = useUi();
  const { setJurisdiction } = useUiActions();
  const announce = useAnnounce();
  return {
    value: jurisdiction,
    onChange(filter) {
      setJurisdiction(filter);
      announce(jurisdictionMessage(filter, visibleCount(store)));
    },
  };
}
