# Architecture

Three layers with one-way dependencies: **engine, domain, app**. Each layer can be tested without the one above it.

```
src/engine   pure tax maths in integer cents (cited, tested)          <- no React, no DOM, no node: imports
src/domain   product model: types, seed, workflow, markets, store     <- imports engine
src/app      React 19 UI, exports, routing                            <- imports domain
```

## Engine (`src/engine`)

Pure functions over integer minor units (`Cents`) and ISO dates. Rules carry their source (section, rate, effective dates) and are described in `docs/rules/*.md`.

* **Australia:** AMIT trust components and member attribution, AMIT cost base net amounts, AMMA statements, MIT withholding (fund payment, NCMI, clean building MIT income, interest) and the AIIR and withholding-report due dates, CGT and discount.
* **Singapore:** REIT tax transparency and trustee tax, investor classes and withholding (s45G), Form UT dates, distribution allocation to unitholders.
* Further calculators (transfer duty, GST, company tax, land tax, capital allowances) are kept, tested and **not surfaced in this UI**.

## Domain (`src/domain`)

| Path | Role |
|---|---|
| `types.ts` | The contract: state (`AppData`), actions, and every **view model** the UI renders |
| `seed/` | The demo dataset (nine funds, holders, trial balances, notices, queries, audit) in integer cents |
| `permissions.ts` | Roles, actions, governance modes and `can()`: the single source of truth for who may do what |
| `actions.ts` | `applyAction` and `applyBulk`: pure reducers that enforce permissions and workflow rules and append to the audit trail |
| `store.ts` | An in-browser store (`createStore`): persistence to `localStorage`, current persona, jurisdiction filter, selected fund. React-agnostic |
| `selectors.ts`, `core/` | Pure functions from `(data, ctx)` to view models: workflow, fund rail, bulk rows, analytics, access, workbook |
| `market.ts` | The `MarketModule` interface every market implements |
| `au/`, `sg/` | The two markets: distribution calculation and withholding per holder, checks, trial-balance derivation and book-to-tax, notices and statements, cost base, deadlines, leakage, mix, scenario, rules |
| `shared/sankey.ts` | The Sankey model shared by both markets |

Design rules:

* **Everything is derived.** Stored state is small (inputs, holders, trial balance, approvals, queries, audit). Components, withholding, checks, deadlines and statements are recomputed by pure selectors, so an edit anywhere updates every workspace.
* **Rules live in the engine.** A market module adapts engine output to view models and never carries a rate or a due-date rule of its own. Where the reference prototype and the engine disagree, the difference is recorded in `docs/REFERENCE-PARITY.md`.
* **Actions never throw for rule violations.** They return `{ ok: false, reason }` with a message the UI shows as is.
* **`now` is injected** (`Ctx.now`), so deadline status is deterministic in tests.

## App (`src/app`)

* `main.tsx`, `App.tsx`: mount, providers, error boundary.
* `state.tsx`: binds the store with `useSyncExternalStore` and exposes hooks (`useAppData`, `useCtx`, `useDispatch`, `useFundCalc`, `useWorkflow`).
* `router.ts`: hash routes (`#/trial-balance?fund=southbank`), so refresh and deep links work on a static host.
* `shell/`: header, fund rail, fund header with the workflow buttons, frames, footer.
* `ui/`: accessible primitives (panel, tabs, tables, fields, money and number inputs, dialog, live region, banners) and their pure parsing helpers.
* `charts/`, `doc/`: SVG Sankey and stacked bars from view models; `DocView` renders a `DocModel` as a statement. The same `DocModel` becomes the PDF.
* `workspaces/<name>/`: one folder per workspace with its model (pure helpers, unit-tested), components and CSS.
* `exports/`: CSV (with formula-injection guard), a minimal `.xlsx` writer, and PDF via pdfkit. The heavy renderers are lazy chunks, loaded on the first download.
* `styles/`: oklch design tokens (light and dark), base and component CSS.

## State and persistence

`Persisted = { data: AppData, ui: UiState }` is saved to `localStorage` (`pfc.state.v1`) on every change. On load an invalid, outdated or unreadable value falls back to the seed. The Access page has **Reset demo data**.

## Build and deploy

`scripts/build.mjs` bundles with esbuild (ESM, code splitting, relative asset URLs) into `dist/`; `scripts/serve.mjs` serves it like a static host. GitHub Actions deploys `dist/` to Pages. Details in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Testing

| Suite | Command | What it proves |
|---|---|---|
| Engine | `npm run test:engine` | Tax maths against statutory examples |
| Domain | `npm run test:domain` | Seed integrity, workflow and permission matrix, persistence, and **golden tests** that pin every market module to the reference figures (components, per-holder withholding, checks, deadlines at a fixed date, deferred tax, scenarios) |
| App helpers | `npm test` | Router, input parsing, chart layout, exports (CSV, XLSX, PDF) and each workspace's model |
| UI | `npm run test:ui` | Headless-DOM rendering of the app: routes by persona, workflow buttons, and accessibility audits |

## Adding a workspace or a market

* **Workspace:** add a folder under `src/app/workspaces/`, register it in `workspaces/index.ts`, build its model as pure functions over selectors, and test the model.
* **Market:** implement `MarketModule` in `src/domain/<market>/`, register it in `modules.ts`, add its funds and holders to the seed and golden tests for each figure it must reproduce.
