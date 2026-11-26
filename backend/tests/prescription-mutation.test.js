import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPrescriptionMutationAllowed,
  wasPrescriptionCreatedBeforeAssignmentChange,
} from '../src/utils/prescription-mutation.js';

const createdAt = new Date('2026-11-01T10:00:00.000Z');
const transferredAt = new Date('2026-11-02T10:00:00.000Z');

test('pembuat dapat mengubah resep selama pasien masih ditugaskan kepadanya', () => {
  assert.equal(isPrescriptionMutationAllowed({
    createdBy: 'doctor-a', assignedDoctorId: 'doctor-a', userId: 'doctor-a',
    prescriptionAssignmentVersion: 0, currentAssignmentVersion: 0,
  }), true);
});

test('Dokter FKTP A tidak dapat mengubah resep lama setelah pasien berpindah ke B', () => {
  assert.equal(isPrescriptionMutationAllowed({
    createdBy: 'doctor-a', assignedDoctorId: 'doctor-b', userId: 'doctor-a',
    prescriptionAssignmentVersion: 0, currentAssignmentVersion: 1,
  }), false);
});

test('Dokter FKTP B dapat membaca tetapi tidak dapat memutasi resep lama dari A', () => {
  assert.equal(isPrescriptionMutationAllowed({
    createdBy: 'doctor-a', assignedDoctorId: 'doctor-b', userId: 'doctor-b',
    prescriptionAssignmentVersion: 0, currentAssignmentVersion: 1,
  }), false);
});

test('resep lama tetap terkunci jika pasien kemudian dipindahkan kembali ke A', () => {
  assert.equal(isPrescriptionMutationAllowed({
    createdBy: 'doctor-a', assignedDoctorId: 'doctor-a', userId: 'doctor-a',
    prescriptionAssignmentVersion: 0, currentAssignmentVersion: 2,
  }), false);
});

test('Dokter FKTP B dapat memutasi resep baru setelah perpindahan', () => {
  assert.equal(isPrescriptionMutationAllowed({
    createdBy: 'doctor-b', assignedDoctorId: 'doctor-b', userId: 'doctor-b',
    prescriptionAssignmentVersion: 1, currentAssignmentVersion: 1,
  }), true);
});

test('resep lama tanpa snapshot versi memakai waktu catatan perpindahan sebagai fallback', () => {
  assert.equal(wasPrescriptionCreatedBeforeAssignmentChange({
    prescriptionAssignmentVersion: undefined,
    currentAssignmentVersion: undefined,
    prescriptionCreatedAt: createdAt,
    lastAssignmentChangeAt: transferredAt,
  }), true);
});

test('resep lama tanpa snapshot versi tidak terkunci jika dibuat setelah perpindahan', () => {
  assert.equal(wasPrescriptionCreatedBeforeAssignmentChange({
    prescriptionAssignmentVersion: undefined,
    currentAssignmentVersion: undefined,
    prescriptionCreatedAt: transferredAt,
    lastAssignmentChangeAt: createdAt,
  }), false);
});

test('ObjectId-like values dibandingkan berdasarkan _id', () => {
  assert.equal(isPrescriptionMutationAllowed({
    createdBy: { _id: 'doctor-b' },
    assignedDoctorId: { _id: 'doctor-b' },
    userId: { _id: 'doctor-b' },
    prescriptionAssignmentVersion: 3,
    currentAssignmentVersion: 3,
  }), true);
});
