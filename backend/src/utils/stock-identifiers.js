/**
 * Normalisasi identitas stok agar pemeriksaan aplikasi, migrasi indeks, dan model
 * menggunakan aturan yang sama tanpa mengubah teks asli yang ditampilkan.
 */
export const normalizeMedicationName = (value) =>
  String(value ?? '').trim().toLocaleLowerCase('id-ID');

export const normalizeManufacturer = (value) =>
  String(value ?? '-').trim().toLocaleLowerCase('id-ID') || '-';

export const normalizeBatchNumber = (value) =>
  String(value ?? '').trim().toLocaleUpperCase('id-ID');
