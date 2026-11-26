/**
 * Mendefinisikan skema Mongoose dan aturan penyimpanan untuk data Activity, termasuk tipe field, relasi, nilai bawaan, dan batasan yang berlaku.
 */
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  username: { type: String, required: true },
  role: { type: String, required: true },
  action: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

export const Activity = mongoose.model('Activity', schema);
