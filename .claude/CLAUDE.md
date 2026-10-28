# personal-expense-tracker

SAP CAP Node.js personal expense tracker. One service (`ExpenseService`) at `/odata/v4/expenses/` exposing three entity sets: `Expenses`, `Categories`, `Budgets`. One action: `importExpenses(bankType, csv)` for ingesting bank CSV exports.

---

## Project layout

```
db/
  index.cds                        ← entry point: using from './schema'
  schema/
    index.cds                      ← using from './tables' + './types'
    tables/
      index.cds                    ← using from each table file
      Categories.cds               ← Categories entity
      Budgets.cds                  ← Budgets entity
      Expenses.cds                 ← Expenses entity
    types/
      index.cds                    ← shared type definitions (e.g. Money)
  data/
    my.expensetracker-*.csv        ← seed data (naming: {namespace}-{Entity}.csv)

srv/
  apis/
    index.cds                      ← using from each service file
    expense-service.cds            ← ExpenseService OData V4 definition
    expense-service.js             ← ExpenseService handler (same name as .cds)

app/
  tracker/
    annotations.cds                ← Fiori Elements UI annotations
    manifest.json                  ← Fiori app manifest

test/
  expense-service.test.js          ← Jest integration tests via @cap-js/cds-test

specs/                             ← Requirement specs created by /architect
```

---

## Guidelines for AI: adding new tables

1. Create `db/schema/tables/{EntityName}.cds`:
   ```cds
   namespace my.expensetracker;
   // using { cuid } from '@sap/cds/common';  ← add if entity needs a UUID key
   // If this entity has associations to OTHER tables, import them with named imports:
   // using { my.expensetracker.OtherEntity } from './OtherEntity';
   // Do NOT add circular imports (if OtherEntity already imports this file, don't import it back).

   entity {EntityName} {
     key ID : Integer;  // or use `: cuid` mixin for UUID
     // fields...
   }
   ```
2. Register it in `db/schema/tables/index.cds`:
   ```cds
   using from './{EntityName}';
   ```
3. Add seed data at `db/data/my.expensetracker-{EntityName}.csv` if needed.
4. Expose in the service by adding a projection in `srv/apis/expense-service.cds` if appropriate.

> **Association import rule**: Use `using { my.expensetracker.TargetEntity } from './TargetEntity'` (named import) when your entity has an `Association to TargetEntity`. Bare `using from './file'` does not create a local binding and will cause a CDS compilation error.

## Guidelines for AI: adding new types

1. Create `db/schema/types/{TypeName}.cds`:
   ```cds
   namespace my.expensetracker;

   type {TypeName} : {base type or structured definition};
   ```
2. Register it in `db/schema/types/index.cds`:
   ```cds
   using from './{TypeName}';
   ```

## Guidelines for AI: adding new services

1. Create `srv/apis/{service-name}.cds` with the service definition. Import from `'../../db/schema'`:
   ```cds
   using my.expensetracker as my from '../../db/schema';

   @path: '{path}'
   service {ServiceName} @(requires: 'User') {
     // projections, actions, functions...
   }
   ```
2. Create `srv/apis/{service-name}.js` with the handler class (same base name as the .cds file so CAP auto-discovers it):
   ```js
   const cds = require('@sap/cds')
   module.exports = class {ServiceName} extends cds.ApplicationService {
     async init() {
       // event handlers...
       return super.init()
     }
   }
   ```
3. Register in `srv/apis/index.cds`:
   ```cds
   using from './{service-name}';
   ```
4. Add UI annotations in `app/tracker/annotations.cds` if this service has a Fiori UI.

---

## Running locally

```bash
cds watch      # hot-reload dev server on http://localhost:4004
npm test       # Jest integration tests
```

## Domain vocabulary

| Term | Meaning |
|------|---------|
| **Expense** | A single spending record: date, amount, currency, description, category FK, source (bank) |
| **Category** | Named bucket (Food, Transport, etc.) with optional budget association |
| **Budget** | Decimal amount cap associated with a Category |
| **bankType** | CSV format identifier: `GENERIC`, `ING`, `SPARKASSE`, `EMEX` |
| **source** | The `bankType` value stamped on each imported Expense row |

## Requirement workflow

New requirements go through the `/architect` skill before any code is written.

```
/architect <requirement text>
```

The skill reads all source files and existing specs, produces an Architect Brief, runs an interactive grilling session, synthesizes a Final Spec, saves to `specs/SPEC-{slug}.md`, and creates a GitHub issue with labels `enhancement` + `spec`.
