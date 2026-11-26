/**
 * Menetapkan Dokter FKTP pertama untuk pasien yang belum memiliki penugasan.
 * Perpindahan pasien yang sudah ditugaskan harus melalui konfirmasi di aplikasi REMS.
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Patient } from '../src/models/Patient.js';
import { User } from '../src/models/User.js';

function readArguments(argv) {
  return Object.fromEntries(argv.map((argument) => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }));
}

const args = readArguments(process.argv.slice(2));
const patientId = String(args['patient-id'] || '').trim();
const doctorUsername = String(args.doctor || '').trim().toLowerCase();

if (!mongoose.isValidObjectId(patientId) || !doctorUsername) {
  console.error('Gunakan: npm run assign:patient-doctor -- --patient-id=ObjectId --doctor=username');
  process.exitCode = 1;
} else {
  await connectDatabase();
  try {
    const [patient, doctor] = await Promise.all([
      Patient.findById(patientId),
      User.findOne({ usernameNormalized: doctorUsername, role: 'doctor', active: true }).select('_id username'),
    ]);
    if (!patient) throw new Error('Pasien dengan ID tersebut tidak ditemukan.');
    if (!doctor) throw new Error('Akun Dokter FKTP aktif tidak ditemukan.');
    if (patient.assignedDoctorId && String(patient.assignedDoctorId) !== String(doctor._id)) {
      throw new Error('Pasien sudah ditugaskan kepada Dokter FKTP lain. Gunakan Ambil Data Sebelumnya dan konfirmasi perpindahan FKTP di aplikasi.');
    }
    if (!patient.assignedDoctorId) {
      patient.assignedDoctorId = doctor._id;
      if (!Number.isInteger(patient.assignmentVersion)) patient.assignmentVersion = 0;
      await patient.save();
    }
    console.log(`Penanggung jawab pasien ${patient._id} adalah Dokter FKTP ${doctor.username}.`);
  } finally {
    await disconnectDatabase();
  }
}
