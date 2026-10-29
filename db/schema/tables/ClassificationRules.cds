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
