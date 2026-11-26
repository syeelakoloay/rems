/** Menghapus pemisah dari nomor BPJS agar pencarian dan validasi memakai digit yang konsisten. */
export const normalizeBpjs = (value) => String(value ?? '').replace(/\D/g, '');

/** Menghapus pemisah dari NIK agar perbandingan identitas memakai digit yang konsisten. */
export const normalizeNik = (value) => String(value ?? '').replace(/\D/g, '');

/** Memastikan identitas yang sudah tersimpan tidak ditimpa oleh nilai berbeda dari formulir resep. */
export function matchesRegisteredPatientIdentifiers(patient, bpjsNumber, nik) {
  const registeredBpjs = normalizeBpjs(patient?.bpjsNumber);
  const registeredNik = normalizeNik(patient?.nik);
  const submittedBpjs = normalizeBpjs(bpjsNumber);
  const submittedNik = normalizeNik(nik);

  return (!registeredBpjs || registeredBpjs === submittedBpjs)
    && (!registeredNik || registeredNik === submittedNik);
}

/** Memastikan identitas yang diinput cocok dengan tepat satu data master pasien. */
export function isRegisteredPatientIdentityMatch(matches, bpjsNumber, nik) {
  const submittedBpjs = normalizeBpjs(bpjsNumber);
  const submittedNik = normalizeNik(nik);
  if ((!submittedBpjs && !submittedNik) || !Array.isArray(matches) || matches.length !== 1) return false;

  const patient = matches[0];
  return (!submittedBpjs || normalizeBpjs(patient?.bpjsNumber) === submittedBpjs)
    && (!submittedNik || normalizeNik(patient?.nik) === submittedNik);
}
