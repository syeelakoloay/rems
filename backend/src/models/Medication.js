/**
 * Mendefinisikan skema Mongoose dan aturan penyimpanan untuk data Medication, termasuk tipe field, relasi, nilai bawaan, dan batasan yang berlaku.
 */
import { applySoftDelete } from './softDelete.js';
import mongoose from 'mongoose';

const medicationSchema = new mongoose.Schema({
  legacyId: { type: String, unique: true, sparse: true },
  name: { type: String, required: true, trim: true, index: true },
  nameNormalized: { type: String, required: true, index: true },
  distributor: { type: String, default: '-' },
  distributorNormalized: { type: String, required: true, default: '-' },
  unit: { type: String, required: true, default: 'tablet' },
  administrationRoute: { type: String, trim: true, default: '' },
  minStock: { type: Number, min: 0, default: 50 },
  imageFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
  active: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });

applySoftDelete(medicationSchema);

export const Medication = mongoose.model('Medication', medicationSchema);
