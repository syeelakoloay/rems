/**
 * Mendefinisikan skema Mongoose dan aturan penyimpanan untuk data AccountRegistration, termasuk tipe field, relasi, nilai bawaan, dan batasan yang berlaku.
 */
import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, trim: true, required: true },
  mimeType: { type: String, default: 'application/pdf' },
  size: { type: Number, min: 0 },
}, { _id: false });

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  nameNormalized: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ['doctor', 'pharmacy'], required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  emailNormalized: { type: String, required: true, lowercase: true, trim: true },
  nik: { type: String, required: true, trim: true },
  passwordHash: { type: String, select: false, default: null },
  str: { type: documentSchema, required: true },
  sip: { type: documentSchema, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  decisionReason: { type: String, trim: true, maxlength: 500, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, versionKey: false });

schema.index({ nik: 1 }, { unique: true, partialFilterExpression: { status: 'pending' }, name: 'pending_registration_nik_unique' });
schema.index({ emailNormalized: 1 }, { unique: true, partialFilterExpression: { status: 'pending' }, name: 'pending_registration_email_unique' });
export const AccountRegistration = mongoose.model('AccountRegistration', schema);
