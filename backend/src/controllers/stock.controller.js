/**
 * Menangani permintaan dan respons HTTP untuk fitur stok. Controller meneruskan pekerjaan domain ke service dan mengembalikan hasil dengan format API.
 */
import { Medication } from '../models/Medication.js';
import { MEDICATION_ADMINISTRATION_ROUTES } from '../utils/constants.js';
import { StockBatch } from '../models/StockBatch.js';
import { StockTransaction } from '../models/StockTransaction.js';
import { uploadFile, deleteFile } from '../config/gridfs.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { notFound, AppError } from '../utils/AppError.js';
import { refreshStockNotifications } from '../services/notification.service.js';
import { createTransactionId } from '../utils/ids.js';
import { recordActivity } from '../services/activity.service.js';
import {
  normalizeMedicationName,
  normalizeManufacturer,
  normalizeBatchNumber,
} from '../utils/stock-identifiers.js';

/** Refreshes derived stock reminders without turning a committed stock change into an apparent API failure. */
async function refreshStockNotificationsSafely(operation) {
  try {
    await refreshStockNotifications();
  } catch (error) {
    console.error('[REMS_NOTIFICATION_FAILURE]', {
      operation,
      name: error?.name || 'Error',
      code: error?.code || 'NOTIFICATION_FAILED',
    });
  }
}

/**
 * Menghasilkan tanggal kalender saat ini berdasarkan zona waktu Asia/Makassar agar pemeriksaan tanggal stok tidak bergeser karena UTC.
 */
const currentBusinessDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

/**
 * Memastikan tanggal masukan berformat YYYY-MM-DD dan benar-benar merupakan tanggal kalender yang valid.
 */
const isValidDateOnly = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const addStock = asyncHandler(async (req, res, next) => {
  const payload = req.body;
  const imageFile = req.file || null;
  const name = String(payload.name || payload.stockName || '').trim();
  const qty = Number(payload.qty);
  const unit = String(payload.unit || 'tablet').trim();
  const administrationRoute = String(payload.administrationRoute || '').trim();
  const distributor = String(payload.distributor ?? '').trim();
  const normalizedName = normalizeMedicationName(name);
  const normalizedDistributor = normalizeManufacturer(distributor);
  const requestedMedicationId = String(payload.medicationId || '').trim();
  const minStock = payload.minStock === undefined || payload.minStock === ''
    ? undefined
    : Number(payload.minStock);

  if (minStock !== undefined && (!Number.isInteger(minStock) || minStock < 0)) {
    return next(new AppError('Batas minimum stok harus berupa bilangan bulat minimal 0.', 422, 'INVALID_MIN_STOCK'));
  }

  const batchNumber = String(payload.batchNumber || '').trim();
  const batchNumberNormalized = normalizeBatchNumber(batchNumber);
  const expiryDateText = String(payload.expiryDate || '').trim();
  const expiryDate = expiryDateText ? new Date(`${expiryDateText}T00:00:00.000Z`) : null;

  if (
    !name || !unit || !administrationRoute || !distributor || !Number.isInteger(qty) || qty < 1 || !batchNumber ||
    !expiryDateText || !isValidDateOnly(expiryDateText) ||
    Number.isNaN(expiryDate?.getTime?.() ?? 0)
  ) {
    return next(new AppError('Data stok tidak valid.', 422, 'VALIDATION_ERROR'));
  }

  if (expiryDateText && expiryDateText < currentBusinessDate()) {
    return next(new AppError(
      'Tanggal kedaluwarsa sudah lewat. Obat tidak dapat ditambahkan ke dalam sistem.',
      422,
      'EXPIRED_STOCK_NOT_ALLOWED',
    ));
  }

  if (imageFile && !String(imageFile.mimetype || '').startsWith('image/')) {
    return next(new AppError('File harus berupa gambar.', 422, 'INVALID_IMAGE_TYPE'));
  }

  let med = null;
  if (requestedMedicationId) {
    if (!/^[a-f\d]{24}$/i.test(requestedMedicationId)) {
      return next(new AppError('Identitas obat yang dipilih tidak valid. Pilih kembali nama obat.', 422, 'INVALID_MEDICATION_ID'));
    }
    med = await Medication.findOne({ _id: requestedMedicationId, active: true });
    if (!med) {
      return next(new AppError('Obat yang dipilih tidak ditemukan. Muat ulang daftar obat lalu pilih kembali.', 404, 'MEDICATION_NOT_FOUND'));
    }
    if (normalizeMedicationName(med.nameNormalized || med.name) !== normalizedName) {
      return next(new AppError('Nama obat tidak sesuai dengan master obat yang dipilih. Pilih kembali nama obat.', 409, 'MEDICATION_SELECTION_MISMATCH'));
    }
  }

  if (!MEDICATION_ADMINISTRATION_ROUTES.includes(administrationRoute)
    && (!med || String(med.administrationRoute || '').trim() !== administrationRoute)) {
    return next(new AppError('Rute pemberian obat tidak termasuk dalam daftar standar. Pilih salah satu opsi yang tersedia.', 422, 'INVALID_ADMINISTRATION_ROUTE'));
  }
  // Tanpa medicationId, data selalu diproses sebagai master obat baru.
  // Memilih opsi dropdown adalah satu-satunya cara menggunakan master yang sudah ada.

  if (!med && !imageFile) {
    return next(new AppError('Gambar wajib diunggah untuk master obat baru.', 422, 'MEDICATION_IMAGE_REQUIRED'));
  }

  if (med) {
    if (String(med.administrationRoute || '').trim() !== administrationRoute && String(med.administrationRoute || '').trim()) {
      const hasRemainingStockForRoute = await StockBatch.exists({ medicationId: med._id, quantity: { $gt: 0 } });
      if (hasRemainingStockForRoute) {
        return next(new AppError(
          'Rute pemberian obat tidak dapat diubah selama masih terdapat stok pada batch obat.',
          409,
          'ADMINISTRATION_ROUTE_CHANGE_WITH_REMAINING_STOCK',
        ));
      }
    }

    // A unit change is allowed only when no usable batch remains. Historical
    // transactions keep their own `unit` snapshot and are never rewritten.
    if (String(med.unit || '').trim() !== unit) {
      const hasRemainingStock = await StockBatch.exists({ medicationId: med._id, quantity: { $gt: 0 } });
      if (hasRemainingStock) {
        return next(new AppError(
          'Satuan tidak dapat diubah selama masih terdapat stok pada batch obat. Habiskan atau keluarkan seluruh stok terlebih dahulu agar jumlah batch tidak berubah maknanya.',
          409,
          'UNIT_CHANGE_WITH_REMAINING_STOCK',
        ));
      }
    }

    // One batch number belongs to exactly one expiry date for this medication,
    // including batches that were previously soft-deleted.
    const batchesWithSameNumber = await StockBatch.find({
      medicationId: med._id,
      batchNumberNormalized,
      includeDeleted: true,
    }).select('_id batchNumber batchNumberNormalized expiryDate batchIdentityVersion').lean();
    const requestedExpiry = expiryDate ? expiryDate.toISOString().slice(0, 10) : '';
    const expiryMismatch = batchesWithSameNumber.some((batch) => {
      const storedExpiry = batch.expiryDate ? new Date(batch.expiryDate).toISOString().slice(0, 10) : '';
      return storedExpiry !== requestedExpiry;
    });
    if (expiryMismatch) {
      return next(new AppError(
        'Nomor batch atau tanggal kedaluwarsa tidak sesuai dengan data yang sudah ada di sistem. Untuk obat yang sama, satu nomor batch harus memiliki satu tanggal kedaluwarsa yang sama.',
        409,
        'BATCH_EXPIRY_MISMATCH',
      ));
    }
  }

  const masterChanges = [];
  if (med) {
    const previousDistributor = String(med.distributor || '-').trim();
    const previousUnit = String(med.unit || '-').trim();
    const previousAdministrationRoute = String(med.administrationRoute || '-').trim();
    const previousMinStock = Number(med.minStock ?? 50);
    if (previousDistributor !== distributor) {
      masterChanges.push({ label: 'Pabrik', before: previousDistributor, after: distributor });
    }
    if (previousUnit !== unit) {
      masterChanges.push({ label: 'Satuan', before: previousUnit, after: unit });
    }
    if (String(med.administrationRoute || '').trim() !== administrationRoute) {
      masterChanges.push({ label: 'Rute Pemberian Obat', before: previousAdministrationRoute, after: administrationRoute });
    }
    if (minStock !== undefined && previousMinStock !== minStock) {
      masterChanges.push({ label: 'Batas Minimum Stok', before: String(previousMinStock), after: String(minStock) });
    }
    if (imageFile) {
      masterChanges.push({
        label: 'Gambar',
        before: med.imageFileId ? 'Gambar sebelumnya' : 'Belum ada gambar',
        after: String(imageFile.originalname || 'Gambar baru'),
      });
    }
  }

  let uploadedImageId = null;
  let imageAttached = false;
  let oldImageId = null;
  let createdNewMedication = false;

  try {
    if (imageFile) {
      uploadedImageId = await uploadFile({
        buffer: imageFile.buffer,
        filename: imageFile.originalname,
        contentType: imageFile.mimetype,
        metadata: {
          documentType: 'medication-image',
          medicationName: name,
          uploadedBy: String(req.authUser._id),
        },
      });
    }

    if (!med) {
      const legacyId = `OBT-${String(
        (await Medication.countDocuments({ includeDeleted: true })) + 1,
      ).padStart(3, '0')}`;

      med = await Medication.create({
        legacyId,
        name,
        nameNormalized: normalizedName,
        distributor,
        distributorNormalized: normalizedDistributor,
        unit,
        administrationRoute,
        minStock: minStock ?? 50,
        imageFileId: uploadedImageId,
        active: true,
      });
      createdNewMedication = true;
      imageAttached = Boolean(uploadedImageId);
    } else {
      oldImageId = med.imageFileId;
      med.distributor = distributor;
      med.distributorNormalized = normalizedDistributor;
      med.unit = unit;
      med.administrationRoute = administrationRoute;
      if (minStock !== undefined) med.minStock = minStock;
      med.active = true;
      med.isDeleted = false;
      med.deletedAt = null;
      med.deletedBy = null;
      if (uploadedImageId) med.imageFileId = uploadedImageId;
      await med.save();
      imageAttached = Boolean(uploadedImageId);
    }

    if (masterChanges.length) {
      const details = masterChanges
        .map((change) => `${change.label}: "${change.before}" → "${change.after}"`)
        .join('; ');
      await recordActivity({
        user: req.authUser,
        action: `Memperbarui data master obat ${med.name}: ${details}`,
      }).catch((error) => {
        console.error('[STOCK_MASTER_ACTIVITY_FAILURE]', error?.message || error);
      });
    }

    const existingBatches = await StockBatch.find({
      medicationId: med._id,
      batchNumberNormalized,
      includeDeleted: true,
    }).select('_id expiryDate quantity').lean();

    const existing = existingBatches[0] || null;
    if (existing) {
      const updatedBatch = await StockBatch.findOneAndUpdate(
        { _id: existing._id, includeDeleted: true },
        {
          $inc: { quantity: qty },
          $set: {
            batchNumber,
            batchNumberNormalized,
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
          },
        },
        { new: true, runValidators: true },
      );
      if (!updatedBatch) throw new AppError('Batch stok berubah. Muat ulang data lalu coba kembali.', 409, 'STOCK_BATCH_CHANGED');
    } else {
      await StockBatch.create({
        medicationId: med._id,
        batchNumber,
        batchNumberNormalized,
        batchIdentityVersion: 1,
        expiryDate: expiryDate || null,
        quantity: qty,
        receivedAt: new Date(),
      });
    }

    const transactionId = createTransactionId();
    await StockTransaction.create({
      transactionId,
      medicationId: med._id,
      type: 'in',
      quantity: qty,
      unit,
      batchNumber,
      expiryDate: expiryDate || null,
      reference: transactionId,
      performedBy: req.authUser._id,
      officer: req.authUser.username,
    });

    if (createdNewMedication) {
      await recordActivity({
        user: req.authUser,
        action: `Menambahkan master obat ${name} (${distributor})`,
      }).catch((error) => console.error('[STOCK_MASTER_ACTIVITY_FAILURE]', error?.message || error));
    }

    await refreshStockNotificationsSafely('stock.add');
    if (uploadedImageId && oldImageId) await deleteFile(oldImageId).catch(() => null);

    res.status(201).json({
      success: true,
      data: {
        transactionId,
        medicationId: String(med._id),
        imageFileId: med.imageFileId ? String(med.imageFileId) : null,
      },
    });
  } catch (error) {
    if (uploadedImageId && !imageAttached) await deleteFile(uploadedImageId).catch(() => null);

    if (error?.code === 11000) {
      const keyPattern = error?.keyPattern || {};
      if (keyPattern.batchNumberNormalized || String(error?.message || '').includes('medication_batch_identity_unique')) {
        const currentBatch = await StockBatch.findOne({ medicationId: med?._id, batchNumberNormalized, includeDeleted: true }).select('expiryDate').lean();
        const currentExpiry = currentBatch?.expiryDate ? new Date(currentBatch.expiryDate).toISOString().slice(0, 10) : '';
        const requestedExpiry = expiryDate ? expiryDate.toISOString().slice(0, 10) : '';
        if (currentBatch && currentExpiry !== requestedExpiry) {
          throw new AppError(
            'Nomor batch atau tanggal kedaluwarsa tidak sesuai dengan data yang sudah ada di sistem. Untuk obat yang sama, satu nomor batch harus memiliki satu tanggal kedaluwarsa yang sama.',
            409,
            'BATCH_EXPIRY_MISMATCH',
          );
        }
        throw new AppError('Batch obat sudah ditambahkan oleh proses lain. Muat ulang data lalu coba kembali.', 409, 'STOCK_BATCH_CONCURRENT_UPDATE');
      }
      throw new AppError(
        'Master obat tidak dapat disimpan karena terjadi benturan identitas data. Muat ulang data lalu coba kembali.',
        409,
        'MEDICATION_ID_CONFLICT',
      );
    }

    throw error;
  }
});

export const updateStockImage = asyncHandler(async (req, res, next) => {
  const med = await Medication.findById(req.params.id);
  if (!med) return next(notFound('Data obat tidak ditemukan.'));
  const imageFile = req.file;
  if (!imageFile) return next(new AppError('Pilih file gambar terlebih dahulu.', 422, 'IMAGE_REQUIRED'));
  if (!String(imageFile.mimetype || '').startsWith('image/')) {
    return next(new AppError('File harus berupa gambar.', 422, 'INVALID_IMAGE_TYPE'));
  }
  if (imageFile.size > 5 * 1024 * 1024) {
    return next(new AppError('Ukuran gambar maksimal 5 MB.', 422, 'IMAGE_TOO_LARGE'));
  }

  const oldImageId = med.imageFileId;
  const newImageId = await uploadFile({
    buffer: imageFile.buffer,
    filename: imageFile.originalname,
    contentType: imageFile.mimetype,
    metadata: { documentType: 'medication-image', medicationId: String(med._id), uploadedBy: String(req.authUser._id) },
  });
  med.imageFileId = newImageId;
  try {
    await med.save();
  } catch (error) {
    await deleteFile(newImageId).catch(() => null);
    throw error;
  }
  if (oldImageId) await deleteFile(oldImageId).catch(() => null);
  await recordActivity({
    user: req.authUser,
    action: `Memperbarui gambar obat ${med.name}`,
  }).catch((error) => console.error('[STOCK_MASTER_ACTIVITY_FAILURE]', error?.message || error));
  res.json({ success: true, data: { _id: String(med._id), imageFileId: String(newImageId) } });
});

export const deleteStock = asyncHandler(async (req, res, next) => {
  const med = await Medication.findById(req.params.id);
  if (!med) return next(notFound('Data obat tidak ditemukan.'));

  const deletedAt = new Date();
  const remainingBatches = await StockBatch.find({ medicationId: med._id })
    .select('quantity')
    .lean();
  const archivedQuantity = remainingBatches.reduce((total, batch) => total + Number(batch.quantity || 0), 0);

  med.active = false;
  med.isDeleted = true;
  med.deletedAt = deletedAt;
  med.deletedBy = req.authUser._id;
  await med.save();

  // Arsipkan seluruh batch agar sisa stok tidak tetap tersedia untuk penebusan.
  // Nilai jumlah dan semua transaksi historis tetap disimpan untuk audit.
  await StockBatch.updateMany(
    { medicationId: med._id, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt, deletedBy: req.authUser._id } },
  );

  await recordActivity({
    user: req.authUser,
    action: `Menghapus master obat ${med.name} (${med.distributor || '-'}) dari stok aktif; sisa stok yang diarsipkan: ${archivedQuantity} ${med.unit || ''}`.trim(),
  }).catch((error) => console.error('[STOCK_MASTER_ACTIVITY_FAILURE]', error?.message || error));
  await refreshStockNotificationsSafely('stock.delete');
  res.json({ success: true, data: null });
});

export const withdrawBatch = asyncHandler(async (req, res, next) => {
  const medication = await Medication.findById(req.params.id);
  if (!medication || !medication.active) return next(notFound('Data obat tidak ditemukan atau sudah dinonaktifkan.'));
  const batch = await StockBatch.findOne({ _id: req.params.batchId, medicationId: medication._id });
  if (!batch) return next(notFound('Batch obat tidak ditemukan.'));
  if (!Number.isInteger(Number(batch.quantity)) || batch.quantity < 1) {
    return next(new AppError('Batch ini tidak memiliki stok yang dapat dikeluarkan.', 422, 'EMPTY_BATCH'));
  }

  const reason = String(req.body?.reason || '').trim();
  if (!['expired', 'damaged', 'data_entry_error'].includes(reason)) {
    return next(new AppError('Pilih alasan pengeluaran: kedaluwarsa, rusak, atau kesalahan input data.', 422, 'INVALID_WITHDRAWAL_REASON'));
  }
  const batchExpiryDate = batch.expiryDate ? new Date(batch.expiryDate).toISOString().slice(0, 10) : '';
  const today = currentBusinessDate();
  let quantity = Number(req.body?.quantity);
  let reference;

  if (reason === 'expired') {
    if (!batchExpiryDate || batchExpiryDate >= today) {
      return next(new AppError('Batch ini belum melewati tanggal kedaluwarsa. Pilih alasan Rusak jika stok memang tidak layak digunakan.', 422, 'BATCH_NOT_EXPIRED'));
    }
    quantity = Number(batch.quantity);
    reference = 'Pengeluaran obat kedaluwarsa';
  } else {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > Number(batch.quantity)) {
      return next(new AppError(`Jumlah yang dikeluarkan harus antara 1 dan ${batch.quantity}.`, 422, 'INVALID_WITHDRAWAL_QUANTITY'));
    }
    reference = reason === 'damaged'
      ? 'Pengeluaran obat rusak'
      : 'Penyesuaian stok karena kesalahan input data';
  }

  const updatedBatch = await StockBatch.findOneAndUpdate(
    { _id: batch._id, medicationId: medication._id, quantity: { $gte: quantity } },
    { $inc: { quantity: -quantity } },
    { new: true, runValidators: true },
  );
  if (!updatedBatch) {
    return next(new AppError('Jumlah stok berubah saat diproses. Muat ulang data lalu coba kembali.', 409, 'STOCK_BATCH_CHANGED'));
  }

  const txId = createTransactionId();
  try {
    await StockTransaction.create({
      transactionId: txId,
      medicationId: medication._id,
      type: 'out',
      quantity,
      unit: medication.unit,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate || null,
      reference,
      performedBy: req.authUser._id,
      officer: req.authUser.username,
    });
  } catch (error) {
    await StockBatch.updateOne({ _id: batch._id }, { $inc: { quantity } }).catch(() => null);
    throw error;
  }
  await refreshStockNotificationsSafely('stock.withdraw-batch');
  res.json({ success: true, data: { transactionId: txId, quantity, reason, remaining: updatedBatch.quantity } });
});

export const deleteBatch = asyncHandler(async (req, res, next) => {
  const med = await Medication.findById(req.params.id);
  if (!med) return next(notFound('Data obat tidak ditemukan.'));
  const batch = await StockBatch.findOne({
    _id: req.params.batchId,
    medicationId: med._id,
  });
  if (!batch) return next(notFound('Batch obat tidak ditemukan.'));

  if (Number(batch.quantity || 0) > 0) {
    return next(new AppError(
      'Batch masih memiliki stok. Jangan hapus batch yang masih berisi obat; gunakan fitur Keluarkan Stok untuk obat rusak atau kedaluwarsa.',
      409,
      'BATCH_HAS_REMAINING_STOCK',
    ));
  }

  const relatedTransactions = await StockTransaction.find({
    medicationId: med._id,
    includeDeleted: true,
  }).select('batchNumber').lean();
  const hasHistory = relatedTransactions.some((transaction) =>
    normalizeBatchNumber(transaction.batchNumber) === normalizeBatchNumber(batch.batchNumber)
  );
  if (hasHistory) {
    return next(new AppError(
      'Batch sudah memiliki riwayat transaksi sehingga tidak dapat dihapus. Pertahankan batch sebagai arsip agar riwayat stok tetap dapat ditelusuri.',
      409,
      'BATCH_HAS_TRANSACTION_HISTORY',
    ));
  }

  batch.isDeleted = true;
  batch.deletedAt = new Date();
  batch.deletedBy = req.authUser._id;
  await batch.save();
  await recordActivity({
    user: req.authUser,
    action: `Menghapus batch ${batch.batchNumber} dari obat ${med.name}`,
  }).catch((error) => console.error('[STOCK_BATCH_ACTIVITY_FAILURE]', error?.message || error));
  await refreshStockNotificationsSafely('stock.delete-batch');
  res.json({ success: true, data: null });
});
