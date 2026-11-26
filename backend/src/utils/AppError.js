/**
 * Menyediakan tipe error aplikasi beserta pembuat respons error umum.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Membuat error aplikasi dengan status 404 untuk data atau resource yang tidak ditemukan.
 */
export const notFound = (message = 'Data tidak ditemukan.') => new AppError(message, 404, 'NOT_FOUND');
/**
 * Membuat error aplikasi dengan status 403 saat pengguna tidak memiliki hak melakukan tindakan.
 */
export const forbidden = (message = 'Akses ditolak.', code = 'FORBIDDEN') => new AppError(message, 403, code);
/**
 * Membuat error aplikasi dengan status 401 saat identitas atau sesi tidak dapat diterima.
 */
export const unauthorized = (message = 'Autentikasi diperlukan.') => new AppError(message, 401, 'UNAUTHORIZED');
/**
 * Membuat error aplikasi dengan status 409 saat tindakan berbenturan dengan data atau status yang sudah ada.
 */
export const conflict = (message, code = 'CONFLICT') => new AppError(message, 409, code);
