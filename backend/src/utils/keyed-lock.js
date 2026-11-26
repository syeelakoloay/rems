const tails = new Map();

/** Menjalankan operasi secara berurutan untuk satu kunci tanpa mengunci pasien lain. */
export async function withKeyedLock(key, operation) {
  const normalizedKey = String(key || '');
  const previous = tails.get(normalizedKey) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  tails.set(normalizedKey, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (tails.get(normalizedKey) === tail) tails.delete(normalizedKey);
  }
}
