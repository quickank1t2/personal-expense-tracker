function parseRows(csv, mapFn) {
  const lines = csv.split(/\r?\n/).filter(Boolean)
  const dataLines = lines[0]?.toLowerCase().includes('date') ? lines.slice(1) : lines
  return dataLines.map(line => {
    const cols = line.split(',')
    return mapFn(cols)
  }).filter(Boolean)
}

function parseCsvRow(line, delimiter = ',') {
  const cols = []
  let cur = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === delimiter && !inQuotes) { cols.push(cur); cur = '' }
    else { cur += ch }
  }
  cols.push(cur)
  return cols
}

function parseEuropeanDate(str) {
  if (!str) return null
  const sep = str.includes('/') ? '/' : '.'
  const [d, m, y] = str.split(sep)
  if (!d || !m || !y) return null
  const fullYear = y.length === 2 ? `20${y}` : y
  return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function normaliseText(str) {
  return str?.trim().replace(/\s+/g, ' ') ?? ''
}

function parseGermanAmount(str) {
  if (!str) return NaN
  return parseFloat(str.replace(/\./g, '').replace(',', '.'))
}

module.exports = { parseRows, parseCsvRow, parseEuropeanDate, normaliseText, parseGermanAmount }
