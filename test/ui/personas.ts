// The demo personas and the funds they can open, written out by hand. shell.test.tsx checks the list against the seed data, so a change
// to the seed fails one clear test instead of silently turning the persona sweeps into something else.
import type { FundId, RoleId, UserId } from "../../src/domain/types.ts";

export interface Persona {
  id: UserId;
  name: string;
  title: string;
  role: RoleId;
  /** What the "Working as" list shows: "Name — Title". */
  label: string;
  /** "all", or the funds this persona has been given. */
  funds: "all" | readonly FundId[];
}

const AU_FUNDS = ["harbourline", "southbank", "wattle", "kurrajong", "coastline"] as const;
const SG_FUNDS = ["telok-ayer", "loyang", "meranti", "kallang"] as const;

function persona(id: UserId, name: string, title: string, role: RoleId, funds: Persona["funds"]): Persona {
  return { id, name, title, role, label: `${name} — ${title}`, funds };
}

/** In the order of the "Working as" list. */
export const PERSONAS: readonly Persona[] = [
  persona("a-moreno", "A. Moreno", "Head of Tax", "head-of-tax", "all"),
  persona("l-brennan", "L. Brennan", "Tax manager, Australia", "reviewer", AU_FUNDS),
  persona("n-pillai", "N. Pillai", "Tax manager, Singapore", "reviewer", SG_FUNDS),
  persona("r-okafor", "R. Okafor", "Tax accountant, Australia", "preparer", AU_FUNDS),
  persona("w-l-teo", "W. L. Teo", "Tax accountant, Singapore", "preparer", SG_FUNDS),
  persona("d-harrow", "D. Harrow", "Registered tax agent", "tax-agent", ["harbourline", "southbank", "kurrajong"]),
  persona("s-lim", "S. Lim", "Tax adviser", "tax-agent", ["telok-ayer", "meranti"]),
  persona("m-castillo", "M. Castillo", "Fund finance", "finance", "all"),
];

export function personaById(id: UserId): Persona {
  const found = PERSONAS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown persona "${id}".`);
  return found;
}

/** The funds, in the seed order. */
export const FUNDS = [
  { id: "harbourline", name: "Harbourline Office Trust", market: "AU", status: "Signed off", governance: "agent-signs-off" },
  { id: "southbank", name: "Southbank Industrial Partners Fund", market: "AU", status: "In review", governance: "agent-lodges" },
  { id: "wattle", name: "Wattle Retail Property Trust", market: "AU", status: "Signed off", governance: "no-agent" },
  { id: "kurrajong", name: "Kurrajong Stapled Property Trust", market: "AU", status: "In review", governance: "agent-lodges" },
  { id: "coastline", name: "Coastline Healthcare Property Fund", market: "AU", status: "Preparing", governance: "no-agent" },
  { id: "telok-ayer", name: "Telok Ayer Commercial REIT", market: "SG", status: "Preparing", governance: "agent-signs-off" },
  { id: "loyang", name: "Loyang Logistics REIT", market: "SG", status: "Signed off", governance: "no-agent" },
  { id: "meranti", name: "Meranti Digital Infrastructure REIT", market: "SG", status: "In review", governance: "agent-lodges" },
  { id: "kallang", name: "Kallang Riverside Retail REIT", market: "SG", status: "Preparing", governance: "no-agent" },
] as const;

export type FundFixture = (typeof FUNDS)[number];

export function fundById(id: FundId): FundFixture {
  const found = FUNDS.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown fund "${id}".`);
  return found;
}
