# Australian GST and BAS

The GST & BAS workspace builds Australian BAS workpapers from the fund GST ledger. It appears in the GST workspace for AU funds and is fed by `src/domain/gst`, `src/engine/au/gst.ts`, `src/engine/au/gstCodes.ts` and `src/engine/au/calendar.ts`. Amounts are integer cents; BAS `reportedLabels` ignore cents to whole dollars while `labels` keep cent-accurate workings.

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| GST code to BAS label mapping | GST & BAS workspace ledger and return tabs | ATO BAS GST steps and reporting methods; platform code catalogue | `src/engine/au/gstCodes.ts`, `src/domain/gst/index.ts` | B |
| BAS builder and due dates | GST & BAS workspace for AU funds | ATO BAS due dates and GST reporting labels | `src/engine/au/gst.ts`, `src/engine/au/calendar.ts`, `src/domain/gst/index.ts` | B |
| Property GST, margin scheme, going concern and withholding | GST checks and engine helpers | ATO property GST and margin-scheme guidance | `src/engine/au/gst.ts` | A for official margin-scheme and GST-at-settlement examples; B/C otherwise |
| Registration, adjustments, FTL and GIC helpers | Engine helpers; not all are surfaced in the AU BAS page | ATO registration, tax-invoice, FTL and GIC pages | `src/engine/au/gst.ts` | B |

## GST codes, BAS labels and periods

### What it computes

The engine maps each AU GST ledger code to BAS labels. The app's AU return view shows `AU_BAS.G1`, `G2`, `G3`, `G10`, `G11`, `1A` and `1B`. `G4` is retained only as an internal platform subtotal for input-taxed sales, not as a current displayed BAS box.

### Legal basis

The rule entries cite the ATO GST BAS pages: [rule `au-gst.rate-and-bas.2026-10-10`](RULE-REGISTER.md#rule-au-au-gst-rate-and-bas-2026-10-10) and [rule `au-gst.codes.platform-catalogue.2026-10-10`](RULE-REGISTER.md#rule-au-au-gst-codes-platform-catalogue-2026-10-10). The code uses a platform ledger-code catalogue because Australia does not publish a single official code list.

### Inputs

| Input | Source | Unit |
| --- | --- | --- |
| `date`, `invoiceDate`, `paymentDate`, `originalDate` | GST ledger import or entry form | ISO date |
| `taxCode` | AU GST code catalogue | string |
| `netAmount`, `gstAmount` | GST ledger | cents |
| `amountBasis` | caller, default inferred | GST-exclusive or GST-inclusive |
| `hasTaxInvoice` | caller | boolean |
| `periodStart`, `periodEnd`, `accountingMethod`, `reportingCycle` | workspace period | dates and enum |

### Method

1. `buildAuBas` rejects a period where start is after end.
2. Each transaction is attributed to a BAS period. Cash basis uses payment date. Non-cash basis uses the earlier of invoice date and payment date.
3. Standard-rate GST is checked against 10% of the GST-exclusive amount. If the amount basis is absent and the GST equals one eleventh of the supplied amount within the tolerance, the engine infers GST-inclusive input.
4. Labels `G1`, `G10` and `G11` are GST-inclusive by default for BAS-facing amounts; the caller may request GST-exclusive amounts. `1A` and `1B` use GST cents exactly.
5. `reportedLabels` ignore cents: positive cents are floored to whole dollars and negative cents are floored by absolute value then restored. `labels` remain cent-accurate.
6. Net GST is `1A - 1B`; positive values are payable and negative values are refundable.
7. Domain reducers block edits in lodged periods, validate safe integer cents and reject imports over the configured cap. Recording lodgment snapshots the current box figures and locks the period until an authorised unlock.

### AU GST rate and BAS label table

| Item | Code value | Effective from | Rule |
| --- | --- | --- | --- |
| GST standard rate | 10% | 2000-07-01 | `au-gst.rate-and-bas.2026-10-10` |
| Full BAS labels | G1, G2, G3, G10, G11, 1A, 1B | 2000-07-01 | `au-gst.rate-and-bas.2026-10-10` |
| Simpler BAS labels | G1, 1A, 1B | 2000-07-01 | `au-gst.rate-and-bas.2026-10-10` |
| Platform G4 subtotal | input-taxed sales included within G1, not a current displayed BAS label | 2000-07-01 | `au-gst.codes.platform-catalogue.2026-10-10` |

### AU GST code mapping table

| Code | Side | BAS labels | Rate model | Claimability |
| --- | --- | --- | --- | --- |
| SALE_TAXABLE | SUPPLY | G1, 1A | STANDARD_10 | NOT_APPLICABLE |
| SALE_TAXABLE_NEW_RESIDENTIAL | SUPPLY | G1, 1A | STANDARD_10 | NOT_APPLICABLE |
| SALE_TAXABLE_COMMERCIAL_RESIDENTIAL | SUPPLY | G1, 1A | STANDARD_10 | NOT_APPLICABLE |
| SALE_GST_FREE_EXPORT | SUPPLY | G1, G2 | ZERO | NOT_APPLICABLE |
| SALE_GST_FREE_GOING_CONCERN | SUPPLY | G1, G3 | ZERO | NOT_APPLICABLE |
| SALE_INPUT_TAXED_RESIDENTIAL_RENT | SUPPLY | G1, G4 | ZERO | NOT_APPLICABLE |
| SALE_INPUT_TAXED_EXISTING_RESIDENTIAL | SUPPLY | G1, G4 | ZERO | NOT_APPLICABLE |
| SALE_INPUT_TAXED_FINANCIAL | SUPPLY | G1, G4 | ZERO | NOT_APPLICABLE |
| SALE_MARGIN_SCHEME | SUPPLY | G1, 1A | MARGIN_1_11 | NOT_APPLICABLE |
| PURCHASE_CAPITAL_TAXABLE | PURCHASE | G10, 1B | STANDARD_10 | FULL |
| PURCHASE_NON_CAPITAL_TAXABLE | PURCHASE | G11, 1B | STANDARD_10 | FULL |
| PURCHASE_CAPITAL_GST_FREE | PURCHASE | G10 | ZERO | NONE |
| PURCHASE_NON_CAPITAL_GST_FREE | PURCHASE | G11 | ZERO | NONE |
| PURCHASE_CAPITAL_INPUT_TAXED | PURCHASE | G10 | ZERO | NONE |
| PURCHASE_NON_CAPITAL_INPUT_TAXED | PURCHASE | G11 | ZERO | NONE |
| PURCHASE_CAPITAL_NO_CREDIT | PURCHASE | G10 | STANDARD_10 | NONE |
| PURCHASE_NON_CAPITAL_NO_CREDIT | PURCHASE | G11 | STANDARD_10 | NONE |
| ADJUSTMENT_GST_ON_SALES | SUPPLY | 1A | MANUAL | NOT_APPLICABLE |
| ADJUSTMENT_GST_ON_PURCHASES | PURCHASE | 1B | MANUAL | APPORTION |
| ADJUSTMENT_REVERSE_CHARGE | PURCHASE | none | MANUAL | APPORTION |

### AU BAS due-date table

| Period | Ordinary due date as coded | Registered-agent or online concession as coded | Rollover |
| --- | --- | --- | --- |
| Monthly | 21st of the following month | December agent concession may move to 21 February if turnover is at or below A$10,000,000 | weekend and national public holidays roll forward |
| Quarter ending September | 28 October | agent 25 November; online 11 December | weekend and national public holidays roll forward |
| Quarter ending December | 28 February | no special agent day in the table | weekend and national public holidays roll forward |
| Quarter ending March | 28 April | agent 26 May; online 12 June | weekend and national public holidays roll forward |
| Quarter ending June | 28 July | agent 25 August; online 11 September | weekend and national public holidays roll forward |
| Annual GST return | 31 October, 28 February if no income-tax return is required, or supplied income-tax return due date | caller supplies income-tax-return date for that mode | weekend and national public holidays roll forward |

### Worked examples

#### Example GSTAU-1: ATO fully taxable new residential sale

Source: ATO GST-at-settlement example reproduced by `test/engine/au/independent-gst-ids.test.ts`. Input is a A$900,000.00 GST-inclusive taxable sale of new residential premises in the quarter 2018-10-01 to 2018-12-31 using Simpler BAS.

| Step | Amount |
| --- | --- |
| Contract price reported at G1 | A$900,000.00 |
| GST payable as reported in the ATO example (1/11 of the price, shown in whole dollars on the BAS) | A$81,818.00 |
| `reportedLabels` | G1 A$900,000.00; 1A A$81,818.00; 1B A$0.00 |

The app displays whole dollars: G1 A$900,000, 1A A$81,818 and net GST payable A$81,818. A cent-rounded 1/11 would be A$81,818.18; the code uses the example's entered whole-dollar GST and accepts it within the rate-check tolerance.

#### Example GSTAU-2: ATO margin-scheme calculations

Source: ATO margin-scheme worked examples reproduced by `test/engine/au/gst.test.ts`. The consideration method uses sale price A$515,000.00 and purchase price A$150,000.00. Margin is A$365,000.00 and GST is one eleventh, A$33,181.82. The valuation method uses sale price A$1,440,000.00 and valuation A$1,000,000.00. Margin is A$440,000.00 and GST is A$40,000.00.

The helper reports the margin, not the gross sale price, as `basG1Amount`. It does not test eligibility, written agreements or valuation disputes.

#### Example BAS-1: Harbourline Jul-Sep 2025 demo BAS

A reviewer can open the live app, choose the AU fund Harbourline and the BAS period ending 2025-09-30. The seed ledger produces these `reportedLabels`:

| Label | Amount |
| --- | --- |
| G1 | A$30,942,352.00 |
| G2 | A$418,139.00 |
| G3 | A$0.00 |
| G10 | A$792,000.00 |
| G11 | A$5,857,034.00 |
| 1A | A$2,717,909.00 |
| 1B | A$591,470.00 |
| Net GST payable | A$2,126,439.00 |

The period is lodged in the seed data. Because Harbourline uses the default agent governance, the due date is 2025-11-25 rather than the ordinary 2025-10-28.

### Edge cases

* Unknown AU GST codes throw before any BAS amount is calculated.
* Manual adjustment codes can feed `1A`, `1B` or caller-supplied labels; reverse-charge treatment is a placeholder and needs user-supplied BAS labels.
* Credit notes and adjustments are represented as negative transactions or adjustment codes. Negative reported labels ignore cents by flooring the absolute value and restoring the sign.
* Input-taxed residential rent feeds `G1` and the internal `G4` subtotal but no `1A`.
* The domain workspace always builds quarterly AU BAS periods. `buildAuBas` itself supports monthly, quarterly and annual cycles.
* Missing tax invoices over A$82.50 GST-inclusive and expired four-year input-tax-credit claims create findings. The engine does not reopen earlier periods.

### Evidence

* `test/engine/au/gst.test.ts`: GST rate, classification, margin scheme, withholding, apportionment, BAS aggregation, rounding, registration, FTL and GIC tests.
* `test/engine/au/gstCodes.test.ts`: code uniqueness and G4 platform-only status.
* `test/engine/au/independent-gst-ids.test.ts`: independent BAS due dates, GST-at-settlement examples and ATO BAS example for a A$900,000 sale.
* `test/domain/gst/gst.test.ts`: Harbourline hand-checked BAS labels, period locks, import validation and seeded filings.
* `test/verify/gst/independent-gst-verifier.test.ts`: independent seeded-fund BAS recomputation, code mapping, due-date and reducer verification.
* `test/docs/au-gst.test.ts`: recomputes the worked examples and checks the rate, code and due-date tables in this document.

### Confidence

Grade A for the taxable sale and margin-scheme examples because `test/engine/au/independent-gst-ids.test.ts` reproduces the ATO GST-at-settlement A$900,000 example, `test/engine/au/gst.test.ts` ("margin scheme helpers match ATO worked examples") reproduces the ATO margin-scheme examples, and this document's test pins both. Grade B for the platform code catalogue and BAS workspace because they are independently verified against the engine and seeded ledgers, but the exact ledger-code list is a platform construct.

### Assumptions and limitations

The engine does not model bespoke partial-credit special methods, property margin-scheme eligibility disputes, ATO withholding variations, local public holidays unless passed by the caller, tax-agent deferrals outside the coded table, or the legal conclusion that a going concern's statutory conditions are satisfied.

## Property classification, margin scheme and adjustments

### What it computes

`classifyAuPropertySupply` suggests a GST code for commercial, new residential, existing residential, residential rent, commercial residential and potential residential land transactions. `computeMarginSchemeGst` calculates margin-scheme GST as one eleventh of the margin. `apportionAuInputTaxCredits` and `computeChangeInCreditablePurposeAdjustment` are simple engine helpers used for review calculations, not a bespoke ATO special method.

### Method

Commercial leases, management fees and service charges are taxable. Residential rent and existing residential sales are input taxed. New residential sales are taxable unless the margin-scheme code is chosen. A qualifying going-concern sale is coded GST-free and flagged for written-agreement support. Margin is `max(0, salePrice - purchasePriceOrValuation)` and GST is `Math.round(margin / 11)`.

### Evidence

The same evidence files listed above cover these helpers, including ATO margin-scheme and GST-at-settlement examples.

### Confidence

Grade A where the helper reproduces official examples; Grade B for classification paths that are verified by tests but still require legal fact confirmation.

## Registration, penalties and GIC

### What it computes

The engine assesses GST registration, failure-to-lodge penalty and general interest charge. These helpers are in the rule module but not all are displayed in the current AU BAS workspace.

### Registration and penalty table

| Item | Code value | Effective date |
| --- | --- | --- |
| Standard GST registration threshold | A$75,000.00 | 2000-07-01 |
| Non-profit GST registration threshold | A$150,000.00 | 2000-07-01 |
| Register-by period after threshold or special category | 21 days | 2000-07-01 |
| Tax invoice threshold for GST credits | A$82.50 | 2000-07-01 |
| FTL penalty unit | A$330.00 | 2024-11-07 to 2026-06-30 |
| FTL penalty unit | A$364.00 | 2026-07-01 |

### Evidence

`test/engine/au/gst.test.ts` and `test/engine/au/independent-gst-ids.test.ts` pin registration thresholds, penalty-unit change dates and GIC daily rates.

### Confidence

Grade B. The tests independently re-check published values, but no current app screen displays a full penalty calculator for AU BAS.

## Sources

* ATO, Goods and services tax (GST), retrieved by code authors 2026-10-10; cited by `au-gst.rate-and-bas.2026-10-10`.
* ATO, GST reporting methods, retrieved 2026-10-10; cited by `au-gst.rate-and-bas.2026-10-10`.
* ATO, Completing your BAS for GST: Step 1 sales and Step 3 purchases, retrieved 2026-10-10; cited by `au-gst.rate-and-bas.2026-10-10` and `au-gst.codes.platform-catalogue.2026-10-10`.
* ATO, GST and the margin scheme: calculating the GST payable, retrieved 2026-10-10; cited by `au-gst.property.2026-10-10`.
* ATO, GST at settlement, retrieved 2026-10-10; cited by `au-gst.property.2026-10-10`.
* ATO, Due dates for lodging and paying your BAS and registered-agent activity statement pages, retrieved 2026-10-10; cited by `au-gst.calendar.bas-due-dates.2026-10-10`.
