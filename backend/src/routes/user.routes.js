/**
 * Mendefinisikan endpoint HTTP untuk fitur pengguna, termasuk middleware autentikasi, hak akses, dan validasi yang sesuai.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createUser, updateUser, toggleStatus, deleteUser, requestPasswordReset } from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { allowRoles } from '../middleware/role.middleware.js';
import { uploadPdf } from '../middleware/upload.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { updateUserSchema } from '../validators/user.validator.js';
const router = Router();
router.use(requireAuth, allowRoles('admin'));
router.post('/', uploadPdf.fields([{ name: 'str', maxCount: 1 }, { name: 'sip', maxCount: 1 }]), createUser);
router.patch('/:id', uploadPdf.fields([{ name: 'str', maxCount: 1 }, { name: 'sip', maxCount: 1 }]), validateBody(updateUserSchema), updateUser);
router.patch('/:id/status', toggleStatus);
router.post('/:id/password-reset', rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false }), requestPasswordReset);
router.delete('/:id', deleteUser);
export default router;
