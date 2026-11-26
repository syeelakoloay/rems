/**
 * Mendefinisikan endpoint HTTP untuk fitur autentikasi, termasuk middleware autentikasi, hak akses, dan validasi yang sesuai.
 */
import { Router } from 'express';
import { z } from 'zod';
import { login, me, logout, requestOwnPasswordReset } from '../controllers/auth.controller.js';
import { submitRegistration } from '../controllers/registration.controller.js';
import { uploadPdf } from '../middleware/upload.middleware.js';
import rateLimit from 'express-rate-limit';
import { activateAccount, resetPassword } from '../controllers/user.controller.js';
import { changePasswordSchema } from '../validators/user.validator.js';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { loginSchema } from '../validators/auth.validator.js';

const router = Router();
router.post('/login', validateBody(loginSchema), login);
router.post('/register', rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false }), uploadPdf.fields([{ name: 'str', maxCount: 1 }, { name: 'sip', maxCount: 1 }]), submitRegistration);
router.post('/forgot-password', validateBody(z.object({ email: z.string().max(254) })), requestOwnPasswordReset);
router.get('/me', optionalAuth, me);
router.post('/logout', requireAuth, logout);
router.post('/reset-password', validateBody(z.object({ token: z.string().min(1), password: changePasswordSchema.shape.password })), resetPassword);
router.post('/activate-account', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }), validateBody(z.object({ token: z.string().length(64).regex(/^[a-f0-9]+$/i), password: changePasswordSchema.shape.password })), activateAccount);
export default router;
