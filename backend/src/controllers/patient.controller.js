/**
 * Menangani permintaan dan respons HTTP untuk fitur pasien. Controller meneruskan pekerjaan domain ke service dan mengembalikan hasil dengan format API.
 */
import { Patient } from '../models/Patient.js';
import { Prescription } from '../models/Prescription.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPatientReadFilter } from '../utils/access-scopes.js';
import { AppError, notFound } from '../utils/AppError.js';
import { normalizeBpjs, normalizeNik, isRegisteredPatientIdentityMatch } from '../utils/patient-identifiers.js';
import { buildPatientPrescriptionPrefill } from '../utils/patient-prefill.js';
import { requiresPatientFktpConfirmation } from '../utils/patient-assignment.js';
import { PatientHistory } from '../models/PatientHistory.js';
import { Activity } from '../models/Activity.js';
import { recordActivity } from '../services/activity.service.js';
import { withKeyedLock } from '../utils/keyed-lock.js';

export const listPatients = asyncHandler(async (req, res) => {
  const items = await Patient.find(getPatientReadFilter({ role: req.authUser.role, userId: req.authUser._id }))
    .sort({ updatedAt: -1 })
    .lean();
  const data = Object.fromEntries(items.map((p) => {
    const patient = {
      id: String(p._id),
      name: p.name,
      bpjsNumber: p.bpjsNumber || '',
      nik: p.nik || '',
      phone: p.phone,
      dateOfBirth: p.dateOfBirth || null,
      gender: p.gender || '',
      address: p.address || '',
      patientType: p.patientType,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      lastSeen: p.lastSeenAt,
    };
    // Alergi merupakan data klinis dan tidak dikirim melalui daftar pasien.
    // Data klinis resep sebelumnya hanya dapat diambil melalui endpoint prefill
    // setelah penugasan pasien sesuai dengan dokter yang sedang login.
    if (req.authUser.role === 'pharmacy') {
      patient.allergyStatus = p.allergyStatus || '';
      patient.allergyDetails = p.allergyDetails || '';
    }
    return [String(p._id), patient];
  }));
  res.json({ success: true, data });
});


/**
 * Memeriksa status pendaftaran identitas tanpa mengirimkan data pasien atau data klinis.
 * Endpoint ini memungkinkan tombol Ambil Data Sebelumnya aktif hanya untuk pasien master yang benar-benar terdaftar.
 */
export const checkPatientRegistration = asyncHandler(async (req, res) => {
  const rawBpjs = String(req.query.bpjsNumber || '').trim();
  const rawNik = String(req.query.nik || '').trim();
  const bpjsNumber = normalizeBpjs(rawBpjs);
  const nik = normalizeNik(rawNik);

  const hasInvalidBpjs = Boolean(rawBpjs) && !/^\d{13}$/.test(bpjsNumber);
  const hasInvalidNik = Boolean(rawNik) && !/^\d{16}$/.test(nik);
  if ((!bpjsNumber && !nik) || hasInvalidBpjs || hasInvalidNik) {
    res.json({ success: true, data: { registered: false } });
    return;
  }

  const identityFilters = [];
  if (bpjsNumber) identityFilters.push({ bpjsNumber });
  if (nik) identityFilters.push({ nik });

  const matches = await Patient.find({ $or: identityFilters })
    .select('bpjsNumber nik')
    .limit(2)
    .lean();

  res.json({
    success: true,
    data: { registered: isRegisteredPatientIdentityMatch(matches, bpjsNumber, nik) },
  });
});

/** Memvalidasi identitas dan menemukan satu data pasien yang sesuai. */
async function findPatientByIdentifiers({ bpjsInput, nikInput }) {
  const bpjsNumber = normalizeBpjs(bpjsInput);
  const nik = normalizeNik(nikInput);

  if (!bpjsNumber && !nik) {
    throw new AppError('Masukkan No. BPJS/JKN/KIS atau NIK pasien terlebih dahulu.', 422, 'PATIENT_IDENTIFIER_REQUIRED');
  }
  if (bpjsNumber && !/^\d{13}$/.test(bpjsNumber)) {
    throw new AppError('No. BPJS/JKN/KIS harus terdiri dari 13 digit angka.', 422, 'INVALID_BPJS_NUMBER');
  }
  if (nik && !/^\d{16}$/.test(nik)) {
    throw new AppError('NIK harus terdiri dari 16 digit angka.', 422, 'INVALID_NIK');
  }

  const identityFilters = [];
  if (bpjsNumber) identityFilters.push({ bpjsNumber });
  if (nik) identityFilters.push({ nik });
  const matches = await Patient.find({ $or: identityFilters }).limit(2).lean();

  if (matches.length > 1) {
    throw new AppError('No. BPJS/JKN/KIS dan NIK terdaftar pada pasien yang berbeda.', 409, 'PATIENT_IDENTITY_MISMATCH');
  }

  const patient = matches[0];
  if (!patient) throw notFound('Pasien dengan identitas tersebut belum terdaftar.');

  if (bpjsNumber && patient.bpjsNumber && normalizeBpjs(patient.bpjsNumber) !== bpjsNumber) {
    throw new AppError('No. BPJS/JKN/KIS tidak sesuai dengan data pasien yang terdaftar.', 409, 'PATIENT_IDENTITY_MISMATCH');
  }
  if (nik && patient.nik && normalizeNik(patient.nik) !== nik) {
    throw new AppError('NIK tidak sesuai dengan data pasien yang terdaftar.', 409, 'PATIENT_IDENTITY_MISMATCH');
  }
  return patient;
}

/**
 * Mengambil data resep terakhir hanya jika pasien belum ditugaskan kepada dokter lain.
 * Apabila penugasan masih berada pada dokter lain, respons hanya meminta konfirmasi dan tidak memuat identitas rinci maupun data klinis.
 */
export const getPrescriptionPrefill = asyncHandler(async (req, res) => {
  const patient = await findPatientByIdentifiers({
    bpjsInput: req.query.bpjsNumber,
    nikInput: req.query.nik,
  });

  if (requiresPatientFktpConfirmation({ assignedDoctorId: patient.assignedDoctorId, userId: req.authUser._id })) {
    res.json({
      success: true,
      data: {
        confirmationRequired: true,
      },
    });
    return;
  }

  const latestPrescription = await Prescription.findOne({ patientId: patient._id })
    .sort({ createdAt: -1, _id: -1 })
    .lean();

  const data = buildPatientPrescriptionPrefill({ patient, latestPrescription });
  res.json({ success: true, data: { ...data, confirmationRequired: false } });
});

/**
 * Memperbarui penugasan pasien setelah Dokter FKTP menyatakan telah memeriksa FKTP pasien melalui Mobile JKN.
 * Perubahan assignment, PatientHistory, dan Activity dicatat sebelum akses prefill diizinkan.
 */
export const confirmPatientFktpTransfer = asyncHandler(async (req, res) => {
  if (req.body?.confirmed !== true) {
    throw new AppError('Konfirmasi perpindahan FKTP harus diberikan melalui modal.', 400, 'PATIENT_FKTP_CONFIRMATION_REQUIRED');
  }

  const matchedPatient = await findPatientByIdentifiers({
    bpjsInput: req.body?.bpjsNumber,
    nikInput: req.body?.nik,
  });

  return withKeyedLock(String(matchedPatient._id), async () => {
    const patient = await Patient.findById(matchedPatient._id);
    if (!patient) throw notFound('Pasien dengan identitas tersebut belum terdaftar.');
    const currentDoctorId = String(req.authUser._id);
    const previousDoctorId = patient.assignedDoctorId ? String(patient.assignedDoctorId) : '';

    if (previousDoctorId === currentDoctorId) {
      res.json({ success: true, data: { confirmed: true, assignmentChanged: false } });
      return;
    }

    if (!previousDoctorId) {
      res.json({ success: true, data: { confirmed: true, assignmentChanged: false } });
      return;
    }

    // Compare-and-set mencegah penugasan tertimpa apabila ada perubahan bersamaan.
    const previousAssignmentVersion = Number.isInteger(patient.assignmentVersion) ? patient.assignmentVersion : 0;
    const previousAssignmentChangedAt = patient.assignmentChangedAt || null;
    const assignmentChangedAt = new Date();
    const updatedPatient = await Patient.findOneAndUpdate(
      {
        _id: patient._id,
        assignedDoctorId: patient.assignedDoctorId,
        $or: [
          { assignmentVersion: previousAssignmentVersion },
          { assignmentVersion: { $exists: false } },
        ],
      },
      {
        $set: { assignedDoctorId: req.authUser._id, assignmentChangedAt },
        $inc: { assignmentVersion: 1 },
      },
      { new: true },
    );

    if (!updatedPatient) {
      const currentPatient = await Patient.findById(patient._id).select('assignedDoctorId assignmentVersion').lean();
      if (currentPatient?.assignedDoctorId && String(currentPatient.assignedDoctorId) === currentDoctorId) {
        res.json({ success: true, data: { confirmed: true, assignmentChanged: false } });
        return;
      }
      throw new AppError(
        'Penugasan pasien berubah saat konfirmasi diproses. Periksa kembali informasi FKTP melalui Mobile JKN lalu ulangi.',
        409,
        'PATIENT_ASSIGNMENT_CHANGED',
      );
    }

    let patientHistory = null;
    let activity = null;
    try {
      patientHistory = await PatientHistory.create({
        patientId: patient._id,
        type: 'PenugasanDiperbarui',
        note: 'Dokter FKTP menyatakan telah memeriksa informasi FKTP pasien melalui aplikasi Mobile JKN. Penugasan internal diperbarui berdasarkan konfirmasi manual; REMS tidak melakukan verifikasi langsung ke BPJS Kesehatan.',
        performedBy: req.authUser._id,
        previousAssignedDoctorId: patient.assignedDoctorId || null,
        performedByName: req.authUser.username,
      });
      activity = await recordActivity({
        user: req.authUser,
        action: `Mengonfirmasi perpindahan FKTP pasien ${patient.name}.`,
      });
    } catch (error) {
      await Patient.updateOne(
        { _id: patient._id, assignedDoctorId: req.authUser._id, assignmentVersion: previousAssignmentVersion + 1 },
        {
          $set: {
            assignedDoctorId: patient.assignedDoctorId,
            assignmentVersion: previousAssignmentVersion,
            assignmentChangedAt: previousAssignmentChangedAt,
          },
        },
      ).catch((rollbackError) => console.error('[REMS_PATIENT_ASSIGNMENT_ROLLBACK_FAILURE]', rollbackError?.message || rollbackError));
      if (patientHistory?._id) {
        await PatientHistory.deleteOne({ _id: patientHistory._id }).catch(() => null);
      }
      if (activity?._id) {
        await Activity.deleteOne({ _id: activity._id }).catch(() => null);
      }
      throw error;
    }

    res.json({
      success: true,
      data: {
        confirmed: true,
        assignmentChanged: true,
        patientId: String(updatedPatient._id),
        checkedAt: activity.createdAt,
      },
    });
  });
});
