# Singapore stamp duty

The app calculates Singapore BSD, ABSD, SSD and stamping deadlines in the Property taxes workspace on the **Duties on acquisition** tab for SG funds, and BSD/ABSD, SSD and lease duty in the **Stamp duty** calculator (`sg-stamp-duty`). It computes the figures the engine supports; it does not adjudicate remissions or legal characterisation beyond the explicit inputs.

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| Buyer's Stamp Duty (BSD) | Duties on acquisition; Stamp duty calculator mode BSD + ABSD | IRAS Buyer's Stamp Duty page | `computeBsd`, `computeAcquisitionDuties` | A |
| Additional Buyer's Stamp Duty (ABSD) | Duties on acquisition where buyer kind is selected; calculator mode BSD + ABSD | IRAS Additional Buyer's Stamp Duty page and ABSD (Trust) remission page | `computeAbsd`, `computeAcquisitionDuties` | B |
| Seller's Stamp Duty (SSD) | Duties rows where disposal date and price exist; calculator mode SSD | IRAS residential and industrial SSD pages | `computeSsd` | A for current residential example, B otherwise |
| Lease duty | Stamp duty calculator mode Lease duty | IRAS Renting a Property page | `computeLeaseDuty` | B |
| Stamping deadline | Duties on acquisition deadline column and future/missed obligations | IRAS When to Pay Stamp Duty | `stampDutyDeadline` | B |

## Buyer's Stamp Duty (BSD)

### What it computes

BSD is computed on the higher of consideration and market value. Residential, non-residential and mixed commercial/residential property are supported. Mixed property can use explicit residential and non-residential values; if direct engine callers omit them, a residential share basis-point proxy is used and the engine emits a review finding.

### Legal basis

The rule entries cite IRAS Buyer's Stamp Duty. See [BSD 2018-2023](RULE-REGISTER.md#rule-sg-stamp-duty-bsd-2018-2023) and [BSD from 15 Feb 2023](RULE-REGISTER.md#rule-sg-stamp-duty-bsd-2023-02-15).

### Inputs

| App field or source | Engine input | Unit and mapping |
| --- | --- | --- |
| Purchase / lease date | `purchaseDate` | Selects the BSD rate regime. |
| Price or value / profile purchase price | `purchasePrice` and `marketValue` | Workspace passes purchase price as both. Direct callers can pass different market value. |
| Property kind | `propertyKind` | `RESIDENTIAL`, `NON_RESIDENTIAL`, or `MIXED_COMMERCIAL_RESIDENTIAL` in the engine. The calculator exposes residential and non-residential. |
| Residential share or apportioned values | `residentialShareBps`, `apportionedResidentialValue`, `apportionedNonResidentialValue` | Used only for mixed property. |

### Method

1. Dutiable value is the higher of purchase price and market value.
2. Select the rate regime by purchase date. Date ranges are inclusive.
3. Split mixed-use value into residential and non-residential components.
4. Compute progressive duty for each component with `mulBps`, rounded to cents within each band.
5. Round each progressive component down to the nearest dollar, sum components, then round the total down to the nearest dollar again.
6. If dutiable value is positive and total duty is below S$1.00, set duty to S$1.00.

### BSD rates and thresholds

| Effective dates | Rule version | Residential bands as coded | Non-residential bands as coded |
| --- | --- | --- | --- |
| Before 20 Feb 2018 | bsd.pre-2018-02-20 | First S$180,000 @ 1%; Next S$180,000 @ 2%; Remainder @ 3% | First S$180,000 @ 1%; Next S$180,000 @ 2%; Remainder @ 3% |
| 20 Feb 2018 to 14 Feb 2023 | bsd.2018-02-20 | First S$180,000 @ 1%; Next S$180,000 @ 2%; Next S$640,000 @ 3%; Remainder @ 4% | First S$180,000 @ 1%; Next S$180,000 @ 2%; Next S$640,000 @ 3%; Remainder @ 3% |
| On or after 15 Feb 2023 | bsd.2023-02-15 | First S$180,000 @ 1%; Next S$180,000 @ 2%; Next S$640,000 @ 3%; Next S$500,000 @ 4%; Next S$1,500,000 @ 5%; Remainder @ 6% | First S$180,000 @ 1%; Next S$180,000 @ 2%; Next S$640,000 @ 3%; Next S$500,000 @ 4%; Next S$1,500,000 @ 5%; Remainder @ 5% |

### Worked examples

#### Example BSD-1: IRAS terrace-house BSD example

Source: IRAS Buyer's Stamp Duty example 1, read 19 October 2026.

| Input | Value |
| --- | --- |
| Purchase date | 2023-02-17 |
| Property kind | Residential |
| Price and market value | S$4,500,100.00 |

Arithmetic: S$180,000 at 1% = S$1,800.00; next S$180,000 at 2% = S$3,600.00; next S$640,000 at 3% = S$19,200.00; next S$500,000 at 4% = S$20,000.00; next S$1,500,000 at 5% = S$75,000.00; remaining S$1,500,100.00 at 6% = S$90,006.00. BSD payable is S$209,606.00.

#### Example BSD-2: IRAS mixed commercial/residential land example

Source: IRAS Buyer's Stamp Duty example 2, read 19 October 2026.

| Input | Value |
| --- | --- |
| Purchase date | 2023-03-01 |
| Property kind | Mixed commercial/residential |
| Total value | S$22,000,000.00 |
| Residential apportioned value | S$9,000,000.00 |
| Non-residential apportioned value | S$13,000,000.00 |

The residential component BSD is S$479,600.00. The non-residential component BSD is S$619,600.00. Total BSD payable is S$1,099,200.00.

### Edge cases

Zero value gives zero BSD. Positive dutiable value with duty below S$1.00 is raised to S$1.00. A mixed-use explicit split must add to total dutiable value or the engine throws. BSD remissions for residential land used for non-residential development are not modelled.

## Additional Buyer's Stamp Duty (ABSD)

### What it computes

ABSD is computed on residential acquisitions only when the workspace profile or calculator supplies an ABSD buyer kind. The workspace stores the result in the **Surcharge / ABSD** column as the net ABSD. The engine uses the highest rate among joint buyers and supports Singapore citizen / PR property counts, foreigners, entities, housing developers, trustees, trust refunds for identifiable individual beneficiaries, and a narrow additional-interest remission.

### Legal basis

The rule entries cite IRAS Additional Buyer's Stamp Duty and Remission of ABSD (Trust). See [ABSD rates](RULE-REGISTER.md#rule-sg-stamp-duty-absd-2023-04-27) and [ABSD trust refund](RULE-REGISTER.md#rule-sg-stamp-duty-absd-trust-refund).

### Inputs

| App field or source | Engine input | Unit and mapping |
| --- | --- | --- |
| ABSD buyer kind | `buyers[].kind` | Calculator offers SC, SPR, Foreigner and Entity / S-REIT trustee. Workspace profiles also support trustee and housing-developer kinds. |
| Residential property count before purchase | `residentialPropertyCountBeforePurchase` | Used only for SC and SPR profiles. |
| Claim additional interest remission | `claimAdditionalInterestRemission` and `alreadyHasInterestInSameProperty` | Direct engine capability; not exposed in the simple workspace row. |
| Trust beneficial owners | `trustBeneficialOwners` | Direct engine capability for ABSD (Trust) refund. |

### Method

1. Dutiable value is the higher of purchase price and market value.
2. Select the ABSD rate row by purchase date. Trustee ABSD is not modelled before 9 May 2022 even though the row beginning 16 December 2021 contains a trustee rate.
3. SC and SPR keys are determined by residential property count before purchase plus property index in the transaction.
4. Joint buyers use the highest applicable rate.
5. Duty is `floorToDollar(mulBps(dutiableValue, upfrontRateBps))`, with a S$1.00 minimum only when the rate is above 0%.
6. Housing developers are split into remittable and non-remittable components. From 16 December 2021 onward the coded split is 35% remittable and 5% non-remittable.
7. ABSD (Trust) refund is computed only when beneficial owners are identifiable individuals in the input. The effective rate becomes the highest direct-purchase rate for those beneficiaries and the difference is refundable.

### ABSD rates by effective date

| Effective dates | SC first / second / third+ | SPR first / second / third+ | Foreigner | Entity, including S-REIT trustee | Housing developer gross | Trustee |
| --- | --- | --- | --- | --- | --- | --- |
| 12 Jan 2013 to 5 Jul 2018 | 0% / 7% / 10% | 5% / 10% / 10% | 15% | 15% | 15% | Not modelled |
| 6 Jul 2018 to 15 Dec 2021 | 0% / 12% / 15% | 5% / 15% / 15% | 20% | 25% | 30% | Not modelled |
| 16 Dec 2021 to 26 Apr 2023 | 0% / 17% / 25% | 5% / 25% / 30% | 30% | 35% | 40% | 35% from 9 May 2022 |
| 27 Apr 2023 onward | 0% / 20% / 30% | 5% / 30% / 35% | 60% | 65% | 40% | 65% |

### Worked examples

#### Example ABSD-1: Entity / S-REIT trustee residential acquisition

| Input | Value |
| --- | --- |
| Purchase date | 2026-10-09 |
| Property kind | Residential |
| Price and market value | S$2,000,000.00 |
| Buyer kind | Entity, including a trustee of a collective investment scheme / S-REIT trustee |

BSD on S$2,000,000.00 is S$69,600.00. ABSD is 65% x S$2,000,000.00 = S$1,300,000.00. Total net duty is S$1,369,600.00.

#### Example ABSD-2: ABSD (Trust) refund mechanics

| Input | Value |
| --- | --- |
| Purchase date | 2026-10-09 |
| Price and market value | S$2,000,000.00 |
| Buyer kind | Trustee |
| Beneficial owner input | Singapore citizen with no residential property before purchase |

The engine charges upfront ABSD (Trust) at 65%, or S$1,300,000.00. Because the supplied beneficiary is an identifiable individual with a 0% direct-purchase rate, the effective ABSD is S$0.00 and refundable duty is S$1,300,000.00. This is only a mechanical calculation; the app does not verify every statutory refund condition.

### Edge cases

ABSD is omitted from workspace duty rows unless a buyer kind is selected. A Singapore citizen first-property profile has a zero ABSD rate and no S$1 minimum. Entity includes a trustee of a collective investment scheme / S-REIT trustee as modelled. Trustee refund and additional-interest remission are only computed when the required mechanical facts are provided; other remissions and declarations are not modelled.

## Seller's Stamp Duty (SSD)

### What it computes

SSD is computed on the higher of selling price and market value at disposal. The workspace computes SSD when disposal date and disposal price exist and the SG stamp property kind is residential or non-residential; non-residential is mapped to the engine's industrial SSD model. The calculator exposes SSD mode directly.

### Legal basis

The rule entries cite IRAS residential SSD and industrial SSD pages. See [residential SSD from 4 Jul 2025](RULE-REGISTER.md#rule-sg-stamp-duty-ssd-residential-2025-07-04) and [industrial SSD](RULE-REGISTER.md#rule-sg-stamp-duty-ssd-industrial-2013-01-12).

### Method

1. Base value is the higher of selling price and market value.
2. Residential and industrial apportionment can be supplied by amount or basis points; otherwise the whole base is used.
3. Residential SSD regime is selected by acquisition date, not disposal date.
4. Holding-period bands compare disposal date with exact acquisition anniversaries. An exact anniversary falls into the later band.
5. Duty is `floorToDollar(mulBps(dutiableValue, rateBps))`, or the progressive pre-2011 scales for those acquisition regimes.

### SSD rates by acquisition date

| Property | Acquisition date | Holding-period rates as coded |
| --- | --- | --- |
| Residential | 20 Feb 2010 to 29 Aug 2010 | Up to 1 year: BSD-style 1% / 2% / 3% scale; more than 1 year: 0% |
| Residential | 30 Aug 2010 to 13 Jan 2011 | Up to 1 year: BSD-style scale; >1 to 2 years: 0.67% / 1.33% / 2%; >2 to 3 years: 0.33% / 0.67% / 1%; more than 3 years: 0% |
| Residential | 14 Jan 2011 to 10 Mar 2017 | Up to 1 year 16%; >1 to 2 years 12%; >2 to 3 years 8%; >3 to 4 years 4%; more than 4 years 0% |
| Residential | 11 Mar 2017 to 3 Jul 2025 | Up to 1 year 12%; >1 to 2 years 8%; >2 to 3 years 4%; more than 3 years 0% |
| Residential | 4 Jul 2025 onward | Up to 1 year 16%; >1 to 2 years 12%; >2 to 3 years 8%; >3 to 4 years 4%; more than 4 years 0% |
| Industrial | 12 Jan 2013 onward | Up to 1 year 15%; >1 to 2 years 10%; >2 to 3 years 5%; more than 3 years 0% |

### Worked examples

#### Example SSD-1: IRAS current residential SSD example

Source: IRAS Seller's Stamp Duty for Residential Property example 3, read 19 October 2026.

| Input | Value |
| --- | --- |
| Acquisition date | 2025-07-07 |
| Disposal date | 2026-05-09 |
| Selling price and market value | S$1,800,000.00 |
| Property kind | Residential |

The holding period band is Up to 1 year. SSD is 16% x S$1,800,000.00 = S$288,000.00.

#### Example SSD-2: Industrial SSD within one year

| Input | Value |
| --- | --- |
| Acquisition date | 2025-01-01 |
| Disposal date | 2025-10-09 |
| Selling price and market value | S$2,000,000.00 |
| Property kind | Industrial |

The holding period band is Up to 1 year. Industrial SSD is 15% x S$2,000,000.00 = S$300,000.00.

### Edge cases

Acquisition dates before the first modelled residential or industrial regime throw `RuleNotFoundError`. Exact anniversaries move to the next band. Exemptions and remissions are not modelled.

## Lease duty

### What it computes

The calculator computes lease duty on rent steps and any premium. The workspace duties tab does not create lease rows for seeded properties.

### Legal basis

The rule entry cites IRAS Renting a Property. See [lease duty](RULE-REGISTER.md#rule-sg-stamp-duty-lease-current).

### Method

1. Each rent step must have `from <= to`. Monthly rent counts calendar months from the step start date by adding one month at a time until the day after the end date, so a lease beginning on the 29th to 31st does not drift; a part month still counts as a month. Annual rent uses the lease term rule below; one-off rent is used as entered.
2. Lease years are whole calendar months counted from the start date divided by 12, plus any remaining days divided by 365. If no lease end date is supplied, the engine treats it as longer than four years.
3. Average annual rent is the higher of contractual AAR and market annual rent if provided.
4. If AAR is not more than S$1,000.00, rent duty is zero.
5. If lease years are four or less, rent duty is 0.4% of total rent. If longer or indefinite, rent duty is 0.4% of four times AAR.
6. Premium duty, if any, is BSD on the premium as non-residential property.
7. Duty is rounded down to the nearest dollar and raised to S$1.00 if positive but below S$1.00.

### Lease duty rates and thresholds

| Setting | Coded value |
| --- | --- |
| Average annual rent threshold | No rent duty if AAR is S$1,000.00 or less |
| Lease term up to 4 years | 0.4% of total rent |
| Lease term over 4 years or indefinite | 0.4% of 4 x average annual rent |
| Premium | BSD on premium as non-residential property |

### Worked examples

#### Example LEASE-1: Calculator two-year monthly-rent lease

| Input | Value |
| --- | --- |
| Lease date and start date | 2026-10-09 |
| Lease end date | 2028-10-08 |
| Monthly rent | S$100,000.00 |

The engine counts 24 monthly rent periods, counted from the lease start date so a month-end start date does not drift. Total rent is S$2,400,000.00. The lease term is 24 whole calendar months from the start date / 12 = 2 years exactly, so there is no leap-day distortion. Average annual rent is S$1,200,000.00. Because the lease term is not more than four years, rent duty is 0.4% x S$2,400,000.00 = S$9,600.00. There is no premium, so total lease duty is S$9,600.00.

#### Example LEASE-2: Six-year monthly-rent lease (term over four years)

| Input | Value |
| --- | --- |
| Lease date and start date | 2026-10-09 |
| Lease end date | 2032-10-08 |
| Monthly rent | S$100,000.00 |

The engine counts 72 monthly rent periods, a lease term of 72 / 12 = 6 whole calendar years. Total rent is S$7,200,000.00. Average annual rent is S$1,200,000.00 (total rent / 6 years). Because the lease term is more than four years, rent duty is 0.4% x (4 x S$1,200,000.00) = 0.4% x S$4,800,000.00 = S$19,200.00. There is no premium, so total lease duty is S$19,200.00.

### Edge cases

No rent steps throws. An inverted rent step throws. The engine does not model lease variation rules, unstamped-document penalties, adjudication, or non-property instruments.

## Stamping deadlines

For executed-in-Singapore documents, `stampDutyDeadline` returns execution date plus 14 days. For overseas-executed documents, it requires the first received in Singapore date and returns that date plus 30 days. The workspace passes `sgExecutedInSingapore` from the profile; seeded SG properties are executed in Singapore.

## Evidence

- `test/engine/stampDuty.test.ts`: current ABSD profile rates, Singapore citizen first property, SSD regime change, lease duty and deadlines. Official BSD worked examples are pinned in `test/engine/independent-verification.test.ts` and `test/docs/sg-stamp-duty.test.ts`.
- `test/engine/independent-verification.test.ts`: `BSD - IRAS worked examples`, `ABSD - rates on or after 27 Apr 2023`, `SSD - holding-period bands depend on the ACQUISITION date regime`.
- `test/domain/ptax/ptax.test.ts`: duties view computes Singapore BSD deadlines, ABSD entity case and total inclusion rules.
- `test/verify/ptax/independent-verifier.test.ts`: hand recomputation of seeded SG BSD rows, current BSD/ABSD entity/trustee and Singapore execution deadline.
- `test/verify/calculators/calculator-verifier.test.ts`: `sg-stamp-duty` calculator default, validation and rule-id filtering.
- `test/docs/sg-stamp-duty.test.ts`: this document's examples and tables are recomputed from the engine and domain selectors.

## Confidence

BSD is A because the code reproduces IRAS official worked examples for a residential purchase and a mixed commercial/residential purchase. Current residential SSD is A because the document reproduces IRAS example 3. ABSD, industrial SSD, lease duty and deadlines are B because independent verifier tests re-derive rates and mappings from primary-source statements, but the documentation does not reproduce an official worked example for every profile and remission path.

## Assumptions and limitations

The workspace uses purchase price as market value. ABSD applies only if a residential property and buyer kind are selected. The app does not determine eligibility for remissions, exemptions, declarations, developer conditions, late stamping penalties, or whether a lease variation is chargeable. For mixed-use BSD, valuer-apportioned component values should be supplied; the basis-point split is only a proxy.

## Sources

| Source | Code cites it | Read for this document |
| --- | --- | --- |
| IRAS, Buyer's Stamp Duty (BSD), https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/buyer's-stamp-duty-(bsd) | Yes | 19 Oct 2026 |
| IRAS, Additional Buyer's Stamp Duty (ABSD), https://www.iras.gov.sg/taxes/stamp-duty/for-property/buying-or-acquiring-property/additional-buyer's-stamp-duty-(absd) | Yes | 19 Oct 2026 |
| IRAS, Remission of ABSD (Trust), https://www.iras.gov.sg/taxes/stamp-duty/for-property/appeals-refunds-reliefs-and-remissions/common-stamp-duty-remissions-and-reliefs-for-property/remission-of-absd-(trust) | Yes | 19 Oct 2026 |
| IRAS, Seller's Stamp Duty (SSD) for Residential Property, https://www.iras.gov.sg/taxes/stamp-duty/for-property/selling-or-disposing-property/seller's-stamp-duty-(ssd)-for-residential-property | Yes | 19 Oct 2026 |
| IRAS, Seller's Stamp Duty (SSD) for Industrial Property, https://www.iras.gov.sg/taxes/stamp-duty/for-property/selling-or-disposing-property/seller's-stamp-duty-(ssd)-for-industrial-property | Yes | 19 Oct 2026 |
| IRAS, Renting a Property, https://www.iras.gov.sg/taxes/stamp-duty/for-property/renting-a-property | Yes | 19 Oct 2026 |
| IRAS, When to Pay Stamp Duty, https://www.iras.gov.sg/taxes/stamp-duty/for-property/paying-stamp-duty/when-to-pay-stamp-duty | Yes | 19 Oct 2026 |
