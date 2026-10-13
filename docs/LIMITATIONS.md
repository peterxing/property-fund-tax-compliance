# Limitations

Read this before relying on anything the demo shows.

## Not tax advice, and not reviewed by a tax adviser

* The calculations, rates, due dates and rule text come from the shared engine in `src/engine` and are cited to legislation in the **Rules** tab and in `docs/rules/`. **No tax adviser or lawyer has reviewed them.** Rates and thresholds are those the engine encodes for the Australian 2025-26 income year and Singapore Year of Assessment 2027; check the current law and your facts before using any figure.
* **Do not enter real client or investor data.** The site is public and browser storage is not a secure place for it.
* All funds, holders, trial balances and people are **fictional**. They mirror the sample data of the reference app so that the two can be compared side by side.

## It is a demonstration, not a system of record

* **No server.** Data lives in your browser's `localStorage`. Clearing site data, using another browser or device, or private browsing resets or isolates it. Nothing is shared between people.
* **"Working as" is not authentication.** It switches the persona the screens behave as, to show role-based workflow (preparer, reviewer, tax agent, Head of Tax, view only). Anyone who can open the page can switch persona, and anyone can edit the stored data with browser tools. The Access page says so.
* **The audit trail is a UI log**, not tamper-evident evidence.
* **No ATO or IRAS connection.** *Record lodgment* stores the receipt or acknowledgement reference you type; nothing is submitted. Notices, statements and returns are working papers, not filed documents.

## Scope

* Two markets: Australian AMITs and MITs (AUD) and Singapore S-REITs (SGD). Other regimes, entities and currencies are out of scope.
* The engine also contains calculators that the reference app does not have (transfer duty, GST, company tax, land tax, capital allowances and others). They remain tested and available in `src/engine` but are **not surfaced in this UI**.
* The unrealised CGT deferred-tax view covers four investor types; it is an indicator, not a provision calculation.
* Trial balance import accepts CSV only (`account,name,current,prior[,category]`), up to 2,000 rows and 1 MB.

## Exports

* PDFs are generated in the browser with standard PDF fonts, so a few typographic characters are substituted (for example the minus sign becomes a hyphen). Layout is for review, not print-perfect statements.
* The Power BI workbook is a plain `.xlsx` with flat tables and no formulas or formatting beyond a header row.

## Browsers

Evergreen browsers only (Chrome and Edge 111+, Firefox 113+, Safari 16.4+): the styles use `oklch()` colours and native `<dialog>`.

## Differences from the reference app

Where the reference app and the engine disagree, the engine and the cited law win. Every such case is listed in [REFERENCE-PARITY.md](./REFERENCE-PARITY.md).
