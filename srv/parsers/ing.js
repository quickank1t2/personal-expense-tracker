const { parseIngDate, parseGermanAmount } = require('./utils')

module.exports = function ING(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean)

  const headerIndex = lines.findIndex(l => l.startsWith('Buchung;'))
  if (headerIndex === -1) {
    throw new Error(
      'ING CSV format not recognised: missing "Buchung" header row. Export the file directly from ING without modifying the headers.'
    )
  }

  return lines.slice(headerIndex + 1).map(line => {
    const cols = line.split(';')
    const date = parseIngDate(cols[0]?.trim())
    const counterparty = cols[2]?.trim().replace(/\s+/g, ' ') ?? ''
    const purpose = cols[4]?.trim().replace(/\s+/g, ' ') ?? ''
    const amount = -parseGermanAmount(cols[8]?.trim())
    const description = purpose ? `${counterparty}: ${purpose}` : counterparty
    return { date, amount, description }
  })
}
