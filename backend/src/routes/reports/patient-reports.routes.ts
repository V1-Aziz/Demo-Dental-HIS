import { Router } from 'express';
import { auth } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import { getNewRegistrations, getDemographics } from '../../controllers/reports/patient-reports.controller';

const router = Router();

router.get('/patients/registrations', auth, authorize('Admin'), getNewRegistrations);
router.get('/patients/demographics', auth, authorize('Admin'), getDemographics);

export default router;
