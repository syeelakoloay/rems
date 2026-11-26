/**
 * Menangani permintaan dan respons HTTP untuk fitur berkas. Controller meneruskan pekerjaan domain ke service dan mengembalikan hasil dengan format API.
 */
import { streamFile, getFileInfo } from '../config/gridfs.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ObjectId } from 'mongodb';
import { User } from '../models/User.js';
import { AccountRegistration } from '../models/AccountRegistration.js';
import { ChronicBook } from '../models/ChronicBook.js';
import { Medication } from '../models/Medication.js';
import { Patient } from '../models/Patient.js';

/**
 * Menentukan izin unduh berdasarkan jenis dokumen dan kepemilikan. Admin hanya
 * dapat membaca STR/SIP untuk manajemen akun; data Buku Kronis dibatasi bagi
 * Dokter FKTP dan Apoteker. Gambar obat dapat dibaca pengguna yang memantau stok.
 */
async function canReadFile(fileId, user) {
  // Setiap pengguna hanya dapat membuka STR/SIP miliknya sendiri dari Profil.
  const ownDocument = await User.exists({
    _id: user._id,
    $or: [{ 'str.fileId': fileId }, { 'sip.fileId': fileId }],
  });
  if (ownDocument) return true;

  if (user.role === 'admin') {
    // Admin hanya dapat membuka STR/SIP yang terkait dengan akun atau
    // permohonan pendaftaran untuk keperluan verifikasi/manajemen akun.
    const accountDocument = await User.exists({
      $or: [{ 'str.fileId': fileId }, { 'sip.fileId': fileId }],
    });
    if (accountDocument) return true;

    const registrationDocument = await AccountRegistration.exists({
      $or: [{ 'str.fileId': fileId }, { 'sip.fileId': fileId }],
    });
    if (registrationDocument) return true;

    // Gambar obat termasuk informasi persediaan, bukan data klinis pasien.
    const adminMedicationImage = await Medication.exists({ imageFileId: fileId, active: true });
    if (adminMedicationImage) return true;

    // Tidak memberikan akses Admin ke Buku Kronis atau dokumen klinis pasien.
    return false;
  }

  // Buku Kronis hanya dapat dibaca oleh Dokter FKTP dan Apoteker.
  if (user.role === 'pharmacy') {
    const chronicBook = await ChronicBook.exists({ fileId });
    if (chronicBook) return true;
  }

  if (user.role === 'doctor') {
    const chronicBook = await ChronicBook.findOne({ fileId }).select('patientId').lean();
    if (chronicBook) {
      const assignedPatient = await Patient.exists({
        _id: chronicBook.patientId,
        assignedDoctorId: user._id,
      });
      if (assignedPatient) return true;
    }
  }

  // Gambar obat merupakan bagian dari pemantauan/pengelolaan persediaan.
  if (['admin', 'pharmacy'].includes(user.role)) {
    const medicationImage = await Medication.exists({ imageFileId: fileId, active: true });
    if (medicationImage) return true;
  }

  return false;
}

export const download = asyncHandler(async (req, res, next) => {
  if (!/^[a-fA-F0-9]{24}$/.test(String(req.params.id || ''))) {
    return next(new AppError('File tidak valid.', 400, 'INVALID_FILE_ID'));
  }
  const id = new ObjectId(req.params.id);
  const file = await getFileInfo(id);

  if (!file || !(await canReadFile(id, req.authUser))) {
    return next(new AppError('File tidak ditemukan atau Anda tidak memiliki akses.', 404, 'FILE_NOT_FOUND'));
  }

  res.setHeader('Content-Type', file.contentType || file.metadata?.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (file.length !== undefined) {
    res.setHeader('Content-Length', String(file.length));
  }

  const stream = streamFile(id);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(404).end();
    } else {
      res.end();
    }
  });
  stream.pipe(res);
});
