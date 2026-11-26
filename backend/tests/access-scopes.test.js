import test from 'node:test';
import assert from 'node:assert/strict';
import { getPatientReadFilter, getPrescriptionReadFilter } from '../src/utils/access-scopes.js';

test('Dokter FKTP hanya menerima pasien yang ditugaskan kepadanya', () => {
  const userId = 'doctor-a';
  assert.deepEqual(getPatientReadFilter({ role: 'doctor', userId }), { assignedDoctorId: userId });
});

test('Apoteker dapat membaca seluruh data pasien untuk pelayanan', () => {
  assert.deepEqual(getPatientReadFilter({ role: 'pharmacy', userId: 'pharmacist-1' }), {});
});

test('Dokter FKTP dapat membaca seluruh resep milik pasien yang saat ini ditugaskan kepadanya', () => {
  const patientIds = ['patient-a', 'patient-b'];
  assert.deepEqual(getPrescriptionReadFilter({ role: 'doctor', patientIds }), { patientId: { $in: patientIds } });
});

test('Apoteker dapat membaca seluruh resep untuk pelayanan', () => {
  assert.deepEqual(getPrescriptionReadFilter({ role: 'pharmacy', userId: 'pharmacist-1' }), {});
});
