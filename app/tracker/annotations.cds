using ExpenseService from '../../srv/apis/expense-service';

annotate ExpenseService.Expenses with @(
  Capabilities.FilterRestrictions: {
    FilterExpressionRestrictions: [{
      Property:           date,
      AllowedExpressions: 'SingleRange'
    }]
  },
  UI.SelectionFields: [ date, category_ID, ignored ],
  UI.PresentationVariant: {
    SortOrder: [{
      Property:   date,
      Descending: true
    }],
    Visualizations: ['@UI.LineItem']
  },
  UI.SelectionVariant: {
    SelectOptions: [{
      PropertyName: ignored,
      Ranges: [{
        Sign: #I,
        Option: #EQ,
        Low: false
      }]
    }]
  },
  UI.LineItem: [
    { Value: date,              Label: 'Date'        },
    { Value: description,       Label: 'Description' },
    { Value: category.name,     Label: 'Category'    },
    { Value: amount,            Label: 'Amount'      },
    { Value: source,            Label: 'Source'      },
    { Value: ignored,           Label: 'Ignored'     }
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
      { Value: source      },
      { Value: ignored     }
    ]
  }
);

annotate ExpenseService.Expenses with {
  category @(
    Common.ValueList: {
      CollectionPath: 'Categories',
      Parameters: [
        {
          $Type:             'Common.ValueListParameterInOut',
          LocalDataProperty: category_ID,
          ValueListProperty: 'ID'
        },
        {
          $Type:             'Common.ValueListParameterDisplayOnly',
          ValueListProperty: 'name'
        }
      ]
    }
  );
}

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
