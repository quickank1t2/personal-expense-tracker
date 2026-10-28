const cds = require('@sap/cds')

const parsers = {

  GENERIC(csv) {
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

  AMEX(csv) {
    const lines = csv.split(/\r?\n/).filter(Boolean)
    const dataLines = lines[0]?.toLowerCase().includes('datum') ? lines.slice(1) : lines
    return dataLines.map(line => {
      const cols = parseCsvRow(line)
      const date = parseAmexDate(cols[0]?.trim())
      const amount = parseGermanAmount(cols[4]?.trim())
      const description = cols[1]?.trim().replace(/\s+/g, ' ')
      // cols[2] = Karteninhaber (discarded), cols[3] = Konto # (discarded)
      return { date, amount, description }
    }).filter(Boolean)
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

function parseRows(csv, mapFn) {
  const lines = csv.split(/\r?\n/).filter(Boolean)
  const dataLines = lines[0]?.toLowerCase().includes('date') ? lines.slice(1) : lines
  return dataLines.map(line => {
    const cols = line.split(',')
    return mapFn(cols)
  }).filter(Boolean)
}

function parseCsvRow(line) {
  const cols = []
  let cur = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { cols.push(cur); cur = '' }
    else { cur += ch }
  }
  cols.push(cur)
  return cols
}

function parseAmexDate(str) {
  if (!str) return null
  const [d, m, y] = str.split('/')
  if (!d || !m || !y) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseGermanAmount(str) {
  if (!str) return NaN
  // Remove period thousand-separators, replace comma decimal with dot
  return parseFloat(str.replace(/\./g, '').replace(',', '.'))
}
