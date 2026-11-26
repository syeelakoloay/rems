import test from 'node:test';
import assert from 'node:assert/strict';
import { capitalizeFirstLetter } from '../src/lib/text.js';
import {
  getPrescriptionRedemptionTime,
  formatPrescriptionRedemptionTime,
  getNextPickupDate,
} from '../src/lib/prescriptions.js';
import {
  getStockCardTone,
  getNearestExpiryLabel,
  normalizeMedicationSearchText,
  medicationNameSimilarity,
  isSimilarMedicationName,
} from '../src/lib/stock.js';
import { normalizeBpjs, normalizeNik } from '../src/lib/patients.js';
import { calculateAgeFromDateOfBirth } from '../src/lib/date.js';
import { getLatestPrescriptionForPatient } from '../src/lib/prescriptions.js';

test('capitalizeFirstLetter trims text and preserves the empty-value fallback', () => {
  assert.equal(capitalizeFirstLetter('  tablet '), 'Tablet');
  assert.equal(capitalizeFirstLetter(''), '-');
  assert.equal(capitalizeFirstLetter(null), '-');
});

test('getPrescriptionRedemptionTime supports current and historical timestamp fields', () => {
  const timestamp = '2026-11-11T00:00:00.000Z';
  assert.equal(getPrescriptionRedemptionTime({ pickedAt: timestamp }), timestamp);
  assert.equal(getPrescriptionRedemptionTime({ redeemedAt: timestamp }), timestamp);
  assert.equal(getPrescriptionRedemptionTime({ dispensedAt: timestamp }), timestamp);
  assert.equal(getPrescriptionRedemptionTime({ verifiedAt: timestamp }), timestamp);
  assert.equal(getPrescriptionRedemptionTime({}), null);
});

test('formatPrescriptionRedemptionTime handles valid and missing timestamps', () => {
  const formatted = formatPrescriptionRedemptionTime({ pickedAt: '2026-11-11T00:00:00.000Z' });
  assert.match(formatted, /11 November 2026/);
  assert.match(formatted, /WITA$/);
  assert.equal(formatPrescriptionRedemptionTime({ pickedAt: 'invalid-date' }), '-');
  assert.equal(formatPrescriptionRedemptionTime({}), '-');
});

test('getStockCardTone respects empty, minimum, above-minimum, and custom thresholds', () => {
  assert.equal(getStockCardTone({ qty: 0 }), 'danger');
  assert.equal(getStockCardTone({ qty: 50 }), 'warning');
  assert.equal(getStockCardTone({ qty: 51 }), 'success');
  assert.equal(getStockCardTone({ qty: 10, minStock: 10 }), 'warning');
  assert.equal(getStockCardTone({ qty: 11, minStock: 10 }), 'success');
});


test('getNextPickupDate adds 30 calendar days after redemption', () => {
  const nextDate = getNextPickupDate({ pickedAt: '2026-11-11T00:00:00+08:00' });
  assert.match(nextDate, /11 Desember 2026/);
  assert.equal(getNextPickupDate({}), '-');
  assert.equal(getNextPickupDate({ pickedAt: 'invalid-date' }), '-');
});

test('getNearestExpiryLabel selects the nearest batch that still has stock', () => {
  const label = getNearestExpiryLabel({
    batches: [
      { qty: 0, expiryDate: '2026-11-01' },
      { qty: 4, expiryDate: '2026-12-20' },
      { qty: 2, expiryDate: '2026-12-05' },
    ],
  });
  assert.match(label, /5 Desember 2026/);
  assert.equal(getNearestExpiryLabel({}), '-');
});

test('patient identifier normalizers remove non-digit separators consistently', () => {
  assert.equal(normalizeBpjs('12.345-678 901 23'), '1234567890123');
  assert.equal(normalizeNik('12.345-678 901 234 56'), '1234567890123456');
  assert.equal(normalizeBpjs(''), '');
  assert.equal(normalizeNik(null), '');
});

test('calculateAgeFromDateOfBirth counts completed years and rejects invalid or future dates', () => {
  const referenceDate = new Date(2026, 10, 11);
  assert.equal(calculateAgeFromDateOfBirth('2000-11-12', referenceDate), 25);
  assert.equal(calculateAgeFromDateOfBirth('2000-11-11', referenceDate), 26);
  assert.equal(calculateAgeFromDateOfBirth('not-a-date', referenceDate), '');
  assert.equal(calculateAgeFromDateOfBirth('2027-01-01', referenceDate), '');
  assert.equal(calculateAgeFromDateOfBirth('', referenceDate), '');
});

test('getLatestPrescriptionForPatient returns the newest matching prescription without mutating source data', () => {
  const prescriptions = [
    { id: 'older', patientId: 'patient-1', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'other', patientId: 'patient-2', createdAt: '2026-11-01T00:00:00.000Z' },
    { id: 'newer', patientId: 'patient-1', createdAt: '2026-02-01T00:00:00.000Z' },
  ];

  assert.equal(getLatestPrescriptionForPatient(prescriptions, 'patient-1')?.id, 'newer');
  assert.deepEqual(prescriptions.map((item) => item.id), ['older', 'other', 'newer']);
  assert.equal(getLatestPrescriptionForPatient([], 'patient-1'), null);
  assert.equal(getLatestPrescriptionForPatient(prescriptions, ''), null);
});


test('medication typo matching handles minor typos without conflating different strengths', () => {
  assert.equal(normalizeMedicationSearchText('Paracetamol 500 mg'), 'paracetamol500mg');
  assert.ok(medicationNameSimilarity('Paracetamol500m', 'Paracetamol500mg') > 0.9);
  assert.equal(isSimilarMedicationName('Paracetamol 500m', 'Paracetamol 500 mg'), true);
  assert.equal(isSimilarMedicationName('PARACETAMOL 500 MG', 'Paracetamol 500 mg'), true);
  assert.equal(isSimilarMedicationName('Amlodipine 5 mg', 'Amlodipine 10 mg'), false);
  assert.equal(isSimilarMedicationName('Metformin', 'Amlodipine'), false);
});
