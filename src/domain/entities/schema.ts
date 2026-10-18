// OWNER: Funds & data agent (F7: fund, holder and property management; backup, restore and imports). Exact-shape rules for this feature's saved records, plus cross-record checks. core/schema.ts calls these.
import type { AppData, Market } from "../types.ts";



/** Cross-record checks run after the shapes pass: ids unique, fund ids exist (marketFor throws for unknown funds), markets match. */
export function entitiesRelations(data: AppData, marketFor: (fundId: string, at: string) => Market): void {

}
