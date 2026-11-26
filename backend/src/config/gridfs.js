/**
 * Mengelola penyimpanan berkas menggunakan GridFS, termasuk unggah, pembacaan, informasi berkas, dan penghapusan.
 */
import mongoose from 'mongoose';
import { GridFSBucket, ObjectId } from 'mongodb';
import { env } from './env.js';

let bucket;

/**
 * Membuat bucket GridFS setelah koneksi MongoDB tersedia. Bucket ini menjadi tempat penyimpanan dokumen dan berkas yang diunggah.
 */
export function initGridFS() {
  if (!mongoose.connection.db) throw new Error('MongoDB belum terhubung.');
  bucket = new GridFSBucket(mongoose.connection.db, { bucketName: env.gridfsBucket });
  return bucket;
}

/**
 * Mengembalikan bucket GridFS yang digunakan aplikasi. Jika bucket belum dibuat, fungsi menginisialisasinya setelah koneksi MongoDB tersedia.
 */
function getBucket() {
  if (!bucket) initGridFS();
  return bucket;
}

/**
 * Menyimpan buffer berkas ke GridFS beserta tipe konten dan metadata, lalu mengembalikan ID berkas setelah proses tulis selesai.
 */
export async function uploadFile({ buffer, filename, contentType, metadata = {} }) {
  const grid = getBucket();
  return new Promise((resolve, reject) => {
    const upload = grid.openUploadStream(filename, {
      contentType,
      metadata,
    });
    upload.on('error', reject);
    upload.on('finish', () => resolve(upload.id));
    upload.end(buffer);
  });
}

/**
 * Membuka stream unduhan GridFS berdasarkan ID berkas agar dokumen dapat dikirim tanpa memuat seluruh isi ke memori.
 */
export function streamFile(fileId) {
  return getBucket().openDownloadStream(new ObjectId(String(fileId)));
}

/**
 * Mengambil metadata satu berkas GridFS untuk memeriksa keberadaan dan informasi berkas.
 */
export async function getFileInfo(fileId) {
  const id = new ObjectId(String(fileId));
  return getBucket().find({ _id: id }).next();
}

/**
 * Menghapus berkas dari GridFS. Kondisi berkas yang sudah tidak ada diperlakukan sebagai operasi idempoten.
 */
export async function deleteFile(fileId) {
  if (!fileId) return;
  const grid = getBucket();
  const id = new ObjectId(String(fileId));
  try { await grid.delete(id); } catch (error) {
    if (error?.codeName !== 'FileNotFound') throw error;
  }
}
