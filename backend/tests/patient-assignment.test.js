import test from 'node:test';
import assert from 'node:assert/strict';
import { requiresPatientFktpConfirmation } from '../src/utils/patient-assignment.js';

test('pasien yang belum memiliki penugasan tidak memerlukan modal konfirmasi FKTP', () => {
  assert.equal(requiresPatientFktpConfirmation({ assignedDoctorId: null, userId: 'doctor-b' }), false);
});

test('dokter yang sama dengan penugasan pasien dapat mengambil data sebelumnya tanpa modal', () => {
  assert.equal(requiresPatientFktpConfirmation({ assignedDoctorId: 'doctor-b', userId: 'doctor-b' }), false);
});

test('dokter yang berbeda wajib mengonfirmasi perpindahan FKTP sebelum data klinis dapat diakses', () => {
  assert.equal(requiresPatientFktpConfirmation({ assignedDoctorId: 'doctor-a', userId: 'doctor-b' }), true);
});

test('pemeriksaan penugasan mendukung nilai ObjectId-like', () => {
  assert.equal(requiresPatientFktpConfirmation({
    assignedDoctorId: { _id: 'doctor-a' },
    userId: { _id: 'doctor-b' },
  }), true);
});
