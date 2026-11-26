/**
 * Mendefinisikan skema Mongoose dan aturan penyimpanan untuk data User, termasuk tipe field, relasi, nilai bawaan, dan batasan yang berlaku.
 */
import { applySoftDelete } from './softDelete.js';
import mongoose from 'mongoose';
import { ROLES } from '../utils/constants.js';

const documentSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, required: false },
  name: { type: String, trim: true },
  mimeType: { type: String, default: 'application/pdf' },
  size: { type: Number, min: 0 },
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  usernameNormalized: { type: String, required: true, lowercase: true, trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  emailNormalized: { type: String, lowercase: true, trim: true },
  passwordHash: { type: String, default: null, required: false, select: false },
  resetPasswordTokenHash: { type: String, default: null, select: false },
  resetPasswordExpiresAt: { type: Date, default: null, select: false },
  activationTokenHash: { type: String, default: null, select: false },
  activationExpiresAt: { type: Date, default: null, select: false },
  role: { type: String, enum: ROLES, required: true },
  active: { type: Boolean, default: true },
  nik: { type: String, default: '' },
  str: { type: documentSchema, default: null },
  sip: { type: documentSchema, default: null },
}, { timestamps: true, versionKey: false });

userSchema.index({ emailNormalized: 1 }, { unique: true, partialFilterExpression: { emailNormalized: { $type: 'string' } } });
// NIK, bukan nama, adalah identitas unik akun. Indeks unik dibuat oleh migrasi startup
// setelah memeriksa data lama agar database yang sudah ada tidak gagal saat dijalankan.

applySoftDelete(userSchema);

export const User = mongoose.model('User', userSchema);
