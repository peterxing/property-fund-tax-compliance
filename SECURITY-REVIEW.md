# Security review

Review of the v2 platform release (October 2026: GST & BAS, Property taxes, Assets & allowances, Compare, Compliance calendar, Risk register, Calculators, Rules & sources, Data, and the governance additions). Every finding below was fixed and re-checked before the release went live, and each fix is covered by a test.

## Scope and threat model

* **What the app is.** A static single-page app on GitHub Pages. There is no server, no account and no network call after the page loads: data lives in the browser's `localStorage`, and exports are generated in the page.
* **Personas are not authentication.** "Working as" switches between demo personas, and anyone can pick the Head of Tax. The role rules (who edits, who lodges, who sees which funds) are product behaviour that the demo must keep consistent, not a security boundary. The findings are therefore integrity and consistency gaps in that role model and in the saved data, not remotely exploitable vulnerabilities.
* **What was reviewed.** Every new action handler (`src/domain/{gst,ptax,assets,governance,entities}/reducer.ts`), the imports (GST ledger, assets, holders, properties, full backup), the Compare parser, the saved-state schema and store, what each workspace shows each persona, and the build's Content Security Policy.
* **How.** An independent review of the source, followed by a re-check of each fix. Fixes are pinned by the domain tests, the independent verifiers under `test/verify`, and a UI sweep (`test/ui/flows/persona-isolation.test.tsx`) that visits every route and tab as the view-only persona and fails on any control that could change data.

## Findings

Severity and confidence are a re-assessment made when this document was written (the reviewer's original scores were not kept). All findings are fixed.

| # | Severity | File | Lines | Finding | Confidence | Fix | Covered by |
|---|----------|------|-------|---------|------------|-----|------------|
| 1 | 🟡 MEDIUM | src/domain/entities/reducer.ts | 155 | A fund editor could change a fund's governance, a Head of Tax power, through the fund edit action | 9/10 | Governance can only be changed on the Access page | `test/domain/entities/reducer.test.ts` |
| 2 | 🟡 MEDIUM | src/domain/gst/reducer.ts | 182–214 | A GST import in replace mode deleted ledger entries inside lodged periods | 9/10 | Replace keeps every entry in a lodged period and refuses imported rows dated in one | `test/domain/gst/gst.test.ts` ("import keeps lodged-period entries…") |
| 3 | 🟡 MEDIUM | src/domain/gst/reducer.ts | 144–169 | Editing a GST entry could move it to another fund or into a lodged period | 8/10 | Fund and id cannot change; the old and the new period are both checked for a lock | `test/domain/gst/gst.test.ts` ("update ignores fundId/id changes…") |
| 4 | 🟡 MEDIUM | src/domain/ptax/reducer.ts | 104–165 | Property tax profile updates accepted unexpected fields, including identity and payment fields | 8/10 | Only listed fields are accepted, each validated, and the result is checked against the saved-state schema | `test/domain/ptax/ptax.test.ts` ("rejects over-posted identity and payment fields…") |
| 5 | 🟡 MEDIUM | src/app/workspaces/Data.tsx | 83, 169, 224 | The Data page listed funds hidden from the current persona | 9/10 | Every Data tab lists only the persona's visible funds and falls back from a hidden `?fund=` | `test/app/data/workspace.test.tsx` |
| 6 | 🟡 MEDIUM | src/domain/gst/reducer.ts, src/domain/assets/reducer.ts | 65–73; 171–175 | Imports could save values the saved-state schema rejects, so the next visit would discard all saved data | 8/10 | Generated records are validated against the schema before saving; see also "Defence in depth" | `test/domain/gst/gst.test.ts`, `test/domain/assets/assets.test.ts` |
| 7 | 🟡 MEDIUM | src/domain/gst/reducer.ts, src/domain/entities/reducer.ts | 121–127; 178–181 | Changing a fund's period could unlock its lodged GST periods | 8/10 | Locks use each filing's own stored dates; a fund's dates cannot change once anything is lodged or published | `test/domain/gst/gst.test.ts` ("stored filing ranges keep periods locked…"), `test/domain/entities/reducer.test.ts` |
| 8 | ⚪ LOW | src/domain/compare/parse.ts | 5–9, 136–148 | A very large pasted file could hang the browser tab | 9/10 | Limits of 1 MB, 2,000 data rows and 200 columns, checked while parsing | `test/domain/compare/compare.test.ts` ("enforces row and byte limits", "refuses adversarial wide input…") |

## Defence in depth added in this release

* **The store refuses to save unreadable data.** `dispatch` and `dispatchBulk` (`src/domain/store.ts`) validate the result against the saved-state schema before committing it. A change that would leave data the loader rejects is refused with a message instead of being saved and then silently replaced by the demo data on the next visit (`test/domain/store.test.ts`, "dispatch and dispatchBulk refuse to save a result the loader would reject…").
* **Backups are validated like saved state.** Restoring a backup (`importData`) accepts the app's backup wrapper or bare data of the current version only. It rejects other apps, older versions, unknown keys and `__proto__`/`constructor`/`prototype` keys, and checks the size before parsing (`test/verify/app-logic/v2-platform-verifier.test.ts`, `test/app/data/model.test.ts`).
* **Controls follow the store's rules.** Pages offer a control only to personas the store would accept it from: the GST lodgment form to whoever records lodgment under the fund's governance, unlocking to the Head of Tax, Save version to those who edit, review or sign off, and Data edits to editors. The view-only persona sweep fails if any page offers that persona a control that changes data.
* **Content Security Policy.** The built page allows scripts, styles, fonts and images from its own origin only, and no network connections, frames, forms or workers (`default-src 'none'`). The release was checked live: the page loads nothing from any other origin.
* **Exports are formula-guarded.** CSV and XLSX cells that start with `=`, `+`, `-`, `@`, tab or carriage return are neutralised by the shared writer, so a crafted holder or ledger name cannot run as a spreadsheet formula.

## Residual risks

* Personas are a demo switcher, so any visitor can act as any role. A real deployment would need authentication and server-side enforcement of the same rules.
* `localStorage` belongs to the user: anyone can edit their own saved data. The loader validates it on every visit and falls back to the demo data if it is not valid.
* Practice files and backups are processed entirely in the browser. Only restore backups you trust: a valid backup replaces all data in this browser.

## Reporting

Please open an issue in this repository for anything security-related. The app holds no real data and makes no network calls, so a public issue is fine.
