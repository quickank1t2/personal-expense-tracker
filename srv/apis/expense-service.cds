using my.expensetracker as my from '../../db/schema';

@path: 'expenses'
@impl: 'srv/expense-service'
service ExpenseService @(requires: 'User') {
  entity Expenses   as projection on my.Expenses;
  entity Categories as projection on my.Categories;
  entity Budgets    as projection on my.Budgets;

  entity ClassificationRules as projection on my.ClassificationRules;

  action importExpenses(bankType: String, csv: LargeString)
    returns { imported: Integer; skipped: Integer; duplicates: Integer };

  action reclassifyExpenses(dryRun: Boolean)
    returns { affected: Integer; changed: Integer; dryRun: Boolean };

  action syncNow()
    returns { affected: Integer; changed: Integer };
}
