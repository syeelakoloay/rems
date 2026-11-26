/**
 * Menyusun aplikasi Express, middleware keamanan, penanganan permintaan, dan pemasangan seluruh kelompok route API.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import bootstrapRoutes from './routes/bootstrap.routes.js';
import userRoutes from './routes/user.routes.js';
import registrationRoutes from './routes/registration.routes.js';
import profileRoutes from './routes/profile.routes.js';
import prescriptionRoutes from './routes/prescription.routes.js';
import stockRoutes from './routes/stock.routes.js';
import patientRoutes from './routes/patient.routes.js';
import chronicBookRoutes from './routes/chronicBook.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import optionRoutes from './routes/option.routes.js';
import fileRoutes from './routes/file.routes.js';
import { notFoundMiddleware, errorMiddleware } from './middleware/error.middleware.js';
import { forbidden } from './utils/AppError.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    /**
     * Memeriksa origin permintaan dan menentukan apakah origin tersebut termasuk alamat frontend yang diizinkan oleh konfigurasi CORS.
     */
    origin(origin, callback) {
      // Requests without an Origin header (for example curl/Postman) are allowed.
      if (!origin || env.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(forbidden('Origin tidak diizinkan.', 'CORS_ORIGIN_DENIED'));
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth/forgot-password', rateLimit({ windowMs: 15 * 60 * 1000, limit: env.passwordResetRequestLimit, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));
app.use('/api/auth', authRoutes);
app.use('/api/app', bootstrapRoutes);
app.use('/api/users', userRoutes);
app.use('/api/account-registrations', registrationRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/chronic-books', chronicBookRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/options', optionRoutes);
app.use('/api/files', fileRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
