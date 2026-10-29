# SPEC: Rule-Based Auto-Classification on Import

**Status:** draft
**Created:** 2026-10-29
**Slug:** rule-based-auto-classification
**GitHub Issue:** https://github.com/quickank1t2/personal-expense-tracker/issues/8

---

## Problem Statement

Every imported expense row currently arrives with a null category and no tags. Classifying hundreds of rows manually after each import is tedious and error-prone. There is no mechanism to encode recurring knowledge — "REWE rows are Groceries", "Netflix is Entertainment" — so that the system learns over time.

The user needs a way to define classification rules once and have them applied automatically on every import. They also need a way to test those rules against the 885 expense rows already in the database without re-importing everything.

---

## Solution

A new `ClassificationRules` entity stores user-defined rules. Each rule holds a regex pattern, an optional target category, optional tags (as a child Composition), a numeric priority, and an active flag. Rules are managed directly via OData CRUD — AI-generated regex patterns can be POSTed straight into the entity.

During `importExpenses`, every new (non-duplicate) expense row is tested against all active rules in ascending priority order. The first matching rule assigns its category and tags to the expense. Rows that match no rule are imported with null category and empty tags, as today.

A new `reclassifyExpenses(dryRun: Boolean)` action re-applies all active rules to the full expense history. `dryRun: true` returns impact counts without writing anything; `dryRun: false` overwrites. The response always returns `{ affected, changed, dryRun }`.

---

## User Stories

1. As a user, I want to create a `ClassificationRule` with a regex pattern, target category, and tags, so that matching expenses are automatically classified on import.
2. As a user, I want rules sorted by `priority` (lower number = higher priority), so that more-specific rules can override general ones.
3. As a user, I want the first matching rule to win and subsequent rules not to be tested, so that rule behaviour is predictable.
4. As a user, I want to set `active = false` on a rule without deleting it, so that I can temporarily suspend and re-enable it.
5. As a user, I want rules to match using a regex tested against the expense `description` field, so that I can write patterns like `REWE|EDEKA|ALDI` for grocery stores.
6. As a user, I want each rule to carry zero or more tags as child rows, so that a single rule can apply multiple tags to a matched expense.
7. As a user, I want a rule with no category to still apply its tags, so that I can have tag-only rules.
8. As a user, I want a rule with no tags to still apply its category, so that simple category-assignment rules need no tag rows.
9. As a user, I want `importExpenses` to automatically classify every new (non-duplicate) row against active rules, so that newly imported data arrives pre-classified.
10. As a user, I want `reclassifyExpenses(dryRun: true)` to return impact counts without writing anything, so that I can validate a new rule before applying it.
11. As a user, I want `reclassifyExpenses(dryRun: false)` to re-apply all active rules to my full expense history, so that rules added after an earlier import still take effect.
12. As a user, I want the response `{ affected, changed, dryRun }` where `affected` = expenses that matched a rule and `changed` = expenses whose category or tags actually differ (or would differ on dry run), so that I understand the real impact.
13. As a user, I want an invalid regex in a stored rule to be skipped gracefully rather than crashing the operation, so that one bad rule does not break all imports.

---

## CAP Implementation Decisions

### Schema Changes (`db/schema/tables/`)

**New file `db/schema/tables/ClassificationRules.cds`:**
```cds
namespace my.expensetracker;
using { cuid } from '@sap/cds/common';
using { my.expensetracker.Categories } from './Categories';

entity ClassificationRules : cuid {
  name     : String(100);
  pattern  : String(500);
  category : Association to Categories;
  priority : Integer default 100;
  active   : Boolean default true;
  tags     : Composition of many {
    key tag : String(50);
  };
}
```

Register in `db/schema/tables/index.cds`:
```cds
using from './ClassificationRules';
```

Seed data:
- `db/data/my.expensetracker-ClassificationRules.csv` — starter rules (e.g. `REWE|EDEKA|ALDI` → Groceries; `Netflix|Spotify` → Entertainment).
- `db/data/my.expensetracker-ClassificationRules_tags.csv` — child tag rows for seeded rules; columns `up__ID,tag`.

### Service Model Changes (`srv/apis/expense-service.cds`)

Add to `ExpenseService`:
```cds
entity ClassificationRules as projection on my.ClassificationRules;

action reclassifyExpenses(dryRun: Boolean)
  returns { affected: Integer; changed: Integer; dryRun: Boolean };
```

### Service Logic Changes (`srv/expense-service.js`)

**Shared helper `applyRules(rules, description)`** (pure function, no DB calls — reused by both handlers):
- Iterates rules in order; for each: wraps `new RegExp(rule.pattern)` in try/catch (skip on invalid regex); tests against `description`; returns first matching rule or `null`.

**In `importExpenses`:** before the row loop, load all active rules with their tags sorted by `priority asc`. For each new non-duplicate row, call `applyRules`. On match: set `category_ID` from rule; INSERT rule's tag child rows as the new expense's tags.

**New `reclassifyExpenses` handler:**
1. Load all active rules with tags, sorted by `priority asc`.
2. Load all expenses (ID, description, category_ID) and their existing tag sets.
3. For each expense, call `applyRules`:
   - No match → skip entirely (leave unchanged).
   - Match → compute new `category_ID` (rule's category, or keep existing if rule has none) and new tag set (rule's tags, or keep existing if rule has none).
   - Compare to existing: if category or tag set differs → `changed++`.
   - If not `dryRun`: UPDATE `category_ID`, DELETE existing tags, INSERT new tags.
   - `affected++`.
4. Return `{ affected, changed, dryRun }`.

**"Changed" definition:** `category_ID` differs OR tag set differs (compare sorted arrays to avoid order-sensitivity false positives).

### UI Annotation Changes (`app/tracker/annotations.cds`)

Add for `ClassificationRules`:
- `@UI.LineItem`: name, pattern, category.name, priority, active
- `@UI.HeaderInfo`: TypeName `'Rule'`, Title `name`
- `@UI.FieldGroup#Details`: name, pattern, category_ID, priority, active
- `@UI.Facets`: one `ReferenceFacet` → `FieldGroup#Details`

### Testing Decisions

Pattern: POST to `importExpenses` / `reclassifyExpenses`, re-query `Expenses` to verify stored state.

New test cases:
- [ ] Import with matching rule → expense has correct `category_ID`
- [ ] Import with matching rule → expense has correct tags inserted
- [ ] Import with no matching rule → expense has null category and empty tags
- [ ] Priority ordering: two rules both match; lower `priority` number wins
- [ ] `active: false` rule is skipped during import
- [ ] Rule with no category → tags applied, category remains null
- [ ] Rule with no tags → category applied, no tags inserted
- [ ] Invalid regex in rule → rule skipped, import continues normally
- [ ] `reclassifyExpenses(dryRun: false)` → correct `affected` / `changed` counts; expenses updated in DB
- [ ] `reclassifyExpenses(dryRun: true)` → correct counts returned; no changes written
- [ ] Expense already classified identically by a rule → counts as `affected` but NOT `changed`
- [ ] Expense that matches no rule → not in `affected`, not in `changed`

---

## Assumptions Confirmed

1. ✅ Rules stored in DB as a CDS entity, managed via OData CRUD.
2. ✅ Match field: `description` only.
3. ✅ Match type: regex only (AI writes patterns).
4. ✅ Multiple matching rules: first-match-wins.
5. ✅ Tags on rule: Composition of many child rows.
6. ✅ Priority: explicit integer field (lower = higher priority).
7. ✅ Active flag: `active: Boolean default true`.
8. ✅ `reclassifyExpenses(dryRun: Boolean)` action added.
9. ✅ Reclassify: overwrite all matching expenses; returns `{ affected, changed, dryRun }`.
10. ✅ `importExpenses` only classifies new non-duplicate rows; existing expenses untouched.
11. ✅ Invalid regex: skip rule gracefully, do not crash.

---

## Related Specs

- `SPEC-add-amex-csv-parser-with-deduplication.md` — established the import loop structure in `srv/expense-service.js` that the rule engine extends.
- `SPEC-add-targobank-csv-parser.md` — most recent parser spec; confirms the current loop shape and the gap where tags are never set during import.

---

## Out of Scope

- Substring or wildcard match type — regex only.
- All-match (union) behaviour — first-match-wins only.
- Comma-separated tags on the rule entity — Composition of many used instead.
- Matching on amount, date, or source fields.
- Regex syntax validation at rule-creation time — invalid regex is skipped at runtime.
- Rule conflict detection or linting.
- A dedicated single-rule test UI — `reclassifyExpenses(dryRun: true)` covers this.

---

## Further Notes

- `applyRules` must be a pure function (no DB calls) so it can be unit-tested and reused by both handlers without duplication.
- Tag comparison for `changed` detection: sort both arrays before comparing to avoid order-sensitivity false positives.
- Seed file naming follows CDS convention: `my.expensetracker-ClassificationRules_tags.csv` for the composition child table (CDS generates the table name as `{namespace}_{Entity}_tags`).
- For v1 with ~1000 rows, loading all expenses in memory is fine. Note for future: batch loading if expense count grows significantly.
