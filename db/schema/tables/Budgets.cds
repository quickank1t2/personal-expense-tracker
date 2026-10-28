namespace my.expensetracker;
using { cuid } from '@sap/cds/common';
using { my.expensetracker.Categories } from './Categories';

entity Budgets : cuid {
  category : Association to Categories;
  amount   : Decimal(9,2);
  currency : String(3) default 'EUR';
}
