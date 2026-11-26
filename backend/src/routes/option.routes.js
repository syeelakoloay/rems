/**
 * Mendefinisikan endpoint pengelolaan pilihan aturan pakai/dosis untuk Dokter FKTP.
 */
import { Router } from 'express';
import { create, removeByValue } from '../controllers/option.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { allowRoles } from '../middleware/role.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { optionSchema } from '../validators/option.validator.js';

const router = Router();

router.use(requireAuth, allowRoles('doctor'));
router.post('/dose', validateBody(optionSchema), create);
router.delete('/dose', removeByValue);

export default router;
