/**
 * Memuat aturan bisnis dan proses data untuk fitur notifikasi. Lapisan ini menjadi tempat proses domain dijalankan sebelum hasilnya dikirim kembali ke controller.
 */
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { Medication } from '../models/Medication.js';
import { StockBatch } from '../models/StockBatch.js';
import { STOCK_ALERT_THRESHOLD, EXPIRY_ALERT_DAYS, NOTIFICATION_RETENTION_DAYS } from '../utils/constants.js';

/**
 * Menentukan waktu kedaluwarsa notifikasi berdasarkan jumlah hari retensi yang dikonfigurasi.
 */
const expiry = () => new Date(Date.now() + NOTIFICATION_RETENTION_DAYS * 86400000);

/**
 * Membuat notifikasi sambutan dan pengingat keamanan akun satu kali untuk akun terkait selama notifikasi sebelumnya masih dalam masa retensi.
 */
export async function notifyAccountWelcome(user) {
  if (!user?._id) return null;
  const existing = await Notification.findOne({
    recipientUserId: user._id,
    type: 'account.welcome',
    entityType: 'user',
    entityId: user._id,
    expiresAt: { $gt: new Date() },
  }).select('_id').lean();
  if (existing) return existing;

  // Admin seeded from a fresh database must be reminded to complete the profile
  // and replace the initial credential; other roles receive the regular welcome.
  const isAdmin = user.role === 'admin';
  return Notification.create({
    recipientUserId: user._id,
    type: 'account.welcome',
    title: isAdmin ? 'Selamat datang di REMS' : 'Selamat datang di REMS',
    message: isAdmin
      ? 'Selamat datang di REMS. Lengkapi data profil Admin yang masih kosong. Segera ganti password awal setelah login, simpan password dengan aman, dan jangan membagikannya kepada siapa pun.'
      : 'Akun REMS Anda telah aktif. Pastikan alamat email terdaftar tetap dapat Anda akses, simpan password dengan aman, dan jangan membagikannya kepada siapa pun.',
    tone: 'success',
    entityType: 'user',
    entityId: user._id,
    expiresAt: expiry(),
  });
}

/**
 * Mengirim notifikasi hanya kepada pengguna aktif dengan peran yang dituju dan menghindari duplikasi notifikasi yang belum dibaca untuk entitas sama.
 */
export async function notifyUsersByRoles({ roles, type, title, message, tone = 'info', entityType = null, entityId = null }) {
  const users = await User.find({ role: { $in: roles }, active: true }).select('_id role').lean();
  if (!users.length) return [];
  const docs = [];
  for (const user of users) {
    const existing = await Notification.findOne({
      recipientUserId: user._id,
      type,
      entityType,
      entityId,
      readAt: null,
      expiresAt: { $gt: new Date() },
    }).select('_id').lean();
    if (existing) continue;
    docs.push({ recipientUserId: user._id, type, title, message, tone, entityType, entityId, expiresAt: expiry() });
  }
  return docs.length ? Notification.insertMany(docs) : [];
}

/**
 * Menyelaraskan notifikasi stok rendah: memperbarui notifikasi yang masih aktif, membuatnya bila belum ada, atau menghapusnya ketika kondisi peringatan sudah tidak berlaku.
 */
async function syncStockNotification({ users, type, title, message, tone, entityId, active }) {
  const recipientIds = users.map((user) => user._id);
  const baseQuery = { recipientUserId: { $in: recipientIds }, type, entityType: 'medication', entityId };

  if (!active) {
    await Notification.deleteMany(baseQuery);
    return;
  }

  for (const user of users) {
    const existing = await Notification.findOne({ ...baseQuery, recipientUserId: user._id, expiresAt: { $gt: new Date() } });
    if (existing) {
      existing.title = title;
      existing.message = message;
      existing.tone = tone;
      existing.expiresAt = expiry();
      await existing.save();
    } else {
      await Notification.create({ recipientUserId: user._id, type, title, message, tone, entityType: 'medication', entityId, expiresAt: expiry() });
    }
  }
}

/**
 * Membuat paling banyak satu notifikasi per penerima, batch, dan tahap urgensi agar proses refresh tidak menghasilkan notifikasi kedaluwarsa berulang.
 */
async function ensureExpiryStageNotification({ users, type, title, message, tone, batchId }) {
  for (const user of users) {
    const exists = await Notification.exists({
      recipientUserId: user._id,
      type,
      entityType: 'stockBatch',
      entityId: batchId,
    });
    if (exists) continue;
    await Notification.create({
      recipientUserId: user._id,
      type,
      title,
      message,
      tone,
      entityType: 'stockBatch',
      entityId: batchId,
      expiresAt: expiry(),
    });
  }
}

/**
 * Memformat kedaluwarsa tanggal untuk tampilan pengguna atau keluaran laporan tanpa mengubah nilai sumber.
 */
const formatExpiryDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Asia/Makassar',
  }).format(date);
};

/**
 * Mengirim notifikasi resep baru kepada pengguna aktif dengan peran Apoteker agar resep masuk dapat diperiksa dan diproses.
 */
export async function notifyPrescriptionCreated(prescription) {
  return notifyUsersByRoles({
    roles: ['pharmacy'],
    type: 'prescription.created',
    title: 'Resep baru masuk',
    message: `Resep ${prescription.legacyId} baru masuk dari Dokter FKTP. Periksa data pasien dan obat di halaman Resep Masuk.`,
    tone: 'info',
    entityType: 'prescription',
    entityId: prescription._id,
  });
}

/**
 * Memberi tahu Apoteker dan Dokter lain bahwa resep berubah, tanpa mengirim notifikasi perubahan kepada Dokter yang melakukan perubahan.
 */
export async function notifyPrescriptionUpdated(prescription, actorUserId) {
  const users = await User.find({ role: { $in: ['pharmacy', 'doctor'] }, active: true }).select('_id role').lean();
  const recipients = users.filter((user) => !(user.role === 'doctor' && String(user._id) === String(actorUserId)));
  if (!recipients.length) return [];
  return Notification.insertMany(recipients.map((user) => ({
    recipientUserId: user._id,
    type: 'prescription.updated',
    title: 'Resep diperbarui',
    message: `Resep ${prescription.legacyId} diubah oleh Dokter FKTP. Periksa perubahan sebelum menyiapkan obat.`,
    tone: 'success',
    entityType: 'prescription',
    entityId: prescription._id,
    expiresAt: expiry(),
  })));
}

/**
 * Memberi tahu Dokter lain bahwa resep dihapus agar resep tersebut tidak dilanjutkan untuk diproses.
 */
export async function notifyPrescriptionDeleted(prescription, actorUserId) {
  const users = await User.find({ role: 'doctor', active: true }).select('_id').lean();
  const recipients = users.filter((user) => String(user._id) !== String(actorUserId));
  if (!recipients.length) return [];
  return Notification.insertMany(recipients.map((user) => ({
    recipientUserId: user._id,
    type: 'prescription.deleted',
    title: 'Resep dihapus',
    message: `Resep ${prescription.legacyId} dihapus oleh Dokter FKTP. Jangan proses resep ini.`,
    tone: 'warning',
    entityType: 'prescription',
    entityId: prescription._id,
    expiresAt: expiry(),
  })));
}

/**
 * Memperbarui peringatan stok rendah berdasarkan stok batch yang masih layak pakai dan membuat tahapan peringatan kedaluwarsa H-30, H-7, H-1, serta sudah kedaluwarsa. Tahap sebelumnya tetap menjadi riwayat.
 */
export async function refreshStockNotifications() {
  const [medications, users, adminIds] = await Promise.all([
    Medication.find({ active: true }).lean(),
    User.find({ role: 'pharmacy', active: true }).select('_id role').lean(),
    User.distinct('_id', { role: 'admin' }),
  ]);

  // Remove stock alerts that may have been delivered to Admin by older versions.
  if (adminIds.length) {
    await Notification.deleteMany({
      recipientUserId: { $in: adminIds },
      type: /^stock\./,
    });
  }
  if (!users.length) return;

  const batches = await StockBatch.find({
    medicationId: { $in: medications.map((medication) => medication._id) },
    quantity: { $gt: 0 },
  }).lean();

  const byMedication = new Map();
  for (const batch of batches) {
    const key = String(batch.medicationId);
    if (!byMedication.has(key)) byMedication.set(key, []);
    byMedication.get(key).push(batch);
  }

  const businessDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const now = Date.now();
  for (const medication of medications) {
    const current = byMedication.get(String(medication._id)) || [];
    const usable = current.filter((batch) => !batch.expiryDate || new Date(batch.expiryDate).toISOString().slice(0, 10) >= businessDate);
    const total = usable.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0);
    const minimum = Number.isFinite(Number(medication.minStock)) ? Number(medication.minStock) : STOCK_ALERT_THRESHOLD;
    const alertLimit = minimum * 1.25;

    await syncStockNotification({
      users,
      type: 'stock.low',
      title: total <= 0 ? 'Stok habis' : 'Stok hampir habis',
      message: `${medication.name} tersisa ${total} ${medication.unit} yang masih layak pakai. Batas minimum ${minimum} ${medication.unit}. Periksa batch atau rencanakan penambahan stok.`,
      tone: 'warning',
      entityId: medication._id,
      active: total <= alertLimit,
    });

    for (const batch of current) {
      if (!batch.expiryDate) continue;
      const expiryTime = new Date(batch.expiryDate).getTime();
      if (!Number.isFinite(expiryTime)) continue;
      const days = Math.ceil((expiryTime - now) / 86400000);
      const expiryDateText = formatExpiryDate(batch.expiryDate);
      const batchLabel = batch.batchNumber ? `batch ${batch.batchNumber}` : 'batch tanpa nomor';
      const baseMessage = `${medication.name}, ${batchLabel}, kedaluwarsa ${expiryDateText}.`;

      // Emit one alert for the current urgency window. This avoids showing H-30,
      // H-7, and H-1 all at once when the service starts late. Earlier notifications
      // remain in the user's history after a batch advances to the next window.
      if (days <= EXPIRY_ALERT_DAYS && days > 7) {
        await ensureExpiryStageNotification({
          users,
          type: 'stock.expiry.30',
          title: `Peringatan kedaluwarsa (${EXPIRY_ALERT_DAYS} hari)`,
          message: `${baseMessage} Sisa waktu sekitar ${Math.max(days, 0)} hari. Peringatan: Apoteker perlu merencanakan tindak lanjut.`,
          tone: 'warning',
          batchId: batch._id,
        });
      }
      if (days <= 7 && days > 1) {
        await ensureExpiryStageNotification({
          users,
          type: 'stock.expiry.7',
          title: 'Peringatan kritis kedaluwarsa (7 hari)',
          message: `${baseMessage} Sisa waktu sekitar ${Math.max(days, 0)} hari. Peringatan kritis: Apoteker harus segera menindaklanjuti obat ini.`,
          tone: 'danger',
          batchId: batch._id,
        });
      }
      if (days <= 1 && days >= 0) {
        await ensureExpiryStageNotification({
          users,
          type: 'stock.expiry.1',
          title: 'Tindakan segera: kedaluwarsa dalam 1 hari',
          message: `${baseMessage} Sisa waktu sekitar satu hari atau kurang. Apoteker harus segera memisahkan stok dan menindaklanjutinya sesuai prosedur.`,
          tone: 'danger',
          batchId: batch._id,
        });
      }
      if (days < 0) {
        await ensureExpiryStageNotification({
          users,
          type: 'stock.expiry.expired',
          title: 'Obat sudah kedaluwarsa',
          message: `${baseMessage} Jangan gunakan atau serahkan obat ini; pisahkan dari stok layak pakai dan tindak lanjuti sesuai prosedur.`,
          tone: 'danger',
          batchId: batch._id,
        });
      }
    }
  }
}

/**
 * Memuat notifikasi yang belum melewati masa retensi dan menjaga status baca. Pada pemuatan pertama akun baru—termasuk Admin hasil seed—fungsi ini membuat reminder sambutan satu kali dalam masa retensi.
 */
export async function listNotifications(userId, role = '') {
  // Buat reminder saat pertama kali akun baru dimuat: termasuk Admin yang
  // dibuat oleh npm run seed, serta akun Dokter/Apoteker yang sudah diaktifkan.
  // Batas masa retensi mencegah notifikasi sambutan muncul untuk akun lama.
  if (role === 'admin' || role === 'doctor' || role === 'pharmacy') {
    const user = await User.findOne({ _id: userId, role, active: true })
      .select('_id role createdAt')
      .lean();
    const createdAt = new Date(user?.createdAt || 0).getTime();
    const withinRetentionWindow = Number.isFinite(createdAt)
      && createdAt >= Date.now() - NOTIFICATION_RETENTION_DAYS * 86400000;
    if (user && withinRetentionWindow) {
      await notifyAccountWelcome(user).catch((error) => {
        console.error('Account welcome notification could not be saved:', error?.code || 'NOTIFICATION_SAVE_FAILED');
      });
    }
  }

  const filter = { recipientUserId: userId, expiresAt: { $gt: new Date() } };
  if (role === 'admin') filter.type = { $not: /^stock\./ };
  const items = await Notification.find(filter)
    .sort({ createdAt: -1 }).lean();
  return items.map((item) => ({
    id: String(item._id),
    title: item.title,
    message: item.message,
    tone: item.tone,
    createdAt: item.createdAt,
    unread: !item.readAt,
  }));
}
