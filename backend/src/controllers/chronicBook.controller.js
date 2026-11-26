/**
 * Menangani permintaan dan respons HTTP untuk fitur kronis buku. Controller meneruskan pekerjaan domain ke service dan mengembalikan hasil dengan format API.
 */
import { ChronicBook } from '../models/ChronicBook.js';
import { Patient } from '../models/Patient.js';
import { uploadFile, deleteFile } from '../config/gridfs.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError, conflict, notFound } from '../utils/AppError.js';
import { assertPdfFile } from '../utils/fileValidation.js';
import { normalizeBpjs } from '../utils/patient-identifiers.js';

/**
 * Mengubah dokumen Buku Kronis beserta relasi pasien dan pengunggah menjadi field publik yang digunakan daftar serta pratinjau dokumen.
 */
function map(b) {
  return {
    _id: String(b._id), patientId: String(b.patientId._id || b.patientId), patientName: b.patientId?.name || b.patientName || '', bpjsNumber: b.patientId?.bpjsNumber || b.bpjsNumber || '', fileName: b.fileName, fileData: `/api/files/${b.fileId}`, fileUrl: `/api/files/${b.fileId}`, fileId: String(b.fileId), uploadedAt: b.uploadedAt || b.createdAt, uploadedBy: b.uploadedBy?.username || '',
  };
}

/**
 * Memastikan dokumen buku kronis yang diproses memiliki format PDF yang diterima sebelum disimpan atau diganti.
 */
async function ensurePdf(req) {
  const file = req.file;
  if (!file) throw new AppError('File Buku Kronis wajib diunggah.', 422, 'FILE_REQUIRED');
  return assertPdfFile(file, 'Buku Kronis');
}

export const createBook = asyncHandler(async (req, res, next) => {
  const file = await ensurePdf(req);
  const patient = await Patient.findById(req.body.patientId);
  if (!patient) return next(notFound('Pasien belum terdaftar.'));
  const submittedBpjs = normalizeBpjs(req.body.bpjsNumber);
  const registeredBpjs = normalizeBpjs(patient.bpjsNumber);
  if (!/^\d{13}$/.test(submittedBpjs)) {
    return next(new AppError('Nomor BPJS harus terdiri dari 13 digit angka.', 422, 'INVALID_BPJS_NUMBER'));
  }
  if (!/^\d{13}$/.test(registeredBpjs)) {
    return next(new AppError('Nomor BPJS pasien belum terdaftar dengan format 13 digit.', 422, 'BPJS_REQUIRED'));
  }
  if (submittedBpjs !== registeredBpjs) {
    return next(new AppError('Nomor BPJS tidak sesuai dengan data pasien.', 422, 'BPJS_MISMATCH'));
  }
  const existingBook = await ChronicBook.findOne({ patientId: patient._id, includeDeleted: true });
  if (existingBook && !existingBook.isDeleted) return next(conflict('Buku Kronis sudah ada. Gunakan fitur Ubah Buku Kronis.', 'CHRONIC_BOOK_EXISTS'));

  const fileId = await uploadFile({ buffer: file.buffer, filename: file.originalname, contentType: 'application/pdf', metadata: { documentType: 'chronic-book', patientId: String(patient._id) } });
  let book;
  const previousFileId = existingBook?.fileId;
  try {
    if (existingBook?.isDeleted) {
      existingBook.isDeleted = false;
      existingBook.deletedAt = null;
      existingBook.deletedBy = null;
      existingBook.fileId = fileId;
      existingBook.fileName = file.originalname;
      existingBook.mimeType = 'application/pdf';
      existingBook.fileSize = file.size;
      existingBook.uploadedBy = req.authUser._id;
      existingBook.uploadedAt = new Date();
      book = await existingBook.save();
    } else {
      book = await ChronicBook.create({ patientId: patient._id, fileId, fileName: file.originalname, mimeType: 'application/pdf', fileSize: file.size, uploadedBy: req.authUser._id, uploadedAt: new Date() });
    }
  } catch (error) {
    await deleteFile(fileId).catch(() => null);
    throw error;
  }

  if (previousFileId && String(previousFileId) !== String(fileId)) {
    await deleteFile(previousFileId).catch(() => null);
  }
  const populated = await ChronicBook.findById(book._id).populate('patientId', 'name bpjsNumber').populate({ path: 'uploadedBy', select: 'username', match: { includeDeleted: true } }).lean();
  res.status(201).json({ success: true, data: map(populated) });
});

export const updateBook = asyncHandler(async (req, res, next) => {
  const file = await ensurePdf(req);
  const book = await ChronicBook.findOne({ patientId: req.params.patientId });
  if (!book) return next(notFound('Buku kronis pasien tidak ditemukan.'));
  const oldFileId = book.fileId;
  const newFileId = await uploadFile({ buffer: file.buffer, filename: file.originalname, contentType: 'application/pdf', metadata: { documentType: 'chronic-book', patientId: String(book.patientId) } });
  book.fileId = newFileId;
  book.fileName = file.originalname;
  book.fileSize = file.size;
  book.mimeType = 'application/pdf';
  book.updatedBy = req.authUser._id;
  book.uploadedAt = new Date();
  try {
    await book.save();
  } catch (error) {
    await deleteFile(newFileId).catch(() => null);
    throw error;
  }
  await deleteFile(oldFileId).catch(() => null);
  const populated = await ChronicBook.findById(book._id).populate('patientId', 'name bpjsNumber').populate({ path: 'uploadedBy', select: 'username', match: { includeDeleted: true } }).lean();
  res.json({ success: true, data: map(populated) });
});

export const removeBook = asyncHandler(async (req, res, next) => {
  const book = await ChronicBook.findOne({ patientId: req.params.patientId });
  if (!book) return next(notFound('Buku kronis pasien tidak ditemukan.'));
  book.isDeleted = true;
  book.deletedAt = new Date();
  book.deletedBy = req.authUser._id;
  await book.save();
  res.json({ success: true, data: null });
});
