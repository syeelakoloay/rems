/**
 * Mendefinisikan endpoint HTTP untuk fitur stok, termasuk middleware autentikasi, hak akses, dan validasi yang sesuai.
 */
import { Router } from 'express';
import { addStock, updateStockImage, deleteStock, deleteBatch, withdrawBatch } from '../controllers/stock.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { allowRoles } from '../middleware/role.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { uploadImage } from '../middleware/upload.middleware.js';
import { createStockSchema } from '../validators/stock.validator.js';

const router = Router();

router.use(requireAuth);

// Seluruh endpoint mutasi stok hanya dapat diakses oleh Apoteker.
router.post(
  '/',
  allowRoles('pharmacy'),
  uploadImage.single('image'),
  validateBody(createStockSchema),
  addStock,
);
router.patch('/:id/image', allowRoles('pharmacy'), uploadImage.single('image'), updateStockImage);
router.post('/:id/batches/:batchId/withdraw', allowRoles('pharmacy'), withdrawBatch);
router.delete('/:id/batches/:batchId', allowRoles('pharmacy'), deleteBatch);
router.delete('/:id', allowRoles('pharmacy'), deleteStock);

export default router;
