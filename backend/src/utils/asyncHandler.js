/**
 * Menyediakan pembungkus handler asynchronous agar error diteruskan ke middleware error Express.
 */
/**
 * Membungkus handler async Express dan meneruskan penolakan Promise ke middleware error agar error tidak terlepas dari siklus request.
 */
export const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
