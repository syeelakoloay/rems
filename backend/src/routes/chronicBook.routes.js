/**
 * Mendefinisikan endpoint HTTP untuk fitur kronis buku, termasuk middleware autentikasi, hak akses, dan validasi yang sesuai.
 */
import { Router } from 'express';
import { createBook, updateBook, removeBook } from '../controllers/chronicBook.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { allowRoles } from '../middleware/role.middleware.js';
import { uploadPdf } from '../middleware/upload.middleware.js';
const router = Router();
router.use(requireAuth);
router.post('/', allowRoles('pharmacy'), uploadPdf.single('file'), createBook);
router.patch('/:patientId', allowRoles('pharmacy'), uploadPdf.single('file'), updateBook);
router.delete('/:patientId', allowRoles('pharmacy'), removeBook);
export default router;
