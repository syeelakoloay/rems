import { STOCK_ALERT_THRESHOLD } from '../data/constants.js';
import { formatDate } from './date.js';

/** Menentukan tone kartu stok berdasarkan jumlah dan batas minimum yang berlaku. */
export const getStockCardTone = (item) => {
  const quantity = Number(item?.qty ?? 0);
  const minimum = Number(item?.minStock ?? STOCK_ALERT_THRESHOLD);
  if (quantity <= 0) return 'danger';
  if (quantity <= minimum) return 'warning';
  return 'success';
};

/** Mengambil tanggal kedaluwarsa terdekat dari batch berisi stok, dengan fallback ke tanggal master obat. */
export const getNearestExpiryLabel = (item) => {
  const batches = Array.isArray(item?.batches) ? item.batches : [];
  const candidates = batches
    .filter((batch) => Number(batch?.qty ?? batch?.quantity ?? 0) > 0 && batch?.expiryDate)
    .map((batch) => String(batch.expiryDate).slice(0, 10))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));

  if (!candidates.length && item?.expiryDate) {
    const fallback = String(item.expiryDate).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(fallback)) candidates.push(fallback);
  }

  if (!candidates.length) return '-';
  const nearestExpiry = candidates.sort((a, b) => a.localeCompare(b))[0];
  return formatDate(nearestExpiry);
};

/** Menormalisasi nama obat untuk pencarian toleran variasi spasi, aksen, dan tanda baca. */
export const normalizeMedicationSearchText = (value) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('id-ID')
  .replace(/[^a-z0-9]/g, '');

/** Menghitung kemiripan dua nama obat menggunakan jarak Levenshtein yang dinormalisasi. */
export const medicationNameSimilarity = (left, right) => {
  const a = normalizeMedicationSearchText(left);
  const b = normalizeMedicationSearchText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }

  return 1 - previous[b.length] / Math.max(a.length, b.length);
};

/** Mendeteksi kemungkinan salah ketik tanpa menyamakan obat yang memiliki kekuatan berbeda. */
export const isSimilarMedicationName = (query, candidate, threshold = 0.82) => {
  const normalizedQuery = normalizeMedicationSearchText(query);
  const normalizedCandidate = normalizeMedicationSearchText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return false;
  if (normalizedQuery === normalizedCandidate) return true;
  if (Math.min(normalizedQuery.length, normalizedCandidate.length) < 6) return false;

  const getStrength = (value) => {
    const match = String(value ?? '').toLocaleLowerCase('id-ID').replace(',', '.')
      .match(/(\d+(?:\.\d+)?)\s*(mcg|µg|μg|mg|ml|iu|g|%)/i);
    return match ? `${Number(match[1])}${match[2].replace('μ', 'µ')}` : null;
  };
  const queryStrength = getStrength(query);
  const candidateStrength = getStrength(candidate);
  if (queryStrength && candidateStrength && queryStrength !== candidateStrength) return false;
  return medicationNameSimilarity(query, candidate) >= threshold;
};
