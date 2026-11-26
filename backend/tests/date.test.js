import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAge } from '../src/utils/date.js';

test('calculateAge counts completed years before and on a birthday', () => {
  const referenceDate = new Date(2026, 10, 11);
  assert.equal(calculateAge(new Date(2000, 10, 12), referenceDate), 25);
  assert.equal(calculateAge(new Date(2000, 10, 11), referenceDate), 26);
});

test('calculateAge handles year boundaries and leap-day birthdays', () => {
  assert.equal(calculateAge(new Date(2000, 11, 31), new Date(2026, 11, 30)), 25);
  assert.equal(calculateAge(new Date(2004, 1, 29), new Date(2025, 1, 28)), 20);
});

test('calculateAge returns null for missing, invalid, or future birth dates', () => {
  const referenceDate = new Date(2026, 10, 11);
  assert.equal(calculateAge(null, referenceDate), null);
  assert.equal(calculateAge('not-a-date', referenceDate), null);
  assert.equal(calculateAge(new Date(2027, 0, 1), referenceDate), null);
});
