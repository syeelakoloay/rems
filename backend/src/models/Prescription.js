/** Skema resep, snapshot identitas pasien, data klinis, dan daftar obat. */
import { applySoftDelete } from './softDelete.js';
import mongoose from 'mongoose';
import { PRESCRIPTION_STATUSES } from '../utils/constants.js';

const prescriptionMedicineSchema = new mongoose.Schema({
  medicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medication', required: true },
  medicationName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  unit: { type: String, required: true, trim: true },
  duration: { type: Number, default: 1, min: 1 },
  durationUnit: { type: String, default: 'hari' },
  doseInstruction: { type: String, required: true, trim: true },
  frequency: { type: String, default: '' },
  dose: { type: String, default: '' },
  doseUnit: { type: String, default: '' },
  route: { type: String, default: 'Obat dalam/diminum' },
  shake: { type: String, default: 'Tidak' },
  notes: { type: String, default: '' },
}, { _id: false });

const patientSnapshotSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  bpjsNumber: { type: String, default: '' },
  nik: { type: String, default: '' },
  phone: { type: String, default: '' },
  dateOfBirth: { type: Date, default: null },
  age: { type: Number, default: null },
  gender: { type: String, default: '' },
  address: { type: String, default: '' },
}, { _id: false });

const anthropometrySchema = new mongoose.Schema({
  weight: { type: Number, default: null },
  height: { type: Number, default: null },
  waistCircumference: { type: Number, default: null },
}, { _id: false });

const allergySchema = new mongoose.Schema({
  status: { type: String, default: '' },
  details: { type: String, default: '' },
}, { _id: false });

const soapSchema = new mongoose.Schema({
  subjective: { type: String, default: '' },
  objective: { type: String, default: '' },
  assessment: { type: String, default: '' },
  plan: { type: String, default: '' },
}, { _id: false });

const fktpCheckSchema = new mongoose.Schema({
  status: { type: String, enum: ['not_required', 'not_confirmed', 'manually_confirmed'], default: 'not_required' },
  checkedAt: { type: Date, default: null },
  checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  previousAssignedDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const prescriptionSchema = new mongoose.Schema({
  legacyId: { type: String, unique: true, sparse: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  // Version assignment pasien saat resep dibuat; undefined dipertahankan untuk dokumen lama.
  patientAssignmentVersion: { type: Number, min: 0, default: undefined },
  patientName: { type: String, default: '', trim: true },
  patientPhone: { type: String, default: '', trim: true },
  bpjsNumber: { type: String, default: '', trim: true },
  nik: { type: String, default: '', trim: true },
  patientSnapshot: { type: patientSnapshotSchema, default: () => ({}) },
  fktpCheck: { type: fktpCheckSchema, default: () => ({}) },
  allergy: { type: allergySchema, default: () => ({}) },
  anthropometry: { type: anthropometrySchema, default: () => ({}) },
  soap: { type: soapSchema, default: () => ({}) },
  visitNumber: { type: String, default: '', trim: true },
  visitNumberNormalized: { type: String, default: undefined, trim: true },
  diagnosis: { type: String, required: true, trim: true },
  medications: { type: [prescriptionMedicineSchema], required: true, validate: (v) => Array.isArray(v) && v.length > 0 },
  status: { type: String, enum: PRESCRIPTION_STATUSES, default: 'pending', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  pickedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  notificationSent: { type: Boolean, default: false },
  pickedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

prescriptionSchema.index({ createdBy: 1, createdAt: -1 });
prescriptionSchema.index(
  { visitNumberNormalized: 1 },
  { unique: true, partialFilterExpression: { visitNumberNormalized: { $type: 'string', $gt: '' } } },
);
applySoftDelete(prescriptionSchema);
export const Prescription = mongoose.model('Prescription', prescriptionSchema);
