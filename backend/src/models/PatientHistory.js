/**
 * Mendefinisikan skema Mongoose dan aturan penyimpanan untuk data PatientHistory, termasuk tipe field, relasi, nilai bawaan, dan batasan yang berlaku.
 */
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', default: null },
  type: { type: String, enum: ['ResepDibuat', 'ResepDiubah', 'ResepDihapus', 'ResepDitebus', 'PenugasanDiperbarui'], required: true },
  note: { type: String, default: '' },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  previousAssignedDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  performedByName: { type: String, required: true },
}, { timestamps: true, versionKey: false });

export const PatientHistory = mongoose.model('PatientHistory', schema);
