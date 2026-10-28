using my.expensetracker as my from '../db/schema';

@path: 'expenses'
service ExpenseService @(requires: 'User') {
  entity Expenses   as projection on my.Expenses;
  entity Categories as projection on my.Categories;
  entity Budgets    as projection on my.Budgets;

  /**
   * Import expenses from a bank CSV export.
   * bankType: GENERIC | ING | SPARKASSE | EMEX
   * csv: raw CSV string content
   * Returns count of imported and skipped rows.
   */
  action importExpenses(bankType: String, csv: LargeString)
    returns { imported: Integer; skipped: Integer };
}
