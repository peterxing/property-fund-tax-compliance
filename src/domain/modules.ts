import type { Market } from "./types.ts";
import type { MarketModule } from "./market.ts";
import { auModule } from "./au/index.ts";
import { sgModule } from "./sg/index.ts";

export function moduleFor(market: Market): MarketModule {
  return market === "AU" ? auModule : sgModule;
}
