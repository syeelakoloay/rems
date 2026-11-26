/**
 * Menjalankan skema validasi request sebelum controller memproses datanya.
 */
/**
 * Memvalidasi req.body menggunakan skema Zod. Data yang lolos diganti dengan hasil parsing/normalisasi; kesalahan validasi diteruskan ke middleware error.
 */
export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    result.error.name = 'ZodError';
    return next(result.error);
  }
  req.body = result.data;
  next();
};
