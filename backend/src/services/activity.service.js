/**
 * Memuat aturan bisnis dan proses data untuk fitur aktivitas. Lapisan ini menjadi tempat proses domain dijalankan sebelum hasilnya dikirim kembali ke controller.
 */
import { Activity } from '../models/Activity.js';

/**
 * Mencatat atau menandai aktivitas agar status dan riwayatnya dapat ditelusuri.
 */
export async function recordActivity({ user, action }) {
  return Activity.create({
    userId: user._id,
    username: user.username,
    role: user.role,
    action,
  });
}
