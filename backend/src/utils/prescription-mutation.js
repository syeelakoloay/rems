/**
 * Memeriksa apakah resep masih boleh dimutasi oleh Dokter FKTP.
 * Resep hanya dapat diubah oleh pembuatnya selama pasien masih ditugaskan kepadanya
 * dan versi penugasan pasien belum berubah sejak resep dibuat.
 */
function idOf(value) {
  if (value && typeof value === 'object' && '_id' in value) return String(value._id);
  return value == null ? '' : String(value);
}

export function wasPrescriptionCreatedBeforeAssignmentChange({
  prescriptionAssignmentVersion,
  currentAssignmentVersion,
  prescriptionCreatedAt,
  lastAssignmentChangeAt,
}) {
  // Resep baru menyimpan snapshot versi assignment. Perbedaan versi selalu mengunci resep,
  // termasuk apabila pasien kemudian dipindahkan kembali kepada Dokter FKTP sebelumnya.
  if (Number.isInteger(prescriptionAssignmentVersion) && Number.isInteger(currentAssignmentVersion)) {
    return prescriptionAssignmentVersion !== currentAssignmentVersion;
  }

  // Fallback untuk resep lama yang belum memiliki patientAssignmentVersion.
  if (prescriptionCreatedAt && lastAssignmentChangeAt) {
    const prescriptionTime = new Date(prescriptionCreatedAt).getTime();
    const assignmentTime = new Date(lastAssignmentChangeAt).getTime();
    return Number.isFinite(prescriptionTime)
      && Number.isFinite(assignmentTime)
      && assignmentTime > prescriptionTime;
  }
  return false;
}

export function isPrescriptionMutationAllowed({
  createdBy,
  assignedDoctorId,
  userId,
  prescriptionAssignmentVersion,
  currentAssignmentVersion,
  prescriptionCreatedAt,
  lastAssignmentChangeAt,
}) {
  const actorId = idOf(userId);
  if (!actorId || idOf(createdBy) !== actorId || idOf(assignedDoctorId) !== actorId) return false;
  return !wasPrescriptionCreatedBeforeAssignmentChange({
    prescriptionAssignmentVersion,
    currentAssignmentVersion,
    prescriptionCreatedAt,
    lastAssignmentChangeAt,
  });
}
