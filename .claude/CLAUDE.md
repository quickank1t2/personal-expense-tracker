# personal-expense-tracker

SAP CAP Node.js personal expense tracker. One service (`ExpenseService`) at `/odata/v4/expenses/` exposing three entity sets: `Expenses`, `Categories`, `Budgets`. One action: `importExpenses(bankType, csv)` for ingesting bank CSV exports.

---

## Project layout

| Path | Purpose |
|------|---------|
| `db/schema.cds` | Domain model: Expenses, Categories, Budgets |
| `srv/expense-service.cds` | OData V4 service definition + `importExpenses` action |
| `srv/expense-service.js` | Service handler: CRUD + bank CSV parsers |
| `app/tracker/annotations.cds` | Fiori Elements UI annotations |
| `test/expense-service.test.js` | Jest integration tests via `@cap-js/cds-test` |
| `specs/` | Requirement specs created by `/architect` (created on first use) |

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

The skill:
1. Reads all CAP source files and any existing specs in `specs/`
2. Produces an Architect Brief (analysis, task breakdown, CAP impact map)
3. Runs an interactive grilling session to stress-test assumptions
4. Synthesizes a Final Spec
5. Saves to `specs/SPEC-{slug}.md`
6. Creates a GitHub issue with labels `enhancement` + `spec`

All specs live in `specs/SPEC-{slug}.md`. Each spec has a corresponding GitHub issue visible at:
`https://github.com/quickank1t2/personal-expense-tracker/issues`

Issues with the `spec` label have a linked spec file. Before picking up any `enhancement` issue, check whether a `SPEC-*.md` file exists for it.
