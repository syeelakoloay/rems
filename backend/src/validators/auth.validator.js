/**
 * Mendefinisikan aturan validasi input untuk permintaan auth, sehingga data yang tidak sesuai tidak diteruskan ke proses bisnis.
 */
import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1),
});
