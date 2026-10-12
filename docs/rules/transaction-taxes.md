# Transaction taxes and identifier rules

This register covers `stampDuty.ts`, `propertyTax.ts`, `withholdingTax.ts`, `badgesOfTrade.ts` and `identifiers.ts`.

## Stamp duty
- BSD is computed on the higher of price and market value, rounded down to the nearest dollar, minimum S$1.
- BSD regimes modelled:
  - before 2018-02-20;
  - 2018-02-20 to 2023-02-14;
  - from 2023-02-15.
- Mixed commercial/residential land can be apportioned using explicit residential and non-residential values; a basis-point share is only a fallback proxy.
- ABSD regimes modelled from 2013-01-12, 2018-07-06, 2021-12-16 and 2023-04-27, including:
  - SC / SPR counts,
  - foreigners,
  - entities,
  - trustees,
  - housing developers with remittable and non-remittable split.
- Mechanical trust-refund and additional-interest remission outcomes are supported where the published conditions can be expressed mechanically from input facts.
- Residential SSD regimes include the 2025-07-04 change back to a 4-year holding period and 16% / 12% / 8% / 4% tiers.
- Industrial SSD is modelled from 2013-01-12.
- Lease duty is modelled at 0.4% with the IRAS threshold and premium-at-BSD treatment.
- Deadline helper:
  - 14 days for documents signed in Singapore;
  - 30 days after first receipt in Singapore for overseas-signed documents.

## Property tax
- Progressive owner-occupier residential tables are modelled for:
  - 2015-2022,
  - 2023,
  - 2024,
  - 2025 onward.
- Progressive non-owner-occupier residential tables are modelled for:
  - 2015-2022,
  - 2023,
  - 2024 onward.
- Non-residential, vacant land and other excluded classes use the flat 10% rule.
- Owner-occupier rebates are modelled for 2023, 2024, 2025 and 2026.
- AV apportionment across ownership shares and part-year periods is supported.
- The engine uses calendar-day proration for private buyer/seller or occupancy reconciliations. This is an implementation assumption because IRAS says seller/buyer apportionment is a private arrangement.
- Deadlines:
  - annual bill: 31 January;
  - other notices: 1 month from notice date;
  - valuation objection: 30 days from valuation notice;
  - current-year valuation-list objection: 31 December.

## Withholding tax
- Section 45 payment categories covered:
  - interest,
  - royalties,
  - director's fees,
  - technical / management / consultancy / professional fees,
  - rent of movable property,
  - branch profit remittance,
  - non-resident public entertainers,
  - a generic residual Section 45 bucket.
- Treaty rates are not embedded; users may pass an override after confirming treaty entitlement outside the engine.
- Due date modelled: 15th day of the second month from payment date.
- Late-payment penalties modelled: 5% plus 1% per completed month after 30 days, capped at 15%.

## Badges of trade
- The module is a decision-support heuristic only.
- It tracks IRAS-style factors such as motive, frequency, holding period, supplementary work, sale circumstances, financing, organisation and connection with trade.
- Any numeric weighting or score threshold is explicitly treated as an engine assumption rather than an IRAS rule.

## Identifiers
- UEN validators cover:
  - 8-digit business UENs,
  - 9-digit local company UENs,
  - R/S/T-prefixed “other entity” UENs.
- NRIC / FIN checksum validation and masking are provided.
- GST registration number validation is format-only.
- Postal code validation checks 6 digits.
- Platform policy note: avoid storing full NRIC / FIN values where possible; prefer masked values such as `****567A`.
