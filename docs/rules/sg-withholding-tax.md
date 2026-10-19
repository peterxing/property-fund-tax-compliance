# Singapore non-resident withholding tax

This document covers the **Withholding tax on non-resident payments** calculator (`sg-withholding-tax`). The code is in `src/engine/withholdingTax.ts` and computes Section 45 withholding categories, due dates, treaty-rate overrides and late-payment penalties. REIT distribution withholding is documented separately in [`sg-reit-distributions.md`](sg-reit-distributions.md).

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| Domestic WHT rates | Calculator `sg-withholding-tax` | IRAS withholding tax rates and payment-type pages | `src/engine/withholdingTax.ts` | B |
| Service-place rule | Same | IRAS non-resident professional / service guidance | `src/engine/withholdingTax.ts` | B |
| Due date and penalty | Same | IRAS WHT filing/payment due date and late-payment pages | `src/engine/withholdingTax.ts` | A for the IRAS late-payment example path; B for the due-date rule |
| Treaty-rate override | Same | IRAS DTA relief guidance | `src/engine/withholdingTax.ts` | D |

## Section 45 withholding tax

### What it computes

The engine computes withholding tax on selected payments to non-residents. It returns gross payment, statutory rate, effective rate, tax, net payment if withheld from gross, due date, optional late penalty, findings and explanatory notes.

### Legal basis

The rule entries cite IRAS pages for withholding tax payment types, non-resident professionals, non-resident directors, non-resident public entertainers, due dates, penalties and DTA relief. See [rule `withholding-tax.rates.current`](RULE-REGISTER.md#rule-sg-withholding-tax-rates-current), [rule `withholding-tax-service-place.current`](RULE-REGISTER.md#rule-sg-withholding-tax-service-place-current), [rule `withholding-tax.deadline.current`](RULE-REGISTER.md#rule-sg-withholding-tax-deadline-current), [rule `withholding-tax.penalty.current`](RULE-REGISTER.md#rule-sg-withholding-tax-penalty-current) and [rule `withholding-tax.treaty.override`](RULE-REGISTER.md#rule-sg-withholding-tax-treaty-override).

### Inputs

| Input | Source in app | Units / default |
| --- | --- | --- |
| Payment date | Calculator | ISO date; modelled from 2022-01-01 |
| Gross payment | Calculator | Integer cents |
| Payment type | Calculator select | Interest, royalty, director fees, technical service fees, rent of movable property; engine supports more categories |
| Service performed in Singapore | Calculator checkbox | Relevant for technical, management, consultancy and professional fees |
| Treaty rate (%) | Calculator number | Converted to basis points and capped at the lower of treaty and domestic rate |
| Remitted date | Calculator | Optional ISO date for penalty |

### Method

1. Reject payment dates before 2022-01-01.
2. Pick the current rate row.
3. If the input marks the fact pattern as outside WHT, return nil tax with finding `WHT.NOT_APPLICABLE`.
4. If domestic-law exemption is flagged, set statutory rate to nil for the calculation.
5. For technical, management, consultancy and professional fees, set the rate to nil when services are stated to be wholly outside Singapore, and emit `WHT.SERVICE_OUTSIDE_SINGAPORE`.
6. Effective rate is the lower of statutory rate and supplied treaty rate. If the treaty rate is higher than domestic, domestic rate is used and warning `WHT.TREATY_HIGHER_THAN_DOMESTIC` is emitted.
7. Tax is gross payment × effective basis-point rate, rounded half away from zero to cents.
8. Due date is the 15th day of the second month from payment date.
9. If remitted after due date, the penalty is 5% of tax. If the tax remains unpaid 30 days after the due date, add 1% of tax for each completed calendar month it remains unpaid, the additional penalty capped at 15% (20% in all).

### Withholding tax rates

| Payment type | Label | Rate | Service-place rule | Code rule |
| --- | --- | ---: | --- | --- |
| INTEREST | Interest | 15% | No | `withholding-tax.rates.current` |
| ROYALTY | Royalty | 10% | No | `withholding-tax.rates.current` |
| DIRECTOR_FEES | Director's fees | 24% | No | `withholding-tax.rates.current` |
| TECHNICAL_SERVICE_FEES | Technical service fees | 17% | Yes; nil if wholly outside Singapore | `withholding-tax.rates.current` |
| MANAGEMENT_FEES | Management fees | 17% | Yes; nil if wholly outside Singapore | `withholding-tax.rates.current` |
| CONSULTANCY_PROFESSIONAL_FEES | Consultancy / professional fees | 15% | Yes; nil if wholly outside Singapore | `withholding-tax.rates.current` |
| RENT_MOVABLE_PROPERTY | Rent of movable property | 15% | No | `withholding-tax.rates.current` |
| BRANCH_PROFIT_REMITTANCE | Branch profit remittance | 0% | No | `withholding-tax.rates.current` |
| NON_RESIDENT_PUBLIC_ENTERTAINER | Non-resident public entertainer | 15% | No | `withholding-tax.rates.current` |
| OTHER_SECTION_45 | Other Section 45 payment | 15% | No | `withholding-tax.rates.current` |

### Withholding due date and penalty thresholds

| Row | Method | Code rule |
| --- | --- | --- |
| Due date | 15th day of the second month from payment date | `withholding-tax.deadline.current` |
| First late penalty | 5% of unpaid WHT when remitted after due date | `withholding-tax.penalty.current` |
| Additional late penalty | 1% per completed calendar month from 30 days after the due date, capped at 15% extra | `withholding-tax.penalty.current` |
| Maximum penalty | 20% in all | `withholding-tax.penalty.current` |

### Worked examples

#### Example WHT-1: interest with treaty rate and late payment

| Input | Value |
| --- | --- |
| Payment date | 2026-08-15 |
| Gross payment | S$1,000,000.00 |
| Payment type | Interest |
| Treaty rate | 10% |
| Remitted date | 2026-11-20 |

The domestic interest rate is 15%, but the treaty override is 10%, so tax is S$100,000.00 and net payment if withheld from gross is S$900,000.00. The due date is 2026-10-15. Remittance on 2026-11-20 is 36 late days. The date 30 days after the due date is 2026-11-14, and no completed calendar month has elapsed from that date by 2026-11-20. The penalty is therefore 5% of S$100,000.00 = S$5,000.00 plus S$0.00 additional penalty, total S$5,000.00.

#### Example WHT-2: technical service wholly outside Singapore

| Input | Value |
| --- | --- |
| Payment date | 2026-08-15 |
| Gross payment | S$200,000.00 |
| Payment type | Technical service fees |
| Service performed in Singapore | No |

The statutory technical-service rate row is 17%, but the service-place rule reduces the effective rate to 0% because the work is stated to be wholly outside Singapore. Tax is S$0.00, net payment remains S$200,000.00 and the engine emits `WHT.SERVICE_OUTSIDE_SINGAPORE`.

#### Example WHT-3: IRAS late-payment worked example

Source: IRAS "Late payment and non-payment of taxes", read 19 October 2026.

| Input | Value |
| --- | --- |
| Payment date | 2025-05-26 |
| Gross royalty payment | S$70,000.00 |
| Domestic royalty rate | 10% |
| Remitted date | 2025-10-25 |

The royalty withholding tax is S$7,000.00 and is due on 2025-07-15. Payment on 2025-10-25 is 102 late days. The first penalty is 5% of S$7,000.00 = S$350.00. Two completed calendar months have elapsed from 2025-08-14 by the payment date, so the additional penalty is 1% x 2 x S$7,000.00 = S$140.00. Total penalty is S$490.00.

### Edge cases

* Gross payment below zero is floored to zero for tax, but the returned gross/net fields still reflect the supplied gross in non-exemption paths.
* Treaty entitlement is not checked. The user must confirm beneficial ownership, limitation-on-benefits and article scope before entering a treaty rate.
* The professional net-income election is not modelled.
* REIT distribution withholding is outside this module and belongs to [`sg-reit-distributions.md`](sg-reit-distributions.md).
* Domestic exemptions such as approved foreign loan concessions are not inferred.

### Evidence

Pinned by `test/engine/withholdingTax.test.ts` tests "withholdingTaxDueDate uses the 15th of the second month", "computeWithholdingTax applies the domestic interest rate and treaty override", "technical and management fees use the current prevailing corporate rate when taxable", "service fees can be nil where services are performed wholly outside Singapore", "late-payment penalty is added when remittance is after the due date", "late-payment penalty reproduces IRAS's worked example and caps the additional penalty at 15%" and "withholding payment-type catalogue covers all supported ids". Independent evidence is in `test/engine/independent-verification.test.ts` test "Withholding tax - Section 45 rates and due date". This document is checked by `test/docs/sg-withholding-tax.test.ts`, including Example WHT-3.

### Confidence

A for the late-payment penalty path that reproduces IRAS' S$7,000 to S$490 worked example in `test/engine/withholdingTax.test.ts` and this document test. B for domestic rates and due dates because they are re-derived by independent verification tests. Treaty override is D because it is an input mechanism, not an embedded treaty model.

### Assumptions and limitations

The calculator is a domestic-rate decision-support tool. It does not file WHT, embed DTA tables, determine source of income beyond the service-place flag, infer exemptions, or compute REIT distribution withholding.

## Sources

* IRAS, "Types of Payment and Withholding Tax (WHT) Rates" — cited by code, retrieved by code 2026-10-09, read for this document 2026-10-19.
* IRAS, "Payments that are Subject to Withholding Tax" — cited by code, retrieved by code 2026-10-09, read for this document 2026-10-19.
* IRAS, "Tax obligations for non-resident professional", "Tax for Non-Resident Directors" and "Tax obligations of non-resident public entertainer" — cited by code, retrieved by code 2026-10-09, read for this document 2026-10-19.
* IRAS, "Withholding Tax (WHT) filing and payment due date", "Late payment and non-payment of taxes" and "Claim of relief under the Avoidance of Double Taxation Agreement (DTA)" — cited by code, retrieved by code 2026-10-09, read for this document 2026-10-19.
