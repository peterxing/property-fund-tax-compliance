// Audit findings that are not bugs in the pages, tolerated by the page x persona sweeps (audits.test.tsx, audits-states.test.tsx) and by
// expectAuditsClean. Every entry names what it covers and when it can go; the sweep lists entries that matched nothing, so stale ones show up.
//
// The list is empty. Until the last workspace landed it held the placeholder text of PlaceholderPanel ("<Workspace> is not built yet") for each
// unbuilt workspace, which is the only finding the audits ever raised on the app. Add an entry here, with a reason, only for a finding that
// is not a bug in the page; a workspace that goes back to a placeholder is a failing audit (a.placeholder), not an allowance.
import type { Allowance } from "./audit.ts";

export const ALLOWANCES: readonly Allowance[] = [];