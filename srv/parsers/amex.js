const { parseCsvRow, parseEuropeanDate, normaliseText, parseGermanAmount } = require('./utils')

module.exports = function AMEX(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean)
  const dataLines = lines[0]?.toLowerCase().includes('datum') ? lines.slice(1) : lines
  return dataLines.map(line => {
    const cols = parseCsvRow(line)
    const date = parseEuropeanDate(cols[0]?.trim())
    const amount = parseGermanAmount(cols[4]?.trim())
    const description = normaliseText(cols[1])
    // cols[2] = Karteninhaber (discarded), cols[3] = Konto # (discarded)
    return { date, amount, description }
  }).filter(Boolean)
}
