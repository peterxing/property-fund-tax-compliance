# Australian company tax, trust tax and income-tax lodgment dates

This document covers the AU Company tax calculator (`au-company-tax`), the Australian trust-tax engine and the income-tax return due-date helpers. The Company tax calculator appears in the Calculators workspace; trust-tax functions currently live in the engine and rule register but are not called by `src/domain` or `src/app`. AMIT attribution and AMMA figures are documented separately in `au-amit-distributions.md`.

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| Company tax and base rate entity test | Calculators → Company tax | ATO company tax rates and lower company tax rate guidance | `src/engine/au/companyTax.ts`, `src/app/workspaces/calculators/model.ts` | A |
| Trust s 95 net income and trustee assessment | Engine only; no current app figure calls it | ITAA 1936 ss 95, 98, 99, 99A, 251S; ATO resident and foreign resident rates | `src/engine/au/trustTax.ts` | B/D as stated below |
| Income-tax return selection and due dates | Engine; compliance calendar integrations use related return helpers | ATO AMIT, company, trust and registered-agent lodgment guidance | `src/engine/au/returns.ts`, `src/engine/au/dates.ts` | B |

## Company tax calculator

### What it computes

The calculator computes accounting profit, taxable income before losses, tax losses applied, taxable income, the base-rate-entity result, the rate and tax payable. It accepts rent income, deductible expenses, aggregated turnover, additional passive income and prior-year tax losses from the calculator fields.

### Legal basis

The rule is [rule `au-company-tax.rate-and-bre.2017-07-01`](RULE-REGISTER.md#rule-au-au-company-tax-rate-and-bre-2017-07-01). The loss review rule is [rule `au-company-tax.loss-review.2026-07-01`](RULE-REGISTER.md#rule-au-au-company-tax-loss-review-2026-07-01).

### Inputs

| App field | Engine field | Unit |
| --- | --- | --- |
| Income year | `incomeYear` | ending year number |
| Rent income | mapped line `REV_RENT_BASE` | cents |
| Deductible expenses | mapped line `EXP_OTHER_DEDUCTIBLE` | cents |
| Aggregated turnover | `aggregatedTurnover` | cents |
| Additional passive income | `additionalPassiveIncomeAmount` | cents |
| Prior-year tax losses | `priorYearTaxLossesBroughtForward` | cents |

### Method

1. The engine accepts only `COMPANY` and `PUBLIC_TRADING_TRUST` regimes.
2. Accounting profit is accounting income less accounting expenses for all mapped income and expense categories. Taxable, non-assessable, capital and timing treatments are then handled by the adjustment steps below.
3. Non-assessable, capital and timing income is deducted from accounting profit. Non-deductible, capital and timing expenses are added back. Manual adjustments and schedule deductions are then applied.
4. Companies include the full net capital gain passed in; there is no CGT discount.
5. Prior-year tax losses apply only up to positive taxable income before losses and only if continuity of ownership or business continuity is confirmed. The calculator defaults both tests to true; an explicit false/false combination blocks losses and adds a finding.
6. Passive income includes rent, interest, franked dividends, unfranked dividends and net capital gains, plus the `additionalPassiveIncomeAmount` field. `passiveIncomeBps` is rounded by `ratioBps`.
7. A company is a base rate entity only if aggregated turnover is strictly less than the threshold and passive income is at or below 80% of assessable income. Exactly 80% qualifies; exactly the turnover threshold fails.
8. Taxable income is rounded to whole dollars by `roundToDollar`, then multiplied by the rate basis points.

### Company tax rate table

| Income year | Aggregated turnover threshold | Base rate entity rate | General rate | Rule |
| --- | --- | --- | --- | --- |
| 2018 | A$25,000,000.00 | 27.5% | 30% | `au-company-tax.rate-and-bre.2017-07-01` |
| 2019-2020 | A$50,000,000.00 | 27.5% | 30% | `au-company-tax.rate-and-bre.2017-07-01` |
| 2021 | A$50,000,000.00 | 26% | 30% | `au-company-tax.rate-and-bre.2017-07-01` |
| 2022 onward | A$50,000,000.00 | 25% | 30% | `au-company-tax.rate-and-bre.2017-07-01` |
| Passive-income limb | at most 80% of assessable income | qualifies | more than 80% fails | `au-company-tax.rate-and-bre.2017-07-01` |

### Worked examples

#### Example CT-1: ATO Happy Feet base rate entity example

Source: ATO company tax rate example reproduced by `test/engine/au/companyTax.test.ts`. Inputs for 2026 are A$100,000.00 trading income, A$4,000.00 interest income and aggregated turnover A$104,000.00.

| Step | Amount |
| --- | --- |
| Assessable income | A$104,000.00 |
| Passive income | A$4,000.00 |
| Passive percentage | 3.85% |
| Base rate entity | Yes |
| Company tax rate | 25% |
| Tax payable | A$26,000.00 |

#### Example CT-2: ATO SoftDev passive-income fail example

Source: ATO company tax rate example reproduced by `test/engine/au/companyTax.test.ts`. Inputs for 2026 are A$150,000.00 trading income, A$850,000.00 net capital gain and aggregated turnover A$1,000,000.00.

| Step | Amount |
| --- | --- |
| Taxable income | A$1,000,000.00 |
| Passive income | A$850,000.00 |
| Passive percentage | 85% |
| Base rate entity | No |
| Company tax rate | 30% |
| Tax payable | A$300,000.00 |

#### Example CT-3: Trust net income and section 99A trustee assessment

This is a constructed engine example from `test/engine/au/trustTax.test.ts`. A discretionary trust has A$100,000.00 rent income, no beneficiary presently entitled and section 99A mode.

| Step | Amount |
| --- | --- |
| s 95 net income of trust estate | A$100,000.00 |
| Section 99A tax before Medicare levy | A$45,000.00 |
| Medicare levy at 2% | A$2,000.00 |
| Trustee-level tax | A$47,000.00 |

### Edge cases

* A `PUBLIC_TRADING_TRUST` uses the company-tax engine; the trust-tax engine rejects it.
* Negative taxable income is clamped to zero for tax payable.
* Franking-credit gross-ups, offsets and franking account effects are not modelled; receipt of franking credits raises a review finding.
* The engine does not determine continuity of ownership, business continuity or loss-recoupment facts. It only consumes caller booleans.
* Passive-income and turnover thresholds are tested at exact edges: passive income at 80% qualifies, but turnover equal to the threshold fails.

### Evidence

* `test/engine/au/companyTax.test.ts`: ATO Happy Feet, Coffee and Cake, Best Equity and SoftDev examples; historical rates; exact threshold and passive-income edge cases; loss recoupment flag.
* `test/engine/au/independent-tax-core.test.ts`: independently re-derives company rate history, base-rate-entity thresholds, the exact 80% passive-income boundary and passive-income character treatment.
* `test/verify/calculators/calculator-verifier.test.ts`: calculator rule ids resolve and calculator registry is stable.
* `test/docs/au-income-tax.test.ts`: recomputes the examples and checks the company-rate table.

### Confidence

Grade A for company tax because official ATO examples are reproduced by engine tests and by this document's test. Loss-recoupment findings are Grade C because the engine only consumes review facts and does not determine them.

### Assumptions and limitations

The calculator is an estimator. It omits franking offsets, instalment credits, detailed loss ownership tracing, tax consolidation and special company regimes outside companies and public trading trusts.

## Trust taxation engine

### What it computes

`computeAuTrustTax` creates a property-trust style statement of taxable income. It computes s 95 net income, trust CGT discount for resident trusts, prior-year losses, trustee tax under s 99 or s 99A for undistributed income, and s 98 foreign-resident individual trustee tax. A source search found no calls from `src/domain` or `src/app`; only the rule registry imports the rule entries. Therefore no current app figure depends on this module.

### Legal basis

The statement rule is [rule `au-trust-tax.statement-of-taxable-income.2022-07-01`](RULE-REGISTER.md#rule-au-au-trust-tax-statement-of-taxable-income-2022-07-01). Trustee assessment is [rule `au-trust-tax.trustee-assessment.2022-07-01`](RULE-REGISTER.md#rule-au-au-trust-tax-trustee-assessment-2022-07-01). Trust loss review is [rule `au-trust-tax.trust-loss-review.2022-07-01`](RULE-REGISTER.md#rule-au-au-trust-tax-trust-loss-review-2022-07-01).

### Method

The engine starts with accounting profit, removes non-assessable/capital/timing income, adds back non-deductible/capital/timing expenses, deducts Div 40/Div 43/borrowing/black-hole schedule amounts and then adds net capital gains. Discountable gains are reduced by `Math.round(gross / 2)` even where `residentTrustEstate` is false; the engine then raises a non-resident trust warning. Prior-year trust losses are applied up to positive pre-loss net income without determining the Schedule 2F tests. Undistributed income defaults to s 99A and is taxed at 45% plus Medicare levy at 2%; s 99 uses resident individual bands plus Medicare levy. Foreign-resident individual beneficiaries use the foreign-resident individual bands.

### Trustee assessment rate table

| Item | Code value | Income years | Rule |
| --- | --- | --- | --- |
| Section 99A special rate before Medicare levy | 45% | 2023-2026 | `au-trust-tax.trustee-assessment.2022-07-01` |
| Medicare levy on s 99 / s 99A trustee assessment | 2% | 2022 onward | `au-trust-tax.trustee-assessment.2022-07-01` |
| Resident individual first band for s 99 in 2026 | A$0.00 tax to A$18,200.00 | 2026 | `au-trust-tax.trustee-assessment.2022-07-01` |
| Foreign resident individual first band in 2026 | 30% to A$135,000.00 | 2026 | `au-trust-tax.trustee-assessment.2022-07-01` |

### Worked examples

See Example CT-3 above. AMIT attribution, unders/overs, AMMA statements and cost-base net amount adjustments are not trust-tax engine outputs; see `au-amit-distributions.md`.

### Evidence

* `test/engine/au/trustTax.test.ts`: book-to-tax adjustments and trust CGT discount; s 99A Medicare levy; foreign-resident individual trustee assessment; public trading trust rejection; AMIT review findings.
* `test/engine/au/independent-tax-core.test.ts`: "trust STI: realistic property trust hand calculation matches line items and components" and "trustee s99A liability includes Medicare levy as well as the 45% special rate".
* Source search in `src/domain` and `src/app`: no callers of `computeAuTrustTax`.
* `test/docs/au-income-tax.test.ts`: pins the trust example and table text.

### Confidence

Grade B for s 95 net-income mechanics because `test/engine/au/independent-tax-core.test.ts` independently re-derives the property-trust line items. Grade D for s 99A special-rate modelling because it is modelled by analogy to the top marginal rate; Part VIIB reductions, exemptions and deceased-estate exceptions are omitted.

### Assumptions and limitations

MIT withholding, AMIT attribution, beneficiary offsets, franking offsets, unders/overs, CGT foreign-resident withholding, trust loss tests and Division 6C status are either flagged for review or handled elsewhere. `computeAuTrustTax()` applies the 50% trust CGT discount even when `residentTrustEstate` is false and only raises a warning; ATO guidance on the CGT discount for foreign residents limits the discount for foreign residents. No app figure uses this engine function, so non-resident trust estates should be treated as not modelled.

## Income-tax return and lodgment due dates

### What it computes

`determineAuReturn` selects AMIT, trust or company return type and returns a due date, optional payment due date and optional 5 June concession date. `dates.ts` supplies income-year, quarter and substituted accounting period helpers.

### Legal basis

Return selection is [rule `au-returns.amit-trust-company.2026-07-01`](RULE-REGISTER.md#rule-au-au-returns-amit-trust-company-2026-07-01). Due dates are [rule `au-returns.due-dates.2026-07-01`](RULE-REGISTER.md#rule-au-au-returns-due-dates-2026-07-01) and SAP date conventions are [rule `au-dates.income-year-and-sap-dates.2025-07-01`](RULE-REGISTER.md#rule-au-au-dates-income-year-and-sap-dates-2025-07-01).

### Method

1. AMITs use an AMIT tax return. MITs and ordinary trusts use a trust tax return. Companies and public trading trusts use a company tax return.
2. June-balancer self-lodgers use 31 October. Companies also get payment due 1 December.
3. Registered-agent AMITs use 31 October and add an AMIT election finding.
4. Registered-agent trusts move to 31 January, 28 February, 31 March, 15 May or optionally 5 June based on coded income, taxable-status, liability and concession inputs.
5. Registered-agent companies move to 31 October, 1 December, 31 January, 28 February, 31 March, 15 May or optionally 5 June based on coded inputs. Payment dates are supplied for the self-lodger, early-lodgment, large/taxable, March and remaining-company branches; the non-full self-assessment branch returns only a lodgment due date.
6. SAP trusts lodge on the last day of the fourth month after year end. SAP companies lodge on the 15th day of the seventh month after year end and pay on the first day of the sixth month after year end.
7. These return due dates do not roll weekends or public holidays. BAS dates do roll forward; see `au-gst.md`.

### Income-tax lodgment due-date table

| Scenario | Due date as coded | Payment date as coded | Rule |
| --- | --- | --- | --- |
| Self-lodger June-balancer AMIT, trust or company | 31 October in the income year | company 1 December; trusts none | `au-returns.due-dates.2026-07-01` |
| Registered-agent AMIT June-balancer | 31 October in the income year | none | `au-returns.amit-trust-company.2026-07-01` |
| Registered-agent remaining trust | 15 May after income year; optional 5 June concession only when both concession flags are true | none | `au-returns.due-dates.2026-07-01` |
| Registered-agent remaining company | 15 May after income year; optional 5 June concession only when both concession flags are true | same as due date, or concession date | `au-returns.due-dates.2026-07-01` |
| SAP trust or AMIT | last day of fourth month after year end | none | `au-dates.income-year-and-sap-dates.2025-07-01` |
| SAP company | 15th day of seventh month after year end | first day of sixth month after year end | `au-dates.income-year-and-sap-dates.2025-07-01` |

### Worked examples

#### Example DUE-1: June and SAP income-tax return dates

The code returns these fixed dates without weekend or public-holiday roll-over:

| Input | Return type | Due date | Payment date |
| --- | --- | --- | --- |
| 2026 company self-lodger, 30 June balancer | Company tax return | 2026-10-31 | 2026-12-01 |
| 2026 company registered-agent remaining client with 5 June concession flags | Company tax return | 2027-05-15 | 2027-06-05 |
| 2026 unit trust with 31 December SAP | Trust tax return | 2027-04-30 | none |
| 2026 company with 31 December SAP | Company tax return | 2027-07-15 | 2027-06-01 |

### Edge cases

* Invalid income-year end month or day throws in `dates.ts`.
* `incomeTaxReturnDueDate` is required if annual GST due mode is linked to an income-tax return, but income-tax return dates themselves do not use BAS roll-forward logic.
* Registered-agent branches depend entirely on caller-supplied facts such as prior-year returns outstanding, tax liability and annual income.

### Evidence

* `test/engine/au/returns.test.ts`: return catalogue, AMIT return type, self-lodger, registered-agent trust/company and SAP branches.
* `test/engine/au/dates.test.ts`: income-year, SAP and quarter helpers.
* `test/engine/au/calendar.test.ts`: BAS due dates and business-day rollover, showing the contrast with return due dates.
* `test/docs/au-income-tax.test.ts`: recomputes the due-date example and table rows.

### Confidence

Grade B. The dates are implemented from cited ATO pages and unit-tested across branches, but the module is a coded lodgment-program model rather than a full legislative-instrument deferral system.

### Assumptions and limitations

The return due-date helper does not apply weekend or holiday rollover, does not model every registered-agent deferral or ATO discretion, and relies on callers to supply SAP approval and registered-agent facts.

## Sources

* ATO, Company tax rates 2025-26; Company tax rate changes; Lower company tax rate, retrieved 2026-10-10 and cited by `au-company-tax.rate-and-bre.2017-07-01`.
* ATO, Losses schedule 2026 instructions, retrieved 2026-10-10 and cited by `au-company-tax.loss-review.2026-07-01`.
* ITAA 1936 ss 95, 98, 99, 99A, 100A and 251S via the ATO legal database, retrieved 2026-10-10 and cited by trust-tax rules.
* ATO, Australian resident tax rates and foreign resident tax rates, retrieved 2026-10-10 and cited by trust-tax rules.
* ATO, AMIT tax return, company tax return, trust tax return and registered-agent lodgment-program pages, retrieved 2026-10-10 and cited by return and date rules.
