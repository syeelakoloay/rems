/**
 * Memeriksa sesi dan identitas pengguna sebelum permintaan diteruskan.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { unauthorized } from '../utils/AppError.js';

/**
 * Memverifikasi cookie sesi dan memuat akun aktif dari database. Permintaan ditolak jika token tidak valid, kedaluwarsa, atau akun sudah tidak aktif.
 */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[env.sessionCookieName];
  if (!token) return next(unauthorized());

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return next(unauthorized('Sesi tidak valid atau sudah berakhir.'));
  }

  // Keep database failures distinct from invalid credentials. Express 4 does
  // not forward rejected async middleware promises automatically.
  try {
    const user = await User.findById(payload.sub);
    if (!user || user.active === false) {
      return next(unauthorized('Sesi tidak valid atau akun tidak aktif.'));
    }

    req.authUser = user;
    req.auth = { ...payload, role: user.role, username: user.username };
    return next();
  } catch (error) {
    return next(error);
  }
}

// Session-probe middleware: an absent/expired cookie is represented as an
// unauthenticated session by /auth/me, not as an HTTP error during app startup.
// Protected business routes continue to use requireAuth and retain 401 behavior.
/**
 * Membaca sesi bila tersedia tanpa menggagalkan endpoint publik saat cookie tidak ada atau kedaluwarsa.
 */
export function optionalAuth(req, res, next) {
  const token = req.cookies?.[env.sessionCookieName];
  if (!token) {
    req.auth = null;
    return next();
  }

  try {
    req.auth = jwt.verify(token, env.jwtSecret);
  } catch {
    req.auth = null;
  }
  return next();
}
