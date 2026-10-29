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

  // --- ING parser tests ---

  it('importExpenses - ING happy path imports all rows', async () => {
    const csv = fs.readFileSync(
      path.join(__dirname, 'fixtures/ing-sample.csv'), 'utf8'
    )
    const { data } = await POST('/odata/v4/expenses/importExpenses', {
      bankType: 'ING',
      csv
    })
    expect(data.imported).toBe(5)
    expect(data.skipped).toBe(0)
    expect(data.duplicates).toBe(0)
  })

  it('importExpenses - ING converts DD.MM.YYYY date to YYYY-MM-DD', async () => {
    const csv = [
      'Umsatzanzeige;test',
      '',
      'Buchung;Wertstellungsdatum;Auftraggeber/Empfaenger;Buchungstext;Verwendungszweck;Referenz;Saldo;Waehrung;Betrag;Waehrung',
      '23.04.2025;23.04.2025;ING DATE TEST SHOP;Lastschrift;Rechnung April;;500,00;EUR;-42,00;EUR'
    ].join('\n')
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'ING', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'ING DATE TEST SHOP: Rechnung April\'')
    expect(data.value[0].date).toBe('2025-04-23')
  })

  it('importExpenses - ING parses German amount with thousand separator', async () => {
    const csv = [
      'Buchung;Wertstellungsdatum;Auftraggeber/Empfaenger;Buchungstext;Verwendungszweck;Referenz;Saldo;Waehrung;Betrag;Waehrung',
      '05.05.2025;05.05.2025;ING THOUSAND SEP SHOP;Lastschrift;Grosskauf Mai;;0,00;EUR;-1.299,00;EUR'
    ].join('\n')
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'ING', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'ING THOUSAND SEP SHOP: Grosskauf Mai\'')
    expect(data.value[0].amount).toBe(1299)
  })

  it('importExpenses - ING imports credit row with negative amount', async () => {
    const csv = [
      'Buchung;Wertstellungsdatum;Auftraggeber/Empfaenger;Buchungstext;Verwendungszweck;Referenz;Saldo;Waehrung;Betrag;Waehrung',
      '10.05.2025;10.05.2025;ING CREDIT SENDER;Gutschrift;Erstattung Test;;1.000,00;EUR;500,00;EUR'
    ].join('\n')
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'ING', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'ING CREDIT SENDER: Erstattung Test\'')
    expect(data.value[0].amount).toBe(-500)
  })

  it('importExpenses - ING description composition: counterparty + purpose', async () => {
    const csv = [
      'Buchung;Wertstellungsdatum;Auftraggeber/Empfaenger;Buchungstext;Verwendungszweck;Referenz;Saldo;Waehrung;Betrag;Waehrung',
      '12.05.2025;12.05.2025;ING COMPOSE SHOP;Lastschrift;Zweck der Zahlung;;0,00;EUR;-10,00;EUR'
    ].join('\n')
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'ING', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'ING COMPOSE SHOP: Zweck der Zahlung\'')
    expect(data.value).toHaveLength(1)
  })

  it('importExpenses - ING description fallback to counterparty when purpose is empty', async () => {
    const csv = [
      'Buchung;Wertstellungsdatum;Auftraggeber/Empfaenger;Buchungstext;Verwendungszweck;Referenz;Saldo;Waehrung;Betrag;Waehrung',
      '13.05.2025;13.05.2025;ING FALLBACK SENDER;Gutschrift Echtzeitueberweisung;;;0,00;EUR;100,00;EUR'
    ].join('\n')
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'ING', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'ING FALLBACK SENDER\'')
    expect(data.value).toHaveLength(1)
  })

  it('importExpenses - ING missing preamble returns 400 with descriptive message', async () => {
    const csv = 'not-an-ing-file,at,all'
    await expect(
      POST('/odata/v4/expenses/importExpenses', { bankType: 'ING', csv })
    ).rejects.toMatchObject({ response: { status: 400 } })
  })

  it('importExpenses - ING deduplication: re-importing same CSV counts as duplicates', async () => {
    const csv = [
      'Buchung;Wertstellungsdatum;Auftraggeber/Empfaenger;Buchungstext;Verwendungszweck;Referenz;Saldo;Waehrung;Betrag;Waehrung',
      '20.05.2025;20.05.2025;ING DEDUP SHOP;Lastschrift;Dedup Test;;0,00;EUR;-50,00;EUR'
    ].join('\n')
    const first = await POST('/odata/v4/expenses/importExpenses', { bankType: 'ING', csv })
    expect(first.data.imported).toBe(1)
    const second = await POST('/odata/v4/expenses/importExpenses', { bankType: 'ING', csv })
    expect(second.data.imported).toBe(0)
    expect(second.data.duplicates).toBe(1)
  })

  it('importExpenses - ING malformed row (bad date) counted in skipped', async () => {
    const csv = [
      'Buchung;Wertstellungsdatum;Auftraggeber/Empfaenger;Buchungstext;Verwendungszweck;Referenz;Saldo;Waehrung;Betrag;Waehrung',
      'BADDATE;BADDATE;ING MALFORMED SHOP;Lastschrift;Bad date row;;0,00;EUR;-9,99;EUR'
    ].join('\n')
    const { data } = await POST('/odata/v4/expenses/importExpenses', { bankType: 'ING', csv })
    expect(data.skipped).toBe(1)
    expect(data.duplicates).toBe(0)
  })

  // --- SPARKASSE parser tests ---

  const SPARKASSE_HDR = '"Order account";"Day of entry";"Value date";"Posting text";"Purpose";"Creditor ID";"Mandate reference";"Customer reference (End-to-End)";"Collective order reference";"Original direct debit amount";"Reimbursement of expenses for returning a direct debit";"Beneficiary/payer";"Account number / IBAN";"BIC (SWIFT code)";"Amount";"Currency";"Info";"Category"'

  it('importExpenses - SPARKASSE happy path imports all rows', async () => {
    const csv = fs.readFileSync(
      path.join(__dirname, 'fixtures/sparkasse-sample.csv'), 'utf8'
    )
    const { data } = await POST('/odata/v4/expenses/importExpenses', {
      bankType: 'SPARKASSE',
      csv
    })
    expect(data.imported).toBe(5)
    expect(data.skipped).toBe(0)
    expect(data.duplicates).toBe(0)
  })

  it('importExpenses - SPARKASSE converts DD.MM.YY date to YYYY-MM-DD', async () => {
    const csv = [
      SPARKASSE_HDR,
      '"DE00TEST";"28.10.26";"";"KARTENZAHLUNG";"terminal ref";"";"";"";"";"";"";"SPARKASSE DATE MERCHANT";"";"";"-10,00";"EUR";"";""'
    ].join('\n')
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'SPARKASSE', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'SPARKASSE DATE MERCHANT\'')
    expect(data.value[0].date).toBe('2026-10-28')
  })

  it('importExpenses - SPARKASSE debit amount negated to positive', async () => {
    const csv = [
      SPARKASSE_HDR,
      '"DE00TEST";"05.10.26";"";"KARTENZAHLUNG";"terminal ref";"";"";"";"";"";"";"SPARKASSE DEBIT SHOP";"";"";"-33,27";"EUR";"";""'
    ].join('\n')
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'SPARKASSE', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'SPARKASSE DEBIT SHOP\'')
    expect(data.value[0].amount).toBe(33.27)
  })

  it('importExpenses - SPARKASSE credit row stored as negative amount', async () => {
    const csv = [
      SPARKASSE_HDR,
      '"DE00TEST";"10.10.26";"";"ECHTZEIT-GUTSCHRIFT";"SPARKASSE CREDIT PURPOSE";"";"";"";"";"";"";"";"";"";"150,00";"EUR";"";""'
    ].join('\n')
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'SPARKASSE', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'SPARKASSE CREDIT PURPOSE\'')
    expect(data.value[0].amount).toBe(-150)
  })

  it('importExpenses - SPARKASSE description uses beneficiary (col 11) as primary', async () => {
    const csv = [
      SPARKASSE_HDR,
      '"DE00TEST";"12.10.26";"";"KARTENZAHLUNG";"2026-10-12T09:00 Debitk.4 2029-12 ";"";"";"";"";"";"";"SPARKASSE BENEFICIARY NAME";"";"";"-20,00";"EUR";"";""'
    ].join('\n')
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'SPARKASSE', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'SPARKASSE BENEFICIARY NAME\'')
    expect(data.value).toHaveLength(1)
  })

  it('importExpenses - SPARKASSE description falls back to purpose (col 4) when col 11 is empty', async () => {
    const csv = [
      SPARKASSE_HDR,
      '"DE00TEST";"13.10.26";"";"ABSCHLUSS";"SPARKASSE PURPOSE TEXT";"";"";"";"";"";"";"";"";"";"-5,50";"EUR";"";""'
    ].join('\n')
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'SPARKASSE', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'SPARKASSE PURPOSE TEXT\'')
    expect(data.value).toHaveLength(1)
  })

  it('importExpenses - SPARKASSE missing header returns 400 with descriptive message', async () => {
    const csv = 'not-a-sparkasse-file'
    await expect(
      POST('/odata/v4/expenses/importExpenses', { bankType: 'SPARKASSE', csv })
    ).rejects.toMatchObject({ response: { status: 400 } })
  })

  it('importExpenses - SPARKASSE deduplication: re-importing same CSV counts as duplicates', async () => {
    const csv = [
      SPARKASSE_HDR,
      '"DE00TEST";"22.10.26";"";"ECHTZEIT-UEBERWEISUNG";"Miete Test";"";"";"";"";"";"";"SPARKASSE DEDUP SHOP";"";"";"-600,00";"EUR";"";""'
    ].join('\n')
    const first = await POST('/odata/v4/expenses/importExpenses', { bankType: 'SPARKASSE', csv })
    expect(first.data.imported).toBe(1)
    const second = await POST('/odata/v4/expenses/importExpenses', { bankType: 'SPARKASSE', csv })
    expect(second.data.imported).toBe(0)
    expect(second.data.duplicates).toBe(1)
  })

  it('importExpenses - SPARKASSE malformed row (bad date) counted in skipped', async () => {
    const csv = [
      SPARKASSE_HDR,
      '"DE00TEST";"BADDATE";"";"KARTENZAHLUNG";"bad row";"";"";"";"";"";"";"SPARKASSE BAD DATE ROW";"";"";"-7,00";"EUR";"";""'
    ].join('\n')
    const { data } = await POST('/odata/v4/expenses/importExpenses', { bankType: 'SPARKASSE', csv })
    expect(data.skipped).toBe(1)
    expect(data.duplicates).toBe(0)
  })

  // --- TARGOBANK parser tests ---

  it('importExpenses - TARGOBANK happy path imports all rows', async () => {
    const csv = fs.readFileSync(
      path.join(__dirname, 'fixtures/targobank-sample.csv'), 'utf8'
    )
    const { data } = await POST('/odata/v4/expenses/importExpenses', {
      bankType: 'TARGOBANK',
      csv
    })
    expect(data.imported).toBe(5)
    expect(data.skipped).toBe(0)
    expect(data.duplicates).toBe(0)
  })

  it('importExpenses - TARGOBANK converts DD.MM.YYYY date to YYYY-MM-DD', async () => {
    const csv = `13.01.2026;Lastschrift   TARGOBANK DATE MERCHANT   DE00111111111111111101   Test Ref;-10,00;;;;'DE00TEST'`
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'TARGOBANK', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'TARGOBANK DATE MERCHANT\'')
    expect(data.value[0].date).toBe('2026-01-13')
  })

  it('importExpenses - TARGOBANK debit amount (col 2) negated to positive', async () => {
    const csv = `20.01.2026;Kartenzahlung   TARGOBANK DEBIT SHOP   Teststadt 12345678   Kartennummer: 999999XXXXXX000X;-57,24;;;;'DE00TEST'`
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'TARGOBANK', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'TARGOBANK DEBIT SHOP\'')
    expect(data.value[0].amount).toBe(57.24)
  })

  it('importExpenses - TARGOBANK credit amount (col 3) stored as negative', async () => {
    const csv = `29.01.2026;Gutschrift Lohn  Gehalt  Rente   TARGOBANK CREDIT EMPLOYER   PAYROLL 12345/202601;;3165,03;;;'DE00TEST'`
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'TARGOBANK', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'TARGOBANK CREDIT EMPLOYER\'')
    expect(data.value[0].amount).toBe(-3165.03)
  })

  it('importExpenses - TARGOBANK description uses second blob segment (counterparty)', async () => {
    const csv = `15.01.2026;Lastschrift   TARGOBANK BLOB MERCHANT   DE00111111111111111101   Test Purpose;-25,00;;;;'DE00TEST'`
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'TARGOBANK', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'TARGOBANK BLOB MERCHANT\'')
    expect(data.value).toHaveLength(1)
  })

  it('importExpenses - TARGOBANK description falls back to full blob when no 3+ space separator', async () => {
    const csv = `16.01.2026;TARGOBANK FALLBACK DESC;-5,00;;;;'DE00TEST'`
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'TARGOBANK', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'TARGOBANK FALLBACK DESC\'')
    expect(data.value).toHaveLength(1)
  })

  it('importExpenses - TARGOBANK zero-amount row is not imported', async () => {
    const csv = `31.03.2026;Information Zinssaetze   SOLLZINSSAETZE: 13,73% P.A.;;0,00;;;'DE00TEST'`
    const { data } = await POST('/odata/v4/expenses/importExpenses', { bankType: 'TARGOBANK', csv })
    expect(data.imported).toBe(0)
  })

  it('importExpenses - TARGOBANK invalid format returns 400', async () => {
    const csv = 'not-a-targobank-file'
    await expect(
      POST('/odata/v4/expenses/importExpenses', { bankType: 'TARGOBANK', csv })
    ).rejects.toMatchObject({ response: { status: 400 } })
  })

  it('importExpenses - TARGOBANK deduplication: re-importing same CSV counts as duplicates', async () => {
    const csv = `22.01.2026;Lastschrift   TARGOBANK DEDUP SHOP   DE00111111111111111101   Test;-100,00;;;;'DE00TEST'`
    const first = await POST('/odata/v4/expenses/importExpenses', { bankType: 'TARGOBANK', csv })
    expect(first.data.imported).toBe(1)
    const second = await POST('/odata/v4/expenses/importExpenses', { bankType: 'TARGOBANK', csv })
    expect(second.data.imported).toBe(0)
    expect(second.data.duplicates).toBe(1)
  })

  it('importExpenses - TARGOBANK malformed date row counted in skipped', async () => {
    const csv = [
      `13.01.2026;Lastschrift   TARGOBANK SKIP VALID   DE00111111111111111101   Test;-10,00;;;;'DE00TEST'`,
      `BADDATE;Lastschrift   TARGOBANK BAD DATE ROW   DE00111111111111111101   Test;-5,00;;;;'DE00TEST'`
    ].join('\n')
    const { data } = await POST('/odata/v4/expenses/importExpenses', { bankType: 'TARGOBANK', csv })
    expect(data.skipped).toBe(1)
    expect(data.duplicates).toBe(0)
  })
})
