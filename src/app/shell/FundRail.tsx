import { useId, useMemo, useRef, useState } from "react";
import { fundGroups } from "../../domain/index.ts";
import { roleCan } from "../../domain/permissions.ts";
import type { FundGroup, FundId } from "../../domain/types.ts";
import { railDetail } from "../labels.ts";
import { buildHash, routeForFund, useRoute } from "../router.ts";
import { useAppData, useCtx, useUi, useUiActions } from "../state.tsx";
import { cls } from "../ui/cls.ts";
import { ExceptionChip, MarketBadge, StatusChip } from "../ui/Badge.tsx";
import { Icon } from "../ui/icons.tsx";
import { isPlainLeftClick, selectedRailItem } from "./railModel.ts";

export interface FundRailViewProps {
  groups: readonly FundGroup[];
  selectedId: FundId | null;
  /** The link target for a fund (the current workspace and tab with that fund). */
  hrefFor(fundId: FundId): string;
  onSelect?(fundId: FundId): void;
  /** Shown when there are no groups. */
  emptyMessage?: string;
  /** Below 900px the list starts folded away; this starts it open instead. It makes no difference from 900px up, where the list is always shown. */
  defaultOpen?: boolean;
  /** Shows the Data page funds tab link for personas who can add or edit funds. */
  canManageFunds?: boolean;
}

/**
 * The fund list, grouped by market. Props only, so the gallery can render it from fixtures.
 *
 * From 900px up it is a column beside the workspace and always shown. Below that a long list would push the workspace down the page on every
 * visit, so it folds into a disclosure: one button showing the selected fund and its status opens the grouped list, and choosing a fund (or
 * Escape) folds it away again. The markup is the same at every width; shell.css hides the button and keeps the list visible at the wide size.
 */
export function FundRailView({
  groups,
  selectedId,
  hrefFor,
  onSelect,
  emptyMessage = "No funds assigned to this persona.",
  defaultOpen = false,
  canManageFunds = false,
}: FundRailViewProps) {
  const uid = useId();
  const panelId = `${uid}-panel`;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(defaultOpen);

  if (groups.length === 0) {
    return (
      <nav className="fund-rail" aria-label="Funds">
        <p className="fund-rail__empty">{emptyMessage}</p>
        {canManageFunds ? (
          <p className="fund-rail__manage">
            <a className="fund-rail__manage-link" href="#/data?tab=funds">
              <Icon name="database" />
              <span>Manage funds</span>
            </a>
          </p>
        ) : null}
      </nav>
    );
  }

  const selected = selectedRailItem(groups, selectedId);

  // A focused link disappears with the folded list, so focus goes back to the button that opened it.
  const fold = (): void => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  return (
    <nav
      className={cls("fund-rail", open && "fund-rail--open")}
      aria-label="Funds"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) fold();
      }}
    >
      <button
        ref={toggleRef}
        type="button"
        className="fund-rail__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="fund-rail__toggle-text">
          <span className="sr-only">Fund: </span>
          <span className="fund-rail__toggle-name">{selected ? selected.fund.name : "None selected"}</span>
          {selected ? (
            <>
              {" "}
              <StatusChip status={selected.status} />
              {selected.exceptions > 0 ? (
                <>
                  {" "}
                  <ExceptionChip count={selected.exceptions} />
                </>
              ) : null}
            </>
          ) : null}
        </span>
        <Icon name="chevron-down" />
      </button>
      <div id={panelId} className="fund-rail__panel">
        {groups.map((group) => {
          const labelId = `fund-rail-${group.market}`;
          return (
            <div key={group.market} className="fund-rail__group">
              <p id={labelId} className="fund-rail__group-label">
                <span aria-hidden="true">
                  <MarketBadge market={group.market} />
                </span>
                <span>{group.label}</span>
              </p>
              <ul role="list" aria-labelledby={labelId} className="fund-rail__list">
                {group.funds.map(({ fund, status, exceptions }) => {
                  const current = fund.id === selectedId;
                  return (
                    <li key={fund.id}>
                      <a
                        className={cls("fund-rail__item", current && "fund-rail__item--selected")}
                        href={hrefFor(fund.id)}
                        aria-current={current ? "page" : undefined}
                        onClick={(event) => {
                          // Opening the link in a new tab or window leaves this page as it is.
                          if (!isPlainLeftClick(event)) return;
                          onSelect?.(fund.id);
                          if (open) fold();
                        }}
                      >
                        <span className="fund-rail__name">{fund.name}</span>
                        <span className="fund-rail__detail">{railDetail(fund)}</span>
                        <span className="fund-rail__chips">
                          <StatusChip status={status} />
                          <ExceptionChip count={exceptions} />
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {canManageFunds ? (
          <p className="fund-rail__manage">
            <a className="fund-rail__manage-link" href="#/data?tab=funds">
              <Icon name="database" />
              <span>Manage funds</span>
            </a>
          </p>
        ) : null}
      </div>
    </nav>
  );
}

/** FundRailView bound to the store: groups follow the persona and jurisdiction; choosing a fund keeps the workspace and tab. */
export function FundRail({ selectedId }: { selectedId: FundId | null }) {
  const data = useAppData();
  const ctx = useCtx();
  const { jurisdiction } = useUi();
  const { selectFund } = useUiActions();
  const route = useRoute();
  const groups = useMemo(() => fundGroups(data, ctx, jurisdiction), [data, ctx, jurisdiction]);
  return (
    <FundRailView
      groups={groups}
      selectedId={selectedId}
      hrefFor={(fundId) => buildHash(routeForFund(route, fundId))}
      onSelect={selectFund}
      emptyMessage={jurisdiction === "all" ? undefined : "No funds assigned to this persona in this jurisdiction."}
      canManageFunds={roleCan(ctx.user.role, "manage-access") || roleCan(ctx.user.role, "edit")}
    />
  );
}
