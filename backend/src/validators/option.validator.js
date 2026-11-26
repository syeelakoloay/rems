/**
 * Mendefinisikan aturan validasi input untuk permintaan option, sehingga data yang tidak sesuai tidak diteruskan ke proses bisnis.
 */
import { z } from 'zod';
export const optionSchema = z.object({
  value: z.string().trim().min(1).max(200),
  unit: z.string().trim().max(40).optional(),
  route: z.string().trim().max(100).optional(),
});
