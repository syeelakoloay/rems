/**
 * Mendefinisikan endpoint HTTP untuk fitur profile, termasuk middleware autentikasi, hak akses, dan validasi yang sesuai.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { changeOwnPassword } from '../controllers/user.controller.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { changePasswordSchema } from '../validators/user.validator.js';
const router = Router();
router.patch('/password', requireAuth, validateBody(changePasswordSchema), changeOwnPassword);
export default router;
