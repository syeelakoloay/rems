import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSameDay,
  isWithinLastSevenCalendarDays,
  isSameMonth,
  isSameYear,
} from '../src/lib/date.js';

const referenceDate = '2026-11-16T03:53:00.000Z'; // 16 Nov 2026, 11:53 WITA

test('KPI mingguan menghitung tiga resep tanggal 12 dan 15 November sebagai tujuh hari terakhir', () => {
  const prescriptions = [
    '2026-11-15T04:00:00.000Z',
    '2026-11-15T08:00:00.000Z',
    '2026-11-12T04:00:00.000Z',
  ];

  assert.equal(prescriptions.filter((date) => isWithinLastSevenCalendarDays(date, referenceDate)).length, 3);
  assert.equal(prescriptions.filter((date) => isSameDay(date, referenceDate)).length, 0);
  assert.equal(prescriptions.filter((date) => isSameMonth(date, referenceDate)).length, 3);
  assert.equal(prescriptions.filter((date) => isSameYear(date, referenceDate)).length, 3);
});

test('Awal hari WITA dihitung sebagai hari yang sama meskipun tanggal UTC masih hari sebelumnya', () => {
  const beforeMidnightWita = '2026-11-15T16:00:00.000Z';
  const afterMidnightWita = '2026-11-15T17:00:00.000Z';
  assert.equal(isSameDay(beforeMidnightWita, afterMidnightWita), true);
});

test('Batas tujuh hari kalender terakhir dihitung inklusif, sedangkan tanggal di luarnya tidak', () => {
  assert.equal(isWithinLastSevenCalendarDays('2026-11-08T16:00:00.000Z', referenceDate), false);
  assert.equal(isWithinLastSevenCalendarDays('2026-11-10T16:00:00.000Z', referenceDate), true);
});

test('Tanggal tidak valid atau kosong tidak dihitung pada KPI', () => {
  for (const invalidDate of ['', null, 'tanggal-tidak-valid']) {
    assert.equal(isSameDay(invalidDate, referenceDate), false);
    assert.equal(isWithinLastSevenCalendarDays(invalidDate, referenceDate), false);
    assert.equal(isSameMonth(invalidDate, referenceDate), false);
    assert.equal(isSameYear(invalidDate, referenceDate), false);
  }
});
