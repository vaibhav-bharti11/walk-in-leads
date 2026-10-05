import assert from 'node:assert/strict';
import test from 'node:test';
import * as sheets from '../src/sheets.mjs';

const { leadToSheetRow, syncLeadToGoogleSheets } = sheets;

test('maps visit, table, and source details into Google Sheets rows', () => {
  assert.deepEqual(leadToSheetRow({
    id: 1,
    name: 'Aditi',
    mobile: '9876543210',
    outlet: 'Basque',
    pax: 4,
    visit_date: '2026-10-01',
    table_number: '12',
    lead_source: 'District',
    created_at: '2026-10-01T10:00:00.000Z',
  }), [1, 'Aditi', '9876543210', 'Basque', 4, '2026-10-01', '2026-10-01T10:00:00.000Z', '12', 'District']);
  assert.deepEqual(sheets.SHEET_HEADERS, ['ID', 'Name', 'Mobile', 'Outlet', 'Guests', 'Visit date', 'Timestamp', 'Table', 'Source']);
  assert.equal(sheets.SHEET_VALUE_INPUT_OPTION, 'RAW');
});

test('updates headers only for empty or recognized header rows', () => {
  assert.equal(typeof sheets.shouldWriteSheetHeaders, 'function');
  assert.equal(sheets.shouldWriteSheetHeaders([]), true);
  assert.equal(sheets.shouldWriteSheetHeaders(['ID', 'Name', 'Mobile']), true);
  assert.equal(sheets.shouldWriteSheetHeaders(['1', 'Aditi', '9876543210']), false);
});

test('neutralizes formulas in webhook rows', () => {
  assert.equal(typeof sheets.leadToWebhookRow, 'function');
  const row = sheets.leadToWebhookRow({
    id: 2,
    name: '=IMPORTXML("bad")',
    mobile: '9876543210',
    outlet: 'Kampai',
    pax: 2,
    visit_date: '2026-10-05',
    table_number: '+1',
    lead_source: '@custom',
    created_at: '2026-10-05T10:00:00.000Z',
  });
  assert.equal(row[1], '\'=IMPORTXML("bad")');
  assert.equal(row[7], "'+1");
  assert.equal(row[8], "'@custom");
});

test('syncLeadToGoogleSheets handles unconfigured state gracefully', async () => {
  const result = await syncLeadToGoogleSheets({
    lead: { id: 1, name: 'Test User', mobile: '9876543210', outlet: 'Kampai' },
    config: {},
  });
  assert.equal(result.notConfigured, true);
  assert.equal(result.success, false);
});

test('syncLeadToGoogleSheets sends safe, compatible webhook rows', async () => {
  const originalFetch = globalThis.fetch;
  let receivedPayload;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://example.com/fake-webhook');
    receivedPayload = JSON.parse(options.body);
    return { ok: true };
  };

  try {
    const result = await syncLeadToGoogleSheets({
      lead: {
        id: 1, name: '=Aditi', mobile: '9876543210', outlet: 'Basque', pax: 2,
        visit_date: '2026-10-05', created_at: '2026-10-05T10:00:00.000Z', table_number: '001', lead_source: '@custom',
      },
      config: { googleSheetWebhookUrl: 'https://example.com/fake-webhook' },
    });
    assert.equal(result.success, true);
    assert.deepEqual(receivedPayload.headers, sheets.SHEET_HEADERS);
    assert.equal(receivedPayload.lead.name, "'=Aditi");
    assert.equal(receivedPayload.lead.table_number, "'001");
    assert.equal(receivedPayload.lead.lead_source, "'@custom");
    assert.deepEqual(receivedPayload.rows[0], [1, "'=Aditi", '9876543210', 'Basque', 2, '2026-10-05', '2026-10-05T10:00:00.000Z', "'001", "'@custom"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
