/**
 * Menyiapkan proses server, koneksi database, pemeriksaan indeks akun, dan proses mulai serta penghentian server.
 */
import http from 'http';
import app from './app.js';
import { connectDatabase } from './config/db.js';
import { initGridFS } from './config/gridfs.js';
import { env } from './config/env.js';
import { refreshStockNotifications } from './services/notification.service.js';
import { User } from './models/User.js';
import { Medication } from './models/Medication.js';
import { StockBatch } from './models/StockBatch.js';
import { normalizeMedicationName, normalizeManufacturer, normalizeBatchNumber } from './utils/stock-identifiers.js';

const server = http.createServer(app);

/**
 * Membaca indeks koleksi dan memperlakukan koleksi yang belum dibuat sebagai daftar indeks kosong, tanpa menyembunyikan error database lainnya.
 */
async function listIndexesSafely(collection) {
  try {
    return await collection.indexes();
  } catch (error) {
    if (error?.codeName === 'NamespaceNotFound' || error?.code === 26) return [];
    throw error;
  }
}


/**
 * Memeriksa apakah indeks yang ada merupakan indeks unik satu field untuk NIK.
 */
function itemHasUniqueNik(index) {
  return Object.keys(index.key || {}).length === 1 && index.key?.nik === 1 && index.unique === true;
}

/**
 * Menyelaraskan indeks akun lama dengan aturan sekarang: username tidak harus unik, email aktif memakai indeks unik parsial, email akun soft-delete dilepas dari kunci login, dan NIK tetap unik.
 */
async function prepareAccountIndexes() {
  const collection = User.collection;
  let indexes = [];
  try {
    indexes = await listIndexesSafely(collection);
  } catch (error) {
    if (error?.codeName !== 'NamespaceNotFound' && error?.code !== 26) throw error;
  }

  // Database versi lama memiliki unique index pada nama akun. Hapus batasan itu
  // agar nama sama diperbolehkan, lalu pertahankan indeks non-unik untuk pencarian.
  // Older versions may have unique indexes on username, usernameNormalized, or email.
  // Names may match and deleted accounts must release the login email; NIK remains the identity key.
  for (const legacyIndex of indexes.filter((index) => index.unique && (index.key?.usernameNormalized === 1 || index.key?.username === 1 || index.key?.email === 1))) {
    await collection.dropIndex(legacyIndex.name);
  }
  indexes = await listIndexesSafely(collection);
  // Normalize legacy indexes on emailNormalized. Keep only the current unique
  // single-field partial index; older full/unique/non-unique definitions can
  // otherwise block soft deletion or the current index from being created.
  for (const index of indexes.filter((item) => Object.keys(item.key || {}).length === 1
    && item.key?.emailNormalized === 1
    && !(item.unique && item.partialFilterExpression?.emailNormalized?.$type === 'string'))) {
    await collection.dropIndex(index.name);
  }
  indexes = await listIndexesSafely(collection);
  // A soft-deleted account keeps its email for historical display, but releases the unique login-email key.
  // Use a unique non-email sentinel instead of null so even a legacy full unique index cannot collide on null.
  const deletedAccounts = await collection.find({ isDeleted: true, emailNormalized: { $type: 'string' } }, { projection: { _id: 1 } }).toArray();
  for (const account of deletedAccounts) {
    await collection.updateOne({ _id: account._id }, { $set: { emailNormalized: `__deleted__${account._id}` } });
  }
  indexes = await listIndexesSafely(collection);
  if (!indexes.some((index) => index.key?.usernameNormalized === 1)) {
    await collection.createIndex({ usernameNormalized: 1 }, { name: 'usernameNormalized_1' });
  }
  indexes = await listIndexesSafely(collection);
  const hasExpectedEmailIndex = indexes.some((index) => index.key?.emailNormalized === 1 && index.unique
    && index.partialFilterExpression?.emailNormalized?.$type === 'string');
  if (!hasExpectedEmailIndex) {
    const duplicateEmails = await collection.aggregate([
      { $match: { isDeleted: { $ne: true }, emailNormalized: { $type: 'string', $gt: '' } } },
      { $group: { _id: '$emailNormalized', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).toArray();
    if (duplicateEmails.length === 0) {
      await collection.createIndex({ emailNormalized: 1 }, { name: 'emailNormalized_1', unique: true, partialFilterExpression: { emailNormalized: { $type: 'string' } } });
    } else {
      console.warn('Duplicate active emails exist in legacy accounts; application validation remains enabled until the data is reconciled.');
    }
  }

  // NIK harus unik untuk semua akun, termasuk akun yang dihapus secara lunak,
  // sehingga data historis tidak dapat dipakai untuk membuat identitas ganda.
  // Drop a legacy non-unique single-field index first so MongoDB can replace it
  // with the intended unique partial index (empty NIK values are ignored).
  indexes = await listIndexesSafely(collection);
  for (const index of indexes.filter((item) => Object.keys(item.key || {}).length === 1
    && item.key?.nik === 1 && !item.unique)) {
    await collection.dropIndex(index.name);
  }
  indexes = await listIndexesSafely(collection);
  const hasNikUniqueIndex = indexes.some((index) => itemHasUniqueNik(index));
  if (!hasNikUniqueIndex) {
    const duplicateNiks = await collection.aggregate([
      { $match: { nik: { $type: 'string', $gt: '' } } },
      { $group: { _id: '$nik', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).toArray();
    if (duplicateNiks.length === 0) {
      await collection.createIndex(
        { nik: 1 },
        { name: 'nik_unique_nonempty', unique: true, partialFilterExpression: { nik: { $type: 'string', $gt: '' } } },
      );
    } else {
      // Data lama yang bentrok tidak boleh membuat seluruh backend gagal startup.
      console.warn('NIK duplicate values exist in legacy accounts; application validation remains enabled until the data is reconciled.');
    }
  }
}

/**
 * Menyiapkan indeks pencarian master obat. Nama dan pabrik tidak dibuat unik
 * karena master baru dibuat hanya ketika Apoteker tidak memilih opsi dropdown.
 */
async function prepareMedicationIdentityIndexes() {
  const collection = Medication.collection;
  let indexes = await listIndexesSafely(collection);

  for (const index of indexes.filter((item) => item.unique
    && item.key?.nameNormalized === 1
    && item.key?.distributorNormalized === 1)) {
    await collection.dropIndex(index.name);
  }

  for (const index of indexes.filter((item) => item.unique && Object.keys(item.key || {}).length === 1
    && (item.key?.name === 1 || item.key?.nameNormalized === 1))) {
    await collection.dropIndex(index.name);
  }

  const legacyMedications = await collection.find({}, {
    projection: { _id: 1, name: 1, nameNormalized: 1, distributor: 1, distributorNormalized: 1 },
  }).toArray();
  if (legacyMedications.length) {
    const writes = legacyMedications.map((item) => {
      const nameNormalized = normalizeMedicationName(item.name);
      const distributorNormalized = normalizeManufacturer(item.distributor);
      return {
        updateOne: {
          filter: { _id: item._id },
          update: { $set: { nameNormalized, distributorNormalized } },
        },
      };
    });
    await collection.bulkWrite(writes, { ordered: false });
  }

  indexes = await listIndexesSafely(collection);
  const lookupIndex = indexes.some((item) => !item.unique
    && item.key?.nameNormalized === 1
    && item.key?.distributorNormalized === 1);
  if (!lookupIndex) {
    await collection.createIndex(
      { nameNormalized: 1, distributorNormalized: 1 },
      { name: 'medication_name_manufacturer_lookup' },
    );
  }
}

/**
 * Menormalisasi nomor batch lama dan menyiapkan indeks unik per obat + nomor
 * batch. Konflik historis tidak dihapus otomatis karena tanggal kedaluwarsa
 * lama harus direkonsiliasi oleh petugas yang berwenang.
 */
async function prepareStockBatchIdentityIndexes() {
  const collection = StockBatch.collection;
  let indexes = await listIndexesSafely(collection);

  for (const index of indexes.filter((item) => item.unique
    && item.key?.medicationId === 1
    && item.key?.batchNumber === 1
    && item.key?.expiryDate === 1)) {
    await collection.dropIndex(index.name);
  }

  const legacyBatches = await collection.find({}, {
    projection: { _id: 1, medicationId: 1, batchNumber: 1 },
  }).toArray();
  const groups = new Map();
  for (const batch of legacyBatches) {
    const normalized = normalizeBatchNumber(batch.batchNumber);
    const key = `${String(batch.medicationId)}::${normalized}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(batch._id);
  }

  if (legacyBatches.length) {
    const writes = [];
    for (const batch of legacyBatches) {
      const normalized = normalizeBatchNumber(batch.batchNumber);
      const key = `${String(batch.medicationId)}::${normalized}`;
      const uniqueLegacyIdentity = groups.get(key)?.length === 1;
      writes.push({
        updateOne: {
          filter: { _id: batch._id },
          update: { $set: { batchNumberNormalized: normalized, batchIdentityVersion: uniqueLegacyIdentity ? 1 : 0 } },
        },
      });
    }
    await collection.bulkWrite(writes, { ordered: false });
  }

  indexes = await listIndexesSafely(collection);
  const expected = indexes.some((item) => item.unique
    && item.key?.medicationId === 1
    && item.key?.batchNumberNormalized === 1
    && item.partialFilterExpression?.batchIdentityVersion === 1);
  if (!expected) {
    await collection.createIndex(
      { medicationId: 1, batchNumberNormalized: 1 },
      {
        name: 'medication_batch_identity_unique',
        unique: true,
        partialFilterExpression: { batchIdentityVersion: 1 },
      },
    );
  }

}

/**
 * Menghubungkan database, menyiapkan GridFS dan indeks akun, lalu menjalankan server. Proses juga menjadwalkan pembaruan notifikasi stok dan menutup koneksi saat shutdown.
 */
async function start() {
  await connectDatabase();
  await prepareAccountIndexes();
  await prepareMedicationIdentityIndexes();
  await prepareStockBatchIdentityIndexes();
  initGridFS();
  server.listen(env.port, () => {
    console.log(`REMS backend running on http://localhost:${env.port}`);
  });

  // Refresh stock/expiry reminders on startup and every 6 hours so threshold
  // notifications are not dependent on a user adding or dispensing stock.
  refreshStockNotifications().catch((error) => {
    console.error('Failed to refresh stock notifications:', error);
  });
  const stockNotificationTimer = setInterval(() => {
    refreshStockNotifications().catch((error) => {
      console.error('Failed to refresh stock notifications:', error);
    });
  }, 6 * 60 * 60 * 1000);
  stockNotificationTimer.unref?.();
}

start().catch((error) => {
  console.error('Failed to start REMS backend:', error);
  process.exitCode = 1;
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
