'use strict'
const cds = require('@sap/cds')
const fs = require('fs')
const path = require('path')

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
    expect(data.duplicates).toBe(0)
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

  // --- AMEX parser tests ---

  it('importExpenses - AMEX happy path imports all rows', async () => {
    const csv = fs.readFileSync(
      path.join(__dirname, 'fixtures/amex-sample.csv'), 'utf8'
    )
    const { data } = await POST('/odata/v4/expenses/importExpenses', {
      bankType: 'AMEX',
      csv
    })
    expect(data.imported).toBe(5)
    expect(data.skipped).toBe(0)
    expect(data.duplicates).toBe(0)
  })

  it('importExpenses - AMEX converts DD/MM/YYYY date to YYYY-MM-DD', async () => {
    const csv = [
      'Datum,Beschreibung,Karteninhaber,Konto #,Betrag',
      '23/03/2025,DATE TEST SHOP,JOHN DOE,-11111,"20,00"'
    ].join('\n')
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'AMEX', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'DATE TEST SHOP\'')
    expect(data.value[0].date).toBe('2025-03-23')
  })

  it('importExpenses - AMEX parses German amount with thousand separator', async () => {
    const csv = [
      'Datum,Beschreibung,Karteninhaber,Konto #,Betrag',
      '05/04/2025,THOUSAND SEP SHOP,JOHN DOE,-11111,"1.299,00"'
    ].join('\n')
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'AMEX', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'THOUSAND SEP SHOP\'')
    expect(data.value[0].amount).toBe(1299)
  })

  it('importExpenses - AMEX imports negative amount payment row as-is', async () => {
    const csv = [
      'Datum,Beschreibung,Karteninhaber,Konto #,Betrag',
      '10/04/2025,PAYMENT RECEIVED TEST,JOHN DOE,-11111,"-750,00"'
    ].join('\n')
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'AMEX', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'PAYMENT RECEIVED TEST\'')
    expect(data.value[0].amount).toBe(-750)
  })

  it('importExpenses - AMEX imports rows for multiple cardholders, discards cardholder name', async () => {
    const csv = [
      'Datum,Beschreibung,Karteninhaber,Konto #,Betrag',
      '01/05/2025,MULTI CARD SHOP A,ALICE SMITH,-11111,"30,00"',
      '01/05/2025,MULTI CARD SHOP B,BOB JONES,-22222,"45,00"'
    ].join('\n')
    const { data } = await POST('/odata/v4/expenses/importExpenses', { bankType: 'AMEX', csv })
    expect(data.imported).toBe(2)
    const { data: expenses } = await GET(
      '/odata/v4/expenses/Expenses?$filter=description eq \'MULTI CARD SHOP A\' or description eq \'MULTI CARD SHOP B\''
    )
    expect(expenses.value).toHaveLength(2)
    expenses.value.forEach(e => {
      expect(e.description).not.toContain('ALICE')
      expect(e.description).not.toContain('BOB')
    })
  })

  // --- Deduplication tests ---

  it('importExpenses - deduplication: re-importing GENERIC CSV counts as duplicates', async () => {
    const csv = [
      'date,amount,description,category',
      '2025-06-01,15.00,Dedup Coffee Test,Food',
      '2025-06-02,20.00,Dedup Lunch Test,Food'
    ].join('\n')

    const first = await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    expect(first.data.imported).toBe(2)

    const second = await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    expect(second.data.imported).toBe(0)
    expect(second.data.duplicates).toBe(2)
  })

  it('importExpenses - deduplication: re-importing AMEX CSV counts as duplicates', async () => {
    const csv = [
      'Datum,Beschreibung,Karteninhaber,Konto #,Betrag',
      '15/06/2025,DEDUP AMEX STORE,JOHN DOE,-11111,"55,00"'
    ].join('\n')

    const first = await POST('/odata/v4/expenses/importExpenses', { bankType: 'AMEX', csv })
    expect(first.data.imported).toBe(1)

    const second = await POST('/odata/v4/expenses/importExpenses', { bankType: 'AMEX', csv })
    expect(second.data.imported).toBe(0)
    expect(second.data.duplicates).toBe(1)
  })

  it('importExpenses - malformed AMEX row counted in skipped, not duplicates', async () => {
    const csv = [
      'Datum,Beschreibung,Karteninhaber,Konto #,Betrag',
      'BADDATE,MALFORMED AMEX ROW,JOHN DOE,-11111,"10,00"'
    ].join('\n')
    const { data } = await POST('/odata/v4/expenses/importExpenses', { bankType: 'AMEX', csv })
    expect(data.skipped).toBe(1)
    expect(data.duplicates).toBe(0)
  })
})
