/**
 * Membaca serta memvalidasi konfigurasi lingkungan yang dipakai backend, termasuk daftar origin frontend yang diizinkan.
 */
import dotenv from 'dotenv';

dotenv.config();

const required = ['MONGODB_URI', 'JWT_SECRET', 'CLIENT_URL'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

/**
 * Membaca dan mengurai origins ke bentuk yang dapat diproses oleh modul.
 */
function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => origin.replace(/\/$/, ''));
}

const nodeEnv = process.env.NODE_ENV || 'development';
const configuredOrigins = [
  ...parseOrigins(process.env.CLIENT_URL),
  ...parseOrigins(process.env.CLIENT_URLS),
];

/*
 * Vite uses port 5173 by default, but automatically moves to 5174 when
 * 5173 is already occupied. In development both local origins are safe
 * and intentional for this project. Production remains restricted to
 * the origins explicitly configured through CLIENT_URL / CLIENT_URLS.
 */
const allowedOrigins = [
  ...new Set([
    ...configuredOrigins,
    ...(nodeEnv !== 'production'
      ? ['http://localhost:5173', 'http://localhost:5174']
      : []),
  ]),
];

export const env = Object.freeze({
  nodeEnv,
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI,
  clientUrl: configuredOrigins[0],
  allowedOrigins,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'rems_session',
  gridfsBucket: process.env.GRIDFS_BUCKET || 'resepFiles',
  maxFileSizeBytes:
    Number(process.env.MAX_FILE_SIZE_MB || 5) * 1024 * 1024,
  secureCookies: nodeEnv === 'production',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || process.env.SMTP_USER || '',
  passwordResetRequestLimit: Number(process.env.PASSWORD_RESET_REQUEST_LIMIT || 5),
});
