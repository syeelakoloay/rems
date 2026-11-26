/**
 * Menyamakan penanganan error aplikasi dan format respons error API.
 */
const INTERNAL_ERROR_MESSAGE = 'Terjadi kesalahan pada server.';

/**
 * Memetakan jenis error validasi, ID, duplikasi, unggahan, dan payload ke kode status HTTP yang sesuai.
 */
function resolveStatus(error) {
  if (error?.name === 'ZodError' || error?.name === 'ValidationError') return 422;
  if (error?.name === 'CastError') return 400;
  if (error?.code === 11000) return 409;
  if (error?.name === 'MulterError' && error?.code === 'LIMIT_FILE_SIZE') return 422;
  if (error?.name === 'MulterError') return 400;
  if (error?.type === 'entity.parse.failed') return 400;
  if (error?.type === 'entity.too.large') return 413;

  const status = Number(error?.statusCode);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

/**
 * Menghasilkan respons 404 yang konsisten untuk endpoint yang tidak terdaftar.
 */
export function notFoundMiddleware(req, res) {
  res.status(404).json({ success: false, error: { code: 'ROUTE_NOT_FOUND', message: 'Fitur yang diminta belum tersedia. Muat ulang aplikasi; jika masalah berlanjut, hubungi Admin.' } });
}

/**
 * Mengubah error aplikasi dan error framework menjadi respons API yang konsisten. Detail internal server/database tidak diekspos ke browser.
 */
export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error);

  const status = resolveStatus(error);
  const isKnownApplicationError = error?.name === 'AppError';
  const isKnownClientError = ['ZodError', 'ValidationError', 'CastError', 'MulterError'].includes(error?.name)
    || error?.type === 'entity.parse.failed'
    || error?.type === 'entity.too.large'
    || error?.code === 11000;
  const exposeMessage = isKnownApplicationError || isKnownClientError;
  const errorCode = status >= 500 && !isKnownApplicationError ? 'INTERNAL_ERROR'
    : error?.name === 'ZodError' ? 'VALIDATION_ERROR'
      : error?.name === 'MulterError' && error?.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE'
        : error?.name === 'MulterError' ? 'INVALID_MULTIPART_REQUEST'
          : error?.name === 'CastError' ? 'INVALID_ID'
            : error?.name === 'ValidationError' ? 'VALIDATION_ERROR'
              : error?.type === 'entity.parse.failed' ? 'INVALID_JSON'
                : error?.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE'
                  : error?.code === 11000 ? 'DUPLICATE_RESOURCE'
                    : error?.code || 'INTERNAL_ERROR';

  const response = {
    success: false,
    error: {
      code: errorCode,
      message: error?.type === 'entity.parse.failed' ? 'Format JSON tidak valid.'
        : error?.type === 'entity.too.large' ? 'Ukuran request terlalu besar.'
          : exposeMessage ? (error?.message || INTERNAL_ERROR_MESSAGE) : INTERNAL_ERROR_MESSAGE,
    },
  };

  if (error?.name === 'MulterError' && error?.code === 'LIMIT_FILE_SIZE') {
    response.error.message = 'Ukuran file maksimal 5 MB. Silakan unggah file yang lebih kecil.';
  } else if (error?.name === 'MulterError') {
    response.error.message = 'Format atau jumlah file yang dikirim tidak sesuai.';
  }
  if (error?.name === 'ZodError') {
    response.error.message = 'Data yang dikirim tidak valid.';
    response.error.details = error.issues;
  }
  if (error?.name === 'AppError' && error.details !== undefined) {
    response.error.details = error.details;
  }
  if (error?.code === 11000) {
    const duplicateFields = Object.keys(error?.keyPattern || error?.keyValue || {});
    if (duplicateFields.includes('emailNormalized')) {
      response.error.message = 'Email sudah digunakan oleh akun lain.';
      response.error.code = 'EMAIL_EXISTS';
    } else if (duplicateFields.includes('nik')) {
      response.error.message = 'NIK sudah digunakan oleh akun lain.';
      response.error.code = 'NIK_EXISTS';
    } else {
      response.error.message = 'Data unik sudah digunakan oleh akun lain.';
    }
  }
  if (error?.name === 'CastError') {
    response.error.message = 'Identifier data tidak valid.';
  }
  if (error?.name === 'ValidationError') {
    response.error.message = 'Data yang dikirim tidak valid.';
    response.error.details = Object.values(error.errors || {}).map((item) => item.message);
  }

  if (status >= 500) {
    // Keep diagnostics on the server without exposing stack traces or raw
    // database/SMTP messages to a browser client.
    console.error('[API_ERROR]', {
      method: req.method,
      path: req.path,
      name: error?.name || 'Error',
      code: error?.code || 'INTERNAL_ERROR',
      status,
    });
  }

  return res.status(status).json(response);
}
