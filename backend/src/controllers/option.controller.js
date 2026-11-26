/**
 * Menangani penambahan dan penghapusan pilihan aturan pakai atau dosis.
 */
import { SystemOption } from '../models/SystemOption.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError, conflict, notFound } from '../utils/AppError.js';
import { DEFAULT_DOSE_OPTIONS } from '../utils/constants.js';

export const create = asyncHandler(async (req, res, next) => {
  const value = String(req.body.value || '').trim();
  if (!value) return next(new AppError('Opsi belum diisi.', 422, 'VALIDATION_ERROR'));
  if (value.toLowerCase() === 'lainnya') return next(new AppError('Opsi Lainnya tidak tersedia.', 422, 'VALIDATION_ERROR'));
  const normalizedValue = value.toLowerCase();
  const unit = String(req.body.unit || '').trim();
  const route = String(req.body.route || '').trim();
  if (!unit) {
    return next(new AppError('Satuan obat wajib tersedia untuk aturan pakai.', 422, 'DOSE_UNIT_REQUIRED'));
  }
  const existing = await SystemOption.findOne({ type: 'dose', normalizedValue, includeDeleted: true });
  if (existing && !existing.isDeleted) {
    // Upgrade legacy rules that were saved before unit/route scoping existed.
    if (!String(existing.unit || '').trim()) {
      existing.unit = unit;
      existing.route = route;
      existing.createdBy = req.authUser._id;
      await existing.save();
      return res.status(200).json({ success: true, data: { _id: String(existing._id), value: existing.value, unit: existing.unit, route: existing.route || '' } });
    }
    const sameUnit = String(existing.unit || '').trim().toLowerCase() === unit.toLowerCase();
    const existingRoute = String(existing.route || '').trim();
    if (sameUnit && !existingRoute && route) {
      existing.route = route;
      existing.createdBy = req.authUser._id;
      await existing.save();
      return res.status(200).json({ success: true, data: { _id: String(existing._id), value: existing.value, unit: existing.unit, route: existing.route } });
    }
    if (sameUnit && existingRoute.toLowerCase() === route.toLowerCase()) {
      return next(conflict('Aturan pakai tersebut sudah terdaftar untuk satuan dan rute pemberian obat ini.', 'OPTION_EXISTS'));
    }
    const existingScope = [existing.unit || 'umum', existingRoute || 'semua rute'].join(' / ');
    return next(conflict(`Aturan pakai tersebut sudah terdaftar untuk ${existingScope}.`, 'OPTION_EXISTS'));
  }
  if (existing?.isDeleted) {
    existing.isDeleted = false;
    existing.deletedAt = null;
    existing.deletedBy = null;
    existing.value = value;
    existing.unit = unit;
    existing.route = route;
    existing.createdBy = req.authUser._id;
    await existing.save();
    return res.status(201).json({ success: true, data: { _id: String(existing._id), value: existing.value, unit: existing.unit || '', route: existing.route || '' } });
  }
  const option = await SystemOption.create({ type: 'dose', value, normalizedValue, unit, route, createdBy: req.authUser._id });
  res.status(201).json({ success: true, data: { _id: String(option._id), value: option.value, unit: option.unit || '', route: option.route || '' } });
});


export const removeByValue = asyncHandler(async (req, res, next) => {
  const value = String(req.query.value || '').trim();
  if (!value) return next(new AppError('Opsi tidak valid.', 422, 'VALIDATION_ERROR'));
  const normalizedValue = value.toLowerCase();
  const option = await SystemOption.findOne({ type: 'dose', normalizedValue, includeDeleted: true });

  if (option?.isDeleted) {
    return res.json({ success: true, data: null });
  }

  if (option) {
    option.isDeleted = true;
    option.deletedAt = new Date();
    option.deletedBy = req.authUser._id;
    await option.save();
    return res.json({ success: true, data: null });
  }

  // Default dose presets are supplied by bootstrap constants. Persist a tombstone
  // when one of those is removed so it does not reappear after a reload.
  if (DEFAULT_DOSE_OPTIONS.some((item) => item.toLowerCase() === normalizedValue)) {
    await SystemOption.create({
      type: 'dose',
      value,
      normalizedValue,
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.authUser._id,
    });
    return res.json({ success: true, data: null });
  }

  return next(notFound('Opsi tidak ditemukan.'));
});
