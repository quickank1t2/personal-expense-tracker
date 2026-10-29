# SPEC: Ignored Flag on Expense Transactions

**Status:** draft
**Created:** 2026-10-29
**Slug:** ignored-flag-on-expense-transactions
**GitHub Issue:** https://github.com/quickank1t2/personal-expense-tracker/issues/9

---

## Problem Statement

Inter-account transfers (and other non-spend transactions) pollute the expense ledger. When a user moves money between two accounts they own, the same sum appears twice: as an outgoing debit in one bank export and an incoming credit in another. Both rows are real transactions that pass deduplication, yet neither represents actual spending. Without a way to exclude them, they inflate category totals, distort averages, and clutter the everyday working view.

There is no existing mechanism to mark a transaction as "not a real expense" without deleting it. Deleting is destructive — it removes the audit trail and would cause the row to be re-imported next time. The user needs a soft-exclude flag.

---

## Solution

Add an `ignored: Boolean default false` field to the `Expenses` entity. Every imported row gets `ignored = false` unless the user explicitly changes it. The user toggles the flag via OData PATCH or the Fiori detail page — no bulk action, no auto-detection at import time.

The Fiori list view defaults to showing only non-ignored expenses, keeping the everyday view clean. Users adjust the filter to reveal ignored rows when needed. `reclassifyExpenses` skips ignored rows entirely so rule changes never touch transactions the user has deliberately excluded.

---

## User Stories

1. As a user, I want every imported expense to have `ignored = false` by default, so that normal transactions are included in analysis without any manual action.
2. As a user, I want to set `ignored = true` on any expense via OData PATCH or the Fiori detail page, so that I can exclude inter-account transfers and other noise from my analysis.
3. As a user, I want to set `ignored = false` to un-ignore an expense, so that I can reverse a mistaken ignore action.
4. As a user, I want the Fiori Expenses list to show only non-ignored expenses by default, so that my normal working view is free from transfer clutter.
5. As a user, I want to reveal ignored expenses by clearing or changing the `ignored` filter, so that I can audit or reverse ignored rows.
6. As a user, I want `reclassifyExpenses` to skip ignored expenses entirely (leaving their category, tags, and `ignored` flag untouched), so that rule changes never affect transactions I have explicitly excluded.
7. As a user, I want the `ignored` field visible in the expense detail view, so that I can inspect and toggle the status of any individual transaction.

---

## CAP Implementation Decisions

### Schema Changes (`db/schema/tables/Expenses.cds`)

Add one field to the `Expenses` entity:

```cds
ignored : Boolean default false;
```

Full updated entity:

```cds
entity Expenses : cuid {
  date        : Date;
  amount      : Decimal(9,2);
  description : String(500);
  category    : Association to Categories;
  source      : String(50);
  ignored     : Boolean default false;
  tags        : Composition of many {
    key tag : String(50);
  };
}
```

The seed CSV `db/data/my.expensetracker-Expenses.csv` does **not** need an `ignored` column — CDS defaults missing Boolean fields to `false`.

### Service Model Changes (`srv/apis/expense-service.cds`)

None. The `Expenses as projection on my.Expenses` projection automatically exposes the new field. No action changes required.

### Service Logic Changes (`srv/expense-service.js`)

In `reclassifyExpenses`, add a guard at the top of the per-expense loop to skip ignored rows:

```js
for (const expense of expenses) {
  if (expense.ignored) continue   // ← add this line
  const matched = applyRules(rules, expense.description ?? '')
  // ... rest unchanged
}
```

`importExpenses` requires no change — new rows are INSERTed without an `ignored` field, so the DB default of `false` applies.

### UI Annotation Changes (`app/tracker/annotations.cds`)

1. Add `ignored` to `@UI.LineItem` for the Expenses list (after `source`).
2. Add `ignored` to `@UI.FieldGroup#Details` for the detail page.
3. Add `@UI.SelectionFields` with `ignored` so it appears in the filter bar.
4. Add `@UI.SelectionVariant` with a default filter of `ignored = false` so the list opens showing only active transactions.

```cds
annotate ExpenseService.Expenses with @(
  UI.SelectionFields: [ ignored ],
  UI.SelectionVariant: {
    SelectOptions: [{
      PropertyName: ignored,
      Ranges: [{
        Sign: #I,
        Option: #EQ,
        Low: false
      }]
    }]
  }
);
```

Add `{ Value: ignored, Label: 'Ignored' }` to the existing `UI.LineItem` array and `{ Value: ignored }` to `UI.FieldGroup#Details.Data`.

### Testing Decisions

Pattern: POST to `importExpenses`, then GET the expense and assert `ignored`; PATCH and re-GET to verify persistence; run `reclassifyExpenses` and verify the ignored row is untouched.

New test cases:
- [ ] Imported expense has `ignored = false` by default
- [ ] PATCH `ignored = true` → GET returns `ignored = true`
- [ ] PATCH `ignored = false` → GET returns `ignored = false` (reversible)
- [ ] `reclassifyExpenses(dryRun: false)` with an active matching rule does NOT update an ignored expense's `category_ID`
- [ ] `reclassifyExpenses` counts: ignored expense not in `affected`, not in `changed`

---

## Assumptions Confirmed

1. ✅ `ignored` defaults to `false` — no transaction is auto-ignored at import time.
2. ✅ Manual only — no auto-detection by amount sign or description pattern.
3. ✅ `reclassifyExpenses` skips ignored rows entirely (category, tags, `ignored` all unchanged).
4. ✅ Seed CSV does not need an `ignored` column — CDS Boolean default handles it.
5. ✅ No budget/analytics logic exists yet — `ignored` is a read-side marker only for now.

---

## Related Specs

- `SPEC-rule-based-auto-classification.md` — defines `reclassifyExpenses`; this spec adds a skip-guard for ignored rows to that handler.
- All four parser specs (AMEX, ING, SPARKASSE, TARGOBANK) — establish the import loop where `ignored` will silently default to `false`.

---

## Out of Scope

- Auto-detection of transfers at import time (by amount sign or description pattern).
- Bulk ignore action (`bulkIgnore(filter, ignored)`).
- Filtering ignored rows out of OData queries at the service level (the projection exposes all rows; filtering is a UI concern).
- Budget or analytics calculations that respect the `ignored` flag (no such calculations exist yet).

---

## Further Notes

- The `@UI.SelectionVariant` approach sets the initial filter in the annotation layer. If the Fiori app manifest's `initialLoad` setting overrides this, the `filterDefaultValues` key in `manifest.json` routing target options may also need `"ignored": false` — verify at runtime.
- `ignored` survives `reclassifyExpenses` because the handler skips the row entirely (no UPDATE issued). It also survives future re-imports because deduplication fires before any classification logic — a row that already exists is counted as a duplicate and skipped.
