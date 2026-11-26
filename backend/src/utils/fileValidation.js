/**
 * Memeriksa karakteristik dan signature PDF sebelum berkas diterima atau disimpan.
 */
import { AppError } from './AppError.js';

const PDF_HEADER = Buffer.from('%PDF-');

/**
 * Memeriksa penanda byte %PDF- pada bagian awal berkas. Pemeriksaan ini mencegah file non-PDF diterima hanya karena nama atau MIME type-nya menyatakan PDF.
 */
export function hasPdfSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < PDF_HEADER.length) return false;
  // The PDF specification permits the header to appear within the first 1 KB.
  return buffer.subarray(0, Math.min(buffer.length, 1024)).includes(PDF_HEADER);
}

/**
 * Memastikan berkas memiliki signature PDF yang valid dan memenuhi batas ukuran sebelum diproses sebagai dokumen PDF.
 */
export function assertPdfFile(file, label = 'File') {
  if (!file) {
    throw new AppError(`${label} wajib berupa file PDF maksimal 5 MB.`, 422, 'INVALID_DOCUMENT');
  }
  if (!hasPdfSignature(file.buffer)) {
    throw new AppError(`${label} harus berupa file PDF yang valid.`, 422, 'INVALID_FILE_TYPE');
  }
  const size = Number.isFinite(Number(file.size)) ? Number(file.size) : file.buffer.length;
  if (size > 5 * 1024 * 1024) {
    throw new AppError('Ukuran file maksimal 5 MB. Silakan unggah file PDF yang lebih kecil.', 422, 'FILE_TOO_LARGE');
  }
  return file;
}
