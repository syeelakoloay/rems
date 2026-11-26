/**
 * Menyiapkan akun Admin pengembangan dan pilihan sistem awal secara idempoten. Seed menjaga data operasional yang sudah ada dan tidak menghapus data pengguna, resep, stok, atau riwayat.
 */
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { SystemOption } from '../src/models/SystemOption.js';
import { DEFAULT_DOSE_OPTIONS } from '../src/utils/constants.js';


const users = [
  {
    username: 'Admin',
    password: 'Admin123.',
    role: 'admin',
    nik: '',
  },
];

await connectDatabase();

try {
  const seedDate = new Date();
  const legacySeedDate = new Date('2026-08-01T09:00:00.000Z');
  // Seed is intentionally non-destructive. It only creates/updates the
  // known development Admin account and system options. Existing users,
  // medications, stock batches, transactions, prescriptions, patients,
  // chronic books, and notifications are never deleted by a normal seed.

  for (const item of users) {
    const passwordHash = await bcrypt.hash(item.password, 12);
    // Timestamps are disabled for this upsert because the seed explicitly
    // controls both createdAt and updatedAt on first insertion.
    // This prevents Mongoose from generating a conflicting $set updatedAt.
    await User.updateOne(
      { usernameNormalized: item.username.toLowerCase() },
      {
        $setOnInsert: {
          username: item.username,
          usernameNormalized: item.username.toLowerCase(),
          passwordHash,
          role: item.role,
          active: true,
          nik: item.nik,
          createdAt: seedDate,
          updatedAt: seedDate,
        },
      },
      {
        upsert: true,
        timestamps: false,
      },
    );
  }

  // Correct the legacy seeded Admin date once. The exact old timestamp is
  // used as a guard so subsequent seed runs never reset a genuine account date.
  await User.updateOne(
    {
      usernameNormalized: 'admin',
      role: 'admin',
      createdAt: legacySeedDate,
    },
    {
      $set: {
        createdAt: seedDate,
        updatedAt: seedDate,
      },
    },
    { timestamps: false },
  );

  // Diagnosis choices are now sourced exclusively from the bundled ICD-10 catalogue.
  // Archive obsolete custom diagnosis options without physically deleting historical records.
  await SystemOption.updateMany(
    { type: 'diagnosis', isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: seedDate, deletedBy: null } },
  );

  // No medication or stock is created during initial seed.


  for (const value of DEFAULT_DOSE_OPTIONS) {
    await SystemOption.updateOne(
      {
        type: 'dose',
        normalizedValue: value.toLowerCase(),
      },
      {
        $setOnInsert: {
          type: 'dose',
          value,
          normalizedValue: value.toLowerCase(),
        },
      },
      { upsert: true },
    );
  }

  console.log(
    'E-Resep seed completed. Development account: Admin/Admin123.',
  );
} finally {
  await disconnectDatabase();
}
