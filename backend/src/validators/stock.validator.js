/**
 * Mendefinisikan aturan validasi input untuk permintaan stock, sehingga data yang tidak sesuai tidak diteruskan ke proses bisnis.
 */
import { z } from 'zod';

export const createStockSchema = z.object({
  medicationId: z.string().trim().optional(),
  name: z.string().trim().min(1).optional(),
  stockName: z.string().trim().min(1).optional(),
  distributor: z.string().trim().min(1, 'Pabrik wajib diisi.'),
  qty: z.coerce.number().int().min(1),
  unit: z.string().trim().min(1),
  administrationRoute: z.string().trim().min(1, 'Rute pemberian obat wajib dipilih.'),
  minStock: z.coerce.number().int().min(0).optional(),
  expiryDate: z.string().trim().min(1, 'Tanggal kedaluwarsa wajib diisi.'),
  batchNumber: z.string().trim().min(1, 'Nomor batch wajib diisi.'),
  type: z.literal('in').optional(),
}).refine((v) => Boolean(v.name || v.stockName), { message: 'Nama obat wajib diisi.' });
