/**
 * Memuat aturan bisnis dan proses data untuk fitur bootstrap. Lapisan ini menjadi tempat proses domain dijalankan sebelum hasilnya dikirim kembali ke controller.
 */
import { User } from '../models/User.js';
import { Patient } from '../models/Patient.js';
import { Prescription } from '../models/Prescription.js';
import { Medication } from '../models/Medication.js';
import { StockBatch } from '../models/StockBatch.js';
import { StockTransaction } from '../models/StockTransaction.js';
import { PatientHistory } from '../models/PatientHistory.js';
import { ChronicBook } from '../models/ChronicBook.js';
import { Activity } from '../models/Activity.js';
import { SystemOption } from '../models/SystemOption.js';
import { listNotifications } from './notification.service.js';
import { DEFAULT_DOSE_OPTIONS } from '../utils/constants.js';
import { getPatientReadFilter, getPrescriptionReadFilter } from '../utils/access-scopes.js';

/**
 * Memetakan resep ke struktur data yang dipakai oleh API atau komponen pemanggil.
 */
const mapPrescription = (p) => ({
  _id: String(p._id),
  id: p.legacyId || `RX${String(p._id).slice(-7)}`,
  patientId: String(p.patientId),
  patientName: p.patientName || '',
  patientPhone: p.patientPhone || '',
  bpjsNumber: p.bpjsNumber || '',
  nik: p.nik || p.patientSnapshot?.nik || '',
  patientSnapshot: p.patientSnapshot || {},
  fktpCheck: {
    status: p.fktpCheck?.status || 'not_required',
    checkedAt: p.fktpCheck?.checkedAt || null,
  },
  allergy: p.allergy || {},
  anthropometry: p.anthropometry || {},
  soap: p.soap || {},
  visitNumber: p.visitNumber || '',
  diagnosis: p.diagnosis,
  meds: (p.medications || []).map((m) => ({
    _id: m.medicationId ? String(m.medicationId) : undefined,
    medicationId: m.medicationId ? String(m.medicationId) : undefined,
    med: m.medicationName,
    q: m.quantity,
    u: m.unit,
    dn: m.duration,
    du: m.durationUnit,
    doseInstruction: m.doseInstruction,
    aturanPakai: m.doseInstruction,
    frequency: m.frequency,
    dose: m.dose,
    doseUnit: m.doseUnit,
    route: m.route,
    shake: m.shake,
    notes: m.notes,
    catatanTambahan: m.notes,
  })),
  status: p.status,
  createdBy: p.createdBy?.username || '',
  createdById: p.createdBy?._id ? String(p.createdBy._id) : String(p.createdBy),
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  updatedBy: p.updatedBy?.username || '',
  pickedAt: p.pickedAt,
  pickedBy: p.pickedBy?.username || '',
  notificationSent: Boolean(p.notificationSent),
});

/**
 * Memetakan pasien ke struktur data yang dipakai oleh API atau komponen pemanggil.
 */
function mapPatients(items, { includeAllergy = false } = {}) {
  return Object.fromEntries(items.map((p) => {
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
    if (includeAllergy) {
      patient.allergyStatus = p.allergyStatus || '';
      patient.allergyDetails = p.allergyDetails || '';
    }
    return [String(p._id), patient];
  }));
}

/**
 * Memetakan kronis books ke struktur data yang dipakai oleh API atau komponen pemanggil.
 */
function mapChronicBooks(items) {
  return Object.fromEntries(items.map((b) => {
    const patient = b.patientId && typeof b.patientId === 'object' ? b.patientId : null;
    const patientId = patient?._id ? String(patient._id) : String(b.patientId);
    return [patientId, {
      patientId,
      patientName: patient?.name || '',
      fileName: b.fileName,
      fileData: `/api/files/${b.fileId}`,
      fileUrl: `/api/files/${b.fileId}`,
      uploadedAt: b.uploadedAt || b.createdAt,
      uploadedBy: b.uploadedBy?.username || '',
      bpjsNumber: patient?.bpjsNumber || '',
      _id: String(b._id),
      fileId: String(b.fileId),
    }];
  }));
}

/**
 * Memetakan riwayat ke struktur data yang dipakai oleh API atau komponen pemanggil.
 */
function mapHistory(items) {
  const map = {};
  for (const h of items) {
    const key = String(h.patientId);
    if (!map[key]) map[key] = [];
    map[key].push({
      _id: String(h._id),
      tISO: h.createdAt,
      tDisplay: new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(h.createdAt)) + ' WITA',
      type: h.type,
      note: h.note,
      by: h.performedByName,
      prescriptionId: h.prescriptionId ? String(h.prescriptionId) : null,
    });
  }
  return map;
}

/**
 * Memetakan stok ke struktur data yang dipakai oleh API atau komponen pemanggil.
 */
function mapStock(meds, batches) {
  const byMedication = new Map();
  for (const batch of batches) {
    const key = String(batch.medicationId);
    if (!byMedication.has(key)) byMedication.set(key, []);
    byMedication.get(key).push({
      _id: String(batch._id),
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate ? new Date(batch.expiryDate).toISOString().slice(0, 10) : '',
      qty: batch.quantity,
      receivedAt: batch.receivedAt,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    });
  }
  return Object.fromEntries(meds.map((med) => {
    const medBatches = byMedication.get(String(med._id)) || [];
    const qty = medBatches.reduce((sum, b) => sum + Number(b.qty || 0), 0);
    return [String(med._id), {
      _id: String(med._id),
      id: med.legacyId || String(med._id),
      name: med.name,
      distributor: med.distributor,
      unit: med.unit,
      administrationRoute: med.administrationRoute || '',
      qty,
      minStock: Number.isFinite(Number(med.minStock)) ? Number(med.minStock) : 50,
      image: null,
      imageFileId: med.imageFileId ? String(med.imageFileId) : null,
      createdAt: med.createdAt,
      expiryDate: medBatches.map((b) => b.expiryDate).filter(Boolean).sort()[0] || '',
      batches: medBatches,
    }];
  }));
}

/**
 * Memetakan stok riwayat ke struktur data yang dipakai oleh API atau komponen pemanggil.
 */
function mapStockHistory(transactions, { includePrescriptionReferences = true } = {}) {
  const map = {};
  for (const t of transactions) {
    const medicationId = t.medicationId?._id || t.medicationId;
    const key = medicationId ? String(medicationId) : '';
    if (!key) continue;
    if (!map[key]) map[key] = [];
    map[key].push({
      id: t.transactionId,
      transactionId: t.transactionId,
      type: t.type,
      qty: t.quantity,
      unit: t.unit,
      batchNumber: t.batchNumber,
      expiryDate: t.expiryDate ? new Date(t.expiryDate).toISOString().slice(0, 10) : '',
      date: t.createdAt,
      time: t.createdAt,
      ...(includePrescriptionReferences ? {
        reference: t.reference,
        presId: t.prescriptionId ? String(t.prescriptionId) : '',
      } : {}),
      by: t.performedBy?.username || t.officer || '-',
      officer: t.officer || t.performedBy?.username || '-',
    });
  }
  return map;
}

/**
 * Mengambil data aplikasi secara paralel lalu menyusun payload berdasarkan peran. Admin menerima data manajemen akun dan aktivitas, sedangkan data stok serta transaksi hanya disertakan untuk peran yang berwenang; status aktivasi akun dikirim sebagai boolean, bukan hash token.
 */
export async function getBootstrap({ userId, role }) {
  const canAccessPatientCare = ['doctor', 'pharmacy'].includes(role);
  const canMonitorStock = ['admin', 'pharmacy'].includes(role);
  const isAdmin = role === 'admin';
  const isDoctor = role === 'doctor';
  const patientFilter = getPatientReadFilter({ role, userId });
  const doctorPatientIds = isDoctor
    ? Patient.distinct('_id', patientFilter).exec()
    : Promise.resolve([]);
  const prescriptionFilter = isDoctor
    ? doctorPatientIds.then((patientIds) => getPrescriptionReadFilter({ role, patientIds }))
    : Promise.resolve(getPrescriptionReadFilter({ role }));

  const [users, patients, prescriptions, medications, batches, transactions, history, chronicBooks, activities, dose, deletedDoseOptions, notifications] = await Promise.all([
    isAdmin ? User.find().select('+activationTokenHash').sort({ createdAt: 1 }).lean() : Promise.resolve([]),
    canAccessPatientCare ? Patient.find(patientFilter).sort({ updatedAt: -1 }).lean() : Promise.resolve([]),
    canAccessPatientCare
      ? prescriptionFilter.then((filter) => Prescription.find(filter).populate({ path: 'createdBy', select: 'username', match: { includeDeleted: true } }).populate({ path: 'updatedBy', select: 'username', match: { includeDeleted: true } }).populate({ path: 'pickedBy', select: 'username', match: { includeDeleted: true } }).sort({ createdAt: -1 }).lean())
      : Promise.resolve([]),
    Medication.find({ active: true }).sort({ name: 1 }).lean(),
    canMonitorStock ? StockBatch.find().sort({ receivedAt: 1 }).lean() : Promise.resolve([]),
    canMonitorStock ? StockTransaction.find().populate('medicationId', 'name').populate({ path: 'performedBy', select: 'username', match: { includeDeleted: true } }).sort({ createdAt: -1 }).limit(1000).lean() : Promise.resolve([]),
    isDoctor
      ? doctorPatientIds.then((patientIds) => PatientHistory.find({ patientId: { $in: patientIds } }).sort({ createdAt: -1 }).limit(2000).lean())
      : role === 'pharmacy'
        ? PatientHistory.find().sort({ createdAt: -1 }).limit(2000).lean()
        : Promise.resolve([]),
    canAccessPatientCare
      ? (isDoctor
          ? doctorPatientIds.then((patientIds) => ChronicBook.find({ patientId: { $in: patientIds } }).populate('patientId', 'name bpjsNumber').populate({ path: 'uploadedBy', select: 'username', match: { includeDeleted: true } }).sort({ uploadedAt: -1 }).lean())
          : ChronicBook.find().populate('patientId', 'name bpjsNumber').populate({ path: 'uploadedBy', select: 'username', match: { includeDeleted: true } }).sort({ uploadedAt: -1 }).lean())
      : Promise.resolve([]),
    isAdmin ? getRecentActivitiesForBootstrap() : Promise.resolve([]),
    isDoctor ? SystemOption.find({ type: 'dose' }).sort({ createdAt: 1 }).lean() : Promise.resolve([]),
    isDoctor ? SystemOption.find({ type: 'dose', isDeleted: true, includeDeleted: true }).select('normalizedValue').lean() : Promise.resolve([]),
    listNotifications(userId, role),
  ]);

  const legacyIdToPrescriptionId = new Map(
    prescriptions.filter((item) => item.legacyId).map((item) => [String(item.legacyId), String(item._id)]),
  );
  const prescriptionIds = prescriptions.map((item) => item._id);
  const legacyPrescriptionIds = prescriptions.map((item) => item.legacyId).filter(Boolean);
  const prescriptionTransactionRows = prescriptions.length
    ? await StockTransaction.find({
        type: 'out',
        $or: [
          { prescriptionId: { $in: prescriptionIds } },
          { reference: { $in: legacyPrescriptionIds } },
        ],
      }).select('transactionId prescriptionId reference createdAt').sort({ createdAt: 1 }).lean()
    : [];
  const transactionIdsByPrescription = new Map();
  for (const row of prescriptionTransactionRows) {
    const key = row.prescriptionId
      ? String(row.prescriptionId)
      : legacyIdToPrescriptionId.get(String(row.reference || ''));
    if (!key) continue;
    const ids = transactionIdsByPrescription.get(key) || [];
    ids.push(row.transactionId);
    transactionIdsByPrescription.set(key, ids);
  }

  const deletedDoseValues = new Set(deletedDoseOptions.map((option) => option.normalizedValue));
  const result = {
    users: users.map((u) => ({
      ...({ _id: String(u._id), id: String(u._id), username: u.username, email: u.email || '', role: u.role, active: u.active, activationPending: Boolean(u.activationTokenHash), nik: u.nik || '', createdAt: u.createdAt, updatedAt: u.updatedAt }),
      str: u.str ? { fileId: String(u.str.fileId), name: u.str.name, type: u.str.mimeType, size: u.str.size, url: `/api/files/${u.str.fileId}` } : null,
      sip: u.sip ? { fileId: String(u.sip.fileId), name: u.sip.name, type: u.sip.mimeType, size: u.sip.size, url: `/api/files/${u.sip.fileId}` } : null,
    })),
    prescriptions: canAccessPatientCare ? prescriptions.map((p) => {
      const ids = transactionIdsByPrescription.get(String(p._id)) || [];
      return { ...mapPrescription(p), transactionIds: ids, transactionId: ids.length ? ids.join(', ') : '-' };
    }) : [],
    chronicBooks: canAccessPatientCare ? mapChronicBooks(chronicBooks) : {},
    patientHistory: canAccessPatientCare ? mapHistory(history) : {},
    stock: canMonitorStock ? mapStock(medications, batches) : {},
    stockHistory: canMonitorStock ? mapStockHistory(transactions, { includePrescriptionReferences: !isAdmin }) : {},
    patients: canAccessPatientCare ? mapPatients(patients, { includeAllergy: role === 'pharmacy' }) : {},
    activities: activities.map((a) => ({ id: String(a._id), user: a.username, roleLabel: ({ admin: 'Admin', doctor: 'Dokter FKTP', pharmacy: 'Apoteker' })[a.role] || a.role, action: a.action, time: a.createdAt })),
    doseOptions: isDoctor ? [
      ...new Set([
        ...DEFAULT_DOSE_OPTIONS.filter((value) => !deletedDoseValues.has(String(value).trim().toLowerCase())),
        ...dose.map((o) => o.value),
      ]),
    ].filter((value) => String(value).trim().toLowerCase() !== 'lainnya') : [],
    doseOptionUnits: Object.fromEntries(
      dose
        .filter((option) => String(option.unit || '').trim())
        .map((option) => [String(option.value).trim().toLowerCase(), String(option.unit).trim()])
    ),
    doseOptionRoutes: Object.fromEntries(
      dose
        .filter((option) => String(option.route || '').trim())
        .map((option) => [String(option.value).trim().toLowerCase(), String(option.route).trim()])
    ),
    medicationOptions: isDoctor ? medications.map((m) => ({
      id: String(m._id),
      name: m.name,
      unit: m.unit,
      administrationRoute: m.administrationRoute || '',
      distributor: m.distributor || '-',
    })) : [],
    notifications,
  };

  return result;
}

/**
 * Mengambil maksimal 500 aktivitas terbaru untuk data awal Dashboard Admin dengan urutan paling baru terlebih dahulu.
 */
async function getRecentActivitiesForBootstrap() {
  return Activity.find().sort({ createdAt: -1 }).limit(500).lean();
}
