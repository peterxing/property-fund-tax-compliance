# AU CGT

`cgt.ts` covers two related Australian property-fund topics:

- CGT event A1 style asset disposals for real property and units.
- Foreign-resident capital gains withholding (FRCGW) for purchasers.

## CGT scope

The engine models:

- cost base and reduced cost base elements,
- Division 43 and other deductible-amount cost-base reductions,
- discount-method eligibility by entity type,
- the strict more-than-12-month holding-period test using contract dates,
- the pre-21 September 1999 indexation alternative,
- current-year and prior-year capital loss application before discount,
- trust outputs that keep the gross discountable gain and discount component separately identifiable.

## FRCGW scope

The withholding calculator is effective-dated for the major rate / threshold changes:

- 10% from 1 July 2016 with a $2 million threshold,
- 12.5% from 1 July 2017 with a $750,000 threshold,
- 15% from 1 January 2025 with no material threshold.

It also models direct-real-property clearance certificates, vendor-declaration style exclusions for non-direct scenarios, and variation-rate overrides.

## Important limitations

- This is not a full CGT event catalogue and does not model every rollover or special asset class.
- Foreign-resident / temporary-resident trust-beneficiary apportionment remains for the downstream distribution layer.
- FRCGW outputs the purchaser's withholding amount and timing only; it does not lodge ATO forms or split credits between vendors.
