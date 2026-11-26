/**
 * Mendefinisikan skema Mongoose dan aturan penyimpanan untuk data ChronicBook, termasuk tipe field, relasi, nilai bawaan, dan batasan yang berlaku.
 */
import { applySoftDelete } from './softDelete.js';
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, unique: true },
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  fileName: { type: String, required: true },
  mimeType: { type: String, default: 'application/pdf' },
  fileSize: { type: Number, required: true, min: 1 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, versionKey: false });

applySoftDelete(schema);

export const ChronicBook = mongoose.model('ChronicBook', schema);
