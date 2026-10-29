using ExpenseService from '../../srv/apis/expense-service';

annotate ExpenseService.Expenses with @(
  UI.LineItem: [
    { Value: date,              Label: 'Date'        },
    { Value: description,       Label: 'Description' },
    { Value: category.name,     Label: 'Category'    },
    { Value: amount,            Label: 'Amount'      },
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

annotate ExpenseService.ClassificationRules with @(
  UI.LineItem: [
    { Value: name,          Label: 'Name'     },
    { Value: pattern,       Label: 'Pattern'  },
    { Value: category.name, Label: 'Category' },
    { Value: priority,      Label: 'Priority' },
    { Value: active,        Label: 'Active'   }
  ],
  UI.HeaderInfo: {
    TypeName:       'Rule',
    TypeNamePlural: 'Rules',
    Title:          { Value: name }
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
      { Value: name                         },
      { Value: pattern                      },
      { Value: category_ID, Label: 'Category' },
      { Value: priority                     },
      { Value: active                       }
    ]
  }
);

annotate ExpenseService.Categories with @(
  UI.LineItem: [
    { Value: name, Label: 'Category' },
    { Value: icon, Label: 'Icon'     }
  ]
);
