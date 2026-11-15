import assert from 'node:assert/strict';
import test from 'node:test';

import { futureDates, timeSlots, withSeatingPreference } from '../public/reserve-model.js';

test('booking date strip crosses month boundaries without shifting the calendar date', () => {
  assert.deepEqual(
    futureDates('2026-11-29', 4).map(({ value }) => value),
    ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'],
  );
});

test('booking time grid returns half-hour request slots with exact boundaries', () => {
  assert.deepEqual(timeSlots('12:00', '13:30'), ['12:00', '12:30', '13:00', '13:30']);
});

test('seating preference is saved in staff notes without duplicating restaurant choice', () => {
  assert.equal(withSeatingPreference('Quiet area', 'Birthday dinner'), 'Seating preference: Quiet area\nBirthday dinner');
  assert.equal(withSeatingPreference('Restaurant choice', 'Birthday dinner'), 'Birthday dinner');
});
