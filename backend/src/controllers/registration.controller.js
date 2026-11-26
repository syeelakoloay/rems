/**
 * Menangani permintaan dan respons HTTP untuk fitur pendaftaran akun. Controller meneruskan pekerjaan domain ke service dan mengembalikan hasil dengan format API.
 */
import { AccountRegistration } from '../models/AccountRegistration.js';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { hashPassword, normalizeEmail, normalizeUsername, isValidEmail, validateStrongPassword, publicUser } from '../services/auth.service.js';
import { recordActivity } from '../services/activity.service.js';
import { storePdf, deleteStoredFiles } from '../services/file.service.js';
import { sendAccountRegistrationEmail } from '../services/email.service.js';
import { notifyAccountWelcome } from '../services/notification.service.js';
import { AppError, conflict, notFound } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Menghitung masa retensi 30 hari untuk notifikasi permohonan pendaftaran akun.
 */
const expiresAt = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
/**
 * Membentuk data permohonan yang aman untuk dikirim ke frontend. Hash password dan data internal lain tidak disertakan.
 */
const publicRegistration = (item) => ({
  id: String(item._id),
  _id: String(item._id),
  name: item.name,
  username: item.name,
  role: item.role,
  email: item.email,
  nik: item.nik,
  status: item.status,
  decisionReason: item.decisionReason || '',
  createdAt: item.createdAt,
  reviewedAt: item.reviewedAt,
  str: item.str ? { fileId: String(item.str.fileId), name: item.str.name, type: item.str.mimeType, size: item.str.size, url: `/api/files/${item.str.fileId}` } : null,
  sip: item.sip ? { fileId: String(item.sip.fileId), name: item.sip.name, type: item.sip.mimeType, size: item.sip.size, url: `/api/files/${item.sip.fileId}` } : null,
});

/**
 * Memeriksa nama, email, peran yang diizinkan, NIK 16 digit, kekuatan password, serta keberadaan dokumen STR dan SIP PDF maksimal 5 MB.
 */
function validateRegistration(body, files) {
  const name = String(body?.name || '').trim();
  const email = normalizeEmail(body?.email);
  const role = String(body?.role || '').trim();
  const nik = String(body?.nik || '').trim();
  const password = String(body?.password || '');
  const errors = [];
  if (!name || name.length > 120) errors.push('Nama lengkap wajib diisi dan maksimal 120 karakter.');
  if (!isValidEmail(email)) errors.push('Masukkan alamat email yang valid.');
  if (!['doctor', 'pharmacy'].includes(role)) errors.push('Hak akses harus Apoteker atau Dokter FKTP.');
  if (!/^\d{16}$/.test(nik)) errors.push('NIK harus terdiri dari 16 digit angka.');
  if (!validateStrongPassword(password)) errors.push('Password minimal 8 karakter dan harus memuat huruf besar, huruf kecil, angka, serta simbol.');
  if (!files?.str?.[0] || !files?.sip?.[0]) errors.push('Unggah dokumen STR dan SIP dalam format PDF maksimal 5 MB.');
  if (errors.length) throw new AppError(errors.join(' '), 422, 'VALIDATION_ERROR');
  return { name, email, role, nik, password };
}

/**
 * Menyimpan permohonan pendaftaran setelah memeriksa duplikasi NIK/email, mengunggah dokumen, dan membuat hash password. Jika proses simpan gagal, berkas yang belum menjadi milik permohonan dibersihkan.
 */
export const submitRegistration = asyncHandler(async (req, res) => {
  const body = validateRegistration(req.body, req.files);
  const emailNormalized = body.email;
  const nameNormalized = normalizeUsername(body.name);

  const [userWithNik, userWithEmail, requestWithNik, requestWithEmail] = await Promise.all([
    User.exists({ nik: body.nik, includeDeleted: true }),
    User.exists({ emailNormalized, includeDeleted: true }),
    AccountRegistration.exists({ nik: body.nik, status: 'pending' }),
    AccountRegistration.exists({ emailNormalized, status: 'pending' }),
  ]);
  if (userWithNik || requestWithNik) throw conflict('NIK sudah terdaftar atau sedang menunggu verifikasi.', 'NIK_EXISTS');
  if (userWithEmail || requestWithEmail) throw conflict('Email sudah terdaftar atau sedang menunggu verifikasi.', 'EMAIL_EXISTS');

  const uploadedFileIds = [];
  let request;
  try {
    const str = await storePdf(req.files.str[0], { documentType: 'str', purpose: 'account-registration' });
    uploadedFileIds.push(str.fileId);
    const sip = await storePdf(req.files.sip[0], { documentType: 'sip', purpose: 'account-registration' });
    uploadedFileIds.push(sip.fileId);

    request = await AccountRegistration.create({
      name: body.name,
      nameNormalized,
      role: body.role,
      email: body.email,
      emailNormalized,
      nik: body.nik,
      passwordHash: await hashPassword(body.password),
      str,
      sip,
      status: 'pending',
    });
    // The pending registration now owns the uploaded documents.
    uploadedFileIds.length = 0;
  } catch (error) {
    await deleteStoredFiles(uploadedFileIds);
    throw error;
  }

  const admins = await User.find({ role: 'admin', active: true }).select('_id').lean();
  if (admins.length) {
    await Notification.insertMany(admins.map((admin) => ({
      recipientUserId: admin._id,
      type: 'account.registration.pending',
      title: 'Permohonan pembuatan akun baru',
      message: `${body.name} (${body.role === 'pharmacy' ? 'Apoteker' : 'Dokter FKTP'}) mengajukan pembuatan akun dan menunggu verifikasi.`,
      tone: 'warning',
      entityType: 'accountRegistration',
      entityId: request._id,
      expiresAt: expiresAt(),
    })));
  }

  let emailSent = true;
  try {
    await sendAccountRegistrationEmail({ to: body.email, name: body.name, status: 'pending' });
  } catch (error) {
    emailSent = false;
    console.error('Account registration email delivery failed:', error?.code || 'EMAIL_DELIVERY_FAILED');
  }

  res.status(201).json({
    success: true,
    data: {
      message: emailSent
        ? 'Jika email terdaftar, pemberitahuan pendaftaran sudah dikirim. Periksa kotak masuk dan folder spam.'
        : 'Pendaftaran tersimpan, tetapi email pemberitahuan gagal dikirim.',
      emailSent,
    },
  });
});

/**
 * Mengambil daftar permohonan pendaftaran terbaru dan mengirimkan hanya field publik yang dibutuhkan halaman verifikasi Admin.
 */
export const listRegistrations = asyncHandler(async (req, res) => {
  const items = await AccountRegistration.find().sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: items.map(publicRegistration) });
});

/**
 * Menandai notifikasi permohonan milik Admin sebagai telah diproses dan memperbarui pesan serta warna sesuai hasil persetujuan atau penolakan.
 */
async function updateAdminNotifications(request, status) {
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  const ids = admins.map((admin) => admin._id);
  if (!ids.length) return;
  await Notification.updateMany({
    recipientUserId: { $in: ids },
    type: 'account.registration.pending',
    entityType: 'accountRegistration',
    entityId: request._id,
    readAt: null,
  }, {
    $set: {
      readAt: new Date(),
      title: status === 'approved' ? 'Permohonan akun disetujui' : 'Permohonan akun ditolak',
      message: `Permohonan ${request.name} telah ${status === 'approved' ? 'disetujui' : 'ditolak'}.`,
      tone: status === 'approved' ? 'success' : 'danger',
    },
  });
}

/**
 * Menyetujui permohonan yang masih pending setelah memeriksa duplikasi NIK/email. Akun diaktifkan oleh keputusan Admin, pengiriman email dilaporkan terpisah, hash password permohonan dibersihkan, dan notifikasi sambutan dibuat.
 */
export const approveRegistration = asyncHandler(async (req, res, next) => {
  const request = await AccountRegistration.findById(req.params.id).select('+passwordHash');
  if (!request) return next(notFound('Permohonan pendaftaran tidak ditemukan.'));
  if (request.status !== 'pending') return next(conflict('Permohonan ini sudah diproses.', 'REGISTRATION_ALREADY_REVIEWED'));
  if (!request.passwordHash) return next(new AppError('Data password permohonan tidak tersedia. Minta pendaftar mengirim permohonan baru.', 422, 'REGISTRATION_PASSWORD_MISSING'));

  const [existingNik, existingEmail] = await Promise.all([
    User.exists({ nik: request.nik, includeDeleted: true }),
    User.exists({ emailNormalized: request.emailNormalized, includeDeleted: true }),
  ]);
  if (existingNik) return next(conflict('NIK telah digunakan oleh akun lain. Permohonan tidak dapat disetujui.', 'NIK_EXISTS'));
  if (existingEmail) return next(conflict('Email telah digunakan oleh akun lain. Permohonan tidak dapat disetujui.', 'EMAIL_EXISTS'));

  // Reserve the unique identity while creating the account inactive. The decision
  // itself must not be rolled back just because an external email provider is down.
  const user = await User.create({
    username: request.name,
    usernameNormalized: normalizeUsername(request.name),
    email: request.email,
    emailNormalized: request.emailNormalized,
    passwordHash: request.passwordHash,
    role: request.role,
    nik: request.nik,
    active: false,
    str: request.str,
    sip: request.sip,
  });

  let emailSent = true;
  try {
    await sendAccountRegistrationEmail({ to: request.email, name: request.name, status: 'approved' });
  } catch (error) {
    emailSent = false;
    // Do not log SMTP credentials, message contents, or recipient details.
    console.error('Account approval email delivery failed:', error?.code || 'EMAIL_DELIVERY_FAILED');
  }

  // Admin approval determines account access. Email delivery is reported separately.
  user.active = true;
  await user.save();
  request.status = 'approved';
  request.userId = user._id;
  request.reviewedBy = req.authUser._id;
  request.reviewedAt = new Date();
  request.passwordHash = null;
  await request.save();
  await updateAdminNotifications(request, 'approved');
  // Persist the welcome/reminder notice in the user's own notification card.
  await notifyAccountWelcome(user).catch((error) => console.error('Account welcome notification could not be saved:', error?.code || 'NOTIFICATION_SAVE_FAILED'));
  await recordActivity({ user: req.authUser, action: `Menyetujui pendaftaran akun ${request.name}` });
  res.json({
    success: true,
    data: {
      user: publicUser(user),
      emailSent,
      message: emailSent
        ? 'Jika email terdaftar, pemberitahuan pendaftaran sudah dikirim. Periksa kotak masuk dan folder spam.'
        : 'Akun disetujui, tetapi email pemberitahuan gagal dikirim.',
    },
  });
});

/**
 * Menolak permohonan yang masih pending, menyimpan alasan dan waktu peninjauan, serta menghapus hash password permohonan. Status tidak diubah bila email penolakan gagal dikirim.
 */
export const rejectRegistration = asyncHandler(async (req, res, next) => {
  const request = await AccountRegistration.findById(req.params.id).select('+passwordHash');
  if (!request) return next(notFound('Permohonan pendaftaran tidak ditemukan.'));
  if (request.status !== 'pending') return next(conflict('Permohonan ini sudah diproses.', 'REGISTRATION_ALREADY_REVIEWED'));
  const reason = String(req.body?.reason || '').trim();
  if (!reason) throw new AppError('Alasan penolakan wajib diisi.', 422, 'REGISTRATION_REJECTION_REASON_REQUIRED');
  if (reason.length > 500) throw new AppError('Alasan penolakan maksimal 500 karakter.', 422, 'REGISTRATION_REJECTION_REASON_TOO_LONG');
  try {
    await sendAccountRegistrationEmail({ to: request.email, name: request.name, status: 'rejected', reason });
  } catch (error) {
    console.error('Account rejection email delivery failed:', error?.code || 'EMAIL_DELIVERY_FAILED');
    return next(new AppError('Email notifikasi gagal. Periksa SMTP.', 502, error?.code === 'EMAIL_NOT_CONFIGURED' ? 'EMAIL_NOT_CONFIGURED' : 'EMAIL_DELIVERY_FAILED'));
  }
  request.status = 'rejected';
  request.decisionReason = reason;
  request.reviewedBy = req.authUser._id;
  request.reviewedAt = new Date();
  request.passwordHash = null;
  await request.save();
  await updateAdminNotifications(request, 'rejected');
  await recordActivity({ user: req.authUser, action: `Menolak pendaftaran akun ${request.name}` });
  res.json({ success: true, data: { emailSent: true, message: 'Jika email terdaftar, pemberitahuan pendaftaran sudah dikirim. Periksa kotak masuk dan folder spam.' } });
});
