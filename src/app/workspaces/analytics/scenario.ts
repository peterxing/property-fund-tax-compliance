// Pure helpers behind the Analytics "Distribution scenario" panel (no React, so Node tests can import them).
import type { Fund, FundId, ScenarioView } from "../../../domain/types.ts";
import { parseNumberDraft } from "../../ui/inputParsing.ts";

/** The taxable payout is a percentage; the cash amount is never negative. */
export const PAYOUT_LIMITS = { min: 0, max: 100, decimals: 2 } as const;
export const CASH_MIN = 0;
/** One ArrowUp / ArrowDown press moves the payout by this much. */
export const PAYOUT_STEP = 0.5;

/**
 * The fund the scenario shows: the one the user picked while they can still see it, otherwise the app's selected fund if visible,
 * otherwise the first visible fund. Null when the persona sees no fund.
 */
export function resolveScenarioFund(visibleIds: readonly FundId[], picked: FundId | null | undefined, selected: FundId | null | undefined): FundId | null {
  if (picked && visibleIds.includes(picked)) return picked;
  if (selected && visibleIds.includes(selected)) return selected;
  return visibleIds[0] ?? null;
}

/**
 * What the input box means for the scenario. An empty or unreadable box, and a value equal to today's position, both mean "the current
 * position" (undefined), so the Reset button and the table agree whichever way the user got there.
 */
export function scenarioValue(view: Pick<ScenarioView, "inputKind" | "defaultValue">, entered: number | null | undefined): number | undefined {
  if (entered === null || entered === undefined || !Number.isFinite(entered)) return undefined;
  const value = view.inputKind === "cash" ? Math.round(entered) : Math.round(entered * 100) / 100;
  return value === view.defaultValue ? undefined : value;
}

export const isCurrentPosition = (value: number | undefined): boolean => value === undefined;

/**
 * The payout after one ArrowUp (+1) or ArrowDown (-1) press, as a native number box would step it: from what is typed in the box
 * (the committed value when that is empty or unreadable) to the next multiple of the step in that direction, kept inside the limits.
 */
export function steppedPayout(text: string, committed: number | null, direction: 1 | -1): number {
  const typed = parseNumberDraft(text, { allowEmpty: true, decimals: PAYOUT_LIMITS.decimals });
  const base = typed.ok && typed.value !== null ? typed.value : (committed ?? PAYOUT_LIMITS.min);
  const position = base / PAYOUT_STEP;
  const index = direction === 1 ? Math.floor(position + 1e-9) + 1 : Math.ceil(position - 1e-9) - 1;
  return Math.min(PAYOUT_LIMITS.max, Math.max(PAYOUT_LIMITS.min, index * PAYOUT_STEP));
}

export function scenarioHint(kind: ScenarioView["inputKind"]): string {
  return kind === "cash"
    ? "Change the cash distribution to see how the position moves."
    : `Between ${PAYOUT_LIMITS.min} and ${PAYOUT_LIMITS.max}. Change it to see how the position moves.`;
}

export function scenarioFundOptions(funds: readonly Pick<Fund, "id" | "name">[]): Array<{ value: string; label: string }> {
  return funds.map((fund) => ({ value: fund.id, label: fund.name }));
}

/** Which measures the scenario moves, so the table can mark them (the figures themselves come from the domain, already formatted). */
export function changedMeasures(rows: ScenarioView["rows"]): string[] {
  return rows.filter((row) => row.scenario !== row.now).map((row) => row.measure);
}
