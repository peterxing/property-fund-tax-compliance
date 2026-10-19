# Australian AMIT distributions, MIT withholding and cost base

This document explains the Australian AMIT distribution calculations in the Distributions, Trial balance, Tax returns, Investor reporting, Cost base & CGT, Bulk review and Analytics workspaces, and the MIT withholding calculator. It describes what the code in `src/domain/au/**`, `src/engine/au/**`, `src/domain/selectors.ts` and `src/app/workspaces/calculators/model.ts` actually does. Money is stored as integer cents; the app formats AU amounts as Australian dollars.

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| Trial balance to AMIT components | Trial balance; Distributions; Tax returns | ITAA 1997 Div 276 trust components; ATO AMIT trust-components guidance | `src/domain/au/tb.ts`, `components.ts`, `calc.ts` | B |
| Per-unit and member attribution | Distributions; Investor reporting; AMMA; AIIR | ITAA 1997 Div 276 fair and reasonable attribution | `src/domain/au/withholding.ts`, `calc.ts`, `investor.ts`, `statements.ts`; engine `distribution.ts`, `amit.ts` | B |
| MIT withholding and remittance | Distributions; Tax returns; Investor reporting; Calculator `au-mit-withholding` | MIT Withholding Tax Act 2008 s4; TAA 1953 Sch 1 Subdiv 12-H and 12A-B | `src/domain/au/withholding.ts`, `rates.ts`; engine `members.ts`, `mitWithholding.ts` | B |
| AMIT cost base net amount | Distributions; Investor reporting; Cost base & CGT; Analytics scenario | ITAA 1997 Subdiv 104-E; CGT event E10 | `components.ts`, `investor.ts`, `costBase.ts`, `analytics.ts`; engine `amit.ts` | A for CBNA formula; B for seeded app roll-forward |
| AMMA, AIIR and working papers | Investor reporting; Tax returns | ATO AMMA/SDS guidance; TAA 1953 Div 393 | `statements.ts`, `investor.ts`, `returns.ts`, `notices.ts` | B |
| Deadlines and exceptions | Bulk review; Investor reporting; Tax returns | ITAA 1997 s276-455; TAA 1953 s16-153; ATO AIIR due date | `deadlines.ts`, `checks.ts`, `investor.ts`; engine `amit.ts`, `mitWithholding.ts` | B |
| Analytics | Analytics; Cost base & CGT | Same component and withholding rules; company and CGT engines for deferred tax | `analytics.ts`, `costBase.ts`, `rates.ts` | B |

See [docs/parity/au.md](../parity/au.md) for reference-app differences. This document does not repeat every parity note; where there is a conflict, the code and the parity page govern.

## AMIT components from the trial balance

### What it computes

The app maps an Australian fund's trial balance into eight editable distribution inputs: Australian income — other, NCMI, excluded NCMI, clean building MIT income, Australian interest, discounted capital gains — TARP, other capital gains — TARP and assessable foreign income. The cash distribution is never derived from the trial balance. The Distributions tab then adds two non-attributable lines: AMIT CGT gross-up amount — TARP and Other non-attributable amounts.

### Legal basis

The engine rule [`au-amit.trust-components-and-attribution.2016-plus`](RULE-REGISTER.md#rule-au-au-amit-trust-components-and-attribution-2016-plus) cites the ATO pages on calculating AMIT trust components, attributing amounts to members and character flow-through. The trust-tax STI engine rule [`au-trust-tax.statement-of-taxable-income.2022-07-01`](RULE-REGISTER.md#rule-au-au-trust-tax-statement-of-taxable-income-2022-07-01) supports the book-to-tax reconciliation but does not itself produce the app's distribution figures.

### Inputs

* `src/domain/seed/funds.ts` supplies each AU fund's `inputs`, `periodEnd`, `unitsOnIssue`, workflow status, remitted withholding and expense-allocation policy.
* `src/domain/seed/trialBalance.ts` supplies ledger rows. Income categories are credits and expenses are debits.
* `src/domain/seed/taxAdjustments.ts` supplies Div 40, Div 43, `tarpDiscountGross` and `tarpOther` adjustments.
* `src/domain/governance/*` and `src/domain/au/tb.ts` read manual adjustments; only adjustments targeting one of the derived AU input keys change figures.

### Method

1. `deriveFor()` sums ledger rows by tax category. It treats income credits as positive gross income by negating income category balances.
2. Accounting profit is the negative of the profit-and-loss category total. Unmapped rows are kept in the Trial balance table but excluded from derived tax inputs.
3. Div 40 and Div 43 deductions are added to deductible expenses to form one rental-deduction pool.
4. The expense-allocation policy splits that pool among `rent`, `ncmi-rent`, `ncmi-transitional` and `clean-building`: `pro-rata` uses gross rent weights; `other-income` puts the whole pool against Australian income — other; `custom` uses basis-point shares.
5. `poolShare()` rounds each allocation to whole dollars, half away from zero. In pro-rata and custom allocations the residual is placed on Australian income — other, so the allocation pool foots exactly.
6. A stream is floored at nil. If deductions allocated to a stream exceed that stream's income, `absorb()` reallocates the excess first across remaining rent, interest and foreign income, then across discounted and other TARP gains. The absorption is pro rata to available positive amounts, rounded to whole dollars with any rounding difference settled on the largest available amounts first. Any remainder is shown as `Tax loss carried forward by the trust (not attributed to members)`.
7. Discounted TARP gains are calculated from `tarpDiscountGross` using `trustNetGain()`, which reads the trust CGT discount from `computeCgt()`. For current seeded funds the trust discount is 50%.
8. Derived component amounts are rounded to whole dollars as cents. Manual adjustments then add to the selected component and are floored at nil.

### AMIT component definitions

| Component | App key | Attributed to members? | Withholding bucket | How the code derives or uses it |
| --- | --- | --- | --- | --- |
| Australian income — other | `ausOtherIncome` | Yes | ordinary fund payment | Gross other rent less allocated deductions and any excess absorption. |
| Non-concessional MIT income | `ncmi` | Yes | NCMI | Gross NCMI rent less allocated deductions and absorption. |
| Excluded from NCMI — transitional | `excludedNcmi` | Yes | excluded | Gross transitional NCMI rent less allocated deductions and absorption. |
| Clean building MIT income | `cleanBuilding` | Yes | clean | Gross clean-building rent less allocated deductions and absorption. |
| Australian interest | `interest` | Yes | interest | Interest income, reduced only by absorbed excess deductions. |
| Discounted capital gains — TARP | `discountGainTarp` | Yes | ordinary | `tarpDiscountGross` after the trust CGT discount, then reduced by absorbed excess deductions if ordinary income is exhausted. |
| AMIT CGT gross-up amount — TARP | `cgtConcessionTarp` | No | ordinary | Equal to `discountGainTarp`, so discounted gains are doubled in fund payments. |
| Other capital gains — TARP | `otherGainTarp` | Yes | ordinary | `tarpOther`, reduced by absorbed excess deductions after ordinary income. |
| Assessable foreign income | `foreignIncome` | Yes | none | Foreign income, reduced only by absorbed excess deductions. |
| Other non-attributable amounts | `taxDeferred` | No | none | Positive AMIT cost base net amount; cash over attributed amounts and CGT gross-up. |

### Worked examples

#### Example AMIT-1: Harbourline trial balance to one foreign EOI holder

This is demo data in `src/domain/seed/**`, so a reviewer can open Harbourline Office Trust in the live app and tick the same numbers.

Trial balance and components:

* Net profit per accounts A$25,668,257.00.
* Book-to-tax adjustments lead to Net income attributed to members A$59,620,600.00.
* Derived components are Australian income — other A$48,318,400.00, clean building MIT income A$6,205,300.00, Australian interest A$1,184,900.00 and discounted capital gains — TARP A$3,912,000.00.
* The cash distribution A$92,446,000.00 is a fund decision, not a trial-balance output.
* The AMIT CGT gross-up amount A$3,912,000.00 equals the discounted gain.
* AMIT cost base net amount A$28,913,400.00 = cash distribution A$92,446,000.00 − attributed components A$59,620,600.00 − AMIT CGT gross-up amount A$3,912,000.00.
* Fund payment A$62,347,700.00 = Australian income A$48,318,400.00 + clean building A$6,205,300.00 + discounted gain A$3,912,000.00 + CGT gross-up A$3,912,000.00 + other TARP gains A$0.00 + NCMI/excluded NCMI A$0.00.
* Character total A$92,446,000.00 and total withheld A$2,504,486.36.

Holder allocation for Sakuragawa Life Assurance:

* Sakuragawa Life Assurance holds 211,902,000 units, exactly 15% of Harbourline's 1,412,680,000 units.
* cash A$13,866,900.00; withheld A$1,374,057.00; net A$12,492,843.00.
* Its attributed components include Australian income A$7,247,760.00, clean building A$930,795.00, interest A$177,735.00 and discounted TARP gain A$586,800.00.
* Its AMIT CGT gross-up amount is A$586,800.00 and its other non-attributable amount is A$4,337,010.00.
* Fund payment withholding at 15% A$1,263,204.00.
* Clean building fund payment at 10% A$93,079.50.
* Interest withholding at 10% A$17,773.50.

Other app surfaces for the same seeded fund:

* AIIR due 2026-10-31 and withholding report due 2027-01-14.
* The Tax returns working paper shows Assessable income other than capital gains A$55,708,600.
* The Analytics scenario shows Per unit (cents) 2.0467 for the current AMIT cost base net amount.
* Cost base & CGT shows deferred tax for a foreign EOI investor A$28,926,024.00.

#### Example AMIT-2: expense allocation and excess absorption

Constructed case using the `coastline` fund object with replacement trial-balance rows:

| Input | Amount |
| --- | ---: |
| Australian income — other rent | A$1,000,000.00 |
| NCMI rent | A$500,000.00 |
| Clean building rent | A$500,000.00 |
| interest | A$100,000.00 |
| TARP other gain | A$500,000.00 |
| deductions | A$2,300,000.00 |
| policy | `other-income` |

In total, gross rent A$2,000,000.00, interest A$100,000.00, TARP other gain A$500,000.00 and deductions A$2,300,000.00 are in the constructed case.

The whole A$2,300,000.00 deduction pool is first allocated to Australian income — other. That stream has only A$1,000,000.00 of income, so A$1,300,000.00 is excess. The app absorbs A$500,000.00 against NCMI, A$500,000.00 against clean building income and A$100,000.00 against interest. The remaining A$200,000.00 is absorbed against TARP other gains.

The derived result is Australian income — other A$0.00, NCMI A$0.00, clean building A$0.00, interest A$0.00 and Other capital gains — TARP A$300,000.00. Because the TARP gain absorbs the last excess, no trust tax loss is shown.

### Edge cases

* No unitholders: every component is unallocated; no division by zero appears.
* No units on issue: per-unit figures are zero rather than `NaN` or `Infinity`.
* One cent of withholding variance is an exception.
* An unmapped trial-balance account is labelled `Needs a tax category` and kept out of derived inputs.
* A fund with a substituted accounting period can have no AIIR date in the app; the note says to confirm with the ATO.

### Evidence

* `test/domain/au/tb.test.ts`: trial-balance balance, Harbourline book-to-tax, category handling, deductions and trust-loss carry-forward.
* `test/domain/au/expense-allocation.test.ts`: pro-rata, other-income, custom basis-point shares, absorption and tax-loss examples.
* `test/verify/v3/v-app-domain.test.ts`: G5 expense allocation verifier and the fixed excess-allocation defect.
* `test/domain/au/completeness.test.ts`: sweeps AU inputs and checks working papers, notices and statements contain every component exactly once.
* `test/docs/au-amit-distributions.test.ts`: examples AMIT-1 and AMIT-2.

### Confidence

B — Independently verified. The AMIT component method is covered by seeded reference-parity tests, domain tests and a verifier test. The expense absorption policy is a product modelling choice based on ATO AMIT component guidance and should still be reviewed for a particular fund's constitution and allocation policy.

### Assumptions and limitations

The app does not decide whether a capital gain is TARP. It consumes `tarpDiscountGross` and `tarpOther`. It also does not model franking credits, tax offsets or exempt income for seeded AU funds. The engine's broader `computeAuTrustTax()` can calculate trust net income and trustee assessments, but the displayed AMIT distribution figures use the domain code above, not that engine module directly.

## Attribution, withholding and reconciliation

### What it computes

`fundCalc()` builds the Distributions workspace. It splits every component and cash amount by units, determines holder withholding by Australian residency status, reconciles computed withholding to amounts remitted and builds the Sankey destinations: Australian residents, Foreign investors net, Withheld for the ATO and Units not on register.

### Legal basis

* MIT foreign-member rates: [`au-members.mit-foreign-member-withholding.2008-plus`](RULE-REGISTER.md#rule-au-au-members-mit-foreign-member-withholding-2008-plus).
* Resident TFN/ABN withholding: [`au-members.tfn-abn-withholding.2017-plus`](RULE-REGISTER.md#rule-au-au-members-tfn-abn-withholding-2017-plus).
* Fund payment definition and notices: [`au-mit.fund-payment-definition-and-notice.2016-plus`](RULE-REGISTER.md#rule-au-au-mit-fund-payment-definition-and-notice-2016-plus).
* Engine `determineMemberWithholding()` also models custodians/nominees, Australian permanent establishments and non-withholding MIT scenarios. The current app register surfaces only `resident`, `foreign-eoi` and `foreign-non-eoi` statuses.

### Inputs

* Holder units and `auStatus` from `src/domain/seed/holders.ts` or imported data.
* Component amounts from `deriveAmounts()`.
* Rates from `auRates(periodEnd)`, which probes `determineMemberWithholding()`, `computeCgt()` and `computeAuCompanyTax()`.
* `whtRemitted` from the fund record.

### Method

1. Register units are the sum of holder units. The allocation denominator is `max(unitsOnIssue, registerUnits)`.
2. If issued units exceed registered units, the missing units receive an unallocated share of cash and every component.
3. `splitExact()` allocates component cents and cash cents in proportion to integer units. It floors every rational share, then gives missing cents to the largest remainders, tie-breaking to the lowest index. Parts add to the fund total exactly.
4. Withholding is computed for every component/holder pair as `component × units × rateBps / denominator / 10,000`. `roundShares()` rounds the set of withholding rationals together so the total equals the exact rounded total, again distributing residual cents by largest remainder.
5. Australian residents have zero app-level distribution withholding. Foreign EOI holders use EOI bucket rates; foreign non-EOI holders use non-EOI bucket rates. Interest is 10% for both foreign statuses. Foreign income and other non-attributable amounts have no Australian withholding.
6. `reconcile()` compares computed withholding with `whtRemitted`: equal is reconciled; positive variance is under-remitted; negative variance is over-remitted; null remittance is not-remitted.

### AMIT effective rates and thresholds

| Category | Effective date or basis | Rate |
| --- | --- | --- |
| Ordinary MIT fund payment — EOI | from 1 Jul 2008 | 22.5% |
| Ordinary MIT fund payment — EOI | from 1 Jul 2009 | 15% |
| Ordinary MIT fund payment — EOI | from 1 Jul 2010 | 7.5% |
| Ordinary MIT fund payment — EOI | from 1 Jul 2012 | 15% |
| Ordinary MIT fund payment — non-EOI | 2008 onward | 30% |
| Clean building MIT income — EOI | from 1 Jul 2012 | 10% |
| Clean building MIT income — non-EOI | from 1 Jul 2012 | 30% |
| NCMI | from 1 Jul 2019 | 30% |
| Excluded from NCMI — transitional | current app row | 15% EOI / 30% non-EOI |
| Build-to-rent fund payment | from 1 Jan 2025 | 15% EOI / 30% non-EOI |
| Interest paid to a foreign resident | local domain constant | 10% |
| Resident TFN/ABN no-quote | from 1 Jul 2017 | 47% |
| Trust CGT discount | current | 50% |
| Company deferred-tax rate | 2026 | 30% |
| Complying super deferred-tax rate | domain constant | 15% |

### Worked examples

#### Example MITW-1: withholding by holder status

The same A$1,000,000.00 fund payment is tested through `computeMitWithholding()` with A$700,000.00 ordinary fund payment, A$100,000.00 clean building MIT income and A$200,000.00 NCMI.

* EOI foreign company: A$700,000.00 × 15% = A$105,000.00; A$100,000.00 × 10% = A$10,000.00; A$200,000.00 × 30% = A$60,000.00; EOI total A$175,000.00. Final tax is true and no notice is required for withholding.
* Non-EOI foreign company: all three buckets are withheld at 30%, so non-EOI total A$300,000.00.
* Resident company with TFN/ABN quoted: resident total A$0.00, final tax is false, and resident requiresNotice true because resident MIT/AMIT recipients still need fund-payment information.
* TFN/ABN no-quote example A$58.02: resident investment-income withholding on A$123.45 at 47%, rounded to cents by the engine.

#### Example MITW-2: MIT withholding calculator default case

The calculator `au-mit-withholding` has default fields: payment date 2026-08-31, cash payment A$1,000,000.00, ordinary fund payment A$700,000.00, clean building MIT income A$100,000.00, NCMI fund payment A$200,000.00 and member class `FOREIGN_COMPANY_EOI`.

It returns summary Withholding A$175,000 at 17.5%. The visible result lines are Total fund payment A$1,000,000, Withholding amount A$175,000, Final tax Yes and Requires notice No.

### Edge cases

* If a foreign recipient's payment is attributed to an Australian permanent establishment, the engine returns no MIT withholding.
* Custodians and nominees require beneficial-owner look-through. Without it the engine flags a warning and notice-only outcome; the current seed register does not expose a separate custodian status.
* Foreign pension and sovereign classes are conservatively treated as ordinary foreign funds unless verified relief is established outside the engine.
* The app does not expose TFN/ABN status in the demo AMIT register; TFN withholding is engine-modelled and tested but not a seeded Distributions-tab status.

### Evidence

* `test/domain/au/calc.test.ts`: seeded fund components, holder cash/withholding/net, checks and remittance variance.
* `test/domain/au/invariants.test.ts`: allocation identities and no placeholder text.
* `test/engine/au/independent-trust-mit.test.ts`: independent MIT rates, notices, resident notice obligation, TFN withholding, AMIT cost base example.
* `test/engine/au/members.test.ts` and `test/engine/au/mitWithholding.test.ts`: member statuses, blended withholding and date boundaries.
* `test/verify/calculators/calculator-verifier.test.ts`: calculator default examples and invalid-input robustness.
* `test/docs/au-amit-distributions.test.ts`: examples MITW-1 and MITW-2, and the rate table above.

### Confidence

B — Independently verified for the rate table and app calculations. TFN withholding is implemented and independently tested in the engine, but not exposed as a separate field in the current app register, so app-level TFN withholding is documented as not surfaced.

### Assumptions and limitations

The app's Distributions tab uses status-level withholding buckets, not full tax-residency treaty analysis. It assumes the EOI/non-EOI classification has been determined before import. The build-to-rent rate is shown on the Rules tab and available in the engine but no seeded distribution component uses it.

## AMIT cost base net amount and Cost base & CGT

### What it computes

The app calculates the AMIT cost base net amount at fund level and holder level. A positive amount is an excess that decreases cost base. A negative amount is a shortfall that increases cost base. The Cost base & CGT workspace reverses the sign for each holder's unit cost base adjustment, floors closing cost base at nil and separately displays deferred tax on unrealised property gains.

### Legal basis

Rule [`au-amit.unders-overs-and-cbna.2016-plus`](RULE-REGISTER.md#rule-au-au-amit-unders-overs-and-cbna-2016-plus) cites ATO AMIT unders/overs, cost base adjustment and AMMA timing guidance. AMMA statement documents call `computeAmitCostBaseNetAmount()` from `src/engine/au/amit.ts`. The visible fund-level, AIIR and Cost base & CGT rows use the seeded app's equivalent zero-offset formula: cash distribution less attributed components less AMIT CGT gross-up amount. The current AU data does not model NANE attributed amounts or tax offsets in those rows.

### Inputs

* Fund-level: cash distribution, attributed components and AMIT CGT gross-up amount from `deriveAmounts()`.
* Holder-level AIIR: each holder's cash, attributed amounts and allocated AMIT CGT gross-up amount.
* Unit cost base view: opening cost base and unit price from `src/domain/seed/costBase.ts`.
* Unrealised CGT: property cost, improvements, capital works claimed, valuation and acquisition date from `src/domain/seed/properties.ts`.

### Method

1. Fund-level AMIT cost base net amount in the visible components row = cash distribution − attributed components − AMIT CGT gross-up amount.
2. AIIR holder-level cost base net amount in the visible investor row = holder cash − holder attributed amount − holder AMIT CGT gross-up amount.
3. AMMA statements call `computeAmitCostBaseNetAmount()`, which uses statutory netting with the current statement inputs: increase amount = assessable attributed + NANE attributed; reduction amount = cash payments/entitlements + tax offsets; shortfall = max(increase − reduction, 0); excess = max(reduction − increase, 0). The statement caller passes NANE attributed and tax offsets as zero.
4. In Cost base & CGT, `adjustment = -AIIR costBaseNet`. An excess therefore decreases cost base; a shortfall increases it. Closing cost base is floored at nil.
5. Unit cost per unit = closing cost base / 100 / units. It is not rounded in the model; formatting decides displayed decimals.
6. Unrealised property gains use tax cost base = cost + improvements − capital works claimed. Losses are applied to non-discount gains first, then discountable gains. A trust discount is read from the CGT engine; deferred tax by investor type then applies MIT, super or company rates to the relevant gain base.

### Worked examples

#### Example CB-1: ATO AMIT cost base example reproduced by the engine

The independent engine test describes this as the ATO AMMA example/guidance numbers. Inputs: assessable attributed A$712.00, NANE attributed A$25.00, tax offsets A$149.00, cash payments or entitlements A$613.00 and starting cost base A$20.00.

The engine gives increase amount A$737.00, reduction amount A$762.00, excess decrease A$25.00 and shortfall increase A$0.00. The A$25.00 excess is larger than the A$20.00 starting cost base, so closing cost base A$0.00 and CGT event E10 gain A$5.00.

### Edge cases

* Cost base cannot go below nil in the Cost base & CGT table; the engine reports the excess as CGT event E10 gain when a starting cost base is supplied.
* A nil AMIT cost base net amount is shown as nil, not as an excess or shortfall.
* A property acquired exactly one year before the valuation date does not receive the CGT discount; the engine requires disposal after the first anniversary.
* Wattle's seeded portfolio has a net capital loss; deferred tax is zero and the loss carry-forward is included in the note.

### Evidence

* `test/engine/au/independent-trust-mit.test.ts`: official AMIT cost base example and hand-worked shortfall.
* `test/domain/au/costbase.test.ts`: Harbourline properties, deferred tax by investor type, unit cost base roll-forward, E10 floor and CSV/document output.
* `test/domain/au/investor.test.ts`: AIIR cost base net amount lines and totals.
* `test/domain/au/statements.test.ts`: statement cost base wording and exact tie to AIIR.
* `test/docs/au-amit-distributions.test.ts`: example CB-1.

### Confidence

A for the AMMA statement CBNA formula because it reproduces the ATO example in an independent test and this doc test. B for the visible fund-level, AIIR, Cost base & CGT roll-forward and deferred-tax displays because they use the equivalent zero-offset app formula and are independently checked against seeded data and engine rates, but do not reproduce a published ATO example for the whole app screen.

### Assumptions and limitations

The app does not calculate a member's external disposals of units. It rolls forward the seeded opening cost base and reports unrealised gain from a seeded unit price. Deferred tax is an analytical estimate by investor type, not a tax return calculation for a specific holder.

## AMMA, AIIR, notices and tax return working papers

### What it computes

The Investor reporting workspace prepares fund payment notices, an AIIR working CSV and AMMA statement documents. The Tax returns workspace prepares readiness checks and working papers for the AMIT tax return and schedule.

### Legal basis

* AMMA timing and content: [`au-amit.unders-overs-and-cbna.2016-plus`](RULE-REGISTER.md#rule-au-au-amit-unders-overs-and-cbna-2016-plus).
* Fund payment notices and website disclosure: [`au-mit.fund-payment-definition-and-notice.2016-plus`](RULE-REGISTER.md#rule-au-au-mit-fund-payment-definition-and-notice-2016-plus).
* AIIR and withholding report timing: [`au-mit.reporting-due-dates.2026`](RULE-REGISTER.md#rule-au-au-mit-reporting-due-dates-2026).
* Return-type selection: [`au-returns.amit-trust-company.2026-07-01`](RULE-REGISTER.md#rule-au-au-returns-amit-trust-company-2026-07-01).

### Inputs

* Notices from `src/domain/seed/notices.ts` and any user-edited notices.
* Current year components from the fund inputs.
* Holder allocations from `FundCalc`.
* Lodgment records from seed workflow data.

### Method

1. `noticeItems()` lists notices oldest first. A published notice uses its saved snapshot. An unpublished notice with no snapshot is estimated as the balance of the year not already notified.
2. `noticeDoc()` lists fund payment — other, NCMI, excluded NCMI, clean building, total fund payment and interest. It shows cents per unit to six decimals and amounts to cents.
3. `compareNotices()` compares published and draft notices to the full year. The Investor reporting UI can show published, draft, year and difference columns.
4. AIIR lines list each holder's country, status, units, all ten component columns, attributed amounts, cash distribution, AMIT cost base net amount, fund payment and total withheld. CSV values are dollars to two decimals.
5. AMMA statement documents call `buildAmmaStatement()` and add app rows for components, withholding, cost base and amounts for the holder's tax return. Interest withholding is stated separately from MIT fund-payment withholding.
6. Tax return working papers show assessable income other than capital gains, NCMI, capital gains, withholding obligations, key financial information, trustee liabilities for unallocated determined trust components and unders/overs once signed off.

### Edge cases

* A holder not on the register gets a note-only AMMA document.
* If all units are not on the register, the Tax returns workspace reports determined trust components not reflected in member components.
* If a fund is not signed off, unders/overs say they are worked out once signed off.
* Coastline has a 30 September period end; the AIIR date is blank with the note `confirm with the ATO — substituted accounting period`, while the withholding report is due 14 April 2027.

### Evidence

* `test/domain/au/investor.test.ts`: notice ordering, draft notices, notice documents, notice-vs-year, AIIR readiness, dates and CSV columns.
* `test/domain/au/statements.test.ts`: AMMA content, footnotes, due dates and clean statement output for every investor.
* `test/domain/au/returns.test.ts`: working papers match reference captures and readiness follows status, mapping and remittance.
* `test/domain/au/completeness.test.ts`: all components appear in papers, notices and statements.

### Confidence

B — Independently verified against the reference captures and engine outputs. Statement layout is this build's own layout because the reference app did not expose complete AMMA content.

### Assumptions and limitations

The app prepares structured documents and CSVs. It does not lodge AIIRs or AMIT returns, and it does not model amended AIIR files for unders/overs.

## Deadlines, checks and bulk review

### What it computes

The Bulk review and per-fund workspaces show AMMA, AIIR, fund payment notice and withholding-report deadlines with status. `buildChecks()` also raises exceptions and notes that feed the exception count.

### Method

* AMMA due date comes from `ammaDueDate()`: three months after year end, finishing at month end for a month-end year end.
* AIIR due date is 31 October only for a 30 June year end. A substituted accounting period returns no date and a note.
* Fund payment notices are due at or before the payment date.
* The annual withholding report uses `mitAiirDueDate(periodEnd)`, six months and 14 days after income year end.
* A row is `done` when the relevant fund status, notice publication or AIIR lodgment says so. Otherwise a date before `today` is overdue and a later date is open.

### AMIT deadlines shown by the app

Harbourline at 12 October 2026 is pinned by the documentation test:

| Obligation | Date | Status |
| --- | --- | --- |
| Fund payment notice - Quarter ended 30 Sep 2025 | 2025-11-14 | done |
| Fund payment notice - Quarter ended 31 Dec 2025 | 2026-02-13 | done |
| Fund payment notice - Quarter ended 31 Mar 2026 | 2026-05-15 | done |
| Fund payment notice - Quarter ended 30 Jun 2026 | 2026-08-28 | done |
| AMMA statements | 2026-09-30 | done |
| AIIR | 2026-10-31 | open |
| Fund payment withholding report | 2027-01-14 | open |

### Checks and exceptions raised

* `au-register`: unit register out of balance.
* `au-amma-overdue`: AMMA statements overdue once the day after the due date has begun and the fund is not signed off.
* `au-wht-variance`: computed withholding differs from remitted withholding.
* `au-tb-unmapped`: trial balance account without a tax category.
* `au-costbase-shortfall`: attributed amounts and AMIT CGT gross-up exceed cash distribution; members increase their cost base.
* `au-non-eoi-30`: one or more holders are outside EOI countries.
* Notice checks: late published notice, unpublished notice after payment, due-by note, year-notice mismatch and cash-payment mismatch.

### Evidence

* `test/domain/au/deadlines.test.ts`: all seeded deadlines, date status, substituted accounting periods and cross-view agreement.
* `test/domain/au/calc.test.ts`: seeded checks and withholding remittance variance.
* `test/domain/au/returns.test.ts`: readiness rows.
* `test/docs/au-amit-distributions.test.ts`: Harbourline deadline table.

### Confidence

B — The calculations are date-deterministic and pinned by domain tests and reference-parity tests. Due-date extensions, agent concessions and bespoke ATO arrangements are not modelled in these displayed AMIT deadline rows.

## Analytics figures

### What it computes

The Analytics workspace shows tax leakage, distribution mix and a cash-distribution scenario. Cost base & CGT also shows deferred tax by investor type.

### Method

* Tax leakage = final withholding / cash distribution. Recoverable tax and trustee tax are always zero for AU AMIT analytics in this build.
* Distribution mix uses character total as denominator. Taxable income includes Australian income, NCMI, excluded NCMI, clean building, interest and foreign income. Capital gains include discounted gains, AMIT CGT gross-up and other TARP gains. Tax-deferred and capital is the other non-attributable amount.
* Scenario input is a money amount in cents. Invalid values fall back to current cash, negative values become zero and valid values are rounded to cents. Attributed amounts and fund payment do not change. AMIT cost base net amount moves dollar-for-dollar with cash. Per unit is the cost base net amount divided by units on issue, displayed in cents to four decimals with a typographic minus for a shortfall.
* Deferred tax by investor type uses unrealised property gains after losses. Foreign EOI and non-EOI apply 15% or 30% to the gain before the trust discount. A complying super fund uses 15% after its one-third discount. A company uses the engine company rate and no CGT discount.

### Evidence

* `test/domain/au/analytics.test.ts`: leakage, mix and scenario calculations, signs, invalid input and reference figures.
* `test/domain/au/costbase.test.ts`: deferred tax for every investor type and seeded fund.
* `docs/parity/au.md`: records reference-app matches and deliberate differences.

### Confidence

B — The analytics formulas are deterministic and independently tested against the seeded calculations. They are analytical views, not separate tax-law computations.

## Engine functions not surfaced directly

The app uses some engine functions only as rate or document helpers. `src/engine/au/distribution.ts` can compute distribution policies, time-weighted allocations and generic non-AMIT statements, but the main app distribution for seeded funds is the domain `fundCalc()` path. `src/engine/au/trustTax.ts` can compute a statement of taxable income and trustee assessments; the Tax returns workspace uses domain working papers instead. `src/engine/au/returns.ts`, `calendar.ts` and `dates.ts` contain broader return and calendar helpers; this AMIT distribution surface uses only AMMA due dates, MIT/AIIR withholding report dates and income-year labels relevant to the displayed rows.

## Sources

| Source | Used by code? | Read status |
| --- | --- | --- |
| ATO, Calculating AMIT income — trust components | Cited by engine rule `au-amit.trust-components-and-attribution.2016-plus` | Engine source; reviewed in rule register on 19 Oct 2026 |
| ATO, Attributing amounts to members | Cited by engine rules `au-amit.trust-components-and-attribution.2016-plus` and `au-distribution.cash-policy-and-member-allocation.2026` | Engine source; reviewed in rule register on 19 Oct 2026 |
| ATO, Character flow through for AMITs | Cited by engine rule `au-amit.trust-components-and-attribution.2016-plus` | Engine source; reviewed in rule register on 19 Oct 2026 |
| ATO, AMMA statement and SDS 2024 guidance notes and example | Cited by engine member/distribution/AMIT rules | Engine source; official CBNA example reproduced by tests |
| ATO, Cost base adjustments for AMIT members | Cited by engine rule `au-amit.unders-overs-and-cbna.2016-plus` | Engine source; reviewed in rule register on 19 Oct 2026 |
| ATO, Withholding tax arrangements for managed investment trust fund payments | Cited by engine rules `au-mit.fund-payment-definition-and-notice.2016-plus` and `au-members.mit-foreign-member-withholding.2008-plus` | Engine source; independently verified in tests |
| ATO, Withholding on fund payments for MITs and Withholding for MITs | Cited by engine MIT rules | Engine source; independently verified in tests |
| ATO, Build to rent development tax incentives | Cited by engine rule `au-members.mit-foreign-member-withholding.2008-plus` | Engine source; rate surfaced on Rules tab |
| ATO, Due date for the AIIR | Cited by engine rule `au-mit.reporting-due-dates.2026` | Engine source; domain uses 31 October only for 30 June year ends |
| TAA 1953 Sch 1 s16-153(4), (4A) | Cited in `rules.ts` for annual report of amounts withheld | Basis checked in `docs/parity/au.md` |
| Income Tax (Managed Investment Trust Withholding Tax) Act 2008 s4 | Cited in Rules tab and parity page | Basis for MIT rates; engine rate table tested |
| ITAA 1936 s128B and Withholding Tax Act 1974 s7(b) | Interest withholding local constant | Not modelled in the engine; domain constant tested |
| Income Tax Rates Act 1986 s26 | Complying super deferred-tax constant | Not modelled in the engine; domain constant tested |
