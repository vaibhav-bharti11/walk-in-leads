import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import * as domain from '../src/domain.mjs';

const {
  LEAD_SOURCES,
  OUTLETS,
  createLeadStore,
  escapeCsvCell,
  normalizeLead,
} = domain;

test('normalizes a valid Indian walk-in lead', () => {
  assert.deepEqual(
    normalizeLead({
      name: '  Rohan   Mehta ',
      mobile: '+91 98765-43210',
      outlet: 'Kampai',
      pax: '4',
      visit_date: '2026-10-01',
      table_number: ' T-4 ',
      lead_source: 'District',
    }),
    { name: 'Rohan Mehta', mobile: '9876543210', outlet: 'Kampai', pax: 4, visit_date: '2026-10-01', table_number: 'T-4', lead_source: 'District' },
  );
  assert.deepEqual(LEAD_SOURCES, ['Walk-in', 'District', 'EazyDiner', 'Dineout', 'Custom']);
});

test('normalizes a custom booking source', () => {
  assert.equal(normalizeLead({
    name: 'Aditi Sharma', mobile: '9876543210', outlet: 'Basque', pax: 2,
    visit_date: '2026-10-01', table_number: 'Patio 2', lead_source: 'Custom', custom_source: ' Hotel concierge ',
  }).lead_source, 'Hotel concierge');
});

test('rejects invalid guest input', () => {
  const valid = {
    name: 'Aditi', mobile: '9876543210', outlet: 'Kampai', pax: 2,
    visit_date: '2026-10-01', table_number: '12', lead_source: 'Walk-in',
  };
  const cases = [
    [{ ...valid, name: '' }, 'name'],
    [{ ...valid, name: 'A' }, 'name'],
    [{ ...valid, name: 'A'.repeat(81) }, 'name'],
    [{ ...valid, mobile: '1234' }, 'mobile'],
    [{ ...valid, outlet: 'Unknown' }, 'outlet'],
    [{ ...valid, pax: 0 }, 'pax'],
    [{ ...valid, pax: 51 }, 'pax'],
    [{ ...valid, visit_date: '2026-02-30' }, 'visit_date'],
    [{ ...valid, table_number: '' }, 'table_number'],
    [{ ...valid, table_number: 'T'.repeat(21) }, 'table_number'],
    [{ ...valid, lead_source: 'Instagram' }, 'lead_source'],
    [{ ...valid, lead_source: 'Custom', custom_source: '' }, 'custom_source'],
  ];

  for (const [input, field] of cases) {
    assert.throws(() => normalizeLead(input), (error) => error.field === field);
  }
});

test('stores every visit and lists newest entries with optional outlet filtering', () => {
  const directory = mkdtempSync(join(tmpdir(), 'walkin-domain-'));
  const store = createLeadStore(join(directory, 'leads.db'));

  try {
    store.add({ name: 'Rohan Mehta', mobile: '9876543210', outlet: OUTLETS[0], pax: 2, visit_date: '2026-10-01', table_number: '12', lead_source: 'Walk-in' });
    store.add({ name: 'Aditi Sharma', mobile: '9876543210', outlet: OUTLETS[1], pax: 5, visit_date: '2026-10-02', table_number: 'Patio 2', lead_source: 'EazyDiner' });

    assert.equal(store.count(), 2);
    assert.equal(store.count({ outlet: OUTLETS[0] }), 1);
    assert.deepEqual(store.list().map(({ name }) => name), ['Aditi Sharma', 'Rohan Mehta']);
    assert.deepEqual(store.list({ outlet: OUTLETS[0] }).map(({ outlet }) => outlet), [OUTLETS[0]]);
    assert.deepEqual(store.list().map(({ pax, visit_date }) => ({ pax, visit_date })), [
      { pax: 5, visit_date: '2026-10-02' },
      { pax: 2, visit_date: '2026-10-01' },
    ]);
    assert.deepEqual(store.list().map(({ table_number, lead_source }) => ({ table_number, lead_source })), [
      { table_number: 'Patio 2', lead_source: 'EazyDiner' },
      { table_number: '12', lead_source: 'Walk-in' },
    ]);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('escapes CSV formulas and quotes', () => {
  assert.equal(escapeCsvCell('=IMPORTXML("bad")'), '"\'=IMPORTXML(""bad"")"');
  assert.equal(escapeCsvCell('Aditi, Sharma'), '"Aditi, Sharma"');
  assert.equal(escapeCsvCell('Kampai'), 'Kampai');
});

test('stores production leads in Postgres', async () => {
  assert.equal(typeof domain.createPostgresLeadStore, 'function');

  const queries = [];
  let closed = false;
  class TestPool {
    constructor(options) {
      assert.equal(options.connectionString, 'postgres://example');
    }

    async query(text, values = []) {
      queries.push({ text, values });
      if (text.includes('INSERT INTO leads')) return { rows: [{ id: '7' }] };
      if (text.includes('COUNT(*)')) return { rows: [{ total: '2' }] };
      if (text.includes('SELECT id')) {
        return {
          rows: [{
            id: '7',
            name: 'Aditi Sharma',
            mobile: '9876543210',
            outlet: 'Basque',
            pax: 3,
            visit_date: new Date(2026, 9, 1),
            table_number: 'A-7',
            lead_source: 'Dineout',
            created_at: new Date('2026-09-25T10:00:00.000Z'),
          }],
        };
      }
      return { rows: [] };
    }

    async end() {
      closed = true;
    }
  }

  const store = await domain.createPostgresLeadStore('postgres://example', TestPool);
  assert.deepEqual(
    await store.add({ name: 'Aditi Sharma', mobile: '9876543210', outlet: 'Basque', pax: 3, visit_date: '2026-10-01', table_number: 'A-7', lead_source: 'Dineout' }),
    { id: 7, name: 'Aditi Sharma', mobile: '9876543210', outlet: 'Basque', pax: 3, visit_date: '2026-10-01', table_number: 'A-7', lead_source: 'Dineout' },
  );
  assert.equal(await store.count(), 2);
  assert.deepEqual(await store.list({ outlet: 'Basque' }), [{
    id: 7,
    name: 'Aditi Sharma',
    mobile: '9876543210',
    outlet: 'Basque',
    pax: 3,
    visit_date: '2026-10-01',
    table_number: 'A-7',
    lead_source: 'Dineout',
    created_at: '2026-09-25T10:00:00.000Z',
  }]);
  await store.close();

  assert.match(queries[0].text, /CREATE TABLE IF NOT EXISTS leads/);
  assert.deepEqual(queries.find(({ text }) => text.includes('INSERT INTO leads')).values, ['Aditi Sharma', '9876543210', 'Basque', 3, '2026-10-01', 'A-7', 'Dineout']);
  assert.deepEqual(queries.at(-1).values, ['Basque']);
  assert.equal(closed, true);
});
