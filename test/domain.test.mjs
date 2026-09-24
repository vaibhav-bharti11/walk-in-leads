import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  OUTLETS,
  createLeadStore,
  escapeCsvCell,
  normalizeLead,
} from '../src/domain.mjs';

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
