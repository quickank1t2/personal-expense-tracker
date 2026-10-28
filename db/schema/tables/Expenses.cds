namespace my.expensetracker;
using { cuid } from '@sap/cds/common';
using { my.expensetracker.Categories } from './Categories';

entity Expenses : cuid {
  date        : Date;
  amount      : Decimal(9,2);
  currency    : String(3) default 'EUR';
  description : String(500);
  category    : Association to Categories;
  source      : String(50);
}
