/**
 * Mendefinisikan endpoint HTTP untuk fitur resep, termasuk middleware autentikasi, hak akses, dan validasi yang sesuai.
 */
import { Router } from 'express';
import { listPrescriptions, checkVisitNumber, create, update, remove, dispense, notifyPatient } from '../controllers/prescription.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { allowRoles } from '../middleware/role.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { createPrescriptionSchema, updatePrescriptionSchema } from '../validators/prescription.validator.js';
const router = Router();
router.use(requireAuth);
router.get('/check-visit-number', allowRoles('doctor'), checkVisitNumber);
router.get('/', allowRoles('doctor', 'pharmacy'), listPrescriptions);
router.post('/', allowRoles('doctor'), validateBody(createPrescriptionSchema), create);
router.patch('/:id', allowRoles('doctor'), validateBody(updatePrescriptionSchema), update);
router.delete('/:id', allowRoles('doctor'), remove);
router.post('/:id/dispense', allowRoles('pharmacy'), dispense);
router.post('/:id/notify-patient', allowRoles('pharmacy'), notifyPatient);
export default router;
