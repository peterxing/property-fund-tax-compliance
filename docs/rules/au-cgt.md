# AU CGT

This document covers the Australian CGT figures in the **CGT on property disposal** and **Foreign resident CGT withholding** calculators. It documents `src/engine/au/cgt.ts` and the calculator wiring in `src/app/workspaces/calculators/model.ts`. It does not document AMIT member cost-base increases or reductions; those belong in [AU AMIT distributions](au-amit-distributions.md).

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| Cost base, reduced cost base, capital gain or loss | CGT on property disposal calculator | ITAA 1997 Div 102 and Div 110; CGT event A1 guidance | `computeCgt` | B — independently verified against ATO CGT guide methods |
| Discount, losses and indexation | CGT on property disposal calculator | ITAA 1997 Div 115; ATO CGT guide | `computeCgt` | B — independent verifier covers discount/default/indexation paths |
| Foreign resident CGT withholding | Foreign resident CGT withholding calculator | Subdiv 14-D Sch 1 TAA 1953; ATO FRCGW guidance | `computeForeignResidentCgtWithholding` | B — independently verified at statutory boundaries |

## CGT on property disposal

### What it computes

The engine models one CGT event A1 style disposal of property or units. It calculates cost base, reduced cost base, ordinary gain, capital loss, optional indexation, current-year and prior-year capital loss application, discount amount, net capital gain, and trust discount components. The calculator exposes a simpler subset: entity type, acquisition date, disposal contract date, capital proceeds, acquisition price, incidental acquisition costs, capital works deductions claimed and current-year losses.

### Legal basis

Core cost-base, discount and indexation methods are [rule `au-cgt.cost-base-and-discount`](RULE-REGISTER.md#rule-au-au-cgt-cost-base-and-discount). Loss ordering and foreign-resident discount apportionment are [rule `au-cgt.loss-order-and-foreign-residents`](RULE-REGISTER.md#rule-au-au-cgt-loss-order-and-foreign-residents). Division 43 deductions reducing cost base are also noted in [rule `au-div43.cost-base.2000-plus`](RULE-REGISTER.md#rule-au-au-div43-cost-base-2000-plus).

### Inputs

| App field or source | Engine field | Units and defaults |
| --- | --- | --- |
| Entity type | `entityType` | Individual, trust, company or complying super fund. |
| Acquisition date | `acquisitionDate` | ISO date; used for 12-month rule and CPI quarter. |
| Disposal contract date | `disposalContractDate` | ISO date; CGT timing uses contract date, not settlement. |
| Capital proceeds | `capitalProceeds` | Integer cents; non-negative. |
| Acquisition price | `acquisitionPrice` | Integer cents; non-negative. |
| Incidental costs | `incidentalAcquisitionCosts`, `incidentalDisposalCosts` | Calculator maps its single `Incidental costs` field to acquisition costs only. |
| Non-capital owning costs | `nonCapitalOwningCosts` | Engine field; included in cost base but excluded from reduced cost base and indexation. Calculator does not expose it. |
| Capital improvements | `capitalImprovements` | Engine field; included in cost base, reduced cost base and indexation. Calculator does not expose it. |
| Title preservation costs | `titlePreservationCosts` | Engine field; included in cost base, reduced cost base and indexation. Calculator does not expose it. |
| Capital works deductions claimed | `capitalWorksDeductionsClaimed` | Cents; reduces both cost base and reduced cost base. |
| Other deducted reductions | `otherDeductedAmountsReducingCostBase` | Cents; reduces both bases. |
| Current-year capital losses | `currentYearCapitalLosses` | Cents; applied before prior losses and discount. |
| Prior-year losses by year | `priorYearCapitalLossesByYear` | Engine field; sorted by year then summed. Calculator does not expose it. |
| Choose indexation | `chooseIndexation` | Engine field for non-company pre-21 September 1999 assets. Calculator does not expose it. |
| Residency periods | `residencyPeriods` | Engine field for individual discount apportionment after 8 May 2012. Calculator does not expose it. |

### Method

1. Validate non-negative proceeds and acquisition price, and that the disposal contract date is not before acquisition date.
2. Cost base is acquisition price plus incidental acquisition costs, incidental disposal costs, non-capital owning costs, capital improvements and title-preservation costs, less Division 43 deductions claimed and other deducted reductions. The result is floored at zero.
3. Reduced cost base is the same but excludes non-capital owning costs. It is also floored at zero.
4. Ordinary capital gain is `max(0, capital proceeds - cost base)`. Capital loss is `max(0, reduced cost base - capital proceeds)`.
5. The 12-month rule is coded as `disposalContractDate > addYears(acquisitionDate, 1)`. Exactly 12 months is not enough.
6. Discount eligibility requires an ordinary gain, a non-zero base discount for the entity, and the 12-month rule. Individual and trust base discount is 50%; complying super fund base discount is 33.33% in the table but the code calculates the amount as exactly one third of the gain after losses; companies have no discount.
7. Indexation is available only for gains on assets acquired before 1999-09-21 and satisfying the 12-month rule. CPI is loaded to 1999-Q3 only. The factor is `round to 3 decimals(68.7 / acquisition-quarter CPI)` and each indexed cost item is rounded to cents. Capital works and other deducted reductions are subtracted after indexation.
8. If a company has an indexed base, the method is `INDEXATION`. If a non-company sets `chooseIndexation` and has an indexed base, the method is `INDEXATION`. Otherwise an eligible discounted asset uses `DISCOUNT`; if neither applies the method is `OTHER`.
9. Current-year capital losses are applied first. Prior-year losses are then applied against the remaining gross gain. Discount is applied only after those losses.
10. For individuals with `residencyPeriods` and a disposal after 2012-05-08, the discount percentage is apportioned by Australian-resident days from the later of 2012-05-09 and acquisition date through the disposal contract date inclusive. The code floors basis points. If no residency periods are supplied, it returns the full base discount.
11. For trusts using the discount method, `grossDiscountableGain` is the gain after losses and `trustDiscountComponent` is the discount amount. Downstream AMIT cost-base and member attribution handling is outside this document.

### CGT cost base elements

| Element | Included in cost base | Included in reduced cost base | Included in indexed cost base |
| --- | --- | --- | --- |
| Acquisition price | Yes | Yes | Yes |
| Incidental acquisition costs | Yes | Yes | Yes |
| Incidental disposal costs | Yes | Yes | Yes |
| Non-capital owning costs | Yes | No | No |
| Capital improvements | Yes | Yes | Yes |
| Title preservation costs | Yes | Yes | Yes |
| Capital works deductions claimed | Subtracted | Subtracted | Subtracted after indexation |
| Other deducted cost-base reductions | Subtracted | Subtracted | Subtracted after indexation |

### CGT discount and indexation constants

| Entity type | Discount if eligible | Indexation behaviour in code | Rule |
| --- | ---: | --- | --- |
| Individual | 50% before any residency apportionment | Available for pre-1999-09-21 assets if `chooseIndexation` is true; otherwise discount method defaults | `au-cgt.cost-base-and-discount` |
| Trust | 50% | Available for pre-1999-09-21 assets if `chooseIndexation` is true; otherwise discount method defaults | `au-cgt.cost-base-and-discount` |
| Company | 0% | Must use indexation when an indexed base is available | `au-cgt.cost-base-and-discount` |
| Complying super fund | 33.33% displayed; discount amount is exactly one third of gain after losses | Available for pre-1999-09-21 assets if `chooseIndexation` is true; otherwise discount method defaults | `au-cgt.cost-base-and-discount` |

### Worked examples

#### Example CGT-1: Calculator default trust disposal

The CGT calculator defaults to a trust that acquired on 2019-06-30 and disposes on 2026-08-15. Inputs are capital proceeds A$15,000,000.00, acquisition price A$10,000,000.00, incidental acquisition costs A$350,000.00, Division 43 deductions claimed A$500,000.00 and current-year capital losses A$250,000.00.

Cost base is `A$10,000,000.00 + A$350,000.00 - A$500,000.00 = A$9,850,000.00`. Gross capital gain is A$5,150,000.00. Losses applied are A$250,000.00, leaving A$4,900,000.00. The trust discount is 50%, so discount amount is A$2,450,000.00 and net capital gain is A$2,450,000.00. The trust discount component is A$2,450,000.00.

#### Example CGT-2: Individual more-than-12-month discount after cost-base reduction

An individual disposes of a property on 2025-01-02 after acquiring it on 2024-01-01. Proceeds are A$10,000.00. Acquisition price is A$7,000.00, incidental acquisition costs are A$100.00, incidental disposal costs are A$50.00, and Division 43 deductions claimed are A$20.00. Cost base is A$7,130.00. Gross capital gain is A$2,870.00. The disposal contract date is more than one year after acquisition, so the 50% discount is A$1,435.00 and the net capital gain is A$1,435.00.

#### Example CGT-3: Company pre-1999 indexation

A company acquired an asset on 1998-01-15 for A$1,000.00 and disposes on 2026-07-02 for A$1,500.00. The code uses 1998-Q1 CPI 67.0 and 1999-Q3 CPI 68.7, giving an indexation factor rounded to three decimals of 1.025. Indexed cost base is A$1,025.00. Companies use indexation when it is available, so gross and net capital gain are A$475.00.

#### Example CGT-4: Individual residency apportionment

An individual acquired an asset on 2010-01-01 and disposes on 2020-01-02 for A$1,000.00 with nil cost. Residency periods supplied to the engine are Australian resident from 2012-05-09 to 2016-05-08 and foreign resident from 2016-05-09 to disposal. The code tests days from 2012-05-09 to 2020-01-02 inclusive, floors the apportioned 50% discount to 2,613 basis points, and calculates discount A$261.30. Net capital gain is A$738.70.

### Edge cases

If proceeds are below reduced cost base the engine reports a capital loss and no gain method. Exactly 12 months does not satisfy the discount rule. If a pre-1999 asset has no loaded CPI quarter, indexation throws. Prior losses are consumed in year order but the calculation is still a single-asset offset against the supplied balance. The calculator does not expose residency periods, prior-year losses, disposal incidental costs, improvements, owning costs or indexation election.

### Evidence

`test/engine/au/cgt.test.ts` covers discount, exactly-12-month denial, indexation election, company indexation and FRCGW. `test/engine/au/independent-allowances-cgt.test.ts` independently verifies default discount vs indexation and company indexation against the ATO CGT guide. `test/verify/calculators/calculator-verifier.test.ts` checks `au-cgt` calculator field mapping and displayed default example. `test/docs/au-cgt.test.ts` recomputes each worked example and quoted table.

### Confidence

Grade B. The method and rates are from primary sources and independently verified, but this document does not reproduce a named ATO CGT dollar example end to end. It does reproduce the ATO guide's method choices for default discount and company indexation.

### Assumptions and limitations

This is not a full CGT event catalogue and does not model rollovers, main residence concessions, separate collectable or personal-use asset rules, market-value substitution, related-party apportionment, foreign-resident taxable Australian property exclusions, or AMIT cost-base net amount. Those must be reviewed outside this calculator.

## Foreign resident CGT withholding

### What it computes

The FRCGW calculator determines whether purchaser withholding applies to a direct real property, indirect real property interest, or option/right transaction. It returns the applicable threshold, rate, amount to withhold, settlement due date and explanatory findings.

### Legal basis

FRCGW is [rule `au-frcgw.2016-plus`](RULE-REGISTER.md#rule-au-au-frcgw-2016-plus), based on Subdivision 14-D of Schedule 1 to the Taxation Administration Act 1953 and ATO guidance.

### Inputs

| App field | Engine field | Units and defaults |
| --- | --- | --- |
| Contract date | `contractDate` | Selects the rate and threshold. |
| Settlement date | `settlementDate` | Returned as the due date. |
| Asset value | `assetValue` | Integer cents; compared to the threshold. |
| Scenario | `scenario` | Direct real property, indirect real property interest, or option/right. |
| Clearance certificate / valid declaration held | `hasClearanceCertificate` for direct real property; `validVendorDeclaration` for other scenarios | Direct property requires a clearance certificate; non-direct scenarios use vendor declarations. |
| Variation rate (%) | `variationRateBps` | Calculator default is 15%; engine uses it only if withholding applies. |
| Other exclusions | `listedOnApprovedStockExchange`, `anotherWithholdingApplies`, `securitiesLendingArrangement`, `externalAdministrationOrBankruptcy` | Engine fields; calculator does not expose them. |

### Method

1. Select the FRCGW row whose contract-date range includes the contract date. A contract before 2016-07-01 throws because no rule is loaded.
2. `outOfScope` is true if any listed-market, other-withholding, securities-lending or external-administration flag is true.
3. A direct real property clearance certificate switches off withholding. For indirect interests and options/rights, only a valid vendor declaration switches it off.
4. The threshold test is `assetValue >= threshold`. From 2025-01-01 the threshold is zero, so every non-excluded asset value passes, including zero.
5. Withholding applies when the transaction is in scope, no certificate/declaration exclusion is satisfied, and the threshold is passed.
6. If withholding applies, rate is the variation rate if supplied, otherwise the statutory rate. Amount is `assetValue × rate bps / 10,000`, rounded to cents. If it does not apply, rate and amount are zero.
7. Due date is the settlement date. The payment timing text says the purchaser pays at or before settlement after lodging the purchaser payment notification.

### FRCGW rates and thresholds

| Contract date range | Threshold | Statutory rate | Rule |
| --- | ---: | ---: | --- |
| 2016-07-01 to 2017-06-30 | A$2,000,000.00 | 10% | `au-frcgw.2016-plus` |
| 2017-07-01 to 2024-12-31 | A$750,000.00 | 12.5% | `au-frcgw.2016-plus` |
| From 2025-01-01 | A$0.00 | 15% | `au-frcgw.2016-plus` |

### Worked examples

#### Example FRCGW-1: Contract-date boundary at 1 January 2025

A direct real property transaction has asset value A$1,200,000.00 and no clearance certificate. With a contract date 2024-12-31, the code applies the old A$750,000.00 threshold and 12.5% rate, so amount to withhold is A$150,000.00 and due date is 2025-01-31. With contract date 2025-01-01 for the same value, the threshold is A$0.00 and the rate is 15%, so amount to withhold is A$180,000.00 and due date remains 2025-01-31.

#### Example FRCGW-2: Clearance certificate for direct real property

A direct real property transaction has contract date 2025-01-01, settlement date 2025-02-01 and asset value A$1,000,000.00. Because a clearance certificate is supplied, withholding does not apply. The calculator shows threshold A$0.00, rate 0%, amount to withhold A$0.00 and due date 2025-02-01.

### Edge cases

A variation rate greater than or equal to the statutory rate produces a warning but is still applied if withholding applies. A clearance certificate does not switch off withholding for an option or right; a valid vendor declaration is needed for non-direct scenarios. The engine does not split withholding between multiple vendors or lodge ATO forms.

### Evidence

`test/engine/au/cgt.test.ts` covers FRCGW rate boundaries and clearance-certificate behaviour. `test/engine/au/independent-allowances-cgt.test.ts` independently verifies the 12.5% / 15% boundary and that a clearance certificate does not switch off options or rights. `test/verify/calculators/calculator-verifier.test.ts` checks `au-frcgw` calculator field mapping and display. `test/docs/au-cgt.test.ts` recomputes the examples and the rate table.

### Confidence

Grade B. Rates and thresholds are from ATO and statute sources and independently verified at the contract-date boundary, but this document does not reproduce an official ATO numeric withholding example.

### Assumptions and limitations

The engine gives the purchaser's withholding obligation only. It does not determine vendor residency facts, produce clearance certificates, lodge purchaser payment notifications, allocate credits between vendors or model every exclusion in Subdivision 14-D.

## Sources

| Source | Code cites it? | Read date |
| --- | --- | --- |
| ATO, Cost base of an asset | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO, CGT when selling your rental property | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO legal database, ITAA 1997 ss 110-45 and 115-25 | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO CGT guide 2021, discount method, indexation method and CPI Appendix 2 | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO CGT guide 2021, current-year and prior-year capital loss steps | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO, foreign residents, temporary residents and changing residency | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| ATO, foreign resident capital gains withholding overview, paying withholding, clearance certificates, vendor declarations and variations | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
| Federal Register of Legislation, Income Tax Assessment Act 1997 and Taxation Administration Act 1953 | Yes | 10 Oct 2026 in code; reviewed for this document on 19 Oct 2026 |
