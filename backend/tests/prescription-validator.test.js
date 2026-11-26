import test from 'node:test';
import assert from 'node:assert/strict';
import { updatePrescriptionSchema, createPrescriptionSchema } from '../src/validators/prescription.validator.js';

const validCorrection = {
  diagnosis: 'Hipertensi',
  meds: [{ medicationId: '64b000000000000000000001', med: 'Amlodipine', q: 10, u: 'tablet', doseInstruction: '1 kali sehari 1 tablet' }],
};

test('prescription correction accepts diagnosis and medication fields', () => {
  const result = updatePrescriptionSchema.parse(validCorrection);
  assert.equal(result.diagnosis, validCorrection.diagnosis);
  assert.equal(result.meds[0].med, validCorrection.meds[0].med);
  assert.equal(result.meds[0].medicationId, validCorrection.meds[0].medicationId);
  assert.equal(result.meds[0].dn, 1);
  assert.equal(result.meds[0].du, 'hari');
});

test('prescription correction rejects BPJS and NIK changes', () => {
  assert.throws(() => updatePrescriptionSchema.parse({
    ...validCorrection,
    bpjsNumber: '1234567890123',
    nik: '1234567890123456',
  }));
});


test('prescription correction requires a valid master medication ID', () => {
  assert.throws(() => updatePrescriptionSchema.parse({
    ...validCorrection,
    meds: [{ ...validCorrection.meds[0], medicationId: '' }],
  }));
  assert.throws(() => updatePrescriptionSchema.parse({
    ...validCorrection,
    meds: [{ ...validCorrection.meds[0], medicationId: 'not-an-object-id' }],
  }));
});


const validCreate = {
  patientName: 'Nama Pasien', patientPhone: '08123456789', patientType: 'Kronis',
  bpjsNumber: '1234567890123', nik: '1234567890123456', dateOfBirth: '1980-01-01',
  gender: 'Laki-laki', address: 'Alamat',
  allergy: { status: 'Belum diketahui', details: '' },
  visitNumber: 'VISIT-001', diagnosis: 'Hipertensi',
  meds: [{ medicationId: '64b000000000000000000001', med: 'Amlodipine', q: 30, u: 'tablet', doseInstruction: '1 kali sehari 1 tablet' }],
};

test('pembuatan resep tidak lagi menggunakan field confirmFktpCheck pada payload', () => {
  const result = createPrescriptionSchema.parse({ ...validCreate, confirmFktpCheck: true });
  assert.equal(Object.hasOwn(result, 'confirmFktpCheck'), false);
});
