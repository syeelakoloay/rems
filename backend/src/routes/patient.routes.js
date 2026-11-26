/**
 * Mendefinisikan endpoint HTTP untuk fitur pasien, termasuk middleware autentikasi, hak akses, dan validasi yang sesuai.
 */
import { Router } from 'express';
import { checkPatientRegistration, confirmPatientFktpTransfer, getPrescriptionPrefill, listPatients } from '../controllers/patient.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { allowRoles } from '../middleware/role.middleware.js';
const router = Router();
router.get('/identity-status', requireAuth, allowRoles('doctor'), checkPatientRegistration);
router.get('/', requireAuth, allowRoles('doctor', 'pharmacy'), listPatients);
router.get('/prescription-prefill', requireAuth, allowRoles('doctor'), getPrescriptionPrefill);
router.post('/prescription-prefill/confirm', requireAuth, allowRoles('doctor'), confirmPatientFktpTransfer);
export default router;
