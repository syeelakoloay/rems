/**
 * Membuat laporan pasien lama yang belum memiliki assignedDoctorId.
 * Skrip ini tidak memperbarui data secara otomatis karena riwayat resep tidak
 * dapat membuktikan status kepesertaan atau FKTP pasien saat ini.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Patient } from '../src/models/Patient.js';
import { Prescription } from '../src/models/Prescription.js';
import { User } from '../src/models/User.js';

await connectDatabase();

try {
  const unassignedPatients = await Patient.find({
    $or: [
      { assignedDoctorId: null },
      { assignedDoctorId: { $exists: false } },
    ],
  }).select('_id').lean();

  console.log('Pasien tanpa assignedDoctorId (tidak ada perubahan database):');
  for (const patient of unassignedPatients) {
    const prescriptions = await Prescription.find({ patientId: patient._id, includeDeleted: true })
      .sort({ createdAt: -1 })
      .select('createdBy')
      .lean();
    const doctorIds = [...new Set(
      prescriptions
        .map((prescription) => prescription.createdBy ? String(prescription.createdBy) : '')
        .filter(Boolean),
    )];
    const doctorUsers = doctorIds.length
      ? await User.find({ _id: { $in: doctorIds } }).select('username').lean()
      : [];
    const candidates = doctorUsers.map((doctor) => doctor.username).join(', ') || 'tidak ada riwayat Dokter';
    console.log(`${patient._id} | kandidat dari riwayat (perlu verifikasi): ${candidates}`);
  }

  console.log(`Total pasien yang perlu ditetapkan secara manual setelah verifikasi eksternal: ${unassignedPatients.length}.`);
} finally {
  await disconnectDatabase();
}
