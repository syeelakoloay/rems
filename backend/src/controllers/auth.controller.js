/**
 * Menangani permintaan dan respons HTTP untuk fitur autentikasi. Controller meneruskan pekerjaan domain ke service dan mengembalikan hasil dengan format API.
 */
import { env } from '../config/env.js';
import { publicUser, signSession, verifyCredentials } from '../services/auth.service.js';
import { User } from '../models/User.js';
import { recordActivity } from '../services/activity.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { requestOwnPasswordReset } from './user.controller.js';

export const login = asyncHandler(async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) throw new AppError('Username dan password wajib diisi.', 422, 'VALIDATION_ERROR');
  const user = await verifyCredentials(username, password);
  const token = signSession(user);
  res.cookie(env.sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.secureCookies,
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
  await recordActivity({ user, action: 'Login' });
  res.json({ success: true, data: { user: publicUser(user) } });
});

export const me = asyncHandler(async (req, res) => {
  if (!req.auth?.sub) return res.json({ success: true, data: { user: null } });
  const user = await User.findById(req.auth.sub);
  if (!user || user.active === false) return res.json({ success: true, data: { user: null } });
  res.json({ success: true, data: { user: publicUser(user) } });
});

export const logout = asyncHandler(async (req, res) => {
  const user = await User.findById(req.auth.sub);
  if (user) await recordActivity({ user, action: 'Logout' });
  res.clearCookie(env.sessionCookieName, { httpOnly: true, sameSite: 'lax', secure: env.secureCookies, path: '/' });
  res.json({ success: true, data: null });
});

export { requestOwnPasswordReset };
