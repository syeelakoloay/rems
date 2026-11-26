/**
 * Memuat aturan bisnis dan proses data untuk fitur email. Lapisan ini menjadi tempat proses domain dijalankan sebelum hasilnya dikirim kembali ke controller.
 */
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter;
let transporterVerifiedAt = 0;

/**
 * Memeriksa apakah host SMTP, akun, password, dan alamat pengirim sudah tersedia sebelum pengiriman email dijalankan.
 */
export function isEmailServiceConfigured() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass && env.emailFrom);
}

/**
 * Membuat transporter Nodemailer saat pertama dibutuhkan, menggunakan pengaturan TLS dari konfigurasi, lalu memakai ulang instance selama proses backend berjalan.
 */
function getTransporter() {
  if (!isEmailServiceConfigured()) {
    const error = new Error('SMTP belum dikonfigurasi.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }
  if (!transporter) transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    requireTLS: !env.smtpSecure && env.smtpPort === 587,
    auth: { user: env.smtpUser, pass: env.smtpPass },
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
  });
  return transporter;
}

/**
 * Memeriksa koneksi SMTP sebelum alur pembuatan akun mengandalkan pengiriman email aktivasi.
 */
export async function verifyEmailTransport() {
  const currentTransporter = getTransporter();
  // Cache a successful connection/auth check briefly so rapid requests do not
  // reconnect to the SMTP provider for every single form submission.
  if (Date.now() - transporterVerifiedAt < 60_000) return true;
  try {
    await currentTransporter.verify();
    transporterVerifiedAt = Date.now();
    return true;
  } catch (error) {
    transporterVerifiedAt = 0;
    throw error;
  }
}

/**
 * Menyusun versi HTML dan teks biasa dari email REMS agar salam, isi, tautan, dan penutup konsisten.
 */
function buildEmailContent({ name, paragraphs = [], action = null, reminders = [] }) {
  const displayName = String(name || '').trim() || 'Pengguna REMS';
  const greeting = `Halo ${displayName},`;
  const textLines = [greeting, '', ...paragraphs];
  if (action) textLines.push('', `${action.label}: ${action.url}`);
  if (reminders.length) textLines.push('', ...reminders);
  textLines.push('', 'Terima kasih.', '', 'Salam,', 'Admin Sistem REMS');

  const htmlParagraphs = paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
  const htmlAction = action
    ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#176f83;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>`
    : '';
  const htmlReminders = reminders.map((reminder) => `<p>${escapeHtml(reminder)}</p>`).join('');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#243b45;line-height:1.6"><p>${escapeHtml(greeting)}</p>${htmlParagraphs}${htmlAction}${htmlReminders}<p>Terima kasih.</p><p>Salam,<br><strong>Admin Sistem REMS</strong></p></div>`;

  return { text: textLines.join('\n'), html };
}

/**
 * Mengirim tautan reset password sekali pakai dengan masa berlaku terbatas. Email tidak memuat password maupun token mentah sebagai teks terpisah.
 */
export async function sendPasswordResetEmail({ to, name, resetUrl, expiresMinutes = 15 }) {
  const content = buildEmailContent({
    name,
    paragraphs: ['Kami menerima permintaan untuk mengatur ulang password akun REMS Anda.'],
    action: { label: 'Buat Password Baru', url: resetUrl },
    reminders: [
      `Tautan ini berlaku selama ${expiresMinutes} menit dan hanya dapat digunakan satu kali.`,
      'Apabila Anda tidak meminta reset password, abaikan email ini. Jangan bagikan tautan ini kepada siapa pun.',
    ],
  });
  return getTransporter().sendMail({
    from: env.emailFrom,
    to,
    subject: 'Tautan Reset Password REMS',
    ...content,
  });
}

/**
 * Mengirim username dan tautan aktivasi sekali pakai agar pengguna membuat password sendiri. Email tidak mengirim password pengguna.
 */
export async function sendAccountActivationEmail({ to, username, activationUrl, expiresMinutes = 15 }) {
  const content = buildEmailContent({
    name: username,
    paragraphs: [
      'Akun REMS Anda telah berhasil dibuat oleh Admin.',
      `Username Anda: ${username}`,
      'Gunakan tautan berikut untuk mengaktifkan akun dan membuat password sendiri.',
    ],
    action: { label: 'Aktifkan Akun dan Buat Password', url: activationUrl },
    reminders: [
      `Tautan aktivasi berlaku selama ${expiresMinutes} menit dan hanya dapat digunakan satu kali.`,
      'Pastikan email ini tetap dapat Anda akses. Setelah membuat password, simpan dengan aman dan jangan membagikannya kepada siapa pun.',
    ],
  });
  return getTransporter().sendMail({
    from: env.emailFrom,
    to,
    subject: 'Aktivasi Akun REMS',
    ...content,
  });
}

/**
 * Mengirim email sesuai status permohonan: pemberitahuan menunggu verifikasi, persetujuan, atau penolakan beserta alasan bila tersedia.
 */
export async function sendAccountRegistrationEmail({ to, name, status, reason = '' }) {
  let subject;
  let paragraphs;
  let action = null;
  let reminders = [];

  if (status === 'pending') {
    subject = 'Permohonan Pembuatan Akun REMS Diterima';
    paragraphs = [
      'Permohonan pembuatan akun REMS Anda telah diterima dan sedang menunggu verifikasi Admin.',
      'Anda belum dapat login sebelum permohonan disetujui. Informasi keputusan akan dikirimkan melalui email ini.',
    ];
    reminders = ['Pastikan email terdaftar tetap dapat Anda akses dan periksa kotak masuk secara berkala.'];
  } else if (status === 'approved') {
    subject = 'Pembuatan Akun REMS Disetujui';
    paragraphs = [
      'Selamat, permohonan pembuatan akun REMS Anda telah disetujui oleh Admin.',
      'Akun Anda sudah aktif. Anda dapat login menggunakan email dan password yang didaftarkan.',
    ];
    action = { label: 'Buka Halaman Login REMS', url: env.clientUrl };
    reminders = ['Simpan password dengan aman dan jangan membagikannya kepada siapa pun.'];
  } else {
    subject = 'Pembuatan Akun REMS Belum Disetujui';
    paragraphs = ['Mohon maaf, permohonan pembuatan akun REMS Anda belum disetujui oleh Admin.'];
    if (String(reason || '').trim()) paragraphs.push(`Alasan: ${String(reason).trim()}`);
    reminders = ['Silakan hubungi Admin apabila memerlukan informasi lebih lanjut.'];
  }

  const content = buildEmailContent({ name, paragraphs, action, reminders });
  return getTransporter().sendMail({ from: env.emailFrom, to, subject, ...content });
}

/**
 * Mengamankan nilai html sebelum dimasukkan ke konten HTML atau dokumen.
 */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
