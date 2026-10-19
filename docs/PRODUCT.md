# Product

What the app does and how it looks. This is the behavioural specification the implementation follows; where it says "the reference" it means the managed-app prototype this product was built to be compared with (see [REFERENCE-PARITY.md](./REFERENCE-PARITY.md) for every deliberate difference).

Rules (rates, thresholds and due dates) come from the engine in `src/engine`, cited in [rules/](./rules), never from this document.
## Product shape
Eight workspaces under one header: **Distributions, Trial balance, Tax returns, Investor reporting, Cost base & CGT, Bulk review, Analytics, Access.**
Header: title "PROPERTY FUND TAX COMPLIANCE" (uppercase, letter-spaced), nav (icon + label), **Working as** select (8 personas), **All / Australia / Singapore** radio-group.
Fund workspaces (first five) have a left rail grouped by market with a badge ("AU"/"SG"), status chip and exception count; the other three are portfolio level.
A persona only sees the funds in `user.funds` everywhere (rail, bulk review, analytics, deadlines). Funds: 5 AU AMITs, 4 SG S-REITs (see seed).
Workflow: Preparing -> In review -> Signed off (signed-off funds are locked; reopen returns to Preparing). Governance per fund: `agent-lodges`, `agent-signs-off`, `no-agent`.
Roles/permissions: see `src/domain/permissions.ts` (verified live against the reference).

### Distributions (per fund)
Header block: market badge + status chip; fund name (h2); facts row (REGIME `AMIT · Office · Listed`, PERIOD, UNITS ON ISSUE, AMMA DUE or FORM UT `YA2027 · due 15 Apr 2027`);
governance label (uppercase) and the approvals chain: `Reviewer pending|done, L. Brennan, 1 Sep 2026`, `Tax agent ...`, `Sign-off pending · Head of Tax` (or done + who/when), plus `N open query/queries`.
Action buttons (only those the persona can take; some shown disabled with the hint below): Submit for review | Return to preparer, Approve as reviewer, Approve as tax agent, Sign off, Reopen.
Hint under a disabled Sign off: `Sign-off waits for: Reviewer and Tax agent approval.` Lock banner in the chart header: `Signed off — reopen to edit` / `In review — return to preparer to edit` / `View only for your role`.
Panel "DISTRIBUTION BY TAX CHARACTER": Sankey (sources = components, targets = Australian residents / Foreign investors, net / Withheld for the ATO / Units not on register), a plain-language narrative sentence,
and a components table: Component (label + treatment line) | Amount | c / unit | per-destination columns (with colour keys); only components with an amount are listed (zero rows are omitted); total row "Total by tax character"; "Cash distribution — Paid for the income year". The AU doubled discount-gain line is labelled "AMIT CGT gross-up amount — TARP" (the ATO's term).
AU KPI strip: FUND PAYMENT, AMIT COST BASE NET AMOUNT (`excess — members decrease their cost base` / `shortfall — members increase their cost base`), WITHHOLDING COMPUTED (`N foreign holders on the register`).
SG KPI strip: TAXABLE SPECIFIED INCOME, TAXABLE PAYOUT (`85.0%` with `Tax transparency needs at least 90% for the year`), TRUSTEE TAX ON RETAINED INCOME (`S$1,068,620 · 17% of S$6,286,000 retained`).
Preparers see an **edit form** instead of read-only values while the fund is Preparing: AU 9 money inputs (labels from the reference: Australian income — other, Non-concessional MIT income, Excluded from NCMI — transitional, Clean building MIT income, Australian interest, Discounted capital gains — TARP, Other capital gains — TARP, Assessable foreign income, Cash distribution), SG 4. Inputs are text boxes with grouping; commit on blur/Enter; Escape reverts.
"REVIEW" tabs (WAI-ARIA tabs): **Withholding** (holders table: HOLDER (+country) | TAX STATUS (+rate summary) | UNITS | GROSS CASH | WITHHELD | NET CASH | Statement button; register total row; `WITHHOLDING RECONCILIATION` computed vs remitted, `Reconciled` / `Variance A$1,482,000.00 under-remitted` / not remitted; Preparers can edit units and the remitted amount while Preparing),
**Statements** (holder picker + inline statement document + Download PDF; AU "AMIT member annual statement", SG unitholder statement),
**Checks** (badge with count of exceptions, else notes; each check: EXCEPTION/NOTE tag, title, detail), **Queries** (badge with open count; new query subject+message form; threads with Reply and Resolve; open/resolved chip),
**Audit trail** (newest first: `7 Oct 2026, 11:30` / action · actor / detail), **Rules** (table ITEM | TREATMENT | BASIS).

### Trial balance
Header chips: `Balanced`, `All accounts mapped`, `Matches the distribution`; lock banner; `Download CSV`; `Import trial balance` (CSV: account,name,current,prior[,category]; preparer only; replaces rows).
BOOK TO TAX reconciliation table (AU: ends `Net income attributed to members`; SG: ends `Taxable specified income` plus `Divestment gain available for capital distribution`).
TAX ADJUSTMENTS (editable money inputs while Preparing). DISTRIBUTION COMPONENTS: Trial balance vs Distribution per component, agreement flag, button `Update distribution` (copies TB-derived components into the fund's inputs; Preparing only).
ACCOUNTS AND TAX MAPPING: sort select (Account | Largest change), `Highlight changes over (%)` threshold input, table ACCOUNT | TAX CATEGORY (select while Preparing; shows category + treatment) | CURRENT | PRIOR | CHANGE | CHANGE %; total row `Total (debits less credits)`; footnote `Debits are positive and credits negative.`
**Derivation hint (verified by arithmetic on the seed):** assessable income excluding capital gains = Σ rent-type income − deductible expenses − Div40 − Div43 (+ none), interest = interest-income account, and the net rent-type income is split across `other / ncmi / excludedNcmi / cleanBuilding` pro rata to the gross income in each rent category (Harbourline: 54,523,700 x 9,914,203/87,112,478 = 6,205,300 clean). Seed TB rows must reproduce the seed `inputs` for all nine funds (golden test).

### Tax returns
Readiness card ("TAX RETURN LODGMENT" AU / "FORM UT FILING" SG): `Ready` or `Not ready`, four items (Distribution signed off; No open exceptions; Trial balance agrees to the distribution; Withholding remitted and reconciled) each with Done/To do + detail line.
RECORD LODGMENT (AU: "ATO receipt reference"; SG: "IRAS acknowledgement reference"), date, `Record lodgment` button (needs `lodge`, fund Signed off). Shows the recorded lodgment once saved.
WORKING PAPERS: inline document + `Download PDF`. AU "AMIT tax return and schedule — working papers" (assessable income components, capital gains, withholding obligations, key financial information, trustee liabilities, unders and overs); SG "Form UT YA2027 — working papers" (tax computation, tax transparency, tax payable by the trustee, s45G withholding, key financial information, distributions tracking schedule).

### Investor reporting
AU: FUND PAYMENT NOTICES list (quarters, `Paid 14 Nov 2025 · A$22,604,000`, `Published 7 Nov 2025`), selected notice document (+ Download PDF, `Publish` for preparers/head of tax on unpublished, `Published ... — locked.`), table NOTICES AGAINST THE YEAR'S COMPONENTS (published vs year, difference),
ANNUAL INVESTMENT INCOME REPORT readiness (3 items), AIIR due + withholding report due, RECORD LODGMENT, AIIR INVESTOR LINES table + Download CSV.
SG: DISTRIBUTION TAX NOTICE (`Announced 30 Jul 2026`, Download PDF, Publish), notice document (record date, the manager's declaration cut-off for Form A and Form B, payment date, YA; distribution by type with cents per unit (6 dp) and amount; tax treatment by unitholder), WITHHOLDING TAX FILING · S45G (date of payment, file and pay by (+ ` — overdue`), tax deducted, paid to IRAS, table by unitholder, Download CSV).

### Cost base & CGT
AU: UNREALISED CGT ON PROPERTIES (select DEFERRED TAX FOR: Foreign investor — EOI country | Foreign investor — non-EOI country | Australian complying super fund | Australian company; Download CSV, Download PDF), property table (PROPERTY (+location) | ACQUIRED (+held label) | TAX COST BASE (+`after A$ capital works`) | VALUATION | UNREALISED GAIN), summary (Gains; Less: losses; Gains held 12 months or more, after losses; Other gains, after losses; Less: 50% CGT discount at the trust; Net capital gain if sold at valuation; Deferred tax — <investor>), then UNIT COST BASE (unit price + basis, adjustment label, per-holder table opening/adjustment/closing/per unit/market value/unrealised, total, footnote on E10).
Deferred-tax check values (EOI investor): Harbourline 28,926,024; Southbank 41,589,080; Kurrajong 40,151,760; Coastline 10,362,870; Wattle 0 (15% of gains held 12 months or more after losses, before the discount). Derive the other three investor types from the engine/law, cite them, and add them to REFERENCE-PARITY if you cannot confirm against the reference UI.
SG: UNREALISED GAINS ON PROPERTIES (cost, valuation, gain; note `Singapore doesn't tax capital gains. A gain on disposal is taxed at the trustee only if it's revenue in nature, and a distribution of a capital gain isn't taxable to unitholders.`), UNIT COST BASE with `Return of capital reduces the cost of units` and footnote `A return of capital reduces the cost of units (ITA s35(15C)). For traders, any amount above cost is taxable trading income.`

### Bulk review
Table (checkbox per row + select all): FUND (market badge + name + governance label) | STATUS | APPROVALS (`Reviewer done · Tax agent pending`) | EXCEPTIONS | OPEN QUERIES | NEXT FOR YOU. Buttons: Submit selected, Approve selected as reviewer, Sign off selected (disabled when nothing eligible is selected). After running, show a result summary (done / skipped with reasons). Footnote: `Bulk approval and sign-off skip funds with open exceptions; bulk sign-off also skips funds with open queries or missing approvals. Sign those off from the fund itself.`

### Analytics
Jurisdiction radio-group; heading `Portfolio analytics`; `Download Power BI workbook` button (xlsx) with helper text; **TAX LEAKAGE — % OF EACH DISTRIBUTION** (horizontal stacked bars: Final withholding / Withholding holders can recover / Tax paid by the trustee; headline sentence; data table); **DISTRIBUTION MIX BY TAX CHARACTER** (100% stacked: Taxable income / Capital gains / Tax-exempt / Tax-deferred and capital; headline; table);
**DEADLINES · N OVERDUE** (table DATE (`Wed 30 Sep 2026`) | FUND | OBLIGATION | STATUS; `Show completed` toggle); **DISTRIBUTION SCENARIO** (fund select; AU input `Scenario cash distribution (AUD)` money text box; SG number input 0–100 `Taxable payout (% of taxable specified income)`; table MEASURE | NOW | SCENARIO).
AU scenario rows: Cash distribution; AMIT cost base net amount (`excess`/`shortfall`); Per unit (cents); Attributed to members; note `Attributed amounts and the fund payment don't change with cash. Paying less than the attributed amounts creates a shortfall that increases members' cost base.`
SG scenario rows: Taxable distribution; Retained by the trust; Trustee tax at 17%; Withholding on the distribution; Meets the 90% condition (Yes/No). Verified live: Loyang at 85% -> taxable distribution S$60,554,765, retained S$10,686,135, trustee tax S$1,816,643, withholding S$2,422,191, condition No. Note: `The 90% condition applies to the year as a whole; withholding scales with the taxable distribution at today's unitholder mix (98.0% paid out now).`
The AU scenario box is a normal money field: the reference prototype concatenated digits when typing a number, which this app does not reproduce.

### Access
Heading `Access and governance` + disclaimer `Roles apply within this app's screens. Anyone who can open the app can switch who they're working as, so this isn't a security boundary.`
USERS table (name `working as` marker for the current persona, title · organisation, role, funds, `Change funds` (manage-access only; opens a dialog with checkboxes per fund + All funds)); GOVERNANCE BY FUND table (status, governance select (manage-access, not for Signed off), approvals before sign-off, who records lodgment); PERMISSIONS BY ROLE matrix (check/dash per role) + footnote `Tax agents approve only where a fund's governance includes a tax agent, and record lodgment only where the agent lodges. Whoever submits a fund can't also approve it as reviewer.`
Non-managers see the same page read-only. Also host the **Reset demo data** action here (confirm dialog).

## Visual design (tokens from the reference stylesheet; oklch)
Light: background `oklch(91% .025 300)`, foreground `oklch(14.5% 0 0)`, card `oklch(99.3% .002 300)`, primary `oklch(46% .18 300)` (purple), primary-foreground `oklch(99% 0 0)`, secondary/muted `oklch(97% 0 0)`,
muted-foreground `oklch(50% 0 0)`, accent `oklch(95% .02 300)`, accent-foreground `oklch(40% .14 300)`, destructive `oklch(57.7% .245 27.325)`, border/input `oklch(84% .045 300)`, ring = primary, radius `.375rem`;
charts: 1 `oklch(60% .1 300)`, 2 `oklch(65% .1 200)`, 3 `oklch(60% .14 150)`, 4 `oklch(65% .13 70)`, 5 `oklch(60% .16 25)`.
Dark (apply under `@media (prefers-color-scheme: dark)`): background `oklch(13% .025 300)`, foreground `oklch(98.5% 0 0)`, card `oklch(19% .03 300)`, primary `oklch(64% .18 300)`, primary-foreground `oklch(15% .01 300)`, border `oklch(34% .05 300)`, accent `oklch(27% .06 300)`.
Type: **Geist Variable** (already bundled via `@fontsource-variable/geist`), body 16px/400, nav 14px/500, h1 13px/600 uppercase letter-spacing .14em, small caps labels 11px/600 uppercase tracking-wide muted.
Nav item: 14px/500, radius ~.3rem, active = accent background + accent-foreground. Status chips: AU badge dark blue (`oklch(40% .12 250)` on white text), SG badge crimson (`oklch(48% .2 20)`);
status colours: Signed off = purple chip with a lock icon; In review = amber/brown (`oklch(48% .12 55)` bg, white text); Preparing = white chip with border; exceptions = red chip `N exceptions`; `No exceptions` = muted text.
Destination colours in Sankey/columns: Australian residents/Paid gross = chart-1 purple, Foreign investors net = chart-2 teal, Withheld = chart-4 amber, Units not on register = chart-5 red/grey.
Leakage bars: Final withholding amber, Recoverable teal, Trustee tax red.
Layout: max content width fluid; left rail ~300px; panels are cards with 1px border, header strip uppercase 12px/600 tracking .08em; tables are dense (13px) with right-aligned tabular numbers (`font-variant-numeric: tabular-nums`).
Accessibility: skip link ("Skip to fund workspace"), landmarks, labelled form controls, visible focus, tabs per WAI-ARIA, tables with real `th`, charts have a text narrative and a data table, colour is never the only signal, respects `prefers-reduced-motion`. Min contrast AA.

## Beyond the reference: platform workspaces

These workspaces have no counterpart in the reference prototype. They bring in the rest of the engine and the platform functions a tax team needs around the distribution.

### GST & BAS (`#/gst`, fund)
Quarter selector (`?period=` period end); summary (net GST payable or refundable, due date with its basis, status); the return as a table (AU BAS labels G1, G2, G3, G10, G11, 1A, 1B in whole dollars; SG GST F5 boxes to the cent), each row expandable to the ledger lines behind it; the ledger for the period (or all periods) with human code labels, add/edit/delete, CSV import (locked periods refused) and export; checks; lodgment record (reference and date, entered by whoever records lodgment under the fund's governance; others see who does; locks the period; unlock needs `reopen` and a reason); SG: IRAS Audit File download; AU: BAS worksheet CSV. Entries inside any lodged period are locked.

### Property taxes (`#/property-taxes`, fund)
Tabs `annual` (AU land tax per property for NSW, VIC, QLD, WA (with the Metropolitan Region Improvement Tax) and SA (general or trust rates), SG property tax on the annual value; rate basis in plain words; totals exclude anything not modelled), `duties` (transfer duty or BSD/ABSD on each acquisition, with deadlines; SA charges none on non-residential land from July 2018), `profiles` (editable tax profile per property; the land tax treatment of a trust is an assumption shown on the page). Payments can be recorded per property and tax, which marks the deadline done.

### Assets & allowances (`#/assets`, fund)
The fixed asset register grouped by property (Division 40 plant, Division 43 capital works, borrowing costs; SG capital allowances), this year's deduction per asset with its basis, a ten-year schedule, PDF and CSV; "Register vs trial balance" compares the register's totals with the trial balance adjustments, and "Use register totals in the trial balance" copies them while the fund is Preparing.

### Compare (`#/compare`, fund)
Choose a statement (distribution components, withholding by holder, book-to-tax, working papers, investor reporting, cost base, GST/BAS, property taxes, assets), download our figures, load theirs (CSV, Excel paste or the practice file), check the detected columns, then read the line-by-line result (match, within tolerance, differs with hints, only in theirs, only in ours), remap lines, export the comparison or raise it as a query. Nothing leaves the browser.

### Compliance calendar (`#/calendar`, portfolio)
Agenda (overdue first, then the next 90 days) or one month at a time (`?month=`), filters, links to the workspace that handles each obligation, and an iCalendar (.ics) download of the open obligations.

### Risk register (`#/risks`, portfolio)
Every open exception and note from distributions, trial balances, GST, property taxes and the asset register, grouped by fund, filterable, exportable to CSV, each with a link to fix it.

### Calculators (`#/calculators`, portfolio)
Sixteen engine calculators (AU and SG), deep-linkable with `?calc=`, each showing the rules it used and their sources.

### Rules & sources (`#/rules`, portfolio)
Every rule in the engine: title, market and domain, effective dates, primary sources, confidence and notes; search, filters and deep links (`?id=`).

### Data (`#/data`, portfolio)
Tabs `funds` (create, edit, delete with typed confirmation), `holders` and `properties` (edit while Preparing; CSV import with templates; read-only for anyone who cannot edit the fund), `backup` (download and restore everything in this browser; Head of Tax only). Every list shows only the funds the persona can see.

### Governance (across workspaces)
Submitting, signing off and reopening a fund each save a calculation version (inputs hash plus key results); the Distributions **Versions** tab lists them and compares any two or a version with the current figures, and anyone who edits, reviews or signs off the fund can save one by hand. Reopening needs a reason of 5 to 500 characters, asked for in a dialog. The Trial balance has manual tax adjustments with reasons and a prior-year column in the book-to-tax reconciliation.