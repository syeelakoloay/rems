/**
 * Mendefinisikan aturan validasi input untuk permintaan common, sehingga data yang tidak sesuai tidak diteruskan ke proses bisnis.
 */
import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, ROLES } from '../utils/constants.js';

export const usernameSchema = z.string().trim().min(1).max(80);
export const strongPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/).regex(/[!@#$%^&*(),.?":{}|<>_\-\[\]/;'`~+=]/);
export const roleSchema = z.enum(ROLES);
