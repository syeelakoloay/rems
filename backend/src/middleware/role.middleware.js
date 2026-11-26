/**
 * Membatasi akses endpoint berdasarkan peran pengguna yang diizinkan.
 */
import { forbidden } from '../utils/AppError.js';

/**
 * Membatasi endpoint hanya bagi pengguna yang perannya termasuk dalam daftar peran yang diizinkan.
 */
export const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.authUser?.role || req.auth?.role)) return next(forbidden());
  next();
};
