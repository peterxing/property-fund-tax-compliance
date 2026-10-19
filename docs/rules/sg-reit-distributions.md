# Singapore S-REIT distributions

This document explains the Singapore S-REIT figures shown in the Distributions, Trial balance, Tax returns, Investor reporting, Cost base & CGT, Bulk review and Analytics workspaces. It follows the code in `src/domain/sg/**`, `src/engine/reitTax.ts`, `src/engine/distribution.ts` and the REIT parts of `src/engine/withholdingTax.ts`; money is integer cents unless a table says it is a displayed whole-dollar amount. The demo funds are Telok Ayer, Loyang, Meranti and Kallang.

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| Taxable specified income and the 90% transparency condition | Trial balance, Distributions KPIs, Checks, Tax returns, Analytics scenario | ITA 1947 s43(2), s43(2A); IRAS e-Tax Guide on REITs ¶5.3, ¶6.1, ¶8.4, ¶18.5 | `src/domain/sg/tb.ts`, `src/domain/sg/withholding.ts`, `src/engine/reitTax.ts` | C for displayed retained-only trustee tax and for the engine threshold / worst-case treatment; B for s45G rates and REIT filing dates |
| Distribution components and allocation | Distributions table, Statements, Investor reporting notice, Analytics mix | IRAS e-Tax Guide ¶8.3, ¶8.6, ¶8.8; engine rule [`reit-distribution.policy-allocation.2022-plus`](RULE-REGISTER.md#rule-sg-reit-distribution-policy-allocation-2022-plus) | `src/domain/sg/components.ts`, `src/domain/sg/util.ts`, `src/engine/distribution.ts` | C |
| s45G withholding by unitholder class | Distributions holder lines, Investor reporting s45G filing, Statements, Tax returns, Analytics leakage | ITA 1947 s45G; IRAS e-Tax Guide Annex 2 and ¶12-13 | `src/domain/sg/withholding.ts`, `src/engine/reitTax.ts` | B |
| Return of capital and cost base | Cost base & CGT, Statements, Investor reporting notice | ITA 1947 s35(15C); IRAS e-Tax Guide ¶8.8 | `src/domain/sg/costBase.ts`, `src/engine/distribution.ts` | C |
| Filings, due dates, checks and bulk review | Investor reporting, Tax returns, Deadlines, Bulk review | IRAS e-Tax Guide ¶13.1, ¶16.1; IRAS withholding-tax filing page | `src/domain/sg/investor.ts`, `returns.ts`, `deadlines.ts`, `checks.ts`, `rules.ts` | B for dates; C/D for notice cut-off wording |

## Tax transparency and taxable specified income

### What it computes

The app derives taxable specified income from the Trial balance, compares the taxable income distribution with the 90% transparency condition, and shows trustee tax on retained specified income. The same numbers feed Distributions KPIs, Tax returns working papers, Analytics scenario, Bulk review exceptions and the Rules tab.

### Legal basis

The engine rule [`reit-tax.transparency-and-distribution.2022-plus`](RULE-REGISTER.md#rule-sg-reit-tax-transparency-and-distribution-2022-plus) cites the IRAS e-Tax Guide on REITs. The code treats the 90% same-year distribution condition as the gateway for tax transparency, taxes retained specified income at the trustee at 17% when the display follows the reference app, and has an engine worst case where failing the condition denies transparency for all taxable specified income.

### Inputs

| App field / source | Units | Code path | Notes |
| --- | --- | --- | --- |
| Trial balance rows mapped to `rent`, `interest-income`, `deductible-expense`, `depreciation-book`, `fair-value`, `straight-line`, `book-gain-sale`, `non-deductible`, `exempt-income` | cents | `sgTbCalc` | Unmapped and unknown categories are excluded until mapped. |
| Capital allowances | cents | `capitalAllowancesOf` | Missing fund adjustments count as nil. |
| Manual adjustments with component `taxableSpecifiedIncome` | cents | `sgTbCalcFor` | Added after whole-dollar rounding. |
| Distribution input: Taxable specified income | cents | `fund.inputs.taxableSpecifiedIncome` | The Distribution input is not overwritten by the Trial balance view; the view only reports whether they agree. |
| Distribution input: Taxable income distribution | cents | `fund.inputs.taxableDistributed` | Compared with taxable specified income for the 90% test. |
| Notice payment date | ISO date | `paymentDateOf` | Fixes withholding rates and due dates. |

### Method

1. The Trial balance calculation flips credit balances to positive income, then computes `rent + interest - deductible expenses - capital allowances`.
2. It rounds rent + interest − deductible expenses − capital allowances to the nearest whole dollar with `roundToDollar`, adds manual taxable-specified-income adjustments, then floors the combined result at nil.
3. The ledger is balanced only when debits less credits are under 50 cents. Trial-balance taxable specified income agrees with the saved Distribution input when the absolute difference is 50 cents or less.
4. `trusteePosition` calls `computeReitTax` with taxable specified income and taxable distributed income. The threshold is read back from the engine: 90%.
5. Required minimum distribution is `taxable specified income × 9,000 / 10,000`, rounded by `mulBps` to cents.
6. The displayed primary trustee-tax figure is `max(0, taxable specified income - taxable distribution) × 17%`, rounded by `mulBps` to cents. This is the reference-app retained-only figure.
7. The engine's conservative worst case, exposed in checks when the 90% test fails, uses all taxable specified income as the trustee tax base and raises finding `REIT.TRANSPARENCY.FAIL`.

### Singapore REIT transparency rates and thresholds

| Item | Value coded | Effective date | Rule |
| --- | --- | --- | --- |
| Transparency threshold | 90% of taxable specified income | `2022-01-01` onwards in the engine rule | [`reit-tax.transparency-and-distribution.2022-plus`](RULE-REGISTER.md#rule-sg-reit-tax-transparency-and-distribution-2022-plus) |
| Trustee tax rate used by the SG display and engine default | 17% | current coded default | [`reit-tax.transparency-and-distribution.2022-plus`](RULE-REGISTER.md#rule-sg-reit-tax-transparency-and-distribution-2022-plus); [`cit.reit-trustee-prevailing-rate.2025-plus`](RULE-REGISTER.md#rule-sg-cit-reit-trustee-prevailing-rate-2025-plus) |
| Engine failure finding | `REIT.TRANSPARENCY.FAIL` | when taxable distribution is below the required minimum | `src/engine/reitTax.ts` |

### Worked examples

#### Example REIT-1: Telok Ayer full distribution walk-through

Telok Ayer Commercial REIT pays on 27 Nov 2026 and has 4,236,180,000 units on issue.

| Input | Amount |
| --- | ---: |
| Taxable specified income | S$58,412,600.00 taxable specified income |
| Taxable income distribution | S$58,412,600.00 taxable income distribution |
| Tax-exempt income distribution | S$3,118,400.00 tax-exempt income distribution |
| Capital distribution | S$1,905,800.00 capital distribution |
| Total distribution | S$63,436,800.00 |

Per-unit amounts are computed from cents divided by units on issue. The taxable component is 1.378898 cents per unit. Total distribution is 1.497500 cents per unit.

Telok Ayer distributes 100.0% of taxable specified income. The 90% required minimum is S$52,571,340.00, retained income is S$0.00 and trustee tax is S$0.00.

The holder allocation uses exact largest-remainder cents allocation across the unit register:

| Holder | Class | Taxable | Exempt | Capital | Gross | s45G tax | Net cash |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Individual unitholders (CDP, SRS & CPFIS) | Individual | S$23,365,040.00 | S$1,247,360.00 | S$762,320.00 | S$25,374,720.00 | S$0.00 | S$25,374,720.00 |
| Singapore resident companies | Qualifying unitholder | S$14,603,150.00 | S$779,600.00 | S$476,450.00 | S$15,859,200.00 | S$0.00 | S$15,859,200.00 |
| Oriole Assurance Pte Ltd | Qualifying unitholder | S$5,841,260.00 | S$311,840.00 | S$190,580.00 | S$6,343,680.00 | S$0.00 | S$6,343,680.00 |
| Sakuragawa Life Assurance | Qualifying non-resident non-individual | S$8,761,890.00 | S$467,760.00 | S$285,870.00 | S$9,515,520.00 | S$876,189.00 | S$8,639,331.00 |
| Nominee accounts without a declaration | Other unitholder | S$5,841,260.00 | S$311,840.00 | S$190,580.00 | S$6,343,680.00 | S$993,014.20 | S$5,350,665.80 |

Sakuragawa Life Assurance receives S$8,761,890.00 of taxable income; 10% final tax is S$876,189.00. Nominee accounts without a declaration receive S$5,841,260.00 of taxable income; 17% non-final tax is S$993,014.20. Total s45G tax deducted is S$1,869,203.20.

#### Example REIT-2: Kallang fails the 90% condition

Kallang Riverside Retail REIT pays on 30 Nov 2026. It has S$41,906,500.00 taxable specified income, so S$37,715,850.00 required minimum applies. S$35,620,500.00 distributed gives a 85.0% payout, leaving S$6,286,000.00 retained.

The displayed reference-app trustee tax is retained-only: 17% retained-only trustee tax is S$1,068,620.00. The engine worst case is S$7,124,105.00, because `computeReitTax` treats the failed condition as denial of transparency for all taxable specified income; the app still computes S$837,081.75 of s45G withholding on the displayed taxable distribution.

Analytics scenario at 85% shows S$35,620,500, S$6,286,000, S$1,068,620, S$837,082, No.

### Open decision: failed 90% test

When a Singapore fund fails the 90% condition, the displayed primary trustee-tax number is the reference app's retained-only figure. The law stated in the app is stricter: the engine's worst case taxes all taxable specified income at the trustee, and the s45G withholding shown by the app would fall away under that worst-case treatment because distributions out of trustee-taxed income are not taxed again. See docs/parity/sg.md for the reference-app parity decision. A reviewer should treat every failed-test fund as needing tax-adviser review.

### Edge cases

* A nil taxable specified income produces a 100% engine ratio and no trustee tax.
* A taxable distribution above taxable specified income raises the `over-distribution` check: the excess is described as return of capital for tax purposes.
* The engine has timing flags for same-year distribution and last-quarter distribution within three months, but the domain model does not expose fields for them. The domain therefore leaves them at the engine default of met.
* The Distribution KPI uses the saved input. The Trial balance view separately shows whether the ledger-derived figure agrees within 50 cents.

## Distribution components, allocation and rounding

### What it computes

The SG module has three displayed components: taxable income distribution, tax-exempt income distribution and capital distribution. There is no separate Singapore capital-gains bucket in Analytics; capital and tax-deferred amounts are reported as the capital distribution component.

### Legal basis

Taxable income distributions follow tax transparency and s45G withholding. Tax-exempt income and capital gains distributions are not taxable to unitholders in the app's rule table. Return of capital follows ITA s35(15C) and IRAS e-Tax Guide ¶8.8.

### Inputs

The Distributions workspace exposes four input boxes: Taxable specified income, Taxable income distribution, Tax-exempt income distribution and Capital distribution. The Trial balance derives only taxable specified income; the other three components are distribution decisions bounded by what is available but not overwritten by the Trial balance synchronisation.

### Singapore REIT component and rounding rules

| Calculation | Method coded | Rounding |
| --- | --- | --- |
| Component amount | `Math.round(fund.inputs.<component>)` | nearest cent if a non-integer reaches the domain |
| Per unit | `amount / unitsOnIssue / 100`, displayed by `perUnit` | notice uses 6 decimals; Distributions table uses 4 decimals |
| Holder component allocation | `allocateAcrossRegister(component, holder units, unitsOnIssue)` | BigInt largest remainder cents; ties to the earlier holder |
| Units not on register | units on issue less register units | their amount is a separate `Units not on register` destination |
| Holder withholding | taxable holder allocation × holder rate | `mulBps`, half away from zero to the cent |
| Displayed money | `money(cents, "SGD")` or `money(cents, "SGD", 2)` | whole dollars in most workspace tables; exact cents in notices, statements and tests |

### Method

1. `componentAmounts` rounds the three saved distribution components.
2. `registerShares` allocates each component across holder units plus a missing-units bucket if the register is short.
3. `buildHolderLines` applies withholding only to the taxable income distribution line. Tax-exempt and capital lines never have tax deducted.
4. `sgFundCalc` builds the destination columns Paid gross, Non-residents & others, net, Withheld for IRAS and, when needed, Units not on register.
5. Analytics mix divides each component by total character amount and rounds percentages to one decimal place.

### Component evidence

See the Evidence section near the end of this document.

### Confidence

Grade C. The rule entries cite primary IRAS guidance and the code is covered by unit tests. The exact cents-allocation method is a product-engine reconciliation policy, not an IRAS-prescribed rounding method.

## Section 45G withholding by unitholder class

### What it computes

The app classifies every holder into the engine's REIT investor classes, chooses the rate for the distribution payment date, deducts tax from the holder's taxable income distribution only, and builds the Investor reporting s45G filing rows.

### Legal basis

The engine rule [`reit-tax.withholding-and-declarations.2022-plus`](RULE-REGISTER.md#rule-sg-reit-tax-withholding-and-declarations-2022-plus) cites ITA s45G and the IRAS e-Tax Guide on REITs. Form A and Form B are treated as the declaration support for no-deduction or concessionary treatment. Missing support defaults to 17% non-final withholding.

### Inputs

| App field | Values | Code mapping |
| --- | --- | --- |
| SG class | `individual`, `qualifying`, `nrni`, `nr-fund`, `other` | `ENGINE_MAPPING` in `withholding.ts` |
| Fund exemption section | blank, `13D`, `13U`, `13V`, `13OA` | used only for `nr-fund` holders |
| Payment date | ISO date from the SG notice | selects the effective rate window |
| Taxable holder allocation | cents | only this line is subject to s45G withholding |

### Singapore REIT withholding rates

| Holder class | Declaration / condition | Rate coded | Effective window | App wording |
| --- | --- | --- | --- | --- |
| Individuals | not through a partnership, trade or business | 0% | all coded dates | Exempt · paid gross |
| Qualifying unitholders | valid Form A / Form B | 0% | all coded dates | Paid gross · taxed at own rate |
| Qualifying non-resident non-individuals | valid Form A / Form B | 10% | 2005-02-18 to 2030-12-31 | 10% final |
| Qualifying non-resident funds (13D/13U/13V) | valid Form A / Form B | 10% | 2019-07-01 to 2030-12-31 | 10% final |
| Qualifying non-resident funds (13OA) | valid Form A / Form B | 10% | 2025-01-01 to 2030-12-31 | 10% final |
| Other unitholders / missing declaration | missing or unsupported status | 17% | all coded dates | 17% · not final |

Outside a concession window the declared qualifying non-resident class falls back to 17% · not final. The 13OA start date matters: before 1 Jan 2025 it is outside the fund concession window; from 1 Jan 2025 it receives the 10% final rate.

### Method

1. `holderTreatment` maps the app's holder class to `determineReitInvestorTax`.
2. The engine checks the payment date against the class-specific concession window.
3. If withholding applies, `withholdingOn` multiplies the rounded taxable allocation by basis points and rounds to cents.
4. The s45G filing includes only holders with at least one cent of tax deducted. Its totals are the sum of listed taxable allocations and deductions.
5. Analytics leakage treats final withholding as a tax leakage borne by the holder; non-final withholding is shown as recoverable.

### Worked examples

#### Example S45G-1: Section 45G rates on a S$1,000 taxable distribution

On S$1,000.00 of taxable distribution paid on 27 Nov 2026, the app computes:

| Holder | s45G tax |
| --- | ---: |
| individuals: S$0.00 | S$0.00 |
| qualifying unitholders: S$0.00 | S$0.00 |
| qualifying non-resident non-individuals: S$100.00 final | S$100.00 |
| qualifying non-resident funds under 13D/13U/13V: S$100.00 final | S$100.00 |
| other unitholders: S$170.00 not final | S$170.00 |

For a section 13OA qualifying non-resident fund, the effective date changes the answer: a section 13OA qualifying non-resident fund is 17% · not final on 31 Dec 2024 (S$170.00), and 10% final on 1 Jan 2025 (S$100.00).

### Edge cases

* Individual holders derived through a Singapore partnership or from a trade, business or profession are handled in the engine, but the app's `individual` class maps to the ordinary exempt individual path.
* `sgFundSection` is ignored unless the holder class is `nr-fund`.
* After 31 Dec 2030, qualifying non-resident non-individuals and qualifying non-resident funds fall back to 17% non-final withholding in the engine.

### Confidence

Grade B. `test/engine/independent-verification-gst-reit.test.ts` independently checks the e-Tax Guide withholding table and filing dates, while `test/domain/sg/withholding.test.ts` and `test/verify/v3/v-app-domain.test.ts` pin the app mapping and the 13OA edge.

## Return of capital and cost base

### What it computes

Capital distributions are not subject to s45G withholding. They are included in unitholder statements and in the Cost base & CGT workspace as a negative adjustment to unit cost base.

### Legal basis

The Rules row and footnote cite ITA 1947 s35(15C) and IRAS e-Tax Guide ¶8.8: unit holders should reduce their cost of units by return of capital; traders use the reduced cost for trading gains, excess over cost can be trading income, and later sale proceeds for remaining units can be fully taxable after cost is exhausted.

### Method

1. The holder's capital distribution allocation is read from the distribution calculation.
2. Cost base opening balances come from `UNIT_COST_BASE[fund.id].opening`.
3. The adjustment is `-capital distribution`.
4. Closing cost base is `max(0, opening + adjustment)`.
5. `excessOverCostBase` is `max(0, -(opening + adjustment))`.
6. Market value uses units times the seed unit price. The property table is only a valuation view because Singapore does not tax capital gains as such in this module.

### Worked examples

#### Example ROC-1: Telok Ayer return of capital reduces cost base

Telok Ayer's capital distribution allocated to the individual register is S$762,320.00. The Cost base & CGT row starts with opening cost base S$1,358,661,539.00, applies adjustment −S$762,320.00, and ends with closing cost base S$1,357,899,219.00. The seed holder has enough opening cost, so excess over cost base S$0.00.

### Edge cases

* If there is no unit-cost-base seed for a fund, openings default to nil rather than failing.
* Closing cost base never becomes negative. The excess over cost base is reported in the row, CSV and footnote.
* The Cost base & CGT workspace's investor argument applies to Australia only and is ignored for Singapore.

### Confidence

Grade C. The method is covered by unit tests and the rule text follows the cited IRAS paragraph, but no official numerical example was reproduced.

## Statements, returns, checks, deadlines, Analytics and Bulk review

### Statements and declarations content

The distribution tax notice contains the period, record date, declaration cut-off set by the manager, payment date, YA, a Distribution by type table with cents per unit, a class-rate table, and paragraphs explaining Form A / Form B before every distribution. A statement for a registered holder contains the holder, country, tax status, units, period, payment date, YA, a Distribution by type table, gross distribution, tax deducted where any, net cash paid, and the engine's holder-class remark. A holder not on the register gets a plain notice rather than a statement.

### Singapore REIT filing dates

| Obligation | Code | Date rule | Example |
| --- | --- | --- | --- |
| Withholding tax (s45G) | reitWithholdingDueDate | 15th day of the second month after payment | 2027-01-15 |
| Form UT | reitFormUtDueDate | 15 April of the year of assessment | 2027-04-15 |
| Distribution tax notice | sgDeadlines / notice record | manager record date; not an IRAS statutory date in the code | 2026-11-06 for Telok Ayer |

### Tax returns workspace

The Tax returns workspace is titled Form UT filing. Readiness requires distribution signed off, no open exceptions, Trial balance agreement, and withholding remitted and reconciled (or no withholding to remit). Working papers include the tax computation, taxable specified income, distributed amount, payout percentage, undistributed specified income, trustee tax on retained income, withholding groups, paid-to-IRAS status, key financial information and the distributions tracking schedule.

### Checks and exceptions

The SG checks are: unit register out of balance; taxable payout below 90%; taxable distribution exceeds taxable specified income; withholding reconciliation variance; note for holders without declarations; late/due/changed tax notice; and overdue withholding tax. Bulk review uses the same underlying fund calculations, checks, deadlines and status selectors; it does not recompute a different tax result.

### Analytics

Analytics leakage adds final withholding, recoverable withholding and trustee tax, then divides by total distribution and rounds the percentage to one decimal place. Analytics mix reports taxable, tax-exempt and tax-deferred/capital percentages; Singapore capital gains are always 0 in this mix. Analytics scenario takes a taxable payout percentage, clamps it to 0-100, recomputes retained income, retained-only trustee tax and holder-by-holder withholding at today's register mix, and reports whether the 90% condition is met.

## Evidence

* `test/domain/sg/calc.test.ts`: "Telok Ayer: the nominee without a declaration is withheld at 17% and is not final", "the 90% test sits exactly on the threshold" and "a failed 90% test shows the reference's figures first and the engine's worst case after them".
* `test/domain/sg/tb.test.ts`: ledger-derived taxable specified income, whole-dollar rounding, 50-cent tolerance, unmapped categories and book-to-tax rows.
* `test/domain/sg/withholding.test.ts`: class mapping, rate windows, 13OA start date, rate wording, withholding rounding, trustee threshold.
* `test/domain/sg/investor.test.ts`: distribution tax notice, declaration cut-off wording, s45G filing rows, due date and empty filing.
* `test/domain/sg/statements.test.ts`: statement content for non-resident, individual and undeclared holders, nil and not-on-register statements.
* `test/domain/sg/returns.test.ts`: Form UT due label, readiness, Kallang working papers and distributions tracking schedule.
* `test/domain/sg/deadlines.test.ts`: notice, s45G and Form UT obligations and dates.
* `test/domain/sg/costbase.test.ts`: property valuation view, unit cost-base movement, capital returned above cost, CSV layouts.
* `test/domain/sg/rules.test.ts`: Rules table wording, concession windows, failed-90% row, return-of-capital row, declaration cut-off row.
* `test/domain/sg/analytics.test.ts`: leakage, mix and scenario figures including Loyang at 85% and the 90% edge.
* `test/engine/reitTax.test.ts`: engine threshold and investor withholding rates.
* `test/engine/distribution.test.ts`: engine distribution policy, holder allocation and scenario modelling.
* `test/engine/independent-verification-gst-reit.test.ts`: "REIT withholding by investor class follows the e-Tax Guide table" and "REIT filing dates: Form UT by 15 April; withholding tax by the 15th of the second month after payment".
* `test/verify/v3/v-app-domain.test.ts`: SG fund exemption section 13OA and cost-base excess integration.
* `test/docs/sg-reit-distributions.test.ts`: recomputes the examples and rate/deadline tables in this document.

No IRAS numerical worked example for an S-REIT distribution was reproduced in this pass. The confidence grades therefore do not claim grade A.

## Assumptions and limitations

* No tax adviser has reviewed the module.
* The app does not compute a unitholder's own downstream Singapore tax return.
* The app's Form A/Form B cut-off date is the manager's demo data. IRAS is cited only for requiring the declaration before distributions; the app says the Guide sets no cut-off or tax-notice date.
* The failed-90% primary display deliberately follows the reference app's retained-only trustee tax and still-withhold presentation. The stricter legal outcome is stated next to it.
* The stand-alone non-resident withholding calculator in `src/engine/withholdingTax.ts` is separate from this S-REIT distribution workflow, except that the general withholding-tax deadline rule has the same 15th-of-second-month pattern.

## Sources

| Source | Used for | Code cites it? | Read / checked |
| --- | --- | --- | --- |
| IRAS, Income Tax Treatment of Real Estate Investment Trusts and Approved Sub-Trusts, 12th edition, 4 Dec 2025, https://www.iras.gov.sg/docs/default-source/e-tax/e-taxguide_income-tax-treatment-of-reits-and-approved-sub-trusts.pdf | transparency, s45G classes, declarations, return of capital, Form UT | yes, engine `RULES` | Code rule retrieved 2026-10-09; this document checked against code and `docs/parity/sg.md` on 2026-10-19 |
| IRAS withholding tax filing and payment pages, https://www.iras.gov.sg/taxes/withholding-tax | s45G remittance date and general WHT filing mechanics | yes, engine `RULES` | Code rule retrieved 2026-10-09; this document checked against code on 2026-10-19 |
| `docs/parity/sg.md` | reference-app differences, especially failed 90% treatment and manager declaration cut-off wording | n/a | Read 2026-10-19 |
