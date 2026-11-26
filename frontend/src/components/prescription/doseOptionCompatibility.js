/**
 * Aturan kompatibilitas opsi Aturan Pakai terhadap Satuan dan Rute Pemberian.
 * Preset bawaan dipetakan berdasarkan bentuk dosis yang tertulis; opsi khusus
 * menggunakan metadata Satuan/Rute yang disimpan bersama opsi di backend.
 */
const normalizeDoseScopeValue = (value) =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const DEFAULT_DOSE_SCOPES = [
  {
    pattern: /\b(?:tablet|tablets)\b/i,
    unit: 'tablet',
    routes: ['Oral (PO)'],
  },
  {
    pattern: /\b(?:kapsul|capsule|capsules)\b/i,
    unit: 'kapsul',
    routes: ['Oral (PO)'],
  },
  {
    pattern: /\b(?:m\s*l|ml|milliliter|milliliters)\b/i,
    unit: 'botol',
    routes: ['Oral (PO)', 'Nasogastric / Enteral Tube (NG/GT)'],
  },
  {
    pattern: /\b(?:tetes|drop|drops)\b/i,
    unit: 'botol',
    routes: ['Oral (PO)', 'Ophthalmic (Eye)', 'Otic (Ear)', 'Nasal (NAS)'],
  },
];

const getDefaultDoseScope = (doseOption) => {
  const text = String(doseOption || '').trim();
  if (!text) return null;
  return DEFAULT_DOSE_SCOPES.find((scope) => scope.pattern.test(text)) || null;
};

/**
 * Mengembalikan true hanya jika opsi sesuai Satuan dan Rute yang dipilih.
 * `prescriptionUnit` boleh kosong saat pengelola menampilkan filter "Semua";
 * rute tetap harus tersedia agar opsi tidak tercampur antarrute.
 * Rute kosong hanya ditoleransi untuk preset bawaan saat membuka resep lama
 * yang belum menyimpan data rute.
 */
export const isDoseOptionCompatible = (
  prescriptionUnit,
  administrationRoute,
  doseOption,
  doseOptionUnits = {},
  doseOptionRoutes = {},
) => {
  const optionKey = String(doseOption || '').trim().toLowerCase();
  if (!optionKey) return false;

  const assignedUnit = String(doseOptionUnits?.[optionKey] || '').trim();
  const assignedRoute = String(doseOptionRoutes?.[optionKey] || '').trim();
  const defaultScope = getDefaultDoseScope(doseOption);

  // Prioritaskan konteks eksplisit yang tersimpan. Untuk preset bawaan/opsi lama,
  // gunakan bentuk dosis yang dikenali dari teks Aturan Pakai.
  const requiredUnit = assignedUnit || defaultScope?.unit || '';
  const requiredRoutes = assignedRoute
    ? [assignedRoute]
    : (defaultScope?.routes || []);

  // Opsi tanpa satuan yang dapat ditentukan tidak boleh menjadi pilihan umum.
  if (!requiredUnit) return false;
  if (
    prescriptionUnit &&
    normalizeDoseScopeValue(requiredUnit) !== normalizeDoseScopeValue(prescriptionUnit)
  ) {
    return false;
  }

  if (administrationRoute) {
    if (!requiredRoutes.length) return false;
    return requiredRoutes.some(
      (route) => normalizeDoseScopeValue(route) === normalizeDoseScopeValue(administrationRoute),
    );
  }

  // Opsi khusus dengan rute eksplisit tidak dapat dipilih bila resep lama tidak
  // memiliki rute. Preset yang dikenali tetap bisa dipertahankan untuk data lama.
  return !assignedRoute && Boolean(defaultScope?.routes?.length);
};
