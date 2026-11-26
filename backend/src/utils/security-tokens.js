import crypto from 'node:crypto';

/** Membuat token acak dan hash SHA-256; token mentah hanya dikembalikan untuk dikirim sekali kepada pengguna. */
export function createHashedRandomToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashToken(token) };
}

/** Menghasilkan hash SHA-256 dari token untuk pencocokan dengan nilai yang tersimpan. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}
