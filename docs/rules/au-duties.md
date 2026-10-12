# Australian duties and land tax

This module currently models **NSW, Victoria and Queensland** for investor/commercial acquisitions and annual land tax for companies and trusts, with effective-dated schedules back to changes since 1 July 2022 where the published rates changed. `stateCatalogue.ts` marks Victoria and Queensland transfer-duty coverage as `FULL`, NSW transfer-duty coverage as `PARTIAL` because NSW foreign-acquirer landholder surcharge remains manual-review only, and WA, SA, TAS, ACT and NT as `NOT_MODELLED`.

## What is modelled

- **Transfer duty** on dutiable value for non-concessional purchasers.
- **Foreign purchaser surcharges**:
  - NSW surcharge purchaser duty.
  - Victoria foreign purchaser additional duty.
  - Queensland additional foreign acquirer duty.
- **Landholder duty** for NSW, Victoria and Queensland, including listed/unlisted thresholds as modelled in code.
- **Victoria landholder phasing** for Victorian landholdings between A$1 million and A$2 million, and **Victoria FPAD on landholder acquisitions** on the residential share.
- **Annual land tax** with aggregation across holdings and per-property apportionment.
- **Foreign / absentee surcharges** for NSW, Victoria and Queensland.
- **Trust / special-trust treatment** where the State revenue office publishes materially different threshold outcomes relevant to property funds.

## Out of scope / not modelled

- First-home, principal-place-of-residence and owner-occupier concessions.
- Primary production, principal residence and other exemption pathways.
- Full tracing / aggregation histories for multi-step landholder acquisitions and every anti-avoidance grouping rule.
- Unverified interstate schedules outside NSW/VIC/QLD.

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

## Important assumptions / implementation notes

- NSW mixed residential and non-residential acquisitions only apply surcharge purchaser duty to the residential component supplied by the caller.
- NSW landholder acquisitions by foreign acquirers remain `PARTIAL` coverage: Revenue NSW says surcharge duty may also apply, but this delivery keeps that as a manual-review finding rather than guessing a formula.
- NSW land tax uses the assessment-year taxable land value supplied to the engine; it does not reconstruct the Valuer General’s averaging inputs.
- Victoria’s temporary post-2024 general land tax amounts are modelled from the SRO’s published rate table.
- Victoria FPAD on landholder acquisitions is applied to the proportional residential share of the acquired interest.
- Queensland absentee individuals use the published absentee land-tax scale rather than the ordinary individual threshold.
