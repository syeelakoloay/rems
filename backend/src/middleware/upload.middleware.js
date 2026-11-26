/**
 * Mengonfigurasi penerimaan dan pemeriksaan awal berkas unggahan.
 */
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const memory = multer.memoryStorage();

/**
 * Memeriksa MIME type atau ekstensi berkas sebagai penyaringan awal unggahan PDF. Signature isi berkas tetap diperiksa sebelum penyimpanan.
 */
const isPdf = (file) =>
  file.mimetype === 'application/pdf' ||
  file.originalname.toLowerCase().endsWith('.pdf');

/**
 * Memastikan MIME type berkas diawali image/ sebelum unggahan diterima oleh middleware gambar.
 */
const isImage = (file) =>
  String(file.mimetype || '').startsWith('image/');

export const uploadPdf = multer({
  storage: memory,
  limits: { fileSize: env.maxFileSizeBytes },
  fileFilter: (req, file, cb) => {
    cb(isPdf(file) ? null : new AppError('File harus berupa PDF.', 422, 'INVALID_FILE_TYPE'), isPdf(file));
  },
});

export const uploadImage = multer({
  storage: memory,
  limits: { fileSize: env.maxFileSizeBytes },
  fileFilter: (req, file, cb) => {
    cb(
      isImage(file) ? null : new AppError('File harus berupa gambar.', 422, 'INVALID_IMAGE_TYPE'),
      isImage(file),
    );
  },
});
