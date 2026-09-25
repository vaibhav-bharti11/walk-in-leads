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
    }),
    { name: 'Rohan Mehta', mobile: '9876543210', outlet: 'Kampai' },
  );
});

test('rejects invalid guest input', () => {
  const cases = [
    [{ name: '', mobile: '9876543210', outlet: 'Kampai' }, 'name'],
    [{ name: 'A', mobile: '9876543210', outlet: 'Kampai' }, 'name'],
    [{ name: 'A'.repeat(81), mobile: '9876543210', outlet: 'Kampai' }, 'name'],
    [{ name: 'Aditi', mobile: '1234', outlet: 'Kampai' }, 'mobile'],
    [{ name: 'Aditi', mobile: '9876543210', outlet: 'Unknown' }, 'outlet'],
  ];

  for (const [input, field] of cases) {
    assert.throws(() => normalizeLead(input), (error) => error.field === field);
  }
});

test('stores every visit and lists newest entries with optional outlet filtering', () => {
  const directory = mkdtempSync(join(tmpdir(), 'walkin-domain-'));
  const store = createLeadStore(join(directory, 'leads.db'));

  try {
    store.add({ name: 'Rohan Mehta', mobile: '9876543210', outlet: OUTLETS[0] });
    store.add({ name: 'Aditi Sharma', mobile: '9876543210', outlet: OUTLETS[1] });

    assert.equal(store.count(), 2);
    assert.equal(store.count({ outlet: OUTLETS[0] }), 1);
    assert.deepEqual(store.list().map(({ name }) => name), ['Aditi Sharma', 'Rohan Mehta']);
    assert.deepEqual(store.list({ outlet: OUTLETS[0] }).map(({ outlet }) => outlet), [OUTLETS[0]]);
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
    await store.add({ name: 'Aditi Sharma', mobile: '9876543210', outlet: 'Basque' }),
    { id: 7, name: 'Aditi Sharma', mobile: '9876543210', outlet: 'Basque' },
  );
  assert.equal(await store.count(), 2);
  assert.deepEqual(await store.list({ outlet: 'Basque' }), [{
    id: 7,
    name: 'Aditi Sharma',
    mobile: '9876543210',
    outlet: 'Basque',
    created_at: '2026-09-25T10:00:00.000Z',
  }]);
  await store.close();

  assert.match(queries[0].text, /CREATE TABLE IF NOT EXISTS leads/);
  assert.deepEqual(queries.at(-1).values, ['Basque']);
  assert.equal(closed, true);
});
