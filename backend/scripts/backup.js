/** Membuat backup database MongoDB lokal dalam format archive gzip dan membersihkan backup lama. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();
const MONGODUMP_PATH = String(process.env.MONGODUMP_PATH || '').trim();
const CONFIGURED_BACKUP_DIR = String(process.env.BACKUP_DIR || '').trim();
const BACKUP_DIR = CONFIGURED_BACKUP_DIR
  ? path.resolve(CONFIGURED_BACKUP_DIR)
  : (process.platform === 'win32'
    ? path.join(process.env.SystemDrive || 'C:', 'REMS-Backup')
    : path.resolve(process.cwd(), '..', 'REMS-Backup'));
const RETENTION_DAYS = 30;
const BACKUP_PREFIX = 'rems-backup-';

function createTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runMongoDump(archivePath) {
  return new Promise((resolve, reject) => {
    const args = [
      `--uri=${MONGODB_URI}`,
      `--archive=${archivePath}`,
      '--gzip',
    ];
    const child = spawn(MONGODUMP_PATH, args, {
      stdio: 'inherit',
      windowsHide: true,
    });

    child.once('error', (error) => reject(error));
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`mongodump berhenti dengan kode ${code ?? 'tidak diketahui'}.`));
    });
  });
}

async function removeExpiredBackups() {
  const expirationTime = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const entries = await fs.promises.readdir(BACKUP_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(BACKUP_PREFIX) || !entry.name.endsWith('.archive.gz')) {
      continue;
    }

    const filePath = path.join(BACKUP_DIR, entry.name);
    const stats = await fs.promises.stat(filePath);
    if (stats.mtimeMs < expirationTime) {
      await fs.promises.unlink(filePath);
      console.log(`Backup lama dihapus: ${filePath}`);
    }
  }
}

async function backupDatabase() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI belum diatur pada backend/.env.');
  }
  if (!MONGODUMP_PATH) {
    throw new Error('MONGODUMP_PATH belum diatur pada backend/.env.');
  }
  if (!fs.existsSync(MONGODUMP_PATH) || !fs.statSync(MONGODUMP_PATH).isFile()) {
    throw new Error(`mongodump.exe tidak ditemukan pada lokasi: ${MONGODUMP_PATH}`);
  }

  await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
  const archiveName = `${BACKUP_PREFIX}${createTimestamp()}.archive.gz`;
  const archivePath = path.join(BACKUP_DIR, archiveName);

  try {
    await runMongoDump(archivePath);
    const stats = await fs.promises.stat(archivePath);
    if (!stats.isFile() || stats.size <= 0) {
      throw new Error('File backup tidak terbentuk atau ukurannya 0 byte.');
    }

    console.log(`Backup berhasil: ${archivePath}`);
    console.log(`Ukuran: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Folder backup: ${BACKUP_DIR}`);

    try {
      await removeExpiredBackups();
    } catch (cleanupError) {
      console.warn(`Peringatan: backup baru berhasil, tetapi backup lama tidak dapat dibersihkan: ${cleanupError.message}`);
    }
  } catch (error) {
    await fs.promises.rm(archivePath, { force: true }).catch(() => {});
    throw error;
  }
}

backupDatabase().catch((error) => {
  console.error(`Backup gagal: ${error.message}`);
  process.exitCode = 1;
});
