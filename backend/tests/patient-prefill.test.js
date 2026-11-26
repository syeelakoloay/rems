import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPatientPrescriptionPrefill } from '../src/utils/patient-prefill.js';
import { isRegisteredPatientIdentityMatch } from '../src/utils/patient-identifiers.js';

const patient = {
  _id: 'patient-1',
  name: 'Nama Master',
  bpjsNumber: '0000000000001',
  nik: '0000000000000001',
  phone: '08123456789',
  dateOfBirth: new Date('1980-01-01T00:00:00.000Z'),
  gender: 'Laki-laki',
  address: 'Alamat Master',
  assignedDoctorId: 'doctor-a',
};

const latestPrescription = {
  _id: 'prescription-1',
  createdBy: 'doctor-a',
  status: 'pending',
  createdAt: new Date('2026-11-15T01:00:00.000Z'),
  patientName: 'Nama dari Resep',
  patientPhone: '08111111111',
  bpjsNumber: '0000000000002',
  nik: '0000000000000002',
  patientSnapshot: {
    name: 'Nama dari Resep',
    bpjsNumber: '0000000000002',
    nik: '0000000000000002',
    phone: '08111111111',
    dateOfBirth: new Date('1981-02-02T00:00:00.000Z'),
    gender: 'Perempuan',
    address: 'Alamat dari Resep',
  },
  allergy: { status: 'Ada alergi', details: 'Alergi obat tertentu' },
  anthropometry: { weight: 50, height: 160, waistCircumference: 70 },
  soap: { subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' },
  diagnosis: 'Diagnosis terakhir',
  medications: [{
    medicationId: 'medication-1', medicationName: 'Obat A', quantity: 30, unit: 'Tablet',
    duration: 30, durationUnit: 'Hari', doseInstruction: '1 kali sehari 1 tablet',
    frequency: '1 kali sehari', dose: '1', doseUnit: 'tablet', route: 'Oral', shake: 'Tidak', notes: 'Catatan',
  }],
};

test('dokter yang membuat resep terakhir menerima data pasien dan data resep lengkap', () => {
  const result = buildPatientPrescriptionPrefill({ patient, latestPrescription });
  assert.equal(result.patient.name, 'Nama dari Resep');
  assert.equal(result.patient.bpjsNumber, '0000000000002');
  assert.equal(result.prescription.allergy.status, 'Ada alergi');
  assert.equal(result.prescription.diagnosis, 'Diagnosis terakhir');
  assert.equal(result.prescription.meds[0].med, 'Obat A');
});

test('setelah gerbang konfirmasi mengizinkan akses, dokter lain dapat menggunakan seluruh data resep terakhir untuk mengisi formulir', () => {
  const result = buildPatientPrescriptionPrefill({ patient, latestPrescription });
  assert.equal(result.patient.name, 'Nama dari Resep');
  assert.equal(result.patient.bpjsNumber, '0000000000002');
  assert.equal(result.patient.nik, '0000000000000002');
  assert.equal(result.patient.dateOfBirth.toISOString(), '1981-02-02T00:00:00.000Z');
  assert.equal(result.patient.gender, 'Perempuan');
  assert.equal(result.patient.phone, '08111111111');
  assert.equal(result.patient.address, 'Alamat dari Resep');
  assert.equal(result.prescription.allergy.status, 'Ada alergi');
  assert.equal(result.prescription.anthropometry.weight, 50);
  assert.equal(result.prescription.soap.subjective, 'S');
  assert.equal(result.prescription.diagnosis, 'Diagnosis terakhir');
  assert.equal(result.prescription.meds[0].medicationId, 'medication-1');
  assert.equal(result.prescription.meds[0].doseInstruction, '1 kali sehari 1 tablet');
});

test('pasien tanpa resep tetap menerima data identitas master dan tidak menerima data klinis', () => {
  const result = buildPatientPrescriptionPrefill({ patient, latestPrescription: null });
  assert.equal(result.patient.name, 'Nama Master');
  assert.equal(result.latestPrescription, null);
  assert.equal(result.prescription, null);
});


test('status terdaftar hanya true jika satu data master cocok dengan seluruh identitas yang diinput', () => {
  const matches = [{ bpjsNumber: '1234567890123', nik: '1234567890123456' }];
  assert.equal(isRegisteredPatientIdentityMatch(matches, '1234567890123', '1234567890123456'), true);
  assert.equal(isRegisteredPatientIdentityMatch(matches, '1234567890123', ''), true);
  assert.equal(isRegisteredPatientIdentityMatch(matches, '', '1234567890123456'), true);
  assert.equal(isRegisteredPatientIdentityMatch(matches, '1234567890123', '9999999999999999'), false);
  assert.equal(isRegisteredPatientIdentityMatch([], '1234567890123', ''), false);
  assert.equal(isRegisteredPatientIdentityMatch([
    ...matches,
    { bpjsNumber: '9999999999999', nik: '9999999999999999' },
  ], '1234567890123', '9999999999999999'), false);
});
