# SPEC: Add TargoBank CSV Parser

**Status:** implemented
**Created:** 2026-10-29
**Slug:** add-targobank-csv-parser
**GitHub Issue:** https://github.com/quickank1t2/personal-expense-tracker/issues/6

---

## Problem Statement

The expense tracker has no parser for TargoBank Girokonto CSV exports. There is currently no `TARGOBANK` entry in the parser registry, so calling `importExpenses` with `bankType: 'TARGOBANK'` returns a 400 error.

TargoBank's CSV format is structurally unlike all other supported banks: it has no header row, uses semicolon delimiters with unquoted fields, splits debit and credit amounts into separate columns (col 2 and col 3), and encodes the full transaction detail — type, counterparty, IBAN, and purpose — as a single compound field in col 1 where the segments are separated by runs of three or more spaces.

---

## Solution

Add a `TARGOBANK` parser that handles the format's two key structural quirks: the separate debit/credit columns, and the compound blob in col 1. The parser validates the file by checking that the first row's date column matches `DD.MM.YYYY`; it throws a clear error if not. Description is extracted as the second whitespace-segment of the blob (the counterparty/merchant name), falling back to the full blob if there is only one segment. Zero-amount rows (interest rate notices) are skipped. Sign convention is negated on import — identical to ING and Sparkasse.

No schema, service, or UI changes are needed. The existing deduplication loop, `parseEuropeanDate`, `parseGermanAmount`, and `normaliseText` utilities all apply unchanged.

---

## User Stories

1. As a user, I want to import my TargoBank Girokonto CSV using `bankType: 'TARGOBANK'`, so that my TargoBank transactions appear in the expense tracker without a 400 error.
2. As a user, I want TargoBank booking dates (`DD.MM.YYYY`) automatically converted to ISO format (`YYYY-MM-DD`), so that dates are stored and sorted correctly.
3. As a user, I want TargoBank debit amounts (col 2, negative) normalised to positive values, so that expenses are stored consistently with ING, Sparkasse, and AMEX.
4. As a user, I want TargoBank credit amounts (col 3, positive) normalised to negative values, so that inflows are clearly distinguishable from outflows.
5. As a user, I want the description to use the counterparty/merchant name (second 3+-space segment of col 1), so that Lastschrift, Kartenzahlung, and Überweisung rows show the payee name.
6. As a user, I want the description to fall back to the full blob text when col 1 has no 3+-space separator, so that unusual rows are still traceable.
7. As a user, I want zero-amount rows (interest rate notices, account info lines) skipped silently and counted in `skipped`, so that the Expenses table stays clean.
8. As a user, I want re-importing the same TargoBank CSV to count existing rows as duplicates rather than inserting them again, so I can safely re-run imports.
9. As a user, I want a clear error if I pass a CSV whose first row does not start with a `DD.MM.YYYY` date, so I know exactly what went wrong rather than getting a silent empty import.

---

## CAP Implementation Decisions

### Schema Changes (`db/schema/tables/`)

None.

### Service Model Changes (`srv/apis/expense-service.cds`)

None. The `importExpenses` action signature is unchanged.

### Service Logic Changes (`srv/parsers/`)

**`srv/parsers/targobank.js`** — new file:

1. Split on `\r?\n`, filter empty lines.
2. Validate: check `cols[0]` of the first line against `/^\d{2}\.\d{2}\.\d{4}$/`. If it does not match, throw: `'TargoBank CSV format not recognised: first row does not start with a DD.MM.YYYY date. Export the file directly from TargoBank without modifying it.'`
3. For each line, `cols = line.split(';')`:
   - `date = parseEuropeanDate(cols[0]?.trim())`
   - `rawAmount = cols[2]?.trim() || cols[3]?.trim()` — col 2 = debit (non-empty), col 3 = credit (non-empty)
   - `amount = -parseGermanAmount(rawAmount)`
   - `segments = cols[1]?.trim().split(/ {3,}/) ?? []`
   - `description = normaliseText(segments[1] || segments[0] || '')`
4. Return `null` for zero-amount rows (`amount === 0`); filter with `.filter(Boolean)` after the map.
5. Return `{ date, amount, description }` for all other rows.

**`srv/parsers/index.js`** — add `TARGOBANK`:
```js
const TARGOBANK = require('./targobank')
module.exports = { GENERIC, ING, SPARKASSE, AMEX, TARGOBANK }
```

**Sign convention:** col 2 raw values are negative (debits); col 3 raw values are positive (credits). Negating both aligns with the shared standard: positive stored = money out, negative stored = money in.

### UI Annotation Changes (`app/tracker/annotations.cds`)

None.

### Testing Decisions

- Pattern: POST to `/odata/v4/expenses/importExpenses` with `bankType: 'TARGOBANK'`, assert on response counters; re-query `Expenses` to verify stored values where needed.
- Fixture at `test/fixtures/targobank-sample.csv`: 5 rows in full 7-column unquoted semicolon format, invented data. Must never contain real account data.

New test cases:
- [ ] TARGOBANK happy path: 5 valid rows → `imported: 5, skipped: 0, duplicates: 0`
- [ ] TARGOBANK date conversion: `DD.MM.YYYY` → stored as `YYYY-MM-DD`
- [ ] TARGOBANK debit amount: col 2 = `"-57,24"` → stored as `+57.24`
- [ ] TARGOBANK credit amount: col 3 = `"3165,03"` → stored as `-3165.03`
- [ ] TARGOBANK description from blob: second segment used as description (counterparty name)
- [ ] TARGOBANK description fallback: single-token blob → full blob text used as description
- [ ] TARGOBANK zero-amount row: Information row counted in `skipped`, not imported
- [ ] TARGOBANK invalid format: first row not matching `DD.MM.YYYY` → 400 error
- [ ] TARGOBANK deduplication: re-importing same CSV → `imported: 0, duplicates: N`
- [ ] TARGOBANK malformed date row: counted in `skipped`

---

## Assumptions Confirmed

1. ✅ Sign convention is negated on import — same as ING and Sparkasse (debit raw = negative → stored positive; credit raw = positive → stored negative).
2. ✅ Format validated by checking col 0 of first line against `DD.MM.YYYY` regex; missing/invalid → throw loudly.
3. ✅ Zero-amount rows filtered in the parser (return `null`) and counted as `skipped` by the import loop.
4. ✅ Description = second 3+-space segment of col 1; fallback to full blob if only one segment.
5. ✅ `parseEuropeanDate` already handles 4-digit years — no utility change needed.
6. ✅ Latin-1 umlauts in transaction type names are garbled when read as UTF-8, but the type is discarded so this is transparent.
7. ✅ `line.split(';')` suffices — no need for `parseCsvRow` (fields are never quoted).

---

## Related Specs

- `SPEC-add-ing-bank-csv-parser.md` — direct sibling; same sign-negation convention and fail-loudly pattern.
- `SPEC-add-sparkasse-bank-csv-parser.md` — direct sibling; same utility reuse (`parseEuropeanDate`, `parseGermanAmount`, `normaliseText`).
- `SPEC-add-amex-csv-parser-with-deduplication.md` — established the dedup loop and `null`-row filtering pattern (`.filter(Boolean)`) reused here.

---

## Out of Scope

- Auto-tagging rows by transaction type (Lastschrift, Kartenzahlung, etc.) — deferred, consistent with ING and Sparkasse decisions.
- Handling TargoBank savings account or credit card exports — this spec targets the Girokonto format only.
- Mapping the account IBAN (col 6) to a multi-account model — not in scope.
- Encoding fix (converting Latin-1 → UTF-8) for German umlauts in transaction type names — type is discarded, no impact on correctness.
- Filtering by transaction type (e.g. excluding `Information` rows by name) — zero-amount filter covers this case type-agnostically.

---

## Further Notes

- The zero-amount filter must live in the parser (return `null`) rather than the import loop, because the loop only checks `!row.date || isNaN(row.amount)` — `amount === 0` passes that guard. The AMEX parser already uses `.filter(Boolean)` at the end of its map; the same pattern applies here.
- The `/ {3,}/` split on col 1 is robust to the "Gutschrift Lohn  Gehalt  Rente" type variant (2-space gaps within the type name do not trigger the split).
- The `cols[2]?.trim() || cols[3]?.trim()` expression for raw amount correctly handles both debit rows (col 2 non-empty, col 3 empty) and credit rows (col 2 empty, col 3 non-empty).
