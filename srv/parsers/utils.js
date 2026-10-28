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

function parseIngDate(str) {
  if (!str) return null
  const [d, m, y] = str.split('.')
  if (!d || !m || !y) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseGermanAmount(str) {
  if (!str) return NaN
  return parseFloat(str.replace(/\./g, '').replace(',', '.'))
}

module.exports = { parseRows, parseCsvRow, parseAmexDate, parseIngDate, parseGermanAmount }
