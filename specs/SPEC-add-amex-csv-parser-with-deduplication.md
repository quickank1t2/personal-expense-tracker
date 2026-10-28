# SPEC: Add AMEX CSV Parser with Idempotent Import

**Status:** implemented
**Created:** 2026-10-28
**Slug:** add-amex-csv-parser-with-deduplication
**GitHub Issue:** https://github.com/quickank1t2/personal-expense-tracker/issues/1

---

## Problem Statement

The expense tracker currently supports four `bankType` values — `GENERIC`, `ING`, `SPARKASSE`, and `EMEX` — but only `GENERIC` has a working parser. `EMEX` is a mis-named stub that was intended to cover American Express exports but was never implemented.

American Express (German locale) exports a five-column CSV with German-format amounts (`1.599,00`), `DD/MM/YYYY` dates, and no category column. Without a dedicated parser, AMEX cardholders cannot import their statement data. Additionally, there is currently no deduplication: importing the same file twice silently creates duplicate expense records across all bank types.

---

## Solution

Implement the `AMEX` parser and rename the existing `EMEX` stub to `AMEX`. The parser handles German locale quirks (comma decimal, period thousands separator, `DD/MM/YYYY` dates), discards cardholder and account-suffix columns, normalises multi-space padding in merchant names, and imports all rows including payments and credits at their original signed amount.

Introduce idempotent imports globally: before inserting any row, check whether a record with the same `date + amount + description + source` already exists. Skip and count duplicates separately from malformed rows. Update the `importExpenses` return type to `{ imported, skipped, duplicates }` across all parsers.

---

## User Stories

1. As a user, I want to import my American Express CSV export using `bankType: 'AMEX'`, so that my AMEX transactions appear in the expense tracker.
2. As a user, I want AMEX date values (`DD/MM/YYYY`) automatically converted to ISO format (`YYYY-MM-DD`), so that dates are stored and sorted correctly.
3. As a user, I want AMEX amounts in German locale format (`1.599,00`) parsed to proper decimals (`1599.00`), so that large purchases are not silently mis-recorded.
4. As a user, I want payment/credit rows (negative amounts) imported as-is with their negative sign, so that I have a complete transaction history, not just expenses.
5. As a user, I want all cardholders' transactions imported together from a single family-plan export, so that I don't need to split files.
6. As a user, I want to re-import the same CSV file without creating duplicate records, so that I can safely re-run imports for verification.
7. As a user, I want the import response to distinguish between malformed rows (`skipped`) and already-existing rows (`duplicates`), so that I know what actually changed.
8. As a user, I want deduplication to work for all bank types (GENERIC, ING, SPARKASSE, AMEX), so that no parser is a second-class citizen.

---

## CAP Implementation Decisions

### Schema Changes (`db/schema/tables/`)

**Implemented alongside this spec (additional changes requested post-grilling):**
- `currency : String(3)` dropped from `Expenses` — all amounts are EUR, field was redundant.
- `tags : Composition of many { key tag : String(50) }` added to `Expenses` — inline composition enabling one-to-many tagging per expense, navigable via OData (`GET /Expenses(id)/tags`, `POST /Expenses(id)/tags`).

### Service Model Changes (`srv/apis/expense-service.cds`)

Updated the `importExpenses` return type to add `duplicates`:

```cds
action importExpenses(bankType: String, csv: LargeString)
  returns { imported: Integer; skipped: Integer; duplicates: Integer };
```

### Service Logic Changes (`srv/expense-service.js`)

1. **Renamed `EMEX` → `AMEX`** in the `parsers` map.

2. **Implemented `AMEX(csv)` parser:**
   - Detect header row by checking for `datum` (case-insensitive) and skip it.
   - Columns: `[0] Datum`, `[1] Beschreibung`, `[2] Karteninhaber` (discard), `[3] Konto #` (discard), `[4] Betrag`.
   - Date conversion: `DD/MM/YYYY` → `YYYY-MM-DD`.
   - Amount parsing: strip period thousands-separators, replace comma decimal with `.`, parse to float. Keep sign (do **not** `Math.abs`).
   - Description normalisation: `.replace(/\s+/g, ' ')` collapses the multi-space padding AMEX uses to align merchant names in the export.
   - Map: `{ date, amount, description }`. No `_category`, no `currency`.
   - Uses `parseCsvRow()` helper to correctly handle quoted fields (descriptions containing commas).

3. **Added deduplication to the shared import loop** (all parsers):
   - `SELECT.one.from(Expenses).where({ date, amount, description, source })` before each `INSERT`.
   - If a match exists: increment `duplicates`, skip insert.

4. **Updated return value** from `{ imported, skipped }` to `{ imported, skipped, duplicates }`.

5. **Removed `currency`** from all `INSERT` statements (field no longer exists on entity).

6. **Added dummy seed fixture** at `test/fixtures/amex-sample.csv` with fake but structurally-authentic AMEX data.

### UI Annotation Changes (`app/tracker/annotations.cds`)

Removed `currency` from `UI.LineItem` and `UI.FieldGroup#Details` for `Expenses` (field dropped from schema).

### Testing Decisions

Existing pattern: POST to `/odata/v4/expenses/importExpenses`, assert on response counters and re-query `Expenses` to verify state.

New test cases implemented:
- [x] AMEX happy path: valid CSV with 5 rows (fixture) → `imported: 5, skipped: 0, duplicates: 0`
- [x] AMEX date conversion: imported row has `date` in `YYYY-MM-DD` format
- [x] AMEX German amount format: `"1.599,00"` → stored as `1599`
- [x] AMEX negative amount row: payment row with `-750,00` imported with `amount: -750`
- [x] AMEX multi-cardholder: rows for two cardholders both imported, cardholder name absent from description
- [x] Deduplication (GENERIC): import same CSV twice → second call returns `duplicates: 2, imported: 0`
- [x] Deduplication (AMEX): re-import returns `duplicates: 1, imported: 0`
- [x] Malformed AMEX row (bad date) counted in `skipped`, not `duplicates`

---

## Assumptions Confirmed

1. ✅ `EMEX` was a typo for `AMEX` — renamed, no parallel stub needed.
2. ✅ `Karteninhaber` (cardholder) discarded — not stored anywhere.
3. ✅ `source` field set to `'AMEX'` — card account suffix not recorded.
4. ⚠️ **Overridden** — negative-amount (payment/credit) rows are **imported**, not skipped. Stored with their original negative sign.
5. ⚠️ **Superseded** — `currency` field dropped entirely from `Expenses`; all amounts are implicitly EUR.
6. ✅ Period thousand-separators handled explicitly in amount parsing.
7. ✅ All cardholders imported together without filtering.
8. ✅ Deduplication key: `date + amount + description + source`.
9. ✅ New `duplicates` counter added to return type.
10. ✅ Deduplication applies to all parsers, not just AMEX.

---

## Related Specs

None — this is the first spec in the project.

---

## Out of Scope

- Auto-categorization of AMEX transactions based on merchant name keywords.
- Filtering imports by cardholder name.
- Per-card `source` tagging (e.g. `AMEX-52015`).
- UI changes to display the new `duplicates` counter.
- ING and SPARKASSE parser implementations (those stubs remain as-is).
- Handling AMEX exports from non-German locales (different date/amount formats).

---

## Further Notes

- The `Decimal(9,2)` field allows negative values — no schema migration needed for payment rows.
- Deduplication uses `SELECT.one` before each `INSERT` rather than a DB unique constraint, keeping the schema stable and avoiding migration complexity. Performance is acceptable for statement-sized imports (hundreds of rows).
- The real AMEX CSV file (`activity (9).csv`) must **never** be committed. The test fixture uses invented data only.
- `currency` was dropped from `Expenses` and its seed CSV (`db/data/my.expensetracker-Expenses.csv`) in the same session. `Budgets` retains its own `currency` field as budget caps may differ.
- `tags` composition creates the OData navigation `Expenses(id)/tags` automatically — no separate service entity declaration needed. Tags are writable via `POST /Expenses(id)/tags { "tag": "..." }`.
