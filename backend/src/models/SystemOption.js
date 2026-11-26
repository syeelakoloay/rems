/**
 * Mendefinisikan skema Mongoose dan aturan penyimpanan untuk data SystemOption, termasuk tipe field, relasi, nilai bawaan, dan batasan yang berlaku.
 */
import { applySoftDelete } from './softDelete.js';
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  type: { type: String, enum: ['dose'], required: true, index: true },
  value: { type: String, required: true, trim: true },
  normalizedValue: { type: String, required: true, index: true },
  // Dose options are scoped to the dosage unit and administration route.
  // Empty values preserve legacy/global dose options.
  unit: { type: String, trim: true, default: '' },
  route: { type: String, trim: true, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, versionKey: false });

schema.index({ type: 1, normalizedValue: 1 }, { unique: true });
applySoftDelete(schema);

export const SystemOption = mongoose.model('SystemOption', schema);
