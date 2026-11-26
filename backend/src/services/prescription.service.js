/**
 * Memuat aturan bisnis dan proses data untuk fitur resep. Lapisan ini menjadi tempat proses domain dijalankan sebelum hasilnya dikirim kembali ke controller.
 */
import { Prescription } from '../models/Prescription.js';
import { Patient } from '../models/Patient.js';
import { Medication } from '../models/Medication.js';
import { PatientHistory } from '../models/PatientHistory.js';
import { StockBatch } from '../models/StockBatch.js';
import { StockTransaction } from '../models/StockTransaction.js';
import { AppError, conflict, forbidden, notFound } from '../utils/AppError.js';
import { createTransactionId, createLegacyPrescriptionId } from '../utils/ids.js';
import {
  notifyPrescriptionCreated,
  notifyPrescriptionUpdated,
  notifyPrescriptionDeleted,
  refreshStockNotifications,
} from './notification.service.js';
import { calculateAge } from '../utils/date.js';
import { normalizeBpjs, matchesRegisteredPatientIdentifiers } from '../utils/patient-identifiers.js';
import { requiresPatientFktpConfirmation } from '../utils/patient-assignment.js';
import { withKeyedLock } from '../utils/keyed-lock.js';
import { isPrescriptionMutationAllowed, wasPrescriptionCreatedBeforeAssignmentChange } from '../utils/prescription-mutation.js';

/**
 * Menyeragamkan nama pasien dengan memangkas spasi dan menyamakan huruf agar pencocokan data konsisten.
 */
function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Menyeragamkan nomor telepon dengan mengambil digit agar pencocokan pasien tidak bergantung pada tanda pemisah.
 */
function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Escapes visit number text before exact, case-insensitive duplicate lookup. */
function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Memeriksa nomor kunjungan secara global, termasuk resep yang tidak terlihat oleh dokter yang sedang login. */
export async function hasDuplicateVisitNumber(value) {
  const visitNumber = String(value || '').trim();
  if (!visitNumber) return false;

  const normalizedVisitNumber = visitNumber.toLocaleLowerCase('id-ID');
  const duplicate = await Prescription.findOne({
    $or: [
      { visitNumber: new RegExp(`^${escapeRegExp(visitNumber)}$`, 'i') },
      { visitNumberNormalized: normalizedVisitNumber },
    ],
    includeDeleted: true,
  }).select('_id').lean();

  return Boolean(duplicate);
}

/** Memastikan kedua identitas cocok dengan satu master pasien tanpa memperbarui identitas secara otomatis. */
async function resolvePatient(payload, user) {
  const name = String(payload.patientName || '').trim();
  const phone = String(payload.patientPhone || '').trim();
  const bpjs = normalizeBpjs(payload.bpjsNumber);
  const nik = String(payload.nik || '').replace(/\D/g, '');
  if (!/^[0-9+-]+$/.test(phone)) throw new AppError('Nomor telepon hanya boleh berisi angka, tanda +, atau tanda -.', 422, 'INVALID_PHONE_NUMBER');
  if (!/^\d{13}$/.test(bpjs)) throw new AppError('Nomor BPJS/JKN/KIS harus terdiri dari 13 digit angka.', 422, 'INVALID_BPJS_NUMBER');
  if (!/^\d{16}$/.test(nik)) throw new AppError('NIK harus terdiri dari 16 digit angka.', 422, 'INVALID_NIK');
  if (!name) throw new AppError('Nama pasien wajib diisi.', 422, 'PATIENT_NAME_REQUIRED');
  if (payload.dateOfBirth) {
    const birthDate = new Date(payload.dateOfBirth);
    if (Number.isNaN(birthDate.getTime()) || birthDate.getTime() > Date.now()) {
      throw new AppError('Tanggal lahir tidak valid.', 422, 'INVALID_DATE_OF_BIRTH');
    }
  }
  for (const [field, label] of [['weight', 'Berat badan'], ['height', 'Tinggi badan'], ['waistCircumference', 'Lingkar perut']]) {
    const value = payload.anthropometry?.[field];
    if (value !== undefined && value !== null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      throw new AppError(`${label} harus berupa angka nol atau lebih.`, 422, 'INVALID_ANTHROPOMETRY');
    }
  }

  const [byBpjs, byNik] = await Promise.all([
    Patient.findOne({ bpjsNumber: bpjs }),
    Patient.findOne({ nik }),
  ]);
  if (byBpjs && byNik && String(byBpjs._id) !== String(byNik._id)) {
    throw new AppError('Nomor BPJS/JKN/KIS dan NIK terdaftar pada pasien yang berbeda.', 409, 'PATIENT_IDENTITY_MISMATCH');
  }

  let patient = null;
  if (payload.patientId) {
    patient = await Patient.findById(payload.patientId);
    if (!patient) throw notFound('Pasien terdaftar tidak ditemukan.');
  } else {
    patient = byBpjs || byNik || null;
  }

  if (patient) {
    if (!matchesRegisteredPatientIdentifiers(patient, bpjs, nik)) {
      throw new AppError(
        'Nomor BPJS/JKN/KIS dan NIK pasien terdaftar tidak dapat diubah. Gunakan identitas yang tercatat pada data pasien.',
        422,
        'PATIENT_IDENTIFIERS_IMMUTABLE',
      );
    }
    if (byBpjs && String(byBpjs._id) !== String(patient._id)) {
      throw new AppError('No. BPJS/JKN/KIS sudah terdaftar pada pasien lain.', 409, 'PATIENT_IDENTITY_EXISTS');
    }
    if (byNik && String(byNik._id) !== String(patient._id)) {
      throw new AppError('NIK sudah terdaftar pada pasien lain.', 409, 'PATIENT_IDENTITY_EXISTS');
    }
    // Data BPJS/NIK pasien tetap mengikuti master; hanya data profil lain yang
    // masih kosong yang boleh dilengkapi dari formulir resep. Perpindahan penugasan
    // pasien harus dikonfirmasi terlebih dahulu melalui endpoint prefill khusus.
    if (!patient.dateOfBirth && payload.dateOfBirth) patient.dateOfBirth = new Date(payload.dateOfBirth);
    if (!patient.gender && payload.gender) patient.gender = String(payload.gender);
    if (!patient.address && payload.address) patient.address = String(payload.address).trim();
    if (!patient.allergyStatus && payload.allergy?.status) patient.allergyStatus = String(payload.allergy.status);
    if (!patient.allergyDetails && payload.allergy?.details) patient.allergyDetails = String(payload.allergy.details).trim();
    return patient;
  }

  try {
    return await Patient.create({
      name,
      nameNormalized: normalizeName(name),
      phone,
      phoneNormalized: normalizePhone(phone),
      bpjsNumber: bpjs,
      nik,
      dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : null,
      gender: String(payload.gender || ''),
      address: String(payload.address || '').trim(),
      allergyStatus: String(payload.allergy?.status || ''),
      allergyDetails: String(payload.allergy?.details || '').trim(),
      patientType: 'Kronis',
      assignedDoctorId: user._id,
      lastSeenAt: new Date(),
    });
  } catch (error) {
    if (error?.code === 11000) throw new AppError('Nomor BPJS/JKN/KIS atau NIK sudah terdaftar pada pasien lain.', 409, 'PATIENT_IDENTITY_EXISTS');
    throw error;
  }
}

/**
 * Membuat identifier resep kompatibilitas yang ditampilkan pada alur lama tanpa menggantikan identifier internal database.
 */
function publicLegacyId() {
  return createLegacyPrescriptionId();
}

/** Mencatat kegagalan notifikasi non-kritis tanpa mengubah hasil operasi resep yang telah tersimpan. */
function logNotificationFailure(operation, error) {
  console.error('[REMS_NOTIFICATION_FAILURE]', {
    operation,
    name: error?.name || 'Error',
    code: error?.code || 'NOTIFICATION_FAILED',
  });
}

const PRESCRIPTION_MUTATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Mengambil penugasan pasien dan catatan perpindahan terakhir untuk validasi mutasi resep. */
async function getPrescriptionMutationContext(prescription) {
  const [patient, latestAssignmentChange] = await Promise.all([
    Patient.findById(prescription.patientId).select('assignedDoctorId assignmentVersion').lean(),
    PatientHistory.findOne({ patientId: prescription.patientId, type: 'PenugasanDiperbarui' })
      .sort({ createdAt: -1, _id: -1 })
      .select('createdAt previousAssignedDoctorId performedBy')
      .lean(),
  ]);
  if (!patient) throw notFound('Data pasien untuk resep tidak ditemukan.');
  return { patient, latestAssignmentChange };
}

/** Menolak mutasi resep yang berasal dari versi penugasan FKTP sebelumnya. */
function ensurePrescriptionIsMutable({ prescription, patient, latestAssignmentChange, user, action }) {
  const lockedByTransfer = wasPrescriptionCreatedBeforeAssignmentChange({
    prescriptionAssignmentVersion: prescription.patientAssignmentVersion,
    currentAssignmentVersion: patient.assignmentVersion,
    prescriptionCreatedAt: prescription.createdAt,
    lastAssignmentChangeAt: latestAssignmentChange?.createdAt,
  });
  if (lockedByTransfer) {
    throw forbidden(
      'Resep dari penugasan FKTP sebelumnya hanya dapat dibaca sebagai riwayat dan tidak dapat diubah atau dihapus oleh Dokter FKTP mana pun.',
      'PRESCRIPTION_LOCKED_AFTER_FKTP_TRANSFER',
    );
  }
  const allowed = isPrescriptionMutationAllowed({
    createdBy: prescription.createdBy,
    assignedDoctorId: patient.assignedDoctorId,
    userId: user._id,
    prescriptionAssignmentVersion: prescription.patientAssignmentVersion,
    currentAssignmentVersion: patient.assignmentVersion,
    prescriptionCreatedAt: prescription.createdAt,
    lastAssignmentChangeAt: latestAssignmentChange?.createdAt,
  });
  if (!allowed) {
    throw forbidden(
      action === 'delete'
        ? 'Resep hanya dapat dihapus oleh Dokter FKTP pembuat resep selama pasien masih ditugaskan kepadanya.'
        : 'Resep hanya dapat diubah oleh Dokter FKTP pembuat resep selama pasien masih ditugaskan kepadanya.',
      'PRESCRIPTION_PATIENT_ASSIGNMENT_MISMATCH',
    );
  }
}

/**
 * Menghasilkan error yang sesuai ketika perubahan resep kalah dalam pemeriksaan compare-and-set.
 * Pemeriksaan ulang menjaga pesan dan batas bisnis tetap sama dengan validasi sebelum penulisan.
 */
async function throwPrescriptionMutationFailure({ id, user, action }) {
  const current = await Prescription.findById(id);
  if (!current) throw notFound('Resep tidak ditemukan.');
  const { patient, latestAssignmentChange } = await getPrescriptionMutationContext(current);
  ensurePrescriptionIsMutable({ prescription: current, patient, latestAssignmentChange, user, action });
  if (current.status === 'picked' || current.pickedAt) {
    throw new AppError(
      action === 'delete' ? 'Resep yang sudah ditebus tidak dapat dihapus.' : 'Resep yang sudah ditebus tidak dapat diubah.',
      422,
      'PRESCRIPTION_PICKED',
    );
  }
  if (Date.now() - new Date(current.createdAt).getTime() > PRESCRIPTION_MUTATION_WINDOW_MS) {
    throw new AppError(
      action === 'delete' ? 'Resep hanya dapat dihapus dalam 24 jam sejak dibuat.' : 'Resep hanya dapat diubah dalam 24 jam sejak dibuat.',
      422,
      action === 'delete' ? 'PRESCRIPTION_DELETE_WINDOW_EXPIRED' : 'PRESCRIPTION_EDIT_WINDOW_EXPIRED',
    );
  }
  throw conflict('Resep berubah saat diproses. Muat ulang data lalu coba kembali.', 'PRESCRIPTION_CONCURRENT_MODIFICATION');
}


/**
 * Memetakan satu baris obat resep ke field terstruktur dengan nama obat, jumlah, dosis, satuan, rute, aturan penggunaan, dan catatan.
 */
function buildMedicine(m, medication) {
  const quantity = Number(m.q);
  const duration = Number(m.dn || 1);

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(
      'Jumlah obat harus berupa angka minimal 1.',
      422,
      'INVALID_QUANTITY',
    );
  }

  if (!Number.isInteger(duration) || duration < 1) {
    throw new AppError(
      'Durasi harus berupa angka minimal 1.',
      422,
      'INVALID_DURATION',
    );
  }

  const doseInstruction = String(
    m.doseInstruction || m.aturanPakai || '',
  ).trim();
  if (!doseInstruction) {
    throw new AppError('Aturan pakai wajib dipilih untuk setiap obat.', 422, 'DOSE_INSTRUCTION_REQUIRED');
  }
  const notes = String(
    m.notes || m.catatanTambahan || '',
  ).trim();
  const administrationRoute = String(medication.administrationRoute || m.route || '').trim();
  if (!administrationRoute) {
    throw new AppError(
      'Rute pemberian obat belum diatur pada master obat oleh Apoteker.',
      422,
      'ADMINISTRATION_ROUTE_REQUIRED',
    );
  }

  return {
    medicationId: medication._id,
    medicationName: medication.name,
    quantity,
    unit: String(m.u || medication.unit),
    duration,
    durationUnit: String(m.du || 'hari'),
    doseInstruction,
    frequency: String(m.frequency || ''),
    dose: String(m.dose || ''),
    doseUnit: String(m.doseUnit || ''),
    route: administrationRoute,
    shake: String(m.shake || 'Tidak'),
    notes,
  };
}

/**
 * Memastikan pasien valid dan semua obat masih aktif, kemudian menyimpan resep berstatus pending beserta riwayat pasien serta notifikasi ke Apoteker. Pengurangan stok dilakukan terpisah saat penebusan.
 */
export async function createPrescription({ payload, user }) {
  // Do not require MongoDB transactions here. The application can run on a
  // normal standalone MongoDB instance as well as MongoDB Atlas replica sets.
  const visitNumber = String(payload.visitNumber || '').trim();
  const normalizedVisitNumber = visitNumber.toLocaleLowerCase('id-ID');
  if (await hasDuplicateVisitNumber(visitNumber)) {
    throw new AppError('Resep tidak dapat dikirim karena No. Kunjungan yang sama sudah ada.', 409, 'DUPLICATE_VISIT_NUMBER');
  }

  const resolvedPatient = await resolvePatient(payload, user);
  return withKeyedLock(String(resolvedPatient._id), async () => {
    const patient = await Patient.findById(resolvedPatient._id);
    if (!patient) throw notFound('Pasien tidak ditemukan.');
    if (requiresPatientFktpConfirmation({ assignedDoctorId: patient.assignedDoctorId, userId: user._id })) {
      throw forbidden(
        'Pasien masih ditugaskan kepada Dokter FKTP lain. Gunakan Ambil Data Sebelumnya dan selesaikan konfirmasi perpindahan FKTP sebelum membuat resep.',
        'PATIENT_FKTP_CONFIRMATION_REQUIRED',
      );
    }
    const previousPatientLastSeenAt = patient.lastSeenAt || null;
    const previousAssignedDoctorIdForRollback = patient.assignedDoctorId || null;

    const medicationIds = payload.meds.map((m) => String(m.medicationId || ''));
    const medicationDocs = await Medication.find({
      _id: { $in: medicationIds },
      active: true,
    });
    const byId = new Map(medicationDocs.map((medication) => [String(medication._id), medication]));

    if (medicationDocs.length !== new Set(medicationIds).size) {
      throw new AppError(
        'Satu atau beberapa obat tidak tersedia di sistem apotek.',
        422,
        'MEDICATION_NOT_AVAILABLE',
      );
    }

    const medications = payload.meds.map((m) => {
      const medication = byId.get(String(m.medicationId || ''));
      if (!medication) {
        throw new AppError(
          `Obat ${m.med || ''} tidak tersedia di sistem apotek.`,
          422,
          'MEDICATION_NOT_AVAILABLE',
        );
      }
      return buildMedicine(m, medication);
    });

    const createdAt = new Date();
    const latestAssignmentChange = await PatientHistory.findOne({
      patientId: patient._id,
      type: 'PenugasanDiperbarui',
    }).sort({ createdAt: -1, _id: -1 }).select('createdAt performedBy previousAssignedDoctorId').lean();
    const fktpCheck = latestAssignmentChange && String(latestAssignmentChange.performedBy) === String(user._id)
      ? {
          status: 'manually_confirmed',
          checkedAt: latestAssignmentChange.createdAt,
          checkedBy: user._id,
          previousAssignedDoctorId: latestAssignmentChange.previousAssignedDoctorId || null,
        }
      : { status: 'not_required', checkedAt: null, checkedBy: null, previousAssignedDoctorId: null };

    const prescriptionPatient = {
      name: String(payload.patientName || '').trim(),
      bpjsNumber: normalizeBpjs(payload.bpjsNumber),
      nik: String(payload.nik || '').replace(/\D/g, ''),
      phone: String(payload.patientPhone || '').trim(),
      dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : null,
      gender: String(payload.gender || ''),
      address: String(payload.address || '').trim(),
    };
    const patientSnapshot = {
      name: prescriptionPatient.name,
      bpjsNumber: prescriptionPatient.bpjsNumber,
      nik: prescriptionPatient.nik,
      phone: prescriptionPatient.phone,
      dateOfBirth: prescriptionPatient.dateOfBirth,
      age: calculateAge(prescriptionPatient.dateOfBirth, createdAt),
      gender: prescriptionPatient.gender,
      address: prescriptionPatient.address,
    };
    let created;
    try {
      created = await Prescription.create({
      legacyId: publicLegacyId(),
      patientId: patient._id,
      patientAssignmentVersion: Number.isInteger(patient.assignmentVersion) ? patient.assignmentVersion : 0,
      patientName: prescriptionPatient.name,
      patientPhone: prescriptionPatient.phone,
      bpjsNumber: prescriptionPatient.bpjsNumber,
      nik: prescriptionPatient.nik,
      patientSnapshot,
      fktpCheck,
      allergy: {
        status: String(payload.allergy?.status || patient.allergyStatus || ''),
        details: String(payload.allergy?.details || patient.allergyDetails || '').trim(),
      },
      anthropometry: {
        weight: payload.anthropometry?.weight === '' || payload.anthropometry?.weight == null ? null : Number(payload.anthropometry.weight),
        height: payload.anthropometry?.height === '' || payload.anthropometry?.height == null ? null : Number(payload.anthropometry.height),
        waistCircumference: payload.anthropometry?.waistCircumference === '' || payload.anthropometry?.waistCircumference == null ? null : Number(payload.anthropometry.waistCircumference),
      },
      soap: {
        subjective: String(payload.soap?.subjective || '').trim(),
        objective: String(payload.soap?.objective || '').trim(),
        assessment: String(payload.soap?.assessment || '').trim(),
        plan: String(payload.soap?.plan || '').trim(),
      },
      visitNumber,
      visitNumberNormalized: normalizedVisitNumber,
      diagnosis: payload.diagnosis.trim(),
      medications,
      status: 'pending',
      createdBy: user._id,
      notificationSent: false,
      createdAt,
      });
    } catch (error) {
      if (error?.code === 11000 && (error?.keyPattern?.visitNumberNormalized || String(error?.message || '').includes('visitNumberNormalized'))) {
        throw new AppError('Resep tidak dapat dikirim karena No. Kunjungan yang sama sudah ada.', 409, 'DUPLICATE_VISIT_NUMBER');
      }
      throw error;
    }

    // Penugasan lintas FKTP harus sudah diselesaikan melalui modal konfirmasi
    // sebelum data klinis resep sebelumnya dapat diambil dan resep baru dibuat.
    // Pasien baru atau pasien tanpa penugasan ditugaskan kepada dokter pertama yang melayani.
    try {
      if (!patient.assignedDoctorId) patient.assignedDoctorId = user._id;
      patient.lastSeenAt = createdAt;
      await patient.save();
    } catch (error) {
      patient.assignedDoctorId = previousAssignedDoctorIdForRollback;
      patient.lastSeenAt = previousPatientLastSeenAt;
      await patient.save().catch((rollbackError) => {
        console.error('[REMS_PATIENT_ASSIGNMENT_ROLLBACK_FAILURE]', rollbackError?.message || rollbackError);
      });
      await Prescription.deleteOne({ _id: created._id }).catch((cleanupError) => {
        console.error('[REMS_PRESCRIPTION_ROLLBACK_FAILURE]', cleanupError?.message || cleanupError);
      });
      throw error;
    }

    await PatientHistory.create({
      patientId: patient._id,
      prescriptionId: created._id,
      type: 'ResepDibuat',
      note: `${created.legacyId} dibuat`,
      performedBy: user._id,
      performedByName: user.username,
    });

    try {
      await notifyPrescriptionCreated(created);
    } catch (error) {
      logNotificationFailure('prescription.created', error);
    }

    return Prescription.findById(created._id)
      .populate({ path: 'createdBy', select: 'username', match: { includeDeleted: true } })
      .lean();
  });
}

/**
 * Mengizinkan hanya pembuat resep mengubah resep yang belum ditebus dan masih dalam 24 jam sejak createdAt. Obat harus tetap tersedia/aktif, lalu perubahan dicatat pada riwayat dan notifikasi.
 */
export async function updatePrescription({ id, payload, user }) {
  const initial = await Prescription.findById(id).select('patientId');
  if (!initial) throw notFound('Resep tidak ditemukan.');

  return withKeyedLock(String(initial.patientId), async () => {
    const p = await Prescription.findById(id);
    if (!p) throw notFound('Resep tidak ditemukan.');
    const { patient, latestAssignmentChange } = await getPrescriptionMutationContext(p);
    ensurePrescriptionIsMutable({ prescription: p, patient, latestAssignmentChange, user, action: 'update' });
    if (p.status === 'picked' || p.pickedAt) {
      throw new AppError('Resep yang sudah ditebus tidak dapat diubah.', 422, 'PRESCRIPTION_PICKED');
    }
    if (Date.now() - new Date(p.createdAt).getTime() > PRESCRIPTION_MUTATION_WINDOW_MS) {
      throw new AppError('Resep hanya dapat diubah dalam 24 jam sejak dibuat.', 422, 'PRESCRIPTION_EDIT_WINDOW_EXPIRED');
    }

    const medicationIds = payload.meds.map((m) => String(m.medicationId || ''));
    const medications = await Medication.find({
      _id: { $in: medicationIds },
      active: true,
    });
    const byId = new Map(medications.map((medication) => [String(medication._id), medication]));

    if (medications.length !== new Set(medicationIds).size) {
      throw new AppError('Satu atau beberapa obat tidak tersedia di sistem apotek.', 422, 'MEDICATION_NOT_AVAILABLE');
    }

    const nextMedications = payload.meds.map((m) => {
      const med = byId.get(String(m.medicationId || ''));
      if (!med) {
        throw new AppError(`Obat ${m.med || ''} tidak tersedia di sistem apotek.`, 422, 'MEDICATION_NOT_AVAILABLE');
      }
      return buildMedicine(m, med);
    });

    // Re-check status, owner, and the original 24-hour boundary in the write
    // itself. A pharmacist dispensing at the same time must win or lose cleanly;
    // an edit based on a stale pending snapshot must never modify a picked Rx.
    const mutationFilter = {
      _id: p._id,
      createdBy: user._id,
      status: 'pending',
      pickedAt: null,
      ...(p.createdAt
        ? { createdAt: { $gte: new Date(Date.now() - PRESCRIPTION_MUTATION_WINDOW_MS) } }
        : { createdAt: { $exists: false } }),
    };
    const updated = await Prescription.findOneAndUpdate(
      mutationFilter,
      {
        $set: {
          diagnosis: payload.diagnosis.trim(),
          medications: nextMedications,
          updatedBy: user._id,
        },
      },
      { new: true, runValidators: true },
    );

    if (!updated) {
      await throwPrescriptionMutationFailure({ id, user, action: 'update' });
    }

    await PatientHistory.create({
      patientId: updated.patientId,
      prescriptionId: updated._id,
      type: 'ResepDiubah',
      note: `${updated.legacyId} diubah`,
      performedBy: user._id,
      performedByName: user.username,
    });

    try {
      await notifyPrescriptionUpdated(updated, user._id);
    } catch (error) {
      logNotificationFailure('prescription.updated', error);
    }

    return Prescription.findById(updated._id)
      .populate({ path: 'createdBy', select: 'username', match: { includeDeleted: true } })
      .populate({ path: 'updatedBy', select: 'username', match: { includeDeleted: true } })
      .lean();
  });
}

/**
 * Mengizinkan hanya pembuat resep menghapus resep yang belum ditebus dan masih dalam 24 jam sejak createdAt. Penghapusan bersifat lunak dan tetap dicatat pada riwayat serta notifikasi.
 */
export async function deletePrescription({ id, user }) {
  const initial = await Prescription.findById(id).select('patientId');
  if (!initial) throw notFound('Resep tidak ditemukan.');

  return withKeyedLock(String(initial.patientId), async () => {
    const p = await Prescription.findById(id);
    if (!p) throw notFound('Resep tidak ditemukan.');
    const { patient, latestAssignmentChange } = await getPrescriptionMutationContext(p);
    ensurePrescriptionIsMutable({ prescription: p, patient, latestAssignmentChange, user, action: 'delete' });
    if (p.status === 'picked' || p.pickedAt) {
      throw new AppError('Resep yang sudah ditebus tidak dapat dihapus.', 422, 'PRESCRIPTION_PICKED');
    }
    if (Date.now() - new Date(p.createdAt).getTime() > PRESCRIPTION_MUTATION_WINDOW_MS) {
      throw new AppError('Resep hanya dapat dihapus dalam 24 jam sejak dibuat.', 422, 'PRESCRIPTION_DELETE_WINDOW_EXPIRED');
    }

    const deletedAt = new Date();
    const mutationFilter = {
      _id: p._id,
      createdBy: user._id,
      status: 'pending',
      pickedAt: null,
      ...(p.createdAt
        ? { createdAt: { $gte: new Date(Date.now() - PRESCRIPTION_MUTATION_WINDOW_MS) } }
        : { createdAt: { $exists: false } }),
    };
    const deleted = await Prescription.findOneAndUpdate(
      mutationFilter,
      { $set: { isDeleted: true, deletedAt, deletedBy: user._id } },
      { new: true, runValidators: true },
    );
    if (!deleted) {
      await throwPrescriptionMutationFailure({ id, user, action: 'delete' });
    }

    try {
      await PatientHistory.create({
        patientId: deleted.patientId,
        prescriptionId: deleted._id,
        type: 'ResepDihapus',
        note: `${deleted.legacyId} dihapus`,
        performedBy: user._id,
        performedByName: user.username,
      });
    } catch (error) {
      // If the audit row cannot be persisted, restore the soft-delete state so
      // the API does not report failure while leaving a deleted prescription.
      const restored = await Prescription.findOneAndUpdate(
        { _id: deleted._id, isDeleted: true, deletedBy: user._id, deletedAt },
        { $set: { isDeleted: false, deletedAt: null, deletedBy: null } },
        { new: true },
      ).catch(() => null);
      if (!restored) {
        console.error('[REMS_COMPENSATION_FAILURE] prescription.delete', {
          prescriptionId: String(deleted._id),
        });
      }
      throw error;
    }

    try {
      await notifyPrescriptionDeleted(deleted, user._id);
    } catch (error) {
      logNotificationFailure('prescription.deleted', error);
    }
  });
}

/**
 * Mengurutkan batch dengan prinsip FEFO: tanggal kedaluwarsa terdekat digunakan lebih dahulu. Jika tanggal sama, batch yang lebih dahulu diterima diprioritaskan (FIFO); batch tanpa tanggal kedaluwarsa berada di urutan akhir.
 */
function batchSort(a, b) {
  const expiryA = a.expiryDate
    ? new Date(a.expiryDate).getTime()
    : Infinity;
  const expiryB = b.expiryDate
    ? new Date(b.expiryDate).getTime()
    : Infinity;

  if (expiryA !== expiryB) {
    return expiryA - expiryB;
  }

  return (
    new Date(
      a.receivedAt || a.createdAt || 0,
    ).getTime() -
    new Date(
      b.receivedAt || b.createdAt || 0,
    ).getTime()
  );
}

/**
 * Mengompensasi penebusan yang gagal dengan mengembalikan jumlah ke batch yang sudah dikurangi dan menghapus transaksi keluar yang sempat dibuat.
 */
async function rollbackDispense({ deductions, transactionIds, prescriptionId, userId, pickedAt, restorePrescription, historyCreatedAt }) {
  const operations = [];
  if (deductions.length) {
    operations.push(
      StockBatch.bulkWrite(
        deductions.map(({ batchId, quantity }) => ({
          updateOne: {
            filter: { _id: batchId },
            update: { $inc: { quantity } },
          },
        })),
        { ordered: false },
      ),
    );
  }
  if (transactionIds.length) {
    operations.push(StockTransaction.deleteMany({ transactionId: { $in: transactionIds } }));
  }
  if (restorePrescription) {
    operations.push(Prescription.findOneAndUpdate(
      { _id: prescriptionId, status: 'picked', pickedBy: userId, pickedAt },
      { $set: { status: 'pending', pickedAt: null, pickedBy: null } },
      { new: true },
    ));
  }
  if (historyCreatedAt) {
    operations.push(PatientHistory.deleteMany({
      prescriptionId,
      type: 'ResepDitebus',
      performedBy: userId,
      createdAt: { $gte: historyCreatedAt },
    }));
  }

  const results = await Promise.allSettled(operations);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Failed to compensate an incomplete prescription dispense operation.');
    }
  }
}

/**
 * Memastikan resep belum pernah ditebus dan stok layak pakai mencukupi untuk seluruh baris obat. Pengurangan batch memakai FEFO serta update bersyarat agar permintaan bersamaan tidak mengambil stok yang sama; perubahan parsial dibatalkan bila penebusan gagal.
 */
export async function dispensePrescription({ id, user }) {
  const prescription = await Prescription.findById(id);

  if (!prescription) {
    throw notFound('Resep tidak ditemukan.');
  }

  if (prescription.status === 'picked' || prescription.pickedAt) {
    throw conflict(
      'Resep sudah ditebus.',
      'PRESCRIPTION_ALREADY_PICKED',
    );
  }

  const medicationIds = prescription.medications.map((m) => m.medicationId);
  const currentDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const todayStartUtc = new Date(`${currentDate}T00:00:00.000Z`);
  const batches = await StockBatch.find({
    medicationId: { $in: medicationIds },
    quantity: { $gt: 0 },
    $or: [{ expiryDate: null }, { expiryDate: { $gte: todayStartUtc } }],
  });

  const byMed = new Map();
  for (const batch of batches) {
    const key = String(batch.medicationId);
    if (!byMed.has(key)) byMed.set(key, []);
    byMed.get(key).push(batch);
  }

  // Aggregate repeated prescription lines for the same medication before any
  // write. Without this, each line could pass the individual stock check even
  // when their combined quantity exceeds the available stock.
  const requiredByMedication = new Map();
  for (const medicine of prescription.medications) {
    const key = String(medicine.medicationId);
    requiredByMedication.set(
      key,
      (requiredByMedication.get(key) || 0) + Number(medicine.quantity),
    );
  }

  for (const [medicationId, required] of requiredByMedication) {
    const available = (byMed.get(medicationId) || []).reduce(
      (sum, batch) => sum + Number(batch.quantity || 0),
      0,
    );
    if (available < required) {
      const medicine = prescription.medications.find(
        (item) => String(item.medicationId) === medicationId,
      );
      throw new AppError(
        `Stok ${medicine?.medicationName || 'obat'} tidak mencukupi.`,
        422,
        'INSUFFICIENT_STOCK',
      );
    }
  }

  const deductions = [];
  const transactions = [];
  const transactionIds = [];
  const now = new Date();
  let prescriptionClaimed = false;

  try {
    for (const medicine of prescription.medications) {
      const ordered = [...(byMed.get(String(medicine.medicationId)) || [])].sort(batchSort);
      let remaining = Number(medicine.quantity);

      for (const batch of ordered) {
        if (remaining <= 0) break;

        let take = Math.min(Number(batch.quantity), remaining);
        let updatedBatch = null;

        // A compare-and-decrement update prevents concurrent dispensings or
        // withdrawals from taking the same units from a stale batch snapshot.
        // Re-read and retry a smaller amount when another request changed it.
        for (let attempt = 0; attempt < 4 && take > 0; attempt += 1) {
          updatedBatch = await StockBatch.findOneAndUpdate(
            {
              _id: batch._id,
              medicationId: medicine.medicationId,
              quantity: { $gte: take },
            },
            { $inc: { quantity: -take } },
            { new: true, runValidators: true },
          );
          if (updatedBatch) break;

          const latestBatch = await StockBatch.findById(batch._id)
            .select('quantity')
            .lean();
          if (!latestBatch || Number(latestBatch.quantity) <= 0) {
            take = 0;
            break;
          }
          take = Math.min(Number(latestBatch.quantity), remaining);
        }

        if (!updatedBatch || take <= 0) continue;

        deductions.push({ batchId: batch._id, quantity: take });
        remaining -= take;
        const id = createTransactionId();
        transactionIds.push(id);
        transactions.push({
          transactionId: id,
          medicationId: medicine.medicationId,
          type: 'out',
          quantity: take,
          unit: medicine.unit,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          reference: prescription.legacyId,
          prescriptionId: prescription._id,
          performedBy: user._id,
          officer: user.username,
        });
      }

      if (remaining > 0) {
        throw new AppError(
          `Stok ${medicine.medicationName} berubah saat proses penebusan. Silakan periksa stok lalu coba kembali.`,
          409,
          'STOCK_CHANGED_DURING_DISPENSE',
        );
      }
    }

    if (transactions.length) {
      await StockTransaction.insertMany(transactions);
    }

    // Compare-and-set prevents two requests from successfully redeeming the
    // same prescription after both have read its initial pending state.
    const updatedPrescription = await Prescription.findOneAndUpdate(
      { _id: prescription._id, status: 'pending', pickedAt: null },
      { $set: { status: 'picked', pickedAt: now, pickedBy: user._id } },
      { new: true, runValidators: true },
    );

    if (!updatedPrescription) {
      throw conflict('Resep sudah ditebus.', 'PRESCRIPTION_ALREADY_PICKED');
    }
    prescriptionClaimed = true;

    // Keep the core status change, stock deductions, transaction rows, and
    // patient history in the same compensation boundary on standalone MongoDB.
    await PatientHistory.create({
      patientId: prescription.patientId,
      prescriptionId: prescription._id,
      type: 'ResepDitebus',
      note: prescription.legacyId,
      performedBy: user._id,
      performedByName: user.username,
    });
  } catch (error) {
    // MongoDB transactions are not available on every standalone local setup.
    // Compensate writes if the dispense cannot be completed in this request.
    await rollbackDispense({
      deductions,
      transactionIds,
      prescriptionId: prescription._id,
      userId: user._id,
      pickedAt: now,
      restorePrescription: prescriptionClaimed,
      historyCreatedAt: prescriptionClaimed ? now : null,
    });
    throw error;
  }

  try {
    await refreshStockNotifications();
  } catch (error) {
    // Stock reminders are derived notifications and are refreshed again by
    // the scheduled/startup reconciliation; they must not turn a completed
    // dispense into an apparent failed request.
    logNotificationFailure('stock.refresh-after-dispense', error);
  }

  return Prescription.findById(prescription._id)
    .populate({ path: 'createdBy', select: 'username', match: { includeDeleted: true } })
    .populate({ path: 'updatedBy', select: 'username', match: { includeDeleted: true } })
    .populate({ path: 'pickedBy', select: 'username', match: { includeDeleted: true } })
    .lean();
}
