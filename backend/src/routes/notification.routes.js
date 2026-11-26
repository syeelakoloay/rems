/**
 * Mendefinisikan endpoint HTTP untuk fitur notifikasi, termasuk middleware autentikasi, hak akses, dan validasi yang sesuai.
 */
import { Router } from 'express';
import { list, read, readAll } from '../controllers/notification.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
const router = Router();
router.use(requireAuth);
router.get('/', list);
router.patch('/read-all', readAll);
router.patch('/:id/read', read);
export default router;
