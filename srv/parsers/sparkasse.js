const { parseCsvRow, parseEuropeanDate, normaliseText, parseGermanAmount } = require('./utils')

module.exports = function SPARKASSE(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean)

  if (!lines[0]?.startsWith('"Order account"')) {
    throw new Error(
      'Sparkasse CSV format not recognised: missing "Order account" header row. Export the file directly from Sparkasse without modifying the headers.'
    )
  }

  return lines.slice(1).map(line => {
    const cols = parseCsvRow(line, ';')
    const date = parseEuropeanDate(cols[1]?.trim())
    const beneficiary = normaliseText(cols[11])
    const purpose = normaliseText(cols[4])
    const amount = -parseGermanAmount(cols[14]?.trim())
    const description = beneficiary || purpose
    return { date, amount, description }
  })
}
