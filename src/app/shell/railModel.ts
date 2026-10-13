import type { FundGroup, FundId, FundListItem } from "../../domain/types.ts";

/** The listed fund that is selected (what the collapsed rail shows), or null when the selection is not in any group. */
export function selectedRailItem(groups: readonly FundGroup[], selectedId: FundId | null): FundListItem | null {
  if (selectedId === null) return null;
  for (const group of groups) {
    const found = group.funds.find((item) => item.fund.id === selectedId);
    if (found) return found;
  }
  return null;
}

/** The parts of a click event that decide whether a link will navigate in this tab (not "open in a new tab" or "download"). */
export interface ClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** True for an ordinary primary-button click, which is the only click that leaves the page on the link's own target. */
export function isPlainLeftClick(event: ClickLike): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
