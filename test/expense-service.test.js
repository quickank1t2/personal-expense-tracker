'use strict'
const cds = require('@sap/cds')

describe('ExpenseService', () => {
  const { GET, POST } = cds.test(__dirname + '/..').in(__dirname + '/..')

  it('returns all expenses', async () => {
    const { data } = await GET('/odata/v4/expenses/Expenses')
    expect(data.value.length).toBeGreaterThan(0)
  })

  it('returns all categories', async () => {
    const { data } = await GET('/odata/v4/expenses/Categories')
    expect(data.value.length).toBeGreaterThan(0)
  })

  it('returns all budgets', async () => {
    const { data } = await GET('/odata/v4/expenses/Budgets')
    expect(data.value.length).toBeGreaterThan(0)
  })

  it('importExpenses - GENERIC parser imports valid rows and skips bad ones', async () => {
    const csv = [
      'date,amount,description,category',
      '2024-11-01,25.00,Test lunch,Food',
      'bad-date,not-a-number,bad row',
      '2024-11-02,10.00,Test coffee,Food'
    ].join('\n')

    const { data } = await POST('/odata/v4/expenses/importExpenses', {
      bankType: 'GENERIC',
      csv
    })
    expect(data.imported).toBe(2)
    expect(data.skipped).toBe(1)
  })

  it('importExpenses - rejects unknown bankType', async () => {
    await expect(
      POST('/odata/v4/expenses/importExpenses', { bankType: 'UNKNOWN', csv: '' })
    ).rejects.toMatchObject({ response: { status: 400 } })
  })

  it('importExpenses - rejects unimplemented bank parsers', async () => {
    await expect(
      POST('/odata/v4/expenses/importExpenses', { bankType: 'ING', csv: 'some,data' })
    ).rejects.toMatchObject({ response: { status: 400 } })
  })
})
