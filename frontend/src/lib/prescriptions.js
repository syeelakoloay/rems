import { formatDate, formatDateTime } from './date.js';

/** Mengambil waktu penebusan dari nama field saat ini maupun alias historis. */
export const getPrescriptionRedemptionTime = (prescription) =>
  prescription?.pickedAt ||
  prescription?.redeemedAt ||
  prescription?.dispensedAt ||
  prescription?.verifiedAt ||
  null;

/** Memformat waktu penebusan dan mengembalikan tanda pengganti bila nilainya tidak valid. */
export const formatPrescriptionRedemptionTime = (prescription) => {
  const value = getPrescriptionRedemptionTime(prescription);
  return value ? formatDateTime(value) : '-';
};

/** Menghitung tanggal pengambilan berikutnya, 30 hari setelah waktu penebusan yang valid. */
export const getNextPickupDate = (prescription) => {
  const redeemedAt = getPrescriptionRedemptionTime(prescription);
  if (!redeemedAt) return '-';

  const nextPickupDate = new Date(redeemedAt);
  if (Number.isNaN(nextPickupDate.getTime())) return '-';

  nextPickupDate.setDate(nextPickupDate.getDate() + 30);
  return formatDate(nextPickupDate);
};


/** Mengambil resep terbaru milik pasien tanpa mengubah urutan array sumber. */
export const getLatestPrescriptionForPatient = (prescriptions, patientId) => {
  if (!Array.isArray(prescriptions) || !patientId) return null;

  return prescriptions
    .filter((item) => String(item?.patientId || '') === String(patientId))
    .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())[0] || null;
};
