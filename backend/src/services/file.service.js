/**
 * Memuat aturan bisnis dan proses data untuk fitur berkas. Lapisan ini menjadi tempat proses domain dijalankan sebelum hasilnya dikirim kembali ke controller.
 */
import { uploadFile, deleteFile } from '../config/gridfs.js';
import { assertPdfFile } from '../utils/fileValidation.js';

/**
 * Menyimpan atau memperbarui PDF dengan mengikuti validasi dan aturan bisnis pada modul.
 */
export async function storePdf(file, metadata = {}) {
  if (!file) return null;
  assertPdfFile(file);
  const fileId = await uploadFile({
    buffer: file.buffer,
    filename: file.originalname,
    contentType: 'application/pdf',
    metadata,
  });
  return { fileId, name: file.originalname, mimeType: 'application/pdf', size: file.size };
}

/**
 * Menghapus stored berkas dari data atau tampilan sesuai aturan akses dan validasi yang berlaku.
 */
export async function deleteStoredFiles(fileIds = []) {
  await Promise.all(
    fileIds.filter(Boolean).map((fileId) => deleteFile(fileId).catch(() => null)),
  );
}

export { deleteFile };
