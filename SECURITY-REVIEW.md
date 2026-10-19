# Security review

Two reviews are recorded here: the **v3 release** (October 2026: Excel import, bulk fund import, custom calendar obligations, the due-diligence report, expense allocation policy, SG fund sections, assessment notices, asset disposals and the territory duties) and the **v2 platform release** (October 2026: GST & BAS, Property taxes, Assets & allowances, Compare, Compliance calendar, Risk register, Calculators, Rules & sources, Data, and the governance additions). Every finding below was fixed and re-checked before the release went live, and each fix is covered by a test.

## Scope and threat model

* **What the app is.** A static single-page app on GitHub Pages. There is no server, no account and no network call after the page loads: data lives in the browser's `localStorage`, and exports are generated in the page.
* **Personas are not authentication.** "Working as" switches between demo personas, and anyone can pick the Head of Tax. The role rules (who edits, who lodges, who sees which funds) are product behaviour that the demo must keep consistent, not a security boundary. The findings are therefore integrity and consistency gaps in that role model and in the saved data, not remotely exploitable vulnerabilities.
* **The biggest new input in v3 is the Excel reader.** `src/app/imports/xlsx.ts` is a dependency-free `.xlsx` reader (ZIP directory, DEFLATE through the browser's `DecompressionStream`, and a small XML tokenizer). A workbook a user is sent and then imports is untrusted, so the review treated it as hostile input: the worst realistic outcome is a frozen or crashed browser tab, since the reader never executes content, fetches anything or writes outside the import preview.
* **How.** An independent review of the source, followed by a re-check of each fix. Fixes are pinned by the domain tests, the independent verifiers under `test/verify`, and a UI sweep (`test/ui/flows/persona-isolation.test.tsx`) that visits every route and tab as the view-only persona and fails on any control that could change data.

## v3 release

**What was reviewed.** The Excel reader and the import paths that use it (`src/app/imports/*`, the Data, Assets and Trial balance imports), bulk fund import (`src/domain/entities/fundsImport.ts`), custom obligations and the calendar `.ics` export (`src/domain/entities/obligations.ts`), the due-diligence report (`src/domain/duediligence/*`), the expense allocation policy, SG fund sections, the property-tax notice and asset disposal reducers, and the saved-state schema additions (`src/domain/core/schema.ts`, `normalise.ts`).

Each finding was reproduced with a proof-of-concept before it was fixed; the confidence scores are the lead's assessment after reproducing it.

| # | Severity | File | Lines | Finding | Confidence | Fix | Covered by |
|---|----------|------|-------|---------|------------|-----|------------|
| 1 | 🟡 MEDIUM | src/app/imports/xlsx.ts | 502–557 | A few short shared strings referenced by very many cells expanded past every size cap (each cap was on the compressed or XML size, not on the text produced), freezing the tab | 9/10 | A running cap of 4 MB of output text, checked cell by cell while the sheet is read; an empty shared-string reference now reads as empty | `test/app/imports/xlsx.test.ts` ("stops a few repeated shared strings…", "reads a shared-string cell with no index as empty…") |
| 2 | 🟡 MEDIUM | src/app/imports/xlsx.ts | 383–405, 528–531 | A crafted custom number format in `styles.xml` hit a regular expression with quadratic backtracking, stalling the reader | 9/10 | A linear scan replaces the regular expression; format codes longer than 255 characters are treated as "not a date"; each format is evaluated once; cell references longer than 12 characters are ignored | `test/app/imports/xlsx.test.ts` ("reads a very long custom number format or cell reference in linear time", "still recognises ordinary custom date formats…") |
| 3 | ⚪ LOW | src/app/imports/xlsx.ts | 140–177 | The decompressor was handed a whole compressed part at once, so it inflated a full chunk before the size check could stop it | 8/10 | Compressed data is fed in 4 KB slices on demand and the running size is checked after every chunk | `test/app/imports/xlsx.test.ts` ("inflates a highly compressible part in slices…") |
| 4 | ⚪ LOW | src/app/workspaces/property-taxes/PropertyTaxesBody.tsx, src/domain/ptax/reducer.ts | 383–389; 1–4 | The Property taxes page hid its buttons by workflow status while the reducers accepted the same actions in any status, so the page and the store disagreed about who may change property-tax records | 8/10 | The page now gates exactly as the reducers do, on role and fund access: property-tax records sit outside the distribution sign-off, like GST and obligations. Profiles need edit; notices and payments need edit or lodge. The page note and the reducer comment say so | `test/app/property-taxes/workspace.test.tsx` ("buttons follow the ptax reducers…") |
| 5 | ⚪ LOW | src/domain/core/schema.ts | 287 | The saved-state schema accepted up to 20,000 custom obligations while the add action stops at 500, so a crafted backup could load far more than the app would ever create | 9/10 | One shared `MAX_OBLIGATIONS` (500) used by the schema and the reducer | `test/domain/contract-v3.test.ts` ("the saved-state schema caps obligations…") |

**Integrity notes (not vulnerabilities).**

* *Fixed:* a saved calculation version's input hash ignored a non-resident fund holder's exemption section, which changes that holder's withholding rate, so changing it did not mark saved versions as stale. The hash now includes the section when it is set, so versions saved before sections existed keep their hashes (`src/domain/governance/versions.ts`; `test/domain/contract-v3.test.ts`, "a saved version's input hash covers…").
* *Accepted:* bulk fund import refuses a fund whose name matches an existing fund, including funds hidden from the importing persona, so the refusal reveals that the name exists. Only the Head of Tax can import funds (it needs the manage-access permission), and the Head of Tax can already give themselves access to every fund, so this reveals nothing the role cannot already see.

**Also checked and found sound** (each pinned by a test in `test/app/imports/xlsx.test.ts`): unsafe ZIP paths, unsupported compression methods, ZIP64 and encrypted entries, ZIP and central-directory size bombs, corrupt directory offsets, DTDs and entity declarations, deep nesting and token floods in the XML, over-long cells, over-wide sheets and too many rows. Every check fails fast with a readable message.

## v2 release

**What was reviewed.** Every new action handler (`src/domain/{gst,ptax,assets,governance,entities}/reducer.ts`), the imports (GST ledger, assets, holders, properties, full backup), the Compare parser, the saved-state schema and store, what each workspace shows each persona, and the build's Content Security Policy.

### Findings

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

## Defence in depth added in v2

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
