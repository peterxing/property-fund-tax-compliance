# Property Fund Tax Compliance

A browser-only tax compliance workspace for property funds: **Australian AMITs/MITs (AUD)** and **Singapore S-REITs (SGD)**. It covers the trial balance and the distribution, withholding and investor notices, plus GST/BAS, land and property tax, duties, capital allowances, returns, deadlines, risks and tax due diligence.

**Live demo:** <https://peterxing.github.io/property-fund-tax-compliance/>

> Demonstration only. The funds, holders, trial balances and people are fictional, the rules come from an engine that no tax adviser has reviewed, and nothing is submitted to the ATO or IRAS. Read [docs/LIMITATIONS.md](docs/LIMITATIONS.md) before relying on any figure.

**Reviewing the tax calculations?** Start at [docs/rules](docs/rules/README.md). Every calculation is documented there with its legal basis, the method and rounding exactly as coded, rates by effective date, worked examples you can re-perform (most on the demo funds, so you can open the same figures in the app), the tests and independent checks behind it, and a confidence grade. The worked examples and rate tables are recomputed by the test suite, so the documents cannot drift from the code.

## What it does

Eighteen workspaces in two groups behind one header, with a **Working as** switch that changes what each role can do (preparer, reviewer, tax agent, Head of Tax, view only) and an **All / Australia / Singapore** filter.

**Fund workspaces** (for the fund chosen in the left rail):

| Workspace | What you can do |
|---|---|
| **Distributions** | See a fund's distribution by tax character (Sankey, components, per-holder withholding), edit inputs while *Preparing*, then work through **Withholding, Statements, Checks, Queries, Audit trail** and **Rules** |
| **Trial balance** | Book-to-tax reconciliation, tax adjustments, the fund's expense allocation policy with a live preview, account-to-category mapping, CSV or Excel import and CSV export, and "update distribution from trial balance" |
| **Tax returns** | Readiness checklist, record a lodgment reference, working-papers document and PDF (AMIT return and schedule, or Form UT) |
| **Investor reporting** | AU fund payment notices, AIIR and withholding report; SG distribution tax notice and s45G withholding filing, with each foreign fund holder's exemption section (13D, 13U, 13V or 13OA) |
| **Cost base & CGT** | Unrealised CGT and deferred tax by investor type (AU), unit cost base after AMIT cost base net amounts or returns of capital, and a check of property valuations against the trial balance (SG) |
| **GST & BAS** | The GST ledger, quarterly BAS (AU) and GST F5 (SG) built from it, checks, lodgment records, CSV or Excel import and CSV export, and the IRAS Audit File (SG) |
| **Property taxes** | Land tax in all eight States and Territories (AU) and property tax (SG) per property, duties paid on acquisition (transfer duty; BSD and ABSD), assessment notices with the variance to the modelled figure, payments, and editable tax profiles |
| **Assets & allowances** | The fixed asset register behind Division 40 and 43 deductions (AU) and capital allowances and section 14N renovation deductions (SG), with disposals and balancing adjustments, the low-value pool, schedules and a check against the trial balance adjustments |
| **Compare** | Put this platform's figures next to another system's export for the same fund (CSV, an Excel paste or an `.xlsx` file), with matching, tolerances and an exportable result |
| **Tax due diligence** | A read-only report for the fund: entity and regime, workflow, distributions and withholding, lodgments, open items, property taxes and duties, allowances and cost base, and data quality, each marked Clear, Attention or Issue, with CSV and PDF |

**Portfolio workspaces** (across the funds you can see):

| Workspace | What you can do |
|---|---|
| **Bulk review** | Submit, approve or sign off many funds at once, with reasons for every fund skipped |
| **Analytics** | Tax leakage, distribution mix, deadlines, a distribution scenario, and a Power BI workbook export |
| **Compliance calendar** | Every filing and payment deadline (distributions, GST/BAS, land and property tax, duties, returns) plus your own recurring obligations (council rates, insurance, payroll, FBT), by month or as an agenda, with an iCalendar (.ics) download |
| **Risk register** | Every open exception and note across funds, from distributions, trial balances, GST, property taxes, assessment notices, custom obligations and the asset register, filterable and exportable |
| **Calculators** | Stand-alone calculators on the same engine: transfer and landholder duty, land tax, CGT and foreign-resident withholding, MIT withholding, Division 40 and 43, company tax, borrowing costs (AU); stamp duties, property tax, withholding tax, corporate income tax, GST tests, badges of trade, capital allowances (SG) |
| **Rules & sources** | Every rule the engine applies, with effective dates, primary sources and a confidence grade, and a **Fund settings** tab with each fund's tax settings side by side (governance, expense allocation, withholding, land tax trust treatment, manual adjustments) and a CSV |
| **Data** | Create, edit and delete funds; bulk-import funds; maintain holders and properties; CSV or Excel imports with templates; back up and restore everything in this browser |
| **Access** | Users and fund access, governance mode per fund, the permissions matrix, and **Reset demo data** |

![Distributions: a fund in review with its Sankey of tax characters, components, key figures and review tabs](docs/img/distributions.png)

![Trial balance: book-to-tax reconciliation, tax adjustments, components against the distribution and account mapping](docs/img/trial-balance.png)

![Analytics: tax leakage and distribution mix by fund, deadlines and a distribution scenario](docs/img/analytics.png)

The workflow is **Preparing, In review, Signed off**. Governance per fund decides whether a tax agent approves, signs off or lodges. Signed-off funds are locked until reopened (reopening needs a reason), every step lands in the audit trail, and each submission and sign-off saves an immutable calculation version that can be compared with the current figures.

Nine fictional funds ship with the demo: five Australian AMITs (Harbourline, Southbank, Wattle, Kurrajong, Coastline) and four Singapore S-REITs (Telok Ayer, Loyang, Meranti, Kallang), chosen so that each shows a different situation (an overdue AMMA, an under-remitted withholding variance, an unmapped account, a payout below the 90% condition, and so on).

## Run it

```powershell
npm ci
npm run dev        # rebuilds on change into dist/
npm run preview    # serves dist/ at http://127.0.0.1:4173
```

```powershell
npm test           # engine + domain + UI tests
npm run typecheck
npm run build      # static site in dist/
```

Node 22 or later. There is no server, database or configuration. Your edits live in the browser (`localStorage`); **Access, Reset demo data** restores the original data.

## How it is built

* `src/engine`: the calculation core. Pure TypeScript in integer cents, cited to legislation, with its own tests: trust components, MIT withholding and due dates (AU); REIT tax transparency, withholding and Form UT (SG).
* `src/domain`: the product logic. Types, seed data, workflow and permission rules, per-market modules (`au/`, `sg/`) that turn engine output into view models, feature modules (`gst/`, `ptax/`, `assets/`, `governance/`, `entities/`, `compare/`, `portfolio/`, `duediligence/`), and a store. No DOM or React.
* `src/app`: React 19 UI (esbuild, no UI kit): shell and design system, one folder per workspace, CSV, XLSX and PDF exports that load on demand, and a small in-browser `.xlsx` reader for imports.
* `test`: the engine suite, independent verifier tests written from primary sources, domain tests including golden tests against the reference figures, helper tests, headless-DOM UI tests, and documentation tests (`test/docs`) that recompute every worked example in `docs/rules`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/REFERENCE-PARITY.md](docs/REFERENCE-PARITY.md), [docs/rules](docs/rules/README.md) (tax rules and calculations, for reviewers) and [SECURITY-REVIEW.md](SECURITY-REVIEW.md).

## Relationship to the reference prototype

This repository re-implements, on top of an existing and separately tested tax engine, the product shape of a managed-app prototype of the same idea, so that the two can be compared side by side. It copies no source from that prototype. Wherever the prototype and the engine or the law disagree, the engine and the cited law win and the difference is recorded in [docs/REFERENCE-PARITY.md](docs/REFERENCE-PARITY.md).
