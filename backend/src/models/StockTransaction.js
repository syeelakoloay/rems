/**
 * Mendefinisikan skema Mongoose dan aturan penyimpanan untuk data StockTransaction, termasuk tipe field, relasi, nilai bawaan, dan batasan yang berlaku.
 */
import mongoose from 'mongoose';
import { applySoftDelete } from './softDelete.js';

const stockTransactionSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true },
  medicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medication', required: true, index: true },
  type: { type: String, enum: ['in', 'out'], required: true },
  quantity: { type: Number, required: true, min: 1 },
  unit: { type: String, required: true },
  batchNumber: { type: String, default: '-' },
  expiryDate: { type: Date, default: null },
  reference: { type: String, default: '' },
  prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', default: null },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  officer: { type: String, default: '-' },
}, { timestamps: true, versionKey: false });

applySoftDelete(stockTransactionSchema);

export const StockTransaction = mongoose.model('StockTransaction', stockTransactionSchema);
