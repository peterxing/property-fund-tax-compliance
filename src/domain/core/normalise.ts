// Fills fields that were added to AppData after data was first saved. They are optional in the saved-state schema (core/schema.ts), so an
// older save or backup still validates; every way into the store passes the data through here, so the rest of the app can rely on them.
import type { AppData } from "../types.ts";

/** The same data with every later-added field present (a new object only when something was missing). */
export function normaliseAppData(data: AppData): AppData {
  const loose = data as Omit<AppData, "obligations"> & { obligations?: AppData["obligations"] };
  if (Array.isArray(loose.obligations)) return data;
  return { ...data, obligations: [] };
}
