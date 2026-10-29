# SPEC: Add Sparkasse Bank CSV Parser

**Status:** draft
**Created:** 2026-10-29
**Slug:** add-sparkasse-bank-csv-parser
**GitHub Issue:** https://github.com/quickank1t2/personal-expense-tracker/issues/4

---

## Problem Statement

The expense tracker has a `SPARKASSE` bank type registered in the parser index but the implementation (`srv/parsers/sparkasse.js`) is a stub that immediately throws `"Sparkasse parser not yet implemented"`. Any attempt to call `importExpenses` with `bankType: 'SPARKASSE'` returns a 400 error, making the feature completely non-functional for Sparkasse Girokonto users.

The Sparkasse CSV export (German locale) is structurally different from all other supported formats: it is semicolon-delimited with fully quoted fields, begins immediately with an 18-column English-language header row (`"Order account";"Day of entry";...`), uses `DD.MM.YY` two-digit-year dates (e.g. `28.10.26`), and has a richer column set than ING or AMEX — including a Beneficiary/payer column (col 11) and a Purpose column (col 4) that carries different content depending on the transaction type.

---

## Solution

Replace the `SPARKASSE` stub with a fully working parser. The parser detects the header row, throws a clear error if it is absent, then parses each data row: Day of entry (col 1) → ISO date, Amount (col 14) → negated decimal (same sign convention as ING), and description composed from Beneficiary/payer (col 11) with Purpose (col 4) as fallback when col 11 is empty.

Two utility updates accompany the parser: `parseEuropeanDate` is extended to handle two-digit years (`26` → `2026`), and `parseCsvRow` gains a `delimiter` parameter (default `,`) so it can handle Sparkasse's `;`-quoted CSV format without duplicating logic.

All other import mechanics — deduplication, skipped/duplicates counters, the service dispatcher — are already in place and require no changes.

---

## User Stories

1. As a user, I want to import my Sparkasse Girokonto CSV export using `bankType: 'SPARKASSE'`, so that my Sparkasse transactions appear in the expense tracker without a 400 error.
2. As a user, I want Sparkasse booking dates (`DD.MM.YY`) automatically converted to ISO format (`YYYY-MM-DD`), so that dates are stored and sorted correctly.
3. As a user, I want Sparkasse debit amounts normalised to positive values and credit amounts to negative values, so that the sign convention matches ING and AMEX (positive = money out, negative = money in).
4. As a user, I want the description to use the Beneficiary/payer name (col 11) as the primary source, so that card payments and direct debits show the merchant or company name.
5. As a user, I want the description to fall back to the Purpose text (col 4) when the Beneficiary/payer column is empty, so that bank fee rows (ABSCHLUSS) and similar system entries still get a readable description.
6. As a user, I want credit rows (ECHTZEIT-GUTSCHRIFT, ABSCHLUSS with positive amount) stored as negative amounts, so that inflows are clearly distinguishable from outflows, consistent with the ING and AMEX conventions.
7. As a user, I want re-importing the same Sparkasse CSV to count existing rows as duplicates rather than inserting them again, so I can safely re-run imports.
8. As a user, I want a clear error if I pass a CSV without the Sparkasse header row (e.g. a file manually stripped in Excel), so I know exactly what went wrong rather than getting a silent empty import.

---

## CAP Implementation Decisions

### Schema Changes (`db/schema/tables/`)

None. `Expenses` already has `date`, `amount`, `description`, `source`, and `tags`. No new fields required.

### Service Model Changes (`srv/apis/expense-service.cds`)

None. The `importExpenses` action signature is unchanged.

### Service Logic Changes (`srv/parsers/`)

**`srv/parsers/utils.js`** — two changes:

1. Extend `parseEuropeanDate` to handle two-digit years:
   ```js
   function parseEuropeanDate(str) {
     if (!str) return null
     const sep = str.includes('/') ? '/' : '.'
     const [d, m, y] = str.split(sep)
     if (!d || !m || !y) return null
     const fullYear = y.length === 2 ? `20${y}` : y
     return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
   }
   ```
   Non-breaking: ING uses 4-digit years (unchanged), AMEX uses `/` separator (unchanged).

2. Add `delimiter` parameter to `parseCsvRow` (default `','`):
   ```js
   function parseCsvRow(line, delimiter = ',') {
     // replace hardcoded ',' check with `ch === delimiter`
   }
   ```
   Non-breaking: AMEX calls `parseCsvRow(line)` with no second argument and continues to work.

**`srv/parsers/sparkasse.js`** — full implementation:
1. Split on `\r?\n`, filter empty lines.
2. Check if first line starts with `"Order account"`. If not, throw: `'Sparkasse CSV format not recognised: missing "Order account" header row. Export the file directly from Sparkasse without modifying the headers.'`
3. Slice data lines from index 1 onwards (skip header).
4. For each data line, call `parseCsvRow(line, ';')`:
   - col 1 → `parseEuropeanDate(...)` → `date`
   - col 11 → `normaliseText(...)` → `beneficiary`
   - col 4 → `normaliseText(...)` → `purpose`
   - col 14 → `-parseGermanAmount(...)` → `amount` (negated to match shared sign convention)
   - description: `beneficiary` if non-empty, else `purpose`
5. Return `{ date, amount, description }`. Rows where `date` is null or `amount` is NaN are returned as-is and counted `skipped` by the existing import loop.

**Sign convention:** Sparkasse encodes debits as negative and credits as positive — identical to ING. Negating on parse aligns to the shared standard: positive = money out, negative = money in.

### UI Annotation Changes (`app/tracker/annotations.cds`)

None.

### Testing Decisions

- Pattern: POST to `/odata/v4/expenses/importExpenses` with `bankType: 'SPARKASSE'`, assert on response counters; re-query `Expenses` to verify stored values where needed.
- Follows the ING and AMEX test patterns established in existing specs.
- Fixture at `test/fixtures/sparkasse-sample.csv`: 5+ structurally-authentic rows using the full 18-column semicolon/quoted format with a valid header. Invented names and amounts only — never real account data.

New test cases:
- [ ] SPARKASSE happy path: fixture with 5 valid rows → `imported: 5, skipped: 0, duplicates: 0`
- [ ] SPARKASSE date conversion: imported row has `date` stored as `YYYY-MM-DD` (two-digit year expanded)
- [ ] SPARKASSE debit amount: `"-33,27"` → stored as `+33.27`; sign negated on parse
- [ ] SPARKASSE credit row: `"150,00"` → stored as `-150`
- [ ] SPARKASSE description primary: row with non-empty col 11 → description = beneficiary name
- [ ] SPARKASSE description fallback: row with empty col 11 → description = purpose text
- [ ] SPARKASSE missing header: CSV without `"Order account"` header → 400 error with descriptive message
- [ ] SPARKASSE deduplication: re-importing same CSV → `imported: 0, duplicates: N`
- [ ] SPARKASSE malformed row (bad date): counted in `skipped`, not `duplicates`

---

## Assumptions Confirmed

1. ✅ Sparkasse encodes debits as negative — amounts negated on parse to match shared sign convention.
2. ✅ Day of entry (col 1, "Day of entry") is the canonical date; Value date (col 2) is discarded.
3. ✅ Two-digit years (`DD.MM.YY`) are interpreted as `20XX` by extending `parseEuropeanDate`.
4. ✅ `parseCsvRow` gains a `delimiter` parameter to handle `;`-quoted Sparkasse CSV — non-breaking change.
5. ✅ Header detected by checking first line starts with `"Order account"`; missing header → throw loudly.
6. ✅ Posting text (col 3) is discarded — no auto-tagging, consistent with ING decision.
7. ✅ Category (col 17) is always empty — not mapped to the CAP `Categories` entity.

---

## Related Specs

- `SPEC-add-ing-bank-csv-parser.md` — direct sibling. Sparkasse follows the same sign-negation convention, the same "fail loudly on missing header" pattern, and reuses `parseEuropeanDate`/`parseGermanAmount`. The two-digit year extension is the only net-new utility change.
- `SPEC-add-amex-csv-parser-with-deduplication.md` — established `parseCsvRow`, `parseGermanAmount`, and the deduplication loop that this spec reuses. The `delimiter` parameter addition to `parseCsvRow` is the only impact on that prior work.

---

## Out of Scope

- Auto-tagging rows with Posting text (KARTENZAHLUNG, ECHTZEIT-GUTSCHRIFT, etc.) — deferred to a later spec, consistent with ING.
- GENERIC and ING parser changes — no regression risk from the `parseEuropeanDate` and `parseCsvRow` updates, but those parsers are otherwise untouched.
- Mapping the `Category` export column (col 17) to the `Categories` entity — it is always empty in practice.
- Filtering or excluding specific transaction types (e.g. ignoring ABSCHLUSS fee rows).
- Per-row currency handling (all Sparkasse rows are EUR).
- Handling Sparkasse exports from non-German locales.

---

## Further Notes

- The `parseEuropeanDate` two-digit-year fix (`y.length === 2 ? '20' + y : y`) is safe for ING and AMEX because ING uses 4-digit years and AMEX uses `/` as separator — neither code path changes.
- The `parseCsvRow(line, ';')` call pattern is the only change to how Sparkasse data flows through the shared utility; no other parser is affected.
- The test fixture must use invented data only. The real file (`SPARKASSE_2026.csv` in `prod-data/`) must never be committed.
- The existing import loop already handles `null` date and `NaN` amount as `skipped` — the Sparkasse parser does not need to filter rows itself.
- Sparkasse's `"Order account"` header is the English export label; if the user has a German-locale export it may read `"Auftragskonto"`. This edge case is out of scope — spec targets the English export format only.
