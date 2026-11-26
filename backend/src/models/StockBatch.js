/**
 * Mendefinisikan skema Mongoose dan aturan penyimpanan untuk data StockBatch, termasuk tipe field, relasi, nilai bawaan, dan batasan yang berlaku.
 */
import { applySoftDelete } from './softDelete.js';
import mongoose from 'mongoose';
import { normalizeBatchNumber } from '../utils/stock-identifiers.js';

const stockBatchSchema = new mongoose.Schema({
  medicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medication', required: true, index: true },
  batchNumber: { type: String, required: true, trim: true },
  batchNumberNormalized: { type: String, required: true, trim: true },
  // 1 = validated under the current identity rule; 0 = legacy conflict awaiting reconciliation.
  batchIdentityVersion: { type: Number, default: 1, enum: [0, 1] },
  expiryDate: { type: Date, default: null, index: true },
  quantity: { type: Number, required: true, min: 0 },
  receivedAt: { type: Date, required: true, default: Date.now, index: true },
}, { timestamps: true, versionKey: false });

stockBatchSchema.index(
  { medicationId: 1, batchNumberNormalized: 1 },
  { unique: true, name: 'medication_batch_identity_unique', partialFilterExpression: { batchIdentityVersion: 1 } },
);

stockBatchSchema.pre('validate', function normalizeBatchIdentity(next) {
  if (this.batchNumber) {
    this.batchNumber = String(this.batchNumber).trim();
    this.batchNumberNormalized = normalizeBatchNumber(this.batchNumber);
  }
  next();
});
applySoftDelete(stockBatchSchema);

export const StockBatch = mongoose.model('StockBatch', stockBatchSchema);
