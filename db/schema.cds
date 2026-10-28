namespace my.expensetracker;
using { cuid } from '@sap/cds/common';

entity Categories {
  key ID   : Integer;
  name     : String(100);
  icon     : String(50);
  budget   : Association to one Budgets on budget.category = $self;
  expenses : Association to many Expenses on expenses.category = $self;
}

entity Budgets : cuid {
  category : Association to Categories;
  amount   : Decimal(9,2);
  currency : String(3) default 'EUR';
}

entity Expenses : cuid {
  date        : Date;
  amount      : Decimal(9,2);
  currency    : String(3) default 'EUR';
  description : String(500);
  category    : Association to Categories;
  source      : String(50); // which bank/file this came from
}
