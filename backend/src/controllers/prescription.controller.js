/**
 * Menangani permintaan dan respons HTTP untuk fitur resep. Controller meneruskan pekerjaan domain ke service dan mengembalikan hasil dengan format API.
 */
import { Prescription } from '../models/Prescription.js';
import { Patient } from '../models/Patient.js';
import { StockTransaction } from '../models/StockTransaction.js';
import { createPrescription, updatePrescription, deletePrescription, dispensePrescription, hasDuplicateVisitNumber } from '../services/prescription.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError, notFound } from '../utils/AppError.js';
import { getPrescriptionReadFilter } from '../utils/access-scopes.js';

/**
 * Mengubah dokumen resep Mongoose menjadi bentuk respons API, termasuk alias field obat dan identitas pelaku yang masih dibutuhkan antarmuka.
 */
const map = (p) => ({
  _id: String(p._id),
  id: p.legacyId,
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
    _id: String(m.medicationId), medicationId: String(m.medicationId), med: m.medicationName, q: m.quantity, u: m.unit, dn: m.duration, du: m.durationUnit,
    doseInstruction: m.doseInstruction, aturanPakai: m.doseInstruction, frequency: m.frequency, dose: m.dose, doseUnit: m.doseUnit, route: m.route, shake: m.shake, notes: m.notes, catatanTambahan: m.notes,
  })),
  status: p.status,
  createdBy: p.createdBy?.username || String(p.createdBy || ''),
  createdById: p.createdBy?._id ? String(p.createdBy._id) : String(p.createdBy || ''),
  updatedBy: p.updatedBy?.username || '',
  updatedById: p.updatedBy?._id ? String(p.updatedBy._id) : '',
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  pickedAt: p.pickedAt,
  pickedBy: p.pickedBy?.username || '',
  notificationSent: Boolean(p.notificationSent),
});

export const listPrescriptions = asyncHandler(async (req, res) => {
  const patientIds = req.authUser.role === 'doctor'
    ? await Patient.distinct('_id', { assignedDoctorId: req.authUser._id })
    : [];
  const items = await Prescription.find(getPrescriptionReadFilter({ role: req.authUser.role, patientIds }))
    .populate({ path: 'createdBy', select: 'username', match: { includeDeleted: true } })
    .populate({ path: 'updatedBy', select: 'username', match: { includeDeleted: true } })
    .populate({ path: 'pickedBy', select: 'username', match: { includeDeleted: true } })
    .sort({ createdAt: -1 })
    .lean();

  const prescriptionIds = items.map((item) => item._id);
  const legacyIds = items.map((item) => item.legacyId).filter(Boolean);
  const legacyIdToPrescriptionId = new Map(
    items.filter((item) => item.legacyId).map((item) => [String(item.legacyId), String(item._id)]),
  );
  const transactions = items.length
    ? await StockTransaction.find({
        type: 'out',
        $or: [
          { prescriptionId: { $in: prescriptionIds } },
          { reference: { $in: legacyIds } },
        ],
      }).select('transactionId prescriptionId reference createdAt').sort({ createdAt: 1 }).lean()
    : [];

  const idsByPrescription = new Map();
  for (const tx of transactions) {
    const key = tx.prescriptionId
      ? String(tx.prescriptionId)
      : legacyIdToPrescriptionId.get(String(tx.reference || ''));
    if (!key) continue;
    const values = idsByPrescription.get(key) || [];
    values.push(tx.transactionId);
    idsByPrescription.set(key, values);
  }

  res.json({
    success: true,
    data: items.map((item) => {
      const ids = idsByPrescription.get(String(item._id)) || [];
      return { ...map(item), transactionIds: ids, transactionId: ids.length ? ids.join(', ') : '-' };
    }),
  });
});

/** Memeriksa duplikasi No. Kunjungan sebelum formulir beralih ke Ringkasan Resep. */
export const checkVisitNumber = asyncHandler(async (req, res) => {
  const visitNumber = String(req.query.visitNumber || '').trim();
  if (!visitNumber) {
    throw new AppError('No. Kunjungan wajib diisi.', 422, 'VISIT_NUMBER_REQUIRED');
  }

  const exists = await hasDuplicateVisitNumber(visitNumber);
  res.json({ success: true, data: { exists } });
});

export const create = asyncHandler(async (req, res) => {
  const item = await createPrescription({ payload: req.body, user: req.authUser });
  res.status(201).json({ success: true, data: map(item) });
});

export const update = asyncHandler(async (req, res) => {
  const item = await updatePrescription({ id: req.params.id, payload: req.body, user: req.authUser });
  res.json({ success: true, data: map(item) });
});

export const remove = asyncHandler(async (req, res) => {
  await deletePrescription({ id: req.params.id, user: req.authUser });
  res.json({ success: true, data: null });
});

export const dispense = asyncHandler(async (req, res) => {
  const item = await dispensePrescription({ id: req.params.id, user: req.authUser });
  res.json({ success: true, data: map(item) });
});

export const notifyPatient = asyncHandler(async (req, res) => {
  const p = await Prescription.findById(req.params.id);
  if (!p) throw notFound('Resep tidak ditemukan.');
  const patient = await Patient.findById(p.patientId).lean();
  if (!patient?.phone) throw new AppError('Nomor telepon tidak tersedia.', 422, 'PATIENT_PHONE_MISSING');
  p.notificationSent = true;
  await p.save();
  res.json({ success: true, data: { ok: true } });
});
