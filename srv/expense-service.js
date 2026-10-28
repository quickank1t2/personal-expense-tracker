const cds = require('@sap/cds')
const parsers = require('./parsers')

module.exports = class ExpenseService extends cds.ApplicationService {
  async init() {
    const { Expenses, Categories } = this.entities

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

        const categoryID = row._category
          ? catByName[row._category.toLowerCase()] ?? null
          : null

        await INSERT.into(Expenses).entries({
          date:        row.date,
          amount:      row.amount,
          description,
          category_ID: categoryID,
          source:      bankType
        })
        imported++
      }

      return { imported, skipped, duplicates }
    })

    return super.init()
  }
}
