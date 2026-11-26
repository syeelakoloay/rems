/**
 * Menangani permintaan dan respons HTTP untuk fitur pengguna. Controller meneruskan pekerjaan domain ke service dan mengembalikan hasil dengan format API.
 */
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { createPasswordResetToken, createAccountActivationToken, hashPassword, hashPasswordResetToken, normalizeUsername, publicUser, validateStrongPassword, isValidEmail, normalizeEmail } from '../services/auth.service.js';
import { recordActivity } from '../services/activity.service.js';
import { storePdf, deleteFile, deleteStoredFiles } from '../services/file.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { conflict, notFound, AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { isEmailServiceConfigured, sendAccountActivationEmail, sendPasswordResetEmail, verifyEmailTransport } from '../services/email.service.js';
import { notifyAccountWelcome } from '../services/notification.service.js';

/**
 * Menyeragamkan field permintaan akun sebelum validasi, termasuk nama pengguna, peran, NIK, email, dan password.
 */
function normalizedBody(body) {
  const role = String(body.role || '').trim();
  const nik = String(body.nik || '').trim();
  return { username: String(body.name || body.username || '').trim(), role, nik, email: normalizeEmail(body.email), password: body.password == null ? '' : String(body.password) };
}

/**
 * Memastikan dokumen wajib tersedia dan menyimpannya melalui layanan PDF/GridFS setelah middleware memeriksa unggahan.
 */
async function validateUploadedDocument(file, label) {
  if (!file) throw new AppError(`${label} wajib berupa file PDF maksimal 5 MB.`, 422, 'INVALID_DOCUMENT');
  return storePdf(file, { documentType: label.toLowerCase() });
}

/**
 * Membuat akun Admin dalam keadaan menunggu aktivasi, dengan passwordHash kosong dan token aktivasi acak yang hash-nya disimpan selama 15 menit. Jika SMTP atau unggahan gagal, akun dan berkas parsial dibersihkan.
 */
export const createUser = asyncHandler(async (req, res, next) => {
  const body = normalizedBody(req.body);
  const errors = [];
  if (!body.username) errors.push('Nama lengkap wajib diisi.');
  if (!isValidEmail(body.email)) errors.push('Masukkan alamat email yang valid.');
  if (!['doctor', 'pharmacy'].includes(body.role)) errors.push('Hak akses tidak valid.');
  if (!/^\d{16}$/.test(body.nik)) errors.push('NIK harus terdiri dari 16 digit angka.');
  if (!req.files?.str?.[0] || !req.files?.sip?.[0]) errors.push('STR dan SIP wajib berupa PDF maksimal 5 MB.');
  if (errors.length) return next(new AppError(errors.join(' '), 422, 'VALIDATION_ERROR'));

  if (!isEmailServiceConfigured()) return next(new AppError('SMTP belum dikonfigurasi. Akun belum dibuat.', 503, 'EMAIL_NOT_CONFIGURED'));
  try {
    await verifyEmailTransport();
  } catch (error) {
    console.error('Account activation email transport unavailable:', error?.code || 'EMAIL_TRANSPORT_UNAVAILABLE');
    return next(new AppError('Email aktivasi tidak dapat dikirim. Periksa konfigurasi SMTP.', 503, 'EMAIL_TRANSPORT_UNAVAILABLE'));
  }

  const usernameNormalized = normalizeUsername(body.username);
  if (await User.exists({ nik: body.nik, includeDeleted: true })) return next(conflict('NIK sudah digunakan oleh akun lain.', 'NIK_EXISTS'));
  if (await User.exists({ emailNormalized: body.email, includeDeleted: true })) return next(conflict('Email sudah digunakan oleh akun lain.', 'EMAIL_EXISTS'));

  const { token, tokenHash } = createAccountActivationToken();
  const activationExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const uploadedFileIds = [];
  let user;
  try {
    const str = await validateUploadedDocument(req.files.str[0], 'STR');
    uploadedFileIds.push(str.fileId);
    const sip = await validateUploadedDocument(req.files.sip[0], 'SIP');
    uploadedFileIds.push(sip.fileId);

    user = await User.create({
      username: body.username,
      usernameNormalized,
      email: body.email,
      emailNormalized: body.email,
      passwordHash: null,
      role: body.role,
      nik: body.nik,
      active: false,
      activationTokenHash: tokenHash,
      activationExpiresAt,
      str,
      sip,
    });

    const baseUrl = String(env.clientUrl || '').replace(/\/$/, '');
    const activationUrl = `${baseUrl}/?activate=${encodeURIComponent(token)}`;
    await sendAccountActivationEmail({ to: body.email, username: user.username, activationUrl, expiresMinutes: 15 });
    // User record and email now own the uploaded documents and activation token.
    uploadedFileIds.length = 0;
  } catch (error) {
    if (user) await User.deleteOne({ _id: user._id }).catch(() => null);
    await deleteStoredFiles(uploadedFileIds);
    if (error?.code === 'EMAIL_NOT_CONFIGURED') return next(new AppError('SMTP belum dikonfigurasi. Akun belum dibuat.', 503, 'EMAIL_NOT_CONFIGURED'));
    if (error?.code && String(error.code).startsWith('E')) {
      console.error('Account activation email delivery failed:', error.code);
      return next(new AppError('Email aktivasi gagal dikirim. Akun belum dibuat. Periksa SMTP lalu coba kembali.', 502, 'EMAIL_DELIVERY_FAILED'));
    }
    throw error;
  }

  await recordActivity({ user: req.authUser, action: `Menambahkan akun ${user.username} dan mengirim tautan aktivasi` }).catch(() => null);
  res.status(201).json({ success: true, data: publicUser(user) });
});

/**
 * Memperbarui data akun dengan aturan bahwa peran tidak dapat diubah, NIK/email yang sudah terisi tidak boleh dikosongkan, dan dokumen STR/SIP hanya dapat diganti bukan dihapus.
 */
export const updateUser = asyncHandler(async (req, res, next) => {
  const target = await User.findById(req.params.id).select('+passwordHash +resetPasswordTokenHash +resetPasswordExpiresAt');
  if (!target) return next(notFound('Akun tidak ditemukan.'));
  const body = normalizedBody(req.body);
  const isAdminAccount = target.role === 'admin';
  // The seeded Admin may keep the initially empty email/NIK until they are first provided.
  // Once either field has a value, clearing it is no longer accepted.
  const mayKeepEmailEmpty = isAdminAccount && !String(target.email || '').trim() && !body.email;
  const mayKeepNikEmpty = isAdminAccount && !String(target.nik || '').trim() && !body.nik;
  const validEmail = mayKeepEmailEmpty || isValidEmail(body.email);
  const validNik = mayKeepNikEmpty || /^\d{16}$/.test(body.nik);
  if (!body.username || !['admin', 'doctor', 'pharmacy'].includes(body.role) || !validNik || !validEmail) return next(new AppError('Data akun belum lengkap atau tidak valid.', 422, 'VALIDATION_ERROR'));
  if (body.role !== target.role) return next(new AppError('Hak akses tidak dapat diubah setelah akun dibuat.', 422, 'ROLE_IMMUTABLE'));
  if (body.nik) {
    const duplicateNik = await User.exists({ nik: body.nik, _id: { $ne: target._id }, includeDeleted: true });
    if (duplicateNik) return next(conflict('NIK sudah digunakan oleh akun lain.', 'NIK_EXISTS'));
  }
  if (body.email) {
    const duplicateEmail = await User.exists({ emailNormalized: body.email, _id: { $ne: target._id }, includeDeleted: true });
    if (duplicateEmail) return next(conflict('Email sudah digunakan oleh akun lain.', 'EMAIL_EXISTS'));
  }

  const previous = { username: target.username, role: target.role, email: target.email || '', nik: target.nik || '', strFileId: String(target.str?.fileId || ''), sipFileId: String(target.sip?.fileId || '') };
  const oldFiles = [];
  const uploadedFileIds = [];
  // STR/SIP documents may be replaced, but cannot be cleared from an existing account.
  try {
    if (req.files?.str?.[0]) {
      if (target.str?.fileId) oldFiles.push(target.str.fileId);
      target.str = await validateUploadedDocument(req.files.str[0], 'STR');
      uploadedFileIds.push(target.str.fileId);
    }
    if (req.files?.sip?.[0]) {
      if (target.sip?.fileId) oldFiles.push(target.sip.fileId);
      target.sip = await validateUploadedDocument(req.files.sip[0], 'SIP');
      uploadedFileIds.push(target.sip.fileId);
    }
    target.username = body.username;
    target.usernameNormalized = normalizeUsername(body.username);
    // Account roles are immutable after creation. Keep the stored role unchanged.
    target.nik = body.nik;
    target.email = body.email || '';
    target.emailNormalized = body.email || undefined;
    await target.save();
    // The updated user document now owns the replacement files.
    uploadedFileIds.length = 0;
  } catch (error) {
    await deleteStoredFiles(uploadedFileIds);
    throw error;
  }
  await Promise.all(oldFiles.map((id) => deleteFile(id).catch(() => null)));
  const changes = [];
  if (previous.username !== target.username) changes.push(`Memperbarui nama akun ${target.username}`);
  if (previous.role !== target.role) changes.push(`Memperbarui hak akses akun ${target.username}`);
  if (previous.email !== target.email) changes.push(`Memperbarui email akun ${target.username}`);
  if (previous.nik !== target.nik) changes.push(`Memperbarui NIK akun ${target.username}`);
  if (previous.strFileId !== String(target.str?.fileId || '')) changes.push(`Memperbarui dokumen STR akun ${target.username}`);
  if (previous.sipFileId !== String(target.sip?.fileId || '')) changes.push(`Memperbarui dokumen SIP akun ${target.username}`);
  if (!changes.length) changes.push(`Menyimpan perubahan akun ${target.username}`);
  await Promise.all(changes.map((action) => recordActivity({ user: req.authUser, action })));
  res.json({ success: true, data: publicUser(target) });
});

/**
 * Mengaktifkan atau menonaktifkan akun yang sudah melewati aktivasi. Akun Admin dan akun yang masih menunggu pembuatan password tidak dapat dinonaktifkan melalui aksi ini.
 */
export const toggleStatus = asyncHandler(async (req, res, next) => {
  const target = await User.findById(req.params.id).select('+activationTokenHash');
  if (!target) return next(notFound('Akun tidak ditemukan.'));
  if (target.role === 'admin') return next(new AppError('Akun Admin tidak dapat dinonaktifkan dari menu ini.', 422, 'ADMIN_STATUS_PROTECTED'));
  if (target.activationTokenHash) return next(new AppError('Akun belum diaktifkan oleh pemiliknya.', 422, 'ACCOUNT_ACTIVATION_PENDING'));
  target.active = !target.active;
  await target.save();
  await recordActivity({ user: req.authUser, action: `${target.active ? 'Mengaktifkan' : 'Menonaktifkan'} akun ${target.username}` });
  res.json({ success: true, data: publicUser(target) });
});

/**
 * Melakukan soft delete untuk akun non-Admin selain akun yang sedang digunakan, membersihkan token, dan melepaskan kunci email login tanpa menghapus riwayat akun secara fisik.
 */
export const deleteUser = asyncHandler(async (req, res, next) => {
  const target = await User.findById(req.params.id);
  if (!target) return next(notFound('Akun tidak ditemukan atau penghapusan tidak dapat diproses.'));
  if (target.role === 'admin') return next(new AppError('Akun Admin tidak dapat dihapus dari menu ini.', 422, 'ADMIN_DELETE_PROTECTED'));
  if (String(target._id) === String(req.auth.sub)) return next(new AppError('Akun yang sedang digunakan tidak dapat dihapus.', 422, 'SELF_DELETE_PROTECTED'));
  target.isDeleted = true;
  target.deletedAt = new Date();
  target.deletedBy = req.authUser._id;
  target.active = false;
  // Keep the historical email in `email`, but release its normalized key so a future account may use it.
  // The sentinel is unique and cannot match a valid normalized email address.
  target.emailNormalized = `__deleted__${target._id}`;
  target.resetPasswordTokenHash = null;
  target.resetPasswordExpiresAt = null;
  target.activationTokenHash = null;
  target.activationExpiresAt = null;
  await target.save();
  await recordActivity({ user: req.authUser, action: `Menghapus akun ${target.username}` });
  res.json({ success: true, data: null });
});

/**
 * Meminta reset password oleh Admin setelah memeriksa akun bukan Admin dan memiliki alamat email valid.
 */
export const requestPasswordReset = asyncHandler(async (req, res, next) => {
  const target = await User.findById(req.params.id).select('+resetPasswordTokenHash +resetPasswordExpiresAt');
  if (!target) return next(notFound('Akun tidak ditemukan.'));
  if (target.role === 'admin') return next(new AppError('Reset password Admin harus dilakukan melalui prosedur keamanan khusus.', 422, 'ADMIN_RESET_PROTECTED'));
  if (!target.email || !isValidEmail(target.email)) return next(new AppError('Akun ini belum memiliki email yang valid. Perbarui email akun terlebih dahulu.', 422, 'ACCOUNT_EMAIL_MISSING'));
  return issueResetEmail(target, req.authUser, res, next, 'Admin meminta reset password akun');
});

/**
 * Memproses permintaan reset mandiri untuk Admin, Apoteker, dan Dokter FKTP dengan respons umum agar keberadaan akun tidak bocor.
 */
export const requestOwnPasswordReset = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  // Always return the same response to avoid revealing whether an email is registered.
  const generic = { success: true, message: 'Jika email terdaftar, tautan reset password sudah dikirim. Periksa kotak masuk dan folder spam.' };
  if (!isValidEmail(email)) return res.json({ success: true, data: { message: generic.message }, message: generic.message });

  // Check service availability before looking up the address. A global SMTP
  // problem can therefore be reported accurately without revealing whether an
  // email address belongs to an account.
  if (!isEmailServiceConfigured()) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'EMAIL_NOT_CONFIGURED',
        message: 'Email belum dikonfigurasi. Hubungi Admin.',
      },
    });
  }
  try {
    await verifyEmailTransport();
  } catch (error) {
    console.error('Password reset email transport unavailable:', error?.code || 'EMAIL_TRANSPORT_UNAVAILABLE');
    return res.status(503).json({
      success: false,
      error: {
        code: error?.code === 'EMAIL_NOT_CONFIGURED' ? 'EMAIL_NOT_CONFIGURED' : 'EMAIL_TRANSPORT_UNAVAILABLE',
        message: error?.code === 'EMAIL_NOT_CONFIGURED'
          ? 'Email belum dikonfigurasi. Hubungi Admin.'
          : 'Email tidak dapat dikirim. Coba lagi nanti.',
      },
    });
  }

  const target = await User.findOne({ emailNormalized: email, active: true });
  if (target) {
    try { await issueResetEmail(target, target, res, null, 'Permintaan reset password mandiri', true); }
    catch (error) { console.error('Password reset email delivery failed:', error?.code || 'EMAIL_DELIVERY_FAILED'); }
  }
  return res.json({ success: true, data: { message: generic.message }, message: generic.message });
});

/**
 * Membuat token reset sekali pakai, menyimpan hash dan batas kedaluwarsanya, lalu mengirim tautan ke email terdaftar tanpa membocorkan token ke respons API.
 */
async function issueResetEmail(target, actor, res, next, action, suppressErrors = false) {
  const { token, tokenHash } = createPasswordResetToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  target.resetPasswordTokenHash = tokenHash;
  target.resetPasswordExpiresAt = expiresAt;
  await target.save();
  const baseUrl = String(env.clientUrl || '').replace(/\/$/, '');
  const resetUrl = `${baseUrl}/?reset=${encodeURIComponent(token)}`;
  try {
    await sendPasswordResetEmail({ to: target.email, name: target.username, resetUrl, expiresMinutes: 15 });
  } catch (error) {
    target.resetPasswordTokenHash = null;
    target.resetPasswordExpiresAt = null;
    await target.save();
    console.error('Password reset email delivery failed:', error?.code || 'EMAIL_DELIVERY_FAILED');
    await recordActivity({
      user: actor,
      action: `Gagal mengirim tautan reset password akun ${target.username}`,
    }).catch(() => null);
    if (suppressErrors) return false;
    if (next) {
      if (error?.code === 'EMAIL_NOT_CONFIGURED') {
        return next(new AppError('SMTP belum dikonfigurasi. Hubungi Admin.', 503, 'EMAIL_NOT_CONFIGURED'));
      }
      return next(new AppError('Email reset gagal dikirim. Periksa SMTP.', 502, 'EMAIL_DELIVERY_FAILED'));
    }
    throw error;
  }
  await recordActivity({ user: actor, action: `${action}: ${target.username}` });
  if (!suppressErrors && res) res.json({ success: true, data: { sent: true, expiresAt } });
  return true;
}

/**
 * Memvalidasi password dan token aktivasi, lalu mengonsumsi token hash yang belum kedaluwarsa secara atomik. Akun hanya menjadi aktif setelah token cocok dan password berhasil di-hash.
 */
export const activateAccount = asyncHandler(async (req, res, next) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[a-f0-9]{64}$/i.test(token) || !validateStrongPassword(password)) {
    return next(new AppError('Token aktivasi atau password tidak valid.', 422, 'ACTIVATION_INVALID'));
  }

  const tokenHash = hashPasswordResetToken(token);
  const passwordHash = await hashPassword(password);
  const target = await User.findOneAndUpdate({
    activationTokenHash: tokenHash,
    activationExpiresAt: { $gt: new Date() },
    active: false,
  }, {
    $set: { passwordHash, active: true, activationTokenHash: null, activationExpiresAt: null },
  }, { new: true }).select('_id username role');

  if (!target) return next(new AppError('Tautan aktivasi tidak valid, sudah digunakan, atau kedaluwarsa.', 422, 'ACTIVATION_TOKEN_INVALID'));
  await notifyAccountWelcome(target).catch((error) => {
    console.error('Account welcome notification could not be saved:', error?.code || 'NOTIFICATION_SAVE_FAILED');
  });
  await recordActivity({ user: target, action: 'Akun berhasil diaktifkan melalui tautan email' }).catch(() => null);
  res.json({ success: true, data: null });
});

/**
 * Mengganti password hanya dengan token reset yang masih berlaku, lalu mengosongkan token secara atomik agar tautan hanya dapat dipakai sekali.
 */
export const resetPassword = asyncHandler(async (req, res, next) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  if (!token || !validateStrongPassword(password)) {
    return next(new AppError('Token reset atau password tidak valid.', 422, 'RESET_PASSWORD_INVALID'));
  }

  const tokenHash = hashPasswordResetToken(token);
  const passwordHash = await hashPassword(password);
  // Atomic token consumption prevents two simultaneous requests from using the same token.
  const target = await User.findOneAndUpdate({
    resetPasswordTokenHash: tokenHash,
    resetPasswordExpiresAt: { $gt: new Date() },
  }, {
    $set: { passwordHash, resetPasswordTokenHash: null, resetPasswordExpiresAt: null },
  }, { new: true }).select('_id username role');

  if (!target) return next(new AppError('Link reset password tidak valid atau sudah kedaluwarsa.', 422, 'RESET_TOKEN_INVALID'));

  await recordActivity({ user: target, action: 'Password berhasil diubah melalui reset password' });
  res.json({ success: true, data: null });
});

/**
 * Mengubah password pengguna yang sedang login setelah memeriksa aturan kekuatan password dan memastikan password baru berbeda dari password lama.
 */
export const changeOwnPassword = asyncHandler(async (req, res, next) => {
  const password = String(req.body.password || '');
  if (!validateStrongPassword(password)) return next(new AppError('Password belum memenuhi aturan keamanan.', 422, 'INVALID_PASSWORD'));
  const target = await User.findById(req.auth.sub).select('+passwordHash');
  if (!target) return next(notFound('Akun tidak ditemukan.'));
  const same = await bcrypt.compare(password, target.passwordHash);
  if (same) return next(new AppError('Password baru tidak boleh sama dengan password lama.', 422, 'PASSWORD_SAME'));
  target.passwordHash = await hashPassword(password);
  await target.save();
  res.json({ success: true, data: null });
});
