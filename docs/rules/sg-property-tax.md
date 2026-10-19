# Singapore property tax

The app calculates Singapore annual property tax in the Property taxes workspace, on the **Annual taxes** tab for SG funds, in the annual-tax KPI and notices/variance checks, and in the **Property tax** calculator (`sg-property-tax`). The app uses the annual value entered; it does not estimate annual value.

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| Owner-occupier residential property tax | Property taxes > Annual taxes; Property tax calculator | IRAS Property Tax Rates and Sample Calculations; Property Tax Reliefs | `src/engine/propertyTax.ts`, `computePropertyTax` | A |
| Non-owner-occupier residential property tax | Property taxes > Annual taxes; Property tax calculator | IRAS Property Tax Rates and Sample Calculations | `src/engine/propertyTax.ts`, `computePropertyTax` | B |
| Non-residential, vacant land and excluded 10% class | SG fund annual taxes and seeded demo properties | IRAS Property Tax Rates and Sample Calculations | `src/engine/propertyTax.ts`, `computePropertyTax`; `src/domain/ptax/index.ts` | B |
| Notices and variance check | Annual taxes row, assessed label, due date, KPI data-needs count | IRAS payment and objection guidance | `src/domain/ptax/index.ts`, `assessmentFields`; `src/engine/propertyTax.ts` | B |

## Annual property tax

### What it computes

`computePropertyTax` returns gross tax, owner-occupier rebate, net tax, band breakdowns, deadlines, rule version, notes and findings for one calendar year. In the SG annual taxes tab, each property is computed as one full-year segment from 1 January to 31 December using the profile's **Annual value** and **Usage**. The UI stores gross tax in the **Tax** column, a negative rebate in the **Rebate** column, and net tax in **Total**.

### Legal basis

The engine rule entries cite IRAS pages for property tax rates, annual value, reliefs, payment due dates, objection due dates and seller/buyer apportionment. The relevant generated rule-register anchors are [owner-occupier rates](RULE-REGISTER.md#rule-sg-property-tax-rates-ootr-2025), [non-owner-occupier rates](RULE-REGISTER.md#rule-sg-property-tax-rates-noor-2024), [10% rule](RULE-REGISTER.md#rule-sg-property-tax-other-10pct), [rebates](RULE-REGISTER.md#rule-sg-property-tax-rebates-2023-2026), [deadlines](RULE-REGISTER.md#rule-sg-property-tax-deadlines-current) and [private apportionment](RULE-REGISTER.md#rule-sg-property-tax-private-apportionment-assumption).

### Inputs

| App field or source | Engine input | Unit and mapping |
| --- | --- | --- |
| Year / current date | `year` | SG funds use the calendar year containing `ctx.now`; the calculator uses the **Year** field. |
| Annual value | `annualValue` | Integer cents. The app uses the value entered; it does not estimate AV. |
| Usage | `usage` | `OWNER_OCCUPIED_RESIDENTIAL`, `NON_OWNER_OCCUPIED_RESIDENTIAL`, or `NON_RESIDENTIAL_OR_VACANT`. |
| Owner occupied | `usage` override in the workspace | If `sgOwnerOccupied` is true and the stored usage is non-owner-occupied residential, the workspace passes owner-occupier usage. |
| Residential type | `residentialType` | The workspace and calculator pass `PRIVATE` for owner-occupied properties. Direct engine callers may pass HDB categories or omit the type. |
| Owner share (%) | `ownerShareBps` | Calculator field. Workspace rows do not expose this and use 100%. |
| Notice type and date | `notice` | Annual bill due date, other notice due date and valuation objection date. |

### Method

1. Validate that the year is an integer from 2015 onwards and that each segment lies inside that calendar year.
2. Clamp negative annual value to zero. Default owner share is 10,000 bps (100%).
3. Count calendar days inclusively. The denominator is 365 or 366 for leap years.
4. Pick the effective table by year. Owner-occupier and non-owner-occupier residential rates are progressive. Non-residential, vacant and excluded classes use 10% flat.
5. For each band, compute `annualTax = mulBps(taxableAmount, rateBps)`. `mulBps` rounds half away from zero to the nearest cent.
6. Prorate each band by days: `Math.round(annualTax * segmentDays / daysInYear)`. JavaScript `Math.round` rounds to whole cents.
7. Apply any owner-occupier rebate to the prorated owner-occupier tax before owner-share apportionment. Rebate uses `mulBps`, then applies the coded cap where present.
8. Apply owner share to tax and rebate separately with `Math.round(amount * ownerShareBps / 10_000)`. This is an internal reconciliation split; the engine emits an information finding because IRAS treats co-owners as jointly liable.
9. Sum segments. Net tax is gross tax minus rebate.
10. Deadlines: annual bills are due 31 January; other notices are due one month after the notice date; valuation notices also set an objection date 30 days after the notice date. If no valuation notice objection date exists, the engine uses 31 December.

### Owner-occupier residential property tax rates and thresholds

The following rows are rendered from `computePropertyTax` band breakdowns in the documentation test.

| Effective years | Rule version | Bands as coded |
| --- | --- | --- |
| 2015-2022 | property-tax.ootr.2015 | First S$8,000 @ 0%; Next S$47,000 @ 4%; Next S$15,000 @ 6%; Next S$15,000 @ 8%; Next S$15,000 @ 10%; Next S$15,000 @ 12%; Next S$15,000 @ 14%; Remainder @ 16% |
| 2023 | property-tax.ootr.2023 | First S$8,000 @ 0%; Next S$22,000 @ 4%; Next S$10,000 @ 5%; Next S$15,000 @ 7%; Next S$15,000 @ 10%; Next S$15,000 @ 14%; Next S$15,000 @ 18%; Remainder @ 23% |
| 2024 | property-tax.ootr.2024 | First S$8,000 @ 0%; Next S$22,000 @ 4%; Next S$10,000 @ 6%; Next S$15,000 @ 10%; Next S$15,000 @ 14%; Next S$15,000 @ 20%; Next S$15,000 @ 26%; Remainder @ 32% |
| 2025 onward | property-tax.ootr.2025 | First S$12,000 @ 0%; Next S$28,000 @ 4%; Next S$10,000 @ 6%; Next S$25,000 @ 10%; Next S$10,000 @ 14%; Next S$15,000 @ 20%; Next S$40,000 @ 26%; Remainder @ 32% |

### Non-owner-occupier residential property tax rates and thresholds

| Effective years | Rule version | Bands as coded |
| --- | --- | --- |
| 2015-2022 | property-tax.noor.2015 | First S$30,000 @ 10%; Next S$15,000 @ 12%; Next S$15,000 @ 14%; Next S$15,000 @ 16%; Next S$15,000 @ 18%; Remainder @ 20% |
| 2023 | property-tax.noor.2023 | First S$30,000 @ 11%; Next S$15,000 @ 16%; Next S$15,000 @ 21%; Remainder @ 27% |
| 2024 onward | property-tax.noor.2024 | First S$30,000 @ 12%; Next S$15,000 @ 20%; Next S$15,000 @ 28%; Remainder @ 36% |

### Other property tax rate and rebate settings

| Setting | Effective period | Coded result |
| --- | --- | --- |
| Non-residential / vacant / other 10% class | All modelled years | 10% of annual value; rule `property-tax.other.10pct` |
| 2023 owner-occupier rebate | 2023 | 60% of owner-occupier tax, capped at S$60.00 |
| 2024 HDB rebates | 2024 | HDB 1/2-room 100%; HDB 3-room 70%; HDB 4-room 50%; HDB 5-room 40%; HDB executive 30% |
| 2024 private / other owner-occupied rebate | 2024 | 15% capped at S$1,000.00 |
| 2025 HDB rebates | 2025 | 20% for all HDB categories |
| 2025 private / other owner-occupied rebate | 2025 | 15% capped at S$1,000.00 |
| 2026 HDB rebates | 2026 | 15% for all HDB categories |
| 2026 private / other owner-occupied rebate | 2026 | 10% capped at S$500.00 |

### Worked examples

#### Example PT-1: IRAS owner-occupier rate example, 2025 AV S$36,000

Source: IRAS Property Tax Rates and Sample Calculations, read 19 October 2026; also pinned by `test/engine/independent-verification.test.ts`.

| Input | Value |
| --- | --- |
| Year | 2025 |
| Usage | Owner-occupied residential |
| Residential type | Not supplied, so this isolates the rate table and does not apply a rebate |
| Annual value | S$36,000.00 |

Arithmetic: first S$12,000 at 0% = S$0.00; next S$24,000 at 4% = S$960.00. Gross tax is S$960.00, rebate is S$0.00 and net tax is S$960.00. If the workspace or calculator passes `PRIVATE` for this same AV in 2025, the code also applies a 15% private-property rebate of S$144.00 and net tax becomes S$816.00.

#### Example PT-2: Property tax calculator default non-residential property

| Input | Value |
| --- | --- |
| Year | 2026 |
| Usage | Non-residential / vacant |
| Annual value | S$240,000.00 |
| Owner share | 100% |
| Notice | Annual bill dated 1 Jan 2026 |

Arithmetic: S$240,000.00 x 10% = S$24,000.00. The result is gross tax S$24,000.00, rebate S$0.00, net tax S$24,000.00. The annual bill payment due date is 2026-01-31. This is the default calculator scenario checked by `test/verify/calculators/calculator-verifier.test.ts`.

#### Example PT-3: Part-year and shared ownership reconciliation

| Input | Value |
| --- | --- |
| Year | 2025 |
| Usage | Non-residential / vacant |
| Annual value | S$100,000.00 |
| Segment | 1 Jul 2025 to 31 Dec 2025 inclusive, 184 days |
| Owner share | 50% |

Arithmetic: annual tax is S$100,000.00 x 10% = S$10,000.00. Part-year tax is `round(S$10,000.00 x 184 / 365)` = S$5,041.10. Owner-share gross tax is `round(S$5,041.10 x 50%)` = S$2,520.55. Rebate is S$0.00 and net tax is S$2,520.55. The engine emits an information finding that the owner-share split is for internal reconciliation only.

#### Example PT-4: Demo SG annual taxes, Telok Ayer Commercial REIT

Reviewer path: open the Property taxes workspace, choose Telok Ayer Commercial REIT, and inspect **Annual taxes** for 2026.

| Property | Annual value | Tax | Rebate | Total | Notice variance |
| --- | ---: | ---: | ---: | ---: | ---: |
| Telok Ayer Tower | S$137,557,214.73 | S$13,755,721.47 | S$0.00 | S$13,755,721.47 | S$0.00 |
| Cecil Exchange | S$84,875,728.23 | S$8,487,572.82 | S$0.00 | S$8,487,572.82 | S$0.00 |
| Bugis Gateway Mall | S$70,241,982.03 | S$7,024,198.20 | S$0.00 | S$7,024,198.20 | No notice |

All three rows use `NON_RESIDENTIAL_OR_VACANT`, so each total is 10% of annual value. Telok Ayer Tower and Cecil Exchange have seeded notices equal to the modelled totals, so the variance check says the assessed amount matches modelled.

### Edge cases

Zero or negative annual value produces zero tax because negative AV is clamped to zero. Dates outside the selected calendar year throw a range error. Years before 2015 throw a range error. Missing annual value or usage in the workspace shows a missing-data row and does not include a guessed amount in totals. For non-owner-occupied residential with `excludedFromNonOwnerResidentialRates`, direct engine callers can use the 10% class instead.

### Evidence

- `test/engine/propertyTax.test.ts`: owner-occupier 2025 rates and rebate; non-owner-occupier 2024 rates; 10% rule; reconciliation findings; UI catalogues.
- `test/engine/independent-verification.test.ts`: `Property tax - IRAS sample calculations (owner-occupier from 1 Jan 2025)`, `Property tax - non-owner-occupier residential and non-residential`, and `Property tax - owner-occupier rebates (IRAS property tax reliefs page)`.
- `test/verify/ptax/independent-verifier.test.ts`: hand recomputation of seeded SG annual property tax rows and the owner-occupied flag check.
- `test/verify/calculators/calculator-verifier.test.ts`: `sg-property-tax` calculator default, input validation and rule-id filtering.
- `test/docs/sg-property-tax.test.ts`: this document's examples and tables are recomputed from the engine and domain selectors.

### Confidence

A for owner-occupier residential rates because the code reproduces IRAS sample calculations. B for non-owner-occupier, 10% class, seeded workspace rows, notices and rebates because independent verifier tests re-derive the method and rates from primary-source statements, but not every path has an official worked example in the documentation.

### Assumptions and limitations

The app does not estimate annual value, determine whether a property is truly owner-occupied, or decide whether a residential-like class is excluded from non-owner-occupier residential rates. Part-year and owner-share apportionment is an implementation assumption for internal reconciliation; IRAS says seller/buyer apportionment is a private arrangement. The annual taxes workspace always passes `PRIVATE` for owner-occupied residential rows, so HDB rebate categories are engine/calculator capability rather than seeded SG fund data.

## Sources

| Source | Code cites it | Read for this document |
| --- | --- | --- |
| IRAS, Property Tax Rates and Sample Calculations, https://www.iras.gov.sg/taxes/property-tax/property-owners/property-tax-rates | Yes | 19 Oct 2026 |
| IRAS, Property Tax Reliefs, https://www.iras.gov.sg/taxes/property-tax/property-owners/property-tax-reliefs | Yes | 19 Oct 2026 |
| IRAS, About Annual Value, https://www.iras.gov.sg/taxes/property-tax/property-owners/annual-value | Yes | 19 Oct 2026 |
| IRAS, Responsibility for Payment, https://www.iras.gov.sg/taxes/property-tax/property-owners/payments | Yes | 19 Oct 2026 |
| IRAS, How to Object to your Assessment, https://www.iras.gov.sg/taxes/property-tax/property-owners/object-to-annual-value | Yes | 19 Oct 2026 |
