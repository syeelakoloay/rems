/**
 * Menyediakan fungsi pencarian dan normalisasi data pasien yang dipakai pada alur resep.
 */
/**
 * Menyeragamkan nomor BPJS dengan mengambil digit agar validasi dan pencarian memakai format yang konsisten.
 */
const normalizePatientIdentifier = (value) =>
  String(value || '').replace(/\D/g, '');

export const normalizeBpjs = normalizePatientIdentifier;
export const normalizeNik = normalizePatientIdentifier;

/**
 * Mencari pasien pada peta data menggunakan patientId. Mengembalikan null jika ID kosong atau tidak ditemukan.
 */
const getPatientById = (data, patientId) => {
  const id = String(patientId || '').trim();
  if (!id) return null;
  return data?.patients?.[id] || null;
};

/**
 * Menggabungkan data pasien tersimpan dengan snapshot identitas pada resep. Snapshot diprioritaskan agar informasi historis tetap sesuai saat profil pasien berubah.
 */
export const getPatientForPrescription = (data, prescription) => {
  const existing = getPatientById(data, prescription?.patientId) || {};
  const snapshot = prescription?.patientSnapshot || {};
  return {
    ...existing,
    ...snapshot,
    id: String(prescription?.patientId || existing.id || ''),
    name: String(snapshot.name || prescription?.patientName || existing.name || existing.patientName || '').trim(),
    phone: String(snapshot.phone || prescription?.patientPhone || existing.phone || existing.patientPhone || '').trim(),
    bpjsNumber: String(prescription?.bpjsNumber || snapshot.bpjsNumber || existing.bpjsNumber || existing.bpjs || '').trim(),
    nik: String(prescription?.nik || snapshot.nik || existing.nik || '').trim(),
    dateOfBirth: snapshot.dateOfBirth || existing.dateOfBirth || null,
    gender: snapshot.gender || existing.gender || '',
    address: snapshot.address || existing.address || '',
    allergyStatus: prescription?.allergy?.status || existing.allergyStatus || '',
    allergyDetails: prescription?.allergy?.details || existing.allergyDetails || '',
  };
};

/**
 * Mengambil nomor BPJS dari variasi field yang didukung, kemudian mengembalikan digit saja untuk pencocokan.
 */
export const getPatientBpjs = (patient) =>
  normalizeBpjs(
    patient?.bpjsNumber || patient?.bpjs || patient?.nomorBpjs || patient?.nomorBPJS ||
    patient?.noBpjs || patient?.noBPJS || patient?.cardNumber || patient?.insuranceNumber ||
    patient?.bpjsCardNumber || ''
  );

/**
 * Mengambil nama pasien dari field name, patientName, atau objek patient.
 */
export const getPatientName = (patient) =>
  String(patient?.name || patient?.patientName || patient?.patient?.name || '').trim();

/**
 * Mengambil nomor telepon dari field phone, patientPhone, atau telephone.
 */
export const getPatientPhone = (patient) =>
  String(patient?.phone || patient?.patientPhone || patient?.telephone || '').trim();
