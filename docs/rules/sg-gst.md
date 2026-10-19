# Singapore GST, F5 returns and IRAS Audit File

The GST & BAS workspace builds Singapore GST F5 workpapers for Singapore funds, shows period due dates and lodged-period locks, imports GST ledger rows, exports CSV workpapers, and produces an assumed IRAS Audit File text export. The **GST registration and late penalties** calculator (`sg-gst`) assesses compulsory registration and computes late-filing and late-payment penalties. Amounts are integer cents; the UI normally displays whole Singapore dollars, while this document shows exact cents where a reviewer needs to tie arithmetic.

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| GST rate and F5 box construction | GST & BAS workspace, Singapore GST F5 periods and return boxes | IRAS GST rate and completing-GST-return guidance | `src/engine/gst.ts`, `src/engine/gstCodes.ts`, `src/domain/gst/index.ts` | B for rate/F5 construction and code-to-box mapping; A for official partial-exemption, registration, penalty and due-date examples |
| Property-industry GST and partial exemption | GST & BAS ledger, checks and F5 Box 7 | IRAS real-estate and partial-exemption guidance | `src/engine/gst.ts` | A for partial-exemption examples; B for property classification paths covered by verifier tests |
| GST registration | Calculators, `GST registration and late penalties` | IRAS compulsory registration guidance | `src/engine/gst.ts`, `src/app/workspaces/calculators/model.ts` | A |
| Late filing and late payment penalties | Calculators, `GST registration and late penalties` | IRAS late-filing and late-payment pages | `src/engine/gst.ts`, `src/app/workspaces/calculators/model.ts` | A |
| IRAS Audit File export | GST & BAS workspace, Singapore F5 export panel | Assumed layout from secondary descriptions only | `src/engine/iaf.ts`, `src/domain/gst/index.ts` | D |

## GST on supplies, purchases and property-industry treatment

### What it computes

The engine classifies GST ledger rows using GST tax codes, checks the GST amount against the prevailing rate for the row date, and feeds the F5 boxes. It also suggests GST codes for property-industry fact patterns: residential sale or lease is exempt (`ESN33`), commercial and industrial sale or lease is standard-rated (`SR`), mixed-use property is split between `SR` and `ESN33`, agent commissions / property-management fees / service charges are standard-rated, qualifying transfers of a going concern are out of scope (`OS`), and imported services are `SRRC` if reverse charge applies and `OP` otherwise.

### Legal basis

The engine rule is [RULE-REGISTER.md#rule-sg-gst-rate-and-f5-1994-plus](RULE-REGISTER.md#rule-sg-gst-rate-and-f5-1994-plus) for GST rates and F5 construction, [RULE-REGISTER.md#rule-sg-gst-partial-exemption-real-estate-2022-plus](RULE-REGISTER.md#rule-sg-gst-partial-exemption-real-estate-2022-plus) for property and partial exemption, and [RULE-REGISTER.md#rule-sg-gst-codes-asr-guide-2026](RULE-REGISTER.md#rule-sg-gst-codes-asr-guide-2026) for tax codes. IRAS pages read on 19 Oct 2026 were **Current GST rates**, **Completing GST returns**, **Claiming input tax incurred to make exempt supplies**, and **GST and the real estate industry**.

### Inputs

| Input | Unit | Source in the app | Code field |
| --- | --- | --- | --- |
| Transaction date | ISO date | GST ledger row / import | `date` |
| GST code | Code string | GST ledger row / import | `taxCode` or `code` |
| Net amount | SGD cents | GST ledger row / import | `netAmount` or `net` |
| GST amount | SGD cents | GST ledger row / import | `gstAmount` or `tax` |
| Currency | Text | Engine input; SG UI passes SGD | `currency` |
| Revenue override | SGD cents | Optional engine input | `revenue` |
| Adjustment claims | SGD cents and booleans | Optional engine input | `adjustmentClaims` |
| Partial-exemption override | SGD cents / basis points | Optional engine input | `partialExemption` |

### Method

1. Look up the GST code effective on the transaction date. Legacy aliases are normalised where `lookupGstCode` accepts them.
2. Pick the standard GST rate by the row date. This is the coded time-of-supply proxy: a row dated 2023-12-31 uses 8%, while a row dated 2024-01-01 uses 9%.
3. Compute expected GST as `Math.round(netAmount * rateBps / 10,000)` for standard-rated and deferred-import behaviours; zero-rated, exempt, no-GST and out-of-scope codes expect zero GST.
4. Accept the row if the actual GST differs by no more than the tolerance, which defaults to 2 cents in the engine and is 1 cent in the domain verifier.
5. Feed F5 base, tax and indicator boxes from the canonical code table. Negative rows, including credit notes, reduce the same boxes as the original code. The engine warns if a non-net box becomes negative.
6. Box 13 defaults to supply-side net amounts except deemed supplies and out-of-scope supplies, unless the caller passes a revenue override.
7. Box 7 is direct claimable input tax unless partial-exemption codes or an explicit partial-exemption input are present. If present, the partial-exemption method below replaces the direct total.

### Singapore GST standard-rate history

| Effective dates | Rate | Rule |
| --- | ---: | --- |
| 1 Apr 1994 to 31 Dec 2002 | 3% | `gst.rate-and-f5.1994-plus` |
| 1 Jan 2003 to 31 Dec 2003 | 4% | `gst.rate-and-f5.1994-plus` |
| 1 Jan 2004 to 30 Jun 2007 | 5% | `gst.rate-and-f5.1994-plus` |
| 1 Jul 2007 to 31 Dec 2022 | 7% | `gst.rate-and-f5.1994-plus` |
| 1 Jan 2023 to 31 Dec 2023 | 8% | `gst.rate-and-f5.1994-plus` |
| 1 Jan 2024 onward | 9% | `gst.rate-and-f5.1994-plus` |

### Singapore GST code to F5 box mapping

This is the current engine mapping. The test renders these rows from `GST_CODES`.

| Code | Side | Rate behaviour | Base boxes | Tax boxes | Indicator boxes | Claimability | Effective |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SR | SUPPLY | PREVAILING_STANDARD_RATE | 1 | 6 | - | NOT_APPLICABLE | 2022-01-01 |
| SRCA-S | SUPPLY | NO_GST | 1 | - | - | NOT_APPLICABLE | 2022-01-01 |
| SRCA-C | SUPPLY | PREVAILING_STANDARD_RATE | 1 | 6 | - | NOT_APPLICABLE | 2022-01-01 |
| SRRC | SUPPLY | PREVAILING_STANDARD_RATE | 1,14 | 6 | 14 | NOT_APPLICABLE | 2023-01-01 |
| SROVR | SUPPLY | PREVAILING_STANDARD_RATE | 1,15 | 6 | 15 | NOT_APPLICABLE | 2022-01-01 to 2022-12-31 |
| SROVR-RS | SUPPLY | PREVAILING_STANDARD_RATE | 1,15 | 6 | 15 | NOT_APPLICABLE | 2023-01-01 |
| SROVR-LVG | SUPPLY | PREVAILING_STANDARD_RATE | 1,16 | 6 | 16 | NOT_APPLICABLE | 2023-01-01 |
| SRLVG | SUPPLY | PREVAILING_STANDARD_RATE | 1,17 | 6 | 17 | NOT_APPLICABLE | 2023-01-01 |
| ZR | SUPPLY | ZERO_RATED | 2 | - | - | NOT_APPLICABLE | 2022-01-01 |
| ES33 | SUPPLY | EXEMPT | 3 | - | - | NOT_APPLICABLE | 2022-01-01 |
| ESN33 | SUPPLY | EXEMPT | 3 | - | - | NOT_APPLICABLE | 2022-01-01 |
| DS | SUPPLY | PREVAILING_STANDARD_RATE | 1 | 6 | - | NOT_APPLICABLE | 2022-01-01 |
| OS | SUPPLY | OUT_OF_SCOPE | - | - | - | NOT_APPLICABLE | 2022-01-01 |
| NA | SUPPLY | NO_GST | 1 | - | - | NOT_APPLICABLE | 2024-12-03 |
| TX | PURCHASE | PREVAILING_STANDARD_RATE | 5 | 7 | - | FULL | 2022-01-01 |
| TXCA | PURCHASE | PREVAILING_STANDARD_RATE | 5 | 7 | - | SUBJECT_TO_CONDITIONS | 2022-01-01 |
| TXNA | PURCHASE | NO_GST | 5 | - | - | NONE | 2024-12-03 |
| ZP | PURCHASE | ZERO_RATED | 5 | - | - | NONE | 2022-01-01 |
| IM | PURCHASE | PREVAILING_STANDARD_RATE | 5 | 7 | - | SUBJECT_TO_CONDITIONS | 2022-01-01 |
| ME | PURCHASE | IMPORT_GST_SUSPENDED | 5,9 | - | 9 | NONE | 2022-01-01 |
| IGDS | PURCHASE | IMPORT_GST_DEFERRED | 5,21 | 7,19 | 18,19,20,21 | SUBJECT_TO_CONDITIONS | 2022-01-01 |
| BL | PURCHASE | PREVAILING_STANDARD_RATE | - | - | - | NONE | 2022-01-01 |
| NR | PURCHASE | NO_GST | - | - | - | NONE | 2022-01-01 |
| EP | PURCHASE | EXEMPT | - | - | - | NONE | 2022-01-01 |
| OP | PURCHASE | OUT_OF_SCOPE | - | - | - | NONE | 2022-01-01 |
| TXRC-TS | PURCHASE | PREVAILING_STANDARD_RATE | 5 | 7 | - | FULL | 2023-01-01 |
| TX-ESS | PURCHASE | PREVAILING_STANDARD_RATE | 5 | 7 | - | REGULATION_33 | 2022-01-01 |
| TXRC-ESS | PURCHASE | PREVAILING_STANDARD_RATE | 5 | 7 | - | REGULATION_33 | 2023-01-01 |
| IM-ESS | PURCHASE | PREVAILING_STANDARD_RATE | 5 | 7 | - | REGULATION_33 | 2022-01-01 |
| TX-N33 | PURCHASE | PREVAILING_STANDARD_RATE | 5 | 7 | - | NONE | 2022-01-01 |
| TXRC-N33 | PURCHASE | PREVAILING_STANDARD_RATE | 5 | 7 | - | NONE | 2023-01-01 |
| IM-N33 | PURCHASE | PREVAILING_STANDARD_RATE | 5 | 7 | - | NONE | 2022-01-01 |
| TX-RE | PURCHASE | PREVAILING_STANDARD_RATE | 5 | 7 | - | APPORTION | 2022-01-01 |
| TXRC-RE | PURCHASE | PREVAILING_STANDARD_RATE | 5 | 7 | - | APPORTION | 2023-01-01 |
| IM-RE | PURCHASE | PREVAILING_STANDARD_RATE | 5 | 7 | - | APPORTION | 2022-01-01 |

### Partial-exemption thresholds and rounding

| Test or rate | Coded value | Method | Rule |
| --- | ---: | --- | --- |
| De minimis monthly exempt-supply limit | S$40,000.00 | Relevant exempt supplies divided by inclusive month count using truncation | `gst.partial-exemption.real-estate.2022-plus` |
| De minimis percentage limit | 5% | Exact integer cross-multiplication, no decimal rounding | `gst.partial-exemption.real-estate.2022-plus` |
| Regulation 35 non-Regulation 33 limit | 5% | Exact integer cross-multiplication, no decimal rounding | `gst.partial-exemption.real-estate.2022-plus` |
| Residual input-tax recovery | nearest whole percent | Half-up whole-percent rounding, then `Math.round(inputTax * bps / 10,000)` | `gst.partial-exemption.real-estate.2022-plus` |
| Input-tax claim time limit | 5 years | Adds five years to the invoice or import-permit date | `gst.partial-exemption.real-estate.2022-plus` |

### Worked examples

#### Example GSTSG-1: 2024 rate change, property supplies and a credit note

This constructed workpaper shows the code's date-based rate selection and property classifications. The row dated 2023-12-31 uses 8%, the row dated 2024-01-01 uses 9%, residential rent is exempt, and a 2024 credit note reduces the same standard-rated boxes.

| Row | Code | Net | GST |
| --- | --- | ---: | ---: |
| 2023-12-31 commercial lease | SR | S$1,000.00 | S$80.00 |
| 2024-01-01 commercial lease | SR | S$1,000.00 | S$90.00 |
| 2024-01-15 commercial credit note | SR | −S$100.00 | −S$9.00 |
| 2024-01-31 residential lease | ESN33 | S$500.00 | S$0.00 |

The engine reports Box 1 standard-rated supplies **S$1,900.00**, Box 3 exempt supplies **S$500.00**, Box 4 total supplies **S$2,400.00**, Box 6 output tax **S$161.00**, and Box 8 net GST **S$161.00**. `classifyPropertySupply` suggests `SR` for an office lease, `ESN33` for a residential lease and `SRRC` for an imported service where reverse charge applies.

#### Example GSTSG-2: IRAS partial-exemption and Regulation 35 worked example

IRAS' partial-exemption guide example is reproduced by the engine. Inputs are taxable supplies **S$1,000,000.00**, total exempt supplies **S$65,000.00**, of which **S$15,000.00** are Regulation 33 exempt supplies and **S$50,000.00** are non-Regulation 33 exempt supplies. Input tax is direct taxable **S$56,000.00**, direct Regulation 33 **S$7.00**, direct non-Regulation 33 **S$140.00**, and residual **S$700.00**.

The de minimis test fails because **S$65,000.00 / S$1,065,000.00 = 6.10%**, but Regulation 35 passes because **S$50,000.00 / S$1,065,000.00 = 4.69%**. The residual numerator is **S$1,015,000.00**, so **S$1,015,000.00 / S$1,065,000.00 = 95.3%**, rounded half-up to **95%**. Claimable input tax is **S$56,672.00**: **S$56,000.00 + S$7.00 + S$665.00**. Disallowed input tax is **S$175.00**.

### Edge cases

* Dates before 1 Apr 1994 throw `RangeError` because no GST rate is configured.
* Unknown or not-yet-effective GST codes produce findings and do not feed boxes.
* Negative rows are allowed and can create negative box warnings except for net GST boxes.
* Mixed-use property classification returns a split treatment only when the supplied non-residential share is greater than 0 and less than 100%.
* Partial-exemption special methods are not invented by the engine. They are represented only by explicit overrides.
* Reverse-charge imported services and LVG are modelled through `SRRC` on the supply side and `TXRC-*` purchase codes. The engine does not decide whether a business is an RC Business.
* Bad-debt relief is modelled mechanically: at least 12 months after payment due date, reasonable recovery steps unless not supplied as false, and GST rate by original supply date unless overridden.

### Evidence

* `test/engine/gst.test.ts`: GST rate history, partial-exemption IRAS examples, de minimis boundaries, mixed residential/commercial F5, property classifier, registration and penalties.
* `test/engine/gstCodes.test.ts`: current code lookup and legacy aliases.
* `test/engine/independent-verification-gst-reit.test.ts`: independently re-derives GST rates, F5 arithmetic and official partial-exemption / penalty examples from IRAS sources.
* `test/verify/gst/independent-gst-verifier.test.ts`: independent seeded SG F5 recomputation and code-to-box mapping.
* `test/docs/sg-gst.test.ts`: checks the document examples and tables against the engine.

### Confidence

A for the partial-exemption examples because the test suite and this document test reproduce IRAS worked examples. B for property classification and code-to-box mapping because independent verifier tests re-derive the arithmetic and mapping, but not every property fact pattern is an official example. D for TOGC classification unless a reviewer confirms all statutory conditions outside the app.

### Assumptions and limitations

The engine assumes the transaction date is the correct rate date; it does not separately model invoice, payment and transitional time-of-supply rules. It assumes ledger amounts are already in SGD. It does not model voluntary registration, reverse-charge registration, overseas vendor registration, special partial-exemption methods except overrides, or every bad-debt relief condition.

## F5 periods, due dates, lodgment and locking

### What it computes

For Singapore funds, `gstPeriods` derives quarterly GST F5 periods from the fund period end. It marks a period lodged when a matching `GstFiling` exists, overdue when the due date is before the supplied `now`, and open otherwise. `gstReturnView` builds boxes shown in the workspace, a ledger CSV, a return CSV, a worksheet CSV and the optional IAF export.

### Legal basis

IRAS' filing-due-date page says GST returns and payment are due one month after the accounting period; GIRO deductions are on the 15th day of the next month after the payment due date. The engine rule is [RULE-REGISTER.md#rule-sg-gst-registration-and-penalties-2022-plus](RULE-REGISTER.md#rule-sg-gst-registration-and-penalties-2022-plus).

### Inputs

| Input | Unit | Source |
| --- | --- | --- |
| Fund period end | ISO date | Seed / saved fund record |
| Current date | JavaScript `Date` | App context |
| GST ledger | Rows | Saved data or import |
| Lodgment record | `GstFiling` | User records lodgment |
| User permission | Role and fund access | App context |

### Method

1. For Singapore funds, start from the day after the date 12 months before the fund period end and create four three-month periods ending at month end.
2. Due date is `gstReturnDueDate(periodEnd)`. If the period ends on the last day of a month, the helper returns the last day of the next month; otherwise it adds one calendar month to the same day number. Normal quarter ends therefore give 30 Apr, 31 Jul, 31 Oct and 31 Jan, while special periods such as 5 Apr to 5 Jul 2026 are due on 5 Aug 2026.
3. The workspace label says the IRAS GST F5 is due one month after the quarter end.
4. A matching saved filing locks the period. Add, update, delete and import actions refuse rows dated in a lodged period until an authorised user unlocks the period.
5. Recording lodgment snapshots the current box figures into `GstFiling.figures`.

### Singapore F5 box formulas

| Box | Formula in code |
| --- | --- |
| Box 1 | Sum net amounts for `SR`, `SRCA-S`, `SRCA-C`, `DS`, `SRRC`, `SROVR`, `SROVR-RS`, `SROVR-LVG`, `SRLVG`, `NA` |
| Box 2 | Sum net amounts for `ZR` |
| Box 3 | Sum net amounts for `ES33`, `ESN33` |
| Box 4 | Box 1 + Box 2 + Box 3 |
| Box 5 | Sum net amounts for taxable-purchase and import code families |
| Box 6 | Sum GST amounts for output-tax code families |
| Box 7 | Direct claimable input tax, or partial-exemption claimable input tax, plus adjustment claims |
| Box 8 | Box 6 − Box 7 |
| Box 9 | `ME` imports plus `TXNA` rows with scheme `A3PL` |
| Box 13 | Supply-side net amounts excluding `DS` and `OS`, unless revenue override is supplied |
| Boxes 14 to 17 | Indicator boxes from reverse-charge / OVR / LVG supply codes |
| Box 18 | Box 8 |
| Box 19 | GST amount on `IGDS` |
| Box 20 | Box 8 + Box 19 |
| Box 21 | Net amount on `IGDS` |

### Worked examples

#### Example F5-1: Telok Ayer Jul-Sep 2026 seeded GST F5

A reviewer can open the live app, choose the **Telok Ayer** Singapore fund in the **GST & BAS** workspace, and select **GST F5 Jul–Sep 2026**. The seed ledger for that period contains commercial rent and recoveries, exported support, a residential exempt component, taxable operating expenses, residual overheads, a blocked input-tax item and zero-rated imported equipment.

| F5 box | Engine amount |
| --- | ---: |
| SG_F5.1 | S$14,722,819.57 |
| SG_F5.2 | S$433,024.11 |
| SG_F5.3 | S$757,792.18 |
| SG_F5.4 | S$15,913,635.86 |
| SG_F5.5 | S$7,040,308.11 |
| SG_F5.6 | S$1,325,053.76 |
| SG_F5.7 | S$553,220.73 |
| SG_F5.8 | S$771,833.03 |
| SG_F5.9 | S$0.00 |
| SG_F5.13 | S$15,913,635.86 |
| SG_F5.14 | S$0.00 |
| SG_F5.19 | S$0.00 |
| SG_F5.21 | S$0.00 |

Box 1 is **S$14,722,819.57**, Box 2 is **S$433,024.11**, Box 3 is **S$757,792.18**, and Box 4 is their sum, **S$15,913,635.86**. Box 6 is 9% of standard-rated supplies, **S$1,325,053.76**. Box 7 is **S$553,220.73** after partial exemption on residual overheads, so Box 8 and Box 20 are **S$771,833.03** payable.

#### Example F5-2: IRAS GST F5 due dates and GIRO date

Source: IRAS "GST filing due dates and requests for extension", read 19 October 2026.

The engine reproduces the IRAS due-date table for ordinary quarters: a quarter ending 2026-06-30 is due 2026-07-31, and a quarter ending 2026-03-31 is due 2026-04-30. The IRAS special-period example ending 2026-07-05 is due 2026-08-05. For the 2026-06-30 quarter, the GIRO deduction helper returns 2026-08-15, the 15th day of the month after the 2026-07-31 payment due date.

### Edge cases

* A lodged filing protects the stored filing range even if fund period dates later shift.
* Imports replace open-period rows for the fund but keep lodged-period rows.
* Imports are capped at 2,000 rows and validate dates, market-specific GST codes and GST amount mismatches.
* Special accounting periods are due one month after their period end, using the engine date helper.

### Evidence

* `src/domain/gst/seed.ts` and `test/domain/gst/gst.test.ts`: seeded F5 boxes, IAF export, due dates, locks, import validation and lodgment snapshots.
* `test/verify/gst/independent-gst-verifier.test.ts`: independent seeded F5 recomputation and providers.
* `test/docs/sg-gst.test.ts`: pins Example F5-1 to `seedData()` and `gstReturnView()`.

### Confidence

A for due dates because `test/engine/independent-verification-gst-reit.test.ts` and this document test reproduce the IRAS quarter-end and special-period examples: `gstReturnDueDate("2026-06-30") === "2026-07-31"` and `gstReturnDueDate("2025-09-30") === "2025-10-31"`. B for seeded F5 arithmetic and workspace behaviour because verifier tests re-derive them and this document pins them with seeded app data, but no official IRAS F5 box worked example is reproduced.

### Assumptions and limitations

The app records lodgment; it does not electronically file GST F5. It does not model extension requests, GIRO success or failure, or myTax Portal statuses. Locked-period controls are app controls, not statutory amendment rules.

## GST registration assessment

### What it computes

The `sg-gst` calculator calls `assessGstRegistration` to decide whether GST registration is required under the coded retrospective or prospective tests.

### Legal basis

IRAS' registration page says compulsory registration applies when taxable turnover is more than S$1 million under the retrospective calendar-year view or expected to be more than S$1 million in the next 12 months under the prospective view. It also states the 2025 prospective timing change. The engine rule is [RULE-REGISTER.md#rule-sg-gst-registration-and-penalties-2022-plus](RULE-REGISTER.md#rule-sg-gst-registration-and-penalties-2022-plus).

### Inputs

| Calculator field | Unit | Code field |
| --- | --- | --- |
| Assessment date | ISO date | `assessmentDate` |
| Retrospective annual taxable turnover | SGD cents | `retrospectiveAnnualTaxableTurnover` |
| Forecast taxable turnover next 12 months | SGD cents | `forecastTaxableTurnoverNext12Months` |
| Forecast date | ISO date | The calculator reuses Assessment date |

### Method

1. Threshold is **S$1,000,000.00**.
2. If retrospective annual taxable turnover is greater than the threshold, registration is required on a retrospective basis. Equal to S$1,000,000.00 is not enough.
3. Retrospective application due date is 30 days after the assessment date. Effective registration date is 1 March of the year after the assessment year.
4. Otherwise, if forecast turnover is greater than the threshold and a forecast date is supplied, registration is required on a prospective basis.
5. Prospective application due date is 30 days after the forecast date.
6. Prospective effective date is the 31st day after the forecast date before 1 Jul 2025, and two months after the forecast date on or after 1 Jul 2025.
7. Otherwise registration is not required and due/effective dates are not supplied.

### Singapore GST registration thresholds and dates

| Test | Threshold / date rule | Code behaviour |
| --- | --- | --- |
| Retrospective turnover | More than S$1,000,000.00 | `>` threshold, not `>=` |
| Prospective turnover | More than S$1,000,000.00 | `>` threshold and forecast date required |
| Application due date | 30 days after assessment or forecast date | `addDays(date, 30)` |
| Retrospective effective date | 1 Mar of the next calendar year | `${assessmentYear + 1}-03-01` |
| Prospective effective date before 1 Jul 2025 | 31st day after forecast date | `addDays(forecastDate, 31)` |
| Prospective effective date on/after 1 Jul 2025 | 2 months after forecast date | `addMonths(forecastDate, 2)` |

### Worked examples

#### Example GSTREG-1: IRAS retrospective and prospective registration timing

IRAS Example 1 says taxable turnover from 1 Jan to 31 Dec 2025 exceeding S$1 million requires application from 1 to 30 Jan 2026 and registration on 1 Mar 2026. With assessment date **2025-12-31** and turnover **S$1,000,000.01**, the engine reports basis **RETROSPECTIVE**, application due **2026-01-30**, and effective registration **2026-03-01**. At exactly **S$1,000,000.00**, it reports **registration not required**.

For a forecast before 1 Jul 2025, a forecast dated **2025-03-15** with next-12-month turnover **S$1,500,000.00** gives application due **2025-04-14** and effective registration **2025-04-15**. For a forecast on or after 1 Jul 2025, a forecast dated **2025-08-10** with next-12-month turnover **S$1,500,000.00** gives application due **2025-09-09** and effective registration **2025-10-10**.

### Edge cases

* Missing forecast date prevents the prospective test from requiring registration.
* Retrospective turnover is checked first. If both tests exceed the threshold, the result is retrospective.
* Voluntary registration, exception applications, reverse-charge registration and overseas vendor registration are not modelled.

### Evidence

* `test/engine/gst.test.ts`: 2025 prospective timing change.
* `test/engine/independent-verification-gst-reit.test.ts`: official retrospective and prospective examples, threshold edge and timing change.
* `test/verify/calculators/calculator-verifier.test.ts`: `sg-gst` calculator default output and rule filtering.
* `test/docs/sg-gst.test.ts`: pins Example GSTREG-1 and the threshold table.

### Confidence

A. The document test and independent verifier reproduce IRAS' registration examples and threshold edge using the engine.

### Assumptions and limitations

The calculator does not ask whether the forecast is certain or supported by contracts, orders or other evidence. It does not model registration exception approvals or voluntary registration conditions.

## GST late filing and late payment penalties

### What it computes

The `sg-gst` calculator calls `computeGstLateFilingPenalty` and `computeGstLatePaymentPenalty`. The headline **Penalties** amount is their sum.

### Legal basis

IRAS' late-filing page says a S$200 late submission penalty is imposed immediately, a further S$200 for every completed month outstanding, capped at S$10,000. IRAS' late-payment page says a 5% late payment penalty applies and, if unpaid 60 days after the 5% penalty is imposed, an additional 2% per month may be imposed, capped at 50% of unpaid tax. The engine rule is [RULE-REGISTER.md#rule-sg-gst-registration-and-penalties-2022-plus](RULE-REGISTER.md#rule-sg-gst-registration-and-penalties-2022-plus).

### Inputs

| Calculator field | Unit | Code field |
| --- | --- | --- |
| GST return / payment due date | ISO date | `dueDate` |
| Filed date | ISO date | `filedDate` |
| Unpaid tax | SGD cents | `unpaidTax` |
| Paid date | ISO date | `paidDate` |
| Penalty notice date | ISO date | Engine input only; calculator uses default |

### Method

1. Late filing: if filed date is on or before due date, penalty is zero.
2. Otherwise, completed months late are computed by `monthsBetween(dueDate, filedDate)`. Penalty is `(1 + completedMonthsLate) × S$200.00`, capped at **S$10,000.00**.
3. Late payment: if unpaid tax is zero or less, or paid date is on or before due date, penalty is zero.
4. First late-payment penalty is 5% of unpaid tax, rounded by `Math.round(unpaidTax × 500 / 10,000)`.
5. The notice date defaults to the day after the due date. If paid on or before 60 days after the notice date, only the 5% penalty applies.
6. If still unpaid after that, additional penalty is `2% × monthsBetween(dueDate, paidDate)`, capped at 50% of the unpaid tax. The total is 5% plus the capped additional penalty.

### Singapore GST penalty thresholds

| Penalty | Coded value | Cap | Rule |
| --- | ---: | ---: | --- |
| Late filing immediate penalty | S$200.00 | S$10,000.00 per return | `gst.registration-and-penalties.2022-plus` |
| Late filing monthly increment | S$200.00 per completed month | S$10,000.00 per return | `gst.registration-and-penalties.2022-plus` |
| Late payment first penalty | 5% of unpaid tax | No separate cap in code | `gst.registration-and-penalties.2022-plus` |
| Late payment additional penalty | 2% per month | 50% of unpaid tax | `gst.registration-and-penalties.2022-plus` |
| Additional-penalty trigger | 60 days after 5% penalty notice | N/A | `gst.registration-and-penalties.2022-plus` |

### Worked examples

#### Example GSTPEN-1: IRAS late-payment Example 4 and late-filing increments

IRAS Example 4 has a GST F5 for period ending 30 Jun 2025, due **2025-07-31**, unpaid GST **S$10,000.00**, a late-payment penalty notice on **2025-08-05**, and payment on **2025-12-16**. The engine computes first penalty **S$500.00** and additional penalty **S$800.00** for four months at 2%, giving total late-payment penalty **S$1,300.00**.

For late filing, the same function family applies the IRAS rule mechanically. A return due **2025-10-31** and filed **2026-02-15** is late by three completed months, so the penalty is **S$800.00**: **S$200.00** immediately plus **3 × S$200.00**. The cap example due **2025-10-31** and filed **2030-01-15** gives **S$10,000.00**.

The calculator defaults also remain pinned: retrospective registration is required and penalties are **S$13,600** in whole-dollar UI display, made up of late filing **S$600** and late payment **S$13,000**.

### Edge cases

* Filing or payment on the due date has no penalty.
* Unpaid tax of zero has no late-payment penalty.
* The calculator does not expose penalty notice date; the engine default is the day after due date.
* IRAS penalty notices prevail if their dates differ from the engine default.
* Waivers, summonses, estimated assessments and revisions are not modelled.

### Evidence

* `test/engine/gst.test.ts`: late-filing increments and late-payment IRAS S$10,000 to S$1,300 example.
* `test/engine/independent-verification-gst-reit.test.ts`: independently re-derived late-filing and late-payment examples from IRAS pages.
* `test/verify/calculators/calculator-verifier.test.ts`: `sg-gst` calculator default UI output.
* `test/docs/sg-gst.test.ts`: pins Example GSTPEN-1 and penalty table.

### Confidence

A. The late-payment worked example reproduces IRAS Example 4 exactly, and the late-filing example reproduces the official increment and cap rule.

### Assumptions and limitations

The engine treats the late-payment additional penalty months as `monthsBetween(dueDate, paidDate)`, matching the coded interpretation used for IRAS Example 4. It does not decide whether IRAS will exercise discretion, issue a summons, appoint agents, or waive penalties.

## IRAS Audit File export

### What it computes

For Singapore GST return views, the app builds an IAF text export using `buildIaf`. The export includes company information, purchase ledger, supply ledger and general ledger sections.

### Legal basis

The code explicitly says the IAF layout is assumption-heavy. The rule is [RULE-REGISTER.md#rule-sg-gst-iaf-export-assumed-2022-plus](RULE-REGISTER.md#rule-sg-gst-iaf-export-assumed-2022-plus), sourced only to secondary descriptions because a directly verifiable official IRAS field-layout specification was not located.

### Inputs

| Input | Unit | Source |
| --- | --- | --- |
| Company name, UEN, GST number | Text | Fund and generated demo identifiers |
| Period start and end | ISO date | Selected GST period |
| Prepared date and contact | ISO date / text | Lodgment record when present |
| Purchase ledger | Rows | SG GST entries whose code side is PURCHASE |
| Supply ledger | Rows | SG GST entries whose code side is SUPPLY |
| General ledger | Rows | One row per SG GST entry |

### Method

1. Validate company name, UEN and GST registration number are present.
2. Validate every purchase, supply and GL tax code is known on the row date.
3. Emit pipe-delimited sections in this order: `[CompanyInfo]`, `[PurchaseLedger]`, `[SupplyLedger]`, `[GeneralLedger]`.
4. Amounts are formatted as decimal dollars with two places. Newlines and pipe characters in text fields are replaced with spaces.
5. Always add warning `IAF.SPEC.ASSUMED`.

### IRAS Audit File assumed sections

| Section | Header |
| --- | --- |
| CompanyInfo | Field\|Value |
| PurchaseLedger | LineNo\|Date\|DocumentNo\|Counterparty\|CounterpartyRef\|Description\|TaxCode\|Currency\|NetAmountSGD\|GSTAmountSGD\|GrossAmountSGD\|PropertyRef\|PermitNumber |
| SupplyLedger | LineNo\|Date\|DocumentNo\|Counterparty\|CounterpartyRef\|Description\|TaxCode\|Currency\|NetAmountSGD\|GSTAmountSGD\|GrossAmountSGD\|PropertyRef |
| GeneralLedger | LineNo\|Date\|JournalNo\|AccountCode\|AccountName\|Description\|DebitSGD\|CreditSGD\|TaxCode\|SourceDocumentNo |

### Worked examples

#### Example IAF-1: Assumed pipe-delimited IAF sections

For a simple company **Example S-REIT**, the builder emits version **IRAS-IAF-ASSUMED-2026.1** and these section markers: **[CompanyInfo]**, **[PurchaseLedger]**, **[SupplyLedger]**, and **[GeneralLedger]**. A purchase row for document **P001** with net **S$1,000.00** and GST **S$90.00** is emitted as **1|2026-02-01|P001|Vendor|||TX|SGD|1000.00|90.00|1090.00||**. A supply row for document **S001** with net **S$2,000.00** and GST **S$180.00** is emitted as **1|2026-02-01|S001|Tenant|||SR|SGD|2000.00|180.00|2180.00|**. The findings include **IAF.SPEC.ASSUMED**.

### Edge cases

* Missing company details produce `IAF.COMPANY.REQUIRED` errors but the text can still be built.
* Unknown purchase or supply codes produce `IAF.CODE.UNKNOWN`; unknown GL codes produce `IAF.GL_CODE.UNKNOWN`.
* The export is not an IRAS-validated schema. It is a review aid only.

### Evidence

* `test/engine/iaf.test.ts`: section emission and code validation.
* `test/domain/gst/gst.test.ts`: seeded Telok Ayer IAF export structure.
* `test/docs/sg-gst.test.ts`: pins Example IAF-1 and the assumed section headers.

### Confidence

D. The code is tested, but the layout is not verified against an official IRAS specification. Treat the export as an internal audit workpaper until a reviewer compares it with the latest accepted IAF schema.

### Assumptions and limitations

Demo UENs and GST registration numbers are generated. The engine does not produce a binary or XML statutory file, does not encrypt the output, and does not submit it to IRAS.

## Sources

| Source | Code cites it? | Read for this document |
| --- | --- | --- |
| IRAS, **Current GST rates**, https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/basics-of-gst/current-gst-rates | Yes | 19 Oct 2026 |
| IRAS, **Completing GST returns**, https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/filing-gst/completing-gst-returns | Yes | 19 Oct 2026 |
| IRAS, **GST filing due dates and requests for extension**, https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/filing-gst/gst-filing-due-dates-and-requests-for-extension | Yes | 19 Oct 2026 |
| IRAS, **Claiming input tax incurred to make exempt supplies**, https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/claiming-gst-(input-tax)/claiming-input-tax-incurred-to-make-exempt-supplies | Yes | 19 Oct 2026 |
| IRAS, **GST: Partial Exemption and Input Tax Recovery (6th Edition)**, https://www.iras.gov.sg/docs/default-source/e-tax/etax-guide-on-partial-exemption-and-input-tax-recovery-6th-edition.pdf | Yes | 19 Oct 2026 through existing tests and rule register |
| IRAS, **GST and the real estate industry**, https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/specific-business-sectors/real-estate | Yes | 19 Oct 2026 |
| IRAS, **Do I need to register for GST**, https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-registration-deregistration/do-i-need-to-register-for-gst | Yes | 19 Oct 2026 |
| IRAS, **Late filing or non-filing of GST returns (F5/F8)**, https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/filing-gst/late-filing-or-non-filing-of-gst-returns-f5-f8 | Yes | 19 Oct 2026 |
| IRAS, **Late payment or non-payment of GST**, https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/gst-payments-refunds/late-payment-or-non-payment-of-gst | Yes | 19 Oct 2026 |
| Microsoft Learn, **IRAS Audit File (Singapore)**, https://learn.microsoft.com/ | Yes, secondary only | Not independently relied on beyond the code's assumption warning |
| Oracle NetSuite, **Singapore GST Audit File support notes**, https://docs.oracle.com/ | Yes, secondary only | Not independently relied on beyond the code's assumption warning |
