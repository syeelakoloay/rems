/**
 * Mendefinisikan endpoint HTTP untuk fitur berkas, termasuk middleware autentikasi, hak akses, dan validasi yang sesuai.
 */
import { Router } from 'express';
import { download } from '../controllers/file.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
const router = Router();
router.get('/:id', requireAuth, download);
export default router;
