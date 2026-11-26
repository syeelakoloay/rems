/**
 * Mendefinisikan aturan validasi input untuk permintaan user, sehingga data yang tidak sesuai tidak diteruskan ke proses bisnis.
 */
import { z } from 'zod';
import { roleSchema, strongPasswordSchema, usernameSchema } from './common.validator.js';

export const updateUserSchema = z.object({
  name: usernameSchema,
  role: roleSchema,
  email: z.string().max(254),
  nik: z.string().max(16).refine((value) => value === '' || /^\d{16}$/.test(value)),
});

export const changePasswordSchema = z.object({ password: strongPasswordSchema });
