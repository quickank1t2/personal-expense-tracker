using ExpenseService from '../../srv/apis/expense-service';

annotate ExpenseService.Expenses with @(
  UI.LineItem: [
    { Value: date,              Label: 'Date'        },
    { Value: description,       Label: 'Description' },
    { Value: category.name,     Label: 'Category'    },
    { Value: amount,            Label: 'Amount'      },
    { Value: currency,          Label: 'Currency'    },
    { Value: source,            Label: 'Source'      }
  ],
  UI.HeaderInfo: {
    TypeName:       'Expense',
    TypeNamePlural: 'Expenses',
    Title:          { Value: description },
    Description:    { Value: amount }
  },
  UI.Facets: [
    {
      $Type:  'UI.ReferenceFacet',
      Label:  'Details',
      Target: '@UI.FieldGroup#Details'
    }
  ],
  UI.FieldGroup#Details: {
    Data: [
      { Value: date        },
      { Value: amount      },
      { Value: currency    },
      { Value: description },
      { Value: category_ID, Label: 'Category' },
      { Value: source      }
    ]
  }
);

annotate ExpenseService.Budgets with @(
  UI.LineItem: [
    { Value: category.name, Label: 'Category' },
    { Value: amount,        Label: 'Budget'   },
    { Value: currency,      Label: 'Currency' }
  ],
  UI.HeaderInfo: {
    TypeName:       'Budget',
    TypeNamePlural: 'Budgets',
    Title:          { Value: category.name },
    Description:    { Value: amount }
  }
);

annotate ExpenseService.Categories with @(
  UI.LineItem: [
    { Value: name, Label: 'Category' },
    { Value: icon, Label: 'Icon'     }
  ]
);
