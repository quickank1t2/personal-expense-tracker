const cds = require('@sap/cds')
const parsers = require('./parsers')

function applyRules(rules, description) {
  for (const rule of rules) {
    let regex
    try { regex = new RegExp(rule.pattern, 'i') } catch { continue }
    if (regex.test(description)) return rule
  }
  return null
}

async function loadActiveRules(ClassificationRules) {
  const rules = await SELECT.from(ClassificationRules).where({ active: true }).orderBy('priority asc')
  if (!rules.length) return rules
  const allTags = await SELECT.from('my.expensetracker.ClassificationRules.tags')
  const tagsByRule = {}
  for (const t of allTags) (tagsByRule[t.up__ID] = tagsByRule[t.up__ID] || []).push(t.tag)
  for (const rule of rules) rule.tags = tagsByRule[rule.ID] || []
  return rules
}

module.exports = class ExpenseService extends cds.ApplicationService {
  async init() {
    const { Expenses, Categories, ClassificationRules } = this.entities

    this.on('importExpenses', async (req) => {
      const { bankType = 'GENERIC', csv } = req.data

      const parser = parsers[bankType.toUpperCase()]
      if (!parser) return req.error(400, `Unknown bankType "${bankType}". Supported: ${Object.keys(parsers).join(', ')}`)

      let rows
      try {
        rows = parser(csv)
      } catch (e) {
        return req.error(400, e.message)
      }

      const allCategories = await SELECT.from(Categories)
      const catByName = Object.fromEntries(allCategories.map(c => [c.name.toLowerCase(), c.ID]))

      const rules = await loadActiveRules(ClassificationRules)

      let imported = 0, skipped = 0, duplicates = 0

      for (const row of rows) {
        if (!row.date || isNaN(row.amount)) { skipped++; continue }

        const description = row.description ?? ''
        const existing = await SELECT.one.from(Expenses).where({
          date: row.date,
          amount: row.amount,
          description,
          source: bankType
        })
        if (existing) { duplicates++; continue }

        const catFromParser = row._category
          ? catByName[row._category.toLowerCase()] ?? null
          : null

        const matched = applyRules(rules, description)
        const category_ID = matched ? (matched.category_ID ?? catFromParser) : catFromParser

        const entry = { date: row.date, amount: row.amount, description, category_ID, source: bankType }
        if (matched?.tags.length) entry.tags = matched.tags.map(tag => ({ tag }))

        await INSERT.into(Expenses).entries(entry)
        imported++
      }

      return { imported, skipped, duplicates }
    })

    this.on('reclassifyExpenses', async (req) => {
      const { dryRun = false } = req.data

      const rules = await loadActiveRules(ClassificationRules)

      const expenses = await SELECT.from(Expenses)
      const allExpenseTags = await SELECT.from('my.expensetracker.Expenses.tags')
      const expTagsMap = {}
      for (const t of allExpenseTags) (expTagsMap[t.up__ID] = expTagsMap[t.up__ID] || []).push(t.tag)

      let affected = 0, changed = 0

      for (const expense of expenses) {
        if (expense.ignored) continue
        const matched = applyRules(rules, expense.description ?? '')
        if (!matched) continue

        affected++

        const newCategoryID = matched.category_ID ?? expense.category_ID
        const existingTags = (expTagsMap[expense.ID] || []).slice().sort()
        const newTags = matched.tags.length ? matched.tags.slice().sort() : existingTags

        const catChanged = newCategoryID !== expense.category_ID
        const tagsChanged = JSON.stringify(newTags) !== JSON.stringify(existingTags)

        if (catChanged || tagsChanged) {
          changed++
          if (!dryRun) {
            if (catChanged && !tagsChanged) {
              await UPDATE(Expenses).set({ category_ID: newCategoryID }).where({ ID: expense.ID })
            } else {
              // Deep DELETE + INSERT to correctly replace composition tags
              await DELETE.from(Expenses).where({ ID: expense.ID })
              await INSERT.into(Expenses).entries({
                ID:          expense.ID,
                date:        expense.date,
                amount:      expense.amount,
                description: expense.description,
                category_ID: newCategoryID,
                source:      expense.source,
                tags:        newTags.map(tag => ({ tag }))
              })
            }
          }
        }
      }

      return { affected, changed, dryRun }
    })

    return super.init()
  }
}
