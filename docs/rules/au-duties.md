# Australian duties and land tax

This module currently models **NSW, Victoria, Queensland, Western Australia and South Australia** for investor/commercial acquisitions and annual land tax for companies and trusts, with effective-dated schedules back to changes since 1 July 2022 where the published rates changed. `stateCatalogue.ts` marks Victoria and Queensland transfer-duty coverage as `FULL`; NSW, WA and SA transfer-duty coverage as `PARTIAL` (NSW foreign-acquirer landholder surcharge is manual-review only; WA and SA landholder duty are not modelled, nor SA contracts before 1 July 2018 or SA's foreign ownership surcharge); land tax as `FULL` for all five; and TAS, ACT and NT as `NOT_MODELLED`.

## What is modelled

- **Transfer duty** on dutiable value for non-concessional purchasers.
- **Foreign purchaser surcharges**:
  - NSW surcharge purchaser duty.
  - Victoria foreign purchaser additional duty.
  - Queensland additional foreign acquirer duty.
  - Western Australia foreign transfer duty (7% on residential property from 1 January 2019).
- **South Australia qualifying land**: no duty on non-residential, non-primary-production land for contracts from 1 July 2018; a mixed purchase bears the residential share of the duty on the whole value.
- **Landholder duty** for NSW, Victoria and Queensland, including listed/unlisted thresholds as modelled in code.
- **Victoria landholder phasing** for Victorian landholdings between A$1 million and A$2 million, and **Victoria FPAD on landholder acquisitions** on the residential share.
- **Annual land tax** with aggregation across holdings and per-property apportionment.
- **Foreign / absentee surcharges** for NSW, Victoria and Queensland, and Western Australia's **Metropolitan Region Improvement Tax** for Perth metropolitan land.
- **Trust / special-trust treatment** where the State revenue office publishes materially different threshold outcomes relevant to property funds, including South Australia's separate trust rates.

## Out of scope / not modelled

- First-home, principal-place-of-residence and owner-occupier concessions.
- Primary production, principal residence and other exemption pathways.
- Full tracing / aggregation histories for multi-step landholder acquisitions and every anti-avoidance grouping rule.
- Tasmania, the ACT and the Northern Territory; WA and SA landholder duty; SA duty for contracts before 1 July 2018 (including the 2015-2018 phase-out of duty on qualifying land) and SA's foreign ownership surcharge; WA transactions before 2 July 2014.

## Primary sources used

### New South Wales

- Revenue NSW transfer duty rates and historical thresholds: <https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty>
- Revenue NSW surcharge purchaser duty: <https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty/surcharge-purchaser-duty>
- Revenue NSW landholder duty: <https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/landholder-duty>
- Revenue NSW land tax thresholds and rates: <https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax>
- Revenue NSW surcharge land tax: <https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/surcharge-land-tax>

### Victoria

- SRO Victoria land transfer duty rates: <https://www.sro.vic.gov.au/rates-taxes-duties-and-levies>
- SRO Victoria foreign purchaser additional duty: <https://www.sro.vic.gov.au/foreign-purchaser-additional-duty>
- SRO Victoria landholder duty: <https://www.sro.vic.gov.au/landholder-duty>
- SRO Victoria land tax rates and examples: <https://www.sro.vic.gov.au/land-tax-rates-and-thresholds>
- SRO Victoria trusts and land tax: <https://www.sro.vic.gov.au/trusts-and-land-tax>
- SRO Victoria absentee owner surcharge: <https://www.sro.vic.gov.au/absentee-owner-surcharge>

### Queensland

- QRO transfer duty rates: <https://qro.qld.gov.au/duties/transfer-duty/calculate/transfer-duty-rates/>
- QRO additional foreign acquirer duty: <https://qro.qld.gov.au/duties/additional-foreign-acquirer-duty/>
- QRO landholder duty: <https://qro.qld.gov.au/duties/landholder-duty/>
- QRO land tax rates and examples: <https://qro.qld.gov.au/land-tax/>
- QRO foreign entities land tax: <https://qro.qld.gov.au/land-tax/foreign-entities/>
- QRO absentee land tax: <https://qro.qld.gov.au/land-tax/absentees/>

### Western Australia

- WA Department of Treasury and Finance, land tax and MRIT rates: <https://www.wa.gov.au/organisation/department-of-treasury-and-finance/land-tax-assessment>
- WA Department of Treasury and Finance, transfer duty rates: <https://www.wa.gov.au/organisation/department-of-treasury-and-finance/transfer-duty-assessment>
- WA foreign buyers duty: <https://www.wa.gov.au/service/financial-management/taxation-and-duty/about-foreign-buyers-duty>

### South Australia

- RevenueSA land tax rates and thresholds (general and trust rates, 2020-21 to 2026-27): <https://revenuesa.sa.gov.au/landtax/rates-and-thresholds>
- RevenueSA land held on trust, and trust types not subject to the trust rates: <https://revenuesa.sa.gov.au/landtax/land-held-on-trust>, <https://revenuesa.sa.gov.au/landtax/calculate-land-tax/trust-types-not-subject-to-the-trust-land-tax-rates>
- RevenueSA rate of stamp duty: <https://www.revenuesa.sa.gov.au/stamp-duty/rate-of-stamp-duty>
- RevenueSA Information Circular 103 (qualifying land; worked example): <https://www.revenuesa.sa.gov.au/resources/publications/information-circulars/information-circulars/ic_103/information-circular-103_21112022>

## Important assumptions / implementation notes

- NSW mixed residential and non-residential acquisitions only apply surcharge purchaser duty to the residential component supplied by the caller.
- NSW landholder acquisitions by foreign acquirers remain `PARTIAL` coverage: Revenue NSW says surcharge duty may also apply, but this delivery keeps that as a manual-review finding rather than guessing a formula.
- NSW land tax uses the assessment-year taxable land value supplied to the engine; it does not reconstruct the Valuer General’s averaging inputs.
- Victoria’s temporary post-2024 general land tax amounts are modelled from the SRO’s published rate table.
- Victoria FPAD on landholder acquisitions is applied to the proportional residential share of the acquired interest.
- Queensland absentee individuals use the published absentee land-tax scale rather than the ordinary individual threshold.
- Western Australia has one land tax scale for every owner (a trustee is assessed as owner) and no trust or foreign-owner surcharge. The Metropolitan Region Improvement Tax is charged on the aggregated value of Perth metropolitan holdings; the app holds no metropolitan flag per property, so every WA property is treated as metropolitan (the seeded Joondalup and Fremantle properties are).
- WA's land tax scale is the Department of Treasury and Finance's current one, applied from the 2022 assessment year; secondary sources describe it as unchanged since 2018-19.
- South Australia charges every A$100 or part of A$100 in full, issues no assessment under A$20, and uses its trust rates unless a trust is assessed at the general rates. The seed sets *Trust surcharge applies* to No for SA land held by listed funds, because RevenueSA assesses listed and widely held public unit trust schemes at the general rates.
- South Australian conveyance rates are RevenueSA's current table, which its December 2022 worked example also uses; they are applied from 1 July 2018 with a "verified (secondary)" rating for the years before that example.
