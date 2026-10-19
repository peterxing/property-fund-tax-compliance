# Australian transfer duty, landholder duty and foreign purchaser surcharges

This document covers the duty figures the app shows for Australian funds. They appear in **Property taxes → Duties on acquisition** and in the **Transfer duty and landholder duty** calculator (`au-transfer-duty`). Annual land tax is deliberately excluded; see [Australian land tax](./au-land-tax.md).

The code is the source of truth. Money is stored as integer cents. Transfer-duty schedules are selected by contract date. Where a State is outside the modelled dates or landholder duty is not implemented, the app shows **Not modelled** and excludes the row from totals.

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| AU transfer / stamp / conveyance duty | Property taxes → Duties on acquisition; calculator mode **Transfer duty** | State and Territory Duties Acts and revenue-office rate pages | `src/engine/au/transferDuty.ts`, `src/engine/au/transferDutyTerritories.ts`, `src/domain/ptax/index.ts` | B overall; A for examples that reproduce official examples |
| Foreign purchaser surcharges | Same rows and calculator output, residential component only | NSW surcharge purchaser duty, VIC FPAD, QLD AFAD, WA foreign transfer duty, SA foreign ownership surcharge, TAS FIDS | `computeTransferDuty` | B |
| Landholder duty | Calculator mode **Landholder duty** | NSW, VIC, QLD, WA and SA landholder duty provisions | `computeLandholderDuty` | B overall; A for the QLD trust-acquisition example |
| Duties on acquisition workspace totals and KPI | Property taxes workspace | App presentation only | `dutiesView`, `propertyTaxKpis` | B |

## Duties on acquisition workspace

### What it computes

For each AU property profile the workspace calls `computeTransferDuty` with the property purchase date, purchase price, State, property kind, purchaser kind and foreign purchaser flag. It shows **Duty**, **Surcharge / ABSD**, **SSD** (always A$0 for AU rows), **Total**, basis text and rule ids. It sums only rows with status `modelled`.

### Inputs

| App field | Engine input | Notes |
| --- | --- | --- |
| Purchase date | `contractDate` | Profile value from the seed or editor. |
| Purchase price | `dutiableValue` | Cents; the app does not separately model market value. |
| State | `state` | NSW, VIC, QLD, WA, SA, TAS, ACT or NT. |
| Property kind | `propertyKind` | `RESIDENTIAL`, `NON_RESIDENTIAL` or `MIXED`. Seeded AU properties are commercial except medical/hospital properties, which are treated as residential. |
| Residential share (%) | `residentialShareBps` | Used for mixed property and foreign surcharges. If mixed and no split is supplied, surcharge and NSW premium component are not calculated. |
| Purchaser kind / foreign purchaser | `purchaser` | The workspace passes trust purchasers for seed data and maps the foreign flag to `foreignPerson` and `trustWithForeignBeneficiaries`. |

### Method

1. If state, property kind or purchaser kind is missing, the row is **missing-data** and amount is A$0.
2. If the State schedule does not cover the purchase date, `tryCalc` catches the engine error and the row is **Not modelled**. The amount is not included in totals.
3. Otherwise, the engine returns base duty, foreign surcharge duty, total duty, computation lines and a `ruleVersion` string. The row basis is the readable title for those rule ids.
4. Totals are simple sums of modelled rows only. `propertyTaxKpis` reports **Total duty on acquisitions** as that total, **dutyModelled** as modelled rows, **dutyTotal** as all rows and **dutyNotModelled** as non-modelled rows.

### Workspace examples

#### Example DUTY-WA-1: Wattle fund Banksia Plaza duty row

| Input | Value |
| --- | --- |
| Property | Banksia Plaza, Joondalup WA |
| Purchase date | 2019-09-30 |
| Dutiable value | A$522,492,875.00 |
| Property kind | Non-residential |

The WA top band gives A$28,453 plus A$5.15 for every A$100 or part above A$725,000. The engine computes **base duty A$26,899,499.85**, **foreign surcharge A$0.00**, **total duty A$26,899,499.85**. The Wattle **Duties on acquisition** total includes Banksia Plaza, Lakeside Marketplace and Coral Coast Central and is **A$101,580,567.85**; Wattle Grove Shopping Centre is not modelled because NSW 2009 rates are outside the code.

#### Example DUTY-SA-2: Wattle fund Lakeside Marketplace 2012 SA acquisition

| Input | Value |
| --- | --- |
| Property | Lakeside Marketplace, Mawson Lakes SA |
| Purchase date | 2012-05-21 |
| Dutiable value | A$648,381,847.00 |
| Property kind | Non-residential |

The code uses the SA 5 September 2002 scale for the whole value. Because the contract predates the qualifying-land phase-out, no reduction applies. It computes **base duty A$35,654,834.50**, **foreign surcharge A$0.00**, **total duty A$35,654,834.50**, with rules `sa.transfer.2002-09-05+sa.qualifying-land.phaseout.2015-12-07`.

### Evidence

`test/domain/ptax/ptax.test.ts` checks AU duty rows, not-modelled rows and total exclusion. `test/verify/ptax/independent-verifier.test.ts` hand-recomputes acquisition duties for seeded modelled properties. This document's `test/docs/au-duties.test.ts` checks these example amounts and the KPI counts.

### Confidence

**B — independently verified.** The app presentation is verified against the engine and seed data by domain and verifier tests. It is not a separate statutory calculation.

## Transfer duty and foreign purchaser surcharges

### What it computes

`computeTransferDuty` computes base transfer duty for NSW, Victoria, Queensland, Western Australia, South Australia, Tasmania, the ACT and the Northern Territory. It then adds a foreign purchaser surcharge where the State has a modelled surcharge and the acquisition has a residential component acquired by a foreign person, foreign corporation, trust with foreign beneficiaries, discretionary trust with a potential foreign beneficiary or a supplied foreign ownership share.

### Legal basis

The engine rule entries cite each State/Territory revenue office and, for WA landholder duty and NT duty, legislation. Rule register anchors include `RULE-REGISTER.md#rule-au-au-transfer-duty-nsw-general-2026-07-01`, `#rule-au-au-transfer-duty-qld-general-current`, `#rule-au-au-transfer-duty-wa-general-2014-07-02`, `#rule-au-au-transfer-duty-sa-general-2002-09-05`, `#rule-au-au-transfer-duty-tas-general-2013-10-21`, `#rule-au-au-transfer-duty-act-residential-2022-07-01` and `#rule-au-au-transfer-duty-nt-general-2022-07-01`.

### Inputs

| Engine input | Meaning |
| --- | --- |
| `state` | AU jurisdiction. |
| `contractDate` | Selects the effective schedule; dates outside modelled ranges throw or are converted to **Not modelled** by the workspace. |
| `dutiableValue` | Whole acquisition value in cents. |
| `propertyKind` and `residentialDutiableValue` / `residentialShareBps` | Determine residential component for mixed-use property, NSW premium duty and surcharges. |
| `purchaser` | Determines foreign status. First-home, principal-place-of-residence and other concessions are not inputs. |

### Method

1. Resolve residential component. Residential uses the whole value, non-residential uses nil, mixed uses a supplied value or percentage.
2. Select a State schedule by date. NSW also selects premium-duty thresholds for residential property.
3. Compute base duty. `rateBps` bands use `mulBps`, which rounds to the nearest cent. `ratePer100` bands charge `Math.ceil(value / A$100)` or `Math.ceil(excess / A$100)` blocks, so any part of A$100 is a full block. NSW floors scheduled and premium results to whole dollars; NT floors to whole dollars after the formula or percentage calculation.
4. Compute foreign surcharge on the surchargeable residential component multiplied by foreign ownership share. No surcharge is added for ACT or NT; no WA/SA/TAS surcharge is added before its effective date.
5. Return lines for dutiable value, base duty, surcharge when non-zero and total.

### Transfer-duty rates and thresholds

| State | Effective dates | Band / threshold | Duty as coded | Rule version |
| --- | --- | --- | --- | --- |
| NSW | 2026-07-01 onwards | A$0-A$18,000 | 1.25%; minimum A$20 if value > A$0 | nsw.transfer.2026-07-01 |
| NSW | 2026-07-01 onwards | A$18,001-A$38,000 | A$225 + 1.5% over A$18,000 | nsw.transfer.2026-07-01 |
| NSW | 2026-07-01 onwards | A$38,001-A$103,000 | A$525 + 1.75% over A$38,000 | nsw.transfer.2026-07-01 |
| NSW | 2026-07-01 onwards | A$103,001-A$387,000 | A$1,662 + 3.5% over A$103,000 | nsw.transfer.2026-07-01 |
| NSW | 2026-07-01 onwards | A$387,001-A$1,290,000 | A$11,602 + 4.5% over A$387,000 | nsw.transfer.2026-07-01 |
| NSW | 2026-07-01 onwards | Over A$1,290,000 | A$52,237 + 5.5% over A$1,290,000 | nsw.transfer.2026-07-01 |
| NSW | 2026-07-01 onwards | Residential premium above A$3,870,000 | A$194,137 + 7% over A$3,870,000 | nsw.premium.2026-07-01 |
| NSW | 2025-07-01 to 2026-06-30 | Top ordinary threshold / premium threshold | Over A$1,240,000 uses A$50,212 + 5.5%; premium above A$3,721,000 uses A$186,667 + 7% | nsw.transfer.2025-07-01 / nsw.premium.2025-07-01 |
| NSW | 2024-07-01 to 2025-06-30 | Top ordinary threshold / premium threshold | Over A$1,212,000 uses A$49,069 + 5.5%; premium above A$3,636,000 uses A$182,389 + 7% | nsw.transfer.2024-07-01 / nsw.premium.2024-07-01 |
| NSW | 2023-07-01 to 2024-06-30 | Top ordinary threshold / premium threshold | Over A$1,168,000 uses A$47,295 + 5.5%; premium above A$3,505,000 uses A$175,830 + 7% | nsw.transfer.2023-07-01 / nsw.premium.2023-07-01 |
| NSW | 2022-07-01 to 2023-06-30 | Top ordinary threshold / premium threshold | Over A$1,089,000 uses A$44,095 + 5.5%; premium above A$3,268,000 uses A$163,940 + 7% | nsw.transfer.2022-07-01 / nsw.premium.2022-07-01 |
| VIC | 2021-07-01 onwards | A$0-A$25,000 | 1.4% | vic.transfer.2021-07-01 |
| VIC | 2021-07-01 onwards | Above A$25,000 to A$130,000 | A$350 + 2.4% over A$25,000 | vic.transfer.2021-07-01 |
| VIC | 2021-07-01 onwards | Above A$130,000 to A$960,000 | A$2,870 + 6% over A$130,000 | vic.transfer.2021-07-01 |
| VIC | 2021-07-01 onwards | Above A$960,000 to A$2,000,000 | 5.5% of whole value | vic.transfer.2021-07-01 |
| VIC | 2021-07-01 onwards | More than A$2,000,000 | A$110,000 + 6.5% over A$2,000,000 | vic.transfer.2021-07-01 |
| VIC | 2008-05-06 to 2021-06-30 | More than A$960,000 | 5.5% of whole value; no 6.5% premium band | vic.transfer.2008-05-06 |
| QLD | 2012-09-21 onwards | Not more than A$5,000 | Nil | qld.transfer.2012-09-21 |
| QLD | 2012-09-21 onwards | More than A$5,000 up to A$75,000 | A$1.50 per A$100 or part over A$5,000 | qld.transfer.2012-09-21 |
| QLD | 2012-09-21 onwards | A$75,000 to A$540,000 | A$1,050 + A$3.50 per A$100 or part over A$75,000 | qld.transfer.2012-09-21 |
| QLD | 2012-09-21 onwards | A$540,000 to A$1,000,000 | A$17,325 + A$4.50 per A$100 or part over A$540,000 | qld.transfer.2012-09-21 |
| QLD | 2012-09-21 onwards | More than A$1,000,000 | A$38,025 + A$5.75 per A$100 or part over A$1,000,000 | qld.transfer.2012-09-21 |
| WA | 2014-07-02 onwards | A$0-A$120,000 | A$1.90 per A$100 or part of whole value | wa.transfer.2014-07-02 |
| WA | 2014-07-02 onwards | A$120,001-A$150,000 | A$2,280 + A$2.85 per A$100 or part over A$120,000 | wa.transfer.2014-07-02 |
| WA | 2014-07-02 onwards | A$150,001-A$360,000 | A$3,135 + A$3.80 per A$100 or part over A$150,000 | wa.transfer.2014-07-02 |
| WA | 2014-07-02 onwards | A$360,001-A$725,000 | A$11,115 + A$4.75 per A$100 or part over A$360,000 | wa.transfer.2014-07-02 |
| WA | 2014-07-02 onwards | A$725,001 and over | A$28,453 + A$5.15 per A$100 or part over A$725,000 | wa.transfer.2014-07-02 |
| SA | 2002-09-05 onwards | Not more than A$12,000 | A$1.00 per A$100 or part | sa.transfer.2002-09-05 |
| SA | 2002-09-05 onwards | More than A$12,000 to A$30,000 | A$120 + A$2.00 per A$100 or part over A$12,000 | sa.transfer.2002-09-05 |
| SA | 2002-09-05 onwards | More than A$30,000 to A$50,000 | A$480 + A$3.00 per A$100 or part over A$30,000 | sa.transfer.2002-09-05 |
| SA | 2002-09-05 onwards | More than A$50,000 to A$100,000 | A$1,080 + A$3.50 per A$100 or part over A$50,000 | sa.transfer.2002-09-05 |
| SA | 2002-09-05 onwards | More than A$100,000 to A$200,000 | A$2,830 + A$4.00 per A$100 or part over A$100,000 | sa.transfer.2002-09-05 |
| SA | 2002-09-05 onwards | More than A$200,000 to A$250,000 | A$6,830 + A$4.25 per A$100 or part over A$200,000 | sa.transfer.2002-09-05 |
| SA | 2002-09-05 onwards | More than A$250,000 to A$300,000 | A$8,955 + A$4.75 per A$100 or part over A$250,000 | sa.transfer.2002-09-05 |
| SA | 2002-09-05 onwards | More than A$300,000 to A$500,000 | A$11,330 + A$5.00 per A$100 or part over A$300,000 | sa.transfer.2002-09-05 |
| SA | 2002-09-05 onwards | More than A$500,000 | A$21,330 + A$5.50 per A$100 or part over A$500,000 | sa.transfer.2002-09-05 |
| SA | 2015-12-07 to 2017-06-30 | Qualifying non-residential land | Two-thirds of ordinary duty remains payable | sa.qualifying-land.phaseout.2015-12-07 |
| SA | 2017-07-01 to 2018-06-30 | Qualifying non-residential land | One-third of ordinary duty remains payable | sa.qualifying-land.phaseout.2015-12-07 |
| SA | 2018-07-01 onwards | Qualifying non-residential land | Nil duty; mixed land pays residential share of duty on the whole value | sa.qualifying-land.2018-07-01 |
| TAS | 2013-10-21 onwards | Not more than A$3,000 | A$50 minimum | tas.transfer.2013-10-21 |
| TAS | 2013-10-21 onwards | A$3,001 to A$25,000 | A$50 + A$1.75 per A$100 or part over A$3,000 | tas.transfer.2013-10-21 |
| TAS | 2013-10-21 onwards | A$25,001 to A$75,000 | A$435 + A$2.25 per A$100 or part over A$25,000 | tas.transfer.2013-10-21 |
| TAS | 2013-10-21 onwards | A$75,001 to A$200,000 | A$1,560 + A$3.50 per A$100 or part over A$75,000 | tas.transfer.2013-10-21 |
| TAS | 2013-10-21 onwards | A$200,001 to A$375,000 | A$5,935 + A$4.00 per A$100 or part over A$200,000 | tas.transfer.2013-10-21 |
| TAS | 2013-10-21 onwards | A$375,001 to A$725,000 | A$12,935 + A$4.25 per A$100 or part over A$375,000 | tas.transfer.2013-10-21 |
| TAS | 2013-10-21 onwards | More than A$725,000 | A$27,810 + A$4.50 per A$100 or part over A$725,000 | tas.transfer.2013-10-21 |
| ACT residential | 2022-07-01 onwards | A$0-A$200,000 | 1.2% | act.transfer.residential.2022-07-01 |
| ACT residential | 2022-07-01 onwards | A$200,001-A$300,000 | A$2,400 + 2.2% over A$200,000 | act.transfer.residential.2022-07-01 |
| ACT residential | 2022-07-01 onwards | A$300,001-A$500,000 | A$4,600 + 3.4% over A$300,000 | act.transfer.residential.2022-07-01 |
| ACT residential | 2022-07-01 onwards | A$500,001-A$750,000 | A$11,400 + 4.32% over A$500,000 | act.transfer.residential.2022-07-01 |
| ACT residential | 2022-07-01 onwards | A$750,001-A$1,000,000 | A$22,200 + 5.9% over A$750,000 | act.transfer.residential.2022-07-01 |
| ACT residential | 2022-07-01 onwards | A$1,000,001-A$1,455,000 | A$36,950 + 6.4% over A$1,000,000 | act.transfer.residential.2022-07-01 |
| ACT residential | 2022-07-01 onwards | More than A$1,455,000 | A$66,070 + 4.54% over A$1,455,000 | act.transfer.residential.2022-07-01 |
| ACT commercial | 2022-23 to 2026-27 | Annual nil threshold | A$1.7m, A$1.8m, A$1.9m, A$2.0m and A$2.1m respectively; 5% above threshold | act.transfer.commercial.* |
| NT | 2022-07-01 onwards | Up to A$525,000 | `floor dollars(round((0.06571441 × V²) + 15V))`, V = value / 1,000 | nt.transfer.2022-07-01 |
| NT | 2022-07-01 onwards | Above A$525,000 and below A$3m | 4.95% of dutiable value, floored to whole dollars | nt.transfer.2022-07-01 |
| NT | 2022-07-01 onwards | A$3m and below A$5m | 5.75% of dutiable value, floored to whole dollars | nt.transfer.2022-07-01 |
| NT | 2022-07-01 onwards | A$5m and over | 5.95% of dutiable value, floored to whole dollars | nt.transfer.2022-07-01 |

### Foreign purchaser surcharges

| State | Effective dates | Rate as coded | Base as coded | Rule version |
| --- | --- | --- | --- | --- |
| NSW | 2016-06-21 to 2017-06-30 | 4% | Residential component × foreign share | nsw.surcharge.2016-06-21 |
| NSW | 2017-07-01 to 2024-12-31 | 8% | Residential component × foreign share | nsw.surcharge.2017-07-01 |
| NSW | 2025-01-01 onwards | 9% | Residential component × foreign share | nsw.surcharge.2025-01-01 |
| VIC | 2015-07-01 to 2016-06-30 | 3% | Residential component × foreign share | vic.surcharge.2015-07-01 |
| VIC | 2016-07-01 to 2019-06-30 | 7% | Residential component × foreign share | vic.surcharge.2016-07-01 |
| VIC | 2019-07-01 onwards | 8% | Residential component × foreign share | vic.surcharge.2019-07-01 |
| QLD | 2016-10-01 onwards | 8% | Residential component × foreign share | qld.surcharge.2016-10-01 |
| WA | 2019-01-01 onwards | 7% | Residential component × foreign share | wa.surcharge.2019-01-01 |
| SA | 2018-01-01 onwards | 7% | Residential component × foreign share | sa.surcharge.2018-01-01 |
| TAS | 2018-07-01 to 2020-03-31 | 3% | Residential component × foreign share | tas.surcharge.2018-07-01 |
| TAS | 2020-04-01 onwards | 8% | Residential component × foreign share | tas.surcharge.2020-04-01 |
| ACT | 2022-07-01 onwards | Nil | No foreign purchaser duty surcharge in transfer calculator | act.foreign.nil |
| NT | 2022-07-01 onwards | Nil | No foreign purchaser duty surcharge in transfer calculator | nt.foreign.nil |

### Worked examples

#### Example DUTY-NSW-1: NSW Revenue auction example reproduced

A residential property with dutiable value **A$1,350,000.00** on 10 October 2026 is above the A$1,290,000 top ordinary threshold. The code calculates A$52,237 + 5.5% × A$60,000 = **A$55,537.00**. No surcharge is present, so total duty is **A$55,537.00**. This reproduces the Revenue NSW auction example pinned in `test/engine/au/transferDuty.test.ts`.

#### Example DUTY-NSW-2: NSW foreign residential purchaser

For a foreign individual buying residential land for **A$1,000,000.00** on 10 October 2026, ordinary duty is A$11,602 + 4.5% × A$613,000 = **A$39,187.00**. Surcharge purchaser duty is 9% × A$1,000,000 = **A$90,000.00**. Total duty is **A$129,187.00**.

#### Example DUTY-VIC-1: Victorian premium non-PPR duty

For non-residential land valued at **A$2,100,000.00** on 10 October 2026, Victoria uses A$110,000 + 6.5% × A$100,000 = **A$116,500.00**. There is no residential component, so total duty is **A$116,500.00**.

#### Example DUTY-QLD-1: Queensland QRO value with AFAD

For a foreign company buying residential land for **A$850,000.00**, Queensland transfer duty is A$17,325 + A$4.50 per A$100 over A$540,000 = **A$31,275.00**. AFAD is 8% × A$850,000 = **A$68,000.00**. Total duty is **A$99,275.00**.

#### Example DUTY-SA-1: RevenueSA mixed qualifying-land example reproduced

RevenueSA Information Circular 103 uses a **A$2,200,000.00** acquisition with **A$1,200,000.00** residential land and **A$1,000,000.00** qualifying land. Ordinary duty on the whole value is **A$114,830.00**. The code charges the residential share only: A$114,830 × 1,200,000 / 2,200,000 = **A$62,634.55**. The qualifying-land share is nil. Total duty is **A$62,634.55**.

#### Example DUTY-TAS-1: Tasmania transfer duty plus FIDS

For a foreign trust buying Tasmanian residential land for **A$1,000,000.00** on 10 October 2026, base duty is A$27,810 + A$4.50 per A$100 or part over A$725,000 = **A$40,185.00**. FIDS is 8% × A$1,000,000 = **A$80,000.00**. Total duty is **A$120,185.00**.

#### Example DUTY-ACT-1: ACT mixed residential and commercial acquisition

For a mixed ACT acquisition of **A$2,500,000.00** with **A$1,000,000.00** residential value on 10 October 2026, the residential component duty is **A$36,950.00**. The commercial component is A$1,500,000, below the 2026-27 A$2,100,000 threshold, so commercial duty is **A$0.00**. ACT has no transfer-duty foreign surcharge in the code. Total duty is **A$36,950.00**.

#### Example DUTY-NT-1: Northern Territory V-squared formula

For NT non-residential land valued at **A$500,000.00** on 10 October 2026, V = 500. The code computes `(0.06571441 × 500²) + 15 × 500 = 23,928.6025`, rounds and floors to whole dollars, giving **A$23,928.00** total duty.

### Edge cases

- NSW transfer duty is only modelled from 1 July 2022. Older NSW seeded properties are **Not modelled** in the workspace.
- WA transfer duty before 2 July 2014 throws a readable error and is **Not modelled**.
- NT contracts before 1 July 2022 are not modelled.
- SA non-residential, non-primary-production land is nil from 1 July 2018; before then the phase-out fractions are applied.
- ACT calculates residential and commercial components separately for mixed property.
- ACT and NT have cited nil foreign purchaser duty surcharges in the transfer calculator.

### Evidence

Engine tests: `test/engine/au/transferDuty.test.ts` (`NSW transfer duty matches...`, `VIC transfer duty...`, `QLD transfer duty...`, `Landholder duty matches...`), `test/engine/au/independent-state-taxes.test.ts`, `test/engine/au/territories-state-taxes.test.ts`, `test/engine/au/wa-sa-state-taxes.test.ts`, `test/engine/au/wa-sa-landholder-and-surcharges.test.ts`. Independent verifiers: `test/verify/state-taxes/territories-verifier.test.ts`, `test/verify/ptax/independent-verifier.test.ts`, `test/verify/calculators/calculator-verifier.test.ts`. This document's test recomputes every worked example and probes the rate tables.

### Confidence

**B overall.** NSW A$1.35m, QLD A$850k and SA IC 103 examples are **A** for those paths because the code reproduces official examples. Other paths are **B** where an independent verifier re-derived the rates from primary sources; WA foreign duty remains `VERIFIED_SECONDARY` in the engine rule because one effective-date source is secondary.

### Assumptions and limitations

The app does not model first-home, owner-occupier, charitable, corporate reconstruction, developer, primary-production, off-the-plan or other concessions. Foreign status is supplied by the profile or calculator; the app does not determine it from registers or trust deeds. Mixed-use splits are value splits supplied by the caller.

## Landholder duty

### What it computes

The calculator's **Landholder duty** mode calls `computeLandholderDuty`. It models direct single-step relevant acquisitions in NSW, Victoria, Queensland, Western Australia and South Australia. Tasmania, the ACT and the Northern Territory landholder duty are not modelled; they are not available as landholder calculations and do not feed workspace totals.

### Legal basis

The rule entries cite Revenue NSW, SRO Victoria, QRO, RevenueWA and RevenueSA landholder duty guidance. WA also cites Duties Act 2008 (WA) ss 184, 188 and 189. SA cites RevenueSA land holder guidance and the Stamp Duty Land Holder Guide.

### Inputs

| Calculator field | Engine input | Notes |
| --- | --- | --- |
| State | `state` | NSW, VIC, QLD, WA or SA are modelled. |
| Contract date | `acquisitionDate` | Effective-dated rules. |
| Dutiable / landholdings value | `landholdingsValue` | Unencumbered landholding value. |
| Residential share (%) | `residentialLandValue` | Calculator multiplies landholdings value by the percentage. SA post-2018 duty uses residential land only. |
| Foreign purchaser / acquirer | `foreignAcquirer` | Adds modelled landholder surcharge in VIC, QLD and SA only. |
| Acquired interest for landholder duty (%) | `acquiredInterestBps` | Tested against significant-interest thresholds. Calculator uses `PRIVATE_UNIT_TRUST`; docs below also cover other coded kinds. |

### Method

1. Select the jurisdiction's landholder rule by date. Other States throw `Landholder duty is not modelled`.
2. Apply the coded minimum landholding value before testing the acquired interest, except for Queensland unlisted unit-trust trust acquisitions. NSW requires at least A$2m. Victoria requires at least A$1m and then phases duty between A$1m and A$2m, so duty is nil at exactly A$1m. Queensland corporations and listed unit trusts require at least A$2m. WA requires at least A$2m. SA pre-2018 requires at least A$1m; SA from 1 July 2018 has no value test but only residential land is dutiable in this model.
3. For ordinary landholder acquisitions, compare acquired interest with the coded threshold. Below threshold returns not relevant and A$0.
4. Queensland unlisted unit trusts (`PRIVATE_UNIT_TRUST`) are trust acquisitions, not landholder acquisitions: any acquired interest is dutiable, there is no A$2m land-value test, and the code charges transfer duty on the acquired share of the trust land. The engine has no consideration field, so it adds a finding telling the reviewer to check the consideration is not higher.
5. Work out dutiable value. Private landholders generally use land value × acquired interest. NSW and SA public landholders charge on full land value; VIC and QLD public landholders charge 10% of full transfer duty; WA public landholders use the acquirer's interest share under `publicChargeMode: "INTEREST_SHARE"`.
6. Compute transfer duty on that dutiable value. Victoria phases duty for landholdings between A$1m and A$2m by multiplying by `(landholdings - A$1m) / A$1m`.
7. Add landholder foreign surcharge for VIC, QLD and SA where `foreignAcquirer` and residential land value are supplied. NSW and WA raise a manual-review finding instead of calculating a landholder surcharge.

### Landholder duty thresholds and charge modes

| State | Effective dates | Private company | Private unit trust | Wholesale unit trust | Public / listed landholder | Minimum land value | Charge mode as coded | Foreign surcharge in landholder calculator |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NSW | 2024-02-01 onwards | 50% | 20% | 50% | 90% | A$2,000,000 | Private: interest share; public: full land value from 2023-07-01 | Manual-review finding only |
| NSW | 2023-07-01 to 2024-01-31 | 50% | 50% | 50% | 90% | A$2,000,000 | Private: interest share; public: full land value | Manual-review finding only |
| VIC | 2021-07-01 onwards | 50% | 20% | 50% | 90% | A$1,000,000; phasing applies A$1m-A$2m, nil at exactly A$1m | Private: interest share; public: 10% of full duty | 8% of acquired residential share from 2019-07-01 |
| VIC | 2008-05-06 to 2021-06-30 | 50% | 20% | 50% | 90% | A$1,000,000; phasing applies A$1m-A$2m, nil at exactly A$1m | Same; transfer rates are pre-2021 | 3%/7%/8% by date where applicable |
| QLD | 2011-07-01 onwards | 50% | Any interest as trust acquisition | Not modelled | 90% | A$2,000,000 for corporations and listed unit trusts; no land-value test for unlisted unit-trust trust acquisitions | Private company: interest share; private unit trust: trust acquisition at transfer-duty rates on the acquired share (check the consideration); public: 10% of full duty | 8% AFAD on acquired residential share; public uses 10% of full AFAD |
| WA | 2008-07-01 onwards | 50% | 50% | 50% | 90% | A$2,000,000 | All, including listed: general rate on acquirer's interest share under Duties Act 2008 (WA) ss 184 and 188 | Manual-review finding only |
| SA | 2018-07-01 onwards | 50% | 50% | 50% | 90% | Nil if no residential land value | Residential land only; public: full residential land value | 7% on acquired residential interest; public uses 10% of full surcharge |
| SA | 2002-09-05 to 2018-06-30 | 50% | 50% | 50% | 90% | A$1,000,000 | All land, with qualifying-land phase-out through transfer duty | 7% only from 2018-01-01 where date overlaps |
| TAS | All dates | Not modelled | Not modelled | Not modelled | Not modelled | Not modelled | Excluded from totals | Not modelled |
| ACT | All dates | Not modelled | Not modelled | Not modelled | Not modelled | Not modelled | Excluded from totals | Not modelled |
| NT | All dates | Not modelled | Not modelled | Not modelled | Not modelled | Not modelled | Excluded from totals | Not modelled |

### Worked examples

#### Example LH-NSW-1: NSW private unit trust 20% threshold

For a NSW private unit trust on 10 October 2026 with **A$2,000,000.00** landholdings and a **20%** acquisition, the acquisition is relevant. Dutiable value is **A$400,000.00**. NSW transfer duty on that value is **A$12,187.00**. Total landholder duty is **A$12,187.00**.

#### Example LH-NSW-2: NSW company below A$2m landholder threshold

For a NSW private company on 10 October 2026 with **A$1,999,999.99** landholdings and a **60%** acquisition, the A$2m landholder value test is not met. The engine returns `relevantAcquisition: false`, dutiable value **A$0.00**, total duty **A$0.00** and finding `AU_LANDHOLDER.BELOW_LAND_VALUE_THRESHOLD`.

#### Example LH-VIC-1: Victorian private landholder with FPAD

For the SRO-style Victorian private company example with **A$10,000,000.00** residential land and a **70%** acquisition, dutiable value is **A$7,000,000.00**. Transfer duty is A$110,000 + 6.5% × A$5,000,000 = **A$435,000.00**. FPAD is 8% × A$7,000,000 = **A$560,000.00**. Total landholder duty is **A$995,000.00**.

#### Example LH-QLD-1: Queensland private landholder with AFAD

For a Queensland private company with **A$2,800,000.00** landholdings, **A$1,000,000.00** residential land and a **60%** foreign acquisition, dutiable value is **A$1,680,000.00**. Base duty is **A$77,125.00**. AFAD is 8% × 60% × A$1,000,000 = **A$48,000.00**. Total is **A$125,125.00**.

#### Example LH-QLD-2: QRO Christine trust-acquisition example

Source: QRO "Trust interest, acquisitions and surrenders" example, reproduced by `test/engine/au/landholder-thresholds.test.ts`. Land Unit Trust holds **A$1,000,000.00** of Queensland land. Christine acquires a **20%** interest. The engine treats this as a trust acquisition with no significant-interest threshold and no land-value test.

Dutiable value is 20% × A$1,000,000 = **A$200,000.00**. Queensland transfer duty is A$1,050 + 1,250 × A$3.50 = **A$5,425.00**. Total trust acquisition duty is **A$5,425.00**. The engine also raises `AU_LANDHOLDER.TRUST_ACQUISITION` because the consideration A$150,000 in the QRO example is lower than the land-value share, but the calculator has no consideration input.

#### Example LH-WA-1: WA listed landholder interest-share mode

For a WA public/listed landholder with **A$5,000,000.00** WA land and a **90%** acquisition, the acquisition meets the public threshold. Under the code's `INTEREST_SHARE` mode the dutiable value is **A$4,500,000.00**, not 10% of full duty. WA general rate gives **A$222,865.50** total duty.

#### Example LH-SA-1: SA residential landholder with foreign ownership surcharge

For a SA private unit trust with **A$850,000.00** residential land and a **75%** foreign acquisition, dutiable value is **A$637,500.00**. SA conveyance duty is **A$28,892.50**. The 7% foreign ownership surcharge on the acquired residential interest is **A$44,625.00**. Total landholder duty is **A$73,517.50**.

### Edge cases

- Below-threshold acquisitions return `relevantAcquisition: false`, duty A$0 and an explanatory finding; the calculator summary says **Not a relevant acquisition**.
- SA post-2018 landholder duty returns not relevant where the supplied residential land value is nil, because primary-production land is not an input.
- NSW and WA foreign landholder surcharge is manual-review only in code; base landholder duty is still calculated.
- Multi-step acquisitions, statement-period histories, linked-entity tracing, excluded interests, chattels and prior exemptions are not modelled.

### Evidence

`test/engine/au/independent-state-taxes.test.ts` has independent NSW, VIC and QLD landholder tests. `test/engine/au/wa-sa-landholder-and-surcharges.test.ts` covers WA listed/unlisted thresholds, SA landholder examples and SA foreign surcharge. `test/verify/state-taxes/territories-verifier.test.ts` includes WA/SA verifier cases. This document's test recomputes all five landholder examples.

### Confidence

**B overall.** Queensland unlisted unit-trust trust acquisitions are **A** where the QRO Christine example is reproduced by `test/engine/au/landholder-thresholds.test.ts` and this document's test. NSW direct paths are **B** because the A$2m value test is enforced and covered by `test/engine/au/landholder-thresholds.test.ts`. WA and SA direct single-step paths are **B** with independent verifier coverage. Other single-step landholder paths are implemented from primary sources and ordinary engine tests unless a named verifier test covers them.

### Assumptions and limitations

The calculator hard-codes `PRIVATE_UNIT_TRUST` for its UI landholder mode; the engine supports private company, private unit trust, wholesale unit trust and public landholder. It does not model Tasmania, ACT or NT landholder duty, despite those jurisdictions having transfer-duty schedules.

## Sources

- Revenue NSW transfer duty rates, past thresholds, surcharge purchaser duty and landholder duty pages; code cites them, retrieved 10 October 2026.
- SRO Victoria land transfer duty, premium duty, FPAD and landholder duty pages; code cites them, retrieved 10 October 2026.
- Queensland Revenue Office transfer duty, AFAD and landholder duty pages; code cites them, retrieved 10 October 2026.
- WA Government RevenueWA transfer duty, foreign buyers duty and landholder duty pages; code cites them. Duties Act 2008 (WA) ss 184, 188 and 189 are cited for landholder duty. Retrieved 19 October 2026.
- RevenueSA rate of stamp duty, Information Circular 103, foreign ownership surcharge and land holder guidance; code cites them. Retrieved 19 October 2026.
- State Revenue Office Tasmania property transfer duty and FIDS rate pages; code cites them. Retrieved 19 October 2026.
- ACT Revenue Office conveyance duty guidance and calculator API data; code cites them. Retrieved 19 October 2026.
- Stamp Duty Act 1978 (NT) Schedule 1 clause 1(2), NT stamp duty guidance and examples; code cites them. Retrieved 19 October 2026.
