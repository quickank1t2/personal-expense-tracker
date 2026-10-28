# SPEC: Add ING Bank CSV Parser

**Status:** draft
**Created:** 2026-10-29
**Slug:** add-ing-bank-csv-parser
**GitHub Issue:** https://github.com/quickank1t2/personal-expense-tracker/issues/2

---

## Problem Statement

The expense tracker has an `ING` bank type registered in the parser index but the implementation (`srv/parsers/ing.js`) is a stub that immediately throws `"ING parser not yet implemented"`. Any attempt to call `importExpenses` with `bankType: 'ING'` returns a 400 error, making the feature completely non-functional for ING Girokonto users.

The real ING CSV export (German locale) is structurally different from all other supported bank formats: it uses semicolon delimiters, begins with a ~13-line German-language account-metadata preamble, carries ten columns per row (two date fields, counterparty, transaction type, purpose text, reference ID, running balance, two currency fields, and a signed amount), and formats amounts and dates in German locale conventions (`-129,00`, `DD.MM.YYYY`).

---

## Solution

Replace the `ING` stub with a fully working parser. The parser will dynamically locate the `Buchung;` column-header row, skip all preamble lines above it, then parse each subsequent data row: booking date (col 0) → ISO date, counterparty (col 2) + purpose (col 4) → description, signed amount (col 8) → decimal. If no `Buchung;` header row is found, the parser throws a clear, actionable error rather than silently importing zero rows. All other import mechanics (deduplication, skipped/duplicates counters, the service dispatcher) are already in place and require no changes.

A `parseIngDate` helper will be added to `srv/parsers/utils.js` to handle the dot-separated `DD.MM.YYYY` format. The existing `parseGermanAmount` helper reuses as-is.

---

## User Stories

1. As a user, I want to import my ING Girokonto CSV export using `bankType: 'ING'`, so that my ING transactions appear in the expense tracker without a 400 error.
2. As a user, I want ING booking dates (`DD.MM.YYYY`) automatically converted to ISO format (`YYYY-MM-DD`), so that dates are stored and sorted correctly.
3. As a user, I want ING amounts in German locale format (`-129,00` / `3.000,00`) parsed to proper signed decimals, so that both debits and credits are recorded accurately.
4. As a user, I want the description to combine the counterparty name and the purpose text (`"{counterparty}: {purpose}"`), so that I can tell apart the many PayPal or insurance rows from each other.
5. As a user, I want rows where the purpose is empty to fall back to the counterparty name alone as the description, so that no row ends up with a trailing colon or empty string.
6. As a user, I want credit rows (positive amounts from Gutschrift, Echtzeit-Überweisung) imported at their positive signed value, so I have a complete picture of account inflows and outflows.
7. As a user, I want re-importing the same ING CSV to count existing rows as duplicates rather than inserting them again, so I can safely re-run imports.
8. As a user, I want a clear error if I accidentally pass a CSV without the ING preamble/header row (e.g. a file manually trimmed in Excel), so that I know what went wrong rather than getting a silent empty import.

---

## CAP Implementation Decisions

### Schema Changes (`db/schema/tables/`)

None. `Expenses` already has `date`, `amount`, `description`, `source`, and `tags`. No new fields required.

### Service Model Changes (`srv/apis/expense-service.cds`)

None. The `importExpenses` action signature (`bankType`, `csv` → `{ imported, skipped, duplicates }`) is unchanged.

### Service Logic Changes (`srv/expense-service.js`)

None. The dispatcher (`parsers[bankType.toUpperCase()]`) and the shared import/deduplication loop already handle ING once the parser stops throwing.

### Parser & Utility Changes (`srv/parsers/`)

**`srv/parsers/utils.js`** — add `parseIngDate(str)`:
- Input: `"DD.MM.YYYY"` (dot-separated)
- Split on `.`, reassemble as `"YYYY-MM-DD"`
- Return `null` for missing or malformed input (triggers `skipped` in the import loop)

**`srv/parsers/ing.js`** — full implementation:
1. Split on `\r?\n`, filter empty lines.
2. Find the index of the line that starts with `Buchung;`. If not found, throw: `'ING CSV format not recognised: missing "Buchung" header row. Export the file directly from ING without modifying the headers.'`
3. Slice data lines from `headerIndex + 1` onwards.
4. For each data line, split on `;` (no quoting needed — ING does not quote fields):
   - col 0 → `parseIngDate(...)` → `date`
   - col 2 → counterparty (trim, collapse whitespace)
   - col 4 → purpose (trim, collapse whitespace)
   - col 8 → `parseGermanAmount(...)` → `amount`
   - description: if purpose is non-empty → `"${counterparty}: ${purpose}"`; else → `counterparty`
5. Return `{ date, amount, description }`. Rows where `date` is null or `amount` is NaN are returned as-is and counted `skipped` by the existing import loop.

**`srv/parsers/utils.js`** — export `parseIngDate` alongside existing exports.

### UI Annotation Changes (`app/tracker/annotations.cds`)

None.

### Testing Decisions

- Pattern: POST to `/odata/v4/expenses/importExpenses` with `bankType: 'ING'`, assert on response counters; re-query `Expenses` to verify stored values where needed.
- Follows the AMEX test pattern established in the existing spec.
- Fixture at `test/fixtures/ing-sample.csv`: 5+ structurally-authentic rows using the full 10-column semicolon format with realistic-looking preamble. Invented names and amounts only — never real account data.

New test cases:
- [ ] ING happy path: fixture with 5 valid rows → `imported: 5, skipped: 0, duplicates: 0`
- [ ] ING date conversion: imported row has `date` stored as `YYYY-MM-DD`
- [ ] ING German amount: `"-129,00"` → stored as `-129`; `"3.000,00"` → stored as `3000`
- [ ] ING negative amount (credit): positive-amount Gutschrift row imported with positive sign
- [ ] ING description composition: row with non-empty purpose stored as `"{counterparty}: {purpose}"`
- [ ] ING description fallback: row with empty purpose stored as counterparty name only
- [ ] ING missing preamble: CSV without `Buchung;` header row → 400 error with descriptive message
- [ ] ING deduplication: re-importing same CSV → `imported: 0, duplicates: N`
- [ ] ING malformed row (bad date): counted in `skipped`, not `duplicates`

---

## Assumptions Confirmed

1. ✅ Booking date (col 0, `Buchung`) is the canonical expense date; value date (col 1) is discarded.
2. ✅ Description is `"{counterparty}: {purpose}"` with whitespace collapsed; falls back to counterparty-only when purpose is empty.
3. ✅ `Buchungstext` (col 3, transaction type) is discarded — tagging may be added in a later spec.
4. ✅ All rows imported at their signed amount (no filtering of credits/income rows).
5. ✅ Deduplication uses the uniform `date + amount + description + source` composite key; `Referenz` (col 5) is discarded.
6. ✅ Preamble is detected dynamically by finding the `Buchung;`-prefixed header row, not by a hardcoded line offset.
7. ✅ Missing preamble → throw with a clear error message (not silent empty result, not graceful fallback).
8. ✅ ING does not quote fields → plain `line.split(';')` is sufficient.

---

## Related Specs

- `SPEC-add-amex-csv-parser-with-deduplication.md` — sibling. Established `utils.js`, `parseGermanAmount`, `parseCsvRow`, and the deduplication loop. This spec reuses `parseGermanAmount` as-is and adds `parseIngDate` following the same utility pattern. No conflict.

---

## Out of Scope

- Auto-tagging rows with `Buchungstext` (Lastschrift / Gutschrift / Entgelt / etc.) — deferred to a later spec.
- SPARKASSE parser implementation.
- Filtering or excluding specific transaction types (e.g. ignoring income rows).
- Per-row currency handling (all ING rows are EUR; the `Expenses` entity has no currency field).
- Using the `Referenz` column as a deduplication anchor.
- Handling ING exports from non-German locales.

---

## Further Notes

- `parseIngDate` is the only net-new utility. `parseAmexDate` handles `DD/MM/YYYY` (slash); `parseIngDate` handles `DD.MM.YYYY` (dot) — they are structurally identical except for the split character. Consider whether to generalise into a single `parseEuropeanDate(str, sep)` — but given there are currently only two callers, keeping them separate is simpler and avoids premature abstraction.
- The test fixture must use invented data only. The real file (`Umsatzanzeige_DE61500105175448441179_20261029.csv`) must never be committed.
- The existing import loop already handles `null` date and `NaN` amount as `skipped` — the ING parser does not need to filter rows itself; returning `{ date: null, amount: NaN, description: '' }` is sufficient for bad rows.
