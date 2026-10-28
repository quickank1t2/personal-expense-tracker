const cds = require('@sap/cds')

const parsers = {

  GENERIC(csv) {
    // Expected columns: date,amount,description,category
    // date format: YYYY-MM-DD, amount: decimal (negative = expense)
    return parseRows(csv, (cols) => ({
      date:        cols[0]?.trim(),
      amount:      Math.abs(parseFloat(cols[1])),
      description: cols[2]?.trim(),
      _category:   cols[3]?.trim()
    }))
  },

  ING(_csv) {
    throw new Error('ING parser not yet implemented')
  },

  SPARKASSE(_csv) {
    throw new Error('Sparkasse parser not yet implemented')
  },

  EMEX(_csv) {
    throw new Error('Emex parser not yet implemented')
  }
}

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

      let imported = 0, skipped = 0

      for (const row of rows) {
        if (!row.date || isNaN(row.amount)) { skipped++; continue }

        const categoryID = row._category
          ? catByName[row._category.toLowerCase()] ?? null
          : null

        await INSERT.into(Expenses).entries({
          date:        row.date,
          amount:      row.amount,
          currency:    row.currency ?? 'EUR',
          description: row.description ?? '',
          category_ID: categoryID,
          source:      bankType
        })
        imported++
      }

      return { imported, skipped }
    })

    return super.init()
  }
}

function parseRows(csv, mapFn) {
  const lines = csv.split(/\r?\n/).filter(Boolean)
  const dataLines = lines[0]?.toLowerCase().includes('date') ? lines.slice(1) : lines
  return dataLines.map(line => {
    const cols = line.split(',')
    return mapFn(cols)
  }).filter(Boolean)
}
