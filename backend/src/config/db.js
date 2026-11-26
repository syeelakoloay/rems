/**
 * Mengelola koneksi dan pemutusan koneksi aplikasi ke MongoDB.
 */
import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * Membuka koneksi Mongoose ke MongoDB menggunakan URI dari konfigurasi lingkungan. Proses server hanya dilanjutkan setelah koneksi berhasil.
 */
export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    autoIndex: env.nodeEnv !== 'production',
    serverSelectionTimeoutMS: 10000,
  });
  return mongoose.connection;
}

/**
 * Menutup koneksi Mongoose dengan rapi saat proses seed atau server dihentikan.
 */
export async function disconnectDatabase() {
  await mongoose.disconnect();
}
