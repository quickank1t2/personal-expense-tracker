const { parseRows } = require('./utils')

module.exports = function GENERIC(csv) {
  return parseRows(csv, (cols) => ({
    date:        cols[0]?.trim(),
    amount:      Math.abs(parseFloat(cols[1])),
    description: cols[2]?.trim(),
    _category:   cols[3]?.trim()
  }))
}
