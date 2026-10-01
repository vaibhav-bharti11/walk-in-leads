import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import * as domain from '../src/domain.mjs';

const {
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
    }),
    { name: 'Rohan Mehta', mobile: '9876543210', outlet: 'Kampai', pax: 4, visit_date: '2026-10-01' },
  );
});

test('rejects invalid guest input', () => {
  const cases = [
    [{ name: '', mobile: '9876543210', outlet: 'Kampai', pax: 2, visit_date: '2026-10-01' }, 'name'],
    [{ name: 'A', mobile: '9876543210', outlet: 'Kampai', pax: 2, visit_date: '2026-10-01' }, 'name'],
    [{ name: 'A'.repeat(81), mobile: '9876543210', outlet: 'Kampai', pax: 2, visit_date: '2026-10-01' }, 'name'],
    [{ name: 'Aditi', mobile: '1234', outlet: 'Kampai', pax: 2, visit_date: '2026-10-01' }, 'mobile'],
    [{ name: 'Aditi', mobile: '9876543210', outlet: 'Unknown', pax: 2, visit_date: '2026-10-01' }, 'outlet'],
    [{ name: 'Aditi', mobile: '9876543210', outlet: 'Kampai', pax: 0, visit_date: '2026-10-01' }, 'pax'],
    [{ name: 'Aditi', mobile: '9876543210', outlet: 'Kampai', pax: 51, visit_date: '2026-10-01' }, 'pax'],
    [{ name: 'Aditi', mobile: '9876543210', outlet: 'Kampai', pax: 2, visit_date: '2026-02-30' }, 'visit_date'],
  ];

  for (const [input, field] of cases) {
    assert.throws(() => normalizeLead(input), (error) => error.field === field);
  }
});

test('stores every visit and lists newest entries with optional outlet filtering', () => {
  const directory = mkdtempSync(join(tmpdir(), 'walkin-domain-'));
  const store = createLeadStore(join(directory, 'leads.db'));

  try {
    store.add({ name: 'Rohan Mehta', mobile: '9876543210', outlet: OUTLETS[0], pax: 2, visit_date: '2026-10-01' });
    store.add({ name: 'Aditi Sharma', mobile: '9876543210', outlet: OUTLETS[1], pax: 5, visit_date: '2026-10-02' });

    assert.equal(store.count(), 2);
    assert.equal(store.count({ outlet: OUTLETS[0] }), 1);
    assert.deepEqual(store.list().map(({ name }) => name), ['Aditi Sharma', 'Rohan Mehta']);
    assert.deepEqual(store.list({ outlet: OUTLETS[0] }).map(({ outlet }) => outlet), [OUTLETS[0]]);
    assert.deepEqual(store.list().map(({ pax, visit_date }) => ({ pax, visit_date })), [
      { pax: 5, visit_date: '2026-10-02' },
      { pax: 2, visit_date: '2026-10-01' },
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
    await store.add({ name: 'Aditi Sharma', mobile: '9876543210', outlet: 'Basque', pax: 3, visit_date: '2026-10-01' }),
    { id: 7, name: 'Aditi Sharma', mobile: '9876543210', outlet: 'Basque', pax: 3, visit_date: '2026-10-01' },
  );
  assert.equal(await store.count(), 2);
  assert.deepEqual(await store.list({ outlet: 'Basque' }), [{
    id: 7,
    name: 'Aditi Sharma',
    mobile: '9876543210',
    outlet: 'Basque',
    pax: 3,
    visit_date: '2026-10-01',
    created_at: '2026-09-25T10:00:00.000Z',
  }]);
  await store.close();

  assert.match(queries[0].text, /CREATE TABLE IF NOT EXISTS leads/);
  assert.deepEqual(queries.find(({ text }) => text.includes('INSERT INTO leads')).values, ['Aditi Sharma', '9876543210', 'Basque', 3, '2026-10-01']);
  assert.deepEqual(queries.at(-1).values, ['Basque']);
  assert.equal(closed, true);
});
