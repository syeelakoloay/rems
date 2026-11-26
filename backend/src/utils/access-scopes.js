/** Menentukan cakupan data pasien dan resep berdasarkan peran pengguna. */
export function getPatientReadFilter({ role, userId }) {
  return role === 'doctor' ? { assignedDoctorId: userId } : {};
}

export function getPrescriptionReadFilter({ role, patientIds = [] }) {
  return role === 'doctor' ? { patientId: { $in: patientIds } } : {};
}
