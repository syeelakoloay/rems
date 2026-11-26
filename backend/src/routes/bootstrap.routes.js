/**
 * Mendefinisikan endpoint HTTP untuk fitur bootstrap, termasuk middleware autentikasi, hak akses, dan validasi yang sesuai.
 */
import { Router } from 'express';
import { bootstrap } from '../controllers/bootstrap.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
const router = Router();
router.get('/', requireAuth, bootstrap);
export default router;
