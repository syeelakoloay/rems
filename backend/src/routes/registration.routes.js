/**
 * Mendefinisikan endpoint HTTP untuk fitur pendaftaran akun, termasuk middleware autentikasi, hak akses, dan validasi yang sesuai.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { allowRoles } from '../middleware/role.middleware.js';
import { listRegistrations, approveRegistration, rejectRegistration } from '../controllers/registration.controller.js';
const router = Router();
router.use(requireAuth, allowRoles('admin'));
router.get('/', listRegistrations);
router.post('/:id/approve', approveRegistration);
router.post('/:id/reject', rejectRegistration);
export default router;
