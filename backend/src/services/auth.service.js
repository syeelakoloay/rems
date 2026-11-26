/**
 * Memuat aturan bisnis dan proses data untuk fitur autentikasi. Lapisan ini menjadi tempat proses domain dijalankan sebelum hasilnya dikirim kembali ke controller.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { unauthorized } from '../utils/AppError.js';
import { createHashedRandomToken, hashToken } from '../utils/security-tokens.js';

/**
 * Memangkas spasi dan menyamakan huruf username agar pencarian login dan perbandingan identitas tidak peka huruf besar/kecil.
 */
export function normalizeUsername(value) { return String(value || '').trim().toLowerCase(); }

/**
 * Menyusun representasi akun untuk frontend tanpa menyertakan password hash, token aktivasi, token reset, atau rahasia autentikasi lainnya.
 */
export function publicUser(user) {
  return {
    _id: String(user._id),
    id: String(user._id),
    username: user.username,
    email: user.email || '',
    role: user.role,
    active: user.active !== false,
    nik: user.nik || '',
    str: user.str?.fileId ? {
      fileId: String(user.str.fileId), name: user.str.name, type: user.str.mimeType, size: user.str.size,
      url: `/api/files/${user.str.fileId}`,
    } : null,
    sip: user.sip?.fileId ? {
      fileId: String(user.sip.fileId), name: user.sip.name, type: user.sip.mimeType, size: user.sip.size,
      url: `/api/files/${user.sip.fileId}`,
    } : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Mencari akun dengan username atau email, termasuk field lama untuk kompatibilitas, lalu memverifikasi bcrypt hash. Jika beberapa akun aktif cocok dengan nama yang sama, login harus memakai email.
 */
export async function verifyCredentials(identifier, password) {
  const rawIdentifier = String(identifier || '').trim();
  const normalized = normalizeUsername(rawIdentifier);
  // Include the legacy display fields as exact, case-insensitive matches. Older
  // database records may predate usernameNormalized/emailNormalized; this keeps
  // existing accounts usable without weakening the password-hash check.
  const escapedIdentifier = rawIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactIdentifier = new RegExp(`^${escapedIdentifier}$`, 'i');
  const query = rawIdentifier.includes('@')
    ? { $or: [
        { usernameNormalized: normalized },
        { emailNormalized: normalizeEmail(rawIdentifier) },
        { username: exactIdentifier },
        { email: exactIdentifier },
      ] }
    : { $or: [{ usernameNormalized: normalized }, { username: exactIdentifier }] };
  // Nama boleh sama. Login dengan nama dicocokkan lewat password; bila nama tidak
  // cukup membedakan akun, pengguna juga dapat memakai alamat email terdaftarnya.
  const candidates = await User.find(query).select('+passwordHash');
  const passwordValue = String(password || '');
  const activeMatches = [];
  const inactiveMatches = [];

  for (const candidate of candidates) {
    if (!candidate.passwordHash || !(await bcrypt.compare(passwordValue, candidate.passwordHash))) continue;
    if (candidate.active === false) inactiveMatches.push(candidate);
    else activeMatches.push(candidate);
  }

  if (activeMatches.length === 1) return activeMatches[0];
  if (activeMatches.length > 1) {
    throw unauthorized('Nama akun digunakan oleh lebih dari satu akun. Silakan login menggunakan email terdaftar.');
  }
  if (inactiveMatches.length) {
    throw unauthorized('Akun Anda sedang dinonaktifkan. Silakan hubungi Admin.');
  }

  throw unauthorized('Username atau password tidak valid.');
}

/**
 * Membuat JWT sesi yang hanya berisi identifier akun dan klaim peran/username dengan secret serta masa berlaku dari konfigurasi.
 */
export function signSession(user) {
  return jwt.sign({ sub: String(user._id), role: user.role, username: user.username }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

/**
 * Menghasilkan bcrypt hash dengan cost factor 12 sehingga password asli tidak disimpan di database.
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}


/** Membuat token reset acak; hanya hash SHA-256 yang disimpan di database. */
export function createPasswordResetToken() {
  return createHashedRandomToken();
}

/** Membuat token aktivasi acak; hanya hash SHA-256 yang disimpan di database. */
export function createAccountActivationToken() {
  return createHashedRandomToken();
}

/** Mengubah token reset yang diterima menjadi hash SHA-256 untuk pencocokan dengan nilai tersimpan. */
export function hashPasswordResetToken(token) {
  return hashToken(token);
}

/**
 * Mewajibkan minimal 8 karakter dengan setidaknya satu huruf besar, satu huruf kecil, satu angka, dan satu simbol.
 */
export function validateStrongPassword(password) {
  const value = String(password || '');
  return value.length >= 8
    && /[A-Z]/.test(value)
    && /[a-z]/.test(value)
    && /\d/.test(value)
    && /[!@#$%^&*(),.?":{}|<>_\-\\[\]/;'`~+=]/.test(value);
}

/**
 * Memangkas spasi dan menyamakan huruf alamat email agar pemeriksaan duplikasi konsisten.
 */
export function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }

/**
 * Memeriksa bentuk email, panjang maksimum 254 karakter, dan memastikan alamat tidak mengandung spasi.
 */
export function isValidEmail(value) {
  const email = String(value || '');
  return email.length <= 254 && !/\s/.test(email) && /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(email);
}
