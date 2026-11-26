/** Skema master pasien dan identitas yang digunakan pada proses resep. */
import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  nameNormalized: { type: String, required: true, index: true },
  bpjsNumber: { type: String, default: null, trim: true },
  nik: { type: String, default: undefined, trim: true },
  phone: { type: String, required: true, trim: true },
  phoneNormalized: { type: String, index: true },
  dateOfBirth: { type: Date, default: null },
  gender: { type: String, enum: ['Laki-laki', 'Perempuan', ''], default: '' },
  address: { type: String, default: '', trim: true },
  allergyStatus: { type: String, enum: ['Ada alergi', 'Tidak ada alergi', 'Belum diketahui', 'Tidak ada alergi yang diketahui', 'Belum diketahui/belum dikaji', ''], default: '' },
  allergyDetails: { type: String, default: '', trim: true },
  patientType: { type: String, enum: ['Kronis'], default: 'Kronis' },
  assignedDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  assignmentVersion: { type: Number, default: 0, min: 0 },
  assignmentChangedAt: { type: Date, default: null },
  lastSeenAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

patientSchema.index({ bpjsNumber: 1 }, { unique: true, sparse: true });
patientSchema.index({ nik: 1 }, { unique: true, sparse: true });

export const Patient = mongoose.model('Patient', patientSchema);
