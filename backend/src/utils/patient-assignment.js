/** Menentukan apakah akses data klinis resep sebelumnya memerlukan konfirmasi perpindahan FKTP. */
function getId(value) {
  if (value && typeof value === 'object' && value._id) return String(value._id);
  return value == null ? '' : String(value);
}

export function requiresPatientFktpConfirmation({ assignedDoctorId, userId }) {
  const assignedId = getId(assignedDoctorId);
  const currentId = getId(userId);
  return Boolean(assignedId && currentId && assignedId !== currentId);
}
