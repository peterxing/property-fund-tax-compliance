# Australian land tax

The app calculates annual Australian land tax for the **Property taxes** workspace, **Annual taxes** tab, and for the stand-alone **Land tax** calculator. It covers New South Wales, Victoria, Queensland, Western Australia, South Australia, Tasmania, the Australian Capital Territory and the Northern Territory exactly as the code in `src/engine/au/landTax.ts` implements them. Transfer duty is documented separately in `au-duties.md`.

## At a glance

| Calculation | Where in the app | Legal basis | Code | Confidence |
| --- | --- | --- | --- | --- |
| Owner-level land tax and surcharges | Property taxes workspace, Annual taxes tab; Land tax calculator | State and Territory revenue office land-tax rate pages and ACT determination DI2025-153 | `src/engine/au/landTax.ts` | B overall; A where an official example is reproduced |
| Property-row allocation, totals and KPI | Property taxes workspace, Annual taxes tab and exports | Engine output allocated by taxable value; app assumption for property funds | `src/domain/ptax/index.ts` | B |
| Assessment notices and variance labels | Annual taxes tab assessment controls | App record-keeping validation | `src/domain/ptax/reducer.ts`, `src/domain/ptax/index.ts` | C |
| Calculator field mapping | Calculators workspace, **Land tax** | Same engine, one holding | `src/app/workspaces/calculators/model.ts` | B |

## Common method, dates and rounding

### What it computes

`computeLandTax` receives a State or Territory, an assessment year or date, an owner kind and one or more holdings. It returns owner-level general tax, surcharge tax, total tax, computation lines, findings, notes and a per-property allocation.

### Inputs

| Input | App field or source | Code field |
| --- | --- | --- |
| State | Property profile **State** or calculator **State** | `state` |
| Assessment year | Property taxes uses the AU fund period-end calendar year; calculator **Assessment year** | `assessmentYear` |
| Taxable land value | Property profile **Taxable land value** or calculator **Taxable land value** | `holding.taxableLandValue` |
| Owner kind | Property profile / calculator **Owner kind** | `owner.kind` (`INDIVIDUAL`, `COMPANY`, `TRUST`, `SPECIAL_TRUST`) |
| Trust surcharge or trust rates | Property profile / calculator **Trust surcharge or trust rates apply (VIC, SA)** | `owner.trustSurchargeApplies` |
| Foreign / absentee owner | Property profile flags; calculator **Foreign / absentee owner** sets both | `owner.foreign`, `owner.absentee` |
| Residential share | Property profile **Residential land** and **Residential share** | `residential`, `residentialShareBps`, `surchargeableValue` |
| WA metropolitan flag | Property profile **In Perth metropolitan region** | `metropolitanRegion` |

The app default assumption for AU fund property profiles is a trust owner. Victoria uses the trust scale while **Trust surcharge applies** is Yes; NSW special-trust no-threshold treatment is available only if **Owner kind** is **Special trust**; Queensland uses its company/trust scale; South Australia uses trust rates while **Trust surcharge applies** is Yes, but seeded listed funds set it to No because listed and widely held public unit trust schemes are assessed at general rates. WA has one owner scale and the MRIT flag defaults to metropolitan when omitted.

### Method

1. Resolve the land-tax year. NSW and Victoria are calendar years. Queensland, WA, SA, Tasmania and the ACT are financial years labelled by the year they end; an assessment date from July to December maps to the next year.
2. Convert all money to integer cents. Percent rates are stored as basis points; Victorian trust fractional rates use parts per million; South Australian rates use cents per A$100 or part.
3. Aggregate holdings by owner group in the Property taxes workspace. Grouping key is State, owner kind, foreign flag, absentee flag and trust-surcharge flag.
4. Select the coded rate table by `requireEffective`. If no effective table covers the year, the calculation refuses with a not-modelled error. The UI shows **Not modelled** or **Not calculated** and does not put a guessed zero into totals.
5. Calculate owner-level general tax on aggregated taxable land value. NSW, VIC, QLD, WA, SA and TAS use the selected marginal schedule. ACT calculates each residential holding separately, using fixed charge plus valuation charge. NT returns a cited nil.
6. Calculate surcharge tax. NSW foreign-owner surcharge applies only to residential / supplied surchargeable value; Victoria absentee surcharge applies to all taxable value once the relevant Victorian threshold is met; Queensland absentee or foreign company/trust surcharge applies above A$350,000; WA MRIT applies to metropolitan value above A$300,000; Tasmania and ACT foreign surcharge use residential value; SA and NT have no coded foreign land-tax surcharge.
7. Round percentage products with `mulBps` / `mulRatio`, which round half away from zero to cents. South Australia rounds by charging every A$100 or part above a step in full. Allocation uses largest-remainder cents so property allocations add exactly to the owner-level amount.

### Worked examples

#### Example LT-1: financial-year date convention

| Input | Value |
| --- | --- |
| State | Queensland |
| Assessment date | 2026-07-01 |
| Owner kind | Individual |
| Taxable land value | A$680,000.00 |

Queensland is in `FINANCIAL_YEAR_LAND_TAX_STATES`, so 1 July 2026 is assessment year 2027. The individual table is unchanged from 2022 in the code. A$680,000 is in the A$600,000 to A$999,999 band: A$500 plus 1.0% of A$80,000 = A$1,300.00. The app displays **A$1,300**.

For comparison, NSW is not a financial-year State. An assessment date of 2026-07-01 remains assessment year 2026; A$1,100,000 produces A$500.00 under the 2024+ NSW general table.

### Edge cases

The engine rejects missing `assessmentYear` / `assessmentDate`, no holdings, negative land values and unsupported owner/state values. Assessment years before 2022 are rejected before rate-table lookup. If the State is modelled but a year table is absent, `requireEffective` throws; the Property taxes workspace catches that and shows **Not modelled** rather than a silent zero.

### Evidence

`test/engine/au/landTax.test.ts`, `test/engine/au/independent-state-taxes.test.ts`, `test/engine/au/wa-sa-state-taxes.test.ts`, `test/engine/au/territories-state-taxes.test.ts`, `test/verify/state-taxes/territories-verifier.test.ts`, `test/verify/ptax/independent-verifier.test.ts`, `test/domain/ptax/ptax.test.ts`, `test/verify/calculators/calculator-verifier.test.ts`, and this document's `test/docs/au-land-tax.test.ts` cover the method.

## Property taxes workspace annual land tax

### What it computes

For an AU fund, `propertyTaxView` returns **Annual land tax** rows, totals and KPIs. The KPI labelled **Total annual tax this year** is `annual.totals.total`; the **Not calculated** count is `annual.rows` whose status is not `modelled` plus not-modelled duty rows in `propertyTaxKpis`.

### Method

1. The workspace year is `yearOf(fund.periodEnd)`, not today's year.
2. Incomplete profiles produce status `missing-data`, total zero, basis **Profile needs taxable land value, state and owner kind.** and are excluded from totals.
3. Modelled profiles are grouped before calling the engine. The owner-level result is allocated back to rows by taxable land value and, for surcharges, by surchargeable value.
4. The annual period string is `land-tax-YYYY`.
5. A row without a notice estimates due date as 30 September of the assessment year and labels it `(estimated)`. A recorded notice overrides both amount and due date.

### Worked examples

#### Example LT-2: Wattle fund annual rows, total and notice variance

The seeded Wattle fund has period end in 2026, so the annual tab uses land-tax year 2026.

| Row | Code result |
| --- | --- |
| Wattle Grove Shopping Centre | General tax A$8,861,266.01, surcharge A$0.00, total A$8,861,266.01 |
| Banksia Plaza | General tax A$7,005,682.41, MRIT A$372,537.50, total A$7,378,219.91 |
| Lakeside Marketplace | General tax A$6,628,760.20, surcharge A$0.00, total A$6,628,760.20 |

The seeded Wattle totals are tax A$29,976,234.52, surcharge or MRIT A$372,537.50 and **Total annual tax this year** A$30,348,772.02. The **Not calculated** count for annual rows is 0.

Wattle Grove has a recorded notice for A$8,861,266.01 due 16 Sep 2026. Banksia Plaza has a recorded notice for A$7,378,219.91 due 30 Sep 2026; the row label is **Assessed A$7,378,220; matches modelled**. Lakeside Marketplace has no notice, so the due label is **30 Sep 2026 (estimated)** and the assessed label is **No assessment notice recorded**.

### Assessment notices and variance check

`ptax-record-notice` requires period `land-tax-YYYY`, a non-negative assessed amount, valid issue and due dates, due date not before issue date, and a non-empty reference. The row label says `matches modelled` when assessed amount equals modelled total. A variance note is added when `Math.abs(assessedVariance) > 100`, so the threshold is more than A$1.00. The label itself still states the amount above or below modelled for any non-zero variance.

## Land tax calculator

### What it computes

The calculator `au-land-tax` maps one holding to `computeLandTax`. It exposes State, Assessment year, Taxable land value, Owner kind, Trust surcharge or trust rates apply, and Foreign / absentee owner.

### Method

The calculator always passes one holding with `id: "property"`, `residential: true`, the selected owner kind, `foreign` equal to the checkbox and `absentee` equal to the same checkbox. It formats the result as **Taxable land value**, **General land tax**, **Surcharge tax** (or **Metropolitan Region Improvement Tax** for WA), and **Total tax**. Its default values are NSW, assessment year 2026, A$8,000,000, owner kind Trust, trust rates on and foreign off; the verifier pins the default total at A$116,616.

## New South Wales land tax

### Legal basis

Revenue NSW publishes thresholds and rates, special-trust treatment and surcharge land tax for foreign owners. Code rule ids: [NSW general](RULE-REGISTER.md#rule-au-au-land-tax-nsw-general-2024-01-01), [NSW special trust](RULE-REGISTER.md#rule-au-au-land-tax-nsw-special-trust-current), [NSW surcharge](RULE-REGISTER.md#rule-au-au-land-tax-nsw-surcharge-2025-01-01).

### NSW coded rates and thresholds

| Year | Scale | Coded threshold and rates |
| --- | --- | --- |
| 2022 | General | Nil below A$822,000; A$100 + 1.6% above A$822,000 to A$5,026,000; A$67,364 + 2.0% above A$5,026,000 |
| 2023 | General | Nil below A$969,000; A$100 + 1.6% above A$969,000 to A$5,925,000; A$79,396 + 2.0% above A$5,925,000 |
| 2024+ | General | Nil below A$1,075,000; A$100 + 1.6% above A$1,075,000 to A$6,571,000; A$88,036 + 2.0% above A$6,571,000 |
| 2022 | Special trust | No threshold; 1.6% up to A$5,026,000; A$80,416 + 2.0% above A$5,026,000 |
| 2023 | Special trust | No threshold; 1.6% up to A$5,925,000; A$94,800 + 2.0% above A$5,925,000 |
| 2024+ | Special trust | No threshold; 1.6% up to A$6,571,000; A$105,136 + 2.0% above A$6,571,000 |
| 2022 | Foreign-owner surcharge | 2.0% of residential surchargeable value; no threshold |
| 2023-2024 | Foreign-owner surcharge | 4.0% of residential surchargeable value; no threshold |
| 2025+ | Foreign-owner surcharge | 5.0% of residential surchargeable value; no threshold |

### Worked examples

#### Example LT-NSW-1: Revenue NSW foreign residential example path

Two residential NSW holdings have A$600,000.00 taxable value each, owned by a foreign company for assessment year 2026.

General tax uses the 2024+ table on aggregated A$1,200,000.00: A$100 + 1.6% x (A$1,200,000 - A$1,075,000) = A$2,100.00. Surcharge tax is 5.0% x A$1,200,000 = A$60,000.00. Total land tax is A$62,100.00, allocated equally at A$31,050.00 per holding. The app displays **A$62,100**.

### Edge cases, confidence and limitations

NSW surchargeable value defaults to zero unless the holding is marked residential, has a residential share, or supplies explicit surchargeable value. NSW three-year averaging is not reconstructed; the input must already be the taxable land value for the assessment year. Confidence: A for the NSW foreign-owner example path reproduced from Revenue NSW examples by `test/engine/au/landTax.test.ts` ("NSW land tax matches Revenue NSW published examples and special-trust treatment"); B for the NSW special-trust path because it is independently re-derived from Revenue NSW trust guidance but no official numerical special-trust worked example is reproduced.

## Victoria land tax

### Legal basis

SRO Victoria publishes current and historical general rates, trust surcharge rates and the absentee owner surcharge. Code rule ids: [current general](RULE-REGISTER.md#rule-au-au-land-tax-vic-general-2024-01-01), [historical general](RULE-REGISTER.md#rule-au-au-land-tax-vic-general-2022-01-01), [trust and absentee](RULE-REGISTER.md#rule-au-au-land-tax-vic-trust-current).

### Victoria coded rates and thresholds

| Year | Scale | Coded threshold and rates |
| --- | --- | --- |
| 2022-2023 | General | Nil below A$300,000; A$375 + 0.2% above A$300,000; A$975 + 0.5% above A$600,000; A$2,975 + 0.8% above A$1,000,000; A$9,375 + 1.55% above A$1,800,000; A$27,975 + 2.55% above A$3,000,000 |
| 2024+ | General | Nil below A$50,000; A$500 flat from A$50,000; A$975 flat from A$100,000; A$1,350 + 0.3% above A$300,000; A$2,250 + 0.6% above A$600,000; A$4,650 + 0.9% above A$1,000,000; A$11,850 + 1.65% above A$1,800,000; A$31,650 + 2.65% above A$3,000,000 |
| 2022-2023 | Trust | Nil below A$25,000; A$82 + 0.375% above A$25,000; A$926 + 0.575% above A$250,000; A$2,938 + 0.875% above A$600,000; A$6,438 + 1.175% above A$1,000,000; A$15,838 + 1.0114% above A$1,800,000; A$27,975 + 2.55% above A$3,000,000 |
| 2024+ | Trust | Nil below A$25,000; A$82 + 0.375% above A$25,000; A$676 + 0.375% above A$50,000; A$1,338 + 0.375% above A$100,000; A$1,901 + 0.675% above A$250,000; A$4,263 + 0.975% above A$600,000; A$8,163 + 1.275% above A$1,000,000; A$18,363 + 1.1072% above A$1,800,000; A$31,650 + 2.65% above A$3,000,000 |
| 2020-2023 | Absentee surcharge | 2.0% of taxable value once the relevant general or trust threshold is met |
| 2024+ | Absentee surcharge | 4.0% of taxable value once the relevant general or trust threshold is met |

### Worked examples

#### Example LT-VIC-1: SRO Victoria Anika apportionment example path

The SRO example has A$620,000.00 in Ballarat and A$480,000.00 in Bright, total A$1,100,000.00, individual owner, assessment year 2026.

The 2024+ general table gives A$4,650 + 0.9% x (A$1,100,000 - A$1,000,000) = A$5,550.00. The app allocates by value: Ballarat receives A$3,128.18 and Bright receives A$2,421.82. Total land tax is A$5,550.00 and the app displays **A$5,550**.

### Edge cases, confidence and limitations

A trust uses the trust table unless `trustSurchargeApplies` is false. Absentee surcharge is additional; the calculator's single checkbox sets both foreign and absentee, so a Victorian checked case is an absentee-owner case. Confidence: A for the SRO apportionment example and B for the rest of the table because independent verifier tests re-derived bands from SRO pages.

## Queensland land tax

### Legal basis

Queensland Revenue Office publishes separate tables for individuals, companies/trusts, absentees and foreign companies/trusts. Code rule id: [Queensland land tax](RULE-REGISTER.md#rule-au-au-land-tax-qld-current).

### Queensland coded rates and thresholds

| Scale | Coded threshold and rates |
| --- | --- |
| Individual | Nil below A$600,000; A$500 + 1.0% above A$600,000; A$4,500 + 1.65% above A$1,000,000; A$37,500 + 1.25% above A$3,000,000; A$62,500 + 1.75% above A$5,000,000; A$150,000 + 2.25% above A$10,000,000 |
| Company or trust | Nil below A$350,000; A$1,450 + 1.7% above A$350,000; A$33,750 + 1.5% above A$2,250,000; A$75,000 + 2.25% above A$5,000,000; A$187,500 + 2.75% above A$10,000,000 |
| Absentee individual base | Nil below A$350,000; A$1,450 + 1.7% above A$350,000; A$33,750 + 1.5% above A$2,250,000; A$75,000 + 2.0% above A$5,000,000; A$175,000 + 2.5% above A$10,000,000 |
| Absentee individual surcharge | Additional 3.0% of taxable value above A$350,000 |
| Foreign company or trust surcharge | Additional 3.0% of taxable value above A$350,000 |
| Special disability trust | Uses the individual table |

### Worked examples

#### Example LT-QLD-1: QRO foreign company or trust example path

A foreign company owns Queensland taxable land of A$400,000.00 in assessment year 2026.

The company/trust base table gives A$1,450 + 1.7% x (A$400,000 - A$350,000) = A$2,300.00. The foreign entity surcharge is 3.0% x (A$400,000 - A$350,000) = A$1,500.00. Total land tax is A$3,800.00 and the app displays **A$3,800**.

### Edge cases, confidence and limitations

Queensland is a financial-year jurisdiction. Absentee individuals use a different base table plus surcharge. Foreign surcharge applies only to companies and trusts, not individuals unless they are absentee. Confidence: A for QRO examples reproduced in engine tests; B overall for independent table verification.

## Western Australia land tax

### Legal basis

WA Department of Treasury and Finance publishes the land tax scale and MRIT. Code rule ids: [WA land tax](RULE-REGISTER.md#rule-au-au-land-tax-wa-general-current) and [WA MRIT](RULE-REGISTER.md#rule-au-au-land-tax-wa-mrit-current).

### Western Australia coded rates and thresholds

| Scale | Coded threshold and rates |
| --- | --- |
| Land tax | Nil to A$300,000; A$300 from A$300,001 to A$420,000; A$300 + 0.25% above A$420,000; A$1,750 + 0.9% above A$1,000,000; A$8,950 + 1.8% above A$1,800,000; A$66,550 + 2.0% above A$5,000,000; A$186,550 + 2.67% above A$11,000,000 |
| MRIT | 0.14% of metropolitan-region land value above A$300,000 |
| Trust / foreign treatment | Same scale for every owner; no trust or foreign-owner land-tax surcharge |

### Worked examples

#### Example LT-WA-1: MRIT on a Perth metropolitan holding

A WA trust owns one Perth metropolitan holding with taxable value A$400,000.00 in assessment year 2026.

WA land tax is A$300.00. MRIT is 0.14% x (A$400,000 - A$300,000) = A$140.00. Total land tax is A$440.00 and the app displays **A$440**.

If the same saved profile is marked outside the Perth metropolitan region, MRIT is A$0.00. If the flag is omitted, the engine treats the holding as metropolitan.

### Edge cases, confidence and limitations

The code aggregates all WA land for land tax but only metropolitan holdings for MRIT. Trustees are assessed as owners. Confidence: B because `wa-sa-state-taxes.test.ts` and `test/verify/ptax/independent-verifier.test.ts` re-derived WA figures from official tables; no official worked MRIT example is reproduced here.

## South Australia land tax

### Legal basis

RevenueSA publishes general and trust rates by financial year, trust-rate exceptions and the under-A$20 assessment rule. Code rule ids: [SA general](RULE-REGISTER.md#rule-au-au-land-tax-sa-general) and [SA trust](RULE-REGISTER.md#rule-au-au-land-tax-sa-trust).

### South Australia coded general rates and thresholds

| Financial year | Coded general threshold and steps |
| --- | --- |
| 2021-22 | Nil to A$482,000; 50c per A$100 above A$482,000; A$1,460 + A$1.25 per A$100 above A$774,000; A$5,860 + A$2.00 per A$100 above A$1,126,000; A$10,340 + A$2.40 per A$100 above A$1,350,000 |
| 2022-23 | Nil to A$534,000; 50c per A$100 above A$534,000; A$1,620 + A$1.00 per A$100 above A$858,000; A$5,530 + A$2.00 per A$100 above A$1,249,000; A$20,550 + A$2.40 per A$100 above A$2,000,000 |
| 2023-24 | Nil to A$668,000; 50c per A$100 above A$668,000; A$2,025 + A$1.00 per A$100 above A$1,073,000; A$6,905 + A$2.00 per A$100 above A$1,561,000; A$25,685 + A$2.40 per A$100 above A$2,500,000 |
| 2024-25 | Nil to A$732,000; 50c per A$100 above A$732,000; A$2,220 + A$1.00 per A$100 above A$1,176,000; A$7,570 + A$2.00 per A$100 above A$1,711,000; A$28,110 + A$2.40 per A$100 above A$2,738,000 |
| 2025-26 | Nil to A$833,000; 50c per A$100 above A$833,000; A$2,525 + A$1.00 per A$100 above A$1,338,000; A$8,605 + A$2.00 per A$100 above A$1,946,000; A$32,005 + A$2.40 per A$100 above A$3,116,000 |
| 2026-27 | Nil to A$936,000; 50c per A$100 above A$936,000; A$2,840 + A$1.00 per A$100 above A$1,504,000; A$9,680 + A$2.00 per A$100 above A$2,188,000; A$36,000 + A$2.40 per A$100 above A$3,504,000 |

### South Australia coded trust rates and thresholds

| Financial year | Coded trust threshold and steps |
| --- | --- |
| 2021-22 | Nil to A$25,000; A$125 + 50c per A$100 above A$25,000; A$2,410 + A$1.00 per A$100 above A$482,000; A$5,330 + A$1.75 per A$100 above A$774,000; A$11,490 + A$2.40 per A$100 above A$1,126,000; A$16,866 + A$2.40 per A$100 above A$1,350,000 |
| 2022-23 | Nil to A$25,000; A$125 + 50c per A$100 above A$25,000; A$2,670 + A$1.00 per A$100 above A$534,000; A$5,910 + A$1.50 per A$100 above A$858,000; A$11,775 + A$2.40 per A$100 above A$1,249,000; A$29,799 + A$2.40 per A$100 above A$2,000,000 |
| 2023-24 | Nil to A$25,000; A$125 + 50c per A$100 above A$25,000; A$3,340 + A$1.00 per A$100 above A$668,000; A$7,390 + A$1.50 per A$100 above A$1,073,000; A$14,710 + A$2.40 per A$100 above A$1,561,000; A$37,246 + A$2.40 per A$100 above A$2,500,000 |
| 2024-25 | Nil to A$25,000; A$125 + 50c per A$100 above A$25,000; A$3,660 + A$1.00 per A$100 above A$732,000; A$8,100 + A$1.50 per A$100 above A$1,176,000; A$16,125 + A$2.40 per A$100 above A$1,711,000; A$40,773 + A$2.40 per A$100 above A$2,738,000 |
| 2025-26 | Nil to A$25,000; A$125 + 50c per A$100 above A$25,000; A$4,165 + A$1.00 per A$100 above A$833,000; A$9,215 + A$1.50 per A$100 above A$1,338,000; A$18,335 + A$2.40 per A$100 above A$1,946,000; A$46,415 + A$2.40 per A$100 above A$3,116,000 |
| 2026-27 | Nil to A$25,000; A$125 + 50c per A$100 above A$25,000; A$4,680 + A$1.00 per A$100 above A$936,000; A$10,360 + A$1.50 per A$100 above A$1,504,000; A$20,620 + A$2.40 per A$100 above A$2,188,000; A$52,204 + A$2.40 per A$100 above A$3,504,000 |

### Worked examples

#### Example LT-SA-1: 2025-26 listed trust assessed at general rates

A South Australian listed public unit trust profile has `trustSurchargeApplies: false`, taxable land value A$2,000,000.00 and assessment year 2026, meaning financial year 2025-26.

General rates apply. A$2,000,000 is above A$1,946,000 and below A$3,116,000: A$8,605 + A$2.00 for each A$100 or part above A$1,946,000. The excess is A$54,000, or 540 parts, so tax is A$8,605 + A$1,080 = A$9,685.00. The app displays **A$9,685**.

### Edge cases, confidence and limitations

Trust rates apply to `TRUST` and `SPECIAL_TRUST` unless `trustSurchargeApplies` is false. A calculated SA amount above zero but under A$20 is set to zero with finding `AU_LAND_TAX.SA_BELOW_MINIMUM_ASSESSMENT`. Confidence: B; tests independently re-derived all coded SA tables from RevenueSA pages but this document does not reproduce an official worked example.

## Tasmania land tax

### Legal basis

State Revenue Office Tasmania publishes General Land rates and the foreign investor land tax surcharge. Code rule ids: [TAS general](RULE-REGISTER.md#rule-au-au-land-tax-tas-general-2025-07-01) and [TAS foreign surcharge](RULE-REGISTER.md#rule-au-au-land-tax-tas-foreign-2025-07-01).

### Tasmania coded rates and thresholds

| Scale | Coded threshold and rates |
| --- | --- |
| General Land from 1 July 2025 | Nil below A$125,000; A$50 + 0.45% above A$125,000 to A$500,000; A$1,737.50 + 1.5% above A$500,000 |
| Foreign investor land tax surcharge | 2.0% of foreign-owned General Land value marked residential or supplied as surchargeable value |

### Worked examples

#### Example LT-TAS-1: foreign investor land tax surcharge

A foreign company owns Tasmanian General Land of A$600,000.00, marked residential / surchargeable, in assessment year 2026.

General Land tax is A$1,737.50 + 1.5% x (A$600,000 - A$500,000) = A$3,237.50. The foreign surcharge is 2.0% x A$600,000 = A$12,000.00. Total land tax is A$15,237.50; whole-dollar app display is **A$15,238**.

### Edge cases, confidence and limitations

The engine only has the current General Land table from 1 July 2025. Assessment year 2025 is not modelled. Principal residence, primary-production and exempt classifications are out of scope. Confidence: B with independent verifier coverage of official tables.

## Australian Capital Territory land tax

### Legal basis

ACT Revenue Office publishes land-tax calculation guidance and the foreign ownership surcharge. The 2025-26 fixed charge is from Taxation Administration (Amounts Payable--Land Tax) Determination 2025 (DI2025-153). Code rule ids: [ACT 2026-27 residential](RULE-REGISTER.md#rule-au-au-land-tax-act-residential-2026-07-01), [ACT 2025-26 residential](RULE-REGISTER.md#rule-au-au-land-tax-act-residential-2025-07-01), [ACT foreign surcharge](RULE-REGISTER.md#rule-au-au-land-tax-act-foreign-2018-07-01), [ACT commercial nil](RULE-REGISTER.md#rule-au-au-land-tax-act-commercial-nil).

### ACT coded rates and thresholds

| Year | Coded ACT treatment |
| --- | --- |
| 2025-26 | Annual fixed charge A$1,693 plus valuation charge bands |
| 2026-27 | Annual fixed charge A$1,778 plus valuation charge bands |
| Valuation bands | 0.54% to A$150,000; A$810 + 0.64% above A$150,000; A$1,610 + 1.24% above A$275,000; A$10,600 + 1.25% above A$1,000,000; A$23,100 + 1.26% above A$2,000,000 |
| Foreign ownership surcharge | 0.75% of residential AUV per year |
| Commercial land | Cited nil: ACT land tax does not apply to holdings not marked residential |

### Worked examples

#### Example LT-ACT-1: annualised residential AUV with foreign surcharge

A foreign company owns ACT residential land with average unimproved value A$300,000.00. The assessment date is 2026-07-01, so the app labels it assessment year 2027 / financial year 2026-27.

The annualised general charge is fixed A$1,778 + valuation charge A$1,610 + 1.24% x (A$300,000 - A$275,000) = A$3,698.00. The foreign surcharge is 0.75% x A$300,000 = A$2,250.00. Total land tax is A$5,948.00 and the app displays **A$5,948**.

### Edge cases, confidence and limitations

ACT land tax is annualised. The code does not reproduce the quarterly day-count split. A non-residential ACT holding returns a cited nil and finding `AU_LAND_TAX.ACT_COMMERCIAL_LAND_NIL`. Confidence: B for verified current rates and independent verifier tests; the annualised simplification is a limitation.

## Northern Territory land tax

### Legal basis

The NT Territory Revenue Office publishes stamp duty material and no annual land-tax regime. The engine treats NT land tax as a cited nil. Code rule id: [NT nil](RULE-REGISTER.md#rule-au-au-land-tax-nt-nil).

### Northern Territory coded nil treatment

| Jurisdiction | Coded treatment |
| --- | --- |
| Northern Territory | No annual land tax; all owner kinds and foreign flags return A$0.00 with finding `AU_LAND_TAX.NT_NOT_LEVIED` |

### Worked examples

#### Example LT-NT-1: cited nil for NT land

A foreign company owns NT land with taxable value A$2,000,000.00 in assessment year 2026.

The engine returns general tax A$0.00, surcharge tax A$0.00 and total land tax A$0.00. The app displays **A$0** and includes finding `AU_LAND_TAX.NT_NOT_LEVIED` and the note that the Northern Territory does not levy annual land tax.

### Edge cases, confidence and limitations

The confidence is Verified secondary because this is a cited nil by official-scope exclusion, not a rate table. A reviewer should confirm there has been no NT annual land-tax enactment before relying on the nil treatment.

## Sources

| Jurisdiction | Source | Code cites it | Read |
| --- | --- | --- | --- |
| NSW | Revenue NSW, Land tax thresholds and rates; trusts; surcharge land tax | Yes | 10 Oct 2026 |
| VIC | SRO Victoria, current and historical land tax rates; trusts; absentee owner surcharge | Yes | 10 Oct 2026 |
| QLD | Queensland Revenue Office, land tax rates for individuals, companies/trusts, absentees and foreign companies/trusts | Yes | 10 Oct 2026 |
| WA | WA Department of Treasury and Finance, Land tax assessment and MRIT rates | Yes | 19 Oct 2026 |
| SA | RevenueSA, Land tax rates and thresholds; Land held on trust; trust types not subject to trust rates | Yes | 19 Oct 2026 |
| TAS | State Revenue Office Tasmania, Rates of land tax; foreign investor land tax surcharge | Yes | 19 Oct 2026 |
| ACT | ACT Revenue Office, About land tax; How land tax is calculated; foreign ownership surcharge; DI2025-153 | Yes | 19 Oct 2026 |
| NT | NT Department of Treasury and Finance stamp duty pages and NT Government duty examples, used as official-scope evidence that annual land tax is not levied | Yes | 19 Oct 2026 |

