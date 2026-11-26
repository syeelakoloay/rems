/**
 * Membuat identifier transaksi yang dipakai untuk pelacakan aktivitas stok.
 */
import { randomInt } from 'node:crypto';

// Preserve the existing numeric transaction-ID format while avoiding Math.random().
/**
 * Membuat identifier transaksi stok yang dapat dicatat pada riwayat dan dirujuk kembali saat penebusan atau koreksi.
 */
export function createTransactionId() {
  return `${Date.now()}${String(randomInt(0, 1000)).padStart(3, '0')}`;
}

/** Membuat ID resep publik dengan format kompatibel RX + 8 digit numerik. */
export function createLegacyPrescriptionId() {
  return `RX${String(Date.now()).slice(-7)}${randomInt(0, 10)}`;
}
