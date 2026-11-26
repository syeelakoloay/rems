/**
 * Mendefinisikan skema Mongoose dan aturan penyimpanan untuk data Notification, termasuk tipe field, relasi, nilai bawaan, dan batasan yang berlaku.
 */
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  tone: { type: String, enum: ['info', 'success', 'warning', 'danger'], default: 'info' },
  entityType: { type: String, default: null },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  readAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false });

schema.index({ recipientUserId: 1, createdAt: -1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Notification = mongoose.model('Notification', schema);
