'use strict'
const cds = require('@sap/cds')
const fs = require('fs')
const path = require('path')

describe('ExpenseService', () => {
  const { GET, POST, PATCH } = cds.test(__dirname + '/..').in(__dirname + '/..')

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

  // --- Classification rule tests ---

  it('classification - matching rule assigns correct category_ID on import', async () => {
    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'RC01 Grocery Rule', pattern: 'RC01_SUPERMARKET', category_ID: 1, priority: 1, active: true
    })
    const csv = 'date,amount,description,category\n2026-02-01,12.00,RC01_SUPERMARKET,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'RC01_SUPERMARKET\'')
    expect(data.value[0].category_ID).toBe(1)
  })

  it('classification - matching rule inserts tags on import', async () => {
    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'RC02 Tag Rule', pattern: 'RC02_SHOP', category_ID: 2, priority: 1, active: true,
      tags: [{ tag: 'shopping' }, { tag: 'online' }]
    })
    const csv = 'date,amount,description,category\n2026-02-02,20.00,RC02_SHOP,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'RC02_SHOP\'&$expand=tags')
    const tags = data.value[0].tags.map(t => t.tag).sort()
    expect(tags).toEqual(['online', 'shopping'])
  })

  it('classification - no matching rule defaults category to Uncategorized and tags empty', async () => {
    const csv = 'date,amount,description,category\n2026-02-03,5.00,RC03_UNMATCHED_XYZ_ZZZZ,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'RC03_UNMATCHED_XYZ_ZZZZ\'&$expand=tags')
    expect(data.value[0].category_ID).toBe(2)
    expect(data.value[0].tags).toHaveLength(0)
  })

  it('classification - lower priority number wins when two rules match', async () => {
    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'RC04 Low Prio', pattern: 'RC04_ITEM', category_ID: 2, priority: 50, active: true
    })
    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'RC04 High Prio', pattern: 'RC04_ITEM', category_ID: 1, priority: 5, active: true
    })
    const csv = 'date,amount,description,category\n2026-02-04,8.00,RC04_ITEM,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'RC04_ITEM\'')
    expect(data.value[0].category_ID).toBe(1)
  })

  it('classification - active:false rule is skipped on import', async () => {
    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'RC05 Inactive Rule', pattern: 'RC05_SHOP', category_ID: 1, priority: 1, active: false
    })
    const csv = 'date,amount,description,category\n2026-02-05,9.00,RC05_SHOP,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'RC05_SHOP\'')
    expect(data.value[0].category_ID).toBe(2)
  })

  it('classification - rule with no category applies tags only; category defaults to Uncategorized', async () => {
    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'RC06 Tag-only Rule', pattern: 'RC06_ITEM', priority: 1, active: true,
      tags: [{ tag: 'misc' }]
    })
    const csv = 'date,amount,description,category\n2026-02-06,3.00,RC06_ITEM,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'RC06_ITEM\'&$expand=tags')
    expect(data.value[0].category_ID).toBe(2)
    expect(data.value[0].tags.map(t => t.tag)).toContain('misc')
  })

  it('classification - rule with no tags applies category only; no tags inserted', async () => {
    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'RC07 Cat-only Rule', pattern: 'RC07_ITEM', category_ID: 4, priority: 1, active: true
    })
    const csv = 'date,amount,description,category\n2026-02-07,11.00,RC07_ITEM,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'RC07_ITEM\'&$expand=tags')
    expect(data.value[0].category_ID).toBe(4)
    expect(data.value[0].tags).toHaveLength(0)
  })

  it('classification - invalid regex in rule is skipped gracefully; import continues', async () => {
    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'RC08 Bad Regex', pattern: '[invalid(regex', category_ID: 1, priority: 1, active: true
    })
    const csv = 'date,amount,description,category\n2026-02-08,7.00,RC08_SAFE_ROW,'
    const { data } = await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    expect(data.imported).toBe(1)
    expect(data.skipped).toBe(0)
  })

  it('reclassifyExpenses(dryRun:false) - updates category and returns correct counts', async () => {
    const csv = 'date,amount,description,category\n2026-03-01,15.00,RC09_RECLASSIFY_TARGET,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const before = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'RC09_RECLASSIFY_TARGET\'')
    expect(before.data.value[0].category_ID).toBe(2)

    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'RC09 Reclassify Rule', pattern: 'RC09_RECLASSIFY_TARGET', category_ID: 3, priority: 1, active: true
    })

    const { data } = await POST('/odata/v4/expenses/reclassifyExpenses', { dryRun: false })
    expect(data.affected).toBeGreaterThanOrEqual(1)
    expect(data.changed).toBeGreaterThanOrEqual(1)
    expect(data.dryRun).toBe(false)

    const after = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'RC09_RECLASSIFY_TARGET\'')
    expect(after.data.value[0].category_ID).toBe(3)
  })

  it('reclassifyExpenses(dryRun:true) - returns counts but does not write changes', async () => {
    const csv = 'date,amount,description,category\n2026-03-02,16.00,RC10_DRYRUN_TARGET,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })

    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'RC10 Dry-run Rule', pattern: 'RC10_DRYRUN_TARGET', category_ID: 3, priority: 1, active: true
    })

    const { data } = await POST('/odata/v4/expenses/reclassifyExpenses', { dryRun: true })
    expect(data.affected).toBeGreaterThanOrEqual(1)
    expect(data.changed).toBeGreaterThanOrEqual(1)
    expect(data.dryRun).toBe(true)

    const after = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'RC10_DRYRUN_TARGET\'')
    expect(after.data.value[0].category_ID).toBe(2)
  })

  it('reclassifyExpenses - already-classified expense counts as affected but not changed', async () => {
    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'RC11 Idempotent Rule', pattern: 'RC11_ALREADY_SET', category_ID: 1, priority: 1, active: true
    })
    const csv = 'date,amount,description,category\n2026-03-03,17.00,RC11_ALREADY_SET,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })

    // expense now has category_ID: 1 from the rule; reclassify should see no change
    const { data } = await POST('/odata/v4/expenses/reclassifyExpenses', { dryRun: true })
    // affected >= 1 (this expense matched), but RC11 expense is not changed (already correct)
    expect(data.dryRun).toBe(true)
    // verify specifically: import the same description twice to isolate
    const after = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'RC11_ALREADY_SET\'')
    expect(after.data.value[0].category_ID).toBe(1)
  })

  // --- ignored flag tests ---

  it('ignored - imported expense has ignored = false by default', async () => {
    const csv = 'date,amount,description,category\n2026-04-01,50.00,IG01_DEFAULT_IGNORED,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'IG01_DEFAULT_IGNORED\'')
    expect(data.value[0].ignored).toBe(false)
  })

  it('ignored - PATCH ignored = true persists', async () => {
    const csv = 'date,amount,description,category\n2026-04-02,60.00,IG02_PATCH_TRUE,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const { data: before } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'IG02_PATCH_TRUE\'')
    const id = before.value[0].ID
    await PATCH(`/odata/v4/expenses/Expenses(${id})`, { ignored: true })
    const { data: after } = await GET(`/odata/v4/expenses/Expenses(${id})`)
    expect(after.ignored).toBe(true)
  })

  it('ignored - reclassifyExpenses does not update an ignored expense', async () => {
    // import first (no rule yet → category defaults to Uncategorized)
    const csv = 'date,amount,description,category\n2026-04-03,70.00,IG03_IGNORED_TARGET,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const { data: imported } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'IG03_IGNORED_TARGET\'')
    const id = imported.value[0].ID
    expect(imported.value[0].category_ID).toBe(2)
    // mark as ignored
    await PATCH(`/odata/v4/expenses/Expenses(${id})`, { ignored: true })
    // now add a rule that would match
    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'IG03 Rule', pattern: 'IG03_IGNORED_TARGET', category_ID: 1, priority: 1, active: true
    })
    // reclassify — rule matches but expense is ignored, so no change
    await POST('/odata/v4/expenses/reclassifyExpenses', { dryRun: false })
    const { data: after } = await GET(`/odata/v4/expenses/Expenses(${id})`)
    expect(after.category_ID).toBe(2)
    expect(after.ignored).toBe(true)
  })

  it('reclassifyExpenses - expense matching no rule is not affected and not changed', async () => {
    const csv = 'date,amount,description,category\n2026-03-04,18.00,RC12_NO_RULE_MATCH_ZZZZ,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })

    const before = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'RC12_NO_RULE_MATCH_ZZZZ\'')
    expect(before.data.value[0].category_ID).toBe(2)

    const { data } = await POST('/odata/v4/expenses/reclassifyExpenses', { dryRun: false })
    expect(data.dryRun).toBe(false)

    const after = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'RC12_NO_RULE_MATCH_ZZZZ\'')
    expect(after.data.value[0].category_ID).toBe(2)
  })

  // --- syncNow action (toolbar button) ---

  it('syncNow - reclassifies matching expenses and returns counts', async () => {
    const csv = 'date,amount,description,category\n2026-05-01,21.00,SYNC01_TARGET,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const before = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'SYNC01_TARGET\'')
    expect(before.data.value[0].category_ID).toBe(2)

    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'SYNC01 Rule', pattern: 'SYNC01_TARGET', category_ID: 4, priority: 1, active: true
    })

    const { data } = await POST('/odata/v4/expenses/syncNow', {})
    expect(data.affected).toBeGreaterThanOrEqual(1)
    expect(data.changed).toBeGreaterThanOrEqual(1)

    const after = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'SYNC01_TARGET\'')
    expect(after.data.value[0].category_ID).toBe(4)
  })

  it('syncNow - does not update an ignored expense', async () => {
    const csv = 'date,amount,description,category\n2026-05-02,22.00,SYNC02_IGNORED,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const { data: imported } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'SYNC02_IGNORED\'')
    const id = imported.value[0].ID
    await PATCH(`/odata/v4/expenses/Expenses(${id})`, { ignored: true })

    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'SYNC02 Rule', pattern: 'SYNC02_IGNORED', category_ID: 1, priority: 1, active: true
    })

    await POST('/odata/v4/expenses/syncNow', {})
    const { data: after } = await GET(`/odata/v4/expenses/Expenses(${id})`)
    expect(after.category_ID).toBe(2)
    expect(after.ignored).toBe(true)
  })

  // --- setIgnored rules ---

  it('setIgnored - import with a setIgnored rule stamps ignored=true', async () => {
    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'SI01 Ignore Rule', pattern: 'SI01_SALARY', category_ID: 2, priority: 1, active: true, setIgnored: true
    })
    const csv = 'date,amount,description,category\n2026-06-01,-3000.00,SI01_SALARY,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'SI01_SALARY\'')
    expect(data.value[0].ignored).toBe(true)
  })

  it('setIgnored - import without setIgnored rule keeps ignored=false', async () => {
    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'SI02 Plain Rule', pattern: 'SI02_SHOP', category_ID: 1, priority: 1, active: true, setIgnored: false
    })
    const csv = 'date,amount,description,category\n2026-06-02,15.00,SI02_SHOP,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const { data } = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'SI02_SHOP\'')
    expect(data.value[0].ignored).toBe(false)
    expect(data.value[0].category_ID).toBe(1)
  })

  it('setIgnored - syncNow sets ignored=true on a matching non-ignored expense', async () => {
    const csv = 'date,amount,description,category\n2026-06-03,-500.00,SI03_TRANSFER,'
    await POST('/odata/v4/expenses/importExpenses', { bankType: 'GENERIC', csv })
    const before = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'SI03_TRANSFER\'')
    expect(before.data.value[0].ignored).toBe(false)

    await POST('/odata/v4/expenses/ClassificationRules', {
      name: 'SI03 Ignore Rule', pattern: 'SI03_TRANSFER', category_ID: 2, priority: 1, active: true, setIgnored: true
    })

    const { data } = await POST('/odata/v4/expenses/syncNow', {})
    expect(data.changed).toBeGreaterThanOrEqual(1)

    const after = await GET('/odata/v4/expenses/Expenses?$filter=description eq \'SI03_TRANSFER\'')
    expect(after.data.value[0].ignored).toBe(true)
  })
})
