const { parseEuropeanDate, normaliseText, parseGermanAmount } = require('./utils')

module.exports = function TARGOBANK(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean)

  const firstCols = lines[0]?.split(';') ?? []
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(firstCols[0]?.trim())) {
    throw new Error(
      'TargoBank CSV format not recognised: first row does not start with a DD.MM.YYYY date. Export the file directly from TargoBank without modifying it.'
    )
  }

  return lines.map(line => {
    const cols = line.split(';')
    const date = parseEuropeanDate(cols[0]?.trim())
    const rawAmount = cols[2]?.trim() || cols[3]?.trim()
    const amount = -parseGermanAmount(rawAmount)
    if (amount === 0) return null
    const segments = cols[1]?.trim().split(/ {3,}/) ?? []
    const description = normaliseText(segments[1] || segments[0] || '')
    return { date, amount, description }
  }).filter(Boolean)
}
